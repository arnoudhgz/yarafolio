Give me a list of 10 assets with good upwards potential. Focus on oversold stocks. But when the market is bearish, advise me on some assets that are more defensive.

Context: I trade on E-Toro with a strategy of buying oversold positions in batches of $600 and starting a trailing stop loss around 5% profit. This keeps my risk low and I don't need to watch the market too closely. Describe clearly per asset why it is currently oversold. Since standard intraday advice historically underperforms premarket and aftermarket runs, require exceptionally strong conviction (stronger catalysts or deeper oversold indicators) before finalizing intraday picks.

Use current market data and trends from the last 24 hours to make your recommendations. If the market opened recently, use today's intraday prices, not yesterday's close. Minimum stock price should be $20.

## Workflow

The advice is market-driven only: candidates come from the oversold screens, researcher prompts get market context only, never portfolio info. My portfolio enters afterwards as a comparison, not as input. (`/diversify` is the one deliberate exception to this rule.)

1. Market sentiment + geopolitical headlines first. Bearish or geopolitical stress means defensive picks (staples, healthcare, utilities, defense).
2. Candidates: `python3 scripts/screen.py oversold` (scrapes the stockanalysis oversold list, $20 floor built in). If the script errors or returns thin results, fall back to WebFetch on the [stockanalysis oversold list](https://stockanalysis.com/list/oversold-stocks/) and the [MarketBeat RSI screen](https://www.marketbeat.com/market-data/oversold-stocks-rsi/) and mention the breakage. Gather 12-14 so 10 survive filtering.
3. Pre-fetch per-candidate data, one call per command for ALL candidates: `python3 scripts/screen.py quote T1 T2 ...`, `... forecast T1 T2 ...`, `... news T1 T2 ...` and `... news T1 T2 ... --days 14 --red-flags`. Then spawn one `stock-researcher` agent per candidate, in parallel (see `.claude/agents/stock-researcher.md`), embedding that candidate's screen RSI, quote row, forecast line and headline lists in its prompt: the agent then spends its searches on judgment (severity, why-it-dropped) instead of data collection. They return sector and buy-below/drop-below/drop-above levels alongside the usual fields.
4. Drop or clearly mark picks with pending litigation/fraud investigations or earnings within 2 trading days.
5. **Final-pick red-flag gate (mandatory, finals only).** For each of the ~10 picks that will appear in the table, run exactly one targeted `WebSearch "TICKER lawsuit OR SEC investigation OR fraud OR class action [month year]"`. This is unconditional, even when the researcher returned `RED FLAG: no` or `unconfirmed`, because researchers only saw pre-fetched headlines and the keyword screen can miss a real problem phrased outside its terms (the ZTS lesson). A genuine SEC investigation, restatement, or executive departure under a cloud drops the pick or gets marked clearly in Risk; law-firm fishing press releases are noise. One search per final pick, never per candidate.

## Output format (mandatory)

ONE markdown table, no prose blocks per stock:

| Ticker | Price | Rating | RSI | Why oversold / thesis | Buy below | Drop below | Drop above | Risk |
|---|---|---|---|---|---|---|---|---|

Rating = bounce quality (A/B/C with +/-), falling knives marked clearly. Buy below = entry trigger, drop below = thesis invalidation, drop above = the oversold bounce already ran so the cheap entry is gone (drop it). All three from the researcher. Sources as hyperlinks below the table.

## After the table

Deterministic data work goes through the CLIs, never hand-edit the JSON.

1. Sync from eToro: `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge` (routine, no confirmation; flag API errors; the merge output lists likely-sold tickers, raise those in the check-in).
2. Portfolio comparison: `python3 scripts/advice_log.py compare` - report its output as a short "vs your portfolio" footnote.
3. Log each pick: `python3 scripts/advice_log.py add-pick TICKER --source advice --price 81.20 --rating B+ --rsi 27 --sector "Services" --buy-below 78.50 --drop-below 72.00 --drop-above 92.00 --name "Starbucks" --reason "..." --risk "..."`. The CLI upserts: re-advised tickers get a price point + refreshed fields automatically, no duplicate handling needed. New picks auto-note their reason; for re-advised tickers add `--note "re-advised: what changed since last time"` so the dated notes history on the dashboard stays meaningful.
4. Keep/drop check-in: `python3 scripts/advice_log.py checkin-candidates`, then ONE AskUserQuestion round, max 4 tickers, most urgent first (bought? holding? drop?). Apply answers via `advice_log.py set-status` / `set-tsl`. Auto-closed picks (gone from eToro, exit estimated) show up here too: confirm or correct the exit with `set-status sold --price <real>`. Skip silently when the CLI says no candidates.
5. Learn nudge: run `python3 scripts/review_stats.py --count-only` and compare against the count in the latest REVIEWS.md entry (0 if none). If 10+ new measurable outcomes, suggest `/review` in one sentence. Never auto-run it.
6. Auto-backup (last step): run `python3 scripts/autosync.py "advice run"`. Commits + pushes the data files to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise, so always run it.
