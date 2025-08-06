import './App.css'
import { ImprovedOCRApp } from './components/ImprovedOCRApp'
import { ThemeProvider } from './components/theme-provider'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <ImprovedOCRApp />
    </ThemeProvider>
  )
}

export default App
