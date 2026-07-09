---
name: diversify
description: Sector-gap diversification advice. Use when the user types /diversify, asks "what sectors am I missing", "diversify my portfolio", or wants picks outside their current holdings. Finds underweighted sectors in the eToro portfolio and recommends quality stocks not currently held.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Diversify

Recommend ~10 quality stocks the user does NOT hold, in sectors where the portfolio is underweight.

This skill is the documented exception to the market-driven-only rule: it deliberately reads the portfolio (sector split + held tickers) as input. That's its whole point. Everything else about the advice discipline stays: min $20, litigation red-flag checks, one-table output.

Diversification is not bounce hunting, but quality standards must be flawless given recent underperformance: candidates must have an A or B+ rating, strong analyst consensus, and no Tech exposure unless pristine.

## Step 0: Fresh portfolio

`python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge` - routine, no confirmation.

## Step 1: Sector gaps

`python3 scripts/advice_log.py sector-gaps` - prints the invested-$ split across eToro's full 10-sector taxonomy plus the underweight list (<5% of invested, computed over the 9 investable sectors; "ETF / Other" is shown but never a diversification target). Pick the 3-4 most underweight sectors as targets. Also note over-concentration (any sector above ~30%) in the output summary.

## Step 2: Candidates

Per target sector, gather 3-4 candidates from quality screens (WebSearch: sector leader lists, dividend aristocrats, analyst top picks for the sector; candidate DISCOVERY stays WebSearch, there's no script for "best healthcare stocks"). 12-14 total so ~10 survive filtering. Hard filters:

- NOT in the portfolio (`data/portfolio.json` holdings) and NOT a `bought` entry in the tracker
- Price >= $20 (verify via the quote pre-fetch in step 3)
- Listed on eToro-likely exchanges (NYSE/Nasdaq large/mid caps; major EU listings are fine, eToro carries them)

## Step 3: Per-ticker research (parallel)

Pre-fetch per-candidate data, one call per command for ALL candidates: `python3 scripts/screen.py quote T1 T2 ...`, `... forecast T1 T2 ...`, `... news T1 T2 ...` and `... news T1 T2 ... --days 14 --red-flags`. Then one `stock-researcher` agent per candidate, in parallel, prompt includes the target sector plus that candidate's quote row, forecast line and headline lists (the agent spends its searches on judgment, not data collection). Litigation/fraud red flags drop the pick or get marked clearly, same as /advice. Mark any candidate with earnings within 2 trading days in the Risk column (gap risk on a fresh buy).

**Final-pick red-flag gate (mandatory, finals only):** for each of the ~10 picks that will appear in the table, run exactly one targeted `WebSearch "TICKER lawsuit OR SEC investigation OR fraud OR class action [month year]"`, unconditional even when the researcher returned `RED FLAG: no` or `unconfirmed` (the keyword screen can miss a real problem phrased outside its terms). A genuine SEC investigation, restatement, or executive departure under a cloud drops the pick or gets marked in Risk; law-firm fishing press releases are noise. One search per final pick, never per candidate.

## Step 4: Output (mandatory format)

ONE markdown table, ~10 picks grouped by sector:

| Ticker | Sector | Price | Rating | RSI | Thesis | Buy below | Drop below | Drop above | Risk |
|---|---|---|---|---|---|---|---|---|---|

Above the table: one line per target sector explaining the gap ("Healthcare is 3.1% of invested, target ~10%"). Sources as hyperlinks below the table. Remind the user of the entry parameters (batch size, trailing stop) defined in `data/private/STRATEGY.md`.

## Step 5: Log picks

**CRITICAL**: Always retrieve and log the current RSI (`--rsi`) for every pick, even when the strategy is not oversold-focused. This data is required for downstream analytics.

One CLI call per pick: `python3 scripts/advice_log.py add-pick TICKER --source diversify --price X --rating B+ --rsi 45 --sector "Healthcare" --buy-below X --drop-below Y --drop-above Z --name "..." --reason "..." --risk "..."`. The CLI upserts, so re-advised tickers are handled automatically (add `--note "re-advised: what changed"` for those). New picks auto-note their reason.

No keep/drop check-in here; that belongs to /advice and /premarket runs.

Last step, auto-backup: run `python3 scripts/autosync.py "diversify run"`. Commits + pushes the data files to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise, so always run it.
