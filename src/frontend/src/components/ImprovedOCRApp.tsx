import { useState, useCallback, useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiService } from '@/services/api';
import { ImageWithBoundingBoxes } from '@/components/ImageWithBoundingBoxes';
import { ExtractedFieldsDisplay } from '@/components/ExtractedFieldsDisplay';
import { OCRVisualization } from '@/components/OCRVisualization';
import type { OCRResponse } from '@/types/api';
import { 
  Loader2, 
  FileText, 
  Eye, 
  AlertCircle, 
  CheckCircle2,
  Brain,
  Settings,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Clock,
  Zap,
  Target,
  ChevronRight,
  Plus,
  Trash2,
  Layout
} from 'lucide-react';

export function ImprovedOCRApp() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [ocrResults, setOcrResults] = useState<OCRResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('upload');
  const [structuredResults, setStructuredResults] = useState<any>(null);
  const [schema, setSchema] = useState<Array<{id: string, name: string, description: string, type: string}>>([]);
  const [isExtractingData, setIsExtractingData] = useState(false);
  const [azureConfigStatus, setAzureConfigStatus] = useState<'checking' | 'configured' | 'not-configured'>('checking');
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [hoveredTextBlock, setHoveredTextBlock] = useState<number | null>(null);

  // Computed states
  const hasOCRResults = ocrResults !== null;
  const hasStructuredResults = structuredResults !== null;

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setError('');
    setOcrResults(null);
    setStructuredResults(null);
    setActiveTab('upload');

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setImageBase64(result);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleOCRProcess = useCallback(async () => {
    if (!selectedFile || !imageBase64) {
      setError('Please select a file first');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const base64Data = imageBase64.split(',')[1];
      const response = await ApiService.processOCR(base64Data);
      
      setOcrResults(response);
      setActiveTab('ocr-results');
    } catch (error) {
      console.error('OCR Error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process document. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, imageBase64]);

  const getQualityGrade = (score: number) => {
    if (score >= 0.8) return { grade: 'Excellent', color: 'text-green-600' };
    if (score >= 0.6) return { grade: 'Good', color: 'text-yellow-600' };
    return { grade: 'Poor', color: 'text-red-600' };
  };

  const addSchemaField = () => {
    const newField = {
      id: `field-${Date.now()}`,
      name: '',
      description: '',
      type: 'text'
    };
    setSchema([...schema, newField]);
  };

  const removeSchemaField = (id: string) => {
    setSchema(schema.filter(field => field.id !== id));
  };

  const updateSchemaField = (id: string, updates: Partial<{name: string, description: string, type: string}>) => {
    setSchema(schema.map(field => 
      field.id === id ? { ...field, ...updates } : field
    ));
  };

  const processStructuredExtraction = async () => {
    if (!ocrResults || schema.length === 0) return;
    
    setIsExtractingData(true);
    setError('');
    
    try {
      const jsonSchema = {
        type: "object",
        properties: schema.reduce((acc, field) => {
          acc[field.name] = {
            type: field.type === 'number' ? 'number' : 
                  field.type === 'boolean' ? 'boolean' : 'string',
            description: field.description || `Extract ${field.name} from the document`
          };
          return acc;
        }, {} as Record<string, any>),
        required: schema.filter(field => field.name).map(field => field.name)
      };
      
      const userPrompt = `Please extract the following information from the document: ${schema.map(field => `${field.name} (${field.type}): ${field.description || 'No description provided'}`).join(', ')}`;
      const base64Data = imageBase64.split(',')[1];
      
      const response = await ApiService.extractStructuredData(base64Data, jsonSchema, userPrompt);
      
      setStructuredResults(response);
      setActiveTab('results');
    } catch (error) {
      console.error('Structured extraction error:', error);
      
      let errorMessage = 'Failed to extract structured data. Please try again.';
      let errorString = '';
      
      if (error instanceof Error) {
        errorString = error.message;
      } else if (typeof error === 'object' && error !== null) {
        if ('error_message' in error) {
          errorString = String(error.error_message);
        } else if ('message' in error) {
          errorString = String(error.message);
        } else {
          errorString = JSON.stringify(error);
        }
      } else {
        errorString = String(error);
      }

      if (errorString.includes('Azure OpenAI service not configured')) {
        errorMessage = 'Azure OpenAI service is not configured. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables in your backend configuration.';
        setAzureConfigStatus('not-configured');
      } else if (errorString.includes('404') || errorString.includes('Resource not found') || errorString.includes('Error code: 404')) {
        errorMessage = '🔧 Azure OpenAI Configuration Issue: The deployment was not found. Please check your configuration.';
        setAzureConfigStatus('not-configured');
      } else {
        errorMessage = errorString;
      }
      
      setError(errorMessage);
    } finally {
      setIsExtractingData(false);
    }
  };

  const checkAzureConfig = async () => {
    setAzureConfigStatus('checking');
    try {
      const healthCheck = await ApiService.checkHealth();
      if (healthCheck.azure_openai === 'configured') {
        setAzureConfigStatus('configured');
      } else {
        setAzureConfigStatus('not-configured');
      }
    } catch (error) {
      console.log('Health check failed:', error);
      setAzureConfigStatus('not-configured');
    }
  };

  useEffect(() => {
    checkAzureConfig();
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        {/* Header */}
        <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl blur opacity-75"></div>
                    <div className="relative p-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                      AI Document Extraction
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      Powered by Google Document AI & Azure OpenAI GPT-4o
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <Badge 
                  variant={azureConfigStatus === 'configured' ? 'default' : 'destructive'}
                  className="text-xs"
                >
                  Azure OpenAI: {azureConfigStatus}
                </Badge>
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-6 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex justify-center">
              <TabsList className="grid w-full max-w-3xl grid-cols-4 h-12 bg-muted/50 p-1">
                <TabsTrigger 
                  value="upload" 
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </TabsTrigger>
                <TabsTrigger 
                  value="ocr-results" 
                  disabled={!hasOCRResults}
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  OCR Results
                </TabsTrigger>
                <TabsTrigger 
                  value="extraction" 
                  disabled={!hasOCRResults}
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Define Schema
                </TabsTrigger>
                <TabsTrigger 
                  value="results" 
                  disabled={!hasStructuredResults}
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  View Results
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-6">
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Upload Section */}
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-center space-x-2 text-lg">
                        <Upload className="h-5 w-5 text-blue-600" />
                        <span>Document Upload</span>
                      </CardTitle>
                      <CardDescription className="text-center">
                        Upload your document to start AI-powered extraction
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FileUpload onFileSelect={handleFileSelect} />
                      
                      {selectedFile && (
                        <div className="space-y-4">
                          <div className="p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center space-x-3">
                              <FileText className="h-5 w-5 text-blue-600" />
                              <div>
                                <p className="font-medium">{selectedFile.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type}
                                </p>
                              </div>
                            </div>
                          </div>
                          
                          <Button 
                            onClick={handleOCRProcess} 
                            disabled={isProcessing}
                            className="w-full h-12"
                            size="lg"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                Processing Document...
                              </>
                            ) : (
                              <>
                                <Zap className="h-5 w-5 mr-2" />
                                Extract Text with AI
                              </>
                            )}
                          </Button>
                        </div>
                      )}

                      {error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="whitespace-pre-line">
                            {error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>

                  {/* Image Preview */}
                  {imageBase64 && (
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-center space-x-2 text-lg">
                          <ImageIcon className="h-5 w-5 text-green-600" />
                          <span>Document Preview</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="aspect-[4/3] bg-muted/50 rounded-lg overflow-hidden">
                          <img 
                            src={imageBase64} 
                            alt="Document preview" 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* OCR Results Tab */}
            <TabsContent value="ocr-results" className="space-y-6">
              <div className="max-w-7xl mx-auto">
                {hasOCRResults && (
                  <>
                    {/* OCR Summary Stats */}
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-center space-x-2 text-lg">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <span>OCR Processing Complete</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div className="flex items-center justify-center space-x-3">
                            <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                              <Clock className="h-5 w-5 text-green-600" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">Processing Time</p>
                              <p className="font-semibold">{ocrResults.processing_time?.toFixed(1)}s</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-center space-x-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                              <FileText className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="text-center">
                              <p className="text-sm text-muted-foreground">Text Blocks</p>
                              <p className="font-semibold">{ocrResults.text_blocks?.length || 0}</p>
                            </div>
                          </div>

                          {ocrResults.image_quality && (
                            <>
                              <div className="flex items-center justify-center space-x-3">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                                  <Eye className="h-5 w-5 text-purple-600" />
                                </div>
                                <div className="text-center">
                                  <p className="text-sm text-muted-foreground">Image Quality</p>
                                  <p className={`font-semibold ${getQualityGrade(ocrResults.image_quality.quality_score).color}`}>
                                    {getQualityGrade(ocrResults.image_quality.quality_score).grade}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-center space-x-3">
                                <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                                  <Target className="h-5 w-5 text-orange-600" />
                                </div>
                                <div className="text-center">
                                  <p className="text-sm text-muted-foreground">Confidence</p>
                                  <p className="font-semibold">{(ocrResults.image_quality.quality_score * 100).toFixed(0)}%</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-6 flex justify-center">
                          <Button 
                            onClick={() => setActiveTab('extraction')}
                            className="px-8 h-12"
                            size="lg"
                          >
                            <ChevronRight className="h-5 w-5 mr-2" />
                            Continue to Schema Definition
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    {/* OCR Visualization */}
                    <OCRVisualization
                      imageSrc={imageBase64}
                      textBlocks={ocrResults.text_blocks || []}
                      imageWidth={ocrResults.image_dimensions?.width}
                      imageHeight={ocrResults.image_dimensions?.height}
                      onTextBlockHover={setHoveredTextBlock}
                      hoveredBlock={hoveredTextBlock}
                    />
                  </>
                )}
              </div>
            </TabsContent>

            {/* Schema Definition Tab */}
            <TabsContent value="extraction" className="space-y-6">
              <div className="max-w-4xl mx-auto">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-center space-x-2 text-lg">
                      <Settings className="h-5 w-5 text-purple-600" />
                      <span>Define Data Schema</span>
                    </CardTitle>
                    <CardDescription className="text-center">
                      Define the fields you want to extract from your document
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-4">
                      {schema.map((field) => (
                        <div key={field.id} className="p-4 bg-muted/50 rounded-lg space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div>
                              <Label htmlFor={`name-${field.id}`}>Field Name</Label>
                              <Input
                                id={`name-${field.id}`}
                                placeholder="e.g., customer_name"
                                value={field.name}
                                onChange={(e) => updateSchemaField(field.id, { name: e.target.value })}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`type-${field.id}`}>Data Type</Label>
                              <Select 
                                value={field.type} 
                                onValueChange={(value) => updateSchemaField(field.id, { type: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="number">Number</SelectItem>
                                  <SelectItem value="boolean">Boolean</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="md:col-span-2 flex space-x-2">
                              <div className="flex-1">
                                <Label htmlFor={`desc-${field.id}`}>Description</Label>
                                <Input
                                  id={`desc-${field.id}`}
                                  placeholder="Describe what to extract..."
                                  value={field.description}
                                  onChange={(e) => updateSchemaField(field.id, { description: e.target.value })}
                                />
                              </div>
                              <div className="flex items-end">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={() => removeSchemaField(field.id)}
                                  className="h-10 w-10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center">
                      <Button variant="outline" onClick={addSchemaField}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Field
                      </Button>

                      <Button 
                        onClick={processStructuredExtraction}
                        disabled={isExtractingData || schema.length === 0 || schema.some(field => !field.name)}
                        className="h-12 px-8"
                        size="lg"
                      >
                        {isExtractingData ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Extracting Data...
                          </>
                        ) : (
                          <>
                            <Brain className="h-5 w-5 mr-2" />
                            Extract Structured Data
                          </>
                        )}
                      </Button>
                    </div>

                    {error && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="whitespace-pre-line">
                          {error}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="space-y-6">
              {hasStructuredResults && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Image with Bounding Boxes */}
                  <Card className="border-0 shadow-lg">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2 text-lg">
                        <Layout className="h-5 w-5 text-blue-600" />
                        <span>Visual Field Mapping</span>
                      </CardTitle>
                      <CardDescription>
                        Hover over fields to see their locations in the document
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="aspect-[4/3] min-h-[500px]">
                        <ImageWithBoundingBoxes
                          imageSrc={imageBase64}
                          groundedFields={structuredResults.grounded_fields || []}
                          imageWidth={ocrResults?.image_dimensions?.width}
                          imageHeight={ocrResults?.image_dimensions?.height}
                          onFieldHover={setHoveredField}
                          hoveredField={hoveredField}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Extracted Fields Display */}
                  <div>
                    <ExtractedFieldsDisplay
                      structuredResults={structuredResults}
                      onFieldHover={setHoveredField}
                      hoveredField={hoveredField}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
