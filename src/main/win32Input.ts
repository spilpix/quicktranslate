// Minimal Windows input helpers via koffi (prebuilt, no native build step).
// Used to synthesize Ctrl+C for "select-to-translate" and to read the
// foreground window class so we can skip terminals (where Ctrl+C = SIGINT).

let keybdEvent: ((vk: number, scan: number, flags: number, extra: number) => void) | null = null
let getForegroundWindow: (() => unknown) | null = null
let getClassNameW: ((hwnd: unknown, buf: Buffer, max: number) => number) | null = null
let dwmSetWindowAttribute:
  | ((hwnd: number, attr: number, pv: Buffer, cb: number) => number)
  | null = null
let available = false

try {
  if (process.platform === 'win32') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi')
    const user32 = koffi.load('user32.dll')
    getForegroundWindow = user32.func('void* GetForegroundWindow()')
    getClassNameW = user32.func(
      'int GetClassNameW(void* hWnd, _Out_ uint16_t* lpClassName, int nMaxCount)'
    )
    keybdEvent = user32.func(
      'void keybd_event(uint8_t bVk, uint8_t bScan, uint32_t dwFlags, uintptr_t dwExtraInfo)'
    )
    available = true
    try {
      const dwmapi = koffi.load('dwmapi.dll')
      dwmSetWindowAttribute = dwmapi.func(
        'int DwmSetWindowAttribute(uintptr_t hwnd, uint32 dwAttribute, void* pvAttribute, uint32 cbAttribute)'
      )
    } catch {
      dwmSetWindowAttribute = null
    }
  }
} catch {
  available = false
}

/** Force rounded corners on a frameless Win11 window (DWMWA_WINDOW_CORNER_PREFERENCE). */
export function roundWindowCorners(handle: Buffer): void {
  if (!dwmSetWindowAttribute) return
  try {
    const hwnd = Number(handle.readBigUInt64LE(0))
    const pref = Buffer.alloc(4)
    pref.writeUInt32LE(2, 0) // DWMWCP_ROUND
    dwmSetWindowAttribute(hwnd, 33, pref, 4) // 33 = DWMWA_WINDOW_CORNER_PREFERENCE
  } catch {
    /* ignore */
  }
}

const VK_CONTROL = 0x11
const VK_C = 0x43
const KEYEVENTF_KEYUP = 0x0002

// Window classes where a synthetic Ctrl+C could be destructive (interrupts a
// running process) rather than "copy". We never inject into these.
const TERMINAL_CLASSES = [
  'consolewindowclass', // cmd / conhost
  'cascadia_hosting_window_class', // Windows Terminal
  'mintty', // Git Bash
  'putty',
  'virtualconsoleclass' // ConEmu
]

export function inputAvailable(): boolean {
  return available
}

export function sendCtrlC(): void {
  if (!available || !keybdEvent) return
  keybdEvent(VK_CONTROL, 0, 0, 0)
  keybdEvent(VK_C, 0, 0, 0)
  keybdEvent(VK_C, 0, KEYEVENTF_KEYUP, 0)
  keybdEvent(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
}

function foregroundClass(): string {
  if (!available || !getForegroundWindow || !getClassNameW) return ''
  try {
    const hwnd = getForegroundWindow()
    if (!hwnd) return ''
    const buf = Buffer.alloc(256 * 2)
    const n = getClassNameW(hwnd, buf, 256)
    return buf.toString('utf16le', 0, Math.max(0, n) * 2)
  } catch {
    return ''
  }
}

export function isTerminalForeground(): boolean {
  const cls = foregroundClass().toLowerCase()
  if (!cls) return false
  return TERMINAL_CLASSES.some((t) => cls.includes(t))
}
