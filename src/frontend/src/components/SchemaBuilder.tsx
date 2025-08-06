import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Trash2, Eye, Download, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  required: boolean;
  description?: string;
  format?: string;
  properties?: { [key: string]: SchemaField };
  items?: SchemaField;
}

interface SchemaBuilderProps {
  onSchemaChange: (schema: any) => void;
  onTemplateLoad: (templateName: string) => void;
  templates: { [key: string]: any };
  initialSchema?: any;
}

export function SchemaBuilder({ 
  onSchemaChange, 
  onTemplateLoad, 
  templates, 
  initialSchema 
}: SchemaBuilderProps) {
  const [schema, setSchema] = useState<SchemaField>({
    name: 'root',
    type: 'object',
    required: false,
    description: 'Document extraction schema',
    properties: initialSchema?.properties || {}
  });

  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const generateJsonSchema = useCallback((field: SchemaField): any => {
    const jsonSchema: any = {
      type: field.type,
    };

    if (field.description) {
      jsonSchema.description = field.description;
    }

    if (field.format) {
      jsonSchema.format = field.format;
    }

    if (field.type === 'object' && field.properties) {
      jsonSchema.properties = {};
      const required: string[] = [];

      Object.entries(field.properties).forEach(([key, prop]) => {
        jsonSchema.properties[key] = generateJsonSchema(prop);
        if (prop.required) {
          required.push(key);
        }
      });

      if (required.length > 0) {
        jsonSchema.required = required;
      }
    }

    if (field.type === 'array' && field.items) {
      jsonSchema.items = generateJsonSchema(field.items);
    }

    return jsonSchema;
  }, []);

  const updateSchema = useCallback((newSchema: SchemaField) => {
    setSchema(newSchema);
    const jsonSchema = generateJsonSchema(newSchema);
    onSchemaChange(jsonSchema);
  }, [generateJsonSchema, onSchemaChange]);

  const addProperty = useCallback((parentPath: string = '') => {
    const newSchema = { ...schema };
    const target = parentPath ? getNestedProperty(newSchema, parentPath) : newSchema;
    
    if (target?.properties) {
      const newFieldName = `field_${Object.keys(target.properties).length + 1}`;
      target.properties[newFieldName] = {
        name: newFieldName,
        type: 'string',
        required: false,
        description: ''
      };
    }
    
    updateSchema(newSchema);
  }, [schema, updateSchema]);

  const removeProperty = useCallback((parentPath: string, fieldName: string) => {
    const newSchema = { ...schema };
    const target = parentPath ? getNestedProperty(newSchema, parentPath) : newSchema;
    
    if (target?.properties && target.properties[fieldName]) {
      delete target.properties[fieldName];
    }
    
    updateSchema(newSchema);
  }, [schema, updateSchema]);

  const updateProperty = useCallback((
    parentPath: string, 
    fieldName: string, 
    updates: Partial<SchemaField>
  ) => {
    const newSchema = { ...schema };
    const target = parentPath ? getNestedProperty(newSchema, parentPath) : newSchema;
    
    if (target?.properties && target.properties[fieldName]) {
      target.properties[fieldName] = {
        ...target.properties[fieldName],
        ...updates
      };
    }
    
    updateSchema(newSchema);
  }, [schema, updateSchema]);

  const getNestedProperty = (obj: any, path: string): any => {
    return path.split('.').reduce((current, key) => {
      return current?.properties?.[key];
    }, obj);
  };

  const validateSchema = async () => {
    try {
      const response = await fetch('/api/schema/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(generateJsonSchema(schema)),
      });
      
      const result = await response.json();
      setValidationResult(result.validation_result);
    } catch (error) {
      console.error('Schema validation failed:', error);
      setValidationResult({
        is_valid: false,
        errors: ['Failed to validate schema'],
        suggestions: []
      });
    }
  };

  const loadTemplate = useCallback((templateName: string) => {
    if (templates[templateName]) {
      const template = templates[templateName];
      const convertedSchema = convertJsonSchemaToSchemaField(template);
      setSchema(convertedSchema);
      onTemplateLoad(templateName);
      updateSchema(convertedSchema);
    }
  }, [templates, onTemplateLoad, updateSchema]);

  const convertJsonSchemaToSchemaField = (jsonSchema: any): SchemaField => {
    const field: SchemaField = {
      name: 'root',
      type: jsonSchema.type || 'string',
      required: false,
      description: jsonSchema.description || ''
    };

    if (jsonSchema.format) {
      field.format = jsonSchema.format;
    }

    if (jsonSchema.type === 'object' && jsonSchema.properties) {
      field.properties = {};
      const required = jsonSchema.required || [];

      Object.entries(jsonSchema.properties).forEach(([key, prop]: [string, any]) => {
        field.properties![key] = {
          ...convertJsonSchemaToSchemaField(prop),
          name: key,
          required: required.includes(key)
        };
      });
    }

    if (jsonSchema.type === 'array' && jsonSchema.items) {
      field.items = convertJsonSchemaToSchemaField(jsonSchema.items);
    }

    return field;
  };

  const exportSchema = () => {
    const jsonSchema = generateJsonSchema(schema);
    const blob = new Blob([JSON.stringify(jsonSchema, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extraction-schema.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importSchema = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedSchema = JSON.parse(e.target?.result as string);
          const convertedSchema = convertJsonSchemaToSchemaField(importedSchema);
          setSchema(convertedSchema);
          updateSchema(convertedSchema);
        } catch (error) {
          console.error('Failed to import schema:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  const renderField = (
    field: SchemaField, 
    fieldName: string, 
    parentPath: string = '', 
    level: number = 0
  ): React.ReactNode => {
    const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
    const indentClass = `ml-${level * 4}`;

    return (
      <div key={currentPath} className={`space-y-3 ${level > 0 ? indentClass : ''}`}>
        <Card className={`${level > 0 ? 'border-l-2 border-l-blue-200' : ''}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Badge variant={field.required ? "default" : "secondary"}>
                  {field.type}
                </Badge>
                <span className="font-medium">{fieldName}</span>
                {field.required && (
                  <Badge variant="destructive" className="text-xs">
                    Required
                  </Badge>
                )}
              </div>
              {level > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeProperty(parentPath, fieldName)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Field Name</Label>
                <Input
                  value={fieldName}
                  onChange={(e) => {
                    const newName = e.target.value;
                    if (level > 0) {
                      // Handle field renaming
                      const newSchema = { ...schema };
                      const parent = parentPath ? getNestedProperty(newSchema, parentPath) : newSchema;
                      if (parent?.properties) {
                        parent.properties[newName] = parent.properties[fieldName];
                        delete parent.properties[fieldName];
                        updateSchema(newSchema);
                      }
                    }
                  }}
                  disabled={level === 0}
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={field.type}
                  onValueChange={(value) => 
                    updateProperty(parentPath, fieldName, { 
                      type: value as SchemaField['type'] 
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">String</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="integer">Integer</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="array">Array</SelectItem>
                    <SelectItem value="object">Object</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {field.type === 'string' && (
              <div>
                <Label>Format (optional)</Label>
                <Select
                  value={field.format || ''}
                  onValueChange={(value) => 
                    updateProperty(parentPath, fieldName, { format: value || undefined })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select format..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="time">Time</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="uri">URI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Description</Label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={field.description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                  updateProperty(parentPath, fieldName, { description: e.target.value })
                }
                placeholder="Describe what this field should contain..."
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={`required-${currentPath}`}
                checked={field.required}
                onChange={(e) => 
                  updateProperty(parentPath, fieldName, { required: e.target.checked })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor={`required-${currentPath}`}>Required field</Label>
            </div>
          </CardContent>
        </Card>

        {field.type === 'object' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Properties</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => addProperty(currentPath)}
                className="flex items-center space-x-1"
              >
                <Plus className="h-4 w-4" />
                <span>Add Property</span>
              </Button>
            </div>
            {field.properties && Object.entries(field.properties).map(([propName, prop]) =>
              renderField(prop, propName, currentPath, level + 1)
            )}
          </div>
        )}

        {field.type === 'array' && field.items && (
          <div className="space-y-3">
            <h4 className="font-medium">Array Items</h4>
            {renderField(field.items, 'items', currentPath, level + 1)}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Schema Builder</span>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={validateSchema}
              className="flex items-center space-x-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Validate</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowJsonPreview(!showJsonPreview)}
              className="flex items-center space-x-1"
            >
              <Eye className="h-4 w-4" />
              <span>Preview</span>
            </Button>
          </div>
        </CardTitle>
        <CardDescription>
          Build your JSON schema for structured data extraction
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Template Selection */}
        <div className="flex flex-wrap gap-2">
          <span className="text-sm font-medium">Quick Templates:</span>
          {Object.keys(templates).map((templateName) => (
            <Button
              key={templateName}
              variant="outline"
              size="sm"
              onClick={() => loadTemplate(templateName)}
              className="capitalize"
            >
              {templateName}
            </Button>
          ))}
        </div>

        <Separator />

        {/* Schema Builder */}
        <div className="space-y-4">
          {renderField(schema, 'root')}
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={() => addProperty('')}
              className="flex items-center space-x-1"
            >
              <Plus className="h-4 w-4" />
              <span>Add Root Property</span>
            </Button>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={exportSchema}>
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={importSchema}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-1" />
                Import
              </Button>
            </div>
          </div>
        </div>

        {/* Validation Result */}
        {validationResult && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                {validationResult.is_valid ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500" />
                )}
                <span>Validation Result</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {validationResult.is_valid ? (
                <p className="text-green-600">Schema is valid!</p>
              ) : (
                <div className="space-y-2">
                  {validationResult.errors?.map((error: string, index: number) => (
                    <p key={index} className="text-red-600 text-sm">• {error}</p>
                  ))}
                  {validationResult.suggestions?.length > 0 && (
                    <div className="mt-3">
                      <h5 className="font-medium">Suggestions:</h5>
                      {validationResult.suggestions.map((suggestion: string, index: number) => (
                        <p key={index} className="text-blue-600 text-sm">• {suggestion}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* JSON Preview */}
        {showJsonPreview && (
          <Card>
            <CardHeader>
              <CardTitle>JSON Schema Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-gray-50 p-4 rounded-md overflow-auto max-h-96">
                {JSON.stringify(generateJsonSchema(schema), null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
