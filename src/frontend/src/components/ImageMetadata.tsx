import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Image as ImageIcon, 
  FileText, 
  Ruler, 
  HardDrive,
  Monitor,
  Info
} from 'lucide-react';

interface ImageMetadataProps {
  originalImageInfo?: {
    width: number;
    height: number;
    format: string;
    mode: string;
    size_bytes: number;
    resolution: [number, number];
  };
  className?: string;
}

export function ImageMetadata({ originalImageInfo, className }: ImageMetadataProps) {
  if (!originalImageInfo) {
    return null;
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getResolutionString = (resolution: [number, number]): string => {
    const [dpiX, dpiY] = resolution;
    if (dpiX === dpiY) {
      return `${dpiX} DPI`;
    }
    return `${dpiX} × ${dpiY} DPI`;
  };

  const megapixels = ((originalImageInfo.width * originalImageInfo.height) / 1000000).toFixed(1);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="h-4 w-4" />
          Original Image Information
        </CardTitle>
        <CardDescription>
          Metadata from the uploaded image file
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Dimensions</span>
            </div>
            <div className="pl-6">
              <div className="text-lg font-mono">
                {originalImageInfo.width.toLocaleString()} × {originalImageInfo.height.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">
                {megapixels} MP
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">File Size</span>
            </div>
            <div className="pl-6">
              <div className="text-lg font-mono">
                {formatFileSize(originalImageInfo.size_bytes)}
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <ImageIcon className="h-3 w-3" />
            {originalImageInfo.format}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {originalImageInfo.mode}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <Monitor className="h-3 w-3" />
            {getResolutionString(originalImageInfo.resolution)}
          </Badge>
        </div>

        <div className="text-xs text-muted-foreground">
          💡 The original image quality is preserved during OCR processing
        </div>
      </CardContent>
    </Card>
  );
}
