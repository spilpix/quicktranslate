import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent
} from 'react'
import type { HistoryEntry, OpenPayload, SettingsSnapshot, TranslateResult } from '@shared/types'
import { applyAppearance } from '../shared/accent'

type Status = 'idle' | 'loading' | 'result' | 'error'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const
}

const SwapIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15">
    <path d="M4 8h13l-3-3M20 16H7l3 3" {...stroke} />
  </svg>
)
const GearIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="16" height="16">
    <path d="M4 8h9M17 8h3M4 16h3M11 16h9" {...stroke} />
    <circle cx="15" cy="8" r="2.3" {...stroke} />
    <circle cx="9" cy="16" r="2.3" {...stroke} />
  </svg>
)
const CloseIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15">
    <path d="M6 6l12 12M18 6 6 18" {...stroke} />
  </svg>
)
const CopyIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13">
    <rect x="9" y="9" width="11" height="11" rx="2.5" {...stroke} />
    <path d="M15 5.5A2 2 0 0 0 13 4H6a2 2 0 0 0-2 2v7a2 2 0 0 0 1.5 1.9" {...stroke} />
  </svg>
)
const SparkIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15">
    <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6zM18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" {...stroke} />
  </svg>
)
const ErrorIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="17" height="17">
    <circle cx="12" cy="12" r="8.5" {...stroke} />
    <path d="M12 8v4.5M12 15.5v.5" {...stroke} />
  </svg>
)
const PinIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="15" height="15">
    <path d="M9.5 4.5h5l-.6 5 2.6 3H7.5l2.6-3z" {...stroke} />
    <path d="M12 12.5V19" {...stroke} />
  </svg>
)
const ClearIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" width="13" height="13">
    <path d="M6 6l12 12M18 6 6 18" {...stroke} />
  </svg>
)

export function TranslatorWindow(): JSX.Element {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [recent, setRecent] = useState<HistoryEntry[]>([])

  const cardRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<number | null>(null)
  const forcedTargetRef = useRef<string | undefined>(undefined)
  const reqIdRef = useRef(0)
  const manualRef = useRef(false) // user dragged the grip → stop auto-sizing
  const lastSentRef = useRef(0)
  const maxHRef = useRef(420)
  const gripRef = useRef<{ startY: number; startH: number } | null>(null)
  const resultRef = useRef<TranslateResult | null>(null) // latest OK result for Ctrl+Enter

  const loadSettings = useCallback(async () => {
    const s = await window.quicktranslate.getSettings()
    setSnap(s)
    maxHRef.current = s.maxWindowHeight
    applyAppearance(s)
  }, [])

  // Recent translations shown in the empty state (Raycast-style recents).
  const loadRecent = useCallback(async () => {
    const h = await window.quicktranslate.getHistory()
    setRecent(h.slice(0, 3))
  }, [])

  const runTranslate = useCallback(async (text: string, targetCode?: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      setStatus('idle')
      setResult(null)
      return
    }
    const id = ++reqIdRef.current
    setStatus('loading')
    setCopied(false)
    const res = await window.quicktranslate.translate(trimmed, targetCode)
    if (id !== reqIdRef.current) return // a newer request superseded this one
    setResult(res)
    setStatus(res.ok ? 'result' : 'error')
  }, [])

  const scheduleTranslate = useCallback(
    (text: string) => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      // Debounce keystrokes (design token: 500ms) before hitting the API.
      debounceRef.current = window.setTimeout(() => {
        void runTranslate(text, forcedTargetRef.current)
      }, 500)
    },
    [runTranslate]
  )

  useEffect(() => {
    void loadSettings()
    const off = window.quicktranslate.onSettingsChanged(() => void loadSettings())
    return () => off()
  }, [loadSettings])

  // Main-process events: open (manual / from selection) and hidden.
  useEffect(() => {
    const offOpen = window.quicktranslate.onOpen((p: OpenPayload) => {
      forcedTargetRef.current = undefined
      reqIdRef.current++ // cancel anything pending
      manualRef.current = false // resume auto-sizing for the new content
      lastSentRef.current = 0
      setCopied(false)
      void loadSettings()
      if (p.mode === 'selection' && p.text) {
        setInput(p.text)
        void runTranslate(p.text) // immediate, skip debounce
      } else {
        setInput('')
        setResult(null)
        setStatus('idle')
        void loadRecent()
        window.setTimeout(() => inputRef.current?.focus(), 30)
      }
    })
    const offHidden = window.quicktranslate.onHidden(() => setCopied(false))
    return () => {
      offOpen()
      offHidden()
    }
  }, [runTranslate, loadSettings, loadRecent])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  // Esc closes the window; Ctrl+Enter copies the translation and closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        window.quicktranslate.closeWindow()
        return
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        const t = resultRef.current?.translation
        if (t) {
          navigator.clipboard
            .writeText(t)
            .catch(() => {})
            .finally(() => window.quicktranslate.closeWindow())
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    resultRef.current = status === 'result' && result?.ok ? result : null
  }, [status, result])

  // Auto-size the window to fit the content exactly (unless the user grabbed the
  // grip). Formula: needed = currentWindowHeight + (contentOverflow of the body).
  const measure = useCallback(() => {
    if (manualRef.current) return
    const body = bodyRef.current
    if (!body) return
    const desired = Math.round(window.innerHeight + (body.scrollHeight - body.clientHeight))
    const clamped = Math.max(160, Math.min(maxHRef.current, desired))
    if (Math.abs(clamped - window.innerHeight) > 1 && clamped !== lastSentRef.current) {
      lastSentRef.current = clamped
      window.quicktranslate.resize(clamped)
    }
  }, [])

  useLayoutEffect(() => {
    measure()
    const r = requestAnimationFrame(measure)
    const t = window.setTimeout(measure, 90)
    return () => {
      cancelAnimationFrame(r)
      window.clearTimeout(t)
    }
  }, [status, result, input, snap?.maxWindowHeight, measure])

  const onInputChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    const v = e.target.value
    setInput(v)
    forcedTargetRef.current = undefined
    scheduleTranslate(v)
  }

  // Enter translates immediately (no debounce wait); Shift+Enter inserts a newline.
  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      void runTranslate(input, forcedTargetRef.current)
    }
  }

  const onClearInput = (): void => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    reqIdRef.current++
    setInput('')
    setResult(null)
    setStatus('idle')
    void loadRecent()
    inputRef.current?.focus()
  }

  const onReuseRecent = (h: HistoryEntry): void => {
    setInput(h.source)
    forcedTargetRef.current = undefined
    void runTranslate(h.source)
  }

  // Pin = keep the window open on blur (flips the existing closeOnBlur setting).
  const onTogglePin = async (): Promise<void> => {
    if (!snap) return
    const next = await window.quicktranslate.saveSettings({
      closeOnBlur: !snap.settings.closeOnBlur
    })
    setSnap(next)
  }

  const onSwap = async (): Promise<void> => {
    const a = snap?.settings.langACode
    const b = snap?.settings.langBCode
    const cur = result?.targetCode ?? forcedTargetRef.current
    const next = cur && a && b ? (cur === a ? b : a) : b
    forcedTargetRef.current = next
    await window.quicktranslate.swapLanguages()
    await loadSettings()
    if (input.trim()) void runTranslate(input, next)
  }

  const onCopy = async (): Promise<void> => {
    if (!result?.translation) return
    try {
      await navigator.clipboard.writeText(result.translation)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  // Manual vertical resize via the bottom grip.
  const onGripDown = (e: PointerEvent<HTMLDivElement>): void => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    gripRef.current = { startY: e.screenY, startH: window.innerHeight }
    manualRef.current = true
  }
  const onGripMove = (e: PointerEvent<HTMLDivElement>): void => {
    const g = gripRef.current
    if (!g) return
    const h = Math.max(160, Math.min(maxHRef.current, g.startH + (e.screenY - g.startY)))
    window.quicktranslate.resize(h)
  }
  const onGripUp = (e: PointerEvent<HTMLDivElement>): void => {
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    gripRef.current = null
  }

  // Recents only when history is enabled — a privacy-sensitive surface.
  const showRecent = !!snap?.settings.historyEnabled && recent.length > 0

  // Header direction tags.
  const a = (snap?.settings.langACode ?? 'ru').toUpperCase()
  const b = (snap?.settings.langBCode ?? 'en').toUpperCase()
  const tgt = (result?.targetCode ?? forcedTargetRef.current)?.toUpperCase()
  let src = a
  let dst = b
  if (tgt) {
    dst = tgt
    src = tgt === a ? b : a
  }

  return (
    <div className="qt-card qt-appear" ref={cardRef}>
      <div className="qt-header">
        <div className="qt-langs">
          <span className="qt-lang-tag">{src}</span>
          <button
            className="qt-swap"
            data-tip="Поменять направление"
            onClick={onSwap}
          >
            <SwapIcon />
          </button>
          <span className="qt-lang-tag">{dst}</span>
        </div>
        <div className="qt-header-actions qt-no-drag">
          <button
            className={`qt-iconbtn qt-pin ${snap && !snap.settings.closeOnBlur ? 'is-on' : ''}`}
            data-tip={
              snap && !snap.settings.closeOnBlur
                ? 'Открепить — закрывать при потере фокуса'
                : 'Закрепить окно поверх'
            }
            data-tip-align="right"
            onClick={onTogglePin}
          >
            <PinIcon />
          </button>
          <button
            className="qt-iconbtn"
            data-tip="Настройки"
            data-tip-align="right"
            onClick={() => window.quicktranslate.openSettings()}
          >
            <GearIcon />
          </button>
          <button
            className="qt-iconbtn"
            data-tip="Закрыть (Esc)"
            data-tip-align="right"
            onClick={() => window.quicktranslate.closeWindow()}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="qt-body" ref={bodyRef}>
        <div className="qt-input-wrap">
          <textarea
            ref={inputRef}
            className="qt-input"
            placeholder="Введите или вставьте текст…"
            value={input}
            onChange={onInputChange}
            onKeyDown={onInputKeyDown}
            spellCheck={false}
          />
          {input.length > 0 && (
            <button className="qt-input-clear" data-tip="Очистить" data-tip-align="right" onClick={onClearInput}>
              <ClearIcon />
            </button>
          )}
        </div>

        {status === 'idle' && !input.trim() && !showRecent && (
          <div className="qt-empty">
            <SparkIcon />
            <span>Введите текст или выделите его в любом приложении</span>
          </div>
        )}

        {status === 'idle' && !input.trim() && showRecent && (
          <div className="qt-recent">
            <div className="qt-recent-title">Недавнее</div>
            {recent.map((h) => (
              <button key={h.id} className="qt-recent-item" onClick={() => onReuseRecent(h)}>
                <span className="qt-recent-tr">{h.translation}</span>
                <span className="qt-recent-src">{h.source}</span>
              </button>
            ))}
          </div>
        )}

        {status === 'loading' && (
          <div className="qt-result qt-skeleton">
            <span className="qt-sk-line tall" style={{ width: '88%' }} />
            <span className="qt-sk-line" style={{ width: '72%' }} />
            <span className="qt-sk-line" style={{ width: '54%' }} />
          </div>
        )}

        {status === 'result' && result?.ok && (
          <div className="qt-result qt-result-in">
            <div className="qt-translation" onClick={onCopy} title="Нажми, чтобы скопировать">
              {result.translation}
              <span className={`qt-copy-hint ${copied ? 'is-done' : ''}`}>
                {copied ? (
                  '✓ Скопировано'
                ) : (
                  <>
                    <CopyIcon /> копировать
                  </>
                )}
              </span>
            </div>
            <div className="qt-footer">
              <span className="qt-chip">
                {result.detectedLang && result.targetLang
                  ? `${result.detectedLang} → ${result.targetLang}`
                  : 'Google Переводчик'}
                {result.cached ? ' · кэш' : ''}
              </span>
              <span className="qt-kbd-hints">
                <span className="qt-kbd-hint" data-tip="Скопировать и закрыть" data-tip-align="right">
                  Ctrl ↵
                </span>
                <span className="qt-kbd-hint" data-tip="Закрыть" data-tip-align="right">
                  Esc
                </span>
              </span>
            </div>
          </div>
        )}

        {status === 'error' && result?.error && (
          <div className="qt-error">
            <div className="qt-error-msg">
              <ErrorIcon />
              <span>{result.error.message}</span>
            </div>
            <div className="qt-error-actions">
              <button
                className="qt-btn qt-btn-accent"
                onClick={() => runTranslate(input, forcedTargetRef.current)}
              >
                Повторить
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className="qt-resize-grip"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
      />
    </div>
  )
}
