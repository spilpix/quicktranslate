import { globalShortcut } from 'electron'

let current: string | null = null

export interface RegisterResult {
  ok: boolean
}

function tryRegister(accelerator: string, handler: () => void): boolean {
  try {
    const ok = globalShortcut.register(accelerator, handler)
    // Extra safety: isRegistered can be false even if register() returned true
    // on some systems when the combo is reserved by the OS.
    if (ok && !globalShortcut.isRegistered(accelerator)) {
      globalShortcut.unregister(accelerator)
      return false
    }
    return ok
  } catch {
    return false
  }
}

/**
 * (Re)register the global translator hotkey. Unregisters the previous one first
 * so the accelerator can be changed live from settings. Returns ok:false when
 * the accelerator is already taken by another application — in that case the
 * previous hotkey is restored, so the app is never left without one.
 */
export function registerHotkey(accelerator: string, handler: () => void): RegisterResult {
  const prev = current
  unregisterHotkey()
  if (tryRegister(accelerator, handler)) {
    current = accelerator
    return { ok: true }
  }
  if (prev && tryRegister(prev, handler)) current = prev
  return { ok: false }
}

export function unregisterHotkey(): void {
  if (current) {
    try {
      globalShortcut.unregister(current)
    } catch {
      /* ignore */
    }
    current = null
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
  current = null
}
