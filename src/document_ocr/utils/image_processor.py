"""Image processing utilities."""

import io
from typing import Tuple
from PIL import Image
import cv2
import numpy as np

from ..core.interfaces import ImageProcessor
from ..core.exceptions import InvalidImageError


class PILImageProcessor(ImageProcessor):
    """Image processor implementation using PIL/Pillow."""
    
    def __init__(self, max_width: int = 2048, max_height: int = 2048, enhance_image: bool = False):
        """Initialize with maximum image dimensions and enhancement option."""
        self.max_width = max_width
        self.max_height = max_height
        self.enhance_image = enhance_image
    
    def validate_image(self, image_data: bytes) -> bool:
        """Validate if the image data is valid and processable."""
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                # Check if it's a valid image format
                img.verify()
                return True
        except Exception:
            return False
    
    def get_image_dimensions(self, image_data: bytes) -> Tuple[int, int]:
        """Get image width and height."""
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                return img.size  # Returns (width, height)
        except Exception as e:
            raise InvalidImageError(f"Cannot get image dimensions: {str(e)}")
    
    def preprocess_image(self, image_data: bytes) -> bytes:
        """Preprocess image for better OCR results."""
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                # Convert to RGB if needed (but only if absolutely necessary)
                if img.mode not in ['RGB', 'RGBA', 'L']:  # Keep common formats as-is
                    img = img.convert('RGB')
                
                # Only resize if explicitly enabled via config (disabled by default)
                width, height = img.size
                if (self.max_width < 999999 and self.max_height < 999999 and 
                    (width > self.max_width or height > self.max_height)):
                    img.thumbnail((self.max_width, self.max_height), Image.Resampling.LANCZOS)
                
                # Apply enhancements only if enabled
                if self.enhance_image:
                    img = self._enhance_image(img)
                
                # Preserve original format when possible
                original_format = img.format or 'PNG'
                
                # Convert back to bytes
                output = io.BytesIO()
                save_kwargs = {"format": original_format}
                # Prefer high-quality JPEG for photos/docs, PNG for line art; keep optimize on
                if original_format in ("JPEG", "JPG"):
                    save_kwargs.update({"optimize": True, "quality": 90, "subsampling": 1})  # 4:2:2 to preserve text edges
                elif original_format == "PNG":
                    save_kwargs.update({"optimize": True})
                else:
                    save_kwargs.update({"optimize": True, "quality": 90})
                img.save(output, **save_kwargs)
                return output.getvalue()
                
        except Exception as e:
            raise InvalidImageError(f"Image preprocessing failed: {str(e)}")
    
    def get_original_image_info(self, image_data: bytes) -> dict:
        """Get original image information without processing."""
        try:
            with Image.open(io.BytesIO(image_data)) as img:
                return {
                    'width': img.width,
                    'height': img.height,
                    'format': img.format,
                    'mode': img.mode,
                    'size_bytes': len(image_data),
                    'resolution': getattr(img, 'info', {}).get('dpi', (72, 72))
                }
        except Exception as e:
            raise InvalidImageError(f"Cannot get image info: {str(e)}")
    
    def _enhance_image(self, img: Image.Image) -> Image.Image:
        """Apply basic image enhancements for better OCR."""
        # Convert PIL image to OpenCV format
        img_array = np.array(img)
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        
        if len(img_array.shape) == 3:  # Color image
            # Convert to LAB color space
            lab = cv2.cvtColor(img_array, cv2.COLOR_RGB2LAB)
            # Apply CLAHE to L channel
            lab[:, :, 0] = clahe.apply(lab[:, :, 0])
            # Convert back to RGB
            enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
        else:  # Grayscale image
            enhanced = clahe.apply(img_array)
        
        # Apply slight Gaussian blur to reduce noise
        enhanced = cv2.GaussianBlur(enhanced, (3, 3), 0)
        
        # Convert back to PIL Image
        return Image.fromarray(enhanced)
