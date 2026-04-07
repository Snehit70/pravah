import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexClientProvider } from './lib/convex'
import { ToastProvider } from './components/Toast'
import './index.css'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexClientProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ConvexClientProvider>
  </StrictMode>,
)