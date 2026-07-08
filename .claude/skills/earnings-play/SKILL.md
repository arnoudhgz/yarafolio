---
name: earnings-play
description: Scans for companies reporting earnings this week to play volatility.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Earnings-Play advice

This workflow finds stocks reporting earnings soon to evaluate them for pre-earnings run-ups or post-earnings plays.

## Step 1: Screen candidates
Use WebSearch: `stocks reporting earnings this week`. Find 5-10 high-interest tickers.

## Step 2: Candidate pre-fetch
For the candidates, run:
- `python3 scripts/screen.py quote TICKER [TICKER...]`
- `python3 scripts/screen.py forecast TICKER [TICKER...]`
- `python3 scripts/screen.py news TICKER [TICKER...] --red-flags`

## Step 3: Research
Use parallel `stock-researcher` agents. Have them evaluate implied volatility, historical post-earnings drift, and whether to hold through the event.

## Step 4: Table and Logging
**CRITICAL**: Always retrieve and log the current RSI (`--rsi`) for every pick, even when the strategy is not oversold-focused. This data is required for downstream analytics.

Format exactly like the standard advice table.
Log the picks with `python3 scripts/advice_log.py add-pick TICKER --source earnings ...`
Run the auto-backup: `python3 scripts/autosync.py "earnings run"`
