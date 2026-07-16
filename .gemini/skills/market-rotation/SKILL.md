---
name: market-rotation
description: Sector rotation strategy finding opportunities in sectors gaining relative momentum. Uses systematic tactics to identify market rotation.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Market Rotation

Recommend max ~10 stocks that benefit from the current market rotation. This strategy identifies sectors or themes that are systematically rotating into market leadership and finds high-quality setups within them. They do not have to be strictly oversold, but must strictly adhere to `STRATEGY.md`.

## Step 1: Identify the Rotation
Use mathematical and systematic tactics to identify sector rotation.
- Look for sectors showing improving relative momentum (e.g., Relative Rotation Graphs concepts, crossing above 50-day moving averages, or 1-month performance exceeding 3-month performance).
- WebSearch for recent systematic sector performance ("sector performance 1 month vs 3 month", "sector rotation today").
- Avoid sectors that are already overextended or losing momentum.

## Step 2: Screen Candidates
Find 3-4 candidates per outperforming sector (total 12-14 candidates). Screen strictly according to the active parameters in `STRATEGY.md`.
- Ensure all quality metrics (like ROE, Debt-to-Equity, Piotroski F-Score, Price, etc.) meet the required thresholds.
- Ensure the sectors chosen are not violating any active bans or allocation limits.
- RSI does not need to be strictly 20-30 for this rotation strategy, but avoid extreme overbought levels unless the valuation metrics justify it.

## Step 3: Per-ticker research (parallel)
Pre-fetch per-candidate data: `python3 scripts/screen.py quote T1 T2 ...`, `... forecast T1 T2 ...`, `... news T1 T2 ...` and `... news T1 T2 ... --days 14 --red-flags`.
Then run `stock-researcher` agents per candidate, in parallel. The prompt must include the sector context and the candidate's data.

**Final-pick red-flag gate (mandatory):** for each of the ~10 picks, run exactly one targeted `WebSearch "TICKER lawsuit OR SEC investigation OR fraud OR class action [month year]"`.

## Step 4: Output
ONE markdown table, ~10 picks grouped by sector:

| Ticker | Sector | Price | Rating | RSI | Rotation Thesis & Quality | Buy below | Drop below | Drop above | Risk |
|---|---|---|---|---|---|---|---|---|---|

Above the table: brief summary of the mathematical/systematic sector rotation observed. Sources as hyperlinks below the table.

## Step 5: Log picks
**CRITICAL**: Always retrieve and log the current RSI (`--rsi`) for every pick.
One CLI call per pick: `python3 scripts/advice_log.py add-pick TICKER --source market-rotation --price X --rating A- --rsi Y --sector "..." --buy-below X --drop-below Y --drop-above Z --name "..." --reason "..." --risk "..."`.
No keep/drop check-in here.

Last step, auto-backup: run `python3 scripts/autosync.py "market-rotation run"`.
