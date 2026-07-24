---
name: oversold
description: Finds stocks with heavily battered prices (RSI < 30) for mean-reversion bounces.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Oversold Tactic

This is a tactical skill that finds extremely beaten-down stocks (RSI < 30) that are due for a mean-reversion bounce, provided they pass the quality requirements in STRATEGY.md.

## Instructions
1. Run `python3 scripts/screen.py oversold` to fetch candidates.
2. Filter candidates based on the rules in `STRATEGY.md` (e.g. ROE, debt, avoiding falling knives).
3. Provide the curated candidates back to the meta-advisor (e.g. /advice or /premarket).
4. When logging these picks, the meta-advisor must use `--source oversold`.
