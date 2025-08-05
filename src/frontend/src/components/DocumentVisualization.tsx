import { useCallback, useState, useRef, useEffect } from 'react';
import type { TextBlock } from '@/types/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface DocumentVisualizationProps {
  imageUrl: string;
  textBlocks: TextBlock[];
  selectedBlockIndex?: number;
  hoveredBlockIndex?: number;
  onBlockSelect?: (index: number) => void;
  onBlockHover?: (index: number | null) => void;
  elementTypes: string[];
  className?: string;
}

export function DocumentVisualization({
  imageUrl,
  textBlocks,
  selectedBlockIndex,
  hoveredBlockIndex,
  onBlockSelect,
  onBlockHover,
  elementTypes,
  className,
}: DocumentVisualizationProps) {
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
  const hoveredBlock = hoveredBlockIndex !== undefined ? hoveredBlockIndex : internalHoveredBlockRef.current;
  const filteredBlocks = textBlocks.filter(block => elementTypes.includes(block.element_type));
  
  // Calculate base scale to fit image nicely in viewport (around 800px wide max)
  const baseScale = imageNaturalSize.width > 0 ? Math.min(800 / imageNaturalSize.width, 1) : 1;
  
  // Calculate actual display dimensions with base scale
  const displayWidth = imageNaturalSize.width * baseScale * zoomLevel;
  const displayHeight = imageNaturalSize.height * baseScale * zoomLevel;

  const getElementTypeColor = (elementType: string) => {
    const colors = {
      block: '#ef4444',
      paragraph: '#3b82f6',
      line: '#10b981',
      token: '#f59e0b',
      word: '#8b5cf6',
    };
    return colors[elementType as keyof typeof colors] || colors.block;
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
      const isSelected = selectedBlockIndex === index;
      const isHovered = hoveredBlock === index;

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

      // Enhanced corner indicators for selected blocks
      if (isSelected) {
        const cornerSize = Math.max(8, 12 / zoomLevel);
        ctx.fillStyle = baseColor;
        // Draw larger, more visible corner markers
        [
          [x - 2, y - 2], [x + width - cornerSize + 2, y - 2],
          [x - 2, y + height - 2], [x + width - cornerSize + 2, y + height - 2]
        ].forEach(([cx, cy], i) => {
          if (i < 2) { // Top corners
            ctx.fillRect(cx, cy, cornerSize, 3);
            ctx.fillRect(cx, cy, 3, cornerSize);
          } else { // Bottom corners
            ctx.fillRect(cx, cy, cornerSize, 3);
            ctx.fillRect(cx, cy - cornerSize + 3, 3, cornerSize);
          }
        });
      }
      
      // Draw connector lines from bbox corners to popup corners for hovered blocks
      if (isHovered && !isSelected && popupPosition) {
        // Calculate popup corners (relative to canvas)
        const popupWidth = 180; // ultra compact
        const popupHeight = 65; // minimal height
        const px = popupPosition.left;
        const py = popupPosition.top;
        // Clamp popup to canvas
        const popupRect = {
          left: px,
          top: py,
          right: px + popupWidth,
          bottom: py + popupHeight
        };
        // Bbox corners
        const bboxCorners = [
          { x: x, y: y }, // top-left
          { x: x + width, y: y }, // top-right
          { x: x, y: y + height }, // bottom-left
          { x: x + width, y: y + height } // bottom-right
        ];
        // Popup corners
        const popupCorners = [
          { x: popupRect.left, y: popupRect.top }, // top-left
          { x: popupRect.right, y: popupRect.top }, // top-right
          { x: popupRect.left, y: popupRect.bottom }, // bottom-left
          { x: popupRect.right, y: popupRect.bottom } // bottom-right
        ];
        // Draw lines from bbox corners to nearest popup corner
        ctx.save();
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 2;
        bboxCorners.forEach((bc, i) => {
          // Find nearest popup corner
          let minDist = Infinity;
          let nearest = popupCorners[0];
          popupCorners.forEach(pc => {
            const dist = Math.hypot(bc.x - pc.x, bc.y - pc.y);
            if (dist < minDist) {
              minDist = dist;
              nearest = pc;
            }
          });
          ctx.beginPath();
          ctx.moveTo(bc.x, bc.y);
          ctx.lineTo(nearest.x, nearest.y);
          ctx.stroke();
        });
        ctx.restore();
      }
    });
  }, [displayWidth, displayHeight, filteredBlocks, selectedBlockIndex, hoveredBlock, imageLoaded, zoomLevel]);

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
    if (!onBlockSelect || isDragging) return;
    
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
        onBlockSelect(i);
        return;
      }
    }
  }, [filteredBlocks, onBlockSelect, getCanvasCoordinates, isDragging]);

  const handleCanvasMouseMove = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(event);
    if (!coords) return;

    // Update mouse position ref instantly
    mousePositionRef.current = { x: coords.canvasX, y: coords.canvasY };

    // Only update hover if we're not receiving external hover
    if (hoveredBlockIndex === undefined) {
      let foundBlock = null;
      // Simple hit test like text element hover - no tolerance needed
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
      // Direct update like text element hover - simple and immediate
      internalHoveredBlockRef.current = foundBlock;
      onBlockHover?.(foundBlock);
    }
  }, [filteredBlocks, hoveredBlockIndex, onBlockHover, getCanvasCoordinates]);

  // Update canvas when dependencies change
  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [drawCanvas]);

  // Get popup position - relative to canvas container
  const getPopupPosition = () => {
    if (hoveredBlock === null || !filteredBlocks[hoveredBlock]) return null;

    const block = filteredBlocks[hoveredBlock];
    const bbox = block.bounding_box;

    if (hoveredBlockIndex !== undefined) {
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
    <Card className={cn("relative", className)}>
      <div ref={containerRef} className="relative">
        {/* Hidden image for loading */}
        <img
          ref={imageRef}
          src={imageUrl}
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
          className="overflow-auto border rounded-lg bg-muted/20"
          style={{ 
            maxHeight: '85vh',
            minHeight: '400px'
          }}
          onWheel={handleWheel}
        >
          {imageLoaded ? (
            <div className="relative inline-block">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={() => {
                  internalHoveredBlockRef.current = null;
                  onBlockHover?.(null);
                }}
                className="cursor-crosshair bg-white"
                style={{
                  imageRendering: zoomLevel > 2 ? 'pixelated' : 'auto',
                }}
              />
              
              {/* Popup overlay - positioned absolute relative to scroll container */}
              {hoveredBlock !== null && popupPosition && (
                <div 
                  className="absolute z-50 pointer-events-none"
                  style={{
                    left: `${popupPosition.left}px`,
                    top: `${popupPosition.top}px`,
                  }}
                >
                  <Card className="p-1 shadow-2xl border-0 w-44 bg-black/40 dark:bg-black/60 backdrop-blur-2xl rounded-xl ring-1 ring-white/30 dark:ring-white/20" 
                        style={{ 
                          borderLeft: `2px solid ${getElementTypeColor(filteredBlocks[hoveredBlock].element_type)}`,
                        }}>
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1">
                        <Badge 
                          variant="secondary" 
                          className="text-[9px] px-1 py-0.5 font-bold rounded-full bg-white/90 dark:bg-white/80 text-black backdrop-blur-sm"
                        >
                          {filteredBlocks[hoveredBlock].element_type.toUpperCase()}
                        </Badge>
                        <span className="text-[9px] text-white font-bold bg-white/20 px-1 py-0.5 rounded-full">
                          {Math.round(filteredBlocks[hoveredBlock].confidence * 100)}%
                        </span>
                      </div>
                      
                      <div className="text-[10px] text-white leading-tight max-h-8 overflow-y-auto font-medium bg-white/10 p-1 rounded backdrop-blur-sm">
                        {filteredBlocks[hoveredBlock].text || 'No text detected'}
                      </div>
                      
                      {/* Block position info */}
                      <div className="text-[8px] text-white/80 font-medium text-center">
                        {hoveredBlock + 1}/{filteredBlocks.length}
                      </div>
                    </div>
                  </Card>
                </div>
              )}
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
          <div className="flex justify-between items-center p-2 text-xs text-muted-foreground bg-muted/30 rounded-b-lg">
            <span>
              {imageNaturalSize.width} × {imageNaturalSize.height} px
            </span>
            <span>
              {filteredBlocks.length} text blocks visible
            </span>
            <span>
              Scale: {Math.round(baseScale * zoomLevel * 100)}% (Base: {Math.round(baseScale * 100)}%)
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
