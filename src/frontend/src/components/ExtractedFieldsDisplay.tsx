import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Target, 
  Brain,
  Eye,
  Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExtractedFieldsDisplayProps {
  structuredResults: any;
  onFieldHover?: (fieldName: string | null) => void;
  hoveredField?: string | null;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

export function ExtractedFieldsDisplay({ 
  structuredResults, 
  onFieldHover, 
  hoveredField 
}: ExtractedFieldsDisplayProps) {
  if (!structuredResults) return null;

  const { extracted_data, grounded_fields, processing_time, llm_confidence, schema_validation_passed } = structuredResults;

  const getFieldColor = (fieldName: string) => {
    const index = grounded_fields?.findIndex((field: any) => field.field_name === fieldName) || 0;
    return COLORS[index % COLORS.length];
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyAllData = () => {
    const formattedData = Object.entries(extracted_data || {})
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    copyToClipboard(formattedData);
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {structuredResults.success ? 'Success' : 'Failed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Processing Time</p>
                  <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                    {processing_time?.toFixed(1)}s
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg">
                  <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">AI Confidence</p>
                  <p className="text-lg font-semibold text-purple-600 dark:text-purple-400">
                    {(llm_confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/20 rounded-lg">
                  <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fields Found</p>
                  <p className="text-lg font-semibold text-orange-600 dark:text-orange-400">
                    {Object.keys(extracted_data || {}).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Extracted Fields */}
        <Card className="shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Eye className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Extracted Data Fields</CardTitle>
                {schema_validation_passed && (
                  <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    Schema Valid
                  </Badge>
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyAllData}
                    className="h-8"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy all extracted data to clipboard</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {Object.entries(extracted_data || {}).map(([fieldName, value]) => {
                  const groundedField = grounded_fields?.find((gf: any) => gf.field_name === fieldName);
                  const fieldColor = getFieldColor(fieldName);
                  const isHovered = hoveredField === fieldName;

                  return (
                    <Card
                      key={fieldName}
                      className={`transition-all duration-200 cursor-pointer border-l-4 ${
                        isHovered ? 'shadow-lg scale-[1.02] bg-accent/50' : 'hover:shadow-md'
                      }`}
                      style={{ borderLeftColor: fieldColor }}
                      onMouseEnter={() => onFieldHover?.(fieldName)}
                      onMouseLeave={() => onFieldHover?.(null)}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* Field Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: fieldColor }}
                              />
                              <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                                {fieldName.replace(/_/g, ' ')}
                              </h3>
                            </div>
                            {groundedField && (
                              <Badge variant="outline" className="text-xs">
                                {(groundedField.confidence * 100).toFixed(0)}% confidence
                              </Badge>
                            )}
                          </div>

                          {/* Field Value */}
                          <div className="ml-6">
                            <p className="text-lg font-medium text-foreground break-words">
                              {String(value)}
                            </p>
                          </div>

                          {/* Additional Info */}
                          {groundedField && (
                            <div className="ml-6 pt-2 border-t border-border/50">
                              <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <div className="flex items-center space-x-4">
                                  <span>
                                    {groundedField.bounding_boxes?.length || 0} region{groundedField.bounding_boxes?.length !== 1 ? 's' : ''}
                                  </span>
                                  <span>
                                    {groundedField.source_text_blocks?.length || 0} text block{groundedField.source_text_blocks?.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(String(value))}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Copy field value</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Error Display */}
        {structuredResults.errors && structuredResults.errors.length > 0 && (
          <Card className="border-l-4 border-l-red-500">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-red-600" />
                <CardTitle className="text-lg text-red-600">Processing Notes</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {structuredResults.errors.map((error: string, index: number) => (
                  <div key={index} className="text-sm text-muted-foreground bg-red-50 dark:bg-red-900/20 p-3 rounded">
                    {error}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </TooltipProvider>
  );
}
