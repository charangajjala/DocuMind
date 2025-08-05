"""FastAPI application for document OCR REST API."""

import base64
import io
from typing import List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from document_ocr.models.domain import OCRRequest, OCRResponse
from document_ocr.services.document_processor import DocumentOCRProcessor
from document_ocr.utils.config import EnvironmentConfigProvider
from document_ocr.core.exceptions import DocumentOCRError, InvalidImageError


# Initialize dependencies
config = EnvironmentConfigProvider()
processor = DocumentOCRProcessor(config_provider=config)

# Create FastAPI app
app = FastAPI(
    title="Document OCR API",
    description="REST API for document text extraction using Google Document AI",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Document OCR API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "ocr_base64": "/ocr/base64",
            "ocr_upload": "/ocr/upload",
            "docs": "/docs"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Basic configuration validation
        config.validate_required_config()
        return {
            "status": "healthy",
            "service": "document-ocr-api",
            "google_document_ai": "configured"
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")


@app.post("/ocr/base64", response_model=OCRResponse)
async def extract_text_from_base64(request: OCRRequest):
    """Extract text from base64 encoded image."""
    try:
        # Decode base64 image
        try:
            image_data = base64.b64decode(request.image_data)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")
        
        # Process document
        result = await processor.process_document(
            image_data,
            confidence_threshold=request.confidence_threshold
        )
        
        # Convert to API response format
        text_blocks = [
            {
                "text": block.text,
                "confidence": block.confidence,
                "element_type": getattr(block, 'element_type', 'block'),
                "bounding_box": {
                    "x_min": block.bounding_box.x_min,
                    "y_min": block.bounding_box.y_min,
                    "x_max": block.bounding_box.x_max,
                    "y_max": block.bounding_box.y_max
                }
            }
            for block in result.text_blocks
        ]
        
        # Convert image quality to dict if available
        image_quality_dict = None
        if result.image_quality:
            quality = result.image_quality
            image_quality_dict = {
                "quality_score": quality.quality_score,
                "quality_grade": quality.get_quality_grade(),
                "detected_defects": quality.detected_defects,
                "recommendations": quality.get_recommendations(),
                "width": quality.width,
                "height": quality.height,
                "resolution": quality.resolution,
                "file_size": quality.file_size,
                "format": quality.format
            }
        
        return OCRResponse(
            full_text=result.full_text,
            text_blocks=text_blocks,
            image_dimensions={
                "width": result.image_width,
                "height": result.image_height
            },
            processing_time=result.processing_time,
            success=True,
            image_quality=image_quality_dict,
            original_image_info=result.original_image_info,
            raw_document_ai_response=result.raw_document_ai_response
        )
        
    except InvalidImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DocumentOCRError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/ocr/upload", response_model=OCRResponse)
async def extract_text_from_upload(
    file: UploadFile = File(...),
    confidence_threshold: float = 0.8
):
    """Extract text from uploaded image file."""
    try:
        # Validate file type
        allowed_types = config.get_config('ALLOWED_IMAGE_TYPES', ['jpg', 'jpeg', 'png', 'pdf', 'tiff'])
        file_extension = file.filename.lower().split('.')[-1] if file.filename else ''
        
        if file_extension not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed types: {', '.join(allowed_types)}"
            )
        
        # Check file size
        max_size = config.get_config('MAX_IMAGE_SIZE', 10485760)  # 10MB default
        content = await file.read()
        
        if len(content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {max_size} bytes"
            )
        
        # Process document
        result = await processor.process_document(
            content,
            confidence_threshold=confidence_threshold
        )
        
        # Convert to API response format
        text_blocks = [
            {
                "text": block.text,
                "confidence": block.confidence,
                "element_type": getattr(block, 'element_type', 'block'),
                "bounding_box": {
                    "x_min": block.bounding_box.x_min,
                    "y_min": block.bounding_box.y_min,
                    "x_max": block.bounding_box.x_max,
                    "y_max": block.bounding_box.y_max
                }
            }
            for block in result.text_blocks
        ]
        
        # Convert image quality to dict if available
        image_quality_dict = None
        if result.image_quality:
            quality = result.image_quality
            image_quality_dict = {
                "quality_score": quality.quality_score,
                "quality_grade": quality.get_quality_grade(),
                "detected_defects": quality.detected_defects,
                "recommendations": quality.get_recommendations(),
                "width": quality.width,
                "height": quality.height,
                "resolution": quality.resolution,
                "file_size": quality.file_size,
                "format": quality.format
            }
        
        return OCRResponse(
            full_text=result.full_text,
            text_blocks=text_blocks,
            image_dimensions={
                "width": result.image_width,
                "height": result.image_height
            },
            processing_time=result.processing_time,
            success=True,
            image_quality=image_quality_dict,
            original_image_info=result.original_image_info,
            raw_document_ai_response=result.raw_document_ai_response
        )
        
    except InvalidImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DocumentOCRError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.exception_handler(DocumentOCRError)
async def document_ocr_exception_handler(request, exc: DocumentOCRError):
    """Handle DocumentOCRError exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "detail": exc.message,
            "error_code": exc.error_code,
            "success": False
        }
    )


if __name__ == "__main__":
    import uvicorn
    
    host = config.get_config('API_HOST', '0.0.0.0')
    port = config.get_config('API_PORT', 8000)
    
    uvicorn.run(
        "src.api.main:app",
        host=host,
        port=port,
        reload=True,
        log_level=config.get_config('LOG_LEVEL', 'info').lower()
    )
