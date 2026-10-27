# Verification

Automated tests cover path validation, archive validation and hashes, downloads, authenticated launch prerequisites, rechecking ownership, empty entitlement rejection, PKCE/state, Microsoft/Xbox/Minecraft response handling, encrypted-cache exclusion from renderer state, serialized writes, mod-update rollback, mrpack metadata and stop behavior.

Microsoft service tests use controlled responses. They demonstrate how success and failures are handled; they do not represent a successful production authorization.

The Electron smoke workflow checks 14 interface scenarios, including the empty state, Microsoft controls, launch prerequisites, instance actions, NeoForge version input, busy/running/stopping states and visible explanatory text at 1080px window width. Packaged EXE verification uses an isolated data directory.

The registered Client ID opens the Microsoft login page. Cancellation is tested without saving an account. A user attempt reached Minecraft Services and returned HTTP 403. Application approval is pending; successful licensed sign-in and game launch are not claimed. All supported Minecraft/loader combinations have not been tested.
