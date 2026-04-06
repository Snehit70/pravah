import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexClientProvider } from './lib/convex'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexClientProvider>
      <App />
    </ConvexClientProvider>
  </StrictMode>,
)