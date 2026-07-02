import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  OpenPayload,
  Settings,
  SettingsSnapshot,
  TranslateResult
} from '../shared/types'

// Bridge exposed to every renderer window as window.quicktranslate.
const api = {
  translate: (text: string, targetCode?: string): Promise<TranslateResult> =>
    ipcRenderer.invoke('translate', text, targetCode),

  swapLanguages: (): Promise<Settings> => ipcRenderer.invoke('swap-languages'),

  closeWindow: (): void => ipcRenderer.send('close-translator-window'),

  resize: (height: number): void => ipcRenderer.send('translator:resize', height),

  getSettings: (): Promise<SettingsSnapshot> => ipcRenderer.invoke('get-settings'),

  saveSettings: (patch: Partial<Settings>): Promise<SettingsSnapshot> =>
    ipcRenderer.invoke('save-settings', patch),

  getHistory: () => ipcRenderer.invoke('get-history'),

  clearHistory: () => ipcRenderer.invoke('clear-history'),

  openSettings: (): void => ipcRenderer.send('open-settings'),

  openExternal: (url: string): void => ipcRenderer.send('open-external', url),

  activatePopup: (text: string): void => ipcRenderer.send('popup:activate', text),

  dismissPopup: (): void => ipcRenderer.send('popup:dismiss'),

  onOpen: (cb: (payload: OpenPayload) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: OpenPayload): void => cb(payload)
    ipcRenderer.on('translator:open', handler)
    return () => ipcRenderer.removeListener('translator:open', handler)
  },

  onHidden: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('translator:hidden', handler)
    return () => ipcRenderer.removeListener('translator:hidden', handler)
  },

  onPopupText: (cb: (text: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, text: string): void => cb(text)
    ipcRenderer.on('popup:text', handler)
    return () => ipcRenderer.removeListener('popup:text', handler)
  },

  onSettingsChanged: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('settings:changed', handler)
    return () => ipcRenderer.removeListener('settings:changed', handler)
  }
}

contextBridge.exposeInMainWorld('quicktranslate', api)
