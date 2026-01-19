import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import KeypadFlasherApp from './KeypadFlasherApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KeypadFlasherApp />
  </StrictMode>,
)
