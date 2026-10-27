# Stasya Launcher

A Minecraft: Java Edition launcher for Windows x64, with a Russian interface, managed instances, Modrinth browsing and `.mrpack` imports.

**Preview 0.2.1 — Minecraft Services AppID approval pending.** Microsoft sign-in currently reaches a Minecraft Services HTTP 403 for the registered application. Signing in and launching with a real licensed account are not yet validated end to end. This preview cannot currently be used for a successful authenticated game launch. Publishing a GitHub release does not grant Minecraft API access.

[Download Windows x64 preview](https://github.com/vorobjewsen30-max/stasya-launcher/releases/tag/v0.2.1) · [Report an issue](https://github.com/vorobjewsen30-max/stasya-launcher/issues) · [Privacy](PRIVACY.md)

![Stasya Launcher interface](docs/preview.png)

## Возможности

- Вход личным Microsoft-аккаунтом. Авторизация и владение Minecraft Java проверяются перед каждым игровым запуском; при ошибке запуск блокируется.
- Отдельные игровые папки сборок, настройка памяти, журнал и восстановление игровых ресурсов.
- Vanilla, Fabric, Quilt, Forge и NeoForge. Для NeoForge требуется явно указать версию загрузчика; полная матрица сочетаний версий не проверена.
- Автоматическая загрузка Java из Adoptium с проверкой SHA-256; можно указать свой `java.exe`.
- Поиск Modrinth, установка зависимостей и переключение модов.
- Modrinth Proxy через отдельное окно `modrinth.black`; совместимость скачиваемых модов выбирается на сайте.
- Импорт `.mrpack` с проверкой хешей и поддержкой клиентских overrides.
- Читаемая подсказка рядом с «Играть» объясняет, нужно ли войти, создать или выбрать сборку.

## Как запустить

Скачай EXE из Releases и открой его. Node.js для готового приложения не нужен. Сейчас Microsoft-вход блокируется на стороне Minecraft Services до одобрения Client ID; лицензия пользователя сама по себе этого разрешения не предоставляет.

После одобрения API предполагаемый порядок: войти через Microsoft с лицензией Minecraft Java, создать сборку или импортировать `.mrpack`, выбрать её и нажать «Играть». Java и ресурсы загружаются при первом запуске. Minecraft и моды не входят в EXE.

Данные сохраняются в `%APPDATA%/StasyaLauncher/data`. Portable EXE не хранит миры рядом с исполняемым файлом. Перед переносом данных закрой игру и сделай резервную копию. EXE не подписан сертификатом издателя.

## Authentication and API review

The desktop app is a public client using MSAL Node, PKCE and OAuth state validation. It has no client secret. Microsoft token caches are encrypted with Electron `safeStorage` on Windows and never exposed to the renderer. Authentication requests do not use the Modrinth proxy.

Public application (client) ID: `ed79d506-8ce9-4754-abe5-eee153fe6562`.

Redirect URI: `https://login.live.com/oauth20_desktop.srf`.

The flow is Microsoft → Xbox Live → XSTS → Minecraft Services → ownership entitlements → Java profile. Every launch refreshes authentication and checks ownership before downloading/installing the game or spawning its process. There is no gameplay fallback when authentication or ownership fails.

Entra registration is complete. A Minecraft AppID approval request was submitted through the [official AppID review form](https://aka.ms/mce-reviewappid) on 2026-10-27, referencing this repository and release v0.2.1. The form confirmed receipt with “Thank you for contacting Mojang Studios.” Approval has not yet been granted. The form states that submissions are reviewed weekly; this is not a guaranteed response deadline.

## Build and verification

Windows x64 and Node.js 22.12+:

```powershell
npm ci
npm test
npm start
npm run build
```

Build output: `release/Stasya-Launcher-0.2.1-Windows-x64.exe`.

Interface check using isolated data:

```powershell
npx electron . --smoke --data-dir=C:/temp/stasya-ui-check
```

See [TESTING.md](TESTING.md) for verified behavior and remaining limitations. Do not use personal game data for automated tests.

## Project and licensing

Source: MIT. Dependencies retain their own licenses. Main projects: [Electron](https://www.electronjs.org/), [XMCL](https://github.com/Voxelum/minecraft-launcher-core-node), [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js), [Modrinth API](https://docs.modrinth.com/api/) and [Adoptium](https://api.adoptium.net/).

Stasya Launcher is an independent project, not an official Mojang, Microsoft, Xbox or Modrinth product. Minecraft requires a separate valid license. The project does not distribute Minecraft binaries or third-party mods in its releases.
