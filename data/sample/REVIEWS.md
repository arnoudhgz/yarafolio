# Strategy Reviews

This file tracks self-learning reviews and outcome stats.

## [2026-07-31T16:00-04:00]

### Strategy Review

- Measurable outcomes: 51 (was 42 last run)
- Key stats:
  - The `insider` tactic is yielding a 0% win rate (0 for 3) when insider buying occurs at 52-week highs, showing conviction does not overcome poor entry timing.
  - Overall win rate climbed to 82.3% for A/B rated setups (n=45), proving the strict volume confirmation filter is working.
  - The `ipos` tactic generated a massive -18.4% loss on a single trade, confirming that newly public companies lack the technical history needed for mean-reversion analysis.
- Proposed:
  - Applied: Add 'IPO Risk' rule to `STRATEGY.md` to outright ban companies public for less than a year.
  - Applied: Update the `insider` tactic to require the stock be trading below its 50-day moving average, avoiding top-ticking.

## [2026-07-24T16:00-04:00]

### Strategy Review

- Measurable outcomes: 42 (was 35 last run)
- Key stats:
  - Deep oversold picks (RSI < 20) hold a perfect win rate (100.0%, avg +1.85%, n=5), confirming the MACD confirmation rule successfully filters out falling knives.
  - The 30-day correlation matrix reveals a new tight systemic risk cluster (>0.91 correlation) forming in the semiconductor sector.
  - The Utilities sector is underperforming (win 57.1%, avg -0.08%, n=7), failing to provide reliable defensive cover compared to Staples (100% win).
- Proposed:
  - Applied: Expand RSI floor to 15 (deep oversold) in STRATEGY.md.
  - Applied: Add Semiconductor systemic risk cluster to STRATEGY.md to manage cluster risk.
  - Rejected: Remove Utilities from defensive rotation.

## [2026-07-17T17:30-04:00]

### Strategy Review

- Measurable outcomes: 35 (was 28 last run)
- Key stats:
  - A-rated picks (+1.63% avg, n=12) are now officially outperforming B-rated picks (+0.78% avg, n=23) in absolute returns.
  - Open `bought` positions are averaging a severe -10.87% return (n=11), indicating early entries into falling knives before they stabilize.
- Proposed:
  - Applied: Require positive MACD histogram reversal to confirm RSI oversold entries in STRATEGY.md to prevent catching falling knives.
  - Applied: Update rating guidance to prioritize A-rated over B-rated stocks in STRATEGY.md.
