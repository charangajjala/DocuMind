"""Core interfaces and abstract base classes."""

from abc import ABC, abstractmethod
from typing import Any, Dict
from ..models.domain import DocumentOCRResult


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
