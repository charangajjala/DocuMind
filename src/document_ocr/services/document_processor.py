"""Document processor orchestrating the OCR workflow."""

import asyncio
from typing import Optional

from ..core.interfaces import DocumentProcessor
from ..models.domain import DocumentOCRResult
from ..services.google_document_ai import GoogleDocumentAIOCRService
from ..utils.config import EnvironmentConfigProvider
from ..utils.image_processor import PILImageProcessor


class DocumentOCRProcessor(DocumentProcessor):
    """Main document processor that orchestrates the OCR workflow."""
    
    def __init__(
        self,
        ocr_service: Optional[GoogleDocumentAIOCRService] = None,
        config_provider: Optional[EnvironmentConfigProvider] = None,
        image_processor: Optional[PILImageProcessor] = None
    ):
        """Initialize document processor with dependencies.
        
        Args:
            ocr_service: OCR service implementation
            config_provider: Configuration provider
            image_processor: Image processor for preprocessing
        """
        self.config = config_provider or EnvironmentConfigProvider()
        
        # Configure image processor with settings from config (quality-preserving defaults)
        # Default: cap longest side to ~2560px to reduce latency while keeping legibility
        max_width = self.config.get_config('MAX_IMAGE_WIDTH', 2560)
        max_height = self.config.get_config('MAX_IMAGE_HEIGHT', 2560)
        enhance_image = self.config.get_config('ENHANCE_IMAGE', False)
        
        self.image_processor = image_processor or PILImageProcessor(
            max_width=max_width,
            max_height=max_height,
            enhance_image=enhance_image
        )
        self.ocr_service = ocr_service or GoogleDocumentAIOCRService(
            self.config, 
            self.image_processor
        )
    
    async def process_document(self, image_data: bytes, **kwargs) -> DocumentOCRResult:
        """Process a document image and extract text with bounding boxes.
        
        Args:
            image_data: Raw image bytes
            **kwargs: Additional processing parameters
            
        Returns:
            DocumentOCRResult containing extracted text and metadata
        """
        # Get original image information before processing
        original_image_info = self.image_processor.get_original_image_info(image_data)
        
        # Extract text using OCR service
        result = await self.ocr_service.extract_text(image_data, **kwargs)
        
        # Add original image info to result
        result.original_image_info = original_image_info
        
        return result
