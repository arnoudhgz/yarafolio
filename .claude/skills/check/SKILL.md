---
name: check
description: Re-check a single stock pick. Use when the user types /check TICKER, shares a news link about a stock, or asks "would you still recommend X" or "should I keep/sell X". Pulls fresh news, lawsuits, analyst moves and gives a hold/add/exit/avoid verdict, then updates the advice tracker.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Check a pick

Due diligence re-check of one ticker. Triggered by `/check TICKER`, `/check TICKER <url>`, or questions like "would you still recommend ZTS after reading this?".

## Step 0: Sync positions from eToro (always first)

`python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge` - routine refresh, no confirmation needed. Gives the verdict real entry prices and live position state.

## Step 1: Gather

Script-first (one Bash call covers all four):

- `python3 scripts/screen.py quote TICKER` - price + key stats (52w range, PE, earnings date)
- `python3 scripts/screen.py forecast TICKER` - analyst consensus + price target range
- `python3 scripts/screen.py news TICKER --days 3` - recent headlines
- `python3 scripts/screen.py news TICKER --days 30 --red-flags` - lawsuit/investigation/SEC headlines

Then judgment, via WebSearch/WebFetch only where needed: open the article behind any headline whose severity is unclear (law firm press releases fishing for plaintiffs are common noise; an actual SEC investigation or restatement is not), search for today's analyst moves when the forecast line looks stale, and find RSI (the quote page has no RSI; use `screen.py <strategy>` when the ticker is on it, otherwise a quick search). If the user gave a URL: fetch it and weigh how serious the source is.

**Red-flag gate (mandatory):** run exactly one targeted `WebSearch "TICKER lawsuit OR SEC investigation OR fraud OR class action [month year]"`, unconditional even when the `--red-flags` headlines looked clean: the keyword screen can miss a real problem phrased outside its terms (the ZTS lesson). A genuine SEC investigation, restatement, or executive departure under a cloud flips the verdict toward exit/avoid; law-firm fishing press releases are noise.

## Step 2: Compare against the tracker

Read the tracked entry via `python3 scripts/advice_log.py get-entry TICKER --json` (returns `null` when not tracked, so no hand-parsing the JSON). If tracked: price at advice vs now, status, whether the original thesis still holds.

## Step 3: Verdict

Output one table:

| Ticker | Price now | vs advice | RSI | News severity | Verdict |
|---|---|---|---|---|---|

Verdict is one of **hold / add / exit / avoid**, followed by 3-5 bullets why (severity of the news, thesis intact or broken, stop-loss situation). Sources as hyperlinks below.

Remember the strategy: trailing stop from +5% does the selling on winners; the real question is usually whether the thesis broke before the stop kicks in.

## Step 4: Update tracker (CLI only, never hand-edit the JSON)

If the ticker is tracked (or if the user asked about a specific stock and it turns out to be a good opportunity), update or add it in one call.

**Rigor rule:** when adding a *new* stock after a user inquiry, use the exact same rigor as the `/advice` skill. Do NOT omit fields:
- `--price`
- `--source manual`
- `--rating` (A/B/C with +/-, based on conviction)
- `--rsi` (fetch it or look it up)
- `--buy-below` (support level or gap-fill)
- `--drop-below` (thesis-invalidation floor)
- `--drop-above` (opportunity-gone ceiling)
- `--sector`
- `--note` (verdict + 1-2 sentence rationale)

Example: `python3 scripts/advice_log.py add-pick TICKER --source manual --price <now> --rating <grade> --rsi <fresh> --buy-below <X> --drop-below <Y> --drop-above <Z> --sector "<sector>" --note "<verdict>: <key news>"`

Updating an existing tracked ticker: drop `--source`, just refresh the levels and append a `--note`. The CLI appends today's price point, refreshes the fields (including a sector backfill on older entries), and the note lands in the dated notes history shown on the dashboard.

If the user decides (keep/sell/drop), apply it: `python3 scripts/advice_log.py set-status TICKER bought|sold|dropped [--price X]` (logs an automatic note), or `set-tsl TICKER` when they set a trailing stop. If the verdict is exit/avoid and the user hasn't reacted, ask once via AskUserQuestion what to do with the tracked status.

Last step, auto-backup: if you changed the tracker, run `python3 scripts/autosync.py "check TICKER"`. Commits + pushes the data files to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise.
