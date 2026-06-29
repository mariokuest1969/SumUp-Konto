---
name: API routing from frontend artifacts
description: How web artifacts must call the shared API server in this pnpm monorepo
---

# Frontend → API server calls must be root-relative `/api/...`

The API server is a **separate artifact** mounted globally at `/api` (`app.use("/api", router)` in `artifacts/api-server/src/app.ts`). The generated client (`@workspace/api-client-react`, `lib/api-client-react/src/custom-fetch.ts`) issues requests to root-relative paths like `/api/sumup/...` with `_baseUrl` unset for web. Global proxy routing delivers `/api/*` to the api-server regardless of the calling artifact's path prefix.

**Rule:** Any hand-written `fetch` in a web artifact (e.g. dialogs that don't use generated hooks) must call `/api/...` — NOT `${import.meta.env.BASE_URL}api/...`.

**Why:** `${BASE_URL}api/...` resolves to e.g. `/sumup-konto/api/...`, which the Vite dev server answers with the SPA fallback `index.html`. `res.json()` then throws a JSON parse / "Unexpected token" SyntaxError. This contradicts the generic Replit guidance ("prepend BASE_URL, avoid root-relative /api") because that guidance assumes the API is part of the same artifact; here it is a distinct global artifact.

**How to apply:** When adding direct fetch calls in `artifacts/*/src`, mirror the generated client and use `/api/...`. Prefer the generated hooks when an endpoint exists.
