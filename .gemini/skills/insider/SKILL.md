---
name: insider
description: Scans for open-market insider buying as a smart money conviction signal.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Insider Buying advice

This workflow finds stocks where executives/directors are heavily buying their own stock on the open market, indicating internal confidence.

## Step 1: Screen candidates
Use WebSearch: `recent insider buying open market stock this week`. Find 5-10 tickers with massive CEO/Director buys (ignore 10b5-1 automated sales or option grants). Ensure all candidates adhere to STRATEGY.md.

## Step 2: Candidate pre-fetch
For the candidates, run:
- `python3 scripts/screen.py quote TICKER [TICKER...]`
- `python3 scripts/screen.py forecast TICKER [TICKER...]`
- `python3 scripts/screen.py news TICKER [TICKER...] --red-flags`

## Step 3: Research
Use parallel `stock-researcher` agents. Have them explicitly evaluate the fundamentals to ensure the insider buy aligns with a solid technical entry point.

## Step 4: Table and Logging
Format exactly like the standard advice table.
Log the picks with `python3 scripts/advice_log.py add-pick TICKER --source insider ...`
Run the auto-backup: `python3 scripts/autosync.py "insider run"`
