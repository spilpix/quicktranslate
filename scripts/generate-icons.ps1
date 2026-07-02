# Generates placeholder app + tray icons (terracotta squircle, "AЯ" glyph).
# Replace build/icon.ico with the final artwork before shipping.
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root 'build'
$resDir = Join-Path $root 'resources'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
New-Item -ItemType Directory -Force -Path $resDir | Out-Null

function New-RoundRectPath($rect, [int]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $path.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-IconBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(1, [int]($size * 0.06))
  $rect = New-Object System.Drawing.Rectangle($pad, $pad, ($size - 2 * $pad), ($size - 2 * $pad))
  $radius = [int]($size * 0.28)
  $path = New-RoundRectPath $rect $radius

  $c1 = [System.Drawing.ColorTranslator]::FromHtml('#CE8058')
  $c2 = [System.Drawing.ColorTranslator]::FromHtml('#C1714A')
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 90.0)
  $g.FillPath($brush, $path)

  $font = New-Object System.Drawing.Font('Segoe UI', ($size * 0.40), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  # Build glyph from char codes to stay independent of script file encoding: "A" + Cyrillic Ya.
  $glyph = 'A' + [char]0x042F
  $rectF = New-Object System.Drawing.RectangleF([single]$rect.X, [single]$rect.Y, [single]$rect.Width, [single]$rect.Height)
  $g.DrawString($glyph, $font, $white, $rectF, $sf)

  $g.Dispose()
  return $bmp
}

function Get-PngBytes($bmp) {
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return , $bytes
}

# --- Multi-size .ico ---
$sizes = @(16, 32, 48, 256)
$frames = @()
foreach ($sz in $sizes) {
  $bmp = New-IconBitmap $sz
  $frames += , (Get-PngBytes $bmp)
  $bmp.Dispose()
}

$icoPath = Join-Path $buildDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)
$bw.Write([UInt16]1)
$bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz = $sizes[$i]
  $data = $frames[$i]
  $dim = if ($sz -ge 256) { 0 } else { $sz }
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]$dim)
  $bw.Write([Byte]0)
  $bw.Write([Byte]0)
  $bw.Write([UInt16]1)
  $bw.Write([UInt16]32)
  $bw.Write([UInt32]$data.Length)
  $bw.Write([UInt32]$offset)
  $offset += $data.Length
}
foreach ($data in $frames) { $bw.Write($data) }
$bw.Flush(); $bw.Close(); $fs.Close()
Write-Host "Wrote $icoPath"

# --- Tray PNG (32px) ---
$tray = New-IconBitmap 32
$tray.Save((Join-Path $resDir 'tray-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$tray.Dispose()
Write-Host "Wrote $(Join-Path $resDir 'tray-icon.png')"
