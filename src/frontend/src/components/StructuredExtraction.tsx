import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ApiService } from '@/services/api';
import type { ExtractionResult, GroundedField } from '@/types/extraction';
import { 
  Brain, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  Target,
  Loader2,
  Download,
  BarChart3
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface StructuredExtractionProps {
  imageData: string; // base64 encoded image
  schema?: any; // Optional schema
  onExtractionComplete: (result: any) => void;
}

export function StructuredExtraction({ 
  imageData, 
  schema, 
  onExtractionComplete 
}: StructuredExtractionProps) {
  const [isExtracting, setIsExtracting] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [llmModel, setLlmModel] = useState<'gpt-40' | 'gpt-o4-mini' | 'gpt-5-mini' | 'gpt-5-nano'>('gpt-5-mini');

  const extractStructuredData = useCallback(async () => {
    // Validate that at least one of schema or prompt is provided
    if (!schema && !userPrompt.trim()) {
      const errorResult: ExtractionResult = {
        success: false,
        extracted_data: {},
        grounded_fields: [],
        ocr_results: null,
        processing_time: 0,
        llm_confidence: 0,
        schema_validation_passed: false,
        errors: ['Either a JSON schema or user prompt must be provided'],
        error_message: 'Either a JSON schema or user prompt must be provided'
      };
      setResult(errorResult);
      return;
    }

    if (!imageData) return;

    setIsExtracting(true);
    setResult(null);

    try {
      const extractionResult = await ApiService.extractStructuredData(
        imageData, 
        schema, 
        userPrompt || undefined,
        llmModel
      );
      setResult(extractionResult);
      onExtractionComplete(extractionResult);

    } catch (error) {
      const errorResult: ExtractionResult = {
        success: false,
        extracted_data: {},
        grounded_fields: [],
        ocr_results: null,
        processing_time: 0,
        llm_confidence: 0,
        schema_validation_passed: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        error_message: error instanceof Error ? error.message : 'Unknown error'
      };
      setResult(errorResult);
    } finally {
      setIsExtracting(false);
    }
  }, [imageData, schema, userPrompt, onExtractionComplete, llmModel]);

  const exportResults = () => {
    if (!result) return;

    const exportData = {
      extracted_data: result.extracted_data,
      metadata: {
        processing_time: result.processing_time,
        llm_confidence: result.llm_confidence,
        schema_validation_passed: result.schema_validation_passed,
        extraction_timestamp: new Date().toISOString()
      },
      grounded_fields: result.grounded_fields,
      errors: result.errors
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted-data-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const renderExtractedData = (data: any, prefix: string = ''): React.ReactNode => {
    if (!data || typeof data !== 'object') {
      return <span className="font-mono">{JSON.stringify(data)}</span>;
    }

    if (Array.isArray(data)) {
      return (
        <div className="space-y-2">
          {data.map((item, index) => (
            <Card key={index} className="border-l-4 border-l-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Badge variant="outline">Item {index + 1}</Badge>
                </div>
                {renderExtractedData(item, `${prefix}[${index}]`)}
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {Object.entries(data).map(([key, value]) => {
          const fieldName = prefix ? `${prefix}.${key}` : key;
          const groundedField = result?.grounded_fields.find(
            f => f.field_name === key || f.field_name === fieldName
          );

          return (
            <div 
              key={fieldName}
              className={`p-3 rounded-lg border transition-colors cursor-pointer
                ${selectedField === fieldName ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}
              `}
              onClick={() => setSelectedField(selectedField === fieldName ? null : fieldName)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-sm">{key}</span>
                  {groundedField && (
                    <div className="flex items-center space-x-1">
                      <Target className="h-3 w-3 text-blue-500" />
                      <span className={`text-xs ${getConfidenceColor(groundedField.confidence)}`}>
                        {(groundedField.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                {groundedField && (
                  <Badge variant="secondary" className="text-xs">
                    {groundedField.source_text_blocks.length} source(s)
                  </Badge>
                )}
              </div>
              
              <div className="text-sm">
                {typeof value === 'object' ? (
                  renderExtractedData(value, fieldName)
                ) : (
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">
                    {JSON.stringify(value)}
                  </span>
                )}
              </div>

              {selectedField === fieldName && groundedField && (
                <div className="mt-3 p-3 bg-gray-50 rounded border-t">
                  <h5 className="font-medium text-xs mb-2">Visual Grounding Details:</h5>
                  <div className="space-y-1 text-xs">
                    <p>Source OCR Blocks: {groundedField.source_text_blocks.join(', ')}</p>
                    <p>Bounding Boxes: {groundedField.bounding_boxes.length}</p>
                    <p className={getConfidenceColor(groundedField.confidence)}>
                      Confidence: {(groundedField.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Extraction Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Brain className="h-5 w-5 text-blue-500" />
            <span>AI-Powered Structured Extraction</span>
          </CardTitle>
          <CardDescription>
            Extract structured data using Azure OpenAI GPT-4o with visual grounding
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Additional Instructions (Optional)
            </label>
            <Textarea
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              placeholder="e.g., Focus on the top section of the document, ignore handwritten notes..."
              rows={3}
            />
            <p className="text-sm text-muted-foreground mt-2">
              {schema 
                ? "You can provide additional instructions to guide the extraction process."
                : "Provide detailed instructions for what data to extract from the document. This is required when no schema is provided."
              }
            </p>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Model</label>
              <Select value={llmModel} onValueChange={(v) => setLlmModel(v as any)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-40">gpt-40</SelectItem>
                  <SelectItem value="gpt-o4-mini">gpt-o4-mini</SelectItem>
                  <SelectItem value="gpt-5-mini">gpt-5-mini</SelectItem>
                  <SelectItem value="gpt-5-nano">gpt-5-nano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={extractStructuredData}
              disabled={isExtracting || !imageData || (!schema && !userPrompt.trim())}
              className="flex items-center space-x-2"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Brain className="h-4 w-4" />
                  <span>Extract Data</span>
                </>
              )}
            </Button>

            {!schema && !userPrompt.trim() && (
              <p className="text-sm text-amber-600">
                Either a JSON schema or user prompt is required
              </p>
            )}

            {result && (
              <Button
                variant="outline"
                onClick={exportResults}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Export Results</span>
              </Button>
            )}
          </div>

          {isExtracting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Processing document...</span>
              </div>
              <Progress value={undefined} className="w-full" />
              <p className="text-xs text-gray-500">
                This may take a few seconds while we analyze your document with AI
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <span>Extraction Results</span>
              </div>
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-1">
                  <BarChart3 className="h-4 w-4" />
                  <span className={getConfidenceColor(result.llm_confidence)}>
                    {(result.llm_confidence * 100).toFixed(1)}% confidence
                  </span>
                </div>
                <Badge variant={result.schema_validation_passed ? "default" : "destructive"}>
                  {result.schema_validation_passed ? "Valid Schema" : "Schema Issues"}
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold">{result.grounded_fields.length}</div>
                <div className="text-sm text-gray-500">Fields Extracted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{result.processing_time.toFixed(1)}s</div>
                <div className="text-sm text-gray-500">Processing Time</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-bold ${getConfidenceColor(result.llm_confidence)}`}>
                  {(result.llm_confidence * 100).toFixed(0)}%
                </div>
                <div className="text-sm text-gray-500">Overall Confidence</div>
              </div>
            </div>

            <Separator />

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="font-medium text-red-800 mb-2 flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>Issues Detected</span>
                </h4>
                <ul className="list-disc list-inside space-y-1">
                  {result.errors.map((error, index) => (
                    <li key={index} className="text-sm text-red-700">{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Extracted Data */}
            {Object.keys(result.extracted_data).length > 0 ? (
              <div>
                <h4 className="font-medium mb-3 flex items-center space-x-2">
                  <Eye className="h-4 w-4" />
                  <span>Extracted Data</span>
                  <Badge variant="outline" className="ml-2">
                    Click fields to see visual grounding
                  </Badge>
                </h4>
                <ScrollArea className="max-h-96 w-full">
                  {renderExtractedData(result.extracted_data)}
                </ScrollArea>
              </div>
            ) : (
              <div className="text-center p-8 text-gray-500">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No data was extracted from the document</p>
              </div>
            )}

            {/* Field Confidence Summary */}
            {result.grounded_fields.length > 0 && (
              <div>
                <h4 className="font-medium mb-3">Field Confidence Summary</h4>
                <div className="space-y-2">
                  {result.grounded_fields.map((field, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span className="font-medium text-sm">{field.field_name}</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              field.confidence >= 0.8 ? 'bg-green-500' :
                              field.confidence >= 0.6 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${field.confidence * 100}%` }}
                          />
                        </div>
                        <span className={`text-sm ${getConfidenceColor(field.confidence)}`}>
                          {(field.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw LLM Response Section */}
            {result.raw_llm_response && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Raw LLM Response</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(result.raw_llm_response || '')}
                    className="text-xs"
                  >
                    Copy Response
                  </Button>
                </div>
                <div className="bg-gray-50 border rounded-lg p-3 max-h-96 overflow-auto">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
                    {result.raw_llm_response}
                  </pre>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This is the exact response received from the LLM before any post-processing by the backend.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
