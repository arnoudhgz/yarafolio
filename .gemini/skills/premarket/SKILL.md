---
name: premarket
description: Premarket advice run. Use when the user types /premarket or asks for advice before the US market opens (futures, premarket movers, earnings today). Produces the standard max-10-pick advice table built on premarket data, logs picks to the advice tracker, and runs the keep/drop check-in.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Premarket advice

Full `/advice` variant built on premarket data. US premarket runs 04:00-09:30 ET, the open is 09:30 ET. Everything must use TODAY's premarket data, not yesterday's close commentary.

The advice itself is market-driven only: candidates come from the screens, researcher prompts get market context only, never portfolio info. The portfolio enters AFTER the table (step 5), as a comparison. (`/diversify` is the one deliberate exception to the market-only rule.)

## Step 1: Market posture

Run these in parallel (WebSearch):
- "stock market futures today [date] S&P 500 Nasdaq Dow"
- "premarket movers today [date]"
- Geopolitical / macro headlines (war, tariffs, Fed, CPI, jobs report)

Also check today's calendar: earnings before open / after close, economic releases.

Declare a posture at the top of the output: **oversold-bounce day** or **defensive day**, one sentence why (futures direction + macro events).

## Step 2: Candidate gathering

- `python3 scripts/screen.py oversold` (scrapes the stockanalysis oversold list, $20 floor built in). Fallback when it errors: WebFetch the [stockanalysis oversold list](https://stockanalysis.com/list/oversold-stocks/) and the [MarketBeat RSI screen](https://www.marketbeat.com/market-data/oversold-stocks-rsi/), and mention the breakage.
- Premarket losers/gainers pages on stockanalysis.com for gap context (WebFetch). The `quote` pre-fetch in step 3 already returns the premarket price, session-tagged with the regular close, so no separate price lookup is needed.
- IPO check: `python3 scripts/screen.py ipos --json`. Look at upcoming and recent IPOs; ignore any marked avoided / Not listed in the advice log. If a highly anticipated IPO is hitting today/tomorrow, or a recent IPO is showing a great entry point, add up to 2 of them to the candidate list.

Filter: listed on eToro-likely exchanges (NYSE/Nasdaq large/mid caps). On a defensive day, weight staples, healthcare, utilities, defense.

## Step 3: Per-ticker research (parallel)

Pre-fetch per-candidate data, one call per command for ALL candidates: `python3 scripts/screen.py quote T1 T2 ...`, `... forecast T1 T2 ...`, `... news T1 T2 ...` and `... news T1 T2 ... --days 14 --red-flags`. Then spawn one `stock-researcher` agent per candidate (12-14 candidates so 10 survive the red-flag filter), embedding that candidate's screen RSI, quote row, forecast line and headline lists in its prompt: the agent spends its searches on judgment instead of data collection. The `quote` rows are session-tagged and already carry the premarket price (with the regular close); the researcher reports that and only re-confirms by search if a row still shows the regular session. They run in parallel, see `.claude/agents/stock-researcher.md`; they return sector and buy-below/drop-below/drop-above levels alongside the usual fields. Drop or clearly mark any pick with pending litigation/fraud investigations or earnings due today before open (gap risk).

**Final-pick red-flag gate (mandatory, finals only):** for each of the ~10 picks that will appear in the table, run exactly one targeted `WebSearch "TICKER lawsuit OR SEC investigation OR fraud OR class action [month year]"`. Unconditional, even when the researcher returned `RED FLAG: no` or `unconfirmed`: the keyword screen can miss a real problem phrased outside its terms (the ZTS lesson). A genuine SEC investigation, restatement, or executive departure under a cloud drops the pick or gets marked in Risk; law-firm fishing press releases are noise. One search per final pick, never per candidate.

## Step 4: Output

One markdown table, max 10 picks:

| Ticker | Premarket price | Rating | RSI | Why oversold / thesis | Buy below | Drop below | Drop above | Risk | Open note |
|---|---|---|---|---|---|---|---|---|---|

- Rating: my read on bounce quality (A/B/C with +/-), falling knives marked.
- Buy below / Drop below / Drop above: entry trigger, thesis-invalidation floor, and opportunity-gone ceiling (the bounce already ran) from the researcher.
- Open note: "gap may fill, wait for open" where the premarket move could reverse at the 09:30 ET open.
- Sources as hyperlinks below the table.
- Remind: $600 batch, trailing stop from +5%.

## Step 5: Portfolio comparison + tracking update (after the table)

Deterministic data work goes through the CLIs, never hand-edit the JSON.

1. Sync from eToro: `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge` (routine, no confirmation; flag API errors; the merge output lists likely-sold tickers, raise those in the check-in).
2. Portfolio comparison: `python3 scripts/advice_log.py compare` - report its output as a short "vs your portfolio" footnote, a few lines max.
3. Log each pick: `python3 scripts/advice_log.py add-pick TICKER --source premarket --price 81.20 --rating B+ --rsi 27 --sector "Services" --buy-below 78.50 --drop-below 72.00 --drop-above 92.00 --name "..." --reason "..." --risk "..."`. The CLI upserts: re-advised tickers get a price point + refreshed fields automatically. New picks auto-note their reason; for re-advised tickers add `--note "re-advised: what changed since last time"` so the dated notes history on the dashboard stays meaningful.

## Step 6: Keep/drop check-in

Run `python3 scripts/advice_log.py checkin-candidates`. If it prints candidates, ask ONE AskUserQuestion round covering at most 4 tickers (its output is already ordered most urgent first) - bought it? still holding? drop from tracking? Apply answers via `advice_log.py set-status` / `set-tsl`. Auto-closed picks (gone from eToro, exit estimated) also surface here: confirm or correct the exit with `set-status sold --price <real>`. Skip silently when it says no candidates. The user can also handle these via the dashboard buttons (`python3 yarafolio.py`), so don't nag about tickers already updated there.

Then the learn nudge: run `python3 scripts/learn_stats.py --count-only` and compare against the count in the latest data/private/LEARNINGS.md entry (0 if none). If 10+ new measurable outcomes, suggest `/learn` in one sentence. Never auto-run it.

Last step, auto-backup: run `python3 scripts/autosync.py "premarket run"`. Commits + pushes the data files to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise, so always run it.
