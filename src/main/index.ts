import { app, ipcMain, shell, systemPreferences, nativeTheme } from 'electron'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import * as wm from './windowManager'
import * as settingsStore from './settingsStore'
import { translateGoogleFree, clearGoogleCache } from './googleClient'
import { registerHotkey, unregisterAll } from './globalShortcuts'
import {
  startClipboardWatcher,
  setSelectionWatch,
  resetLastText,
  stopClipboardWatcher
} from './clipboardWatcher'
import { buildTray, refreshTray, pushRecentPair, destroyTray, updateTrayIcon } from './tray'
import { inputAvailable } from './win32Input'
import type { LangPair, Settings, SettingsSnapshot } from '../shared/types'

let hotkeyConflict = false
let selectionActive = false

// --- Crash resilience: a tray app must not die on a stray error ------------
function logCrash(kind: string, err: unknown): void {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  const line = `[${new Date().toISOString()}] ${kind}: ${detail}\n`
  try {
    console.error('[QuickTranslate]', line)
    appendFileSync(join(app.getPath('userData'), 'crash.log'), line)
  } catch {
    /* ignore */
  }
}

// Swallow otherwise-fatal errors so the app keeps living in the tray.
process.on('uncaughtException', (e) => logCrash('uncaughtException', e))
process.on('unhandledRejection', (e) => logCrash('unhandledRejection', e))

function windowsAccentHex(): string | null {
  try {
    const c = systemPreferences.getAccentColor?.() // 'RRGGBBAA' on Windows, or ''
    if (c && c.length >= 6) return '#' + c.slice(0, 6)
  } catch {
    /* ignore */
  }
  return null
}

function currentAccentHex(): string {
  const s = settingsStore.getSettings()
  if (s.accentSource === 'windows') {
    const w = windowsAccentHex()
    if (w) return w
  }
  return '#C1714A'
}

function applyHotkey(): void {
  const s = settingsStore.getSettings()
  const res = registerHotkey(s.hotkey, () => {
    const cur = settingsStore.getSettings()
    wm.showTranslator({ mode: 'manual' }, cur.hotkeyPosition)
  })
  hotkeyConflict = !res.ok
}

function applyAutoLaunch(): void {
  const s = settingsStore.getSettings()
  if (process.platform !== 'win32') {
    app.setLoginItemSettings({ openAtLogin: s.autoLaunch })
    return
  }
  // Explicit exe path + a stable registry value name so the HKCU\...\Run entry
  // is written reliably for the installed (per-user) app.
  app.setLoginItemSettings({
    openAtLogin: s.autoLaunch,
    name: 'QuickTranslate',
    path: process.execPath,
    args: []
  })
  logCrash(
    'autolaunch',
    `set openAtLogin=${s.autoLaunch} -> ${app.getLoginItemSettings({ path: process.execPath }).openAtLogin}`
  )
}

function snapshot(): SettingsSnapshot {
  return {
    settings: settingsStore.getSettings(),
    hotkeyConflict,
    selectionActive,
    autoSelectAvailable: inputAvailable(),
    windowsAccent: windowsAccentHex(),
    darkMode: nativeTheme.shouldUseDarkColors,
    maxWindowHeight: wm.maxWindowHeight()
  }
}

function currentPair(): LangPair {
  const s = settingsStore.getSettings()
  return { aCode: s.langACode, bCode: s.langBCode, aLabel: s.langALabel, bLabel: s.langBLabel }
}

function registerIpc(): void {
  ipcMain.handle('translate', async (_e, text: string, targetCode?: string) => {
    const s = settingsStore.getSettings()
    const result = await translateGoogleFree({ text, explicitTargetCode: targetCode, settings: s })
    if (result.ok && !result.cached && result.translation && s.historyEnabled) {
      settingsStore.addHistory({
        id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        source: text.trim(),
        translation: result.translation,
        srcLabel: result.detectedLang ?? '',
        tgtLabel: result.targetLang ?? '',
        ts: Date.now()
      })
    }
    return result
  })

  ipcMain.handle('get-history', () => settingsStore.getHistory())
  ipcMain.handle('clear-history', () => {
    settingsStore.clearHistory()
  })

  ipcMain.handle('get-settings', () => snapshot())

  ipcMain.handle('save-settings', (_e, patch: Partial<Settings>) => {
    const prev = settingsStore.getSettings()
    const next = settingsStore.saveSettings(patch)

    if (patch.hotkey !== undefined && patch.hotkey !== prev.hotkey) {
      applyHotkey()
      if (hotkeyConflict) {
        // The new combo is taken and the previous one was re-registered as a
        // fallback — keep the store in sync so a restart doesn't boot with a
        // dead accelerator.
        settingsStore.saveSettings({ hotkey: prev.hotkey })
      }
    }
    if (patch.autoLaunch !== undefined && patch.autoLaunch !== prev.autoLaunch) applyAutoLaunch()
    if (patch.selectionPopupEnabled !== undefined) setSelectionWatch(next.selectionPopupEnabled)
    if (patch.accentSource !== undefined && patch.accentSource !== prev.accentSource) {
      void updateTrayIcon(currentAccentHex())
    }

    refreshTray()
    wm.broadcastSettingsChanged()
    return snapshot()
  })

  ipcMain.handle('swap-languages', () => {
    const s = settingsStore.getSettings()
    const next = settingsStore.saveSettings({
      langACode: s.langBCode,
      langBCode: s.langACode,
      langALabel: s.langBLabel,
      langBLabel: s.langALabel
    })
    pushRecentPair(currentPair())
    wm.broadcastSettingsChanged()
    return next
  })

  ipcMain.on('close-translator-window', () => wm.hideTranslator())
  ipcMain.on('translator:resize', (_e, height: number) => wm.resizeTranslator(height))
  ipcMain.on('open-settings', () => wm.showSettings())
  ipcMain.on('open-external', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })

  ipcMain.on('popup:activate', (_e, text: string) => {
    wm.hidePopup()
    wm.showTranslator({ mode: 'selection', text })
  })
  ipcMain.on('popup:dismiss', () => wm.hidePopup())
}

// Single-instance: a second launch just opens the translator.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    wm.showTranslator({ mode: 'manual' }, settingsStore.getSettings().hotkeyPosition)
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.quicktranslate.app')

    buildTray({
      onOpen: () => wm.showTranslator({ mode: 'manual' }, 'center'),
      onSettings: () => wm.showSettings(),
      onQuit: () => app.quit(),
      onSelectPair: (pair: LangPair) => {
        settingsStore.saveSettings({
          langACode: pair.aCode,
          langBCode: pair.bCode,
          langALabel: pair.aLabel,
          langBLabel: pair.bLabel
        })
        refreshTray()
        wm.broadcastSettingsChanged()
      }
    })
    void updateTrayIcon(currentAccentHex())

    applyHotkey()
    applyAutoLaunch()

    const s = settingsStore.getSettings()
    const watcher = startClipboardWatcher({
      onSelection: (text) => {
        if (settingsStore.getSettings().selectionPopupEnabled) wm.showPopup(text)
      },
      onPointerDown: () => wm.schedulePopupHide()
    })
    selectionActive = watcher.active
    setSelectionWatch(s.selectionPopupEnabled)
    resetLastText()

    // React to OS theme / accent changes: refresh windows + tray colour.
    nativeTheme.on('updated', () => wm.broadcastSettingsChanged())
    try {
      systemPreferences.on('accent-color-changed', () => {
        void updateTrayIcon(currentAccentHex())
        wm.broadcastSettingsChanged()
      })
    } catch {
      /* not on this platform */
    }

    registerIpc()

    setTimeout(() => wm.prewarmTranslator(), 800)
  })

  app.on('window-all-closed', () => {
    /* stay alive in the tray */
  })

  // If a window's renderer crashes, log it and reload that window instead of
  // letting the app die.
  app.on('render-process-gone', (_e, contents, details) => {
    logCrash('render-process-gone', details.reason)
    try {
      if (!contents.isDestroyed() && details.reason !== 'clean-exit') contents.reload()
    } catch {
      /* ignore */
    }
  })
  app.on('child-process-gone', (_e, details) => {
    logCrash('child-process-gone', `${details.type}:${details.reason}`)
  })

  app.on('before-quit', () => {
    ;(app as unknown as { isQuitting?: boolean }).isQuitting = true
    unregisterAll()
    stopClipboardWatcher()
    clearGoogleCache()
    destroyTray()
    wm.destroyAll()
  })
}
