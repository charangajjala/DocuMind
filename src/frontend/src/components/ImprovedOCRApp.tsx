import { useState, useCallback, useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { ModeToggle } from '@/components/mode-toggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Removed unused UILabel import
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiService } from '@/services/api';
import { ImageWithBoundingBoxes } from '@/components/ImageWithBoundingBoxes';
import { ExtractedFieldsDisplay } from '@/components/ExtractedFieldsDisplay';
import { OCRVisualization } from '@/components/OCRVisualization';
import { EnhancedSchemaBuilder } from '@/components/EnhancedSchemaBuilder';
import type { OCRResponse } from '@/types/api';
import type { ExtractionResult } from '@/types/extraction';
import { 
  Loader2, 
  FileText, 
  AlertCircle, 
  Brain,
  Settings,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Zap,
  ChevronRight,
  Layout,
  MessageSquare
} from 'lucide-react';

export function ImprovedOCRApp() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageBase64, setImageBase64] = useState<string>('');
  const [ocrResults, setOcrResults] = useState<OCRResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('upload');
  const [structuredResults, setStructuredResults] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const [isExtractingData, setIsExtractingData] = useState(false);
  const [azureConfigStatus, setAzureConfigStatus] = useState<'checking' | 'configured' | 'not-configured'>('checking');
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [hoveredTextBlock, setHoveredTextBlock] = useState<number | null>(null);
  const [userPrompt, setUserPrompt] = useState<string>('');
  interface PromptEstimates { 
    system_prompt_tokens: number; 
    user_prompt_tokens: number; 
    image_input_tokens: number; 
    total_estimated_input_tokens: number; 
  }
  interface StagePrompts { 
    system_prompt?: string; 
    user_prompt?: string; 
    token_estimates?: PromptEstimates; 
  }
  type PromptsUsed = {
    system_prompt?: string;
    user_prompt?: string;
    token_estimates?: PromptEstimates;
    subset_block_count?: number;
    mode?: string;
    stage1?: StagePrompts & { token_estimates?: PromptEstimates };
    stage2?: StagePrompts & { token_estimates?: PromptEstimates; filtered_block_count?: number };
  };
  const [fullPromptsUsed, setFullPromptsUsed] = useState<PromptsUsed | null>(null);
  const [rawLlmResponse, setRawLlmResponse] = useState<string | null>(null);
  const [llmModel, setLlmModel] = useState<'gpt-40' | 'gpt-o4-mini' | 'gpt-5-mini' | 'gpt-5-nano'>('gpt-5-mini');
  type GroundingMode = 'ai' | 'manual' | 'hybrid';
  const [groundingMode, setGroundingMode] = useState<GroundingMode>('ai');
  const AVAILABLE_TYPES: Array<'block' | 'paragraph' | 'line' | 'token'> = ['block','paragraph','line','token'];
  const [allowedElementTypes, setAllowedElementTypes] = useState<Array<'block' | 'paragraph' | 'line' | 'token'>>(['line']);
  const toggleAllowedType = (t: 'block' | 'paragraph' | 'line' | 'token') => {
    setAllowedElementTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };
  const selectAllTypes = () => setAllowedElementTypes(AVAILABLE_TYPES);
  const clearAllTypes = () => setAllowedElementTypes([]);

  // Computed states
  const hasOCRResults = ocrResults !== null;
  const hasStructuredResults = structuredResults !== null;

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setError('');
    setOcrResults(null);
    setStructuredResults(null);
    setFullPromptsUsed(null);
    setRawLlmResponse(null);
    // Reset schema and clear persisted schema on new file upload
    try { localStorage.removeItem('enhanced_schema_builder_current_schema'); } catch {}
    setSchema(null);
    setSchema(null); // Reset schema for a fresh run on new image
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
      console.log('🔄 OCR Request:', {
        fileSize: selectedFile.size,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        base64DataLength: base64Data.length,
        timestamp: new Date().toISOString()
      });
      
      const response = await ApiService.processOCR(base64Data);
      
      console.log('✅ OCR Response from backend:', response);
      
      setOcrResults(response);
      setActiveTab('ocr-results');
    } catch (error) {
      console.error('❌ OCR Error:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        fileName: selectedFile?.name,
        fileSize: selectedFile?.size,
        timestamp: new Date().toISOString()
      });
      setError(error instanceof Error ? error.message : 'Failed to process document. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, imageBase64]);

  const processStructuredExtraction = async () => {
    // Validation: Need OCR results and either schema or user prompt
    if (!ocrResults) return;
    
    const hasSchema = schema && schema.properties && Object.keys(schema.properties).length > 0;
    const hasUserPrompt = userPrompt.trim().length > 0;
    
    if (!hasSchema && !hasUserPrompt) {
      setError('Please provide either a schema definition or custom instructions for data extraction.');
      return;
    }
    
    setIsExtractingData(true);
    setError('');
    setFullPromptsUsed(null);
    setRawLlmResponse(null);
    
    try {
      const hasSchema = schema && schema.properties && Object.keys(schema.properties).length > 0;
      const jsonSchema = hasSchema ? schema : null; // Schema is optional
      
      const prompt = userPrompt.trim() || "Extract the structured data from the document.";
      const base64Data = imageBase64.split(',')[1];
      
      console.log('🔄 Structured Extraction Request:', {
        schema: jsonSchema,
        prompt: prompt,
        base64DataLength: base64Data.length,
        userPromptProvided: !!userPrompt.trim(),
        hasSchema: hasSchema,
        timestamp: new Date().toISOString()
      });
      
      let response: ExtractionResult;
      if (groundingMode === 'manual') {
        response = await ApiService.extractStructuredDataOCROnly(base64Data, jsonSchema, prompt, llmModel);
      } else if (groundingMode === 'hybrid') {
        response = await ApiService.extractStructuredDataHybrid(base64Data, jsonSchema, prompt, llmModel);
      } else {
        response = await ApiService.extractStructuredData(base64Data, jsonSchema, prompt, llmModel, allowedElementTypes);
      }
      
      console.log('✅ Structured Extraction Response from backend:', response);
      
      // Save the full prompts that were actually used by the backend
      if (response.prompts_used) {
        setFullPromptsUsed(response.prompts_used);
      }
      
      // Save the raw LLM response for debugging
      if (response.raw_llm_response) {
        setRawLlmResponse(response.raw_llm_response);
      }
      
      setStructuredResults(response);
      setActiveTab('results');
    } catch (error) {
      console.error('❌ Structured extraction error:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        schemaFieldsCount: schema?.properties ? Object.keys(schema.properties).length : 0,
        userPromptProvided: !!userPrompt.trim(),
        timestamp: new Date().toISOString()
      });
      
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
      console.log('🔄 Health Check Request:', {
        timestamp: new Date().toISOString()
      });
      
      const healthCheck = await ApiService.checkHealth();
      
      console.log('✅ Health Check Response from backend:', healthCheck);
      
      if (healthCheck.azure_openai === 'configured') {
        setAzureConfigStatus('configured');
      } else {
        setAzureConfigStatus('not-configured');
      }
    } catch (error) {
      console.log('❌ Health check failed:', {
        error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
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
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">Model</span>
                  <Select value={llmModel} onValueChange={(v) => setLlmModel(v as any)}>
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
                      <SelectItem value="gpt-40">gpt-40</SelectItem>
                      <SelectItem value="gpt-o4-mini">gpt-o4-mini</SelectItem>
                      <SelectItem value="gpt-5-nano">gpt-5-nano</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mode</span>
                    <Select value={groundingMode} onValueChange={(v) => setGroundingMode(v as GroundingMode)}>
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ai">AI-powered</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <ModeToggle />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-4 max-w-full">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 h-full">
            {/* Tab Navigation */}
            <div className="flex justify-center">
              <TabsList className="grid w-full max-w-4xl grid-cols-5 h-12 bg-muted/50 p-1">
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
                <TabsTrigger 
                  value="prompts" 
                  disabled={!fullPromptsUsed}
                  className="data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 h-10"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  LLM Debug
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Upload Tab */}
            <TabsContent value="upload" className="space-y-6">
              <div className="max-w-6xl mx-auto">
               <div className="space-y-6">
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
            <TabsContent value="ocr-results" className="space-y-4 h-full">
              <div className="h-full flex flex-col">
                {hasOCRResults && (
                  <>
                    <div className="flex justify-center mb-4">
                      <Button 
                        onClick={() => setActiveTab('extraction')}
                        className="px-6 h-10"
                        size="default"
                      >
                        <ChevronRight className="h-4 w-4 mr-2" />
                        Continue to Schema Definition
                      </Button>
                    </div>

                    {/* OCR Visualization */}
                    <div className="flex-1 min-h-0">
                      <OCRVisualization
                        imageSrc={imageBase64}
                        textBlocks={ocrResults.text_blocks || []}
                        imageWidth={ocrResults.image_dimensions?.width}
                        imageHeight={ocrResults.image_dimensions?.height}
                        onTextBlockHover={setHoveredTextBlock}
                        hoveredBlock={hoveredTextBlock}
                      />
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Schema Definition Tab */}
            <TabsContent value="extraction" className="space-y-6">
              <div className="max-w-6xl mx-auto space-y-6">
                <EnhancedSchemaBuilder
                  initialSchema={schema || undefined}
                  onSchemaChange={setSchema}
                />
                {groundingMode === 'ai' && (
                  <Card className="border shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">OCR Element Types for LLM Context</CardTitle>
                      <CardDescription>
                        Choose which OCR text element types to include when sending context to the AI model. Default is line.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm text-muted-foreground">Applies in AI grounding mode only</div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={selectAllTypes} disabled={allowedElementTypes.length === AVAILABLE_TYPES.length}>All</Button>
                          <Button size="sm" variant="outline" onClick={clearAllTypes} disabled={allowedElementTypes.length === 0}>None</Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {AVAILABLE_TYPES.map(t => (
                          <label key={t} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={allowedElementTypes.includes(t)} onChange={() => toggleAllowedType(t)} />
                            <span className="capitalize">{t}</span>
                          </label>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Extraction Controls */}
                {((schema && schema.properties && Object.keys(schema.properties).length > 0) || userPrompt.trim().length > 0) && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Extract Data</CardTitle>
                      <CardDescription>
                        {schema && schema.properties && Object.keys(schema.properties).length > 0 
                          ? "Run the extraction process using your defined schema"
                          : "Run the extraction process using your custom instructions"
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={processStructuredExtraction}
                        disabled={isExtractingData || !hasOCRResults}
                        className="w-full"
                        size="lg"
                      >
                        {isExtractingData ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Extracting Data...
                          </>
                        ) : (
                          <>
                            <Brain className="mr-2 h-4 w-4" />
                            Extract Structured Data
                          </>
                        )}
                      </Button>
                      {!hasOCRResults && (
                        <p className="text-sm text-muted-foreground mt-2 text-center">
                          Please upload and process an image first
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Additional User Prompt Section */}
                <Card className="border shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg">Additional Instructions (Optional)</CardTitle>
                    <CardDescription>
                      Provide additional context or specific instructions for the AI to better extract your data
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="userPrompt">Custom Prompt</Label>
                      <Textarea
                        id="userPrompt"
                        placeholder="e.g., Please focus on extracting dates in MM/DD/YYYY format, or look for signatures at the bottom of the document..."
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                      <p className="text-sm text-muted-foreground">
                        This will be added to the extraction prompt to provide additional context to the AI model.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="whitespace-pre-line">
                      {error}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="space-y-4">
              {hasStructuredResults && (
                <div className="w-full overflow-hidden">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 min-h-0">
                    {/* Visual Field Mapping - Takes 3/4 of width (75%) */}
                    <div className="lg:col-span-3 min-w-0">
                      <Card className="border shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Layout className="h-4 w-4 text-blue-600" />
                            <h3 className="text-base font-medium">Visual Field Mapping</h3>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3">
                            <div className="w-full h-[70vh] min-h-[480px] rounded-md overflow-hidden bg-white dark:bg-slate-900">
                              <ImageWithBoundingBoxes
                                imageSrc={imageBase64}
                                groundedFields={structuredResults.grounded_fields || []}
                                imageWidth={ocrResults?.image_dimensions?.width}
                                imageHeight={ocrResults?.image_dimensions?.height}
                                onFieldHover={setHoveredField}
                                hoveredField={hoveredField}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Extracted Fields Display - Wider column to avoid overflow */}
                    <div className="lg:col-span-2 min-w-0">
                      <div className="sticky top-4">
                        <div className="space-y-2 pr-2">
                          <ExtractedFieldsDisplay
                            structuredResults={structuredResults}
                            onFieldHover={setHoveredField}
                            hoveredField={hoveredField}
                            imageWidth={ocrResults?.image_dimensions?.width}
                            imageHeight={ocrResults?.image_dimensions?.height}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* LLM Debug Tab */}
            <TabsContent value="prompts" className="space-y-4">
            {fullPromptsUsed && (
                <div className="w-full max-w-6xl mx-auto space-y-6">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                      <Sparkles className="h-6 w-6 text-purple-600" />
                      LLM Debug
                    </h2>
                    <p className="text-muted-foreground">
                      Complete prompts and token/block statistics used by the LLM
                    </p>
                  </div>

                  <div className="space-y-6">
                  {/* System Prompt(s) */}
                  {/* Stage prompts as tabs for cleaner layout */}
                  {(fullPromptsUsed.system_prompt || fullPromptsUsed.stage1 || fullPromptsUsed.stage2) && (
                    <Card className="border shadow-lg">
                       <CardHeader className="pb-2">
                        <CardTitle className="text-xl flex items-center gap-2">
                          <Settings className="h-6 w-6 text-blue-600" />
                          Prompts {fullPromptsUsed.mode ? `(${String(fullPromptsUsed.mode)})` : ''}
                        </CardTitle>
                        <CardDescription>
                          Complete prompts used at each stage
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <Tabs defaultValue={fullPromptsUsed.stage1 ? 'stage1' : 'primary'}>
                          <TabsList className="mb-3 flex flex-wrap gap-2">
                            {fullPromptsUsed.stage1 && <TabsTrigger value="stage1">Stage 1</TabsTrigger>}
                            <TabsTrigger value="primary">{fullPromptsUsed.stage2 ? 'Stage 2' : 'Primary'}</TabsTrigger>
                          </TabsList>
                          {fullPromptsUsed.stage1 && (
                            <TabsContent value="stage1">
                               <div className="space-y-4">
                                {fullPromptsUsed.stage1.system_prompt && (
                                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                    <div className="text-xs font-semibold mb-2">System Prompt</div>
                                    <div className="max-h-96 overflow-y-auto custom-scroll">
                                      <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                        {fullPromptsUsed.stage1.system_prompt}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                                {fullPromptsUsed.stage1.user_prompt && (
                                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                    <div className="text-xs font-semibold mb-2">User Prompt</div>
                                    <div className="max-h-96 overflow-y-auto custom-scroll">
                                      <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                        {fullPromptsUsed.stage1.user_prompt}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </TabsContent>
                          )}
                          <TabsContent value="primary">
                             <div className="space-y-4">
                              {fullPromptsUsed.system_prompt && (
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                  <div className="text-xs font-semibold mb-2">System Prompt</div>
                                  <div className="max-h-96 overflow-y-auto custom-scroll">
                                    <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                      {fullPromptsUsed.system_prompt}
                                    </pre>
                                  </div>
                                </div>
                              )}
                              {fullPromptsUsed.user_prompt && (
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                  <div className="text-xs font-semibold mb-2">User Prompt</div>
                                  <div className="max-h-96 overflow-y-auto custom-scroll">
                                    <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                      {fullPromptsUsed.user_prompt}
                                    </pre>
                                  </div>
                                </div>
                              )}
                            </div>
                          </TabsContent>
                        </Tabs>
                      </CardContent>
                    </Card>
                  )}

                  {/* User Prompt(s): render only when hybrid stages are present to avoid duplicate with Primary */}
                  {fullPromptsUsed.user_prompt && (fullPromptsUsed.stage1 || fullPromptsUsed.stage2) && (
                      <Card className="border shadow-lg h-fit">
                           <CardHeader className="pb-2">
                          <CardTitle className="text-xl flex items-center gap-2">
                            <Brain className="h-6 w-6 text-purple-600" />
                          User Prompt {fullPromptsUsed.mode ? `(${String(fullPromptsUsed.mode)})` : ''}
                          </CardTitle>
                          <CardDescription>
                            The final user instructions sent to the AI model with extraction guidance and response format
                          </CardDescription>
                        </CardHeader>
                      <CardContent className="pt-0">
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                          <div className="max-h-96 overflow-y-auto custom-scroll">
                              <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                                {fullPromptsUsed.user_prompt}
                              </pre>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  {/* Hybrid Stage 2 prompts (if present) */}
                  {fullPromptsUsed.stage2 && (
                    <div className="space-y-6">
                      {fullPromptsUsed.stage2.system_prompt && (
                        <Card className="border shadow-lg h-fit">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Settings className="h-6 w-6 text-blue-600" />
                              Stage 2 System Prompt
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                              <div className="max-h-96 overflow-y-auto custom-scroll">
                                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                                  {fullPromptsUsed.stage2.system_prompt}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {fullPromptsUsed.stage2.user_prompt && (
                        <Card className="border shadow-lg h-fit">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Brain className="h-6 w-6 text-purple-600" />
                              Stage 2 User Prompt
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                              <div className="max-h-96 overflow-y-auto custom-scroll">
                                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                                  {fullPromptsUsed.stage2.user_prompt}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                  {/* Hybrid Stage 1 prompts (if present and top-level not provided) */}
                  {fullPromptsUsed.stage1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {fullPromptsUsed.stage1.system_prompt && (
                        <Card className="border shadow-lg h-fit">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Settings className="h-6 w-6 text-blue-600" />
                              Stage 1 System Prompt
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border-l-4 border-blue-500">
                              <div className="max-h-96 overflow-y-auto">
                                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                                  {fullPromptsUsed.stage1.system_prompt}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {fullPromptsUsed.stage1.user_prompt && (
                        <Card className="border shadow-lg h-fit">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-xl flex items-center gap-2">
                              <Brain className="h-6 w-6 text-purple-600" />
                              Stage 1 User Prompt
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border-l-4 border-purple-500">
                              <div className="max-h-96 overflow-y-auto">
                                <pre className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                                  {fullPromptsUsed.stage1.user_prompt}
                                </pre>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                  </div>

                  {/* Raw LLM Responses (all stages if available) */}
                  {rawLlmResponse && (
                    <Card className="border shadow-lg mt-2">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-xl flex items-center gap-2">
                          <MessageSquare className="h-6 w-6 text-green-600" />
                          Raw LLM Response {fullPromptsUsed?.mode ? `(${String(fullPromptsUsed.mode)})` : ''}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigator.clipboard.writeText(rawLlmResponse)}
                            className="ml-auto text-xs"
                          >
                            Copy Response
                          </Button>
                        </CardTitle>
                        <CardDescription>
                          The exact response received from the AI model before any post-processing by the backend
                        </CardDescription>
                      </CardHeader>
                       <CardContent className="pt-0">
                         <div className="space-y-4">
                           {/* If the backend provided a JSON with stage1/stage2 raw responses, render them split */}
                           {(() => {
                             try {
                               const parsed = JSON.parse(rawLlmResponse);
                               if (parsed?.stage1 || parsed?.stage2) {
                                 return (
                                   <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                     <Tabs defaultValue={parsed.stage1 ? 'stage1' : 'stage2'}>
                                       <TabsList className="mb-3">
                                         {parsed.stage1?.raw_llm_response && <TabsTrigger value="stage1">Stage 1</TabsTrigger>}
                                         {parsed.stage2?.raw_llm_response && <TabsTrigger value="stage2">Stage 2</TabsTrigger>}
                                       </TabsList>
                                       {parsed.stage1?.raw_llm_response && (
                                         <TabsContent value="stage1">
                                           <div className="max-h-96 overflow-y-auto custom-scroll">
                                             <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                               {parsed.stage1.raw_llm_response}
                                             </pre>
                                           </div>
                                         </TabsContent>
                                       )}
                                       {parsed.stage2?.raw_llm_response && (
                                         <TabsContent value="stage2">
                                           <div className="max-h-96 overflow-y-auto custom-scroll">
                                             <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                               {parsed.stage2.raw_llm_response}
                                             </pre>
                                           </div>
                                         </TabsContent>
                                       )}
                                     </Tabs>
                                   </div>
                                 );
                               }
                             } catch {}
                             return (
                               <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                                 <div className="max-h-96 overflow-y-auto custom-scroll">
                                   <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed">
                                     {rawLlmResponse}
                                   </pre>
                                 </div>
                               </div>
                             );
                           })()}
                         </div>
                       </CardContent>
                    </Card>
                  )}

                  {/* LLM Token and Block Statistics */}
                  <Card className="border shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Zap className="h-5 w-5 text-green-600" />
                        Token & Block Statistics
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                           <div className="text-2xl font-bold text-blue-600">
                             {fullPromptsUsed.token_estimates?.system_prompt_tokens
                              ?? fullPromptsUsed.stage1?.token_estimates?.system_prompt_tokens
                              ?? Math.floor(((fullPromptsUsed.system_prompt || fullPromptsUsed.stage1?.system_prompt || '').length)/4)}
                          </div>
                          <div className="text-sm text-muted-foreground">System Prompt Tokens (est.)</div>
                        </div>
                        <div className="text-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                           <div className="text-2xl font-bold text-purple-600">
                             {fullPromptsUsed.token_estimates?.user_prompt_tokens
                              ?? fullPromptsUsed.stage1?.token_estimates?.user_prompt_tokens
                              ?? Math.floor(((fullPromptsUsed.user_prompt || fullPromptsUsed.stage1?.user_prompt || '').length)/4)}
                          </div>
                          <div className="text-sm text-muted-foreground">User Prompt Tokens (est.)</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                             {fullPromptsUsed.token_estimates?.image_input_tokens
                              ?? fullPromptsUsed.stage1?.token_estimates?.image_input_tokens
                              ?? 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Image Input Tokens (est.)</div>
                        </div>
                        <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">
                             {fullPromptsUsed.token_estimates?.total_estimated_input_tokens
                              ?? fullPromptsUsed.stage1?.token_estimates?.total_estimated_input_tokens
                              ?? (
                                Math.floor(((fullPromptsUsed.system_prompt || fullPromptsUsed.stage1?.system_prompt || '').length)/4)
                                + Math.floor(((fullPromptsUsed.user_prompt || fullPromptsUsed.stage1?.user_prompt || '').length)/4)
                              )}
                          </div>
                          <div className="text-sm text-muted-foreground">Total Estimated Input Tokens</div>
                        </div>
                      </div>
                      {/* Block optimization stats */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-slate-700">
                            {ocrResults?.text_blocks?.length ?? 0}
                          </div>
                          <div className="text-sm text-muted-foreground">Original OCR Blocks</div>
                        </div>
                        <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-slate-700">
                            {structuredResults?.prompts_used?.subset_block_count ?? '—'}
                          </div>
                          <div className="text-sm text-muted-foreground">Optimized Subset Blocks</div>
                        </div>
                        <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                          <div className="text-2xl font-bold text-slate-700">
                            {(() => {
                              const orig = ocrResults?.text_blocks?.length ?? 0;
                              const sub = structuredResults?.prompts_used?.subset_block_count as number | undefined;
                              if (!orig || !sub && sub !== 0) return '—';
                              const pct = Math.max(0, Math.min(100, Math.round((1 - sub / orig) * 100)));
                              return `${pct}%`;
                            })()}
                          </div>
                          <div className="text-sm text-muted-foreground">Block Reduction</div>
                        </div>
                       </div>
                       {/* Mode-specific stats */}
                       {fullPromptsUsed.mode && (
                         <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                           <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                             <div className="text-xs text-muted-foreground">Mode</div>
                             <div className="text-base font-semibold">{String(fullPromptsUsed.mode)}</div>
                           </div>
                           {fullPromptsUsed.stage2?.filtered_block_count !== undefined && (
                             <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                               <div className="text-xs text-muted-foreground">Filtered Blocks</div>
                               <div className="text-base font-semibold">{fullPromptsUsed.stage2.filtered_block_count}</div>
                             </div>
                           )}
                           {structuredResults?.grounded_fields && (
                             <div className="text-center p-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                               <div className="text-xs text-muted-foreground">Fields Grounded</div>
                               <div className="text-base font-semibold">{structuredResults.grounded_fields.length}</div>
                             </div>
                           )}
                         </div>
                       )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {!fullPromptsUsed && (
                <div className="text-center py-12">
                  <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No AI Prompts Available</h3>
                  <p className="text-muted-foreground">
                    Complete the structured data extraction process to see the AI prompts used.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TooltipProvider>
  );
}
