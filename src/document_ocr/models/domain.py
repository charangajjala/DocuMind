"""Core domain models for document OCR."""

from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass
from pydantic import BaseModel, model_validator
from enum import Enum


@dataclass
class BoundingBox:
    """Represents a bounding box with normalized coordinates."""
    
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    
    def to_pixel_coordinates(self, image_width: int, image_height: int) -> 'BoundingBox':
        """Convert normalized coordinates to pixel coordinates."""
        return BoundingBox(
            x_min=self.x_min * image_width,
            y_min=self.y_min * image_height,
            x_max=self.x_max * image_width,
            y_max=self.y_max * image_height
        )
    
    def get_center(self) -> Tuple[float, float]:
        """Get the center point of the bounding box."""
        return (
            (self.x_min + self.x_max) / 2,
            (self.y_min + self.y_max) / 2
        )


@dataclass
class TextBlock:
    """Represents a block of extracted text with its location."""
    
    text: str
    confidence: float
    bounding_box: BoundingBox
    element_type: str = "block"  # "block", "paragraph", "line", "token"
    # Preserve the original index from the full OCR list when passing subsets to the LLM
    original_index: Optional[int] = None
    
    def __str__(self) -> str:
        return f"TextBlock(type={self.element_type}, text='{self.text[:50]}...', confidence={self.confidence:.2f})"


@dataclass
class ImageQualityScores:
    """Google Document AI image quality scores."""
    
    # Google's quality score (0.0 to 1.0, where 1.0 indicates perfect readability)
    quality_score: float
    
    # List of detected defects with their confidence values
    detected_defects: List[dict]
    
    # Basic image properties
    width: int
    height: int
    resolution: str
    file_size: int
    format: str
    
    def get_quality_grade(self) -> str:
        """Get quality grade based on Google's quality score."""
        if self.quality_score >= 0.9:
            return "Excellent"
        elif self.quality_score >= 0.75:
            return "Good"
        elif self.quality_score >= 0.6:
            return "Fair"
        elif self.quality_score >= 0.4:
            return "Poor"
        else:
            return "Very Poor"


@dataclass
class DocumentOCRResult:
    """Result of OCR processing on a document."""
    
    full_text: str
    text_blocks: List[TextBlock]
    image_width: int
    image_height: int
    processing_time: float
    image_quality: Optional[ImageQualityScores] = None
    original_image_info: Optional[dict] = None  # Original image metadata
    
    def get_high_confidence_blocks(self, threshold: float = 0.8) -> List[TextBlock]:
        """Get text blocks with confidence above threshold."""
        return [block for block in self.text_blocks if block.confidence >= threshold]


# Pydantic models for API
class OCRRequest(BaseModel):
    """Request model for OCR API."""
    
    image_data: str  # base64 encoded image
    confidence_threshold: float = 0.8
    
    class Config:
        json_schema_extra = {
            "example": {
                "image_data": "base64_encoded_image_string",
                "confidence_threshold": 0.8
            }
        }


class OCRResponse(BaseModel):
    """Response model for OCR API."""
    
    full_text: str
    text_blocks: List[dict]
    image_dimensions: dict
    processing_time: float
    success: bool
    error_message: Optional[str] = None
    image_quality: Optional[dict] = None  # Google's image quality scores
    original_image_info: Optional[dict] = None  # Original image metadata

    
    class Config:
        json_schema_extra = {
            "example": {
                "full_text": "Extracted text from document",
                "text_blocks": [
                    {
                        "text": "Sample text",
                        "confidence": 0.95,
                        "bounding_box": {
                            "x_min": 0.1,
                            "y_min": 0.1,
                            "x_max": 0.5,
                            "y_max": 0.2
                        },
                        "element_type": "paragraph"
                    }
                ],
                "image_dimensions": {"width": 800, "height": 600},
                "processing_time": 1.23,
                "success": True,
                "image_quality": {
                    "quality_score": 0.85,
                    "quality_grade": "Good",
                    "detected_defects": [],
                    "width": 800,
                    "height": 600,
                    "resolution": "800x600",
                    "file_size": 245760,
                    "format": "PNG"
                }
            }
        }


# Enhanced API Models for Structured Extraction

class StructuredExtractionRequest(BaseModel):
    """Request model for structured data extraction API."""
    
    image_data: str  # base64 encoded image
    json_schema: Optional[dict] = None  # JSON schema for extraction
    user_prompt: Optional[str] = None  # Additional user instructions
    document_type: Optional[str] = None  # Document type hint for specialized prompts
    confidence_threshold: float = 0.8
    
    @model_validator(mode='after')
    def validate_schema_or_prompt(self):
        """Ensure at least one of json_schema or user_prompt is provided."""
        if not self.json_schema and not self.user_prompt:
            raise ValueError('Either json_schema or user_prompt must be provided')
        return self
    
    class Config:
        json_schema_extra = {
            "example": {
                "image_data": "base64_encoded_image_string",
                "json_schema": {
                    "type": "object",
                    "properties": {
                        "field_1": {"type": "string"},
                        "field_2": {"type": "string", "format": "date"},
                        "field_3": {"type": "number"}
                    },
                    "required": ["field_1", "field_2", "field_3"]
                },
                "user_prompt": "Focus on the header section for important details",
                "document_type": "document",
                "confidence_threshold": 0.8
            }
        }


class ExtractionSource(str, Enum):
    """Enum for different extraction sources."""
    OCR_GROUNDED = "ocr_grounded"  # LLM and OCR both agree on the field value
    VISUAL_ONLY = "visual_only"   # LLM extracted from visual context, no OCR grounding
    FAILED = "failed"             # Both LLM and OCR failed to extract this field


@dataclass
class EnhancedGroundedDataField:
    """Enhanced grounded data field with detailed extraction information."""
    
    field_name: str
    value: Any
    confidence: float
    extraction_source: ExtractionSource
    source_text_blocks: List[int]  # OCR text block indices (empty if visual_only or failed)
    bounding_boxes: List[BoundingBox]  # Corresponding bounding boxes (empty if failed)
    reasoning: str  # Explanation of extraction decision
    ocr_text_found: Optional[str] = None  # The actual OCR text that was matched (if any)
    visual_description: Optional[str] = None  # Description of visual location/context
    
    @property
    def is_ocr_grounded(self) -> bool:
        """Check if this field has OCR grounding."""
        return self.extraction_source == ExtractionSource.OCR_GROUNDED
    
    @property
    def is_visual_only(self) -> bool:
        """Check if this field was extracted visually only."""
        return self.extraction_source == ExtractionSource.VISUAL_ONLY
    
    @property
    def is_extraction_failed(self) -> bool:
        """Check if extraction failed for this field."""
        return self.extraction_source == ExtractionSource.FAILED
    
    def __str__(self) -> str:
        status = f"[{self.extraction_source.value.upper()}]"
        return f"EnhancedGroundedDataField({status} field='{self.field_name}', value='{self.value}', confidence={self.confidence:.2f})"


@dataclass
class ExtractionStatistics:
    """Statistics about the extraction process."""
    
    total_fields_requested: int
    ocr_grounded_count: int
    visual_only_count: int
    failed_count: int
    average_confidence: float
    ocr_agreement_rate: float  # Percentage of fields where LLM and OCR agreed
    
    @property
    def success_rate(self) -> float:
        """Calculate overall extraction success rate."""
        if self.total_fields_requested == 0:
            return 0.0
        return (self.ocr_grounded_count + self.visual_only_count) / self.total_fields_requested
    
    @property
    def visual_enhancement_rate(self) -> float:
        """Rate at which visual analysis provided value beyond OCR."""
        if self.total_fields_requested == 0:
            return 0.0
        return self.visual_only_count / self.total_fields_requested


@dataclass  
class EnhancedStructuredExtractionResult:
    """Enhanced result of structured data extraction with detailed grounding analysis."""
    
    extracted_data: Dict[str, Any]
    enhanced_grounded_fields: List[EnhancedGroundedDataField]
    json_schema: Dict[str, Any]
    ocr_results: 'DocumentOCRResult'
    processing_time: float
    llm_confidence: float
    schema_validation_passed: bool
    extraction_statistics: ExtractionStatistics
    prompts_used: Dict[str, str]
    errors: List[str]
    raw_llm_response: Optional[str] = None  # Raw response from LLM before post-processing
    
    def get_field_by_name(self, field_name: str) -> Optional[EnhancedGroundedDataField]:
        """Get enhanced grounded field by name."""
        for field in self.enhanced_grounded_fields:
            if field.field_name == field_name:
                return field
        return None
    
    def get_fields_by_source(self, source: ExtractionSource) -> List[EnhancedGroundedDataField]:
        """Get all fields extracted from a specific source."""
        return [field for field in self.enhanced_grounded_fields 
                if field.extraction_source == source]
    
    @property
    def ocr_grounded_fields(self) -> List[EnhancedGroundedDataField]:
        """Get all OCR grounded fields."""
        return self.get_fields_by_source(ExtractionSource.OCR_GROUNDED)
    
    @property
    def visual_only_fields(self) -> List[EnhancedGroundedDataField]:
        """Get all visual-only fields."""
        return self.get_fields_by_source(ExtractionSource.VISUAL_ONLY)
    
    @property
    def failed_fields(self) -> List[EnhancedGroundedDataField]:
        """Get all failed extraction fields."""
        return self.get_fields_by_source(ExtractionSource.FAILED)


# Legacy Models for Backward Compatibility

@dataclass
class GroundedDataField:
    """Legacy grounded data field for backward compatibility."""
    
    field_name: str
    value: Any
    confidence: float
    source_text_blocks: List[int]  # Indices of OCR text blocks that support this field
    bounding_boxes: List[BoundingBox]  # Corresponding bounding boxes
    reasoning: Optional[str] = None  # Explanation of extraction decision
    
    def __str__(self) -> str:
        return f"GroundedDataField(field='{self.field_name}', value='{self.value}', confidence={self.confidence:.2f})"


@dataclass
class StructuredExtractionResult:
    """Legacy result of structured data extraction with visual grounding."""
    
    extracted_data: Dict[str, Any]
    grounded_fields: List[GroundedDataField]
    json_schema: Dict[str, Any]
    ocr_results: DocumentOCRResult
    processing_time: float
    llm_confidence: float
    schema_validation_passed: bool
    prompts_used: Dict[str, str]
    errors: List[str]
    raw_llm_response: Optional[str] = None  # Raw response from LLM before post-processing
    
    def get_field_by_name(self, field_name: str) -> Optional[GroundedDataField]:
        """Get grounded field by name."""
        for field in self.grounded_fields:
            if field.field_name == field_name:
                return field
        return None


class StructuredExtractionResponse(BaseModel):
    """Response model for structured data extraction API."""
    
    success: bool
    extracted_data: dict
    grounded_fields: List[dict]  # Serialized GroundedDataField objects
    ocr_results: OCRResponse
    processing_time: float
    llm_confidence: float
    schema_validation_passed: bool
    prompts_used: Optional[dict] = None
    errors: List[str]
    error_message: Optional[str] = None
    raw_llm_response: Optional[str] = None  # Raw response from LLM before post-processing
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "extracted_data": {
                    "field_1": "VALUE-001",
                    "field_2": "2024-08-06",
                    "field_3": 1250.00,
                    "items": [
                        {"description": "Item A", "quantity": 2, "price": 500.00},
                        {"description": "Item B", "quantity": 1, "price": 250.00}
                    ]
                },
                "grounded_fields": [
                    {
                        "field_name": "field_1",
                        "value": "VALUE-001",
                        "confidence": 0.95,
                        "source_text_blocks": [0, 1],
                        "reasoning": "This field was extracted from the header section of the document. The value 'VALUE-001' matches the expected format and was found in OCR block 0 which contains the complete field value.",
                        "bounding_boxes": [
                            {"x_min": 0.1, "y_min": 0.1, "x_max": 0.3, "y_max": 0.15}
                        ]
                    }
                ],
                "processing_time": 2.34,
                "llm_confidence": 0.89,
                "schema_validation_passed": True,
                "errors": []
            }
        }
