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
  Copy,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState } from 'react';
import type { JSX } from 'react';

interface ExtractedFieldsDisplayProps {
  structuredResults: any;
  onFieldHover?: (fieldName: string | null) => void;
  hoveredField?: string | null;
  imageWidth?: number;
  imageHeight?: number;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

export function ExtractedFieldsDisplay({ 
  structuredResults, 
  onFieldHover, 
  hoveredField,
  imageWidth,
  imageHeight
}: ExtractedFieldsDisplayProps) {
  const [bboxPopupField, setBboxPopupField] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [expandedReasoningFields, setExpandedReasoningFields] = useState<Set<string>>(new Set());
  const [showAllReasoning, setShowAllReasoning] = useState(false);
  
  if (!structuredResults) return null;

  const { extracted_data, grounded_fields, processing_time, llm_confidence, schema_validation_passed } = structuredResults;

  // Group by top-level object/array for consistent coloring
  const normalizeGroupKey = (fieldName: string) => {
    const cleaned = fieldName.replace(/\[[^\]]*\]/g, '');
    return cleaned.split('.')[0] || cleaned;
  };

  const groupKeyToColor: Record<string, string> = {};
  const getFieldColor = (fieldName: string) => {
    const key = normalizeGroupKey(fieldName);
    if (!groupKeyToColor[key]) {
      const idx = Object.keys(groupKeyToColor).length;
      groupKeyToColor[key] = COLORS[idx % COLORS.length];
    }
    return groupKeyToColor[key];
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleFieldHover = (fieldName: string, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setPopupPosition({
      x: rect.right + 10,
      y: rect.top
    });
    setBboxPopupField(fieldName);
    onFieldHover?.(fieldName);
  };

  // Hover helpers for grouped objects/arrays
  const handleGroupHover = (groupPath: string) => {
    onFieldHover?.(`group:${groupPath}`);
  };
  const handleGroupLeave = () => onFieldHover?.(null);

  const handleFieldLeave = () => {
    setBboxPopupField(null);
    onFieldHover?.(null);
  };

  const getFieldBbox = (fieldName: string) => {
    const groundedField = grounded_fields?.find((gf: any) => gf.field_name === fieldName);
    if (groundedField?.bounding_boxes && groundedField.bounding_boxes.length > 0) {
      return groundedField.bounding_boxes[0];
    }
    return null;
  };

  const renderBboxPopup = (fieldName: string) => {
    const bbox = getFieldBbox(fieldName);
    const groundedField = grounded_fields?.find((gf: any) => gf.field_name === fieldName);
    
    if (!bbox || !imageWidth || !imageHeight) return null;

    return (
      <div 
        className="fixed bg-slate-900 text-white border border-slate-600 rounded-lg p-4 text-sm shadow-xl z-50 max-w-sm backdrop-blur-sm"
        style={{
          left: popupPosition.x,
          top: popupPosition.y,
          transform: 'translateY(-25%)'
        }}
      >
        <div className="font-semibold mb-3 text-blue-300 border-b border-slate-700 pb-2">
          📍 Field Location Details
        </div>
        
        <div className="space-y-3">
          {/* Bounding Box Coordinates */}
          <div>
            <div className="font-medium text-slate-300 mb-1">Bounding Box (pixels)</div>
            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800 p-2 rounded">
              <div>Left: {Math.round(bbox.left)}px</div>
              <div>Top: {Math.round(bbox.top)}px</div>
              <div>Width: {Math.round(bbox.width)}px</div>
              <div>Height: {Math.round(bbox.height)}px</div>
            </div>
          </div>

          {/* Extraction Source */}
          {groundedField?.extraction_source && (
            <div>
              <div className="font-medium text-slate-300 mb-1">Source</div>
              <div className="text-xs bg-slate-800 p-2 rounded">
                {groundedField.extraction_source === 'OCR_GROUNDED' ? 
                  '🔤 OCR Text-based' : 
                  '👁️ Visual Analysis'}
              </div>
            </div>
          )}

          {/* OCR Text Found */}
          {groundedField?.ocr_text_found && (
            <div>
              <div className="font-medium text-slate-300 mb-1">OCR Text</div>
              <div className="text-xs bg-slate-800 p-2 rounded italic">
                "{groundedField.ocr_text_found}"
              </div>
            </div>
          )}

          {/* Confidence */}
          <div>
            <div className="font-medium text-slate-300 mb-1">Confidence</div>
            <div className="flex items-center space-x-2">
              <div className="flex-1 bg-slate-700 rounded-full h-2">
                <div 
                  className="bg-green-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${groundedField?.confidence * 100 || 0}%` }}
                />
              </div>
              <span className="text-xs text-green-400 font-medium">
                {((groundedField?.confidence || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const copyAllData = () => {
    const formattedData = Object.entries(extracted_data || {})
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join('\n');
    copyToClipboard(formattedData);
  };

  const toggleFieldReasoning = (fieldName: string) => {
    const newExpanded = new Set(expandedReasoningFields);
    if (newExpanded.has(fieldName)) {
      newExpanded.delete(fieldName);
    } else {
      newExpanded.add(fieldName);
    }
    setExpandedReasoningFields(newExpanded);
  };

  const isReasoningVisible = (fieldName: string) => {
    return showAllReasoning || expandedReasoningFields.has(fieldName);
  };

  // Recursively render values and attach group-aware hover to each path
  const renderValueRecursive = (path: string, value: any): JSX.Element => {
    if (value === null || value === undefined) {
      return <p className="text-sm text-muted-foreground">N/A</p>;
    }
    if (Array.isArray(value)) {
      return (
        <div
          onMouseEnter={() => handleGroupHover(path)}
          onMouseLeave={handleGroupLeave}
          className="text-xs font-mono bg-muted/50 rounded p-2"
        >
          {value.map((item, idx) => (
            <div key={idx} className="ml-2">
              <div className="text-[11px] text-muted-foreground">[{idx}]</div>
              {renderValueRecursive(`${path}[${idx}]`, item)}
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') {
      return (
        <div
          onMouseEnter={() => handleGroupHover(path)}
          onMouseLeave={handleGroupLeave}
          className="text-xs font-mono bg-muted/50 rounded p-2"
        >
          {Object.entries(value).map(([k, v]) => (
            <div key={k} className="ml-2">
              <div className="text-[11px] text-muted-foreground">{k}:</div>
              {renderValueRecursive(`${path}.${k}`, v)}
            </div>
          ))}
        </div>
      );
    }
    // Primitive
    return <p className="text-sm font-medium break-words">{String(value)}</p>;
  };

  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Summary Stats - Compact */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="border-l-2 border-l-green-500">
            <CardContent className="p-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold text-green-600">
                    {structuredResults.success ? 'Success' : 'Failed'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-2 border-l-blue-500">
            <CardContent className="p-2">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Processing Time</p>
                  <p className="text-sm font-semibold text-blue-600">
                    {processing_time?.toFixed(1)}s
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-2 border-l-purple-500">
            <CardContent className="p-2">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-purple-600" />
                <div>
                  <p className="text-xs text-muted-foreground">AI Confidence</p>
                  <p className="text-sm font-semibold text-purple-600">
                    {(llm_confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-2 border-l-orange-500">
            <CardContent className="p-2">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-orange-600" />
                <div>
                  <p className="text-xs text-muted-foreground">Fields Found</p>
                  <p className="text-sm font-semibold text-orange-600">
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
              <div className="flex items-center space-x-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllReasoning(!showAllReasoning)}
                      className="h-8"
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      {showAllReasoning ? 'Hide' : 'Show'} Reasoning
                      {grounded_fields && (
                        <span className="ml-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                          {grounded_fields.filter((gf: any) => gf.reasoning).length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{showAllReasoning ? 'Hide' : 'Show'} AI reasoning for all fields</p>
                    {grounded_fields && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {grounded_fields.filter((gf: any) => gf.reasoning).length} fields have reasoning available
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
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
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
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
                      onMouseEnter={(e) => handleFieldHover(fieldName, e)}
                      onMouseLeave={handleFieldLeave}
                    >
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          {/* Field Header - Compact */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: fieldColor }}
                              />
                              <h3 className="font-medium text-sm text-foreground">
                                {fieldName.replace(/_/g, ' ')}
                              </h3>
                            </div>
                            {groundedField && (
                              <div className="flex items-center space-x-1">
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  {(groundedField.confidence * 100).toFixed(0)}%
                                </Badge>
                                {groundedField.bounding_boxes?.length > 0 && (
                                  <Badge variant="secondary" className="text-xs px-1 py-0">
                                    📍
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Field Value - Compact */}
                          <div className="ml-4 space-y-1">
                            {renderValueRecursive(fieldName, value)}
                          </div>

                          {/* Reasoning Display - Enhanced with Toggle */}
                          {groundedField?.reasoning && (
                            <div className="ml-4 pt-3 border-t border-border/30">
                              {/* Reasoning Header with Toggle */}
                              <div className="flex items-center justify-between mb-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => toggleFieldReasoning(fieldName)}
                                  className="h-auto p-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <div className="flex items-center space-x-2">
                                    {isReasoningVisible(fieldName) ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                    <MessageSquare className="h-3 w-3 text-blue-500" />
                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                      AI Reasoning
                                    </span>
                                    {!isReasoningVisible(fieldName) && (
                                      <span className="text-xs text-blue-500 bg-blue-100 dark:bg-blue-900/30 px-1 py-0.5 rounded">
                                        Click to show
                                      </span>
                                    )}
                                  </div>
                                </Button>
                                
                                {/* Reasoning Indicator */}
                                <div className="flex items-center space-x-1">
                                  {groundedField.extraction_source && (
                                    <span className={`px-2 py-1 rounded-full font-medium text-xs ${
                                      groundedField.extraction_source === 'OCR_GROUNDED' 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    }`}>
                                      {groundedField.extraction_source === 'OCR_GROUNDED' ? '🔤 OCR' : '👁️ Visual'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Reasoning Content - Collapsible */}
                              {isReasoningVisible(fieldName) && (
                                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                                  <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-3">
                                    {groundedField.reasoning}
                                  </div>
                                  
                                  {/* Additional Context */}
                                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between text-xs">
                                      <div className="flex items-center space-x-3">
                                        {groundedField.ocr_text_found && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full font-medium cursor-help">
                                                📄 OCR: "{groundedField.ocr_text_found.substring(0, 20)}..."
                                              </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <div className="font-medium mb-1">Full OCR Text Found:</div>
                                              <div className="text-xs italic">"{groundedField.ocr_text_found}"</div>
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                      </div>
                                      
                                      <div className="flex items-center space-x-1">
                                        <span className="text-slate-500">Confidence:</span>
                                        <span className="font-medium text-slate-700 dark:text-slate-300">
                                          {((groundedField.confidence || 0) * 100).toFixed(0)}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Fallback when no reasoning is provided */}
                          {!groundedField?.reasoning && groundedField && (
                            <div className="ml-4 pt-2 border-t border-border/30">
                              <div className="bg-amber-50 dark:bg-amber-900/20 rounded p-2 border border-amber-200 dark:border-amber-800/30">
                                <div className="flex items-center space-x-2 text-xs">
                                  <Info className="h-3 w-3 text-amber-600" />
                                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                                    No detailed reasoning available
                                  </span>
                                  <span className="text-amber-600 dark:text-amber-500">
                                    - This field was extracted but no AI reasoning was provided
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Additional Info - Compact */}
                          {groundedField && (
                            <div className="ml-4 pt-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex items-center space-x-2">
                                  {groundedField.bounding_boxes?.length > 0 ? (
                                    <span className="text-green-600 font-medium">
                                      {groundedField.bounding_boxes.length} region{groundedField.bounding_boxes.length !== 1 ? 's' : ''}
                                    </span>
                                  ) : (
                                    <span className="text-amber-600 font-medium">
                                      Visual only
                                    </span>
                                  )}
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => copyToClipboard(formatValue(value))}
                                      className="h-5 w-5 p-0"
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
            
            {/* Render bbox popup */}
            {bboxPopupField && renderBboxPopup(bboxPopupField)}
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
