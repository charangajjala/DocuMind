import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  className?: string;
  disabled?: boolean;
}

export function FileUpload({ onFileSelect, className, disabled = false }: FileUploadProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.tiff'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative group border-2 border-dashed rounded-xl transition-all duration-300 cursor-pointer overflow-hidden",
        isDragActive
          ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 scale-[1.02]"
          : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gradient-to-br hover:from-gray-50 hover:to-blue-50/30 dark:hover:from-gray-900/50 dark:hover:to-blue-950/20",
        disabled && "opacity-50 cursor-not-allowed hover:scale-100",
        className
      )}
    >
      <input {...getInputProps()} />
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(59,130,246,0.3)_1px,transparent_0)] bg-[length:20px_20px]" />
      </div>
      
      {/* Content */}
      <div className="relative p-8 text-center space-y-4">
        {/* Animated Icon */}
        <div className="mx-auto relative">
          {isDragActive ? (
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center transform rotate-3 animate-pulse shadow-lg">
              <Upload className="h-8 w-8 text-white animate-bounce" />
            </div>
          ) : (
            <div className="w-16 h-16 mx-auto bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 rounded-2xl flex items-center justify-center group-hover:from-blue-100 group-hover:to-indigo-100 dark:group-hover:from-blue-900/30 dark:group-hover:to-indigo-900/30 transition-all duration-300 group-hover:scale-110 group-hover:-rotate-3">
              <div className="relative">
                <FileText className="h-7 w-7 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Sparkles className="h-2 w-2 text-white" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isDragActive ? 'Drop your document here' : 'Upload Document'}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isDragActive ? (
              'Release to upload your file'
            ) : (
              <>
                Drag & drop your document or{' '}
                <span className="text-blue-600 dark:text-blue-400 font-medium">browse files</span>
              </>
            )}
          </p>
        </div>

        {/* Supported Formats */}
        <div className="flex items-center justify-center space-x-4 pt-2">
          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
            <Image className="h-3 w-3" />
            <span>PNG, JPG, TIFF</span>
          </div>
          <div className="w-1 h-1 bg-gray-300 rounded-full" />
          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
            <FileText className="h-3 w-3" />
            <span>PDF</span>
          </div>
        </div>

        {/* Action Button for Mobile */}
        <div className="pt-2 sm:hidden">
          <Button 
            type="button" 
            variant="outline" 
            size="sm"
            className="w-full"
            disabled={disabled}
          >
            <Upload className="h-4 w-4 mr-2" />
            Choose File
          </Button>
        </div>
      </div>
      
      {/* Glow Effect on Hover */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600/10 to-indigo-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  );
}
