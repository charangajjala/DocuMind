import { useState, useRef, useEffect, useCallback } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

import type { GroundedField } from '@/types/extraction';

interface ImageWithBoundingBoxesProps {
  imageSrc: string;
  groundedFields: GroundedField[];
  imageWidth?: number;
  imageHeight?: number;
  onFieldHover?: (fieldName: string | null) => void;
  hoveredField?: string | null;
}

const COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

export function ImageWithBoundingBoxes({ 
  imageSrc, 
  groundedFields,
  imageWidth,
  imageHeight, 
  onFieldHover,
  hoveredField
}: ImageWithBoundingBoxesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Core state
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredFieldInternal, setHoveredFieldInternal] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [scrollStart, setScrollStart] = useState({ x: 0, y: 0 });

  // Calculate base scale to fit image nicely in available scroll container space
  const availableWidth = scrollContainerRef.current?.clientWidth ?? (imageWidth ?? 800);
  const availableHeight = scrollContainerRef.current?.clientHeight ?? (imageHeight ?? 600);
  // Fit-to-view: never upscale by default. Clamp at 1 so "100%" = natural size.
  const baseScale = imageNaturalSize.width > 0
    ? Math.min(
        (availableWidth - 32) / imageNaturalSize.width,
        (availableHeight - 32) / imageNaturalSize.height,
        1
      )
    : 1;

  // Calculate actual display dimensions with base scale
  const displayWidth = imageNaturalSize.width * baseScale * zoomLevel;
  const displayHeight = imageNaturalSize.height * baseScale * zoomLevel;

  // Group colors by top-level object/array path to keep related fields visually consistent
  const normalizeGroupKey = useCallback((fieldName: string) => {
    // Remove array indexes and take the first segment before a dot
    const cleaned = fieldName.replace(/\[[^\]]*\]/g, '');
    return cleaned.split('.')[0] || cleaned;
  }, []);

  const groupKeyToColor = useRef<Record<string, string>>({});

  const getFieldColor = useCallback((fieldName: string) => {
    const key = normalizeGroupKey(fieldName);
    if (!groupKeyToColor.current[key]) {
      const assignedIndex = Object.keys(groupKeyToColor.current).length;
      groupKeyToColor.current[key] = COLORS[assignedIndex % COLORS.length];
    }
    return groupKeyToColor.current[key];
  }, [normalizeGroupKey]);

  const hexToRgba = (hex: string, alpha: number) => {
    // Expect #RRGGBB
    const cleaned = hex.replace('#', '');
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const pathsMatch = (target: string, hover: string | null): boolean => {
    if (!hover) return false;
    if (hover === target) return true;
    
    // group prefix
    if (hover.startsWith('group:')) {
      const prefix = hover.slice('group:'.length);
      return target.startsWith(prefix);
    }
    
    // Check if hovering array container matches array elements
    if (hover.endsWith('[]') || (!hover.includes('[') && target.includes('['))) {
      const baseHover = hover.replace('[]', '');
      const baseTarget = target.replace(/\[[^\]]*\].*$/, '');
      if (baseHover === baseTarget) return true;
    }
    
    // parent/child containment
    return target.startsWith(hover) || hover.startsWith(target);
  };

  const handleMouseEnter = useCallback((fieldName: string) => {
    setHoveredFieldInternal(fieldName);
    onFieldHover?.(fieldName);
  }, [onFieldHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredFieldInternal(null);
    onFieldHover?.(null);
  }, [onFieldHover]);

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

  // Drag-to-pan controls (no wheel zoom)
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: event.clientX, y: event.clientY });
    if (scrollContainerRef.current) {
      setScrollStart({
        x: scrollContainerRef.current.scrollLeft,
        y: scrollContainerRef.current.scrollTop,
      });
    }
  }, []);

  const handleMouseMoveContainer = useCallback(
    (event: React.MouseEvent) => {
      if (isDragging && scrollContainerRef.current) {
        const dx = event.clientX - dragStart.x;
        const dy = event.clientY - dragStart.y;
        scrollContainerRef.current.scrollLeft = scrollStart.x - dx;
        scrollContainerRef.current.scrollTop = scrollStart.y - dy;
      }
    },
    [isDragging, dragStart, scrollStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle image load (supports both hidden preloader img and visible img)
  const handleImageLoad = useCallback((e?: React.SyntheticEvent<HTMLImageElement>) => {
    if (e && e.currentTarget) {
      setImageNaturalSize({
        width: e.currentTarget.naturalWidth,
        height: e.currentTarget.naturalHeight,
      });
      setImageLoaded(true);
      return;
    }
    const image = imageRef.current;
    if (!image) return;
    setImageNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
    setImageLoaded(true);
  }, []);

  // Fallback: if dimensions are provided from props, initialize display size and
  // mark loaded when the hidden image has already completed loading
  useEffect(() => {
    if (imageWidth && imageHeight) {
      setImageNaturalSize({ width: imageWidth, height: imageHeight });
      const img = imageRef.current;
      if (img && img.complete) {
        setImageLoaded(true);
      }
    }
  }, [imageWidth, imageHeight, imageSrc]);

  // Canvas drawing function (similar to OCR visualization)
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

    // Clear layer (we render the image with an <img> below the canvas)
    ctx.clearRect(0, 0, displayWidth, displayHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Debug: Log image and canvas dimensions
    console.log('Canvas drawing debug:', {
      imageNaturalSize,
      displaySize: { displayWidth, displayHeight },
      baseScale,
      zoomLevel,
      imageProvidedDimensions: { imageWidth, imageHeight }
    });

    // Draw bounding boxes for fields that have them
    groundedFields.forEach((field) => {
      if (!field.bounding_boxes || field.bounding_boxes.length === 0) {
        return; // Skip fields without bounding boxes
      }

      const color = getFieldColor(field.field_name);
      // Match on exact, group, or parent/child path relationships
      const isHovered = pathsMatch(field.field_name, hoveredField) || pathsMatch(field.field_name, hoveredFieldInternal);

      // Debug logging for all fields to understand hover matching
      if (hoveredField || hoveredFieldInternal) {
        console.log('Field matching debug:', {
          field_name: field.field_name,
          hoveredField,
          hoveredFieldInternal,
          isHovered,
          bounding_boxes_count: field.bounding_boxes.length
        });
      }

      field.bounding_boxes.forEach((bbox) => {
        // Convert normalized coordinates to display coordinates
        // Use the actual image natural size for conversion, then scale to display
        const naturalX = bbox.x_min * imageNaturalSize.width;
        const naturalY = bbox.y_min * imageNaturalSize.height;
        const naturalWidth = (bbox.x_max - bbox.x_min) * imageNaturalSize.width;
        const naturalHeight = (bbox.y_max - bbox.y_min) * imageNaturalSize.height;
        
        // Scale to display size
        const scaleX = displayWidth / imageNaturalSize.width;
        const scaleY = displayHeight / imageNaturalSize.height;
        
        const x = naturalX * scaleX;
        const y = naturalY * scaleY;
        const width = naturalWidth * scaleX;
        const height = naturalHeight * scaleY;

        // Debug bbox coordinates for hovered fields
        if (isHovered) {
          console.log('Drawing bbox for hovered field:', {
            field_name: field.field_name,
            bbox_normalized: bbox,
            imageNaturalSize,
            display_dimensions: { displayWidth, displayHeight },
            natural_pixels: { naturalX, naturalY, naturalWidth, naturalHeight },
            scale: { scaleX, scaleY },
            final_pixels: { x, y, width, height }
          });
        }

        // Fill for hovered fields
        if (isHovered) {
          ctx.fillStyle = hexToRgba(color, 0.15);
          ctx.fillRect(x, y, width, height);

          // Hover glow
          ctx.shadowColor = hexToRgba(color, 0.9);
          ctx.shadowBlur = 12;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
          ctx.shadowBlur = 0; // Reset shadow
        }

        // Border with enhanced visibility
        ctx.setLineDash([]);
        ctx.strokeStyle = hexToRgba(color, isHovered ? 1 : 0.7);
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.setLineDash([]);
        ctx.strokeRect(x, y, width, height);

        // Don't draw field labels on canvas - we have the popup for that
      });
    });
  }, [displayWidth, displayHeight, groundedFields, hoveredField, hoveredFieldInternal, imageLoaded, getFieldColor]);

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

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    // Find hovered field
    let foundField: string | null = null;

    for (const field of groundedFields) {
      if (!field.bounding_boxes || field.bounding_boxes.length === 0) continue;

      for (const bbox of field.bounding_boxes) {
        if (
          coords.x >= bbox.x_min && coords.x <= bbox.x_max &&
          coords.y >= bbox.y_min && coords.y <= bbox.y_max
        ) {
          foundField = field.field_name;
          break;
        }
      }
      if (foundField) break;
    }

    if (foundField !== hoveredFieldInternal) {
      if (foundField) {
        handleMouseEnter(foundField);
      } else {
        handleMouseLeave();
      }
    }
  }, [groundedFields, getCanvasCoordinates, hoveredFieldInternal, handleMouseEnter, handleMouseLeave]);

  const handleCanvasClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    // Find clicked field for additional interactions if needed
    for (const field of groundedFields) {
      if (!field.bounding_boxes || field.bounding_boxes.length === 0) continue;

      for (const bbox of field.bounding_boxes) {
        if (
          coords.x >= bbox.x_min && coords.x <= bbox.x_max &&
          coords.y >= bbox.y_min && coords.y <= bbox.y_max
        ) {
          console.log('Clicked field:', field.field_name, 'Value:', field.value);
          return;
        }
      }
    }
  }, [groundedFields, getCanvasCoordinates]);

  // Redraw canvas when dependencies change
  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  // Get popup position: attach near bbox with side-aware placement and connector
  const getPopupPosition = () => {
    // Prefer internal hover (from canvas), but fall back to external hover (from sidebar)
    const activeFieldName = hoveredFieldInternal || hoveredField || null;
    const hoveredFieldData = activeFieldName
      ? groundedFields.find(f => f.field_name === activeFieldName)
      : null;
    if (!hoveredFieldData || !hoveredFieldData.bounding_boxes?.[0]) return null;

    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Use the largest bounding box for popup positioning (most visible one)
    const bbox = hoveredFieldData.bounding_boxes.reduce((largest, current) => {
      const currentArea = (current.x_max - current.x_min) * (current.y_max - current.y_min);
      const largestArea = (largest.x_max - largest.x_min) * (largest.y_max - largest.y_min);
      return currentArea > largestArea ? current : largest;
    });
    // Convert bbox to pixels
    const bx = bbox.x_min * displayWidth;
    const by = bbox.y_min * displayHeight;
    const bw = (bbox.x_max - bbox.x_min) * displayWidth;
    const bh = (bbox.y_max - bbox.y_min) * displayHeight;

    const gap = 10;
    const popupWidth = 220;
    const popupHeight = 110;

    // Try right of bbox
    let side: 'right' | 'left' | 'below' | 'above' = 'right';
    let left = bx + bw + gap;
    let top = by + bh / 2 - popupHeight / 2;

    // If off right edge → left
    if (left + popupWidth > displayWidth - 8) {
      side = 'left';
      left = bx - popupWidth - gap;
      top = by + bh / 2 - popupHeight / 2;
    }
    // If off left edge → below
    if (left < 8) {
      side = 'below';
      left = bx + bw / 2 - popupWidth / 2;
      top = by + bh + gap;
    }
    // If off bottom → above
    if (top + popupHeight > displayHeight - 8) {
      if (side === 'below') {
        side = 'above';
        left = bx + bw / 2 - popupWidth / 2;
        top = by - popupHeight - gap;
      }
    }

    // Clamp within viewport
    left = Math.min(Math.max(8, left), displayWidth - popupWidth - 8);
    top = Math.min(Math.max(8, top), displayHeight - popupHeight - 8);

    // Anchor point on bbox for connector line
    const anchorX = bx + (side === 'right' ? bw : side === 'left' ? 0 : bw / 2);
    const anchorY = by + (side === 'below' ? bh : side === 'above' ? 0 : bh / 2);

    return { left, top, anchorX, anchorY, side, popupWidth, popupHeight } as const;
  };

  const popupPosition = getPopupPosition();
  const activeFieldName = hoveredFieldInternal || hoveredField || null;
  const hoveredFieldData = activeFieldName
    ? groundedFields.find(f => f.field_name === activeFieldName)
    : null;

  return (
    <TooltipProvider>
      <div className="relative w-full h-full flex flex-col">
        {/* Zoom Controls */}
        <div className="absolute top-4 right-4 z-30 flex gap-1 bg-black/80 backdrop-blur-sm rounded-lg p-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetZoom}
            className="h-8 w-8 p-0 text-white hover:bg-white/20"
            title="Reset Zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom Level Indicator */}
        <div className="absolute top-4 left-4 z-30 bg-black/80 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-lg">
          {Math.round(zoomLevel * 100)}%
        </div>

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 rounded-lg touch-pan-x touch-pan-y overscroll-contain select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMoveContainer}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab', WebkitOverflowScrolling: 'touch' }}
        >
          <div ref={containerRef} className="p-4" style={{ width: displayWidth + 32, height: displayHeight + 32 }}>
            {/* Hidden preloader to ensure onLoad fires even before we know sizes */}
            {imageSrc && (
              <img
                src={imageSrc}
                alt="preload"
                onLoad={handleImageLoad}
                style={{ display: 'none' }}
              />
            )}

            {displayWidth > 0 && imageLoaded && (
              <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
                {/* Image layer (visible) */}
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="Document for field analysis"
                  onLoad={handleImageLoad}
                  draggable={false}
                  className="absolute top-0 left-0 select-none pointer-events-none rounded-lg shadow-lg"
                  style={{ width: displayWidth, height: displayHeight }}
                />
                
                {/* Canvas overlay layer */}
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseLeave={() => {
                    handleMouseLeave();
                  }}
                  className="absolute top-0 left-0 rounded-lg"
                  style={{
                    width: displayWidth,
                    height: displayHeight,
                    imageRendering: zoomLevel > 2 ? 'pixelated' : 'auto',
                    pointerEvents: isDragging ? 'none' : 'auto',
                  }}
                />

                {/* Popup overlay - positioned absolute relative to canvas */}
                {activeFieldName && popupPosition && hoveredFieldData && (
                  <div
                    className="absolute z-50 pointer-events-auto"
                    style={{ left: `${popupPosition.left}px`, top: `${popupPosition.top}px` }}
                  >
                    {/* Connector line from bbox to popup */}
                    <svg className="absolute pointer-events-none" width={popupPosition.popupWidth + 20} height={popupPosition.popupHeight + 20} style={{ left: -10, top: -10 }}>
                      <line
                        x1={popupPosition.anchorX - popupPosition.left}
                        y1={popupPosition.anchorY - popupPosition.top}
                        x2={popupPosition.side === 'right' ? 0 : popupPosition.side === 'left' ? popupPosition.popupWidth : popupPosition.popupWidth / 2}
                        y2={popupPosition.side === 'below' ? 0 : popupPosition.side === 'above' ? popupPosition.popupHeight : popupPosition.popupHeight / 2}
                        stroke="rgba(255,255,255,0.7)"
                        strokeWidth={1.5}
                      />
                    </svg>

                    <Card className="p-1 shadow-2xl border-0 w-56 bg-black/60 dark:bg-black/70 backdrop-blur-2xl rounded-xl ring-1 ring-white/30 dark:ring-white/20"
                          style={{ borderLeft: `2px solid ${getFieldColor(hoveredFieldData.field_name)}` }}>
                  <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0.5 font-bold rounded-full bg-white/90 dark:bg-white/80 text-black backdrop-blur-sm"
                          >
                            {hoveredFieldData.field_name.toUpperCase()}
                          </Badge>
                          <span className="text-[9px] text-white font-bold bg-white/20 px-1 py-0.5 rounded-full">
                            {Math.round(hoveredFieldData.confidence * 100)}%
                          </span>
                        </div>

                        <div className="text-[10px] text-white leading-tight max-h-12 overflow-y-auto font-medium bg-white/10 p-1 rounded backdrop-blur-sm">
                          {String(hoveredFieldData.value) || 'No value detected'}
                        </div>

                        {/* Field mapping info */}
                        <div className="text-[8px] text-white/80 font-medium text-center">
                          {hoveredFieldData.bounding_boxes?.length || 0} region{(hoveredFieldData.bounding_boxes?.length || 0) !== 1 ? 's' : ''} mapped
                        </div>

                        {/* Reasoning snippet */}
                        {hoveredFieldData.reasoning && (
                          <div className="text-[9px] text-white/90 bg-white/10 p-1 rounded mt-1 max-h-24 overflow-y-auto overscroll-contain pointer-events-auto">
                            {hoveredFieldData.reasoning}
                          </div>
                        )}
                      </div>
                    </Card>
                    {/* Side arrow indicator */}
                    <div
                      className="absolute"
                      style={{
                        width: 10,
                        height: 10,
                        background: 'rgba(0,0,0,0.6)',
                        transform: 'rotate(45deg)',
                        left: popupPosition.side === 'right' ? -5 : popupPosition.side === 'left' ? undefined : '50%',
                        right: popupPosition.side === 'left' ? -5 : undefined,
                        top: popupPosition.side === 'below' || popupPosition.side === 'above' ? (popupPosition.popupHeight / 2 - 5) : '50%',
                        marginTop: popupPosition.side === 'right' || popupPosition.side === 'left' ? -5 : 0,
                        marginLeft: popupPosition.side === 'right' ? 0 : popupPosition.side === 'left' ? 0 : -5,
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {!imageLoaded && (
              <div className="flex items-center justify-center h-96 bg-muted/50 rounded-lg">
                <div className="text-center space-y-2">
                  <div className="text-muted-foreground">Loading document preview...</div>
                  <div className="text-xs text-muted-foreground">
                    Processing field mapping...
                  </div>
                  {imageSrc ? (
                    <div className="text-xs text-muted-foreground">Waiting for image to load…</div>
                  ) : (
                    <div className="text-xs text-red-500">No image available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Visual mapping status indicator */}
        {groundedFields.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-lg shadow-lg">
            <div className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: '#4ECDC4' }}
              />
              <span className="font-medium">
                {groundedFields.filter(field => field.bounding_boxes && field.bounding_boxes.length > 0).length} of{' '}
                {groundedFields.length} fields visually mapped
              </span>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
