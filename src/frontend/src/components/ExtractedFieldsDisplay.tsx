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
  Download,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// Colors removed in compact mode

export function ExtractedFieldsDisplay({ 
  structuredResults, 
  onFieldHover,
  imageWidth: _imageWidth,
  imageHeight: _imageHeight
}: ExtractedFieldsDisplayProps) {
  // Popup removed; use image overlay only
  const [pinnedPath, setPinnedPath] = useState<string | null>(null);
  // Reasoning expansion state removed in compact mode
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());
  
  if (!structuredResults) return null;

  const { extracted_data, grounded_fields, processing_time, llm_confidence, schema_validation_passed } = structuredResults;
  
  // Debug: Log the available grounded fields
  console.log('Available grounded fields:', grounded_fields?.map((gf: any) => gf.field_name) || []);

  // Group by top-level object/array for consistent coloring
  // Group helpers removed in compact mode

  // Color grouping removed in compact mode

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

  const handleFieldHover = (fieldName: string) => {
    console.log('ExtractedFieldsDisplay: hovering field:', fieldName);
    onFieldHover?.(fieldName);
  };

  // Hover helpers for grouped objects/arrays
  const handleGroupHover = (groupPath: string) => {
    onFieldHover?.(`group:${groupPath}`);
  };
  const handleGroupLeave = () => onFieldHover?.(null);

  const handleFieldLeave = (path?: string) => {
    if (pinnedPath && path === pinnedPath) return;
    onFieldHover?.(null);
  };

  // BBox conversion helper removed; image overlay handles visualization

  // Popup rendering removed in compact mode

  // Compact tree-style renderer for extracted data
  const getGroundedInfo = (path: string) => {
    const gf = grounded_fields?.find((g: any) => g.field_name === path);
    if (!gf) return null;
    return {
      confidence: gf.confidence as number,
      regions: (gf.bounding_boxes?.length || 0) as number,
      hasReasoning: !!gf.reasoning,
      reasoning: gf.reasoning as string | undefined
    };
  };

  // Aggregate info for array containers: average confidence across children and total regions
  const getArrayAggregate = (path: string) => {
    const children = (grounded_fields || []).filter((g: any) => typeof g.field_name === 'string' && g.field_name.startsWith(`${path}[`));
    const confidences: number[] = [];
    let totalRegions = 0;
    for (const g of children) {
      const c = Number(g.confidence);
      if (!Number.isNaN(c)) confidences.push(c);
      totalRegions += Array.isArray(g.bounding_boxes) ? g.bounding_boxes.length : 0;
    }
    const avgConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    return { avgConfidence, totalRegions } as { avgConfidence: number | null; totalRegions: number };
  };

  // Try to resolve reasoning for a path with fallbacks to array-level patterns
  const getReasoningForPath = (path: string): string | null => {
    // 1) Exact match
    const exact = grounded_fields?.find((g: any) => g.field_name === path && g.reasoning);
    if (exact?.reasoning) return exact.reasoning as string;

    // 2) Array index → array[] field type (e.g., items[0].sku → items[].sku)
    if (path.includes("[")) {
      const replaced = path.replace(/\[[^\]]*\]/, "[]");
      const typed = grounded_fields?.find((g: any) => g.field_name === replaced && g.reasoning);
      if (typed?.reasoning) return typed.reasoning as string;

      // 3) Primitive array element → array container (e.g., tags[0] → tags)
      const baseArray = path.split("[")[0];
      const base = grounded_fields?.find((g: any) => g.field_name === baseArray && g.reasoning);
      if (base?.reasoning) return base.reasoning as string;
    }

    // 4) Object field container (e.g., items → has reasoning-only GF)
    const container = grounded_fields?.find((g: any) => g.field_name === path && g.reasoning && !("value" in g));
    if (container?.reasoning) return container.reasoning as string;

    return null;
  };

  const toggleCollapse = (path: string) => {
    const next = new Set(collapsedPaths);
    if (next.has(path)) next.delete(path); else next.add(path);
    setCollapsedPaths(next);
  };

  const Row = ({
    path,
    label,
    value,
    depth,
    isContainer,
  }: { path: string; label: string; value: any; depth: number; isContainer: boolean; }) => {
    const grounded = getGroundedInfo(path);
    const indent = { marginLeft: depth * 12 };
    const isCollapsed = collapsedPaths.has(path);
    const type = Array.isArray(value) ? 'array' : (value !== null && typeof value === 'object' ? 'object' : typeof value);
    const valuePreview = !isContainer ? String(value) : (Array.isArray(value) ? `[${(value as any[]).length}]` : `{${Object.keys(value || {}).length}}`);
    const reasoningText = getReasoningForPath(path);
    const arrayAgg = Array.isArray(value) ? getArrayAggregate(path) : null;

    return (
      <div
        className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/40"
        style={indent}
        onMouseEnter={() => {
          if (isContainer) {
            handleGroupHover(path);
          } else {
            handleFieldHover(path);
          }
        }}
        onMouseLeave={() => handleFieldLeave(path)}
        onClick={() => {
          setPinnedPath(prev => {
            const next = prev === path ? null : path;
            onFieldHover?.(next);
            return next;
          });
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isContainer ? (
            <button
              className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => toggleCollapse(path)}
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          ) : (
            <span className="h-5 w-5" />
          )}
          <span className="text-xs font-mono text-foreground truncate max-w-[200px]" title={label}>{label}</span>
          <Badge variant="outline" className="text-[10px] px-1 py-0 capitalize">{type}</Badge>
          {!isContainer && (
            <span className="text-xs text-muted-foreground truncate max-w-[240px]" title={valuePreview}>= {valuePreview}</span>
          )}
          {reasoningText && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  aria-label="Show reasoning"
                >
                  <Brain className="h-3 w-3 text-purple-600" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs whitespace-pre-wrap break-words">
                <p className="text-[11px] leading-snug">{reasoningText}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {grounded && (
            <>
              <Badge variant="secondary" className="text-[10px] px-1 py-0">{Math.round(grounded.confidence * 100)}%</Badge>
              <Badge variant="outline" className="text-[10px] px-1 py-0">{grounded.regions} region{grounded.regions !== 1 ? 's' : ''}</Badge>
            </>
          )}
          {!grounded && Array.isArray(value) && arrayAgg && (arrayAgg.avgConfidence !== null || arrayAgg.totalRegions > 0) && (
            <>
              {arrayAgg.avgConfidence !== null && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">{Math.round(arrayAgg.avgConfidence * 100)}%</Badge>
              )}
              <Badge variant="outline" className="text-[10px] px-1 py-0">{arrayAgg.totalRegions} region{arrayAgg.totalRegions !== 1 ? 's' : ''}</Badge>
            </>
          )}
          {!isContainer && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => copyToClipboard(String(value))}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Copy value</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const renderTree = (path: string, value: any, depth: number): JSX.Element => {
    if (value === null || value === undefined) {
      return (
        <div>
          <Row path={path} label={path.split('.').slice(-1)[0] || path} value={value} depth={depth} isContainer={false} />
        </div>
      );
    }
    if (Array.isArray(value)) {
      const label = path.split('.').slice(-1)[0] || path;
      const isCollapsed = collapsedPaths.has(path);
      return (
        <div>
          <Row path={path} label={label} value={value} depth={depth} isContainer={true} />
          {!isCollapsed && (
            <div>
              {value.map((item, idx) => (
                <div key={idx}>
                  <Row path={`${path}[${idx}]`} label={`[${idx}]`} value={item} depth={depth + 1} isContainer={Array.isArray(item) || (item !== null && typeof item === 'object')} />
                  {Array.isArray(item) || (item !== null && typeof item === 'object')
                    ? renderTree(`${path}[${idx}]`, item, depth + 1)
                    : null}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    if (typeof value === 'object') {
      const label = path.split('.').slice(-1)[0] || path;
      const isCollapsed = collapsedPaths.has(path);
      return (
        <div>
          <Row path={path} label={label} value={value} depth={depth} isContainer={true} />
          {!isCollapsed && (
            <div>
              {Object.entries(value).map(([k, v]) => (
                <div key={k}>
                  <Row path={`${path}.${k}`} label={k} value={v} depth={depth + 1} isContainer={Array.isArray(v) || (v !== null && typeof v === 'object')} />
                  {Array.isArray(v) || (v !== null && typeof v === 'object')
                    ? renderTree(`${path}.${k}`, v, depth + 1)
                    : null}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
    // Primitive leaf
    const label = path.split('.').slice(-1)[0] || path;
    return <Row path={path} label={label} value={value} depth={depth} isContainer={false} />;
  };

  const copyAllData = () => {
    const formattedData = Object.entries(extracted_data || {})
      .map(([key, value]) => `${key}: ${formatValue(value)}`)
      .join('\n');
    copyToClipboard(formattedData);
  };

  const downloadExtractedJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(extracted_data ?? {}, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted-data-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to download extracted JSON:', e);
    }
  };

  const copyRawJSON = () => {
    try {
      const raw = JSON.stringify(extracted_data ?? {}, null, 2);
      navigator.clipboard.writeText(raw);
    } catch (e) {
      console.error('Failed to copy raw JSON:', e);
    }
  };

  // Reasoning toggles removed in compact mode

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
            <div 
              key={idx} 
              className="ml-2"
              onMouseEnter={() => onFieldHover?.(`${path}[${idx}]`)}
            >
              <div className="text:[11px] text-muted-foreground">[{idx}]</div>
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
            <div 
              key={k} 
              className="ml-2"
              onMouseEnter={() => onFieldHover?.(`${path}.${k}`)}
            >
              <div className="text-[11px] text-muted-foreground">{k}:</div>
              {renderValueRecursive(`${path}.${k}`, v)}
            </div>
          ))}
        </div>
      );
    }
    // Primitive
    return (
      <p 
        className="text-sm font-medium break-words"
        onMouseEnter={() => onFieldHover?.(path)}
      >
        {String(value)}
      </p>
    );
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
                  {(() => {
                    const imageMeta = structuredResults?.prompts_used?.image_metadata
                      || structuredResults?.prompts_used?.stage1?.image_metadata
                      || structuredResults?.prompts_used?.stage2?.image_metadata;
                    return (structuredResults.timers || structuredResults.llm_model_used || imageMeta);
                  })() && (
                    <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                      {structuredResults.timers && <div>OCR {(structuredResults.timers.ocr_ms/1000).toFixed(2)}s</div>}
                      {structuredResults.timers && <div>LLM {(structuredResults.timers.llm_ms/1000).toFixed(2)}s</div>}
                      {structuredResults.timers && <div>Post {(structuredResults.timers.post_ms/1000).toFixed(2)}s</div>}
                      {structuredResults.llm_model_used && (
                        <div className="col-span-3 text-[10px]">Model: {structuredResults.llm_model_used}</div>
                      )}
                      {(() => {
                        const imageMeta = structuredResults?.prompts_used?.image_metadata
                          || structuredResults?.prompts_used?.stage1?.image_metadata
                          || structuredResults?.prompts_used?.stage2?.image_metadata;
                        return imageMeta ? (
                        <div className="col-span-3 text-[10px]">
                          Img: {imageMeta.width}×{imageMeta.height}
                          {typeof imageMeta.size_bytes === 'number' && (
                            <> · {(imageMeta.size_bytes / 1024).toFixed(1)} KB</>
                          )}
                        </div>
                        ) : null;
                      })()}
                    </div>
                  )}
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

        {/* Extracted Fields - Compact Tree */}
        <Card className="shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Eye className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Extracted Data</CardTitle>
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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={downloadExtractedJSON}
                      className="h-8"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download JSON
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Download raw extracted_data as JSON</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="formatted" className="w-full">
              <TabsList className="mb-2">
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="formatted">
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-1">
                    {Object.entries(extracted_data || {}).map(([key, val]) => (
                      <div key={key}>{renderTree(key, val, 0)}</div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="raw">
                <div className="flex items-center justify-end mb-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" onClick={copyRawJSON} className="h-8">
                        <Copy className="h-4 w-4 mr-1" />
                        Copy JSON
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy raw JSON to clipboard</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="bg-muted rounded-md p-3">
                  <pre className="text-xs whitespace-pre-wrap break-words max-h-[420px] overflow-auto">
                    {JSON.stringify(extracted_data ?? {}, null, 2)}
                  </pre>
                </div>
              </TabsContent>
            </Tabs>
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
