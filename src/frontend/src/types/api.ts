export interface BoundingBox {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface TextBlock {
  text: string;
  confidence: number;
  element_type: 'block' | 'paragraph' | 'line' | 'token';
  bounding_box: BoundingBox;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageQuality {
  quality_score: number;
  quality_grade: string;
  detected_defects: Array<{
    type: string;
    confidence: number;
  }>;
  recommendations: string[];
  width: number;
  height: number;
  resolution: string;
  file_size: number;
  format: string;
}

export interface OCRResponse {
  full_text: string;
  text_blocks: TextBlock[];
  image_dimensions: ImageDimensions;
  processing_time: number;
  success: boolean;
  image_quality?: ImageQuality;
  original_image_info?: {
    width: number;
    height: number;
    format: string;
    mode: string;
    size_bytes: number;
    resolution: [number, number];
  };
  raw_document_ai_response?: any;
}

export interface OCRRequest {
  image_data: string; // base64 encoded
  confidence_threshold?: number;
}

export interface ApiError {
  detail: string;
}
