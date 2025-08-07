import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EnhancedSchemaBuilder } from '../EnhancedSchemaBuilder';

// Mock the UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange, value }: any) => (
    <div data-testid="select-wrapper">
      <select 
        data-testid="select" 
        value={value} 
        onChange={(e) => onValueChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  SelectValue: () => <span>Select Value</span>,
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, className, ...props }: any) => (
    <textarea value={value} className={className} {...props} />
  ),
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon">+</span>,
  X: () => <span data-testid="x-icon">×</span>,
  List: () => <span data-testid="list-icon">[]</span>,
  Package: () => <span data-testid="package-icon">📦</span>,
  Download: () => <span data-testid="download-icon">⬇</span>,
}));

describe('EnhancedSchemaBuilder', () => {
  let mockOnSchemaChange: jest.Mock;

  beforeEach(() => {
    mockOnSchemaChange = jest.fn();
    // Clear console logs between tests
    jest.clearAllMocks();
    // Suppress console.log during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial Render', () => {
    test('renders the schema builder with header and empty state', () => {
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      expect(screen.getByText('Schema Builder')).toBeInTheDocument();
      expect(screen.getByText(/Create sophisticated JSON schemas/)).toBeInTheDocument();
      expect(screen.getByText('No fields defined yet')).toBeInTheDocument();
      expect(screen.getByText('Start building your schema by adding fields below')).toBeInTheDocument();
    });

    test('renders add field buttons', () => {
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      expect(screen.getByText('Add Field')).toBeInTheDocument();
      expect(screen.getByText('Add Object')).toBeInTheDocument();
      expect(screen.getByText('Add Array')).toBeInTheDocument();
    });

    test('does not show clear and export buttons when no fields exist', () => {
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
      expect(screen.queryByText('Export Schema')).not.toBeInTheDocument();
    });
  });

  describe('Basic Field Operations', () => {
    test('adds a string field when Add Field is clicked', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      const addFieldButton = screen.getByText('Add Field');
      await user.click(addFieldButton);
      
      expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
      expect(screen.getByText('Clear All')).toBeInTheDocument();
      expect(screen.getByText('Export Schema')).toBeInTheDocument();
    });

    test('adds an object field when Add Object is clicked', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      const addObjectButton = screen.getByText('Add Object');
      await user.click(addObjectButton);
      
      expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
      expect(screen.getByText('+ Children')).toBeInTheDocument();
    });

    test('adds an array field when Add Array is clicked', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      const addArrayButton = screen.getByText('Add Array');
      await user.click(addArrayButton);
      
      expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
      // Array fields should have an additional selector for array item type
      const selects = screen.getAllByTestId('select');
      expect(selects.length).toBeGreaterThan(1);
    });

    test('deletes a field when delete button is clicked', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add a field first
      await user.click(screen.getByText('Add Field'));
      expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
      
      // Delete the field
      const deleteButton = screen.getByTestId('x-icon').closest('button');
      expect(deleteButton).toBeInTheDocument();
      await user.click(deleteButton!);
      
      expect(screen.queryByPlaceholderText('Field name')).not.toBeInTheDocument();
      expect(screen.getByText('No fields defined yet')).toBeInTheDocument();
    });

    test('clears all fields when Clear All is clicked', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add multiple fields
      await user.click(screen.getByText('Add Field'));
      await user.click(screen.getByText('Add Object'));
      
      expect(screen.getAllByPlaceholderText('Field name')).toHaveLength(2);
      
      // Clear all
      await user.click(screen.getByText('Clear All'));
      
      expect(screen.queryByPlaceholderText('Field name')).not.toBeInTheDocument();
      expect(screen.getByText('No fields defined yet')).toBeInTheDocument();
    });
  });

  describe('Field Name Validation', () => {
    test('shows validation error for empty field names', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      
      expect(screen.getByText('Field name left empty')).toBeInTheDocument();
    });

    test('hides validation error when field name is entered', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      expect(screen.getByText('Field name left empty')).toBeInTheDocument();
      
      const fieldNameInput = screen.getByPlaceholderText('Field name');
      await user.type(fieldNameInput, 'testField');
      
      await waitFor(() => {
        expect(screen.queryByText('Field name left empty')).not.toBeInTheDocument();
      });
    });
  });

  describe('Schema Generation', () => {
    test('calls onSchemaChange when fields are added', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      
      expect(mockOnSchemaChange).toHaveBeenCalled();
      const lastCall = mockOnSchemaChange.mock.calls[mockOnSchemaChange.mock.calls.length - 1][0];
      expect(lastCall).toHaveProperty('type', 'object');
      expect(lastCall).toHaveProperty('properties');
    });

    test('generates correct schema for named fields', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add a field and name it
      await user.click(screen.getByText('Add Field'));
      const fieldNameInput = screen.getByPlaceholderText('Field name');
      await user.type(fieldNameInput, 'testField');
      
      await waitFor(() => {
        const lastCall = mockOnSchemaChange.mock.calls[mockOnSchemaChange.mock.calls.length - 1][0];
        expect(lastCall.properties).toHaveProperty('testField');
        expect(lastCall.properties.testField).toHaveProperty('type', 'string');
      });
    });

    test('shows JSON preview when fields exist', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      
      expect(screen.getByText('Generated Schema')).toBeInTheDocument();
      expect(screen.getByText('JSON schema ready for validation and integration')).toBeInTheDocument();
    });
  });

  describe('Nested Objects', () => {
    test('adds children to object fields', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add an object field
      await user.click(screen.getByText('Add Object'));
      
      // Add children to the object
      const addChildrenButton = screen.getByText('+ Children');
      await user.click(addChildrenButton);
      
      // Should now have 2 field name inputs (parent object + child)
      expect(screen.getAllByPlaceholderText('Field name')).toHaveLength(2);
    });

    test('handles nested field naming correctly', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add an object field and name it
      await user.click(screen.getByText('Add Object'));
      const parentInput = screen.getByPlaceholderText('Field name');
      await user.type(parentInput, 'parent');
      
      // Add a child field
      await user.click(screen.getByText('+ Children'));
      const childInputs = screen.getAllByPlaceholderText('Field name');
      await user.type(childInputs[1], 'child');
      
      await waitFor(() => {
        const lastCall = mockOnSchemaChange.mock.calls[mockOnSchemaChange.mock.calls.length - 1][0];
        expect(lastCall.properties.parent.properties).toHaveProperty('child');
      });
    });
  });

  describe('Array Fields', () => {
    test('changes array item type correctly', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add an array field
      await user.click(screen.getByText('Add Array'));
      
      // Find the array type selector (second select element)
      const selects = screen.getAllByTestId('select');
      expect(selects).toHaveLength(2); // Field type + Array item type
      
      // Change array item type to number
      await user.selectOptions(selects[1], 'number');
      
      await waitFor(() => {
        expect(mockOnSchemaChange).toHaveBeenCalled();
      });
    });
  });

  describe('Field Type Changes', () => {
    test('changes field type from string to object', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add a string field
      await user.click(screen.getByText('Add Field'));
      
      // Change type to object
      const select = screen.getByTestId('select');
      await user.selectOptions(select, 'object');
      
      // Should now show the + Children button
      expect(screen.getByText('+ Children')).toBeInTheDocument();
    });

    test('changes field type from string to array', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add a string field
      await user.click(screen.getByText('Add Field'));
      
      // Change type to array
      const select = screen.getByTestId('select');
      await user.selectOptions(select, 'array');
      
      // Should now show array item type selector
      const selects = screen.getAllByTestId('select');
      expect(selects).toHaveLength(2);
    });
  });

  describe('Error Handling', () => {
    test('handles invalid operations gracefully', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Try to add children to a non-object field
      await user.click(screen.getByText('Add Field')); // Adds string field
      
      // String fields should not have + Children button
      expect(screen.queryByText('+ Children')).not.toBeInTheDocument();
    });
  });

  describe('Export Functionality', () => {
    test('export button is present when fields exist', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      
      const exportButton = screen.getByText('Export Schema');
      expect(exportButton).toBeInTheDocument();
    });

    test('export functionality works', async () => {
      const user = userEvent.setup();
      
      // Mock the DOM methods needed for file download
      const createElementSpy = jest.spyOn(document, 'createElement');
      const clickSpy = jest.fn();
      const mockAnchor = {
        href: '',
        download: '',
        click: clickSpy,
      } as any;
      createElementSpy.mockReturnValue(mockAnchor);
      
      // Mock URL methods
      global.URL.createObjectURL = jest.fn(() => 'mock-url');
      global.URL.revokeObjectURL = jest.fn();
      
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      await user.click(screen.getByText('Export Schema'));
      
      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(clickSpy).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
      
      createElementSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    test('has proper form labels and placeholders', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      await user.click(screen.getByText('Add Field'));
      
      expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Description (optional)')).toBeInTheDocument();
    });

    test('buttons have appropriate aria labels or text content', () => {
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      expect(screen.getByText('Add Field')).toBeInTheDocument();
      expect(screen.getByText('Add Object')).toBeInTheDocument();
      expect(screen.getByText('Add Array')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    test('handles multiple rapid field additions', async () => {
      const user = userEvent.setup();
      render(<EnhancedSchemaBuilder onSchemaChange={mockOnSchemaChange} />);
      
      // Add multiple fields rapidly
      for (let i = 0; i < 5; i++) {
        await user.click(screen.getByText('Add Field'));
      }
      
      // Should have 5 field name inputs
      expect(screen.getAllByPlaceholderText('Field name')).toHaveLength(5);
      
      // Schema callback should have been called multiple times
      expect(mockOnSchemaChange.mock.calls.length).toBeGreaterThan(4);
    });
  });
});
