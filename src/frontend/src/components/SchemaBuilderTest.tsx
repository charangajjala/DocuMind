import React, { useState } from 'react';
import { EnhancedSchemaBuilder } from './EnhancedSchemaBuilder';

export const SchemaBuilderTest: React.FC = () => {
  const [schema, setSchema] = useState<any>(null);

  const handleSchemaChange = (newSchema: any) => {
    setSchema(newSchema);
    console.log('Schema updated:', JSON.stringify(newSchema, null, 2));
  };

  const runTests = () => {
    console.log('=== SCHEMA BUILDER TESTS ===');
    
    // Test Case 1: Basic field creation
    console.log('Test 1: Create basic fields');
    console.log('- Add a string field named "name"');
    console.log('- Add a number field named "age"');
    console.log('- Check if schema generates correctly');
    
    // Test Case 2: Object with nested fields
    console.log('\nTest 2: Create object with nested fields');
    console.log('- Add an object field named "address"');
    console.log('- Add children: "street" (string), "city" (string), "zipCode" (number)');
    console.log('- Check nested object structure');
    
    // Test Case 3: Deep nesting
    console.log('\nTest 3: Deep nesting test');
    console.log('- Create object "company" with child "department"');
    console.log('- Add "manager" object to "department"');
    console.log('- Add "contact" object to "manager"');
    console.log('- Verify 4-level deep nesting works correctly');
    
    // Test Case 4: Array types
    console.log('\nTest 4: Array types');
    console.log('- Add "skills" array of strings');
    console.log('- Add "projects" array of objects');
    console.log('- Verify array item types are correct');
    
    // Test Case 5: Field name validation
    console.log('\nTest 5: Validation');
    console.log('- Leave field names empty and check validation');
    console.log('- Fill in names and verify validation clears');
    
    console.log('\n=== INSTRUCTIONS ===');
    console.log('1. Follow the test cases above manually');
    console.log('2. Watch the console for schema updates');
    console.log('3. Verify the JSON preview matches expected structure');
    console.log('4. Test field deletion and renaming');
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Schema Builder Test Suite</h1>
          <button
            onClick={runTests}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Show Test Instructions
          </button>
          <p className="text-gray-600 mt-4">
            Open browser console (F12) to see test instructions and schema updates.
            Test the schema builder functionality step by step.
          </p>
        </div>

        <EnhancedSchemaBuilder onSchemaChange={handleSchemaChange} />

        {schema && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Current Schema Output</h2>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default SchemaBuilderTest;
