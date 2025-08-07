import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Plus, 
  Trash2, 
  Settings,
  FileText,
  Hash,
  ToggleLeft,
  Calendar,
  Mail,
  Phone,
  DollarSign,
  MapPin,
  User,
  Building,
  Eye,
  Code
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SchemaField {
  id: string;
  name: string;
  description: string;
  type: string;
  required?: boolean;
}

interface InteractiveSchemaBuilderProps {
  schema: SchemaField[];
  onSchemaChange: (schema: SchemaField[]) => void;
  onExtract?: () => void;
  isExtracting?: boolean;
  disabled?: boolean;
}

const FIELD_TYPES = [
  { value: 'string', label: 'Text', icon: FileText, description: 'Any text content', color: 'bg-blue-100 text-blue-700' },
  { value: 'number', label: 'Number', icon: Hash, description: 'Numeric values', color: 'bg-green-100 text-green-700' },
  { value: 'boolean', label: 'Boolean', icon: ToggleLeft, description: 'True/False values', color: 'bg-purple-100 text-purple-700' },
  { value: 'date', label: 'Date', icon: Calendar, description: 'Date values', color: 'bg-orange-100 text-orange-700' },
  { value: 'email', label: 'Email', icon: Mail, description: 'Email addresses', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'phone', label: 'Phone', icon: Phone, description: 'Phone numbers', color: 'bg-pink-100 text-pink-700' },
  { value: 'currency', label: 'Currency', icon: DollarSign, description: 'Money amounts', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'address', label: 'Address', icon: MapPin, description: 'Physical addresses', color: 'bg-red-100 text-red-700' },
];

const COMMON_FIELDS = [
  { name: 'customer_name', description: 'Full name of the customer', type: 'string', icon: User },
  { name: 'company_name', description: 'Name of the company or organization', type: 'string', icon: Building },
  { name: 'invoice_number', description: 'Invoice or document number', type: 'string', icon: FileText },
  { name: 'total_amount', description: 'Total amount or value', type: 'currency', icon: DollarSign },
  { name: 'date', description: 'Date on the document', type: 'date', icon: Calendar },
  { name: 'email', description: 'Email address', type: 'email', icon: Mail },
  { name: 'phone_number', description: 'Contact phone number', type: 'phone', icon: Phone },
  { name: 'address', description: 'Full address', type: 'address', icon: MapPin },
];

export function InteractiveSchemaBuilder({ 
  schema, 
  onSchemaChange, 
  onExtract, 
  isExtracting = false,
  disabled = false
}: InteractiveSchemaBuilderProps) {
  const [showPreview, setShowPreview] = useState(false);
  
  const addSchemaField = (template?: Partial<SchemaField>) => {
    const newField: SchemaField = {
      id: `field-${Date.now()}`,
      name: template?.name || '',
      description: template?.description || '',
      type: template?.type || 'string',
      required: template?.required || false,
    };
    onSchemaChange([...schema, newField]);
  };

  const removeSchemaField = (id: string) => {
    onSchemaChange(schema.filter(field => field.id !== id));
  };

  const updateSchemaField = (id: string, updates: Partial<SchemaField>) => {
    onSchemaChange(schema.map(field => 
      field.id === id ? { ...field, ...updates } : field
    ));
  };

  const getTypeConfig = (type: string) => {
    return FIELD_TYPES.find(t => t.value === type) || FIELD_TYPES[0];
  };

  const generateJsonSchema = () => {
    return {
      type: "object",
      properties: schema.reduce((acc, field) => {
        let fieldType = 'string';
        switch (field.type) {
          case 'number':
          case 'currency':
            fieldType = 'number';
            break;
          case 'boolean':
            fieldType = 'boolean';
            break;
          default:
            fieldType = 'string';
        }
        
        acc[field.name] = {
          type: fieldType,
          description: field.description || `Extract ${field.name} from the document`
        };
        return acc;
      }, {} as Record<string, any>),
      required: schema.filter(field => field.required && field.name).map(field => field.name)
    };
  };

  const canExtract = schema.length > 0 && schema.every(field => field.name.trim());

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings className="h-5 w-5 text-purple-600" />
              <span>Interactive Schema Builder</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {schema.length} field{schema.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          <CardDescription>
            Define the fields you want to extract from your document. Choose from common templates or create custom fields.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Add Common Fields */}
          {schema.length === 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Quick Start - Common Fields</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {COMMON_FIELDS.map((template, index) => {
                  const IconComponent = template.icon;
                  const typeConfig = getTypeConfig(template.type);
                  return (
                    <Button
                      key={index}
                      variant="outline"
                      size="sm"
                      className="h-auto p-3 flex flex-col items-center space-y-1"
                      onClick={() => addSchemaField(template)}
                      disabled={disabled}
                    >
                      <IconComponent className="h-4 w-4" />
                      <span className="text-xs font-medium">{template.name.replace('_', ' ')}</span>
                      <Badge variant="secondary" className={cn("text-xs", typeConfig.color)}>
                        {typeConfig.label}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
              <Separator className="my-4" />
            </div>
          )}

          {/* Schema Fields */}
          <div className="space-y-4">
            {schema.map((field, index) => {
              const typeConfig = getTypeConfig(field.type);
              const TypeIcon = typeConfig.icon;
              
              return (
                <Card key={field.id} className="border-2 border-dashed border-gray-200 dark:border-gray-800">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          Field {index + 1}
                        </Badge>
                        <Badge className={cn("text-xs", typeConfig.color)}>
                          <TypeIcon className="h-3 w-3 mr-1" />
                          {typeConfig.label}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSchemaField(field.id)}
                        disabled={disabled}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`name-${field.id}`} className="text-sm font-medium">
                          Field Name *
                        </Label>
                        <Input
                          id={`name-${field.id}`}
                          placeholder="e.g., customer_name"
                          value={field.name}
                          onChange={(e) => updateSchemaField(field.id, { name: e.target.value })}
                          disabled={disabled}
                          className="text-sm"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor={`type-${field.id}`} className="text-sm font-medium">
                          Data Type
                        </Label>
                        <Select 
                          value={field.type} 
                          onValueChange={(value) => updateSchemaField(field.id, { type: value })}
                          disabled={disabled}
                        >
                          <SelectTrigger className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((type) => {
                              const IconComponent = type.icon;
                              return (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center space-x-2">
                                    <IconComponent className="h-4 w-4" />
                                    <div>
                                      <span className="font-medium">{type.label}</span>
                                      <p className="text-xs text-muted-foreground">{type.description}</p>
                                    </div>
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center justify-between">
                          Required Field
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateSchemaField(field.id, { required: !field.required })}
                            disabled={disabled}
                            className={cn(
                              "h-6 w-10 rounded-full p-0 transition-colors",
                              field.required 
                                ? "bg-green-500 hover:bg-green-600" 
                                : "bg-gray-200 dark:bg-gray-700 hover:bg-gray-300"
                            )}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded-full bg-white transition-transform",
                              field.required ? "translate-x-4" : "translate-x-0"
                            )} />
                          </Button>
                        </Label>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`desc-${field.id}`} className="text-sm font-medium">
                        Description / Instructions
                      </Label>
                      <Textarea
                        id={`desc-${field.id}`}
                        placeholder="Describe what to extract and provide any specific instructions..."
                        value={field.description}
                        onChange={(e) => updateSchemaField(field.id, { description: e.target.value })}
                        disabled={disabled}
                        className="text-sm min-h-[60px] resize-none"
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Add Field Button */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button 
              variant="outline" 
              onClick={() => addSchemaField()}
              disabled={disabled}
              className="flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Custom Field</span>
            </Button>
            
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="flex items-center space-x-1"
              >
                <Eye className="h-4 w-4" />
                <span>Preview Schema</span>
              </Button>
              
              {onExtract && (
                <Button 
                  onClick={onExtract}
                  disabled={isExtracting || !canExtract || disabled}
                  className="h-12 px-8"
                  size="lg"
                >
                  {isExtracting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Extracting Data...
                    </>
                  ) : (
                    <>
                      <Settings className="h-5 w-5 mr-2" />
                      Extract Structured Data
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schema Preview */}
      {showPreview && schema.length > 0 && (
        <Card className="border-0 shadow-lg bg-slate-50 dark:bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg">
              <Code className="h-5 w-5" />
              <span>JSON Schema Preview</span>
            </CardTitle>
            <CardDescription>
              This is the JSON schema that will be sent to the AI for extraction
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-64 w-full">
              <pre className="text-xs bg-white dark:bg-slate-950 p-4 rounded-lg overflow-auto">
                {JSON.stringify(generateJsonSchema(), null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
