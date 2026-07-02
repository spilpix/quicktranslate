<div align="center">

# QuickTranslate

**Мгновенный перевод выделенного текста для Windows — по `Ctrl+T` поверх любого приложения.**

[![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0a0a0b)](https://github.com/spilpix/quicktranslate/releases)
[![Built with Electron](https://img.shields.io/badge/Electron-33-2c2c2c?logo=electron)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-c1714a)](LICENSE)

[**🌐 Сайт**](https://spilpix.github.io/quicktranslate/) · [**⬇ Скачать**](https://github.com/spilpix/quicktranslate/releases/latest) · [Возможности](#возможности) · [Разработка](#разработка)

</div>

---

QuickTranslate живёт в трее и по глобальной горячей клавише открывает лёгкое окно
перевода поверх активного приложения. Перевод — бесплатный, через публичный эндпоинт
Google Translate: **без аккаунтов, без API-ключей, без настройки**.

## Возможности

- **Глобальный хоткей** (по умолчанию `Ctrl+T`) — открывает окно перевода у курсора
  или по центру экрана. Переназначается в настройках, конфликт с другими приложениями
  распознаётся.
- **Перевод по выделению** — по `Ctrl+C` над выделенным текстом всплывает иконка; клик
  открывает перевод (глобальный хук через `uiohook-napi`, включается по желанию).
- **Автоопределение направления** внутри языковой пары (по умолчанию RU↔EN), ручной
  свап кнопкой ⇄. 14 языков в настройках.
- **Клавиатура прежде всего** — `Enter` переводит немедленно, `Ctrl+Enter` копирует и
  закрывает, `Esc` закрывает. Недавние переводы — в пустом окне.
- **Приватность** — тексты не логируются и не пишутся на диск; кэш последних переводов
  живёт только в памяти. Локальная история — опционально и отключается одной галочкой.
- **Родной вид** — светлая/тёмная тема и акцентный цвет подхватываются из Windows
  (или фирменная терракота). Уважает `prefers-reduced-motion`.
- **Трей** с быстрым доступом и автозапуском вместе с Windows.

## Установка

Скачайте установщик со страницы [релизов](https://github.com/spilpix/quicktranslate/releases/latest)
и запустите. При первом запуске SmartScreen может предупредить о неизвестном издателе —
«Подробнее» → «Выполнить в любом случае».

> Требования: Windows 10/11. Ключи и аккаунты не нужны.

## Разработка

```bash
npm install     # зависимости + пересборка нативного модуля под Electron
npm run icons   # (одноразово) placeholder-иконки build/icon.ico + tray
npm run dev     # Electron с hot-reload
```

Проверка типов и сборка:

```bash
npm run typecheck   # tsc для main+preload и renderer
npm run build       # electron-vite build → out/
npm run dist        # NSIS-установщик → release/
```

## Архитектура

Electron + React + TypeScript, сборка на [`electron-vite`](https://electron-vite.org/).
Три независимых окна (translator / popup / settings), общий контракт IPC через
`contextBridge`, единая дизайн-система на CSS-токенах.

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # точка входа, IPC, single-instance, трей/хоткей/автозапуск
│   ├── windowManager.ts     # три окна, позиционирование у курсора
│   ├── globalShortcuts.ts   # регистрация/перерегистрация хоткея + конфликт
│   ├── clipboardWatcher.ts  # глобальный хук Ctrl+C (uiohook-napi) + эвристики шума
│   ├── win32Input.ts        # WinAPI через koffi (чтение выделения)
│   ├── googleClient.ts      # бесплатный Google Translate, таймаут 8с, 429/offline, LRU-кэш
│   ├── langUtils.ts         # определение направления, лейблы языков, LRU
│   ├── settingsStore.ts     # electron-store, история (opt-out)
│   ├── tray.ts / trayIcon.ts# трей-иконка и динамическое меню
├── preload/                 # contextBridge → window.quicktranslate (IPC-контракт)
├── shared/                  # общие типы main ⇄ renderer
└── renderer/                # React UI
    ├── translator/          # окно перевода (idle/loading/result/error)
    ├── popup/               # popup-иконка выделения
    ├── settings/            # окно настроек
    └── shared/              # дизайн-токены (tokens.css) + accent + глобальные стили
```

Лендинг (`landing/`) публикуется на GitHub Pages из ветки `gh-pages`.

## Заметки по реализации

- **Нативные модули.** `uiohook-napi` и `koffi` требуют ABI Electron; `postinstall`
  (`electron-builder install-app-deps`) их пересобирает. Если хук не загрузился,
  приложение продолжает работать — popup по `Ctrl+C` просто отключается, хоткей
  остаётся. Статус виден в настройках.
- **Иконки — placeholder.** `build/icon.ico` и `resources/tray-icon.png` генерируются
  скриптом `scripts/generate-icons.ps1`. Замените на финальную иконку перед релизом.
- **Перевод.** Используется публичный (неофициальный) эндпоинт Google Translate —
  бесплатно и без ключа. Для не-RU/EN пар направление определяется упрощённо (по скрипту
  текста) — осознанное ограничение v1.

## Лицензия

[MIT](LICENSE) © 2026 Eraj Rahmonberdiev
