// Shared types for structured extraction across frontend components
import type { BoundingBox } from './api';

// Re-export BoundingBox for convenience
export type { BoundingBox };

export interface GroundedField {
  field_name: string;
  value: any;
  confidence: number;
  source_text_blocks: number[];
  bounding_boxes: BoundingBox[];
  reasoning?: string; // Optional reasoning - supports array-level logic
  extraction_source?: string;
  ocr_text_found?: string;
  visual_description?: string;
}

export interface ExtractionResult {
  success: boolean;
  extracted_data: any;
  grounded_fields: GroundedField[];
  ocr_results: any;
  processing_time: number;
  llm_confidence: number;
  schema_validation_passed: boolean;
  errors: string[];
  error_message?: string;
  raw_llm_response?: string;
}

export interface StructuredExtractionRequest {
  image_data: string; // base64 encoded
  json_schema?: any;
  user_prompt?: string;
  document_type?: string;
  llm_model?: 'gpt-40' | 'gpt-o4-mini' | 'gpt-5-mini' | 'gpt-5-nano';
}
