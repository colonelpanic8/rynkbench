import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyStoredTheme } from './ui/theme'
import { MessageHost } from './ui/messages/MessageHost'

applyStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <MessageHost />
  </StrictMode>,
)
