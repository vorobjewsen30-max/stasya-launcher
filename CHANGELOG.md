# Changelog

## 0.3.0 — 2026-10-29

- Choose the target instance before installing content; the newest compatible version is selected automatically.
- Required Modrinth dependencies are resolved recursively with exact version pins and conflict detection.
- Resource packs and shaders install into their own instance directories.
- Redesigned catalog tabs and target selection. Direct Modrinth access; proxy controls removed.
- Rollback covers the entire dependency installation across content directories.
- Owner confirmed Mojang approval, Microsoft sign-in and licensed multiplayer access.

## 0.2.1 — preview, 2026-10-27

Initial public source and Windows x64 preview release.

- Microsoft authentication with the project's own public Client ID, PKCE and encrypted token cache.
- Authentication and Minecraft Java ownership checks before every game launch.
- Managed instances, Java downloads, Modrinth catalog and proxy window, mrpack import and mod management.
- Clear launch prerequisites, recoverable mod updates, resource repair and intentional-stop handling.

Known release blocker: Minecraft Services does not yet authorize this Client ID. Full licensed login and gameplay remain unverified and unavailable until API access is granted.
