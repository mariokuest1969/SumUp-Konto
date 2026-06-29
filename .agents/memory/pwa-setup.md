---
name: PWA / installable desktop app setup
description: How web artifacts are made installable (Windows/desktop/mobile) in this monorepo
---

# Making a web artifact installable (PWA)

Both web apps (voucher, sumup-konto) are installable PWAs via `vite-plugin-pwa` (`^1.3.0`, declared per-package). Pattern to replicate:
- Add `VitePWA({ registerType: "autoUpdate", includeAssets: ["favicon.svg"], manifest: {...} })` to the artifact's `vite.config.ts`. `autoUpdate` auto-injects SW registration — no manual code in `main.tsx`.
- Provide `public/pwa-192x192.png` and `public/pwa-512x512.png` (512 uses `purpose: "any maskable"`). Generate with ImageMagick (`magick -size 512x512 xc:'#color' ...`).
- Add `<link rel="apple-touch-icon">` + `<meta name="theme-color">` to `index.html`.

**Subpath gotcha:** Each web artifact is served under its own base path (`BASE_PATH` env, e.g. `/sumup-konto/`; voucher is `/`). The manifest `start_url` AND `scope` MUST be set to that `basePath`, otherwise the installed app opens the wrong URL / SW scope mismatches.

**Why:** A PWA is exactly what "installable online Windows desktop app with a desktop icon" means — Chrome/Edge installs it, it gets a desktop icon and runs in a standalone window while staying an online web app. No Electron/native packaging needed.

**How to apply:** The SW is only active in the production build (no `devOptions.enabled`), so the install prompt appears on the **published** HTTPS site, not the dev preview. To install: open the published URL in Chrome/Edge → install icon in address bar (or ⋮ menu → "Install"/"Apps").
