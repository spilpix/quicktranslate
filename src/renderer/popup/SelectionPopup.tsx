import { useCallback, useEffect, useRef, useState } from 'react'
import { applyAppearance } from '../shared/accent'

const AUTO_DISMISS_MS = 2600 // design token: --qt-popup-timeout

export function SelectionPopup(): JSX.Element | null {
  const [text, setText] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(() => {
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      setVisible(false)
      window.quicktranslate.dismissPopup()
    }, AUTO_DISMISS_MS)
  }, [clearTimer])

  useEffect(() => {
    // Match the app/Windows accent + theme for the icon.
    void window.quicktranslate.getSettings().then(applyAppearance)
    const off = window.quicktranslate.onPopupText((t: string) => {
      setText(t)
      setVisible(true)
      startTimer()
    })
    return () => {
      off()
      clearTimer()
    }
  }, [startTimer, clearTimer])

  if (!visible) return null

  return (
    <div
      className="qt-popup qt-fade-in"
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      onClick={() => {
        clearTimer()
        setVisible(false)
        if (text) window.quicktranslate.activatePopup(text)
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M4 5h7M7.5 5v1.5c0 3-1.6 5.2-4 6.3M5.6 8.2c0 2.1 2.1 3.8 4.4 4.6"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.2 19.5 15.6 11l3.4 8.5M13.4 16.6h4.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}
