# ONMISTO · Private Trading (development only)

This directory is an isolated prototype, **not linked from the public ONMISTO site** and not deployed by the current build. No exchange credentials should ever be placed here.

## Security requirements before activation
- Server-side administrator authentication with a separate identity/session; a hidden URL or GitHub token in the browser is not authorization.
- WhiteBIT API key and secret in Cloudflare encrypted Worker secrets; trading only, no withdrawal permission.
- No exchange credentials in browser storage, Git, logs, URL parameters, or analytics.
- Default to paper mode; live execution requires a separate deliberate opt-in and explicit trade limits.
- Verify WhiteBIT minimum order sizes, fees, symbol availability, exchange precision, and account balance before placing orders.
- Idempotent order execution, exchange order reconciliation, error alerts, emergency stop, rate limits, and daily loss limit.
- Backtest including trading fees and slippage; forward test before live use.
- Review Cloudflare free-tier limits and Cron reliability; do not assume guaranteed 24/7 execution.

## Planned UI
- Balance, goal progress, profit/loss (including fees), drawdown
- Clear bot status: paused / monitoring / position open / error
- Activity log and explainable decisions
- Separate advanced analytics and risk settings
- Responsive Ukrainian mobile-first interface

**Status:** design and safety preparation only. No real trading or private WhiteBIT connection exists.

## Cloudflare Access setup (required before merge/deploy)
1. Cloudflare Zero Trust → Access → Applications → Add application → Self-hosted.
2. Protect BOTH `https://YOUR_ONMISTO_DOMAIN/trading*` and `https://YOUR_ONMISTO_DOMAIN/api/trading/*` with Access applications/policies restricted to your exact email. Both paths must be protected by an Access app with the **same application AUD**; otherwise configure a single application with both paths.
3. Set Worker environment variables (not public JS): `TRADING_ACCESS_TEAM` (e.g. `yourteam.cloudflareaccess.com`), `TRADING_ACCESS_AUD` (application AUD tag), `TRADING_OWNER_EMAIL` (your verified email).
4. Confirm unauthenticated requests to both paths are blocked; confirm a different authorized account is rejected by the Worker even if Cloudflare Access lets it through.
5. Confirm the protected panel works on iPhone and public homepage is unchanged.
6. Merge only after tests pass and Cloudflare Access is configured. Do not use a trading API key for login.

**Important:** this module intentionally fails closed with HTTP 503 if any Access settings are missing. It cannot be used before configuration. No live trading, account balances, or WhiteBIT private API calls are implemented.
