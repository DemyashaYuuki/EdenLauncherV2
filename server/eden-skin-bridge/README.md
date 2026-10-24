# EdenSkinBridge

Server plugins that let EdenLauncher's Skin Studio apply a skin to an offline-mode EdenWorld player
through SkinsRestorer, after the player links the launcher in game while authenticated.

- `core/` — platform independent pairing, tokens, HMAC proxy assertions, PNG validation, job queue
  and the HTTP API (JDK + Gson only).
- `paper/` — Purpur/Paper plugin (nLogin adapter, proxy-assertion adapter, SkinsRestorer 15 backend,
  `/edenstudio` command).
- `velocity/` — Velocity companion answering signed authentication queries (VeloAuth or nLogin).

See [docs/INSTALL.md](docs/INSTALL.md) for installation, security model, HTTPS publishing and
migration. Licensed under GPL-3.0-only, like EdenLauncher. SkinsRestorer, nLogin and VeloAuth are
used through their public APIs or reflection and are not redistributed.
