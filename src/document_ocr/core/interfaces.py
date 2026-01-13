"""Core interfaces and abstract base classes."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from ..models.domain import DocumentOCRResult, TextBlock


class DocumentProcessor(ABC):
    """Abstract base class for document processing."""
    
    @abstractmethod
    async def process_document(self, image_data: bytes, **kwargs) -> DocumentOCRResult:
        """Process a document image and extract text with bounding boxes.
        
        Args:
            image_data: Raw image bytes
            **kwargs: Additional processing parameters
            
        Returns:
            DocumentOCRResult containing extracted text and metadata
        """
        pass


class ImageProcessor(ABC):
    """Abstract base class for image processing operations."""
    
    @abstractmethod
    def validate_image(self, image_data: bytes) -> bool:
        """Validate if the image data is valid and processable."""
        pass
    
    @abstractmethod
    def get_image_dimensions(self, image_data: bytes) -> tuple[int, int]:
        """Get image width and height."""
        pass
    
    @abstractmethod
    def preprocess_image(self, image_data: bytes) -> bytes:
        """Preprocess image for better OCR results."""
        pass


class ConfigurationProvider(ABC):
    """Abstract base class for configuration management."""
    
    @abstractmethod
    def get_config(self, key: str, default: Any = None) -> Any:
        """Get configuration value by key."""
        pass
    
    @abstractmethod
    def get_all_config(self) -> Dict[str, Any]:
        """Get all configuration values."""
        pass


class OCRService(ABC):
    """Abstract base class for OCR service implementations."""
    
    @abstractmethod
    async def extract_text(self, image_data: bytes, **kwargs) -> DocumentOCRResult:
        """Extract text from image using OCR."""
        pass


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""
    
    @abstractmethod
    async def extract_structured_data(
        self, 
        image_data: bytes, 
        ocr_results: DocumentOCRResult,
        json_schema: Dict[str, Any],
        user_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract structured data based on JSON schema and OCR results."""
        pass
    
    @abstractmethod
    async def validate_extraction(
        self, 
        extracted_data: Dict[str, Any], 
        json_schema: Dict[str, Any]
    ) -> bool:
        """Validate extracted data against JSON schema."""
        pass


class StructuredDataExtractor(ABC):
    """Abstract base class for structured data extraction."""
    
    @abstractmethod
    async def extract_with_visual_grounding(
        self,
        image_data: bytes,
        mime_type: str,
        json_schema: Dict[str, Any],
        user_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract structured data with visual grounding using OCR and LLM."""
        pass


class SchemaValidator(ABC):
    """Abstract base class for schema validation."""
    
    @abstractmethod
    def validate_schema(self, schema: Dict[str, Any]) -> bool:
        """Validate if the provided schema is valid JSON schema."""
        pass
    
    @abstractmethod
    def validate_data_against_schema(
        self, 
        data: Dict[str, Any], 
        schema: Dict[str, Any]
    ) -> bool:
        """Validate data against the provided schema."""
        pass
