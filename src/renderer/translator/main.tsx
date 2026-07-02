import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/global.css'
import './translator.css'
import { TranslatorWindow } from './TranslatorWindow'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TranslatorWindow />
  </React.StrictMode>
)
