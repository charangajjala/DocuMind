import { useState, useCallback, useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiService } from '@/services/api';
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
  Cpu,
  ChevronRight,
  Info,
  Download,
  Copy,
  Plus,
  Trash2
} from 'lucide-react';

export function EnhancedOCRApp() {
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
      // Convert the full data URL to just base64
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
      // Convert schema to JSON Schema format
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
      
      // Generate user prompt based on schema fields
      const userPrompt = `Please extract the following information from the document: ${schema.map(field => `${field.name} (${field.type}): ${field.description || 'No description provided'}`).join(', ')}`;
      
      // Get base64 data without data URL prefix
      const base64Data = imageBase64.split(',')[1];
      
      // Call the structured extraction API
      const response = await ApiService.extractStructuredData(base64Data, jsonSchema, userPrompt);
      
      setStructuredResults(response);
      setActiveTab('structured-results');
    } catch (error) {
      console.error('Structured extraction error:', error);
      
      let errorMessage = 'Failed to extract structured data. Please try again.';
      let errorString = '';
      
      // Handle different error formats
      if (error instanceof Error) {
        errorString = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle structured error responses
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

      // Check for various error conditions
      if (errorString.includes('Azure OpenAI service not configured')) {
        errorMessage = 'Azure OpenAI service is not configured. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT environment variables in your backend configuration.';
        setAzureConfigStatus('not-configured');
      } else if (errorString.includes('404') || errorString.includes('Resource not found') || errorString.includes('Error code: 404')) {
        errorMessage = '🔧 Azure OpenAI Configuration Issue: The deployment was not found. Please check:\n\n• AZURE_OPENAI_DEPLOYMENT_NAME is correct\n• The deployment exists in your Azure OpenAI resource\n• The deployment is active and not deleted\n• Your endpoint URL is correct';
        setAzureConfigStatus('not-configured');
      } else if (errorString.includes('401') || errorString.includes('Error code: 401')) {
        errorMessage = '🔑 Authentication Error: Please check your AZURE_OPENAI_API_KEY configuration. Make sure the API key is valid and has not expired.';
        setAzureConfigStatus('not-configured');
      } else if (errorString.includes('403') || errorString.includes('Error code: 403')) {
        errorMessage = '🚫 Access Denied: Please check your Azure OpenAI resource permissions and ensure your API key has the correct access rights.';
        setAzureConfigStatus('not-configured');
      } else if (errorString.includes('429') || errorString.includes('Error code: 429')) {
        errorMessage = '⏱️ Rate Limit Exceeded: Too many requests. Please wait a moment and try again.';
      } else if (errorString.includes('503') || errorString.includes('Error code: 503')) {
        errorMessage = '⚠️ Service Unavailable: The Azure OpenAI service is currently unavailable. Please check your configuration and try again later.';
      } else if (errorString.includes('Failed to extract structured data')) {
        errorMessage = '🤖 AI Extraction Failed: There was an issue with the structured data extraction. This could be due to:\n\n• Azure OpenAI service configuration\n• Network connectivity issues\n• Document complexity\n\nPlease check your Azure OpenAI settings and try again.';
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

  // Auto-switch tabs based on state
  useEffect(() => {
    if (selectedFile && !hasOCRResults && !isProcessing) {
      setActiveTab('upload');
    } else if (hasOCRResults && !hasStructuredResults) {
      // Stay on current tab or show ocr-results
    } else if (hasStructuredResults) {
      // Stay on structured-results tab
    }
  }, [selectedFile, hasOCRResults, hasStructuredResults, isProcessing]);

  // Check Azure OpenAI configuration on mount
  useEffect(() => {
    checkAzureConfig();
  }, []);

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
        {/* Header */}
        <div className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto px-4 py-4">
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                      <Info className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>System Information</p>
                  </TooltipContent>
                </Tooltip>
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Sidebar - Upload & Controls */}
            <div className="xl:col-span-3 space-y-6">
              {/* File Upload Card */}
              <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-gray-50/50 dark:from-slate-900 dark:to-slate-800/50">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center space-x-2 text-lg">
                    <Upload className="h-5 w-5 text-blue-600" />
                    <span>Document Upload</span>
                  </CardTitle>
                  <CardDescription>
                    Upload your document to start AI-powered extraction
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FileUpload 
                    onFileSelect={handleFileSelect}
                  />
                  
                  {selectedFile && (
                    <div className="space-y-4">
                      {/* File Info */}
                      <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg border">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                            <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(selectedFile.size / 1024 / 1024).toFixed(1)} MB • {selectedFile.type}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      {/* Process Button */}
                      <Button
                        onClick={handleOCRProcess}
                        disabled={isProcessing}
                        className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg"
                        size="lg"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            <span>Processing Document...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="h-5 w-5 mr-2" />
                            <span>Extract Text with AI</span>
                          </>
                        )}
                      </Button>

                      {/* Processing Progress */}
                      {isProcessing && (
                        <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center space-x-2">
                            <Cpu className="h-4 w-4 text-amber-600 animate-pulse" />
                            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">AI Processing</span>
                          </div>
                          <Progress value={undefined} className="h-2" />
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Analyzing document structure and extracting text blocks...
                          </p>
                        </div>
                      )}

                      {/* Error Display */}
                      {error && (
                        <Alert variant="destructive">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Processing Status Card */}
              {hasOCRResults && (
                <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center space-x-2 text-lg">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <span>Processing Complete</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Quick Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-white/70 dark:bg-slate-800/70 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Time</p>
                            <p className="text-sm font-semibold">{ocrResults.processing_time.toFixed(1)}s</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-3 bg-white/70 dark:bg-slate-800/70 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Target className="h-4 w-4 text-gray-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Blocks</p>
                            <p className="text-sm font-semibold">{ocrResults.text_blocks.length}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Image Quality */}
                    {ocrResults.image_quality && (
                      <div className="p-3 bg-white/70 dark:bg-slate-800/70 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Image Quality</span>
                          <Badge 
                            variant={ocrResults.image_quality.quality_score >= 0.8 ? "default" : 
                                   ocrResults.image_quality.quality_score >= 0.6 ? "secondary" : "destructive"}
                          >
                            {getQualityGrade(ocrResults.image_quality.quality_score).grade}
                          </Badge>
                        </div>
                        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${
                              ocrResults.image_quality.quality_score >= 0.8 ? 'bg-gradient-to-r from-green-500 to-green-400' :
                              ocrResults.image_quality.quality_score >= 0.6 ? 'bg-gradient-to-r from-yellow-500 to-yellow-400' : 
                              'bg-gradient-to-r from-red-500 to-red-400'
                            }`}
                            style={{ width: `${ocrResults.image_quality.quality_score * 100}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(ocrResults.image_quality.quality_score * 100).toFixed(0)}% confidence
                        </p>
                      </div>
                    )}

                    {/* Next Steps */}
                    <div className="pt-2 border-t border-green-200 dark:border-green-800">
                      <p className="text-xs text-muted-foreground mb-2">Ready for structured extraction</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-950/50"
                        onClick={() => setActiveTab('schema-builder')}
                      >
                        <Brain className="h-4 w-4 mr-2" />
                        Build Schema
                        <ChevronRight className="h-4 w-4 ml-2" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Main Content Area */}
            <div className="xl:col-span-9">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="grid w-full grid-cols-4 lg:w-fit lg:grid-cols-4 h-12 bg-muted/50 p-1">
                  <TabsTrigger value="upload" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10">
                    <ImageIcon className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Document</span>
                  </TabsTrigger>
                  <TabsTrigger value="ocr-results" disabled={!hasOCRResults} className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10">
                    <Eye className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">OCR Results</span>
                  </TabsTrigger>
                  <TabsTrigger value="schema-builder" className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10">
                    <Settings className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Schema</span>
                  </TabsTrigger>
                  <TabsTrigger value="structured-results" disabled={!hasStructuredResults} className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10">
                    <Brain className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Extract</span>
                  </TabsTrigger>
                </TabsList>

                {/* Tab Content */}
                <div className="space-y-6">
                  <TabsContent value="upload" className="mt-6">
                    <Card className="border-0 shadow-lg">
                      <CardHeader className="text-center py-12">
                        <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-3xl flex items-center justify-center mb-6">
                          <Upload className="h-12 w-12 text-blue-600" />
                        </div>
                        <CardTitle className="text-2xl">Upload Your Document</CardTitle>
                        <CardDescription className="text-lg max-w-md mx-auto">
                          Select a document image to begin AI-powered text extraction and analysis
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="px-12 pb-12">
                        <div className="max-w-md mx-auto">
                          <FileUpload onFileSelect={handleFileSelect} />
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="ocr-results" className="mt-6">
                    {hasOCRResults && (
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Document Visualization */}
                        <div className="lg:col-span-2">
                          <Card className="border-0 shadow-lg">
                            <CardHeader>
                              <CardTitle className="flex items-center space-x-2">
                                <Eye className="h-5 w-5" />
                                <span>Document Analysis</span>
                              </CardTitle>
                              <CardDescription>
                                Visual representation with detected text blocks
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              {ocrResults && selectedFile ? (
                                <div className="space-y-4">
                                  <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                                    <img
                                      src={imageBase64}
                                      alt="Uploaded document"
                                      className="w-full h-auto max-h-[600px] object-contain"
                                    />
                                    <div className="absolute inset-0 pointer-events-none">
                                      {/* Text blocks overlay will be added here in future */}
                                    </div>
                                  </div>
                                  <div className="text-sm text-muted-foreground text-center">
                                    Document processed successfully • {ocrResults.text_blocks.length} text blocks detected
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  Document visualization will appear here after OCR processing
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>

                        {/* Text Blocks List */}
                        <div className="lg:col-span-1">
                          <Card className="border-0 shadow-lg h-fit max-h-[600px]">
                            <CardHeader>
                              <CardTitle className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <FileText className="h-5 w-5" />
                                  <span>Text Blocks</span>
                                </div>
                                <Badge variant="secondary">
                                  {ocrResults.text_blocks.length}
                                </Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                              <ScrollArea className="h-[500px]">
                                <div className="p-6 space-y-3">
                                  {ocrResults ? (
                                    ocrResults.text_blocks.map((block, index) => (
                                      <div
                                        key={index}
                                        className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                      >
                                        <div className="flex items-start justify-between mb-2">
                                          <Badge variant="outline" className="text-xs">
                                            {block.element_type}
                                          </Badge>
                                          <span className="text-xs text-muted-foreground">
                                            {Math.round(block.confidence * 100)}%
                                          </span>
                                        </div>
                                        <p className="text-sm leading-relaxed">
                                          {block.text}
                                        </p>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-center py-8 text-muted-foreground">
                                      Text blocks list will appear here
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Metadata Card */}
                        <div className="lg:col-span-3">
                          <Card className="border-0 shadow-lg">
                            <CardHeader>
                              <CardTitle className="flex items-center space-x-2">
                                <Info className="h-5 w-5" />
                                <span>Document Metadata</span>
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              {ocrResults ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                  {/* Processing Time */}
                                  <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <Clock className="h-4 w-4 text-blue-600" />
                                      <span className="text-sm font-medium">Processing Time</span>
                                    </div>
                                    <p className="text-lg font-semibold">{ocrResults.processing_time.toFixed(2)}s</p>
                                  </div>

                                  {/* Text Blocks */}
                                  <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <FileText className="h-4 w-4 text-green-600" />
                                      <span className="text-sm font-medium">Text Blocks</span>
                                    </div>
                                    <p className="text-lg font-semibold">{ocrResults.text_blocks.length}</p>
                                  </div>

                                  {/* Image Dimensions */}
                                  <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <Target className="h-4 w-4 text-purple-600" />
                                      <span className="text-sm font-medium">Dimensions</span>
                                    </div>
                                    <p className="text-lg font-semibold">
                                      {ocrResults.image_dimensions.width} × {ocrResults.image_dimensions.height}
                                    </p>
                                  </div>

                                  {/* Image Quality */}
                                  {ocrResults.image_quality && (
                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg">
                                      <div className="flex items-center space-x-2 mb-2">
                                        <Sparkles className="h-4 w-4 text-yellow-600" />
                                        <span className="text-sm font-medium">Quality</span>
                                      </div>
                                      <div className="space-y-1">
                                        <p className="text-lg font-semibold">{ocrResults.image_quality.quality_grade}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {Math.round(ocrResults.image_quality.quality_score * 100)}% confidence
                                        </p>
                                      </div>
                                    </div>
                                  )}

                                  {/* Full Text Preview */}
                                  <div className="md:col-span-2 lg:col-span-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                                    <div className="flex items-center space-x-2 mb-3">
                                      <Eye className="h-4 w-4 text-gray-600" />
                                      <span className="text-sm font-medium">Extracted Text Preview</span>
                                    </div>
                                    <div className="max-h-32 overflow-y-auto">
                                      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                        {ocrResults.full_text.length > 500 
                                          ? ocrResults.full_text.substring(0, 500) + "..." 
                                          : ocrResults.full_text}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                  Document metadata will appear here
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="schema-builder" className="mt-6">
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle className="flex items-center space-x-2">
                          <Settings className="h-5 w-5" />
                          <span>Schema Builder</span>
                        </CardTitle>
                        <CardDescription>
                          Define the structure for data extraction from your document
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-6">
                          {schema.length === 0 ? (
                            <div className="text-center py-8">
                              <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                              <h3 className="text-lg font-semibold mb-2">Create Schema Fields</h3>
                              <p className="text-muted-foreground max-w-md mx-auto mb-6">
                                Define the fields you want to extract from your document. Start by adding your first field below.
                              </p>
                              <Button onClick={addSchemaField} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                                <Plus className="h-4 w-4 mr-2" />
                                Add First Field
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="text-lg font-semibold">Schema Fields</h3>
                                  <p className="text-sm text-muted-foreground">{schema.length} field(s) defined</p>
                                </div>
                                <Button onClick={addSchemaField} variant="outline" size="sm">
                                  <Plus className="h-4 w-4 mr-2" />
                                  Add Field
                                </Button>
                              </div>

                              <div className="space-y-3">
                                {schema.map((field) => (
                                  <Card key={field.id} className="p-4">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                      <div>
                                        <Label htmlFor={`name-${field.id}`}>Field Name</Label>
                                        <Input
                                          id={`name-${field.id}`}
                                          value={field.name}
                                          onChange={(e) => updateSchemaField(field.id, { name: e.target.value })}
                                          placeholder="e.g., total_amount"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div>
                                        <Label htmlFor={`type-${field.id}`}>Type</Label>
                                        <Select value={field.type} onValueChange={(value) => updateSchemaField(field.id, { type: value })}>
                                          <SelectTrigger className="mt-1">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="text">Text</SelectItem>
                                            <SelectItem value="number">Number</SelectItem>
                                            <SelectItem value="date">Date</SelectItem>
                                            <SelectItem value="boolean">Boolean</SelectItem>
                                            <SelectItem value="email">Email</SelectItem>
                                            <SelectItem value="phone">Phone</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div className="md:col-span-1">
                                        <Label htmlFor={`desc-${field.id}`}>Description</Label>
                                        <Input
                                          id={`desc-${field.id}`}
                                          value={field.description}
                                          onChange={(e) => updateSchemaField(field.id, { description: e.target.value })}
                                          placeholder="Field description"
                                          className="mt-1"
                                        />
                                      </div>
                                      <div className="flex items-end">
                                        <Button
                                          onClick={() => removeSchemaField(field.id)}
                                          variant="outline"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>
                                  </Card>
                                ))}
                              </div>

                              {hasOCRResults && schema.length > 0 && (
                                <div className="pt-6 border-t space-y-4">
                                  {(azureConfigStatus === 'not-configured' || azureConfigStatus === 'checking') && (
                                    <Alert variant="destructive">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="space-y-2">
                                        {azureConfigStatus === 'checking' ? (
                                          <>
                                            <div className="flex items-center space-x-2">
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                              <span><strong>Checking Azure OpenAI Configuration...</strong></span>
                                            </div>
                                          </>
                                        ) : (
                                          <>
                                            <p><strong>Azure OpenAI Configuration Required</strong></p>
                                            <p>To enable structured data extraction, please configure Azure OpenAI in your backend:</p>
                                            <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                                              <li>Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AZURE_OPENAI_API_KEY</code></li>
                                              <li>Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AZURE_OPENAI_ENDPOINT</code></li>
                                              <li>Set <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">AZURE_OPENAI_DEPLOYMENT_NAME</code></li>
                                            </ul>
                                            <div className="mt-3">
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                onClick={checkAzureConfig}
                                              >
                                                Re-check Configuration
                                              </Button>
                                            </div>
                                          </>
                                        )}
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                  
                                  <Button
                                    onClick={processStructuredExtraction}
                                    disabled={isExtractingData || schema.some(field => !field.name) || azureConfigStatus !== 'configured'}
                                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-50"
                                  >
                                    {isExtractingData ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Extracting Data...
                                      </>
                                    ) : azureConfigStatus !== 'configured' ? (
                                      <>
                                        <AlertCircle className="h-4 w-4 mr-2" />
                                        Azure OpenAI Not Configured
                                      </>
                                    ) : (
                                      <>
                                        <Brain className="h-4 w-4 mr-2" />
                                        Extract Structured Data
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}

                              {!hasOCRResults && (
                                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                  <div className="flex items-center space-x-2">
                                    <Info className="h-4 w-4 text-yellow-600" />
                                    <span className="text-sm text-yellow-800 dark:text-yellow-200">
                                      Upload and process a document first to enable structured extraction
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="structured-results" className="mt-6">
                    {hasStructuredResults && (
                      <Card className="border-0 shadow-lg">
                        <CardHeader>
                          <CardTitle className="flex items-center space-x-2">
                            <Brain className="h-5 w-5" />
                            <span>Extracted Data</span>
                          </CardTitle>
                          <CardDescription>
                            AI-extracted structured information from your document
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            {structuredResults ? (
                              <>
                                <pre className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg overflow-auto text-sm">
                                  {JSON.stringify(structuredResults, null, 2)}
                                </pre>
                                
                                <div className="flex items-center justify-between pt-4 border-t">
                                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                                    <div className="flex items-center space-x-1">
                                      <Clock className="h-4 w-4" />
                                      <span>Processing: {structuredResults.processing_time?.toFixed(1)}s</span>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <Target className="h-4 w-4" />
                                      <span>Fields: {Object.keys(structuredResults.extracted_data || {}).length}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center space-x-2">
                                    <Button variant="outline" size="sm">
                                      <Download className="h-4 w-4 mr-2" />
                                      Export JSON
                                    </Button>
                                    <Button variant="outline" size="sm">
                                      <Copy className="h-4 w-4 mr-2" />
                                      Copy Data
                                    </Button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="text-center py-12">
                                <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No Extracted Data</h3>
                                <p className="text-muted-foreground max-w-md mx-auto">
                                  Use the Schema Builder to define fields and extract structured data from your document.
                                </p>
                                {hasOCRResults && (
                                  <Button 
                                    variant="outline" 
                                    className="mt-4"
                                    onClick={() => setActiveTab('schema-builder')}
                                  >
                                    <Settings className="h-4 w-4 mr-2" />
                                    Create Schema
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
