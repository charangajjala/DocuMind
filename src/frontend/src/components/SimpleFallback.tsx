import { useState } from 'react';

export function SimpleFallback() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleProcess = async () => {
    if (!selectedFile) return;
    
    setProcessing(true);
    
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('confidence_threshold', '0.8');

      const response = await fetch('http://localhost:8000/ocr/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setResults(data);
      } else {
        alert('Error processing document');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Error connecting to API');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        📄 Document OCR Application
      </h1>
      <p style={{ textAlign: 'center', marginBottom: '30px', color: '#666' }}>
        Extract text from document images using Google Document AI
      </p>

      {/* File Upload */}
      <div style={{ 
        border: '2px dashed #ddd', 
        borderRadius: '8px', 
        padding: '40px', 
        textAlign: 'center',
        marginBottom: '20px'
      }}>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={handleFileChange}
          style={{ marginBottom: '10px' }}
        />
        <p style={{ color: '#666', fontSize: '14px' }}>
          Upload PNG, JPG, JPEG, TIFF, or PDF files
        </p>
      </div>

      {/* Process Button */}
      {selectedFile && (
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <p style={{ marginBottom: '10px' }}>
            Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
          </p>
          <button
            onClick={handleProcess}
            disabled={processing}
            style={{
              padding: '12px 24px',
              backgroundColor: processing ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: processing ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {processing ? 'Processing...' : 'Process Document'}
          </button>
        </div>
      )}

      {/* Results */}
      {results && (
        <div>
          <h2>Results</h2>
          
          {/* Stats */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '20px',
            marginBottom: '30px'
          }}>
            <div style={{ 
              padding: '20px', 
              border: '1px solid #ddd', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3>Total Elements</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {results.text_blocks?.length || 0}
              </p>
            </div>
            <div style={{ 
              padding: '20px', 
              border: '1px solid #ddd', 
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <h3>Processing Time</h3>
              <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {results.processing_time?.toFixed(2) || 0}s
              </p>
            </div>
          </div>

          {/* Text Blocks */}
          <div style={{ marginBottom: '30px' }}>
            <h3>Extracted Text Blocks</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
              {results.text_blocks?.map((block: any, index: number) => (
                <div key={index} style={{ 
                  padding: '15px', 
                  borderBottom: '1px solid #eee',
                  backgroundColor: index % 2 === 0 ? '#f9f9f9' : 'white'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ 
                      background: '#007bff', 
                      color: 'white', 
                      padding: '2px 8px', 
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {block.element_type?.toUpperCase() || 'BLOCK'}
                    </span>
                    <span style={{ 
                      color: block.confidence >= 0.9 ? 'green' : block.confidence >= 0.7 ? 'orange' : 'red',
                      fontWeight: 'bold'
                    }}>
                      {Math.round((block.confidence || 0) * 100)}%
                    </span>
                  </div>
                  <p style={{ margin: 0, lineHeight: '1.4' }}>
                    {block.text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Full Text */}
          <div>
            <h3>Full Extracted Text</h3>
            <div style={{ 
              padding: '20px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '8px',
              maxHeight: '300px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace'
            }}>
              {results.full_text}
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px',
        textAlign: 'center',
        color: '#666'
      }}>
        <p>
          <strong>Note:</strong> This is a simplified interface. After installing dependencies with <code>npm install</code>, 
          you'll get the full featured UI with bounding box visualization, interactive text selection, and more!
        </p>
      </div>
    </div>
  );
}
