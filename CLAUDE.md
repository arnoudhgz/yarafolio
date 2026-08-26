# Purpose

My personal stock portfolio helper for trading on eToro. I buy positions in batches according to my strategy and protect profit with trailing stop losses, so I don't need to watch the market all day.

## Model

Use Opus.

## Strategy parameters

Always read `data/private/STRATEGY.md` for the personal trading parameters (batch size, broker, trailing stop) and the learned output rules (sector biases, rating strictness). If that file doesn't exist, read `data/sample/STRATEGY.md` instead.

## Commands

| Command | Purpose |
|---|---|
| `/advice` | Master orchestrator for up to 10 picks. **Time-Aware:** It automatically adjusts its data sources (futures vs premarket movers vs after-hours drops) and selects the right tactical sub-skills (`oversold`, `momentum`, `earnings`, `insider`, `market-rotation`, `diversify`) based on the current local time relative to US market hours. |
| `/import` | Import my eToro positions (screenshot/paste) into the tracker (skill: `.claude/skills/import`) |
| `/review` | Self-learning pass: outcome stats, proposes skill/CLAUDE.md improvements, approval-gated (skill: `.claude/skills/review`) |
| `/article TICKER` | Max 150-word article for my eToro feed, sources max 1 day old |

## Output rules (learned, non-negotiable)

When executing an `/advice` run, you MUST output a highly structured, rigorous research report designed to be cross-checked by a second model. The report must contain exactly the following 10 sections:

1. **Run conditions**: State local time, market time, session posture (premarket/intraday/after-hours), and prior runs.
2. **Market context established**: Briefly summarize major index moves, key macro/earnings events, and current sector rotation. **CRITICAL RULE: Always prioritize today's actual price action (e.g., indices rallying, oil dropping) over news headlines. If an alarming headline contradicts the current daily price action, trust the price action and assume the headline is fake, stale, or already priced in.**
3. **Strategy constraints applied**: List the hard filters from `STRATEGY.md` and any learned rules from `REVIEWS.md` that influenced your decisions.
4. **Screens run**: A markdown table documenting every tactical screen run (e.g., `oversold`, `momentum`, `ipos`) and the raw count of candidates found before filtering. State if a third-party source was used.
5. **Candidates and verdicts**: A markdown table containing all researched tickers (Columns: Ticker, Price (close), Day, RSI (verified), Rating, Verdict). Below the table, provide a detailed "The pick" section for any A/B rated stocks (with thesis, levels, and entry instructions), followed by "Reject reasoning, one line each" for all C-rated or filtered stocks.
6. **Sector context**: Explain how the candidates interact with the portfolio's current sector gaps.
7. **Tactics used, and not used**: Explicitly list all tactics that were used (e.g., `oversold`, `ipos`) and honestly self-evaluate any that were skipped or mislabeled (e.g., `market-rotation`, `diversify`).
8. **Known data-quality problems**: Note any discrepancies found during research (e.g., false red-flag headlines, incorrect third-party RSI data).
9. **Questions worth putting to a second model**: Propose 3-5 provocative questions challenging your own logic, missed opportunities, or borderline rejections.
10. **Sources read**: A comprehensive list of hyperlinks to every article, screener, and data page used during the run.
- Data must be fresh: last 24 hours max, intraday when the market just opened. When I say the market opened minutes ago, use prices from today's session, not yesterday's close.
- Before listing any pick, run one targeted litigation/fraud search per final pick, unconditional, even when the pre-fetched red-flag headlines looked clean (I once almost bought ZTS during a securities fraud investigation; the keyword screen can miss a problem phrased outside its terms). A red flag means drop the pick or mark it clearly.
- When I mention geopolitical events (war, tariffs, elections), shift the list toward defensive assets.

## Research workflow

| Step | What | Source |
|---|---|---|
| 1 | Market sentiment + futures | WebSearch "stock market today ..." |
| 2 | Strategy screen | Execute one or more tactical skills based on market posture. Pick the tactics that fit the posture, not just the default one, and label each candidate with the tactic that actually found it *(e.g., if there is a major macro or geopolitical shift, you MUST explicitly trigger the market-rotation skill to capture capital flow)*. **Two are screen.py screens:** `python3 scripts/screen.py oversold\|momentum --exclude-held --exclude-advised [--full]`. **Four are WebSearch-driven skills with no screen.py subcommand** (`.claude/skills/<tactic>/SKILL.md`): `earnings`, `insider`, `market-rotation`, `diversify` - run the skill, don't look for a screen.py flag. Fallback: web screener. |
| 2b | IPO check | Skipped. The user considers IPOs too volatile. Do not actively hunt for IPOs or add them to the candidate list unless the user explicitly requests them. |
| 2c | Candidate data pre-fetch | `python3 scripts/screen.py quote / forecast / news / news --red-flags` (one call per command for all candidates, rows embedded in researcher prompts). `forecast` carries the SB/B/H/S/SS analyst distribution + as-of date; `news` carries each headline's article URL; `quote --json` feeds the dashboard refresh |
| 3 | Premarket movers (premarket only) | stockanalysis.com premarket pages |
| 4 | Per-ticker deep dive | Parallel `stock-researcher` agents (`.claude/agents/stock-researcher.md`), one per candidate |
| 5 | Red-flag check | Discovery via `screen.py news --red-flags`; researcher judges severity, then ONE unconditional confirming search per final pick (even when the screen looked clean) |

WebSearch and the WebFetch domains above are pre-allowed in `.claude/settings.local.json`.

## Advice tracking

Advice generation is market-driven only: never use my portfolio as input for picks or researcher prompts. The portfolio enters AFTER the advice table, as a comparison. Exception: the `diversify` tactic deliberately uses the portfolio sector split and held tickers as input; that's its whole point and the only allowed portfolio-as-input path.

**Deterministic data work goes through the `scripts/` CLIs, skills never hand-edit `data/*.json`.** Log mutations: `scripts/advice_log.py` (add-pick, add-note, touch, set-status, set-tsl, checkin-candidates, compare, sector-gaps). Outcome stats: `scripts/review_stats.py`. Sync: `scripts/etoro_import.py`. Mechanical market data (strategy screens, quote stats, analyst forecast, headlines, red-flag discovery): `scripts/screen.py`, with WebFetch/WebSearch as fallback when its scraping breaks. WebSearch stays for the judgment work: reading the articles that matter, weighing litigation severity, fresh analyst moves, market posture, and candidate discovery for the diversify tactic. This also keeps token usage down.

Every `/advice` run, after the table:

1. Sync from eToro: `python3 scripts/etoro_import.py preview && python3 scripts/etoro_import.py merge`. Read-only API, credentials in `.env`. Routine, no confirmation. The merge tracks advice **positions per lot**: it attributes to each pick only the eToro lots opened on/after its `firstAdvised` (and before `droppedDate`), keeps them in the entry's `lots` array by `positionID`, auto-closes a lot at its last-seen price (flagged `exitEstimated`) when its id disappears, and sets `tslSet` from the lot's eToro trailing-stop flag. Pre-advice / post-drop lots are NOT attributed. It also writes `data/portfolio.json` (full holdings snapshot with sectors). (eToro's API has no closed-position/exit-price or dividend endpoint, so exits are estimated and dividends aren't tracked.)
2. `python3 scripts/advice_log.py compare` for the short "vs your portfolio" footnote.
3. Log each pick via `python3 scripts/advice_log.py add-pick ...` (upserts: re-advised watching tickers get a priceHistory point, not a duplicate; if the ticker is already bought, it creates a new advice entry, never hand-edit it). Picks carry sector and buyBelow/dropBelow/dropAbove tipping points from the researcher.
4. Keep/drop check-in: Run `python3 scripts/advice_log.py checkin-candidates` and append the output to the end of your report for the user to review later. NEVER automatically run `advice_log.py set-status ... dropped` on watching tickers. You must ONLY list them in the report so the user can review and manually drop them. NEVER use an interactive question tool or pause execution to ask the user, as the `/advice` workflow must be 100% fire-and-forget.
5. Learn nudge: if `python3 scripts/review_stats.py --count-only` is 10+ above the latest data/private/REVIEWS.md baseline, suggest `/review` in one sentence (never auto-run).

`dashboard.html` is my visual view (start with `python3 yarafolio.py`), a global search bar (ticker/name/reason/sector, filters whichever table tab is active) plus four tabs:
- **Advice** (default): my live watchlist (watching, with a Dropped filter; anything with eToro lots moves to Positions). Sortable table with buyBelow/dropBelow/dropAbove markers (green buy zone / red drop-below / grey "missed") + Buy zone / Drop alert / Missed filters, sector cell colored vs my portfolio (red gap / orange underweight) + Sector gap / Underweight filters, rating info box. Only a Drop button (buying happens in eToro and arrives via the import). Row click opens a drill-down modal: full thesis + risk + dated notes + per-lot breakdown + a price chart with buy/drop reference lines.
- **Positions**: **one row per eToro lot** attributed to advice (opened on/after the advice date), kept forever. Per-lot P/L $ (realized = (sold-bought) x units, open = (now-bought) x units), Win rate / Realized P/L / Open P/L cards over the lots, filters All / Open / Closed / Needs confirm. Auto-closed lots (vanished from eToro) carry an "est" badge and a Confirm button to set the real exit. Row click opens the pick's drill-down.
- **Portfolio**: a sector-coverage chart over the full eToro taxonomy (all 10 sectors, so a 0%-held sector shows as a GAP, underweight <5% as UNDER, with the advice-pick count overlaid), plus the holdings grid and the invested-$ sector donut from `data/portfolio.json`.
- **Analytics**: win rate + avg/median move bucketed by rating, RSI band, sector and source, plus the 7-day-after-advice trajectory. Reads `/api/stats` (a `review_stats.py --json` passthrough); degrades to a clean empty state when there aren't enough outcomes yet.

The Advice tab shows advised picks only; imported-only holdings live on Portfolio. yarafolio.py endpoints: "Update from eToro" -> `/api/import`, "Refresh quotes" -> `/api/refresh` (scrapes `screen.py quote --json` for watching/bought advised tickers and writes them via `advice_log.py touch-many`, never touching the JSON directly), Bought/Drop/Confirm buttons -> `/api/save`. Stdlib only, no dependencies, keep it that way.

**Dashboard Sync Timing:** Top cards (Win Rate, Realized P/L, Open P/L) are computed instantly in the browser from `advice-log.json` and `portfolio.json`. However, the Equity Curve graph reads from `equity-history.json`, which is appended by `record_equity.py` running asynchronously in the background via `autosync.py`. Immediately after a UI sync, the graph may temporarily trail the top cards by one data point until the page is refreshed.

## Auto-backup to the private repo

The data lives in a private GitHub repo (`assisted-stock-advice`); `scripts/autosync.py` commits + pushes the data + generated files (`data/private/*.json`, `data/private/REVIEWS.md`, never code) on every change. It runs from yarafolio.py after each dashboard save/import/refresh (background, best-effort) and as the last step of `/advice`, `/diversify`, `/import`, `/review`.

**On by default**, via the project-local `.env` file (`STOCKS_AUTOSYNC=1`), which is gitignored so it stays out of the repo and a fresh clone is off. The `STOCKS_AUTOSYNC` env var **overrides** the file: set `STOCKS_AUTOSYNC=0` to force it off, which is exactly what dev/testing must do before running yarafolio.py or the scripts so test data never gets pushed. Best-effort: if the push fails (offline), the data is still committed locally and the next sync catches up. Code/skill changes are committed by hand, not by autosync.

## Development

- **Testing:** Always run `python3 -m unittest discover tests` before making any code commits to ensure existing functionality is not broken.

## Changelog Rule
Always update the `CHANGELOG.md` file when making code changes and before making git commits.

## Sync Rule
If you ever make changes to this file, you MUST immediately mirror those exact changes into `GEMINI.md` to keep the AI contexts perfectly in sync.


## Atomic Commits & Versioning Rule
Never bundle multiple unrelated features or fixes into a single massive git commit. Commits must be small and atomic. Furthermore, never proactively bump software versions (e.g., to 1.0.0) or assume it's time for a release unless explicitly commanded by the user. The user always controls the timeline.

## UI Modal Fidelity Rule
Whenever modifying the underlying logic of a chart (such as swapping between % and $ calculations), immediately verify and update the corresponding informational modals in the HTML so the descriptive UI text perfectly matches the new data behavior. Never leave the UI text out of sync with the data.

## Strict DOM Type-Checking Rule
When writing or refactoring JavaScript in this project, always use strict JSDoc type casting (e.g., `/** @type {HTMLElement} */`) and explicit runtime checks (`instanceof HTMLElement`) when interacting with DOM elements, otherwise the strict type-checker will throw implicit `any` errors.

## Data Integrity & eToro Import Precedence Rule
The `advice-log.json` and its custom GICS sector categorizations (e.g., "Technology", "Healthcare", "Materials") are the ultimate source of truth for instrument metadata. When running eToro import scripts or merging data, raw eToro industry labels (like "Consumer Goods", "Services", or "Basic Materials") must NEVER overwrite existing custom sectors in the tracker. If new instruments are imported, their eToro sectors should be mapped to standard GICS sectors whenever possible.

## Portfolio Analysis Context Rule (The "Ghost of 2022")
When analyzing the user's overall portfolio performance or open P/L, be aware of the "Ghost of 2022." The user is carrying significant unrealized losses in open positions due to early mistakes with leverage during the 2022 market crash. Do not interpret these long-term underwater bags as a failure of the current mechanical strategy (which is highly profitable and focuses on cutting winners and managing risk).

## Advice Tracking Multi-Entry Rule
When checking a stock's status or reading its data from the log, you MUST filter for active states (`watching` or `bought`) rather than pulling the first historical entry. A single ticker can have multiple entries in the log (e.g., previously `sold`, now `watching` again).

## Plan Artifacts Rule
When using the /plan command to generate an Implementation Plan artifact, ALWAYS save a copy of the plan markdown file directly to the project's 	mp/ directory (e.g., 	mp/plan_name.md) so the user can easily read it in their IDE without it being committed.
