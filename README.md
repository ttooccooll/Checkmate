# Checkmate

Checkmate Delivery — a top-down motorcycle delivery game on the South African
coast. Run packages, dodge minibus taxis, unlock the lighthouse mystery, and
buy upgrades with Lightning sats (via Nostr Wallet Connect / Alby Hub).

## Develop

```bash
npm install
npm start        # game only (Vite dev server on :8347)
npm run dev      # game + payment API (requires Vercel CLI and NWC_CONNECTION_STRING in .env)
```

## Build & check

```bash
npm run build    # production build to dist/
npm run preview  # serve the production build locally
npm run lint     # ESLint
npm test         # builds, then runs the headless browser suite (needs: npx playwright install chromium)
```

CI runs lint, build, and the full test suite on every push via GitHub Actions.

## Deploy

Deployed on Vercel: `vercel.json` builds with Vite into `dist/`, and the
`api/` directory ships as serverless functions. Set `NWC_CONNECTION_STRING`
(a receive-only connection string from Alby Hub) in the project's
environment variables.
