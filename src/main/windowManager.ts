import { BrowserWindow, screen, app, nativeTheme } from 'electron'
import { join } from 'path'
import { getSettings } from './settingsStore'
import { roundWindowCorners } from './win32Input'
import type { OpenPayload } from '../shared/types'

const isDev = !app.isPackaged
const preloadPath = join(__dirname, '../preload/index.js')

// Geometry from design tokens (tokens.json → geometry).
const WINDOW_W = 420
const WINDOW_H_DEFAULT = 200
const WINDOW_H_MIN = 160
const POPUP_SIZE = 64 // 32px icon centred + room for the soft shadow & pulse ring
const SETTINGS_W = 480
const SETTINGS_H = 560

function maxHeightForPoint(x: number, y: number): number {
  return Math.max(WINDOW_H_MIN, workAreaFor(x, y).height - 48)
}

/** Max height the translator may grow to — exposed to the UI. Uses the display
 *  under the cursor, i.e. where the window is about to open. */
export function maxWindowHeight(): number {
  const pt = screen.getCursorScreenPoint()
  return maxHeightForPoint(pt.x, pt.y)
}

let translator: BrowserWindow | null = null
let settingsWin: BrowserWindow | null = null
let popup: BrowserWindow | null = null

function rendererUrl(entry: string): string | null {
  const base = process.env['ELECTRON_RENDERER_URL']
  return base ? `${base}/${entry}.html` : null
}

function loadEntry(win: BrowserWindow, entry: string): void {
  const url = isDev ? rendererUrl(entry) : null
  if (url) {
    void win.loadURL(url)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${entry}.html`))
  }
}

function workAreaFor(x: number, y: number): Electron.Rectangle {
  return screen.getDisplayNearestPoint({ x, y }).workArea
}

function clampToWorkArea(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const wa = workAreaFor(x, y)
  const cx = Math.max(wa.x + 8, Math.min(x, wa.x + wa.width - w - 8))
  const cy = Math.max(wa.y + 8, Math.min(y, wa.y + wa.height - h - 8))
  return { x: Math.round(cx), y: Math.round(cy) }
}

function positionNearCursor(win: BrowserWindow, w: number, h: number, offset = 16): void {
  const pt = screen.getCursorScreenPoint()
  const wa = workAreaFor(pt.x, pt.y)
  let x = pt.x + offset
  let y = pt.y + offset
  // Flip to the other side of the cursor if it would overflow.
  if (x + w > wa.x + wa.width) x = pt.x - w - offset
  if (y + h > wa.y + wa.height) y = pt.y - h - offset
  const c = clampToWorkArea(x, y, w, h)
  win.setBounds({ x: c.x, y: c.y, width: w, height: h })
}

function positionCenter(win: BrowserWindow, w: number, h: number): void {
  const pt = screen.getCursorScreenPoint()
  const wa = workAreaFor(pt.x, pt.y)
  const x = Math.round(wa.x + (wa.width - w) / 2)
  const y = Math.round(wa.y + (wa.height - h) / 2)
  win.setBounds({ x, y, width: w, height: h })
}

// Place the popup icon just below-right of the cursor (window is centred on the
// icon), so it lands right next to the text the user selected.
function positionPopup(win: BrowserWindow): void {
  const pt = screen.getCursorScreenPoint()
  const cx = pt.x + 18
  const cy = pt.y + 20
  const c = clampToWorkArea(cx - POPUP_SIZE / 2, cy - POPUP_SIZE / 2, POPUP_SIZE, POPUP_SIZE)
  win.setBounds({ x: c.x, y: c.y, width: POPUP_SIZE, height: POPUP_SIZE })
}

// ---------------------------------------------------------------------------
// Translator (floating) window
// ---------------------------------------------------------------------------

function createTranslator(): BrowserWindow {
  const win = new BrowserWindow({
    width: WINDOW_W,
    height: WINDOW_H_DEFAULT,
    minWidth: WINDOW_W,
    maxWidth: WINDOW_W,
    minHeight: WINDOW_H_MIN,
    maxHeight: maxWindowHeight(),
    show: false,
    frame: false,
    // Win11 acrylic "glass": real desktop blur behind the window. DWM rounds the
    // corners (see roundWindowCorners) so there are no black corner artifacts.
    transparent: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    resizable: true, // vertical resize enabled via the grip; width is pinned
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  try {
    roundWindowCorners(win.getNativeWindowHandle())
  } catch {
    /* ignore */
  }

  win.on('blur', () => {
    if (getSettings().closeOnBlur) hideTranslator()
  })

  // Keep the window alive on close (memory NFR): hide instead of destroy.
  win.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      hideTranslator()
    }
  })

  loadEntry(win, 'translator')
  return win
}

/** Create the translator window hidden so the first hotkey press opens instantly. */
export function prewarmTranslator(): void {
  if (!translator || translator.isDestroyed()) translator = createTranslator()
}

export function showTranslator(
  payload: OpenPayload,
  position: 'cursor' | 'center' = 'cursor'
): void {
  if (!translator || translator.isDestroyed()) translator = createTranslator()
  const win = translator
  const h = win.getBounds().height || WINDOW_H_DEFAULT
  if (position === 'center') positionCenter(win, WINDOW_W, h)
  else positionNearCursor(win, WINDOW_W, h)

  const send = (): void => win.webContents.send('translator:open', payload)
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
  win.show()
  win.focus()
}

export function hideTranslator(): void {
  if (translator && !translator.isDestroyed() && translator.isVisible()) {
    translator.webContents.send('translator:hidden')
    translator.hide()
  }
}

export function resizeTranslator(height: number): void {
  if (!translator || translator.isDestroyed()) return
  const b = translator.getBounds()
  const max = maxHeightForPoint(b.x, b.y)
  const h = Math.round(Math.min(max, Math.max(WINDOW_H_MIN, height)))
  if (b.height === h) return
  const c = clampToWorkArea(b.x, b.y, WINDOW_W, h)
  translator.setBounds({ x: c.x, y: c.y, width: WINDOW_W, height: h })
}

// ---------------------------------------------------------------------------
// Selection popup
// ---------------------------------------------------------------------------

function createPopup(): BrowserWindow {
  const win = new BrowserWindow({
    width: POPUP_SIZE,
    height: POPUP_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false, // must NOT steal focus from the user's app
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  loadEntry(win, 'popup')
  return win
}

let popupHideTimer: ReturnType<typeof setTimeout> | null = null

export function showPopup(text: string): void {
  if (popupHideTimer) {
    clearTimeout(popupHideTimer)
    popupHideTimer = null
  }
  if (!popup || popup.isDestroyed()) popup = createPopup()
  const win = popup
  positionPopup(win)

  const send = (): void => win.webContents.send('popup:text', text)
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send)
  } else {
    send()
  }
  win.showInactive() // show without taking focus
}

export function hidePopup(): void {
  if (popupHideTimer) {
    clearTimeout(popupHideTimer)
    popupHideTimer = null
  }
  if (popup && !popup.isDestroyed() && popup.isVisible()) popup.hide()
}

/**
 * Dismiss the popup shortly after any click. If the click lands ON the popup,
 * its own click fires `popup:activate` first — which hides it and opens the
 * translator, cancelling this timer. Coordinate-free, so it's DPI-proof.
 */
export function schedulePopupHide(): void {
  if (!popup || popup.isDestroyed() || !popup.isVisible()) return
  if (popupHideTimer) clearTimeout(popupHideTimer)
  popupHideTimer = setTimeout(() => {
    popupHideTimer = null
    if (popup && !popup.isDestroyed()) popup.hide()
  }, 240)
}

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------

function createSettings(): BrowserWindow {
  const win = new BrowserWindow({
    width: SETTINGS_W,
    height: SETTINGS_H,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1C1C1E' : '#EFEFF2',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    title: 'QuickTranslate — Настройки',
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('close', (e) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  loadEntry(win, 'settings')
  return win
}

export function showSettings(): void {
  if (!settingsWin || settingsWin.isDestroyed()) settingsWin = createSettings()
  const win = settingsWin
  const show = (): void => {
    win.center()
    win.show()
    win.focus()
  }
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', show)
  } else {
    show()
  }
}

/** Notify open windows that settings changed so they can refresh in place. */
export function broadcastSettingsChanged(): void {
  for (const w of [translator, settingsWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('settings:changed')
  }
}

export function destroyAll(): void {
  for (const w of [translator, settingsWin, popup]) {
    if (w && !w.isDestroyed()) w.destroy()
  }
  translator = settingsWin = popup = null
}
