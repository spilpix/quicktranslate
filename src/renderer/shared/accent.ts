import type { SettingsSnapshot } from '@shared/types'

const TERRACOTTA = '#C1714A'

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Blend toward white (amt>0) or black (amt<0). */
function shade(hex: string, amt: number): string {
  const { r, g, b } = hexToRgb(hex)
  const target = amt < 0 ? 0 : 255
  const p = Math.abs(amt)
  return toHex(r + (target - r) * p, g + (target - g) * p, b + (target - b) * p)
}

/** Set the accent CSS variables (used by all windows). */
export function applyAccent(hex: string): void {
  const s = document.documentElement.style
  s.setProperty('--qt-accent', hex)
  s.setProperty('--qt-accent-hover', shade(hex, 0.14))
  s.setProperty('--qt-accent-press', shade(hex, -0.16))
  const { r, g, b } = hexToRgb(hex)
  s.setProperty('--qt-accent-soft', `rgba(${r}, ${g}, ${b}, 0.16)`)
}

/** Apply both the OS theme (light/dark) and the accent colour. */
export function applyAppearance(snap: SettingsSnapshot): void {
  document.documentElement.setAttribute('data-theme', snap.darkMode ? 'dark' : 'light')
  if (snap.settings.accentSource === 'windows' && snap.windowsAccent) {
    applyAccent(snap.windowsAccent)
  } else {
    applyAccent(TERRACOTTA)
  }
}
