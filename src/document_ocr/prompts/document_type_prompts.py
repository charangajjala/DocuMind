"""Schema-specific prompts for field extraction guidance."""


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
        
        if field_type == 'array':
            guidance.append(f"- {field_name}: This is a list/array field. Look for multiple items or entries.")
        elif field_type == 'number' or field_type == 'integer':
            guidance.append(f"- {field_name}: Numeric field. Extract as number, not string.")
        elif field_type == 'boolean':
            guidance.append(f"- {field_name}: Boolean field. Look for yes/no, true/false, checked/unchecked indicators.")
        elif 'date' in field_name.lower() or 'time' in field_name.lower():
            guidance.append(f"- {field_name}: Date/time field. Pay attention to date format and extract precisely.")
    
    if guidance:
        return "Schema-Specific Guidance:\n" + "\n".join(guidance)
    return ""
