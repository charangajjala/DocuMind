"""Visualization utilities for drawing bounding boxes on images."""

import io
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import numpy as np

from ..models.domain import TextBlock, BoundingBox


class BoundingBoxVisualizer:
    """Utility class for visualizing bounding boxes on images."""
    
    def __init__(self, line_width: int = 2):
        """Initialize visualizer with styling options."""
        self.line_width = line_width
        # Color scheme for different element types
        self.colors = {
            'block': 'red',
            'paragraph': 'blue', 
            'line': 'green',
            'token': 'orange'
        }
    
    def draw_bounding_boxes_pil(
        self, 
        image_data: bytes, 
        text_blocks: List[TextBlock], 
        show_confidence: bool = True
    ) -> bytes:
        """Draw bounding boxes on image using PIL and return as bytes."""
        try:
            # Open image
            img = Image.open(io.BytesIO(image_data))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            draw = ImageDraw.Draw(img)
            
            # Try to load a font, fall back to default if not available
            try:
                font = ImageFont.truetype("arial.ttf", 12)
            except (OSError, IOError):
                font = ImageFont.load_default()
            
            # Draw each bounding box
            for text_block in text_blocks:
                bbox = text_block.bounding_box.to_pixel_coordinates(img.width, img.height)
                
                # Draw rectangle
                draw.rectangle(
                    [bbox.x_min, bbox.y_min, bbox.x_max, bbox.y_max],
                    outline=self.box_color,
                    width=self.line_width
                )
                
                # Draw confidence score if requested
                if show_confidence:
                    confidence_text = f"{text_block.confidence:.2f}"
                    text_bbox = draw.textbbox((bbox.x_min, bbox.y_min - 15), confidence_text, font=font)
                    draw.rectangle(text_bbox, fill='white', outline=self.text_color)
                    draw.text(
                        (bbox.x_min, bbox.y_min - 15),
                        confidence_text,
                        fill=self.text_color,
                        font=font
                    )
            
            # Convert back to bytes
            output = io.BytesIO()
            img.save(output, format='PNG')
            return output.getvalue()
            
        except Exception as e:
            raise ValueError(f"Failed to draw bounding boxes: {str(e)}")
    
    def create_matplotlib_visualization(
        self, 
        image_data: bytes, 
        text_blocks: List[TextBlock],
        figsize: Tuple[int, int] = (12, 8),
        element_types: List[str] = None,
        highlight_element: TextBlock = None
    ) -> bytes:
        """Create a single matplotlib visualization with bounding boxes and optional highlighting."""
        try:
            # Open image
            img = Image.open(io.BytesIO(image_data))
            if img.mode != 'RGB':
                img = img.convert('RGB')
            
            img_array = np.array(img)
            
            # Filter element types if specified
            if element_types:
                filtered_blocks = [block for block in text_blocks if block.element_type in element_types] 
            else:
                filtered_blocks = text_blocks
            
            # Create single figure
            fig, ax = plt.subplots(1, 1, figsize=figsize)
            ax.imshow(img_array)
            
            if len(filtered_blocks) == 0:
                ax.set_title("No text elements found")
                ax.axis('off')
            else:
                # Draw all bounding boxes
                for i, text_block in enumerate(filtered_blocks):
                    bbox = text_block.bounding_box.to_pixel_coordinates(img.width, img.height)
                    
                    # Determine color and style
                    element_type = getattr(text_block, 'element_type', 'block')
                    color = self.colors.get(element_type, 'purple')
                    
                    # Check if this is the highlighted element
                    is_highlighted = (highlight_element and 
                                    text_block.text == highlight_element.text and
                                    text_block.bounding_box.x_min == highlight_element.bounding_box.x_min and
                                    text_block.bounding_box.y_min == highlight_element.bounding_box.y_min)
                    
                    # Adjust styling for highlighted element
                    if is_highlighted:
                        linewidth = self.line_width * 3
                        alpha = 1.0
                        facecolor = color
                        face_alpha = 0.2
                    else:
                        linewidth = self.line_width
                        alpha = 0.7
                        facecolor = 'none'
                        face_alpha = 0.0
                    
                    # Create rectangle patch
                    rect = patches.Rectangle(
                        (bbox.x_min, bbox.y_min),
                        bbox.x_max - bbox.x_min,
                        bbox.y_max - bbox.y_min,
                        linewidth=linewidth,
                        edgecolor=color,
                        facecolor=facecolor,
                        alpha=alpha,
                        zorder=2 if is_highlighted else 1
                    )
                    ax.add_patch(rect)
                    
                    # Add fill for highlighted element
                    if is_highlighted:
                        fill_rect = patches.Rectangle(
                            (bbox.x_min, bbox.y_min),
                            bbox.x_max - bbox.x_min,
                            bbox.y_max - bbox.y_min,
                            linewidth=0,
                            facecolor=color,
                            alpha=face_alpha,
                            zorder=0
                        )
                        ax.add_patch(fill_rect)
                    
                    # Add element number for highlighted element or every few elements
                    if is_highlighted:
                        ax.annotate(
                            f"#{i+1}\n{text_block.confidence:.2f}",
                            (bbox.x_min, bbox.y_min - 15),
                            fontsize=10,
                            color=color,
                            weight='bold',
                            bbox=dict(boxstyle="round,pad=0.3", facecolor='white', alpha=0.9, edgecolor=color),
                            zorder=3
                        )
                    elif i % 10 == 0:  # Show number for every 10th element to avoid clutter
                        ax.annotate(
                            f"#{i+1}",
                            (bbox.x_min, bbox.y_min - 8),
                            fontsize=8,
                            color=color,
                            bbox=dict(boxstyle="round,pad=0.2", facecolor='white', alpha=0.8)
                        )
                
                ax.set_xlim(0, img.width)
                ax.set_ylim(img.height, 0)
                
                # Create title with element counts
                element_counts = {}
                for block in filtered_blocks:
                    element_type = getattr(block, 'element_type', 'block')
                    element_counts[element_type] = element_counts.get(element_type, 0) + 1
                
                title_parts = []
                for element_type, count in element_counts.items():
                    color_emoji = {'block': '🔴', 'paragraph': '🔵', 'line': '🟢', 'token': '🟠'}.get(element_type, '⚪')
                    title_parts.append(f"{color_emoji} {count} {element_type}{'s' if count != 1 else ''}")
                
                title = "Document Analysis: " + " • ".join(title_parts)
                if highlight_element:
                    title += f" • Highlighted: {getattr(highlight_element, 'element_type', 'element')}"
                
                ax.set_title(title, fontsize=12, pad=20)
                ax.axis('off')
            
            # Save to bytes
            output = io.BytesIO()
            plt.tight_layout()
            plt.savefig(output, format='PNG', dpi=150, bbox_inches='tight', facecolor='white')
            plt.close(fig)
            
            return output.getvalue()
            
        except Exception as e:
            raise ValueError(f"Failed to create matplotlib visualization: {str(e)}")
    
    def generate_text_summary(self, text_blocks: List[TextBlock]) -> str:
        """Generate a comprehensive text summary of the OCR results."""
        if not text_blocks:
            return "No text elements detected."
        
        # Group by element type
        by_type = {}
        for block in text_blocks:
            element_type = getattr(block, 'element_type', 'block')
            if element_type not in by_type:
                by_type[element_type] = []
            by_type[element_type].append(block)
        
        # Calculate overall statistics
        total_elements = len(text_blocks)
        avg_confidence = sum(block.confidence for block in text_blocks) / total_elements
        
        summary_lines = ["OCR Analysis Summary:", "=" * 40]
        
        # Overall stats
        summary_lines.extend([
            f"Total text elements detected: {total_elements}",
            f"Average confidence: {avg_confidence:.3f}",
            ""
        ])
        
        # Per-type breakdown
        summary_lines.append("Element Type Breakdown:")
        for element_type, blocks in by_type.items():
            count = len(blocks)
            type_avg_conf = sum(b.confidence for b in blocks) / count
            high_conf = len([b for b in blocks if b.confidence >= 0.9])
            
            summary_lines.extend([
                f"  {element_type.title()}s: {count} elements",
                f"    Average confidence: {type_avg_conf:.3f}",
                f"    High confidence (≥0.9): {high_conf}",
                ""
            ])
        
        # Confidence distribution for all elements
        excellent = len([b for b in text_blocks if b.confidence >= 0.9])
        good = len([b for b in text_blocks if 0.8 <= b.confidence < 0.9])
        fair = len([b for b in text_blocks if 0.7 <= b.confidence < 0.8])
        poor = len([b for b in text_blocks if b.confidence < 0.7])
        
        summary_lines.extend([
            "Overall Confidence Distribution:",
            f"  Excellent (≥0.9): {excellent} ({excellent/total_elements*100:.1f}%)",
            f"  Good (0.8-0.89): {good} ({good/total_elements*100:.1f}%)",
            f"  Fair (0.7-0.79): {fair} ({fair/total_elements*100:.1f}%)",
            f"  Poor (<0.7): {poor} ({poor/total_elements*100:.1f}%)"
        ])
        
        return "\n".join(summary_lines)
