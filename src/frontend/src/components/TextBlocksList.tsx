import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { TextBlock } from '@/types/api';
import { cn } from '@/lib/utils';

interface TextBlocksListProps {
  textBlocks: TextBlock[];
  selectedBlockIndex?: number;
  hoveredBlockIndex?: number;
  onBlockSelect?: (index: number) => void;
  onBlockHover?: (index: number | null) => void;
  elementTypes: string[];
  className?: string;
}

export function TextBlocksList({
  textBlocks,
  selectedBlockIndex,
  hoveredBlockIndex,
  onBlockSelect,
  onBlockHover,
  elementTypes,
  className,
}: TextBlocksListProps) {
  // Filter blocks by selected element types
  const filteredBlocks = textBlocks.filter(block => 
    elementTypes.includes(block.element_type)
  );

  const getElementTypeColor = (elementType: string) => {
    const colors = {
      block: 'bg-red-100 text-red-800 border-red-200',
      paragraph: 'bg-blue-100 text-blue-800 border-blue-200',
      line: 'bg-green-100 text-green-800 border-green-200',
      token: 'bg-orange-100 text-orange-800 border-orange-200',
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

  return (
    <div className={cn("h-full", className)}>
      <ScrollArea className="h-full">
        <div className="space-y-2 p-2">
          {filteredBlocks.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No text blocks found for selected element types.
            </div>
          ) : (
            filteredBlocks.map((block, index) => (
              <Card
                key={index}
                className={cn(
                  "cursor-pointer transition-all duration-200 hover:shadow-md",
                  selectedBlockIndex === index && "ring-2 ring-primary shadow-lg",
                  hoveredBlockIndex === index && "shadow-md bg-accent/50"
                )}
                onClick={() => onBlockSelect?.(index)}
                onMouseEnter={() => onBlockHover?.(index)}
                onMouseLeave={() => onBlockHover?.(null)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={getElementTypeColor(block.element_type)}
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
    </div>
  );
}
