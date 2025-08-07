"""Google Document AI OCR service implementation."""

import time
from typing import Optional
from google.cloud import documentai

from ..core.interfaces import OCRService
from ..core.exceptions import GoogleDocumentAIError, ConfigurationError
from ..models.domain import DocumentOCRResult, TextBlock, BoundingBox
from ..utils.config import EnvironmentConfigProvider
from ..utils.image_processor import PILImageProcessor
from .image_quality_assessment import GoogleImageQualityAssessmentService


class GoogleDocumentAIOCRService(OCRService):
    """Google Document AI implementation of OCR service."""
    
    def __init__(
        self, 
        config_provider: EnvironmentConfigProvider,
        image_processor: Optional[PILImageProcessor] = None
    ):
        """Initialize Google Document AI OCR service.
        
        Args:
            config_provider: Configuration provider for Google Cloud settings
            image_processor: Optional image processor for preprocessing
        """
        self.config = config_provider
        
        # Configure image processor with settings from config  
        if image_processor is None:
            max_width = self.config.get_config('MAX_IMAGE_WIDTH', 999999)
            max_height = self.config.get_config('MAX_IMAGE_HEIGHT', 999999)
            enhance_image = self.config.get_config('ENHANCE_IMAGE', False)
            self.image_processor = PILImageProcessor(
                max_width=max_width,
                max_height=max_height, 
                enhance_image=enhance_image
            )
        else:
            self.image_processor = image_processor
        self.quality_service = GoogleImageQualityAssessmentService()
        
        # Validate required configuration
        self.config.validate_required_config()
        
        # Initialize Document AI client
        self.project_id = self.config.get_config('GOOGLE_CLOUD_PROJECT')
        self.location = self.config.get_config('DOCUMENT_AI_LOCATION')
        self.processor_id = self.config.get_config('DOCUMENT_AI_PROCESSOR_ID')
        
        if not all([self.project_id, self.location, self.processor_id]):
            raise ConfigurationError("Missing required Google Document AI configuration")
        
        try:
            # Google Cloud client will automatically use ADC if no explicit credentials
            self.client = documentai.DocumentProcessorServiceClient()
            self.processor_name = self.client.processor_path(
                self.project_id, self.location, self.processor_id
            )
        except Exception as e:
            raise GoogleDocumentAIError(f"Failed to initialize Document AI client: {str(e)}")
    
    async def extract_text(self, image_data: bytes, **kwargs) -> DocumentOCRResult:
        """Extract text from image using Google Document AI.
        
        Args:
            image_data: Raw image bytes
            **kwargs: Additional parameters like confidence_threshold
            
        Returns:
            DocumentOCRResult with extracted text and bounding boxes
        """
        start_time = time.time()
        
        try:
            # Validate and preprocess image
            if not self.image_processor.validate_image(image_data):
                raise GoogleDocumentAIError("Invalid image format")
            
            # Get image dimensions before preprocessing
            original_width, original_height = self.image_processor.get_image_dimensions(image_data)
            
            # Preprocess image for better OCR results
            processed_image = self.image_processor.preprocess_image(image_data)
            
            # Create Document AI request with proper OCR config for image quality scores
            ocr_config = documentai.OcrConfig(
                enable_image_quality_scores=True
            )
            
            process_options = documentai.ProcessOptions(
                ocr_config=ocr_config
            )
            
            request = documentai.ProcessRequest(
                name=self.processor_name,
                raw_document=documentai.RawDocument(
                    content=processed_image,
                    mime_type="image/png"  # We convert to PNG in preprocessing
                ),
                process_options=process_options
            )
            
            # Process document
            result = self.client.process_document(request=request)
            document = result.document

            print("Document processed successfully")

            # print('Raw Document AI response:', document)
            
            # Convert Document AI response to dict for debugging (serialize the protobuf)
            raw_response = None
            try:
                from google.protobuf.json_format import MessageToDict
                # Use only supported parameters for protobuf serialization
                raw_response = MessageToDict(
                    document, 
                    preserving_proto_field_name=True
                )
            except Exception as e:
                print(f"Warning: Could not serialize Document AI response: {e}")
                # Fallback: create a simplified response with key information
                try:
                    raw_response = {
                        "serialization_error": str(e),
                        "document_text_length": len(document.text) if hasattr(document, 'text') and document.text else 0,
                        "pages_count": len(document.pages) if hasattr(document, 'pages') and document.pages else 0,
                        "document_type": str(type(document)),
                        "has_text": hasattr(document, 'text') and bool(document.text),
                        "has_pages": hasattr(document, 'pages') and bool(document.pages),
                        "text_preview": document.text[:200] + "..." if hasattr(document, 'text') and document.text and len(document.text) > 200 else (document.text if hasattr(document, 'text') else "No text")
                    }
                except Exception as fallback_error:
                    raw_response = {
                        "primary_error": str(e),
                        "fallback_error": str(fallback_error),
                        "message": "Could not serialize Document AI response"
                    }
            
            # Extract image quality scores using Google's built-in quality assessment
            image_quality = self.quality_service.extract_quality_scores_from_response(
                document, image_data
            )
            
            # Extract text blocks with bounding boxes
            text_blocks = self._extract_text_blocks(document, original_width, original_height)
            
            # Get full text
            full_text = document.text if document.text else ""
            
            processing_time = time.time() - start_time
            
            return DocumentOCRResult(
                full_text=full_text,
                text_blocks=text_blocks,
                image_width=original_width,
                image_height=original_height,
                processing_time=processing_time,
                image_quality=image_quality,
                raw_document_ai_response=raw_response
            )
            
        except Exception as e:
            if isinstance(e, GoogleDocumentAIError):
                raise
            raise GoogleDocumentAIError(f"Document processing failed: {str(e)}")
    
    def _extract_text_blocks(
        self, 
        document: documentai.Document, 
        image_width: int, 
        image_height: int
    ) -> list[TextBlock]:
        """Extract ALL text elements with bounding boxes from Document AI response."""
        text_blocks = []
        
        # Process pages
        for page in document.pages:
            # 1. Extract BLOCKS (paragraph-level)
            for block in page.blocks:
                block_text = self._get_text_from_layout(block.layout, document.text)
                if block_text.strip():
                    bounding_box = self._extract_bounding_box(block.layout.bounding_poly)
                    confidence = block.layout.confidence if block.layout.confidence else 0.8
                    
                    text_blocks.append(TextBlock(
                        text=block_text,
                        confidence=confidence,
                        bounding_box=bounding_box,
                        element_type="block"
                    ))
            
            # 2. Extract PARAGRAPHS
            for paragraph in page.paragraphs:
                para_text = self._get_text_from_layout(paragraph.layout, document.text)
                if para_text.strip():
                    bounding_box = self._extract_bounding_box(paragraph.layout.bounding_poly)
                    confidence = paragraph.layout.confidence if paragraph.layout.confidence else 0.8
                    
                    text_blocks.append(TextBlock(
                        text=para_text,
                        confidence=confidence,
                        bounding_box=bounding_box,
                        element_type="paragraph"
                    ))
            
            # 3. Extract LINES
            for line in page.lines:
                line_text = self._get_text_from_layout(line.layout, document.text)
                if line_text.strip():
                    bounding_box = self._extract_bounding_box(line.layout.bounding_poly)
                    confidence = line.layout.confidence if line.layout.confidence else 0.8
                    
                    text_blocks.append(TextBlock(
                        text=line_text,
                        confidence=confidence,
                        bounding_box=bounding_box,
                        element_type="line"
                    ))
            
            # 4. Extract TOKENS (individual words)
            for token in page.tokens:
                token_text = self._get_text_from_layout(token.layout, document.text)
                if token_text.strip():
                    bounding_box = self._extract_bounding_box(token.layout.bounding_poly)
                    confidence = token.layout.confidence if token.layout.confidence else 0.8
                    
                    text_blocks.append(TextBlock(
                        text=token_text,
                        confidence=confidence,
                        bounding_box=bounding_box,
                        element_type="token"
                    ))
        
        return text_blocks
    
    def _get_text_from_layout(self, layout: documentai.Document.Page.Layout, full_text: str) -> str:
        """Extract text from layout using text anchors."""
        if not layout.text_anchor or not layout.text_anchor.text_segments:
            return ""
        
        text = ""
        for segment in layout.text_anchor.text_segments:
            start_index = segment.start_index if segment.start_index else 0
            end_index = segment.end_index if segment.end_index else len(full_text)
            text += full_text[start_index:end_index]
        
        return text
    
    def _extract_bounding_box(self, bounding_poly) -> BoundingBox:
        """Extract normalized bounding box from Document AI bounding polygon."""
        if not bounding_poly or not bounding_poly.normalized_vertices:
            return BoundingBox(0, 0, 1, 1)  # Default to full image
        
        # Get all x and y coordinates
        x_coords = [vertex.x for vertex in bounding_poly.normalized_vertices]
        y_coords = [vertex.y for vertex in bounding_poly.normalized_vertices]
        
        # Find min/max to create bounding box
        x_min = min(x_coords)
        x_max = max(x_coords)
        y_min = min(y_coords)
        y_max = max(y_coords)
        
        return BoundingBox(x_min, y_min, x_max, y_max)
