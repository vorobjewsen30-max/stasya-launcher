# Store preparation — Stasya Launcher

This directory is for the official application with Microsoft authentication and ownership checks. There is no claim of Microsoft Store certification.

## Available distribution formats

- Portable Windows x64 EXE: direct download, no installer.
- Offline per-user NSIS installer: installs the launcher without downloading application components. Supports `/S` for a silent installation; does not require system-wide Java. Game and Java downloads happen when the user starts a game, not during app setup.
- MSIX: `node scripts/build-store.cjs --preview` creates a **validation-only unsigned package**, using an explicitly fictitious packaging-preview identity. Do not submit it to a store or distribute it as an installable signed package.
- WinGet: draft manifests are generated in the local store kit after the installer hash is known. They are not a published WinGet listing.

## Microsoft Store completion

1. Complete developer-account verification and reserve the app name in Partner Center. This was not completed in this project. No bypass of identity verification is provided.
2. Copy the exact Package/Identity/Name, Publisher and publisher display name from Partner Center into a private `store/identity.json` following `identity.example.json`. These are not the OAuth client or tenant IDs.
3. Run `npm run build`, then `node scripts/build-store.cjs --identity=store/identity.json`.
4. Test the actual package using the Windows App Certification Kit and an appropriate signed test deployment. MakeAppx structural validation is not a WACK test. This project has not claimed packaged runtime or Store certification testing. In particular, verify that Minecraft/Java child processes, account encryption, writable data and uninstall behavior work in the packaged environment.
5. Complete age ratings, support contact, privacy URL, languages and Store listing details. The launcher requires `runFullTrust` to start Java and Minecraft; explain this in certification notes. Do not supply a user's password or token as reviewer credentials.
6. For a Store MSIX submission, Microsoft signs the package after certification. For an EXE/MSI submission, you need a valid CA-trusted Authenticode certificate and the required signatures on binaries. The current EXEs are unsigned and are **not submission-ready through the EXE/MSI route**.

Data-removal behavior of an installed MSIX must be verified separately. The ordinary NSIS installer is configured to leave launcher data when uninstalled; its uninstaller does not intentionally remove worlds.

No store account, KYC, publisher identity, certificate or certification outcome is fabricated.

References: [Microsoft MSIX requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements), [EXE/MSI requirements](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msi/app-package-requirements), [WinGet manifests](https://learn.microsoft.com/en-us/windows/package-manager/package/manifest).
