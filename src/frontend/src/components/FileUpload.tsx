import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  const getIcon = () => {
    if (isDragActive) {
      return <Upload className="h-8 w-8 text-primary" />;
    }
    return <FileText className="h-8 w-8 text-muted-foreground" />;
  };

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-muted-foreground/50",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-4">
        {getIcon()}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {isDragActive
              ? "Drop your document here"
              : "Drag & drop a document, or click to select"}
          </p>
          <p className="text-xs text-muted-foreground">
            Supports PNG, JPG, JPEG, TIFF, and PDF files
          </p>
        </div>
      </div>
    </div>
  );
}
