import React from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/global.css'
import './settings.css'
import { SettingsWindow } from './SettingsWindow'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsWindow />
  </React.StrictMode>
)
