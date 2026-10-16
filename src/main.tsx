import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexClientProvider } from './lib/convex'
import { ToastProvider } from './components/Toast'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import { App } from './App.tsx'
import { enterDemo, isDemoMode, wantsDemoFromQuery } from './demo/demoFlag'
import { setDemoImpl } from './lib/demoBridge'
import { applyAccent, loadAccent } from './lib/accent'
import { initializeAppearance } from './lib/appearance'

const disposeAppearance = initializeAppearance()
if (import.meta.hot) import.meta.hot.dispose(disposeAppearance)

const mount = async () => {
  applyAccent(loadAccent())
  if (wantsDemoFromQuery()) enterDemo()
  if (isDemoMode()) {
    const [{ installDemoMode }, demoHooks] = await Promise.all([
      import('./demo/install'),
      import('./demo/demoHooks'),
    ])
    await installDemoMode()
    setDemoImpl(demoHooks)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <ConvexClientProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ConvexClientProvider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void mount()
