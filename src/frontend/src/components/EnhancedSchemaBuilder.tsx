import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  X, 
  List, 
  Package, 
  Download
} from 'lucide-react';

interface ComplexField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  
  // For arrays
  items?: ComplexField;
  
  // For objects
  properties?: { [key: string]: ComplexField };
  
  // Validation rules
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}

interface SchemaBuilderProps {
  onSchemaChange?: (schema: any) => void;
  initialSchema?: any;
}

// Removed persistent storage key and persistence

export const EnhancedSchemaBuilder: React.FC<SchemaBuilderProps> = ({ 
  onSchemaChange,
  initialSchema
}) => {
  const [fields, setFields] = useState<ComplexField[]>([]);

  // Load initial schema (if provided) on mount/prop change
  useEffect(() => {
    try {
      if (initialSchema && initialSchema.properties) {
        const fieldsFromSchema = convertSchemaToFields(initialSchema);
        setFields(fieldsFromSchema);
        if (onSchemaChange) {
          const schema = generateJsonSchemaFromFields(fieldsFromSchema);
          onSchemaChange(schema);
        }
      } else {
        setFields([]);
        if (onSchemaChange) {
          onSchemaChange(generateJsonSchemaFromFields([]));
        }
      }
    } catch (error) {
      console.error('Error initializing schema:', error);
      setFields([]);
    }
  }, [onSchemaChange, initialSchema]);

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Update fields and notify parent (no persistence)
  const updateFields = useCallback((newFields: ComplexField[]) => {
    setFields(newFields);
    if (onSchemaChange) {
      const schema = generateJsonSchemaFromFields(newFields);
      onSchemaChange(schema);
    }
  }, [onSchemaChange]);

  // Add new field
  const addField = (fieldType: ComplexField['type'] = 'string') => {
    const newField: ComplexField = {
      id: generateId(),
      name: '',
      type: fieldType,
      required: false,
      description: ''
    };

    // Initialize type-specific properties
    if (fieldType === 'object') {
      newField.properties = {};
    } else if (fieldType === 'array') {
      newField.items = {
        id: generateId(),
        name: 'item',
        type: 'string',
        required: false,
        description: ''
      };
    }

    const newFields = [...fields, newField];
    updateFields(newFields);
  };

  // Remove field
  const removeField = (index: number) => {
    const newFields = fields.filter((_, i) => i !== index);
    updateFields(newFields);
  };

  // Update field
  const updateField = (index: number, updates: Partial<ComplexField>) => {
    const newFields = [...fields];
    const field = newFields[index];
    
    // Handle type changes
    if (updates.type && updates.type !== field.type) {
      // Clear type-specific properties when type changes
      delete field.properties;
      delete field.items;
      delete field.minLength;
      delete field.maxLength;
      delete field.minimum;
      delete field.maximum;
      delete field.pattern;
      
      // Initialize new type-specific properties
      if (updates.type === 'object') {
        field.properties = {};
      } else if (updates.type === 'array') {
        field.items = {
          id: generateId(),
          name: 'item',
          type: 'string',
          required: false,
          description: ''
        };
      }
    }
    
    Object.assign(field, updates);
    updateFields(newFields);
  };

  // Find field by path for nested operations
  const findFieldByPath = (fieldIndex: number, path: string): ComplexField | null => {
    if (fieldIndex >= fields.length) return null;
    
    const field = fields[fieldIndex];
    if (!path || path === field.name || path === '') return field;
    
    const parts = path.split('.').filter(part => part !== '');
    let currentField = field;
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      // Skip the first part if it matches the field name (top-level field)
      if (i === 0 && part === field.name) {
        continue;
      }
      
      if (part === 'items' && currentField.items) {
        currentField = currentField.items;
      } else if (currentField.properties && currentField.properties[part]) {
        currentField = currentField.properties[part];
      } else {
        return null;
      }
    }
    
    return currentField;
  };

  // Update nested field
  const updateNestedField = (fieldIndex: number, path: string, updates: Partial<ComplexField>) => {
    const targetField = findFieldByPath(fieldIndex, path);
    if (!targetField) return;
    
    // Handle type changes
    if (updates.type && updates.type !== targetField.type) {
      delete targetField.properties;
      delete targetField.items;
      delete targetField.minLength;
      delete targetField.maxLength;
      delete targetField.minimum;
      delete targetField.maximum;
      delete targetField.pattern;
      
      if (updates.type === 'object') {
        targetField.properties = {};
      } else if (updates.type === 'array') {
        targetField.items = {
          id: generateId(),
          name: 'item',
          type: 'string',
          required: false,
          description: ''
        };
      }
    }
    
    Object.assign(targetField, updates);
    updateFields([...fields]);
  };

  // Add field to object
  const addFieldToObject = (fieldIndex: number, path: string, fieldType: ComplexField['type'] = 'string') => {
    console.log('Adding field to object:', { fieldIndex, path, fieldType });
    const targetField = findFieldByPath(fieldIndex, path);
    if (!targetField || targetField.type !== 'object') {
      console.log('Target field not found or not an object:', targetField);
      return;
    }
    
    if (!targetField.properties) targetField.properties = {};
    
    const newFieldId = generateId();
    
    const newField: ComplexField = {
      id: newFieldId,
      name: '',
      type: fieldType,
      required: false,
      description: ''
    };

    if (fieldType === 'object') {
      newField.properties = {};
    } else if (fieldType === 'array') {
      newField.items = {
        id: generateId(),
        name: 'item',
        type: 'string',
        required: false,
        description: ''
      };
    }

    // Use a temporary key since name is empty initially
    const tempKey = `temp_${newFieldId}`;
    targetField.properties[tempKey] = newField;
    console.log('Added field with temp key:', tempKey, newField);
    updateFields([...fields]);
  };

  // Remove field from object
  const removeFieldFromObject = (fieldIndex: number, path: string, fieldName: string) => {
    const pathParts = path.split('.');
    const parentPath = pathParts.slice(0, -1).join('.');
    const parentField = findFieldByPath(fieldIndex, parentPath);
    
    if (parentField?.properties && parentField.properties[fieldName]) {
      delete parentField.properties[fieldName];
      updateFields([...fields]);
    }
  };

  // Update field name in object
  const updateFieldNameInObject = (fieldIndex: number, path: string, oldName: string, newName: string) => {
    console.log('Updating field name:', { fieldIndex, path, oldName, newName });
    if (oldName === newName) return;
    
    const pathParts = path.split('.');
    const parentPath = pathParts.slice(0, -1).join('.');
    const parentField = findFieldByPath(fieldIndex, parentPath);
    
    console.log('Parent field found:', parentField);
    
    if (parentField?.properties && parentField.properties[oldName]) {
      // Update the field's name property
      parentField.properties[oldName].name = newName;
      
      // If the new name is not empty and different from old name, update the key
      if (newName.trim() && oldName !== newName && !parentField.properties[newName]) {
        parentField.properties[newName] = { ...parentField.properties[oldName] };
        delete parentField.properties[oldName];
        console.log('Key updated from', oldName, 'to', newName);
      }
      
      updateFields([...fields]);
    }
  };

  // Validate field name
  const validateFieldName = (name: string): string | null => {
    if (!name.trim()) return "Field name left empty";
    return null;
  };

  // Render field component - simplified horizontal layout
  const renderField = (field: ComplexField, fieldIndex: number, parentPath: string = '', depth: number = 0, objectKey?: string): React.ReactNode => {
    const currentPath = parentPath ? `${parentPath}.${objectKey || field.name}` : objectKey || field.name;
    const isTopLevel = !parentPath;
    const fieldNameError = validateFieldName(field.name);
    const displayName = field.name; // Always use field.name for display

    return (
      <div key={`${parentPath}-${field.id}`} className={`${depth > 0 ? 'ml-8' : ''} mb-3`}>
        {/* Error message */}
        {fieldNameError && (
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-red-300 bg-red-500/10 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-red-500/30">
            <span className="text-red-400 text-sm">●</span>
            {fieldNameError}
          </div>
        )}

        {/* Main field row */}
        <div className="flex items-center gap-4 p-5 bg-slate-800/60 backdrop-blur-sm rounded-xl border border-slate-700/50 hover:border-blue-500/50 hover:bg-slate-700/60 transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-blue-500/10">
          {/* Field name input */}
          <input
            value={displayName}
            onChange={(e) => {
              if (isTopLevel) {
                updateField(fieldIndex, { name: e.target.value });
              } else {
                updateFieldNameInObject(fieldIndex, currentPath, objectKey || field.name, e.target.value);
              }
            }}
            className="min-w-0 w-44 px-4 py-2.5 text-sm font-semibold text-slate-100 bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 shadow-sm"
            placeholder="Field name"
          />

          {/* Type selector */}
          <Select 
            value={field.type} 
            onValueChange={(value: ComplexField['type']) => {
              if (isTopLevel) {
                updateField(fieldIndex, { type: value });
              } else {
                updateNestedField(fieldIndex, currentPath, { type: value });
              }
            }}
          >
            <SelectTrigger className="w-36 h-11 bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-lg font-semibold text-slate-100 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200 shadow-sm hover:bg-slate-800/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800/95 backdrop-blur-md border border-slate-600/50 shadow-2xl rounded-lg">
              <SelectItem value="string" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">String</SelectItem>
              <SelectItem value="number" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">Number</SelectItem>
              <SelectItem value="integer" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">Integer</SelectItem>
              <SelectItem value="boolean" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">Boolean</SelectItem>
              <SelectItem value="array" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">Array</SelectItem>
              <SelectItem value="object" className="font-medium text-slate-100 hover:bg-blue-600/20 focus:bg-blue-600/20 rounded-md">Object</SelectItem>
            </SelectContent>
          </Select>

          {/* Array type selector for arrays */}
          {field.type === 'array' && (
            <Select 
              value={field.items?.type || 'string'} 
              onValueChange={(value: ComplexField['type']) => {
                const newItems = {
                  ...field.items,
                  type: value,
                  id: field.items?.id || generateId(),
                  name: 'item',
                  required: false,
                  description: ''
                } as ComplexField;

                if (isTopLevel) {
                  updateField(fieldIndex, { items: newItems });
                } else {
                  updateNestedField(fieldIndex, currentPath, { items: newItems });
                }
              }}
            >
              <SelectTrigger className="w-40 h-11 bg-orange-500/10 backdrop-blur-sm border border-orange-500/30 rounded-lg font-semibold text-orange-300 focus:ring-2 focus:ring-orange-400/50 transition-all duration-200 shadow-sm hover:bg-orange-500/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800/95 backdrop-blur-md border border-orange-500/30 shadow-2xl rounded-lg">
                <SelectItem value="string" className="font-medium text-slate-100 hover:bg-orange-600/20 focus:bg-orange-600/20 rounded-md">Array/String</SelectItem>
                <SelectItem value="number" className="font-medium text-slate-100 hover:bg-orange-600/20 focus:bg-orange-600/20 rounded-md">Array/Number</SelectItem>
                <SelectItem value="integer" className="font-medium text-slate-100 hover:bg-orange-600/20 focus:bg-orange-600/20 rounded-md">Array/Integer</SelectItem>
                <SelectItem value="boolean" className="font-medium text-slate-100 hover:bg-orange-600/20 focus:bg-orange-600/20 rounded-md">Array/Boolean</SelectItem>
                <SelectItem value="object" className="font-medium text-slate-100 hover:bg-orange-600/20 focus:bg-orange-600/20 rounded-md">Array/Object</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Description input */}
          <input
            value={field.description || ''}
            onChange={(e) => {
              if (isTopLevel) {
                updateField(fieldIndex, { description: e.target.value });
              } else {
                updateNestedField(fieldIndex, currentPath, { description: e.target.value });
              }
            }}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-200 bg-slate-900/80 backdrop-blur-sm border border-slate-600/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all duration-200 shadow-sm"
            placeholder="Description (optional)"
          />

          {/* Add children button for objects */}
          {field.type === 'object' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => addFieldToObject(fieldIndex, currentPath, 'string')}
              className="h-10 px-5 text-sm font-semibold text-blue-300 bg-blue-500/10 backdrop-blur-sm hover:text-blue-200 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
            >
              + Children
            </Button>
          )}

          {/* Delete button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (isTopLevel) {
                removeField(fieldIndex);
              } else {
                removeFieldFromObject(fieldIndex, currentPath, objectKey || field.name);
              }
            }}
            className="h-10 w-10 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20 bg-red-500/10 border border-red-500/30 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nested object properties */}
        {field.type === 'object' && field.properties && Object.entries(field.properties).length > 0 && (
          <div className="mt-2">
            {Object.entries(field.properties).map(([objectKey, propField]) =>
              renderField(propField, fieldIndex, currentPath, depth + 1, objectKey)
            )}
          </div>
        )}
      </div>
    );
  };

  // Generate JSON Schema from fields
  const generateJsonSchemaFromFields = (fields: ComplexField[]) => {
    const convertFieldToSchema = (field: ComplexField): any => {
      const schema: any = {
        type: field.type,
        description: field.description
      };

      // Add validation rules
      if (field.type === 'string') {
        if (field.minLength !== undefined) schema.minLength = field.minLength;
        if (field.maxLength !== undefined) schema.maxLength = field.maxLength;
        if (field.pattern) schema.pattern = field.pattern;
      }

      if (field.type === 'number' || field.type === 'integer') {
        if (field.minimum !== undefined) schema.minimum = field.minimum;
        if (field.maximum !== undefined) schema.maximum = field.maximum;
      }

      // Handle array items
      if (field.type === 'array' && field.items) {
        schema.items = convertFieldToSchema(field.items);
      }

      // Handle object properties
      if (field.type === 'object' && field.properties) {
        schema.properties = {};
        schema.required = [];
        
        Object.entries(field.properties).forEach(([, propField]) => {
          // Use the field's actual name if it's not empty, otherwise skip
          const fieldName = propField.name.trim();
          if (fieldName) {
            schema.properties[fieldName] = convertFieldToSchema(propField);
            if (propField.required) {
              schema.required.push(fieldName);
            }
          }
        });

        if (schema.required.length === 0) {
          delete schema.required;
        }
      }

      return schema;
    };

    // Return schema starting directly with fields - no root object wrapper
    const schema: any = {
      type: 'object',
      properties: {},
      required: []
    };

    fields.forEach(field => {
      // Skip fields with empty names
      if (field.name.trim()) {
        schema.properties[field.name] = convertFieldToSchema(field);
        if (field.required) {
          schema.required.push(field.name);
        }
      }
    });

    if (schema.required.length === 0) {
      delete schema.required;
    }

    return schema;
  };

  // Generate preview
  const generatePreview = () => {
    const schema = generateJsonSchemaFromFields(fields);
    return JSON.stringify(schema, null, 2);
  };

  // Export schema
  const exportSchema = () => {
    const schema = generateJsonSchemaFromFields(fields);
    const blob = new Blob([JSON.stringify(schema, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schema.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear all fields
  const clearSchema = () => {
    if (fields.length > 0) {
      const confirmed = window.confirm('Are you sure you want to clear all fields? This action cannot be undone.');
      if (confirmed) {
        updateFields([]);
      }
    }
  };

  // Convert JSON schema to fields format (for initial schema)
  const convertSchemaToFields = (schema: any): ComplexField[] => {
    const fields: ComplexField[] = [];
    
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([name, prop]: [string, any]) => {
        const field: ComplexField = {
          id: generateId(),
          name,
          type: prop.type || 'string',
          required: schema.required?.includes(name) || false,
          description: prop.description || ''
        };

        // Handle validation rules
        if (prop.minLength !== undefined) field.minLength = prop.minLength;
        if (prop.maxLength !== undefined) field.maxLength = prop.maxLength;
        if (prop.pattern) field.pattern = prop.pattern;
        if (prop.minimum !== undefined) field.minimum = prop.minimum;
        if (prop.maximum !== undefined) field.maximum = prop.maximum;

        // Handle nested objects
        if (prop.type === 'object' && prop.properties) {
          field.properties = {};
          Object.entries(prop.properties).forEach(([nestedName, nestedProp]: [string, any]) => {
            field.properties![nestedName] = {
              id: generateId(),
              name: nestedName,
              type: nestedProp.type || 'string',
              required: prop.required?.includes(nestedName) || false,
              description: nestedProp.description || ''
            };
          });
        }

        // Handle arrays
        if (prop.type === 'array' && prop.items) {
          field.items = {
            id: generateId(),
            name: 'item',
            type: prop.items.type || 'string',
            required: false,
            description: prop.items.description || ''
          };
        }

        fields.push(field);
      });
    }

    return fields;
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-8 bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800 min-h-screen">
      {/* Header */}
      <div className="text-center mb-10">
        <h2 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-4">Schema Builder</h2>
        <p className="text-lg font-medium text-gray-400 max-w-2xl mx-auto">
          Create sophisticated JSON schemas with validation rules and complex data structures
        </p>
        {/* Removed loadedFromStorage and isAutoSaving badges */}
      </div>

      {/* Main Content */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 p-8 shadow-2xl shadow-black/20">
        {/* Field List */}
        <div className="space-y-4 mb-8">
          {fields.length === 0 ? (
            <div className="text-center py-16 bg-slate-700/30 backdrop-blur-sm rounded-xl border border-dashed border-slate-600/50">
              <Package className="h-20 w-20 mx-auto mb-6 text-slate-500" />
              <p className="text-lg font-semibold text-slate-400 mb-2">No fields defined yet</p>
              <p className="text-sm text-slate-500">Start building your schema by adding fields below</p>
            </div>
          ) : (
            fields.map((field, index) => renderField(field, index))
          )}
        </div>

        {/* Add New Field Button */}
        <div className="flex items-center gap-4 pt-8 border-t border-slate-700/50">
          <Button
            onClick={() => addField('string')}
            variant="outline"
            className="flex items-center gap-3 px-6 py-3 border-dashed border-2 border-blue-500/50 bg-blue-500/10 backdrop-blur-sm hover:border-blue-400/70 hover:bg-blue-500/20 text-blue-300 font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-lg hover:shadow-blue-500/20"
          >
            <Plus className="h-5 w-5" />
            Add Field
          </Button>

          <Button
            onClick={() => addField('object')}
            variant="outline"
            className="flex items-center gap-3 px-6 py-3 text-slate-300 font-semibold bg-slate-700/40 backdrop-blur-sm hover:text-blue-300 hover:bg-blue-500/10 border border-slate-600/50 hover:border-blue-500/50 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <Package className="h-5 w-5" />
            Add Object
          </Button>

          <Button
            onClick={() => addField('array')}
            variant="outline"
            className="flex items-center gap-3 px-6 py-3 text-slate-300 font-semibold bg-slate-700/40 backdrop-blur-sm hover:text-orange-300 hover:bg-orange-500/10 border border-slate-600/50 hover:border-orange-500/50 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <List className="h-5 w-5" />
            Add Array
          </Button>

          <div className="flex-1"></div>

          {fields.length > 0 && (
            <>
              <Button 
                variant="outline" 
                onClick={clearSchema} 
                className="px-6 py-3 text-red-300 font-semibold bg-red-500/10 backdrop-blur-sm hover:text-red-200 hover:bg-red-500/20 border border-red-500/30 hover:border-red-400/50 rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
              >
                Clear All
              </Button>
              <Button 
                onClick={exportSchema} 
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold border border-green-500/30 rounded-xl shadow-lg hover:shadow-xl hover:shadow-green-500/20 transition-all duration-200"
              >
                <Download className="h-5 w-5 mr-2" />
                Export Schema
              </Button>
            </>
          )}
        </div>
      </div>

      {/* JSON Preview */}
      {fields.length > 0 && (
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-2xl shadow-black/20">
          <div className="px-8 py-6 border-b border-slate-700/50 bg-slate-700/30 backdrop-blur-sm rounded-t-2xl">
            <h3 className="text-2xl font-bold text-slate-100 mb-2">Generated Schema</h3>
            <p className="text-sm font-medium text-slate-400">
              JSON schema ready for validation and integration
            </p>
          </div>
          <div className="p-0">
            <Textarea
              value={generatePreview()}
              readOnly
              className="font-mono text-sm min-h-[300px] border-0 bg-slate-900/80 text-emerald-400 rounded-t-none rounded-b-2xl focus:ring-0 p-8 leading-relaxed resize-none"
              placeholder="Your generated schema will appear here..."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSchemaBuilder;
