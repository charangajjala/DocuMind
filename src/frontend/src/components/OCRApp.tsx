import { useState, useCallback } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { DocumentVisualization } from '@/components/DocumentVisualization';
import { TextBlocksList } from '@/components/TextBlocksList';
import { ImageMetadata } from '@/components/ImageMetadata';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ApiService } from '@/services/api';
import type { OCRResponse } from '@/types/api';
import { 
  Loader2, 
  FileText, 
  Eye, 
  BarChart3, 
  AlertCircle, 
  CheckCircle2,
  ScanText,
  Brain,
  Layers
} from 'lucide-react';

export function OCRApp() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [ocrResults, setOcrResults] = useState<OCRResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | undefined>();
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | undefined>();
  const [selectedElementTypes, setSelectedElementTypes] = useState<string[]>([
    'block', 'paragraph', 'line'
  ]);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setError('');
    setOcrResults(null);
    setSelectedBlockIndex(undefined);
    setHoveredBlockIndex(undefined);

    // Create image URL for preview
    const url = URL.createObjectURL(file);
    setImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, []);

  const handleProcessDocument = useCallback(async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setError('');

    try {
      const response = await ApiService.uploadFile(selectedFile, 0.8);
      setOcrResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process document');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile]);

  const handleElementTypeToggle = (elementType: string) => {
    setSelectedElementTypes(prev => 
      prev.includes(elementType)
        ? prev.filter(type => type !== elementType)
        : [...prev, elementType]
    );
  };

  const filteredTextBlocks = ocrResults?.text_blocks.filter(block =>
    selectedElementTypes.includes(block.element_type)
  ) || [];

  const getElementTypeStats = () => {
    if (!ocrResults) return {};
    
    const stats: Record<string, number> = {};
    ocrResults.text_blocks.forEach(block => {
      stats[block.element_type] = (stats[block.element_type] || 0) + 1;
    });
    return stats;
  };

  const getConfidenceStats = () => {
    if (!filteredTextBlocks.length) return { excellent: 0, good: 0, fair: 0, poor: 0 };
    
    return filteredTextBlocks.reduce((acc, block) => {
      if (block.confidence >= 0.9) acc.excellent++;
      else if (block.confidence >= 0.8) acc.good++;
      else if (block.confidence >= 0.7) acc.fair++;
      else acc.poor++;
      return acc;
    }, { excellent: 0, good: 0, fair: 0, poor: 0 });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* Header with Theme Toggle */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex-1" />
          <ModeToggle />
        </div>
        
        {/* Modern Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="relative">
              <ScanText className="h-10 w-10 text-primary" />
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-primary/20 rounded-full animate-pulse" />
            </div>
            <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Document OCR
            </h1>
          </div>
          <p className="text-muted-foreground text-xl max-w-2xl mx-auto">
            Transform any document into searchable, editable text using advanced AI-powered OCR technology
          </p>
          <div className="flex items-center justify-center gap-6 mt-6">
            <Badge variant="secondary" className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Google Document AI
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              High Accuracy
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Multi-format Support
            </Badge>
          </div>
        </div>

        {/* Enhanced File Upload Section */}
        {!selectedFile && (
          <Card className="mb-8 border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                <FileText className="h-6 w-6 text-primary" />
                Upload Your Document
              </CardTitle>
              <CardDescription className="text-base">
                Support for PNG, JPG, JPEG, TIFF, and PDF files up to 40MB
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload onFileSelect={handleFileSelect} />
              <Separator className="my-6" />
              <div className="text-center text-sm text-muted-foreground">
                <p>🔒 Your documents are processed securely and not stored permanently</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processing Section */}
        {selectedFile && !ocrResults && (
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">Selected File</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFile(null);
                      setImageUrl('');
                    }}
                  >
                    Change File
                  </Button>
                  <Button
                    onClick={handleProcessDocument}
                    disabled={isProcessing}
                  >
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isProcessing ? 'Processing...' : 'Process Document'}
                  </Button>
                </div>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={undefined} className="w-full" />
                  <p className="text-sm text-muted-foreground text-center">
                    Analyzing document with Google Document AI...
                  </p>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Results Section */}
        {ocrResults && (
          <div className="space-y-6">
            {/* Image Metadata */}
            <ImageMetadata 
              originalImageInfo={ocrResults.original_image_info}
              className="border-primary/20"
            />

            {/* Element Type Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Display Filters
                </CardTitle>
                <CardDescription>
                  Select which element types to display in the visualization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['block', 'paragraph', 'line', 'token'].map(elementType => {
                    const count = getElementTypeStats()[elementType] || 0;
                    const isSelected = selectedElementTypes.includes(elementType);
                    
                    return (
                      <Badge
                        key={elementType}
                        variant={isSelected ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => handleElementTypeToggle(elementType)}
                      >
                        {elementType.toUpperCase()} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Analysis Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{filteredTextBlocks.length}</div>
                    <div className="text-sm text-muted-foreground">Total Elements</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      {filteredTextBlocks.length > 0 
                        ? Math.round(filteredTextBlocks.reduce((sum, block) => sum + block.confidence, 0) / filteredTextBlocks.length * 100)
                        : 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">Avg Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{getConfidenceStats().excellent}</div>
                    <div className="text-sm text-muted-foreground">High Confidence</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{ocrResults.processing_time.toFixed(2)}s</div>
                    <div className="text-sm text-muted-foreground">Processing Time</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Main Content */}
            <Tabs defaultValue="visualization" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="visualization">🎯 Visualization</TabsTrigger>
                <TabsTrigger value="results">📊 Results</TabsTrigger>
                <TabsTrigger value="quality">🔍 Quality</TabsTrigger>
              </TabsList>

              <TabsContent value="visualization" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
                  {/* Document Visualization - Takes 2 columns */}
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>Document Visualization</CardTitle>
                      <CardDescription>
                        Click on text blocks to select them, hover for preview
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DocumentVisualization
                        imageUrl={imageUrl}
                        textBlocks={filteredTextBlocks}
                        selectedBlockIndex={selectedBlockIndex}
                        hoveredBlockIndex={hoveredBlockIndex}
                        onBlockSelect={setSelectedBlockIndex}
                        onBlockHover={(index) => setHoveredBlockIndex(index ?? undefined)}
                        elementTypes={selectedElementTypes}
                      />
                    </CardContent>
                  </Card>

                  {/* Text Blocks List - Takes 1 column */}
                  <Card className="lg:col-span-1">
                    <CardHeader>
                      <CardTitle>Extracted Text Elements</CardTitle>
                      <CardDescription>
                        Click any text element to highlight it in the image
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <TextBlocksList
                        textBlocks={filteredTextBlocks}
                        selectedBlockIndex={selectedBlockIndex}
                        hoveredBlockIndex={hoveredBlockIndex}
                        onBlockSelect={setSelectedBlockIndex}
                        onBlockHover={(index) => setHoveredBlockIndex(index ?? undefined)}
                        elementTypes={selectedElementTypes}
                        className="h-[500px]"
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="results">
                <Card>
                  <CardHeader>
                    <CardTitle>Full Extracted Text</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-4 rounded-md max-h-96 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm">
                        {ocrResults.full_text}
                      </pre>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="quality">
                <Card>
                  <CardHeader>
                    <CardTitle>Image Quality Assessment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {ocrResults.image_quality ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm text-muted-foreground">Quality Score</div>
                            <div className="text-2xl font-bold">{ocrResults.image_quality.quality_score}</div>
                          </div>
                          <div>
                            <div className="text-sm text-muted-foreground">Quality Grade</div>
                            <div className="text-2xl font-bold">{ocrResults.image_quality.quality_grade}</div>
                          </div>
                        </div>
                        
                        {ocrResults.image_quality.detected_defects.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Detected Issues</h4>
                            <div className="space-y-2">
                              {ocrResults.image_quality.detected_defects.map((defect, index) => (
                                <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                                  <span className="capitalize">{defect.type}</span>
                                  <Badge variant={defect.confidence > 0.8 ? "destructive" : "secondary"}>
                                    {Math.round(defect.confidence * 100)}%
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No quality assessment available</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
