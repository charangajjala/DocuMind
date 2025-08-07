import { useCallback, useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ZoomIn, ZoomOut, RotateCcw, Eye, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TextBlock {
  text: string;
  confidence: number;
  element_type: string;
  bounding_box: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
  };
}

interface OCRVisualizationProps {
  imageSrc: string;
  textBlocks: TextBlock[];
  imageWidth?: number;
  imageHeight?: number;
  onTextBlockHover?: (index: number | null) => void;
  hoveredBlock?: number | null;
}

const TEXT_ELEMENT_COLORS = {
  'paragraph': '#3b82f6', // blue
  'line': '#10b981',      // green
  'word': '#f59e0b',      // amber
  'block': '#ef4444',     // red
  'token': '#8b5cf6',     // purple
  'default': '#6b7280'    // gray
};

export function OCRVisualization({ 
  imageSrc, 
  textBlocks, 
  imageWidth, 
  imageHeight,
  onTextBlockHover,
  hoveredBlock
}: OCRVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Core state
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const internalHoveredBlockRef = useRef<number | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const [isDragging] = useState(false);

  // Derived state
  const hoveredBlockIndex = hoveredBlock;
  const hoveredBlockInternal = hoveredBlockIndex !== undefined && hoveredBlockIndex !== null ? hoveredBlockIndex : internalHoveredBlockRef.current;
  const filteredBlocks = textBlocks;

  // Calculate base scale to fit image nicely in viewport (around 800px wide max)
  // Scale calculation based on container size
  const baseScale = imageNaturalSize.width > 0 && containerRef.current ? 
    Math.min(
      (containerRef.current.clientWidth - 100) / imageNaturalSize.width, 
      (containerRef.current.clientHeight - 200) / imageNaturalSize.height,
      1
    ) : 
    imageNaturalSize.width > 0 ? Math.min(600 / imageNaturalSize.width, 1) : 1;

  // Calculate actual display dimensions with base scale
  const displayWidth = imageNaturalSize.width * baseScale * zoomLevel;
  const displayHeight = imageNaturalSize.height * baseScale * zoomLevel;

  const getElementTypeColor = (elementType: string) => {
    return TEXT_ELEMENT_COLORS[elementType as keyof typeof TEXT_ELEMENT_COLORS] || TEXT_ELEMENT_COLORS.default;
  };

  const getElementTypeColorForList = (elementType: string) => {
    const colors = {
      block: 'bg-red-100 text-red-800 border-red-200',
      paragraph: 'bg-blue-100 text-blue-800 border-blue-200',
      line: 'bg-green-100 text-green-800 border-green-200',
      token: 'bg-orange-100 text-orange-800 border-orange-200',
      word: 'bg-purple-100 text-purple-800 border-purple-200',
    };
    return colors[elementType as keyof typeof colors] || colors.block;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-600';
    if (confidence >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.9) return 'High';
    if (confidence >= 0.7) return 'Medium';
    return 'Low';
  };

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev * 1.4, 10));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev / 1.4, 0.1));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({ left: 0, top: 0 });
    }
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setZoomLevel(prev => Math.min(Math.max(prev * delta, 0.1), 10));
  }, []);

  // Drawing function
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match display size
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // Clear and draw image
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, displayWidth, displayHeight);

    // Draw bounding boxes
    filteredBlocks.forEach((block, index) => {
      const bbox = block.bounding_box;
      const isSelected = false; // No selection in this version
      const isHovered = hoveredBlockInternal === index;

      // Convert normalized coordinates to display coordinates
      const x = bbox.x_min * displayWidth;
      const y = bbox.y_min * displayHeight;
      const width = (bbox.x_max - bbox.x_min) * displayWidth;
      const height = (bbox.y_max - bbox.y_min) * displayHeight;

      const baseColor = getElementTypeColor(block.element_type);

      // Fill for selected/hovered with better visual cues
      if (isSelected || isHovered) {
        // Different fill opacity for selected vs hovered
        ctx.fillStyle = baseColor + (isSelected ? '25' : '15');
        ctx.fillRect(x, y, width, height);

        // Add pulsing glow effect for hovered blocks
        if (isHovered && !isSelected) {
          ctx.shadowColor = baseColor;
          ctx.shadowBlur = 8;
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
          ctx.shadowBlur = 0; // Reset shadow
        }
      }

      // Border with enhanced visibility
      ctx.strokeStyle = isSelected ? baseColor : isHovered ? baseColor + 'EE' : baseColor + '99';
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 1.5;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, width, height);
    });
  }, [displayWidth, displayHeight, filteredBlocks, hoveredBlockInternal, imageLoaded, zoomLevel]);

  // Handle image load
  const handleImageLoad = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    setImageNaturalSize({
      width: image.naturalWidth,
      height: image.naturalHeight
    });
    setImageLoaded(true);
  }, []);

  // Canvas interactions
  const getCanvasCoordinates = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert to normalized coordinates (0-1)
    return {
      x: x / displayWidth,
      y: y / displayHeight,
      canvasX: x,
      canvasY: y
    };
  }, [displayWidth, displayHeight]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) return;

    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    // Find clicked block
    for (let i = filteredBlocks.length - 1; i >= 0; i--) {
      const block = filteredBlocks[i];
      const bbox = block.bounding_box;
      if (
        coords.x >= bbox.x_min && coords.x <= bbox.x_max &&
        coords.y >= bbox.y_min && coords.y <= bbox.y_max
      ) {
        onTextBlockHover?.(i);
        return;
      }
    }
  }, [filteredBlocks, getCanvasCoordinates, isDragging, onTextBlockHover]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    // Update mouse position ref instantly
    mousePositionRef.current = { x: coords.canvasX, y: coords.canvasY };

    // Only update hover if we're not receiving external hover
    if (hoveredBlockIndex === undefined || hoveredBlockIndex === null) {
      let foundBlock = null;

      // Simple hit test
      for (let i = filteredBlocks.length - 1; i >= 0; i--) {
        const block = filteredBlocks[i];
        const bbox = block.bounding_box;
        if (
          coords.x >= bbox.x_min && coords.x <= bbox.x_max &&
          coords.y >= bbox.y_min && coords.y <= bbox.y_max
        ) {
          foundBlock = i;
          break;
        }
      }

      // Direct update
      if (internalHoveredBlockRef.current !== foundBlock) {
        internalHoveredBlockRef.current = foundBlock;
        onTextBlockHover?.(foundBlock);
      }
    }
  }, [filteredBlocks, hoveredBlockIndex, onTextBlockHover, getCanvasCoordinates]);

  // Update canvas when dependencies change
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [drawCanvas]);

  // Get popup position - relative to canvas container
  const getPopupPosition = () => {
    if (hoveredBlockInternal === null || !filteredBlocks[hoveredBlockInternal]) return null;

    const block = filteredBlocks[hoveredBlockInternal];
    const bbox = block.bounding_box;

    if (hoveredBlockIndex !== undefined && hoveredBlockIndex !== null) {
      // External hover - position relative to bounding box center on canvas
      const blockCenterX = (bbox.x_min + bbox.x_max) / 2 * displayWidth;
      const blockCenterY = (bbox.y_min + bbox.y_max) / 2 * displayHeight;
      return {
        left: Math.min(blockCenterX + 20, displayWidth - 180),
        top: Math.max(10, blockCenterY - 32),
      };
    } else {
      // Canvas hover - position relative to mouse on canvas (from ref)
      const { x, y } = mousePositionRef.current;
      return {
        left: Math.min(x + 15, displayWidth - 180),
        top: Math.max(10, y - 10),
      };
    }
  };

  const popupPosition = getPopupPosition();

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Element Type Legend */}
      <div className="flex flex-wrap gap-1 justify-center mb-3 flex-shrink-0">
        {Object.entries(TEXT_ELEMENT_COLORS).map(([type, color]) => (
          type !== 'default' && (
            <Badge
              key={type}
              variant="outline"
              className="flex items-center space-x-1 text-xs h-6"
              style={{ borderColor: color }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{type}</span>
            </Badge>
          )
        ))}
      </div>

      {/* Main Two-Panel Layout */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-6">
        {/* Left Panel - Canvas-based Image (2/3 width) */}
        <div className="flex-[2] min-h-[500px]">
          <Card className="border-0 shadow-lg h-full flex flex-col">
            <CardHeader className="pb-2 flex-shrink-0">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-base">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <span>Document OCR Analysis</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {textBlocks.length} elements
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative min-h-0">
              <div ref={containerRef} className="relative h-full">
                {/* Hidden image for loading */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Document for OCR analysis"
                  className="hidden"
                  onLoad={handleImageLoad}
                />

                {/* Controls */}
                <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleZoomIn}
                    className="h-9 w-9 p-0 bg-background/95 backdrop-blur-sm shadow-lg"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleZoomOut}
                    className="h-9 w-9 p-0 bg-background/95 backdrop-blur-sm shadow-lg"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleResetZoom}
                    className="h-9 w-9 p-0 bg-background/95 backdrop-blur-sm shadow-lg"
                    title="Reset zoom"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <div className="text-xs text-center text-muted-foreground bg-background/95 backdrop-blur-sm rounded px-2 py-1 shadow-lg">
                    {Math.round(zoomLevel * 100)}%
                  </div>
                </div>

                {/* Main viewport */}
                <div
                  ref={scrollContainerRef}
                  className="overflow-auto border rounded-lg bg-muted/20 h-full"
                  onWheel={handleWheel}
                >
                  {imageLoaded ? (
                    <div className="p-4 flex justify-center items-center" style={{ width: 'max-content', height: 'max-content', minWidth: '100%', minHeight: '100%' }}>
                      <div className="relative">
                        <canvas
                          ref={canvasRef}
                          onClick={handleCanvasClick}
                          onMouseMove={handleCanvasMouseMove}
                          onMouseLeave={() => {
                            internalHoveredBlockRef.current = null;
                            onTextBlockHover?.(null);
                          }}
                          className="cursor-crosshair bg-white"
                          style={{
                            imageRendering: zoomLevel > 2 ? 'pixelated' : 'auto',
                          }}
                        />

                        {/* Popup overlay - positioned absolute relative to scroll container */}
                        {hoveredBlockInternal !== null && popupPosition && filteredBlocks[hoveredBlockInternal] && (
                          <div
                            className="absolute z-50 pointer-events-none"
                            style={{
                              left: `${popupPosition.left}px`,
                              top: `${popupPosition.top}px`,
                            }}
                          >
                            <Card className="p-1 shadow-2xl border-0 w-44 bg-black/40 dark:bg-black/60 backdrop-blur-2xl rounded-xl ring-1 ring-white/30 dark:ring-white/20"
                                  style={{
                                    borderLeft: `2px solid ${getElementTypeColor(filteredBlocks[hoveredBlockInternal].element_type)}`,
                                  }}>
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between gap-1">
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1 py-0.5 font-bold rounded-full bg-white/90 dark:bg-white/80 text-black backdrop-blur-sm"
                                  >
                                    {filteredBlocks[hoveredBlockInternal].element_type.toUpperCase()}
                                  </Badge>
                                  <span className="text-[9px] text-white font-bold bg-white/20 px-1 py-0.5 rounded-full">
                                    {Math.round(filteredBlocks[hoveredBlockInternal].confidence * 100)}%
                                  </span>
                                </div>

                                <div className="text-[10px] text-white leading-tight max-h-8 overflow-y-auto font-medium bg-white/10 p-1 rounded backdrop-blur-sm">
                                  {filteredBlocks[hoveredBlockInternal].text || 'No text detected'}
                                </div>

                                {/* Block position info */}
                                <div className="text-[8px] text-white/80 font-medium text-center">
                                  {hoveredBlockInternal + 1}/{filteredBlocks.length}
                                </div>
                              </div>
                            </Card>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-96 bg-muted/50 rounded-lg m-4">
                      <div className="text-center space-y-2">
                        <div className="text-muted-foreground">Loading document preview...</div>
                        <div className="text-xs text-muted-foreground">
                          Large images may take a moment to load
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status bar */}
                {imageLoaded && (
                  <div className="absolute bottom-0 left-0 right-0 flex justify-between items-center p-2 text-xs text-muted-foreground bg-muted/30 rounded-b-lg">
                    <span>
                      {imageNaturalSize.width} × {imageNaturalSize.height} px
                    </span>
                    <span>
                      {filteredBlocks.length} text blocks visible
                    </span>
                    <span>
                      Scale: {Math.round(baseScale * zoomLevel * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Text Blocks List (1/3 width) */}
        <div className="flex-[1] min-h-[500px]">
          <Card className="border-0 shadow-lg h-full flex flex-col">
            <CardHeader className="pb-2 flex-shrink-0">
              <CardTitle className="flex items-center space-x-2 text-base">
                <FileText className="h-4 w-4 text-purple-600" />
                <span>Text Elements</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              <ScrollArea className="h-full">
                <div className="space-y-2 p-4">
                  {textBlocks.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No text elements detected</p>
                      <p className="text-sm">
                        Upload and process a document to see OCR results
                      </p>
                    </div>
                  ) : (
                    textBlocks.map((block, index) => (
                      <Card
                        key={index}
                        className={cn(
                          "cursor-pointer transition-all duration-200 hover:shadow-md",
                          hoveredBlock === index && "ring-2 ring-primary shadow-lg bg-accent/50"
                        )}
                        onClick={() => onTextBlockHover?.(index)}
                        onMouseEnter={() => onTextBlockHover?.(index)}
                        onMouseLeave={() => onTextBlockHover?.(null)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={getElementTypeColorForList(block.element_type)}
                              >
                                {block.element_type.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  getConfidenceColor(block.confidence)
                                )}
                              >
                                {getConfidenceLabel(block.confidence)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {Math.round(block.confidence * 100)}%
                              </span>
                            </div>
                          </div>

                          <div className="text-sm leading-relaxed">
                            {block.text.length > 200 ? (
                              <>
                                {block.text.slice(0, 200)}
                                <span className="text-muted-foreground">...</span>
                              </>
                            ) : (
                              block.text
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                            <span>{block.text.length} characters</span>
                            <span>
                              {block.bounding_box.x_min.toFixed(0)},{block.bounding_box.y_min.toFixed(0)} → {block.bounding_box.x_max.toFixed(0)},{block.bounding_box.y_max.toFixed(0)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
