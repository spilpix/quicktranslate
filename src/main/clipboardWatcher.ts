import { clipboard } from 'electron'
import { inputAvailable, sendCtrlC, isTerminalForeground } from './win32Input'

interface WatcherHandlers {
  onSelection: (text: string) => void
  /** Called on every mouse-down (so a shown popup can schedule its dismissal). */
  onPointerDown?: () => void
}

let started = false
let enabled = false
let running = false // the native hook thread is actually started
let lastText = ''
let hookRef: { start: () => void; stop: () => void } | null = null

// Mouse-drag / double-click state for the "select-to-translate" gesture.
let pressed = false
let pressX = 0
let pressY = 0
let lastTrigger = 0
let suppressCopyUntil = 0

const DRAG_THRESHOLD = 8 // px — below this a mouse-up isn't a text selection
const MIN_INTERVAL = 400 // ms — throttle back-to-back gestures
const COPY_READ_DELAY = 160 // ms — wait for the target app to fill the clipboard

/**
 * Skip clipboard content that is almost certainly not "text the user wants
 * translated" — URLs, short pure-number strings — so ordinary selecting/copying
 * doesn't spam the popup.
 */
function isNoise(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) return true
  if (t.length > 5000) return true
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return true // single URL
  if (/^[\d\s.,%+\-()$€₽]+$/.test(t) && t.length < 16) return true // short number/currency
  return false
}

/**
 * macOS-style capture: the user selected text with the mouse. We briefly borrow
 * the clipboard (synthetic Ctrl+C), read the selection, then restore whatever
 * was there before — so from the user's side it's just "select → popup".
 */
function captureSelection(onSelection: (text: string) => void): void {
  const now = Date.now()
  if (now - lastTrigger < MIN_INTERVAL) return
  lastTrigger = now

  // Never inject Ctrl+C into a console — there it means "interrupt", not "copy".
  if (isTerminalForeground()) return

  // Snapshot the FULL clipboard (text/html/image) so we can restore it exactly —
  // otherwise borrowing it would clobber e.g. a screenshot the user just took.
  const savedText = clipboard.readText()
  const savedHtml = clipboard.readHTML()
  const savedImage = clipboard.readImage()

  suppressCopyUntil = now + 600 // ignore the keydown our own Ctrl+C will generate
  sendCtrlC()

  setTimeout(() => {
    const copied = clipboard.readText()
    const changed = copied && copied !== savedText
    if (changed && !isNoise(copied) && copied !== lastText) {
      lastText = copied
      onSelection(copied)
    }
    // Restore ONLY if the clipboard still holds our borrowed copy. If something
    // else wrote to it meanwhile (e.g. a screenshot from Win+Shift+S taken with
    // a drag), leave it untouched so we don't clobber the user's screenshot.
    const stillOurs = clipboard.readImage().isEmpty() && clipboard.readText() === copied
    if (!stillOurs) return
    try {
      if (!savedImage.isEmpty()) clipboard.writeImage(savedImage)
      else if (savedHtml) clipboard.write({ text: savedText, html: savedHtml })
      else if (savedText) clipboard.writeText(savedText)
      else clipboard.clear()
    } catch {
      /* ignore */
    }
  }, COPY_READ_DELAY)
}

/**
 * Global input watcher. Two ways to surface the popup:
 *  1. macOS-style — select text with the mouse (drag or double-click). Needs the
 *     WinAPI helper (koffi) to synthesize the copy.
 *  2. Fallback — a manual Ctrl+C, if (1) isn't available.
 * If the native hook can't load we degrade gracefully; the hotkey still works.
 */
export function startClipboardWatcher(handlers: WatcherHandlers): { active: boolean } {
  const { onSelection, onPointerDown } = handlers
  if (started) return { active: !!hookRef }
  started = true
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { uIOhook, UiohookKey } = require('uiohook-napi')
    const canAutoSelect = inputAvailable()

    // --- mouse-selection gesture ---
    uIOhook.on('mousedown', (e: { button: number; x: number; y: number }) => {
      // Any click schedules dismissal of a shown popup (deselect / click elsewhere).
      onPointerDown?.()
      if (e.button === 1) {
        pressed = true
        pressX = e.x
        pressY = e.y
      }
    })

    uIOhook.on('mouseup', (e: { button: number; x: number; y: number }) => {
      const wasPressed = pressed
      pressed = false
      if (!enabled || !canAutoSelect || e.button !== 1 || !wasPressed) return
      const dx = e.x - pressX
      const dy = e.y - pressY
      if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
        captureSelection(onSelection) // drag = text selection
      }
    })

    uIOhook.on('click', (e: { clicks: number }) => {
      if (!enabled || !canAutoSelect) return
      if (e.clicks >= 2) captureSelection(onSelection) // double/triple-click word select
    })

    // --- manual Ctrl+C fallback ---
    uIOhook.on('keydown', (e: { keycode: number; ctrlKey: boolean }) => {
      if (!enabled) return
      if (e.ctrlKey && e.keycode === UiohookKey.C) {
        if (Date.now() < suppressCopyUntil) return // our own synthetic copy
        setTimeout(() => {
          const text = clipboard.readText()
          if (text && text !== lastText && !isNoise(text)) {
            lastText = text
            onSelection(text)
          }
        }, 100)
      }
    })

    // Listeners are registered, but the native hook thread only starts when the
    // selection popup is enabled (see setSelectionWatch) — off by default, so
    // most users never run the global hook at all.
    hookRef = uIOhook
    return { active: true }
  } catch {
    console.warn(
      '[clipboardWatcher] uiohook-napi unavailable — selection popup disabled. ' +
        'Global hotkey still works.'
    )
    hookRef = null
    return { active: false }
  }
}

export function setSelectionWatch(on: boolean): void {
  enabled = on
  if (!hookRef) return
  try {
    if (on && !running) {
      hookRef.start()
      running = true
    } else if (!on && running) {
      hookRef.stop()
      running = false
    }
  } catch {
    /* ignore */
  }
}

/** Forget the last-seen text so an identical re-selection triggers again. */
export function resetLastText(): void {
  lastText = ''
}

export function stopClipboardWatcher(): void {
  if (hookRef && running) {
    try {
      hookRef.stop()
    } catch {
      /* ignore */
    }
  }
  running = false
  hookRef = null
  started = false
}
