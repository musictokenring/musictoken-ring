# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MusicToken Ring is a **static vanilla HTML/JS/CSS frontend** for a music battle arena with blockchain integration. There is **no build step** and **zero npm dependencies** — all libraries (Supabase, ethers.js) are loaded via CDN `<script>` tags. The backend API is external (hosted on Render) and is not part of this repo.

### Running the dev server

```bash
npx serve . -l 8000
```

Or equivalently: `npm run preview` (uses `npx serve .`).

### Checks and validation

- `npm run check` runs JS syntax checks (`node --check`) on key files plus `scripts/verify-runtime-integrity.js`.
- `npm run build` is an alias for `npm run check` — there is no transpilation or bundling step.
- **Known issue (pre-existing):** `verify-runtime-integrity.js` fails with `MISSING_INLINE_DASHBOARD_GUARD` because `index.html` lacks the expected `if (window.MTR_INLINE_TOP_STREAMS_ACTIVE) { return; }` guard. The individual `node --check` syntax validations pass successfully.

### Gotchas

- The project has no `node_modules` dependencies. `npm install` is essentially a no-op but is safe to run.
- The `package-lock.json` is empty (no dependencies). Do not be alarmed.
- Some files (`backend/prize-service.js`, `SAFE_ROLLOUT_CHECKLIST.md`) contain leftover merge-conflict-style branch markers — these are not active git conflicts.
- Full app functionality (search, battles, deposits, cashout) requires the external backend at `https://musictoken-backend.onrender.com` and a MetaMask wallet on Base (chain 8453). Without these, the UI loads and displays the streaming dashboard but interactive features won't connect.
