import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'

// Sin StrictMode a propósito: su doble montaje en desarrollo duplica la aplicación de Pixi
// y deja artefactos en el canvas.
createRoot(document.getElementById('root') as HTMLElement).render(<App />)
