# Document OCR API

A comprehensive document text extraction system using Google Document AI with a modern web interface.

## 🚀 Features

- **Advanced OCR**: Uses Google Document AI for high-accuracy text extraction
- **Bounding Box Visualization**: Visual representation of detected text regions
- **Confidence Scoring**: Quality metrics for each extracted text block
- **REST API**: FastAPI-based backend with automatic documentation
- **Interactive UI**: React frontend with real-time visualization
- **Clean Architecture**: SOLID principles, dependency injection, and modular design
- **Production Ready**: Proper error handling, logging, and configuration management

## 🏗️ Architecture

The project follows clean architecture principles with clear separation of concerns:

```
src/
├── document_ocr/           # Core OCR domain logic
│   ├── core/              # Interfaces and exceptions
│   ├── models/            # Domain models and DTOs
│   ├── services/          # Business logic implementations
│   └── utils/             # Utility classes
├── api/                   # FastAPI REST API
└── frontend/              # React web interface
```

### Key Design Patterns

- **Dependency Inversion**: Abstract interfaces with concrete implementations
- **Single Responsibility**: Each class has one clear purpose  
- **Open/Closed**: Easy to extend with new OCR providers
- **Interface Segregation**: Focused, minimal interfaces
- **Dependency Injection**: Loosely coupled components

## 🛠️ Setup

### Prerequisites

- Python 3.11+
- Google Cloud Project with Document AI enabled
- Service account key with Document AI permissions

### 1. Install Dependencies

```bash
# Install using uv (recommended)
uv sync

# Or using pip
pip install -e .
```

### 2. Google Cloud Setup

1. Create a Google Cloud Project
2. Enable the Document AI API
3. Create a Document AI processor (OCR processor)
4. Create a service account and download the JSON key
5. Note your project ID, processor ID, and location

### 3. Configuration

```bash
# Copy example configuration
cp config/.env.example .env

# Edit .env with your settings
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
GOOGLE_CLOUD_PROJECT=your-project-id
DOCUMENT_AI_PROCESSOR_ID=your-processor-id
DOCUMENT_AI_LOCATION=us
```

## 🚀 Usage

### Automated Startup (Recommended)

**Option A: Interactive launcher (Cross-platform)**
```bash
python main.py
```
Choose from:
- Single terminal (sequential startup)
- Multiple terminals (Windows only)
- Manual instructions

**Option B: Windows batch file**
```bash
start_servers.bat
```

**Option C: Manual startup**
```bash
# Terminal 1 - Backend
python run_api.py

# Terminal 2 - Frontend  
cd src/frontend
npm install  # (if first time)
npm run dev
```

### Access the Application

- **Frontend UI**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Legacy Startup (Individual Services)

### Start the Backend API

```bash
python run_api.py
```

API will be available at:
- **API**: http://localhost:8000
- **Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

### Start the Frontend

```bash
cd src/frontend
npm install  # (if first time)
npm run dev
```

Web interface will be available at: http://localhost:5173

### API Endpoints

#### POST `/ocr/base64`
Extract text from base64-encoded image.

**Request:**
```json
{
  "image_data": "base64_encoded_image_string",
  "confidence_threshold": 0.8
}
```

**Response:**
```json
{
  "full_text": "Extracted text content...",
  "text_blocks": [
    {
      "text": "Individual text block",
      "confidence": 0.95,
      "bounding_box": {
        "x_min": 0.1, "y_min": 0.1,
        "x_max": 0.5, "y_max": 0.2
      }
    }
  ],
  "image_dimensions": {"width": 800, "height": 600},
  "processing_time": 1.23,
  "success": true
}
```

#### POST `/ocr/upload`
Extract text from uploaded file.

**Parameters:**
- `file`: Image file (PNG, JPG, JPEG, TIFF, PDF)
- `confidence_threshold`: Minimum confidence (0.0-1.0)

## 🎯 Core Components

### OCR Service (`GoogleDocumentAIOCRService`)
- Handles Google Document AI integration
- Extracts text with bounding boxes and confidence scores
- Implements retry logic and error handling

### Document Processor (`DocumentOCRProcessor`)
- Orchestrates the complete OCR workflow
- Applies confidence filtering
- Manages preprocessing and post-processing

### Image Processor (`PILImageProcessor`)
- Validates and preprocesses images
- Applies enhancements for better OCR accuracy
- Handles format conversions and resizing

### Visualization (`BoundingBoxVisualizer`)
- Creates visual representations of OCR results
- Draws bounding boxes on original images
- Generates analysis summaries

## 🧪 Development

### Project Structure

```
document-ocr-api/
├── src/
│   ├── document_ocr/
│   │   ├── core/              # Abstract interfaces
│   │   │   ├── interfaces.py   # Core abstractions
│   │   │   └── exceptions.py   # Custom exceptions
│   │   ├── models/
│   │   │   └── domain.py      # Domain models & DTOs
│   │   ├── services/
│   │   │   ├── google_document_ai.py  # Google AI service
│   │   │   └── document_processor.py  # Main processor
│   │   └── utils/
│   │       ├── config.py      # Configuration management
│   │       ├── image_processor.py     # Image utilities
│   │       └── visualization.py      # Visualization tools
│   ├── api/
│   │   └── main.py           # FastAPI application
│   └── frontend/
│       └── streamlit_app.py  # Streamlit interface
├── config/
│   └── .env.example         # Configuration template
├── run_api.py              # API server launcher
├── run_streamlit.py        # Frontend launcher
├── main.py                 # Development info
└── pyproject.toml          # Dependencies & metadata
```

### Adding New OCR Providers

1. Implement the `OCRService` interface:

```python
class NewOCRService(OCRService):
    async def extract_text(self, image_data: bytes, **kwargs) -> DocumentOCRResult:
        # Your implementation
        pass
```

2. Update the dependency injection in the processors.

### Configuration Management

The application uses a flexible configuration system:

```python
# Environment variables take precedence
config = EnvironmentConfigProvider()

# Custom config file
config = EnvironmentConfigProvider("custom_config.txt")

# Get configuration values
project_id = config.get_config('GOOGLE_CLOUD_PROJECT')
```

## 🔒 Security Considerations

- Store service account keys securely
- Use environment variables for sensitive data
- Implement rate limiting in production
- Validate all input files and sizes
- Use HTTPS in production deployments

## 📊 Performance

- Image preprocessing improves OCR accuracy
- Confidence thresholds filter low-quality results
- Async processing handles concurrent requests
- Memory-efficient image handling
- Caching strategies for repeated requests

## 🔧 Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to service account JSON | Required |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | Required |
| `DOCUMENT_AI_PROCESSOR_ID` | Document AI processor ID | Required |
| `DOCUMENT_AI_LOCATION` | Processor location | `us` |
| `API_HOST` | API server host | `0.0.0.0` |
| `API_PORT` | API server port | `8000` |
|`MAX_IMAGE_SIZE` | Max upload size in bytes | `10485760` |
| `OCR_CONFIDENCE_THRESHOLD` | Default confidence threshold | `0.8` |

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM python:3.11-slim

WORKDIR /app
COPY . .

RUN pip install uv && uv sync --frozen

EXPOSE 8000 8501

CMD ["python", "run_api.py"]
```

### Production Considerations

- Use a production WSGI server (Gunicorn)
- Set up proper logging and monitoring
- Configure CORS policies appropriately
- Implement authentication and authorization
- Use a reverse proxy (Nginx)
- Set up health checks and auto-scaling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following the established patterns
4. Add tests for new functionality
5. Update documentation
6. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **Google Cloud Authentication Errors**
   - Verify service account key path
   - Check IAM permissions
   - Ensure Document AI API is enabled

2. **API Connection Issues**
   - Check if FastAPI server is running
   - Verify host/port configuration
   - Check firewall settings

3. **Image Processing Errors**
   - Validate image format and size
   - Check memory availability
   - Verify PIL/OpenCV installation

4. **Import Errors**
   - Ensure dependencies are installed
   - Check Python path configuration
   - Verify virtual environment activation

For more detailed troubleshooting, check the logs and API documentation at `/docs`.