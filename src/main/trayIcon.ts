import { BrowserWindow, nativeImage } from 'electron'

// A tiny hidden window used purely to rasterise the tray icon in the current
// accent colour (canvas → PNG data URL → NativeImage). Reused across renders.
let renderer: BrowserWindow | null = null

async function ensureRenderer(): Promise<BrowserWindow> {
  if (renderer && !renderer.isDestroyed()) return renderer
  renderer = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    webPreferences: { offscreen: false }
  })
  await renderer.loadURL('data:text/html,<!doctype html><html><body></body></html>')
  return renderer
}

/** Render a rounded-square tray icon in `hex` with a white translate glyph. */
export async function renderAccentTrayIcon(hex: string): Promise<Electron.NativeImage | null> {
  try {
    const w = await ensureRenderer()
    const code = `(() => {
      const s = 32, r = 7;
      const c = document.createElement('canvas'); c.width = s; c.height = s;
      const x = c.getContext('2d');
      x.fillStyle = ${JSON.stringify(hex)};
      x.beginPath();
      x.moveTo(r,0); x.arcTo(s,0,s,s,r); x.arcTo(s,s,0,s,r); x.arcTo(0,s,0,0,r); x.arcTo(0,0,s,0,r);
      x.closePath(); x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 1.7; x.lineCap = 'round'; x.lineJoin = 'round';
      x.translate(4,4);
      x.stroke(new Path2D('M4 5h7M7.5 5v1.5c0 3-1.6 5.2-4 6.3M5.6 8.2c0 2.1 2.1 3.8 4.4 4.6'));
      x.stroke(new Path2D('M12.2 19.5 15.6 11l3.4 8.5M13.4 16.6h4.4'));
      return c.toDataURL('image/png');
    })()`
    const dataUrl: string = await w.webContents.executeJavaScript(code)
    const img = nativeImage.createFromDataURL(dataUrl)
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

export function destroyTrayIconRenderer(): void {
  if (renderer && !renderer.isDestroyed()) renderer.destroy()
  renderer = null
}
