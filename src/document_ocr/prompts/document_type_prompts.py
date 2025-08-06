"""Document type specific prompts for specialized extraction."""


class DocumentTypePrompts:
    """Specialized prompts for different document types."""
    
    @staticmethod
    def get_generic_prompt() -> str:
        """Get generic guidance for document extraction."""
        return """Document Type: Generic Document

Focus Areas:
- Document title and type identification
- Key information fields and their values
- Structured data elements (tables, lists, forms)
- Dates, numbers, and monetary amounts
- Names, addresses, and contact information
- Reference numbers or identifiers

Special Considerations:
- Look for patterns in document layout and structure
- Pay attention to headers, footers, and section divisions
- Identify field labels and their corresponding values
- Consider document formatting and visual hierarchy
- Extract information based on the provided schema"""


def get_document_type_prompt(document_type: str) -> str:
    """Get document type specific prompt.
    
    Args:
        document_type: Type of document
        
    Returns:
        Document-specific guidance prompt
    """
    # For now, return generic prompt for all document types
    return DocumentTypePrompts.get_generic_prompt()


def get_schema_specific_prompt(schema_properties: dict) -> str:
    """Generate guidance based on the JSON schema properties.
    
    Args:
        schema_properties: Properties from the JSON schema
        
    Returns:
        Schema-specific guidance prompt
    """
    guidance = []
    
    for field_name, field_info in schema_properties.items():
        field_type = field_info.get('type', 'string')
        field_desc = field_info.get('description', '')
        
        if field_type == 'array':
            guidance.append(f"- {field_name}: This is a list/array field. Look for multiple items or entries.")
        elif field_type == 'number' or field_type == 'integer':
            guidance.append(f"- {field_name}: Numeric field. Extract as number, not string.")
        elif field_type == 'boolean':
            guidance.append(f"- {field_name}: Boolean field. Look for yes/no, true/false, checked/unchecked indicators.")
        elif 'date' in field_name.lower() or 'time' in field_name.lower():
            guidance.append(f"- {field_name}: Date/time field. Pay attention to date format and extract precisely.")
        
        if field_desc:
            guidance.append(f"  Description: {field_desc}")
    
    if guidance:
        return "Schema-Specific Guidance:\n" + "\n".join(guidance)
    return ""
