import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import GradebookWeb3 from './GradebookWeb3'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GradebookWeb3 />
  </StrictMode>,
)
