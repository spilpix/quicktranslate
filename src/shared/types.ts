// Types shared between the main process, preload bridge and renderer windows.

export interface LangPair {
  aCode: string // e.g. 'ru'
  bCode: string // e.g. 'en'
  aLabel: string // e.g. 'Русский'
  bLabel: string // e.g. 'English'
}

export interface Settings {
  /** Default language pair. Direction is auto-detected; ⇄ swaps A/B. */
  langACode: string
  langBCode: string
  langALabel: string
  langBLabel: string
  /** Global accelerator, e.g. "CommandOrControl+T". */
  hotkey: string
  /** Where the window appears on the hotkey: screen centre or by the cursor. */
  hotkeyPosition: 'center' | 'cursor'
  autoLaunch: boolean
  /** Close the floating window when it loses focus. */
  closeOnBlur: boolean
  /** Show the popup icon when text is selected with the mouse. Off by default. */
  selectionPopupEnabled: boolean
  /** Accent source: follow the Windows accent colour, or the built-in terracotta. */
  accentSource: 'windows' | 'terracotta'
  /** Persist a local history of translations. */
  historyEnabled: boolean
  /** Most-recently-used pairs, most recent first (max 3). */
  recentPairs: LangPair[]
}

export interface HistoryEntry {
  id: string
  source: string
  translation: string
  srcLabel: string
  tgtLabel: string
  ts: number
}

export type OpenMode = 'manual' | 'selection'

export interface OpenPayload {
  mode: OpenMode
  text?: string
}

export type TranslateErrorKind = 'rate-limit' | 'timeout' | 'offline' | 'api' | 'empty' | 'too-long'

export interface TranslateError {
  kind: TranslateErrorKind
  message: string
}

export interface TranslateResult {
  ok: boolean
  translation?: string
  /** Human label of the detected source language. */
  detectedLang?: string
  /** Human label of the chosen target language. */
  targetLang?: string
  targetCode?: string
  cached?: boolean
  error?: TranslateError
}

export interface SettingsSnapshot {
  settings: Settings
  /** True when the configured hotkey could not be registered (taken by another app). */
  hotkeyConflict: boolean
  /** True when the global input hook is running (uiohook available). */
  selectionActive: boolean
  /** True when mouse-select capture works (WinAPI/koffi available). */
  autoSelectAvailable: boolean
  /** Windows accent colour as #RRGGBB, or null if unavailable. */
  windowsAccent: string | null
  /** True when Windows is using a dark theme. */
  darkMode: boolean
  /** Max window height (px) the translator may grow to on this display. */
  maxWindowHeight: number
}

/** Shape exposed on window.quicktranslate by the preload bridge. */
export interface QuickTranslateApi {
  translate(text: string, targetCode?: string): Promise<TranslateResult>
  swapLanguages(): Promise<Settings>
  closeWindow(): void
  resize(height: number): void
  getSettings(): Promise<SettingsSnapshot>
  saveSettings(patch: Partial<Settings>): Promise<SettingsSnapshot>
  getHistory(): Promise<HistoryEntry[]>
  clearHistory(): Promise<void>
  openSettings(): void
  openExternal(url: string): void
  activatePopup(text: string): void
  dismissPopup(): void
  onOpen(cb: (payload: OpenPayload) => void): () => void
  onHidden(cb: () => void): () => void
  onPopupText(cb: (text: string) => void): () => void
  onSettingsChanged(cb: () => void): () => void
}
