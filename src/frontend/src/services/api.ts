import type { OCRRequest, OCRResponse, ApiError } from '@/types/api';

const API_BASE_URL = 'http://localhost:8000';

export class ApiService {
  private static async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.detail || 'API request failed');
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

  static async checkHealth(): Promise<{ status: string; service: string; google_document_ai: string }> {
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
