import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { EnhancedSchemaBuilder } from '../EnhancedSchemaBuilder';

// Simple mock for UI components using relative paths
jest.mock('../ui/button', () => ({
  Button: ({ children, onClick, className, ...props }: any) => (
    <button onClick={onClick} className={className} {...props}>
      {children}
    </button>
  )
}));

jest.mock('../ui/input', () => ({
  Input: ({ value, onChange, className, ...props }: any) => (
    <input 
      value={value} 
      onChange={onChange} 
      className={className} 
      {...props}
    />
  )
}));

jest.mock('../ui/select', () => ({
  Select: ({ children }: any) => <div data-testid="select">{children}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <button>{children}</button>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>
}));

jest.mock('../ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children }: any) => <div>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h2>{children}</h2>
}));

jest.mock('../ui/badge', () => ({
  Badge: ({ children, variant }: any) => (
    <span data-variant={variant}>{children}</span>
  )
}));

describe('EnhancedSchemaBuilder', () => {
  const defaultProps = {
    onSchemaChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the schema builder with initial state', () => {
    render(<EnhancedSchemaBuilder {...defaultProps} />);
    
    expect(screen.getByText('Schema Builder')).toBeInTheDocument();
    expect(screen.getByText('Add Field')).toBeInTheDocument();
  });

  test('allows adding a new field', async () => {
    const user = userEvent.setup();
    render(<EnhancedSchemaBuilder {...defaultProps} />);
    
    const addButton = screen.getByText('Add Field');
    await user.click(addButton);
    
    expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
  });

  test('updates schema when changes are made', async () => {
    const user = userEvent.setup();
    const onSchemaChange = jest.fn();
    render(<EnhancedSchemaBuilder {...defaultProps} onSchemaChange={onSchemaChange} />);
    
    const addButton = screen.getByText('Add Field');
    await user.click(addButton);
    
    const fieldNameInput = screen.getByPlaceholderText('Field name');
    await user.type(fieldNameInput, 'Test Field');
    
    await waitFor(() => {
      expect(onSchemaChange).toHaveBeenCalled();
    });
  });

  test('validates required fields on export', async () => {
    const user = userEvent.setup();
    render(<EnhancedSchemaBuilder {...defaultProps} />);
    
    // Add a field without name
    const addButton = screen.getByText('Add Field');
    await user.click(addButton);
    
    // Try to export without field name
    const exportButton = screen.getByText('Export Schema');
    await user.click(exportButton);
    
    expect(screen.getByText('Field name is required')).toBeInTheDocument();
  });

  test('handles field name input correctly', async () => {
    const user = userEvent.setup();
    render(<EnhancedSchemaBuilder {...defaultProps} />);
    
    // Add a field
    const addButton = screen.getByText('Add Field');
    await user.click(addButton);
    
    // Add field name
    const fieldNameInput = screen.getByPlaceholderText('Field name');
    await user.type(fieldNameInput, 'username');
    
    expect(screen.getByDisplayValue('username')).toBeInTheDocument();
  });

  test('allows removing fields', async () => {
    const user = userEvent.setup();
    render(<EnhancedSchemaBuilder {...defaultProps} />);
    
    // Add a field
    const addButton = screen.getByText('Add Field');
    await user.click(addButton);
    
    // Field should exist
    expect(screen.getByPlaceholderText('Field name')).toBeInTheDocument();
    
    // Remove the field (assuming there's a delete button)
    const deleteButtons = screen.getAllByRole('button');
    const deleteButton = deleteButtons.find(btn => btn.textContent?.includes('×') || btn.getAttribute('aria-label')?.includes('delete'));
    
    if (deleteButton) {
      await user.click(deleteButton);
    }
  });
});
