# Purpose

My personal stock portfolio helper for trading on eToro. I buy oversold positions in batches and protect profit with trailing stop losses, so I don't need to watch the market all day.

## Model

Use Opus.

## Strategy parameters

| Parameter | Value |
|---|---|
| Broker | eToro |
| Batch size | $600 per position |
| Trailing stop loss | Start around +5% profit |
| Minimum stock price | $20 |
| Focus | Oversold stocks with bounce potential |
| Bearish / geopolitical stress | Switch to defensive picks (staples, healthcare, utilities, defense) |

## Commands

| Command | Purpose |
|---|---|
| `/advice` | Up to 10 picks with upward potential, oversold focus (defensive when bearish). Less than 10 is fine if the best ones are already listed. |
| `/premarket` | Same max-10-pick advice, but built on premarket data before US open (skill: `.claude/skills/premarket`) |
| `/aftermarket` | Same max-10-pick advice, but built on after-hours data and earnings drops after US close (skill: `.claude/skills/aftermarket`) |
| `/check TICKER [url]` | Re-check a single pick: news, lawsuits, analyst moves, verdict (skill: `.claude/skills/check`) |
| `/import` | Import my eToro positions (screenshot/paste) into the tracker (skill: `.claude/skills/import`) |
| `/diversify` | Sector-gap picks: quality stocks I don't hold, in underweighted sectors (skill: `.claude/skills/diversify`) |
| `/learn` | Self-learning pass: outcome stats, proposes skill/CLAUDE.md improvements, approval-gated (skill: `.claude/skills/learn`) |
| `/article TICKER` | Max 150-word article for my eToro feed, sources max 1 day old |

## Output rules (learned, non-negotiable)

- Every recommendation list goes in ONE markdown table. Columns: Ticker, Price, Rating, RSI, Why oversold / thesis, Risk. No prose blocks per stock.
- Sources as hyperlinks below the table.
- Data must be fresh: last 24 hours max, intraday when the market just opened. When I say the market opened minutes ago, use prices from today's session, not yesterday's close.
- Flag falling-knife and value-trap risks explicitly in the Rating or Risk column.
- Before listing any pick, run one targeted litigation/fraud search per final pick, unconditional, even when the pre-fetched red-flag headlines looked clean (I once almost bought ZTS during a securities fraud investigation; the keyword screen can miss a problem phrased outside its terms). A red flag means drop the pick or mark it clearly.
- When I mention geopolitical events (war, tariffs, elections), shift the list toward defensive assets.

## Research workflow

| Step | What | Source |
|---|---|---|
| 1 | Market sentiment + futures | WebSearch "stock market today ..." |
| 2 | Oversold screen | `python3 scripts/screen.py oversold` (add `--full` for PE/VOL/MKTCAP/SECTOR columns when the page has them); fallback on script breakage: [stockanalysis.com oversold list](https://stockanalysis.com/list/oversold-stocks/), [MarketBeat RSI screen](https://www.marketbeat.com/market-data/oversold-stocks-rsi/) |
| 2b | IPO check | `python3 scripts/screen.py ipos --json`. Look at "upcoming" and "recent" IPOs. Ignore any that are marked as avoided/Not listed in your advice log. If there is a highly anticipated IPO hitting the market today/tomorrow or a recent IPO showing a great entry point, add up to 2 of them to your candidate list. |
| 2c | Candidate data pre-fetch | `python3 scripts/screen.py quote / forecast / news / news --red-flags` (one call per command for all candidates, rows embedded in researcher prompts). `forecast` carries the SB/B/H/S/SS analyst distribution + as-of date; `news` carries each headline's article URL; `quote --json` feeds the dashboard refresh |
| 3 | Premarket movers (premarket only) | stockanalysis.com premarket pages |
| 4 | Per-ticker deep dive | Parallel `stock-researcher` agents (`.claude/agents/stock-researcher.md`), one per candidate |
| 5 | Red-flag check | Discovery via `screen.py news --red-flags`; researcher judges severity, then ONE unconditional confirming search per final pick (even when the screen looked clean) |

WebSearch and the WebFetch domains above are pre-allowed in `.claude/settings.local.json`.

## Advice tracking

Advice generation is market-driven only: never use my portfolio as input for picks or researcher prompts. The portfolio enters AFTER the advice table, as a comparison. Exception: `/diversify` deliberately uses the portfolio sector split and held tickers as input; that's its whole point and the only allowed portfolio-as-input path.

**Deterministic data work goes through the `scripts/` CLIs, skills never hand-edit `data/*.json`.** Log mutations: `scripts/advice_log.py` (add-pick, add-note, touch, set-status, set-tsl, checkin-candidates, compare, sector-gaps). Outcome stats: `scripts/learn_stats.py`. Sync: `scripts/etoro_import.py`. Mechanical market data (oversold screen, quote stats, analyst forecast, headlines, red-flag discovery): `scripts/screen.py`, with WebFetch/WebSearch as fallback when its scraping breaks. WebSearch stays for the judgment work: reading the articles that matter, weighing litigation severity, fresh analyst moves, market posture, and candidate discovery for /diversify. This also keeps token usage down.

Every `/advice`, `/premarket`, and `/aftermarket` run, after the table:

1. Sync from eToro: `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge`. Read-only API, credentials in `.env`. Routine, no confirmation. The merge tracks advice **positions per lot**: it attributes to each pick only the eToro lots opened on/after its `firstAdvised` (and before `droppedDate`), keeps them in the entry's `lots` array by `positionID`, auto-closes a lot at its last-seen price (flagged `exitEstimated`) when its id disappears, and sets `tslSet` from the lot's eToro trailing-stop flag. Pre-advice / post-drop lots are NOT attributed. It also writes `data/portfolio.json` (full holdings snapshot with sectors). `/check` runs the same sync at its start instead. (eToro's API has no closed-position/exit-price or dividend endpoint, so exits are estimated and dividends aren't tracked.)
2. `python3 scripts/advice_log.py compare` for the short "vs your portfolio" footnote.
3. Log each pick via `python3 scripts/advice_log.py add-pick ...` (upserts: re-advised tickers get a priceHistory point, not a duplicate, never hand-edit it). Picks carry sector and buyBelow/dropBelow/dropAbove tipping points from the researcher.
4. Keep/drop check-in: `python3 scripts/advice_log.py checkin-candidates`, then one AskUserQuestion round (max 4 tickers, most urgent first): bought? still holding? drop it? Apply via `set-status` / `set-tsl`. Skip when the CLI prints no candidates.
5. Learn nudge: if `python3 scripts/learn_stats.py --count-only` is 10+ above the latest LEARNINGS.md baseline, suggest `/learn` in one sentence (never auto-run).

`dashboard.html` is my visual view (start with `python3 yarafolio.py`), a global search bar (ticker/name/reason/sector, filters whichever table tab is active) plus four tabs:
- **Advice** (default): my live watchlist (watching, with a Dropped filter; anything with eToro lots moves to Positions). Sortable table with buyBelow/dropBelow/dropAbove markers (green buy zone / red drop-below / grey "missed") + Buy zone / Drop alert / Missed filters, sector cell colored vs my portfolio (red gap / orange underweight) + Sector gap / Underweight filters, rating info box. Only a Drop button (buying happens in eToro and arrives via the import). Row click opens a drill-down modal: full thesis + risk + dated notes + per-lot breakdown + a price chart with buy/drop reference lines.
- **Positions**: **one row per eToro lot** attributed to advice (opened on/after the advice date), kept forever. Per-lot P/L $ (realized = (sold-bought) x units, open = (now-bought) x units), Win rate / Realized P/L / Open P/L cards over the lots, filters All / Open / Closed / Needs confirm. Auto-closed lots (vanished from eToro) carry an "est" badge and a Confirm button to set the real exit. Row click opens the pick's drill-down.
- **Portfolio**: a sector-coverage chart over the full eToro taxonomy (all 10 sectors, so a 0%-held sector shows as a GAP, underweight <5% as UNDER, with the advice-pick count overlaid), plus the holdings grid and the invested-$ sector donut from `data/portfolio.json`.
- **Analytics**: win rate + avg/median move bucketed by rating, RSI band, sector and source, plus the 7-day-after-advice trajectory. Reads `/api/stats` (a `learn_stats.py --json` passthrough); degrades to a clean empty state when there aren't enough outcomes yet.

The Advice tab shows advised picks only; imported-only holdings live on Portfolio. yarafolio.py endpoints: "Update from eToro" -> `/api/import`, "Refresh quotes" -> `/api/refresh` (scrapes `screen.py quote --json` for watching/bought advised tickers and writes them via `advice_log.py touch-many`, never touching the JSON directly), Bought/Drop/Confirm buttons -> `/api/save`. Stdlib only, no dependencies, keep it that way.

## Auto-backup to the private repo

The data lives in a private GitHub repo (`assisted-stock-advice`); `scripts/autosync.py` commits + pushes the data + generated files (`data/*.json`, `LEARNINGS.md`, never code) on every change. It runs from yarafolio.py after each dashboard save/import/refresh (background, best-effort) and as the last step of `/advice`, `/premarket`, `/aftermarket`, `/check`, `/diversify`, `/import`, `/learn`.

**On by default**, via the project-local `.env` file (`STOCKS_AUTOSYNC=1`), which is gitignored so it stays out of the repo and a fresh clone is off. The `STOCKS_AUTOSYNC` env var **overrides** the file: set `STOCKS_AUTOSYNC=0` to force it off, which is exactly what dev/testing must do before running yarafolio.py or the scripts so test data never gets pushed. Best-effort: if the push fails (offline), the data is still committed locally and the next sync catches up. Code/skill changes are committed by hand, not by autosync.

## Development

- **Testing:** Always run `python3 -m unittest discover tests` before making any code commits to ensure existing functionality is not broken.

## Changelog Rule
Always update the `CHANGELOG.md` file when making code changes and before making git commits.

## Sync Rule
If you ever make changes to this file, you MUST immediately mirror those exact changes into `GEMINI.md` to keep the AI contexts perfectly in sync.
