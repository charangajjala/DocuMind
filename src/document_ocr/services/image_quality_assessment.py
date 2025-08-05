"""Image quality assessment service using Google Document AI's built-in quality scores."""

import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from PIL import Image
import io

logger = logging.getLogger(__name__)


@dataclass
class ImageQualityScores:
    """Google Document AI image quality scores."""
    
    # Google's quality score (0.0 to 1.0, where 1.0 indicates perfect readability)
    quality_score: float
    
    # List of detected defects with their confidence values
    detected_defects: List[Dict[str, Any]]
    
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
    
    def get_recommendations(self) -> List[str]:
        """Generate recommendations based on detected defects."""
        recommendations = []
        
        # Process detected defects
        for defect in self.detected_defects:
            defect_type = defect.get('type', '').lower()
            confidence = defect.get('confidence', 0.0)
            
            if confidence > 0.5:  # Only show high-confidence defects
                if 'blur' in defect_type:
                    recommendations.append(f"Blur detected (confidence: {confidence:.2f}) - ensure proper focus when capturing images")
                elif 'glare' in defect_type:
                    recommendations.append(f"Glare detected (confidence: {confidence:.2f}) - reduce lighting reflections or change angle")
                elif 'dark' in defect_type or 'shadow' in defect_type:
                    recommendations.append(f"Dark regions detected (confidence: {confidence:.2f}) - improve lighting conditions")
                elif 'noise' in defect_type:
                    recommendations.append(f"Image noise detected (confidence: {confidence:.2f}) - use better camera settings or reduce ISO")
                else:
                    recommendations.append(f"{defect_type.title()} detected (confidence: {confidence:.2f})")
        
        # Overall recommendation based on quality score
        if self.quality_score < 0.4:
            recommendations.append("Overall image quality is poor - consider retaking the photo with better conditions")
        elif self.quality_score < 0.75:
            recommendations.append("Image quality could be improved for better OCR accuracy")
        else:
            recommendations.append("Good image quality for OCR processing")
        
        return recommendations if recommendations else ["Image quality is acceptable for OCR processing"]


class GoogleImageQualityAssessmentService:
    """Service to extract and process Google Document AI image quality scores."""
    
    def __init__(self):
        """Initialize the Google image quality assessment service."""
        self.logger = logging.getLogger(__name__)
    
    def extract_quality_scores_from_response(self, document_response, image_data: bytes) -> Optional[ImageQualityScores]:
        """Extract image quality scores from Google Document AI response - only Google's built-in scores."""
        try:
            # Get basic image properties
            image = Image.open(io.BytesIO(image_data))
            width, height = image.size
            file_size = len(image_data)
            format_type = image.format or 'Unknown' 
            resolution = f"{width}x{height}"
            
            # Extract quality scores from the first page (assuming single page document)
            if hasattr(document_response, 'pages') and document_response.pages:
                page = document_response.pages[0]
                
                # Only return data if Google's image quality scores are available
                if hasattr(page, 'image_quality_scores') and page.image_quality_scores:
                    quality_scores = page.image_quality_scores
                    
                    # Extract quality score (0.0 to 1.0)
                    quality_score = getattr(quality_scores, 'quality_score', 0.0)
                    
                    # Extract detected defects
                    detected_defects = []
                    if hasattr(quality_scores, 'detected_defects'):
                        for defect in quality_scores.detected_defects:
                            defect_info = {
                                'type': getattr(defect, 'type', 'unknown'),
                                'confidence': getattr(defect, 'confidence', 0.0)
                            }
                            detected_defects.append(defect_info)
                    
                    self.logger.info(f"Google Document AI quality score: {quality_score}, defects: {len(detected_defects)}")
                    
                    return ImageQualityScores(
                        quality_score=quality_score,
                        detected_defects=detected_defects,
                        width=width,
                        height=height,
                        resolution=resolution,
                        file_size=file_size,
                        format=format_type
                    )
                else:
                    self.logger.warning("Google Document AI image quality scores not available in response")
                    return None
            else:
                self.logger.warning("No pages found in Document AI response")
                return None
            
        except Exception as e:
            self.logger.error(f"Error extracting Google Document AI image quality scores: {str(e)}")
            return None
