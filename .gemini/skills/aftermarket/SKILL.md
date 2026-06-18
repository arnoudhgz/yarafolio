---
name: aftermarket
description: After-market advice run. Use when the user types /aftermarket or asks for advice after the US market closes. Focuses on today's macro data and earnings overreactions, identifying stocks that dropped heavily in the after-market but are likely to bounce back in the next premarket/market open. Produces the standard max-10-pick advice table, logs picks to the advice tracker, and runs the keep/drop check-in.
license: Apache-2.0
metadata:
  version: v1
  publisher: user
---

# After-market advice

Full `/advice` variant built on after-market and earnings data. The user is in the Netherlands; US market closes at 22:00 CEST, and after-hours runs until 02:00 CEST. Everything must use TODAY's after-market data and focus on stocks that overreacted to news or earnings.

The advice itself is market-driven only: candidates come from the screens, researcher prompts get market context only, never portfolio info. The portfolio enters AFTER the table (step 5), as a comparison.

## Step 1: Market posture

Run these in parallel (WebSearch):
- "after-hours stock market movers today [date]"
- "earnings reports misses and drops today [date]"
- Geopolitical / macro headlines (war, tariffs, Fed, CPI, jobs report) reactions today

Declare a posture at the top of the output: **earnings-reaction day** or **macro-selloff day**, one sentence why.

## Step 2: Candidate gathering

- Use WebSearch to find stocks that plunged, tumbled, or dropped significantly in the after-market today due to earnings misses, guidance cuts, or macro data overreactions.
- Use `python3 scripts/screen.py oversold` to grab additional heavily battered stocks as a baseline.
- Filter: listed on eToro-likely exchanges (NYSE/Nasdaq large/mid caps). Focus strictly on stocks that have a high probability of a relief bounce at the next day's open.

## Step 3: Per-ticker research (parallel)

Pre-fetch per-candidate data, one call per command for ALL candidates: `python3 scripts/screen.py quote T1 T2 ...`, `... forecast T1 T2 ...`, `... news T1 T2 ...` and `... news T1 T2 ... --days 14 --red-flags`. Then spawn one `stock-researcher` agent per candidate. The quote price must reflect the `after-hours` session! The researchers must determine if the after-hours drop is an overreaction or a structural breakdown. Drop any pick with genuine fraud/litigation that invalidates the bounce thesis.

## Step 4: Output

One markdown table, max 10 picks:

| Ticker | After-hours price | Rating | RSI | Why oversold / thesis | Buy below | Drop below | Drop above | Risk | Open note |
|---|---|---|---|---|---|---|---|---|---|

- Rating: my read on bounce quality (A/B/C with +/-), falling knives marked.
- Open note: "buy in premarket" or "wait for market open to see if selloff continues".
- Sources as hyperlinks below the table.
- Remind: $600 batch, trailing stop from +5%.

## Step 5: Portfolio comparison + tracking update (after the table)

Deterministic data work goes through the CLIs, never hand-edit the JSON.

1. Sync from eToro: `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge`
2. Portfolio comparison: `python3 scripts/advice_log.py compare` - report its output as a short "vs your portfolio" footnote.
3. Log each pick: `python3 scripts/advice_log.py add-pick TICKER --source aftermarket --price X.XX --rating B+ --rsi 27 --sector "Services" --buy-below X --drop-below X --drop-above X --name "..." --reason "..." --risk "..."`.

## Step 6: Keep/drop check-in

Run `python3 scripts/advice_log.py checkin-candidates`. If it prints candidates, ask ONE AskUserQuestion round covering at most 4 tickers. Apply answers via `advice_log.py set-status` / `set-tsl`. Skip silently when it says no candidates.

Then the learn nudge: run `python3 scripts/learn_stats.py --count-only`.

Last step, auto-backup: run `python3 scripts/autosync.py "aftermarket run"`.
