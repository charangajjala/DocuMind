import type { OCRRequest, OCRResponse } from '@/types/api';

const API_BASE_URL = 'http://localhost:8000';

export class ApiService {
  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = 'API request failed';
      
      try {
        const errorData = await response.json();
        
        // Handle various error response formats
        if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error_message) {
          errorMessage = errorData.error_message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.errors && Array.isArray(errorData.errors) && errorData.errors.length > 0) {
          errorMessage = errorData.errors[0];
        } else {
          // If none of the standard fields are present, stringify the whole error
          errorMessage = JSON.stringify(errorData);
        }
      } catch (parseError) {
        // If we can't parse the error response, use the status text
        errorMessage = response.statusText || `HTTP ${response.status}`;
      }
      
      throw new Error(errorMessage);
    }
    return response.json();
  }

  static async processOCR(imageData: string, confidenceThreshold = 0.8): Promise<OCRResponse> {
    const request: OCRRequest = {
      image_data: imageData,
      confidence_threshold: confidenceThreshold,
    };

    const response = await fetch(`${API_BASE_URL}/ocr/base64`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse<OCRResponse>(response);
  }

  // Alias for processOCR for backward compatibility
  static async extractTextFromBase64(request: OCRRequest): Promise<OCRResponse> {
    return this.processOCR(request.image_data, request.confidence_threshold);
  }

  static async uploadFile(file: File, confidenceThreshold = 0.8): Promise<OCRResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('confidence_threshold', confidenceThreshold.toString());

    const response = await fetch(`${API_BASE_URL}/ocr/upload`, {
      method: 'POST',
      body: formData,
    });

    return this.handleResponse<OCRResponse>(response);
  }

  static async extractStructuredData(imageData: string, jsonSchema?: any, userPrompt?: string): Promise<any> {
    // Validate that at least one of schema or prompt is provided
    if (!jsonSchema && !userPrompt) {
      throw new Error('Either jsonSchema or userPrompt must be provided');
    }

    const request: any = {
      image_data: imageData,
    };

    // Only include schema if provided
    if (jsonSchema) {
      request.json_schema = jsonSchema;
    }

    // Only include user prompt if provided
    if (userPrompt) {
      request.user_prompt = userPrompt;
    }

    const response = await fetch(`${API_BASE_URL}/extract/structured`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    return this.handleResponse(response);
  }

  static async validateSchema(schema: any): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/schema/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schema),
    });

    return this.handleResponse(response);
  }

  static async getSchemaTemplates(): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/schema/templates`);
    return this.handleResponse(response);
  }

  static async checkHealth(): Promise<{ status: string; service: string; google_document_ai: string; azure_openai: string }> {
    const response = await fetch(`${API_BASE_URL}/health`);
    return this.handleResponse(response);
  }

  static fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove the data URL prefix
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
