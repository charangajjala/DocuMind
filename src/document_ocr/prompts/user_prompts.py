"""User prompts for structured data extraction."""

from typing import Optional, Dict, Any
from ..models.extraction_response import ExtractionResponse


def get_extraction_response_schema() -> Dict[str, Any]:
    """Get the JSON schema for ExtractionResponse.
    
    Returns:
        JSON schema dictionary
    """
    return ExtractionResponse.model_json_schema()


def validate_extraction_response(response_data: Dict[str, Any]) -> ExtractionResponse:
    """Validate and parse extraction response data.
    
    Args:
        response_data: Raw response data to validate
        
    Returns:
        Validated ExtractionResponse model
        
    Raises:
        ValidationError: If data doesn't match schema
    """
    return ExtractionResponse.model_validate(response_data)


def get_base_extraction_prompt(user_prompt: Optional[str] = None) -> str:
    """Generate base user prompt for extraction with visual-first approach.
    
    Args:
        user_prompt: Additional user instructions
        
    Returns:
        User prompt string
    """
    # Get the JSON schema for the response format
    response_schema = ExtractionResponse.model_json_schema()
    
    base_prompt = f"""Extract structured data from this document image using the following approach:

CRITICAL: You are working with TWO DIFFERENT SCHEMAS:

1. DATA EXTRACTION SCHEMA → Defines WHAT data to extract (provided in your system context)
2. RESPONSE FORMAT SCHEMA → Defines HOW to structure your JSON response (shown below)

EXTRACTION STRATEGY:
• Use BOTH visual analysis AND OCR results for maximum accuracy
• You are NOT limited to OCR-only data - extract visually readable information even if OCR missed it
• When information matches OCR text blocks, reference those block IDs for grounding
• For purely visual extractions, use ["visual_only"] in source_block_ids

RESPONSE REQUIREMENTS:
• Extract data according to the DATA EXTRACTION SCHEMA (from system context)
• Format response using this RESPONSE FORMAT SCHEMA:

{response_schema}

FIELD MAPPING RULES:
• OCR grounded: Use actual OCR text block IDs [0, 1, 2]
• Visual only: Use ["visual_only"] 
• Missing/unclear: Use null for optional fields
• Maintain precise data types (strings, numbers, dates)

CONFIDENCE SCORING:
• Base confidence on visual clarity + OCR confirmation
• Higher confidence when both visual and OCR agree
• Lower confidence for visual-only or unclear extractions"""
    
    if user_prompt:
        return f"{base_prompt}\n\nAdditional instructions: {user_prompt}"
    
    return base_prompt


def get_visual_only_prompt(user_prompt: Optional[str] = None) -> str:
    """Generate prompt for visual-only extraction (when OCR is not available).
    
    Args:
        user_prompt: Additional user instructions
        
    Returns:
        Visual-only user prompt string
    """
    # Get the JSON schema for the response format
    response_schema = ExtractionResponse.model_json_schema()
    
    base_prompt = f"""Extract structured data from this document image using VISUAL ANALYSIS ONLY.

CRITICAL: You are working with TWO DIFFERENT SCHEMAS:

1. DATA EXTRACTION SCHEMA → Defines WHAT data to extract (provided in your system context)
2. RESPONSE FORMAT SCHEMA → Defines HOW to structure your JSON response (shown below)

EXTRACTION STRATEGY:
• Rely entirely on visual understanding (no OCR data available)
• Read text, numbers, and structured data from the image
• Pay attention to document layout and visual hierarchy

RESPONSE REQUIREMENTS:
• Extract data according to the DATA EXTRACTION SCHEMA (from system context)
• Format response using this RESPONSE FORMAT SCHEMA:

{response_schema}

FIELD MAPPING RULES:
• Always use ["visual_only"] in source_block_ids
• Use null for fields that cannot be clearly identified
• Maintain precise data types (strings, numbers, dates)

CONFIDENCE SCORING:
• Base confidence solely on visual clarity and readability
• Be conservative - don't guess when information is unclear"""
    
    if user_prompt:
        return f"{base_prompt}\n\nAdditional instructions: {user_prompt}"
    
    return base_prompt
