import { useState, useRef, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

interface GroundedField {
  field_name: string;
  value: any;
  confidence: number;
  source_text_blocks: number[];
  bounding_boxes: BoundingBox[];
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayDimensions, setDisplayDimensions] = useState({ width: 0, height: 0 });
  const [scaleFactor, setScaleFactor] = useState({ x: 1, y: 1 });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && imageWidth && imageHeight) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const containerWidth = containerRect.width;
        const containerHeight = Math.min(containerRect.height || 600, 600);
        
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

  const getFieldColor = (fieldName: string) => {
    const index = groundedFields.findIndex(field => field.field_name === fieldName);
    return COLORS[index % COLORS.length];
  };

  const handleMouseEnter = (fieldName: string) => {
    onFieldHover?.(fieldName);
  };

  const handleMouseLeave = () => {
    onFieldHover?.(null);
  };

  return (
    <TooltipProvider>
      <div ref={containerRef} className="relative w-full h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
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
              alt="Document with annotations"
              className="w-full h-full object-contain"
              style={{ 
                width: displayDimensions.width, 
                height: displayDimensions.height 
              }}
            />
            
            {/* Bounding boxes overlay */}
            {groundedFields.map((field) => {
              const color = getFieldColor(field.field_name);
              const isHovered = hoveredField === field.field_name;
              const opacity = hoveredField ? (isHovered ? 1 : 0.3) : 0.8;
              
              return field.bounding_boxes.map((bbox, bboxIndex) => {
                // Scale bounding box coordinates to display size
                const x = bbox.x_min * scaleFactor.x;
                const y = bbox.y_min * scaleFactor.y;
                const width = (bbox.x_max - bbox.x_min) * scaleFactor.x;
                const height = (bbox.y_max - bbox.y_min) * scaleFactor.y;

                return (
                  <Tooltip key={`${field.field_name}-${bboxIndex}`}>
                    <TooltipTrigger asChild>
                      <div
                        className="absolute border-2 cursor-pointer transition-all duration-200 hover:shadow-lg"
                        style={{
                          left: x,
                          top: y,
                          width: width,
                          height: height,
                          borderColor: color,
                          backgroundColor: `${color}20`,
                          opacity: opacity,
                          zIndex: isHovered ? 20 : 10,
                          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
                        }}
                        onMouseEnter={() => handleMouseEnter(field.field_name)}
                        onMouseLeave={handleMouseLeave}
                      >
                        {/* Field label */}
                        <div
                          className="absolute -top-6 left-0 px-2 py-1 text-xs font-medium text-white rounded shadow-lg"
                          style={{ backgroundColor: color }}
                        >
                          {field.field_name}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">{field.field_name}</div>
                        <div className="text-sm">{String(field.value)}</div>
                        <div className="text-xs text-muted-foreground">
                          Confidence: {(field.confidence * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Position: ({bbox.x_min}, {bbox.y_min}) to ({bbox.x_max}, {bbox.y_max})
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              });
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
