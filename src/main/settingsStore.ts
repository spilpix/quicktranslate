import Store from 'electron-store'
import type { HistoryEntry, Settings } from '../shared/types'

interface Persisted {
  settings: Settings
  history?: HistoryEntry[]
}

const HISTORY_MAX = 100

export const DEFAULT_SETTINGS: Settings = {
  langACode: 'ru',
  langBCode: 'en',
  langALabel: 'Русский',
  langBLabel: 'English',
  hotkey: 'CommandOrControl+T',
  hotkeyPosition: 'center',
  autoLaunch: false,
  closeOnBlur: true,
  // Off by default — the mouse-select popup is opt-in (it can interfere with
  // the clipboard / screenshot paste when on).
  selectionPopupEnabled: false,
  accentSource: 'windows',
  historyEnabled: true,
  recentPairs: []
}

const store = new Store<Persisted>({
  name: 'quicktranslate',
  defaults: { settings: DEFAULT_SETTINGS }
})

export function getSettings(): Settings {
  // Merge over defaults so new fields added in updates get sane values.
  return { ...DEFAULT_SETTINGS, ...store.get('settings') }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings(), ...patch }
  store.set('settings', next)
  return next
}

// --- Translation history (local, opt-out) --------------------------------
export function getHistory(): HistoryEntry[] {
  return store.get('history') ?? []
}

export function addHistory(entry: HistoryEntry): void {
  let list = getHistory()
  // Collapse intermediate typing states: translation runs on a debounce, so
  // while the user types, each partial text lands here. If the newest entry is
  // a prefix of the new text (or vice versa — backspace), replace it instead of
  // piling up "при", "прив", "привет"…
  while (
    list.length > 0 &&
    list[0].tgtLabel === entry.tgtLabel &&
    (entry.source.startsWith(list[0].source) || list[0].source.startsWith(entry.source))
  ) {
    list = list.slice(1)
  }
  const filtered = list.filter((e) => !(e.source === entry.source && e.tgtLabel === entry.tgtLabel))
  store.set('history', [entry, ...filtered].slice(0, HISTORY_MAX))
}

export function clearHistory(): void {
  store.set('history', [])
}
