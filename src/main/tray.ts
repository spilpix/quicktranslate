import { Tray, Menu, nativeImage, app } from 'electron'
import { join } from 'path'
import { getSettings, saveSettings } from './settingsStore'
import { renderAccentTrayIcon, destroyTrayIconRenderer } from './trayIcon'
import type { LangPair } from '../shared/types'

export interface TrayHandlers {
  onOpen: () => void
  onSettings: () => void
  onQuit: () => void
  onSelectPair: (pair: LangPair) => void
}

let tray: Tray | null = null
let handlers: TrayHandlers | null = null

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'tray-icon.png')
    : join(__dirname, '../../resources/tray-icon.png')
}

function loadIcon(): Electron.NativeImage {
  const img = nativeImage.createFromPath(iconPath())
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

export function buildTray(h: TrayHandlers): void {
  handlers = h
  tray = new Tray(loadIcon())
  tray.setToolTip('QuickTranslate')
  tray.on('click', () => handlers?.onOpen())
  tray.on('double-click', () => handlers?.onOpen())
  refreshTray()
}

export function refreshTray(): void {
  if (!tray || !handlers) return
  const s = getSettings()

  const recent = s.recentPairs.slice(0, 3).map((pair) => ({
    label: `${pair.aCode.toUpperCase()} ⇄ ${pair.bCode.toUpperCase()}  ·  ${pair.aLabel}/${pair.bLabel}`,
    click: () => handlers?.onSelectPair(pair)
  }))

  const template: Electron.MenuItemConstructorOptions[] = [
    { label: 'Открыть перевод', click: () => handlers?.onOpen() },
    { type: 'separator' },
    {
      label: `Пара: ${s.langACode.toUpperCase()} ⇄ ${s.langBCode.toUpperCase()}`,
      enabled: false
    },
    ...(recent.length
      ? [{ type: 'separator' as const }, ...recent]
      : []),
    { type: 'separator' },
    { label: 'Настройки…', click: () => handlers?.onSettings() },
    { label: 'Выход', click: () => handlers?.onQuit() }
  ]

  tray.setContextMenu(Menu.buildFromTemplate(template))
}

/** Re-render the tray icon in the given accent colour. */
export async function updateTrayIcon(hex: string): Promise<void> {
  if (!tray) return
  const img = await renderAccentTrayIcon(hex)
  if (img && tray && !tray.isDestroyed()) tray.setImage(img)
}

/** Push a pair to the front of the recents list (max 3, deduped orientation-insensitively). */
export function pushRecentPair(pair: LangPair): void {
  const s = getSettings()
  // RU⇄EN and EN⇄RU are the same pair — a plain swap must not create a duplicate.
  const filtered = s.recentPairs.filter(
    (p) =>
      !(
        (p.aCode === pair.aCode && p.bCode === pair.bCode) ||
        (p.aCode === pair.bCode && p.bCode === pair.aCode)
      )
  )
  saveSettings({ recentPairs: [pair, ...filtered].slice(0, 3) })
  refreshTray()
}

export function destroyTray(): void {
  destroyTrayIconRenderer()
  tray?.destroy()
  tray = null
}
