# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.1] - 2026-08-24
- Sorted the SECTORS list alphabetically (with ETF / Other at the end) so it renders logically on the Portfolio tabs.
- Fixed auto-skipping of Y-axis labels in the Sector Analysis coverage chart so all 13 sectors are always visible.
- Updated Portfolio sector colors to provide better visual distinction between Energy (Orange), Financials (Dark Yellow), Utilities (Teal), and Commodities (Bright Gold).
- Elevated Commodities to a first-class sector in the dashboard state.js and dvice_log.py so it receives its own distinct slice/color in the Portfolio pie chart and properly filters into the Commodities tab.
- Fixed Coffee.FUT and other commodities incorrectly being assigned to ETF / Other in toro_import.py.
- Updated toro-mcp/mcp_config.json to securely map .env credentials (ETORO_API_KEY, ETORO_USER_KEY) via header expansion for the remote SSE endpoint.

### Added
- Added Settings gear in the top right of the dashboard to configure visible tabs, with `localStorage` persistence.
- Mapped 8 missing specific instrument IDs (including LLY, ETOR, AEP, WTW, BTC) to their proper tickers in `custom_instruments.json`.
- Added Commodities Totals table to aggregate day trading metrics (max profit/loss, win rate, total fees).
- Added `getTickerName` fallback logic in `renderers.js` to gracefully resolve names when instruments aren't in the eToro cache.
- Added a dynamic start date indicator to the Trading History info modal, derived from the earliest imported ledger entry.
- Added Antigravity plugin for eToro Public API MCP server in `.agents/plugins/etoro-mcp/`.
- `etoro_import.py` now fetches closed trade history from `GET /trading/info/trade/history` to record exact exit rates (`soldAt`) instead of estimating them using the last seen price.
- Added a new project rule explicitly instructing agents to output `/plan` artifacts directly to the `tmp/` folder for immediate user review without cluttering the repository.
- Added "Ban Re-evaluation" rule to the review skill to automatically propose lifting stale tactics/sector bans older than 3-4 weeks for test batches.
- Added `scripts/advice_log.py prune-text` command to strip heavy text fields (`reason`, `risk`, `notes`) from inactive positions (sold or blacklisted) to reduce JSON log bloat, while keeping notes intact for dropped positions that might be re-advised.

### Fixed
- Fixed the EOD skill (`/eod`) instructions to strictly enforce markdown formatting (using `###` headings and bulleted lists) so the dashboard properly parses report titles and action items instead of rendering them as a raw text block.
- Fixed a bug where Windows line endings (`\r\n`) in `news.md` and `eod.md` prevented markdown block splitting, causing the EOD Reports and AI News tabs to render as a single large column instead of the intended 2-column masonry grid.
- Fixed an issue where hidden tabs in the settings modal would automatically reappear after a page refresh due to aggressive auto-enable logic.

### Changed
- Removed interactive sk_question requirement from /advice workflow in GEMINI.md and CLAUDE.md to ensure a 100% fire-and-forget experience.

- Active Commodities tab now unrolls grouped holdings to display individual lots separately (e.g. multiple open OIL trades are shown individually).- Refactored `renderHistoryTab` and `renderCommoditiesTab` styling: negative fees (CFD rebates) now explicitly render in green, and total fees are aggregated.
- Reordered the Commodities tab layout to prioritize "Active Commodity Positions" at the top.
- Standardized `dashboard.html` info modals to use the native `<dialog class="modal-card">` layout with a proper close button.
- Migrated real-time quotes in `screen.py quote` away from fragile HTML scraping of `stockanalysis.com` to native bulk queries against the eToro Public API (`/market-data/instruments/rates`), resulting in significantly faster and more reliable dashboard updates.
- Strategy Update: De-prioritized and skipped the `ipos` tactic across all workflows (GEMINI.md, CLAUDE.md, STRATEGY.md) due to extreme volatility and lack of clear trading ranges.
- Strategy Update: The `/momentum` skill now strictly requires A-tier ratings (A-, A, A+) to combat historical underperformance of momentum trades.
- Strategy Update: Enforced a strict rule across `GEMINI.md`, `CLAUDE.md`, and `STRATEGY.md` that real-time price action and index momentum strictly override news headlines to prevent hallucinating market panic from stale or fake RSS feeds.
- Strategy Update: The `/advice` orchestrator is now strictly required to run the `market-rotation` sub-skill whenever there is a major macro or geopolitical shift, ensuring capital flow shifts are automatically captured.
- Updated instrument metadata for Gold (Materials) and Oil (Energy) to map correctly to standard GICS sectors.

### Fixed
- Fixed an issue where hidden tabs in the settings modal would automatically reappear after a page refresh due to aggressive auto-enable logic.

- Fixed dashboard UI to completely hide `bought` positions from the Watchlist/Advice tab, even when 'Buy zone' or 'Drop alert' filters are active, enforcing a strict separation between live advice and active positions.
- Modified `advice_log.py add-pick` logic so that new advice for an already `bought` ticker creates a new, independent advice record (e.g. TICKER-0002) instead of upserting into the active position.
- Fixed an issue in the dashboard UI where `bought` stocks would not appear on the Advice tab even when the 'Buy zone' or 'Drop alert' filters were selected. They will now appear on the Advice tab, but *only* if they have a pending average-down advice (meaning the latest advice date is newer than the open date of their most recent eToro lot). Once the new lot is bought and imported, the ticker will correctly disappear from the Advice tab again to avoid cluttering the view with old fulfilled advice.
- Upgraded `autosync.py` to automatically resolve JSON merge conflicts without manual intervention. If both the desktop and Mobile Companion make offline changes, the sync process will now intelligently merge `advice-log.json`, `portfolio.json`, and `equity-history.json` by combining new entries and favoring the most recent timestamp, completely preventing dashboard crashes from Git conflict markers. Fixed an issue where the JSON merge logic could inadvertently drop additional keys in `advice-log.json`. Also added `--no-edit` to the background git pull command to prevent silent hangs that could leave orphaned `.git/index.lock` files behind.

## [0.10.0] - 2026-08-01

### Added
- Advanced Analytics: Added a new "Equity Curve" chart to track total portfolio Maximum Drawdown (MDD), compounding returns, Sharpe Ratio, and benchmarks (S&P 500, Dow Jones).
- Strategy Analytics: Added "Trade Efficiency" scatter plot (Hold Times vs Realized Gains), "Performance by Day of the Week", "Win Rate Over Time", and "Entry Discipline" charts.
- Deep Market Tactics: Introduced 5 specialized AI sub-skills (`oversold`, `momentum`, `earnings`, `insider`, `market-rotation`) to dynamically adapt to market posture.
- Dashboard Features: Introduced a new "Learnings" tab, a Portfolio Treemap/Heatmap visualizer, and a `%` vs `$` toggle on all performance charts for instant realized dollar conversions.
- Blacklisting: Added support for manually flagging and blacklisting stocks so they are permanently ignored by the advice workflow.
- Open-Source Privacy: Added `STRATEGY.md` file separation to safely isolate personal quantitative thresholds from public repositories.

### Changed
- Strategy Architecture: Refactored the core AI strategy into a Meta-Advisor pattern, where a master `/advice` skill orchestrates the tactical sub-skills.
- GICS Sector Standardization: Fully replaced legacy eToro industry labels with the standard 11 GICS sectors for strict consistency across all portfolio analytics and gap analyses.
- Dashboard: Upgraded all modal overlays to native HTML `<dialog>` elements for better structural semantics and simplified CSS.
- Timezone Handling: Standardized all logged timestamps to strictly use the `America/New_York` timezone formatted as ISO 8601 strings, parsed locally by the frontend.

### Fixed
- Fixed an edge case where aftermarket advice logs generated past midnight local time wouldn't match with eToro trades opened during the previous day's US market session.
- Fixed the dashboard Equity Curve chart to accurately update during premarket and after-hours by switching the Nasdaq reference to Nasdaq 100 Futures (`NQ=F`).
- Resolved an issue in `etoro_import.py` where eToro's industry metadata would aggressively overwrite custom sectors set by the advice workflow.

## [0.9.0] - 2026-06-25

### Added
- Added new stock instruments to the tracking dataset (`data/instruments.json`).
- Added rule to `.agents/AGENTS.md` to prevent placeholder release notes.

### Changed
- Moved AI news and EOD data blobs from JSON to cleanly parsed Markdown files.
- Stripped legacy HTML out of markdown files and shifted ticker auto-linking entirely to the frontend.
- Updated ticker auto-linking in News and EOD markdown to use standard direct eToro ticker links.

### Fixed
- Removed excessive markdown list spacing in AI reports.
- Restored intelligent bare-ticker regex linking for both EOD and News.

## [0.8.0]

### Fixed
- The 'default' key (the global `ETORO_USER_KEY`) is no longer loaded into the startup `locations` sync or the dashboard dropdown when other location keys are present, as it is strictly meant for advices.
- The dashboard IPO badge now only highlights IPOs happening today, rather than including tomorrow's IPOs.

### Added
- Added a "Total P/L" card to the dashboard and moved all financial performance cards (Win Rate, Realized P/L, Open P/L, Total P/L) from the Positions tab to the global header so they are always visible.
- `scripts/screen.py quote` now tags the session on its human-readable output (pre-market / after-hours, with the as-of time and the regular-session close), so the advice researchers can read the correct session price straight from the row instead of re-searching for it.
- New `scripts/advice_log.py get-entry TICKER [--json]` command that reads a single tracked entry of any status, so `/check` no longer hand-parses `advice-log.json`.
- `/premarket` now runs the IPO screen step (`screen.py ipos`) that was documented but never wired into the skill.
- Retry buttons on the macro-calendar and IPO-tracker error states, so a failed fetch can be retried without reloading.
- `scripts/advice_log.py remove ID` deletes a single entry by id (e.g. a stray duplicate). It refuses to delete an entry that still has eToro lots unless you pass `--force`, so you can't nuke a tracked position by accident.
- The Positions tab now shows a per-lot "first advised" date AND "advised at" price: the advice that actually prompted each buy (the latest advice on/before the lot's open date, matched against the buy's local date), instead of repeating the pick's first-ever advice on every lot. Backed by a new `adviceEvents` list ({date, price}) that `add-pick` keeps per entry.
- Opening the drill-down from a Positions row now scopes the chart to that specific lot: anchored at the advice that prompted it (date + price) with its own buy and trailing-stop lines, and the lot is flagged in the lots list. Opening from the Advice tab keeps the whole-pick chart.

### Changed
- Strategy update: lowered preferred RSI to < 25 and added an output warning for A-rated Tech stocks due to value trap risks (applied via `/review`).
- Strategy update: Enforced a new rule to never add a ticker to the dashboard/advice list when there are already two open positions for it.
- Dashboard sparklines now use the theme's `--green`/`--red` (they were rendering a different hardcoded green/red), and the repeated info-icon inline styles collapsed into one `.info-icon` class.
- The oversold screen logs a clear warning when it parses zero rows (stockanalysis.com markup changed) instead of silently returning no candidates.
- The mandatory litigation/fraud red-flag gate is now present and identically worded across all five advice skills (it was missing in `/aftermarket` and `/check`).
- `/premarket` and `/aftermarket` now trust the session-tagged quote price; `/aftermarket` and `/diversify` now flag earnings-gap risk like `/premarket` already did.
- `/check` reads tracked entries via `advice_log.py get-entry` and `/check` can add a brand-new ticker with full `/advice` rigor (all entry/exit levels), not a partial entry.
- `/diversify` describes the correct 10-sector taxonomy (underweight computed over the 9 investable sectors).
- Skills genericized for open source: US session times stated in ET (dropped the Netherlands/CEST local times), a hardcoded absolute path removed, and the eToro credential docs corrected to the project `.env` to match the code. Every skill now carries uniform frontmatter and the `.claude` / `.gemini` skill trees are back in sync.
- Extracted the shared price-history pruning into `scripts/price_history.py` and entry normalization into `scripts/entries.py`, and the dashboard market-holiday calendar into `static/js/holidays.js`, so the duplicated/date logic can't drift out of sync.
- The market timer names the holiday when the market is closed for one (e.g. "MARKET CLOSED (Christmas)").
- The dashboard shows each eToro buy's "Bought on" date in the viewer's own timezone. `etoro_import.py` now keeps the full UTC `openDateTime` on every lot and the dashboard converts it client-side, so a buy placed late in the evening local time no longer shows on the wrong calendar day (it was being sliced straight off eToro's UTC timestamp).

### Fixed
- `scripts/advice_log.py add-pick` no longer creates a lot-less duplicate when you re-advise a ticker you already hold. It used to only match `watching` entries, so a re-advised held name spawned a second `watching` entry that lingered in the Advice tab forever. It now upserts onto the held position (refreshing the thesis and adding a price point) instead.
- The dashboard market-status timer used a hardcoded 2026 holiday list, so it would have shown the market as open on every 2027+ holiday. Holidays are now computed per year following NYSE rules (Good Friday via Computus, the Saturday/Sunday observance shifts, and the New-Year-on-Saturday exception).
- `scripts/etoro_import.py` no longer drops a price point when a new day's price matches the previous day's last price. Its price-history bookkeeping now matches `advice_log.py` exactly.
- The scripts no longer crash on legacy entries missing `priceHistory`, `status`, or `firstAdvised`. Entries are normalized on load and the hot paths (`find`, `latest_price`, check-in candidates, learn stats) read defensively.
- Defined the missing `--bg` CSS variable (several inputs and buttons were silently falling back to transparent) and removed a duplicate `@keyframes blink`.

## [0.7.0]

### Added
- The 'Refresh Calendar' button now bypasses the cache and forces an immediate fresh fetch of the macro events.

### Fixed
- Fixed a bug in `scripts/advice_log.py` that caused the `/aftermarket` and `/check` skills to fail when tracking new picks. Added `"aftermarket"` and `"manual"` to the `NEW_PICK_SOURCES` whitelist.
- Fixed an issue in `etoro_import.py` where a single eToro lot could be falsely attributed to multiple advice entries if a ticker was advised multiple times.
- Removed an erroneous `display: none` CSS rule that inadvertently hid the 'Refresh Calendar' macro button.
- Restored the correct `Forecast` and `Previous` column order in the macro table and prevented the `Time` column and countdown timer from wrapping to multiple lines.
- Disabled caching in the `yarafolio.py` dev server to prevent stale UI bugs during local development.

### Changed
- Changed macro calendar caching logic: the cache is now invalidated if 2 hours have passed or immediately if an economic event was scheduled to occur since the data was last fetched.

## [0.6.0] - 2026-06-23

### Changed
- Updated the dashboard logo to feature Yara's ear overlapping the circular border. Replaced `border-radius: 50%` with `drop-shadow` filters in `dashboard.html` to prevent clipping the transparent overlapping elements.

### Added
- Optimized the ticker details chart to reduce visual clutter. Data points from previous weeks are now intelligently combined into weekly data points (labeled "Wk X"), while intraday data points for the current week are filtered to keep the opening, closing, and points at least 2 hours apart.
- The successful API key from the startup check is now automatically selected as the default API key in the UI.

## [0.5.0] - 2026-06-23

### Added
- The dashboard now displays the current local version in the footer.
- The backend checks for newer releases on GitHub during the initial startup sync and displays an update notification in the footer if a newer version is available.
- Active sub-filters (Advice, Positions, News, IPO) and table sorting states are now persisted across page reloads and tab switches.

### Fixed
- Renamed the new `blink` CSS keyframes to `sparkle-blink` to stop it from breaking the 30-minute stale indicator animation.
- Fixed vertical alignment and optical sizing of the GitHub icon in the footer menu.
- Fixed an issue where the `estimated exit` badge would fail to display correctly for multiple positions/lots.
- Fixed chart background fill colors for reference lines in the drilldown modal.
- Fixed typescript evaluation errors in macro event timers.

## [0.4.0] - 2026-06-22

### Added
- Added exact timestamps (HH:MM) to `lastUpdated` fields in the dashboard UI and backend tracking files for better visibility.
- Implemented robust multi-location initial background sync in `yarafolio.py` to iterate through all `.env` location credentials until a successful eToro import occurs.

### Fixed
- Fixed the dashboard opening prematurely; it now waits for the initial background sync to complete so data is fresh upon loading.
- Fixed an issue in `advice_log.py` where flatlining stocks created hundreds of duplicate intraday data points. It now skips logging if the price is identical to the previous reading on the exact same day.
- Fixed a calculation issue in `etoro_import.py` where portfolio Market Value and P/L were calculated using the `lastExecution` price. It now uses the `bid` price to accurately mirror eToro's liquidating value calculations.
- Improved `is_refreshable_quote` logic in the dashboard to accept any valid live price. This prevents valid quotes from being rejected due to webpage date-parsing failures or market weekend closures, ensuring tickers like SRE and DOX update correctly.
- Fixed `advice_log.py` so that stock prices that haven't changed since the previous day (like NXST and WLK) still record a timestamp update in the tracker, so users know the price was successfully checked today.

## [0.3.0] - 2026-06-22

### Fixed
- Fixed an issue in `advice_log.py` where re-advising an active (`watching`) stock on a different date would create duplicate dashboard rows instead of updating the existing tracking entry.
- Corrected `advice_log.py` logic so that previously `bought`, `sold`, or `dropped` picks are cleanly tracked as brand new batches when re-advised.
- Updated `etoro_import.py` to read credentials directly from `~/.config/etoro/credentials` per the official documentation, instead of a local project `.env` file.

## [0.2.0] - 2026-06-22

### Fixed
- Fixed an `AttributeError` in `scripts/etoro_import.py` caused by a missing `urllib.request` import.

## [0.1.0] - 2026-06-20

### Added
- **Core Dashboard**: Local web interface serving vanilla HTML/CSS/JS (`yarafolio.py`).
- **AI Tracking**: Comprehensive tracker for AI-advised stocks with dynamic "Buy Zone" and "Stop-Loss" indicators.
- **eToro Syncing**: Automatic local synchronization of eToro positions, enabling real-time P/L and Win Rate analytics.
- **Sector Analysis**: Visual portfolio tab to highlight sector gaps and portfolio distribution.
- **Analytics Engine**: Breakdown of AI win rate by Rating, RSI, Sector, and Source.
- **EOD & AI News**: End-of-Day reporting tab and AI-generated news summaries with rich markdown support.
- **Market Intel**: Live news feed, Macro Calendar tracker, and IPO Tracker built directly into the dashboard.
- **Demo Mode**: Privacy-safe dummy data (`DEMO_MODE=1`) for testing and previewing the dashboard without authenticating.
- **Minimum Dependency Backend**: Full functionality using Python standard library, requiring zero `pip install` setups.

### Changed
- Refactored UI to match a sleek dark-mode, glassmorphism design with an emphasis on clarity and performance.
- Upgraded the documentation structure (`SETUP.md`, `MANUAL.md`, `DEMO_MODE.md`) to clearly distinguish setup guides from user manuals.
