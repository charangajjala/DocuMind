"""System prompts for structured data extraction."""

import json
from typing import Dict, Any


def get_extraction_system_prompt(
    json_schema: Dict[str, Any],
    full_text: str,
    ocr_text_blocks: list
) -> str:
    """Generate system prompt for structured data extraction.
    
    Args:
        json_schema: Target JSON schema for extraction
        full_text: Full OCR text from document
        ocr_text_blocks: OCR text blocks with bounding boxes
        
    Returns:
        System prompt string
    """
    return f"""You are an expert document data extraction assistant specializing in multi-modal analysis. You combine visual understanding with OCR text analysis to extract precise, structured information from document images.

ROLE CAPABILITIES:
• Visual document analysis and layout understanding
• OCR text interpretation and validation  
• Multi-modal data extraction (visual + textual)
• Schema-based structured data output

AVAILABLE RESOURCES:
• Data Extraction Schema (what to extract):
{json.dumps(json_schema, indent=2)}

• OCR Full Text: {full_text}

• OCR Text Blocks (with positions):
{json.dumps(ocr_text_blocks, indent=2)}

WORKING PRINCIPLES:
• Precision over speed - accuracy is paramount
• Multi-source validation - combine visual and OCR evidence
• Transparent reasoning - explain extraction decisions
• Conservative confidence - honest about uncertainty"""


def get_fallback_system_prompt() -> str:
    """Get a fallback system prompt when OCR data is not available."""
    return """You are an expert document data extraction assistant specializing in visual document analysis. You extract structured information using pure visual understanding when OCR data is unavailable.

ROLE CAPABILITIES:
• Advanced visual document analysis
• Text recognition from images
• Layout and structure interpretation
• Schema-based data extraction

WORKING PRINCIPLES:
• Visual-first approach - rely on image analysis
• Precision over speed - accuracy is paramount  
• Conservative confidence - honest about visual limitations
• Transparent reasoning - explain extraction decisions"""


def get_enhanced_system_prompt(
    json_schema: Dict[str, Any],
    full_text: str,
    ocr_text_blocks: list,
    document_context: Dict[str, Any] = None
) -> str:
    """Generate enhanced system prompt with additional context.
    
    Args:
        json_schema: Target JSON schema for extraction
        full_text: Full OCR text from document
        ocr_text_blocks: OCR text blocks with bounding boxes
        document_context: Additional document context (type, language, etc.)
        
    Returns:
        Enhanced system prompt string
    """
    base_prompt = get_extraction_system_prompt(json_schema, full_text, ocr_text_blocks)
    
    if document_context:
        context_info = []
        if document_context.get('document_type'):
            context_info.append(f"Document Type: {document_context['document_type']}")
        if document_context.get('language'):
            context_info.append(f"Language: {document_context['language']}")
        if document_context.get('quality_score'):
            context_info.append(f"Image Quality Score: {document_context['quality_score']}")
        
        if context_info:
            context_section = "\n".join(context_info)
            return f"{base_prompt}\n\nAdditional Context:\n{context_section}"
    
    return base_prompt
