# Option Chain + OI Profile (Dhan)

Live option chain with expiry selector; tap any LTP to open its candlestick chart with an OI profile (OI-POC / HOIN / LOIN).

- `site/index.html`  – the website (auto-deployed to GitHub Pages)
- `worker/worker.js` – Cloudflare Worker proxy that holds your Dhan token and renews it automatically

**Never commit your Dhan token, PIN or TOTP key.** They live only in Cloudflare worker secrets.

## Setup
1. Cloudflare: create a Worker, paste `worker/worker.js`, add KV binding `KV`, secrets `DHAN_CLIENT_ID`, `DHAN_TOKEN`, variable `ALLOWED_ORIGIN` = your Pages URL (no trailing slash), cron `30 2,14 * * *`.
2. Edit the `PROXY` line in `site/index.html` to your worker URL and commit.
3. Repo Settings → Pages → Source: **GitHub Actions**. Site goes live at `https://<user>.github.io/<repo>/`.

Leave `PROXY` unchanged to run in DEMO mode with simulated data.
