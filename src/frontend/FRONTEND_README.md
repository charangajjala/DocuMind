# Document OCR Frontend

A modern React + TypeScript frontend for the Document OCR application with bounding box visualization and interactive text selection.

## Features

- 🎯 **Interactive Document Visualization**: Click and hover on bounding boxes
- 📝 **Real-time Text Preview**: Hover over bounding boxes to see text content
- 🎨 **Element Type Filtering**: Filter by blocks, paragraphs, lines, or tokens
- 📊 **Analytics Dashboard**: View confidence scores and processing statistics
- 🎭 **Modern UI**: Built with shadcn/ui and Tailwind CSS
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Technology Stack

- **React 19** - Modern React with latest features
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - High-quality UI components
- **Radix UI** - Accessible component primitives
- **Lucide React** - Beautiful icons
- **React Dropzone** - File upload handling

## Getting Started

### 1. Install Dependencies

```bash
cd src/frontend
npm install
```

### 2. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Make sure the Backend API is Running

The frontend connects to the FastAPI backend at `http://localhost:8000`. Make sure it's running:

```bash
# From the project root
python run_api.py
```

## Project Structure

```
src/frontend/
├── src/
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── DocumentVisualization.tsx  # Canvas-based bounding box visualization
│   │   ├── TextBlocksList.tsx  # Interactive text blocks list
│   │   ├── FileUpload.tsx      # Drag & drop file upload
│   │   ├── OCRApp.tsx          # Main application component
│   │   └── SimpleFallback.tsx  # Fallback UI (works without dependencies)
│   ├── services/
│   │   └── api.ts              # API service layer
│   ├── types/
│   │   └── api.ts              # TypeScript type definitions
│   ├── lib/
│   │   └── utils.ts            # Utility functions
│   └── index.css               # Global styles with Tailwind
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

## Key Features

### Bounding Box Visualization
- **Interactive Canvas**: Click and hover on bounding boxes
- **Color Coding**: Different colors for blocks (red), paragraphs (blue), lines (green), tokens (orange)
- **Hover Tooltips**: See text content and confidence scores on hover
- **Element Selection**: Click boxes to highlight corresponding text

### Text Block Management
- **Two-way Synchronization**: Text list and visualization stay in sync
- **Element Filtering**: Toggle visibility of different element types
- **Confidence Indicators**: Visual confidence scores (high/medium/low)
- **Detailed View**: Full text content with character counts and coordinates

### Modern UI Features
- **Drag & Drop Upload**: Easy file selection with visual feedback
- **Tabbed Interface**: Organized view of visualization, results, and quality
- **Real-time Statistics**: Processing time, element counts, confidence averages
- **Responsive Design**: Works on desktop and mobile devices

## Quick Start (Without Dependencies)

The app includes a simplified interface that works immediately without installing shadcn/ui dependencies:

1. Start the backend API:
   ```bash
   python run_api.py
   ```

2. Start the frontend:
   ```bash
   cd src/frontend
   npm run dev
   ```

3. Open http://localhost:3000

You'll see a functional OCR interface that can upload files and display results. After running `npm install`, you'll get the full-featured UI with bounding box visualization!

## Full Installation

For the complete experience with interactive bounding boxes:

```bash
cd src/frontend
npm install
npm run dev
```

## API Integration

The frontend connects to these backend endpoints:
- `POST /ocr/upload` - Upload and process files
- `POST /ocr/base64` - Process base64 images
- `GET /health` - Check API status

## Development Notes

- The app automatically handles missing dependencies gracefully
- Canvas-based visualization provides smooth interaction
- TypeScript ensures type safety throughout
- Tailwind CSS provides consistent styling
- shadcn/ui components offer accessibility and polish

Enjoy building with the modern Document OCR frontend! 🚀
