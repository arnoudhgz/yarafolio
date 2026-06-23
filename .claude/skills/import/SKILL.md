---
name: import
description: Import eToro portfolio positions into the advice tracker. Use when the user types /import, shares a screenshot of their eToro portfolio, or pastes a portfolio table/CSV. Parses positions, confirms the parsed table, then merges them into data/advice-log.json as bought entries.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Import eToro positions

Merge the user's actual eToro positions into `data/advice-log.json` so the dashboard and keep/drop check-ins work on real holdings.

## Two modes

- **Routine sync** (invoked by `/advice` and `/premarket` AFTER the advice table, and by `/check` at its start): `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge`. No confirmation step; just report the one-line result. Flag anomalies: API errors, more than a handful of new tickers, or tracked `bought` tickers the script reports as gone from the portfolio (likely sold; raise in the check-in). The portfolio is never input for advice generation; it's only compared against the picks afterwards.
- **Standalone `/import`** (first time or on request): follow the confirmation flow below before merging.

Imported-only positions (source `import`) stay in the log for check-ins and the portfolio comparison; the dashboard shows them on the Portfolio tab, not in the Advice view. Every merge also writes `data/portfolio.json` (full holdings snapshot with sectors and P/L) for the Portfolio tab and `/diversify`. The dashboard's "Update from eToro" button runs this same import via yarafolio.py.

## Input forms (in order of preference)

1. **eToro API (read-only)** - the default. Credentials live in the project `.env` (`ETORO_API_KEY`, `ETORO_USER_KEY`); `.env` is gitignored, so keys stay out of the repo. Never copy keys into the repo or into chat output.
2. eToro account statement export (.xlsx/.csv).
3. Screenshot(s) of the portfolio page. Columns: Asset, Price, Units, Avg. Open, P/L($), P/L(%), Net Value, Daily P/L, Fees.
4. Pasted text with the same data.

## Step 1a: Fetch via API (preferred)

```bash
source .env && curl -s \
  -H "x-api-key: $ETORO_API_KEY" \
  -H "x-user-key: $ETORO_USER_KEY" \
  -H "x-request-id: $(uuidgen)" \
  -H "Accept: application/json" \
  "https://public-api.etoro.com/api/v1/trading/info/portfolio"
```

GET only - never call trading/order endpoints, the key is read-only on purpose. The response uses instrument IDs; resolve them to tickers via the market data/instruments endpoint (same headers) and cache the id-to-ticker mapping in `data/instruments.json` so later runs don't refetch. Positions in the same instrument: keep them as ONE entry, units summed, boughtAt = weighted avg open rate.

## Step 1b: Parse from file/screenshot (fallback)

Extract per position: ticker, name, units, avg open price, current price (or net value / units). If a screenshot is too small or compressed to read every row reliably, say so and ask for sectioned screenshots (a few scrolls, each readable) or the statement export. Full-page captures get downscaled in the image pipeline and become unreadable; normal-height screenshots work. NEVER guess tickers; a misread ticker poisons the tracker.

## Step 2: Confirm before writing

Show the parsed result as a table (ticker, name, units, avg open, current price) and state the total count. Ask the user to confirm, point out any rows you're unsure about. Don't write anything before confirmation.

## Step 3: Merge into the tracker

Via the API path: `python3 scripts/etoro_import.py merge`. Manual fallback: for each confirmed position, in `data/advice-log.json`:

- Existing entry with that ticker: set status `bought`, boughtAt = avg open, add units, append current price to priceHistory.
- New entry: status `bought`, source `import`, firstAdvised = today, priceAtAdvice = avg open, boughtAt = avg open, units, reason "imported from eToro portfolio", rating/rsiAtAdvice null, priceHistory = [{today, current price}].

Bump `lastUpdated`. Don't fetch RSI or run research for imports; that happens when a ticker comes up in /advice, /premarket or /check.

## Step 4: Aftermath

Report: X imported, Y merged with existing advice entries, Z skipped/unreadable. Suggest opening the dashboard (`python3 yarafolio.py`).

Last step, auto-backup: run `python3 scripts/autosync.py "manual import"`. Commits + pushes the data files to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise.
