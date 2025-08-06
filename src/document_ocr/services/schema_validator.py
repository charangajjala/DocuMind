"""JSON Schema validation service."""

import json
import logging
from typing import Dict, Any, List, Optional

try:
    import jsonschema
    from jsonschema import validate, ValidationError, Draft7Validator
    JSONSCHEMA_AVAILABLE = True
except ImportError:
    JSONSCHEMA_AVAILABLE = False
    ValidationError = Exception

from ..core.interfaces import SchemaValidator
from ..core.exceptions import DocumentOCRError


logger = logging.getLogger(__name__)


class SchemaValidationError(DocumentOCRError):
    """Custom exception for schema validation errors."""
    pass


class JSONSchemaValidator(SchemaValidator):
    """JSON Schema validator implementation."""
    
    def __init__(self):
        """Initialize the schema validator."""
        if not JSONSCHEMA_AVAILABLE:
            raise SchemaValidationError(
                "jsonschema package is required for schema validation. "
                "Install with: pip install jsonschema"
            )
    
    def validate_schema(self, schema: Dict[str, Any]) -> bool:
        """Validate if the provided schema is a valid JSON schema.
        
        Args:
            schema: JSON schema to validate
            
        Returns:
            True if schema is valid, False otherwise
            
        Raises:
            SchemaValidationError: If validation fails with details
        """
        try:
            # Try to create a validator with the schema
            Draft7Validator.check_schema(schema)
            logger.info("Schema validation passed")
            return True
            
        except Exception as e:
            logger.error(f"Schema validation failed: {e}")
            raise SchemaValidationError(f"Invalid JSON schema: {e}")
    
    def validate_data(self, data: Dict[str, Any], schema: Dict[str, Any]) -> bool:
        """Validate data against a JSON schema (non-raising version).
        
        Args:
            data: Data to validate
            schema: JSON schema to validate against
            
        Returns:
            True if validation passes, False otherwise
        """
        try:
            self.validate_data_against_schema(data, schema)
            return True
        except SchemaValidationError:
            return False
    
    def validate_data_against_schema(
        self,
        data: Dict[str, Any],
        schema: Dict[str, Any]
    ) -> bool:
        """Validate data against the provided schema.
        
        Args:
            data: Data to validate
            schema: JSON schema to validate against
            
        Returns:
            True if validation passes, False otherwise
            
        Raises:
            SchemaValidationError: If validation fails with details
        """
        try:
            validate(instance=data, schema=schema)
            logger.info("Data validation against schema passed")
            return True
            
        except ValidationError as e:
            logger.warning(f"Data validation failed: {e.message}")
            raise SchemaValidationError(f"Data validation failed: {e.message}")
        
        except Exception as e:
            logger.error(f"Unexpected validation error: {e}")
            raise SchemaValidationError(f"Validation error: {e}")
    
    def get_validation_errors(
        self,
        data: Dict[str, Any],
        schema: Dict[str, Any]
    ) -> List[str]:
        """Get detailed validation errors without raising exceptions.
        
        Args:
            data: Data to validate
            schema: JSON schema to validate against
            
        Returns:
            List of validation error messages
        """
        errors = []
        
        try:
            validator = Draft7Validator(schema)
            for error in validator.iter_errors(data):
                error_path = " -> ".join([str(x) for x in error.path]) if error.path else "root"
                errors.append(f"Path '{error_path}': {error.message}")
                
        except Exception as e:
            errors.append(f"Schema validation setup error: {e}")
        
        return errors
    
    def suggest_schema_fixes(self, schema: Dict[str, Any]) -> List[str]:
        """Suggest fixes for common schema issues.
        
        Args:
            schema: JSON schema to analyze
            
        Returns:
            List of suggestions for fixing the schema
        """
        suggestions = []
        
        # Check for common issues
        if not isinstance(schema, dict):
            suggestions.append("Schema must be a JSON object (dictionary)")
            return suggestions
        
        if "type" not in schema:
            suggestions.append("Consider adding a 'type' field to specify the root data type")
        
        if schema.get("type") == "object" and "properties" not in schema:
            suggestions.append("Object schemas should have a 'properties' field defining the object structure")
        
        if schema.get("type") == "array" and "items" not in schema:
            suggestions.append("Array schemas should have an 'items' field defining array element structure")
        
        # Check for required fields
        if schema.get("type") == "object":
            properties = schema.get("properties", {})
            required = schema.get("required", [])
            
            for req_field in required:
                if req_field not in properties:
                    suggestions.append(f"Required field '{req_field}' is not defined in properties")
        
        return suggestions
    
    def create_example_data(self, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Create example data that matches the schema.
        
        Args:
            schema: JSON schema to generate example for
            
        Returns:
            Example data matching the schema
        """
        def generate_value(prop_schema: Dict[str, Any]) -> Any:
            prop_type = prop_schema.get("type", "string")
            
            if prop_type == "string":
                if prop_schema.get("format") == "date":
                    return "2024-08-06"
                elif prop_schema.get("format") == "email":
                    return "example@email.com"
                else:
                    return f"example_{prop_schema.get('title', 'value')}"
            
            elif prop_type == "number":
                return prop_schema.get("default", 0.0)
            
            elif prop_type == "integer":
                return prop_schema.get("default", 0)
            
            elif prop_type == "boolean":
                return prop_schema.get("default", False)
            
            elif prop_type == "array":
                items_schema = prop_schema.get("items", {"type": "string"})
                return [generate_value(items_schema)]
            
            elif prop_type == "object":
                result = {}
                properties = prop_schema.get("properties", {})
                for prop_name, prop_def in properties.items():
                    result[prop_name] = generate_value(prop_def)
                return result
            
            else:
                return None
        
        try:
            return generate_value(schema)
        except Exception as e:
            logger.warning(f"Could not generate example data: {e}")
            return {"error": f"Could not generate example: {e}"}
