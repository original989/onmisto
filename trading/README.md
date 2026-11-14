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
