"""Core domain models for document OCR."""

from typing import List, Optional, Tuple
from dataclasses import dataclass
from pydantic import BaseModel


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
    raw_document_ai_response: Optional[dict] = None  # For debugging
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
    raw_document_ai_response: Optional[dict] = None  # For debugging
    
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
