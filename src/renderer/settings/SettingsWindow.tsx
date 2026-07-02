import { useCallback, useEffect, useState } from 'react'
import type { HistoryEntry, Settings, SettingsSnapshot } from '@shared/types'
import { applyAppearance } from '../shared/accent'

function Toggle({
  on,
  onClick,
  disabled
}: {
  on: boolean
  onClick: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      className={`qt-switch ${on ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
    />
  )
}

/** Render an accelerator as keycaps: "Ctrl + T" → [Ctrl] [T]. */
function HotkeyCaps({ acc }: { acc: string }): JSX.Element {
  return (
    <>
      {prettyHotkey(acc)
        .split(' + ')
        .map((part, i) => (
          <kbd key={i} className="qt-key">
            {part}
          </kbd>
        ))}
    </>
  )
}

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: 'Українська' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' }
]

const MODIFIER_KEYS = ['Control', 'Meta', 'Alt', 'Shift']

function acceleratorFromEvent(e: KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (MODIFIER_KEYS.includes(e.key)) return null // wait for a real key

  let key = e.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()

  const valid =
    /^[A-Z0-9]$/.test(key) || /^F\d{1,2}$/.test(key) || ['Space', 'Tab', 'Enter'].includes(key)
  if (!valid || mods.length === 0) return null // require at least one modifier
  return [...mods, key].join('+')
}

function prettyHotkey(acc: string): string {
  return acc.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ')
}

export function SettingsWindow(): JSX.Element {
  const [snap, setSnap] = useState<SettingsSnapshot | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const s = await window.quicktranslate.getSettings()
    setSnap(s)
    applyAppearance(s)
  }, [])

  const loadHistory = useCallback(async () => {
    setHistory(await window.quicktranslate.getHistory())
  }, [])

  useEffect(() => {
    void load()
    void loadHistory()
    const off = window.quicktranslate.onSettingsChanged(() => void load())
    return () => off()
  }, [load, loadHistory])

  const patch = useCallback(async (p: Partial<Settings>) => {
    const next = await window.quicktranslate.saveSettings(p)
    setSnap(next)
    applyAppearance(next)
  }, [])

  // Hotkey capture.
  useEffect(() => {
    if (!capturing) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      if (e.key === 'Escape') {
        setCapturing(false)
        return
      }
      const acc = acceleratorFromEvent(e)
      if (acc) {
        setCapturing(false)
        void patch({ hotkey: acc })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, patch])

  const copyText = (t: string, id: string): void => {
    void navigator.clipboard
      .writeText(t)
      .then(() => {
        setCopiedId(id)
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1200)
      })
      .catch(() => {})
  }
  const clearHistory = async (): Promise<void> => {
    await window.quicktranslate.clearHistory()
    setHistory([])
  }

  const labelFor = (code: string): string =>
    LANGUAGES.find((l) => l.code === code)?.label ?? code.toUpperCase()

  if (!snap) {
    return (
      <div className="qt-settings">
        <div className="qt-settings-header">
          <span className="qt-settings-title">Настройки</span>
        </div>
      </div>
    )
  }

  const s = snap.settings

  const setLangA = (code: string): void =>
    void patch({ langACode: code, langALabel: labelFor(code) })
  const setLangB = (code: string): void =>
    void patch({ langBCode: code, langBLabel: labelFor(code) })
  const swapPair = async (): Promise<void> => {
    await window.quicktranslate.swapLanguages()
    await load()
  }

  return (
    <div className="qt-settings">
      <div className="qt-settings-header">
        <span className="qt-settings-title">Настройки</span>
        <button
          className="qt-settings-close"
          data-tip="Закрыть"
          data-tip-align="right"
          onClick={() => window.close()}
        >
          ✕
        </button>
      </div>

      <div className="qt-settings-body">
        {/* Languages -------------------------------------------------------- */}
        <section className="qt-section">
          <div className="qt-section-title">Языковая пара</div>
          <div className="qt-pair">
            <select
              className="qt-select"
              value={s.langACode}
              onChange={(e) => setLangA(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className="qt-pair-swap" data-tip="Поменять местами" onClick={swapPair}>
              ⇄
            </button>
            <select
              className="qt-select"
              value={s.langBCode}
              onChange={(e) => setLangB(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <span className="qt-row-sub">
            Направление определяется автоматически; ⇄ в окне меняет его вручную. Перевод —
            бесплатный, через Google, без ключа.
          </span>
        </section>

        {/* Hotkey ----------------------------------------------------------- */}
        <section className="qt-section">
          <div className="qt-section-title">Горячая клавиша</div>
          <div className="qt-hotkey-box">
            <div className={`qt-hotkey-display ${capturing ? 'is-capturing' : ''}`}>
              {capturing ? 'Нажмите сочетание… (Esc — отмена)' : <HotkeyCaps acc={s.hotkey} />}
            </div>
            <button className="qt-btn" onClick={() => setCapturing((v) => !v)}>
              {capturing ? 'Отмена' : 'Изменить'}
            </button>
          </div>
          {snap.hotkeyConflict && (
            <span className="qt-warn">
              ⚠ Сочетание занято другим приложением — оставлено прежнее. Выберите другое.
            </span>
          )}
          <div className="qt-segment">
            <button
              className={`qt-segment-btn ${s.hotkeyPosition === 'center' ? 'is-active' : ''}`}
              onClick={() => patch({ hotkeyPosition: 'center' })}
            >
              По центру экрана
            </button>
            <button
              className={`qt-segment-btn ${s.hotkeyPosition === 'cursor' ? 'is-active' : ''}`}
              onClick={() => patch({ hotkeyPosition: 'cursor' })}
            >
              У курсора
            </button>
          </div>
          <span className="qt-row-sub">Где появляется окно при нажатии горячей клавиши.</span>
        </section>

        {/* Behaviour -------------------------------------------------------- */}
        <section className="qt-section">
          <div className="qt-section-title">Поведение</div>

          <div className="qt-row">
            <div className="qt-row-col">
              <span className="qt-row-label">Запуск вместе с Windows</span>
            </div>
            <Toggle on={s.autoLaunch} onClick={() => patch({ autoLaunch: !s.autoLaunch })} />
          </div>

          <div className="qt-row">
            <div className="qt-row-col">
              <span className="qt-row-label">Закрывать окно при потере фокуса</span>
            </div>
            <Toggle on={s.closeOnBlur} onClick={() => patch({ closeOnBlur: !s.closeOnBlur })} />
          </div>

          <div className="qt-row">
            <div className="qt-row-col">
              <span className="qt-row-label">Значок при выделении текста мышью</span>
              <span className="qt-row-sub">
                {!snap.selectionActive
                  ? 'Глобальный хук недоступен (модуль uiohook не загрузился)'
                  : snap.autoSelectAvailable
                    ? 'Выдели текст мышью — рядом появится значок перевода. В консолях не срабатывает.'
                    : 'Режим мыши недоступен — работает по Ctrl+C.'}
              </span>
            </div>
            <Toggle
              on={s.selectionPopupEnabled && snap.selectionActive}
              disabled={!snap.selectionActive}
              onClick={() => patch({ selectionPopupEnabled: !s.selectionPopupEnabled })}
            />
          </div>
        </section>

        {/* Appearance ------------------------------------------------------- */}
        <section className="qt-section">
          <div className="qt-section-title">Внешний вид</div>
          <div className="qt-segment">
            <button
              className={`qt-segment-btn ${s.accentSource === 'windows' ? 'is-active' : ''}`}
              onClick={() => patch({ accentSource: 'windows' })}
            >
              Акцент Windows
            </button>
            <button
              className={`qt-segment-btn ${s.accentSource === 'terracotta' ? 'is-active' : ''}`}
              onClick={() => patch({ accentSource: 'terracotta' })}
            >
              Терракота
            </button>
          </div>
          <span className="qt-row-sub">
            {s.accentSource === 'windows'
              ? snap.windowsAccent
                ? `Акцент берётся из Windows (${snap.windowsAccent}).`
                : 'Цвет Windows недоступен — используется терракотовый.'
              : 'Фирменный терракотовый акцент.'}{' '}
            Тема (светлая/тёмная) следует за Windows автоматически.
          </span>
        </section>

        {/* History ---------------------------------------------------------- */}
        <section className="qt-section">
          <div className="qt-section-title">История переводов</div>
          <div className="qt-row">
            <div className="qt-row-col">
              <span className="qt-row-label">Сохранять историю</span>
              <span className="qt-row-sub">Хранится локально, только на этом компьютере.</span>
            </div>
            <Toggle
              on={s.historyEnabled}
              onClick={() => patch({ historyEnabled: !s.historyEnabled })}
            />
          </div>

          {history.length > 0 ? (
            <>
              <div className="qt-history">
                {history.slice(0, 25).map((h) => (
                  <button
                    key={h.id}
                    className="qt-history-item"
                    title="Нажмите, чтобы скопировать"
                    onClick={() => copyText(h.translation, h.id)}
                  >
                    <span className="qt-history-tr">{h.translation}</span>
                    <span className="qt-history-src">{h.source}</span>
                    {copiedId === h.id && <span className="qt-history-copied">✓ Скопировано</span>}
                  </button>
                ))}
              </div>
              <button className="qt-btn" onClick={clearHistory}>
                Очистить историю
              </button>
            </>
          ) : (
            <span className="qt-row-sub">Пока пусто — переводы будут появляться здесь.</span>
          )}
        </section>
      </div>
    </div>
  )
}
