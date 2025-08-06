import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Eye, FileText } from 'lucide-react';

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
  'paragraph': '#3B82F6', // blue
  'line': '#10B981',      // green
  'word': '#F59E0B',      // amber
  'block': '#8B5CF6',     // purple
  'token': '#EF4444',     // red
  'default': '#6B7280'    // gray
};

export function OCRVisualization({ 
  imageSrc, 
  textBlocks, 
  imageWidth, 
  imageHeight,
  onTextBlockHover,
  hoveredBlock
}: OCRVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });
  const [scaleFactor, setScaleFactor] = useState({ x: 1, y: 1 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && imageWidth && imageHeight) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = Math.min(containerRect.height || 700, 700);
        
        // Calculate scale to fit the container while maintaining aspect ratio
        const scaleX = containerWidth / imageWidth;
        const scaleY = containerHeight / imageHeight;
        const scale = Math.min(scaleX, scaleY);
        
        const displayWidth = imageWidth * scale;
        const displayHeight = imageHeight * scale;
        
        setDisplayDimensions({ width: displayWidth, height: displayHeight });
        setScaleFactor({ x: displayWidth / imageWidth, y: displayHeight / imageHeight });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [imageWidth, imageHeight]);

  const getElementColor = (elementType: string) => {
    return TEXT_ELEMENT_COLORS[elementType as keyof typeof TEXT_ELEMENT_COLORS] || TEXT_ELEMENT_COLORS.default;
  };

  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-100 text-green-800 border-green-300';
    if (confidence >= 0.7) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const handleMouseEnter = (index: number) => {
    onTextBlockHover?.(index);
  };

  const handleMouseLeave = () => {
    onTextBlockHover?.(null);
  };

  const handleTextBlockClick = (index: number) => {
    onTextBlockHover?.(index === hoveredBlock ? null : index);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Element Type Legend */}
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(TEXT_ELEMENT_COLORS).map(([type, color]) => (
            type !== 'default' && (
              <Badge
                key={type}
                variant="outline"
                className="flex items-center space-x-1"
                style={{ borderColor: color }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="capitalize text-xs">{type}</span>
              </Badge>
            )
          ))}
        </div>

        {/* Main Two-Panel Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 h-[700px]">
          {/* Left Panel - Image with Bounding Boxes (2/3 width) */}
          <div className="xl:col-span-2">
            <Card className="border-0 shadow-lg h-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-lg">
                    <Eye className="h-5 w-5 text-blue-600" />
                    <span>Document OCR Analysis</span>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {textBlocks.length} text elements
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-80px)]">
                <div 
                  ref={containerRef} 
                  className="relative w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 overflow-hidden"
                >
                  {displayDimensions.width > 0 && (
                    <div 
                      className="relative"
                      style={{ 
                        width: displayDimensions.width, 
                        height: displayDimensions.height 
                      }}
                    >
                      {/* Image */}
                      <img
                        src={imageSrc}
                        alt="Document with OCR annotations"
                        className="w-full h-full object-contain rounded-lg"
                        style={{ 
                          width: displayDimensions.width, 
                          height: displayDimensions.height 
                        }}
                      />
                      
                      {/* Text block bounding boxes overlay */}
                      {textBlocks.map((block, index) => {
                        const color = getElementColor(block.element_type);
                        const isHovered = hoveredBlock === index;
                        const opacity = hoveredBlock !== null ? (isHovered ? 0.9 : 0.15) : 0.5;
                        
                        // Scale bounding box coordinates to display size
                        const x = block.bounding_box.x_min * scaleFactor.x;
                        const y = block.bounding_box.y_min * scaleFactor.y;
                        const width = (block.bounding_box.x_max - block.bounding_box.x_min) * scaleFactor.x;
                        const height = (block.bounding_box.y_max - block.bounding_box.y_min) * scaleFactor.y;

                        return (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <div
                                className="absolute border-2 cursor-pointer transition-all duration-200"
                                style={{
                                  left: x,
                                  top: y,
                                  width: width,
                                  height: height,
                                  borderColor: color,
                                  backgroundColor: `${color}30`,
                                  opacity: opacity,
                                  zIndex: isHovered ? 20 : 10,
                                  transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                                  boxShadow: isHovered ? `0 4px 12px ${color}40` : 'none',
                                }}
                                onMouseEnter={() => handleMouseEnter(index)}
                                onMouseLeave={handleMouseLeave}
                                onClick={() => handleTextBlockClick(index)}
                              >
                                {/* Element type label - only show on hover */}
                                {isHovered && (
                                  <div
                                    className="absolute -top-7 left-0 px-2 py-1 text-xs font-bold text-white rounded-md shadow-lg whitespace-nowrap z-30"
                                    style={{ backgroundColor: color }}
                                  >
                                    {block.element_type.toUpperCase()} • {(block.confidence * 100).toFixed(0)}%
                                  </div>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-sm bg-black/90 text-white border-0">
                              <div className="space-y-2 p-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-sm capitalize text-white">
                                    {block.element_type} Element #{index + 1}
                                  </span>
                                  <Badge 
                                    variant="secondary" 
                                    className="text-xs bg-white/20 text-white border-0"
                                  >
                                    {(block.confidence * 100).toFixed(1)}%
                                  </Badge>
                                </div>
                                <div className="text-sm max-h-20 overflow-y-auto text-gray-200">
                                  <strong>Text:</strong> {block.text.length > 100 ? 
                                    `${block.text.substring(0, 100)}...` : 
                                    block.text
                                  }
                                </div>
                                <div className="text-xs text-gray-400">
                                  Position: ({block.bounding_box.x_min}, {block.bounding_box.y_min}) → ({block.bounding_box.x_max}, {block.bounding_box.y_max})
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Text Blocks List (1/3 width) */}
          <div className="xl:col-span-1">
            <Card className="border-0 shadow-lg h-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-lg">
                  <FileText className="h-5 w-5 text-purple-600" />
                  <span>Text Elements</span>
                </CardTitle>
                <div className="text-sm text-muted-foreground">
                  Hover over elements to highlight them on the image
                </div>
              </CardHeader>
              <CardContent className="p-0 h-[calc(100%-100px)]">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-2">
                    {textBlocks.map((block, index) => {
                      const color = getElementColor(block.element_type);
                      const isHovered = hoveredBlock === index;
                      const badgeClass = getConfidenceBadgeColor(block.confidence);
                      
                      return (
                        <div
                          key={index}
                          className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
                            isHovered 
                              ? 'shadow-lg scale-[1.02] bg-accent border-accent-foreground/20' 
                              : 'hover:shadow-md hover:bg-accent/50'
                          }`}
                          style={{ 
                            borderLeftColor: color, 
                            borderLeftWidth: '4px',
                            ...(isHovered && { 
                              boxShadow: `0 4px 12px ${color}20, -4px 0 0 ${color}` 
                            })
                          }}
                          onMouseEnter={() => handleMouseEnter(index)}
                          onMouseLeave={handleMouseLeave}
                          onClick={() => handleTextBlockClick(index)}
                        >
                          {/* Header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                              <Badge variant="outline" className="text-xs">
                                {block.element_type.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                #{index + 1}
                              </span>
                            </div>
                            <Badge 
                              variant="outline" 
                              className={`text-xs font-bold ${badgeClass} border-0 px-2`}
                            >
                              {(block.confidence * 100).toFixed(0)}%
                            </Badge>
                          </div>
                          
                          {/* Text content */}
                          <div className="text-sm leading-relaxed mb-2">
                            {block.text.length > 150 ? (
                              <>
                                <span>{block.text.slice(0, 150)}</span>
                                <span className="text-muted-foreground">...</span>
                              </>
                            ) : (
                              block.text
                            )}
                          </div>
                          
                          {/* Footer info */}
                          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                            <span>{block.text.length} chars</span>
                            <span>
                              {(block.bounding_box.x_max - block.bounding_box.x_min).toFixed(0)}×{(block.bounding_box.y_max - block.bounding_box.y_min).toFixed(0)}px
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    
                    {textBlocks.length === 0 && (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium mb-2">No text elements detected</p>
                        <p className="text-sm">
                          Upload and process a document to see OCR results
                        </p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
