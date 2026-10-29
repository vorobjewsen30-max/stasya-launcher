# Privacy

Stasya Launcher stores account metadata, encrypted Microsoft token caches, settings, instance metadata, downloaded resources and game logs on the user's computer. The default data directory is `%APPDATA%/StasyaLauncher/data`. Account tokens are encrypted using Electron `safeStorage`; the application does not receive or store Microsoft passwords.

The application uses no project-operated account server, analytics or advertising service. It contacts Microsoft, Xbox and Minecraft Services for authentication, ownership checks, profiles and game resources; Modrinth for catalog queries and downloads; Adoptium for Java; and the chosen mod-loader metadata/distribution services. These services receive network requests, including the user's IP address and request data needed for the operation. Their own policies apply.

Authentication tokens are sent to the corresponding authentication services and are excluded from renderer state. All catalog and download requests use the corresponding public services directly.

Removing an account through the Accounts page removes its stored entry and encrypted cache from launcher state. Deleting the data directory removes launcher data, including saved worlds inside it; make backups first. Windows and file-system backups may retain earlier copies.

Game output is retained in the interface and games may write their own logs. Do not post account caches, `state.json`, tokens or unreviewed logs to public issues. The launcher filters the current Minecraft access token from forwarded process output, but cannot guarantee that third-party mods will never write other personal information.

Privacy and security questions: use the [repository issue tracker](https://github.com/vorobjewsen30-max/stasya-launcher/issues) without including secrets or personal documents.
