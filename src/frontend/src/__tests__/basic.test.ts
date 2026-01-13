import '@testing-library/jest-dom';

// Simple test without external dependencies
describe('Basic Test', () => {
  test('basic test works', () => {
    const div = document.createElement('div');
    div.textContent = 'Hello World';
    document.body.appendChild(div);
    expect(div).toBeInTheDocument();
  });

  test('math works', () => {
    expect(2 + 2).toBe(4);
  });
});
