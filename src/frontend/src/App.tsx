import './App.css'
import { OCRApp } from './components/OCRApp'
import { ThemeProvider } from './components/theme-provider'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <OCRApp />
    </ThemeProvider>
  )
}

export default App
