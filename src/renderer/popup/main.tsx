import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/global.css'
import './popup.css'
import { SelectionPopup } from './SelectionPopup'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SelectionPopup />
  </React.StrictMode>
)
