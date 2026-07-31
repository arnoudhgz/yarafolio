# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-07-31

- Configuration: Added `USER_TIMEZONE` to `.env.sample` for configurable AI timezone handling.
- Documentation: Added explicit configuration instructions for `USER_TIMEZONE` to `docs/SETUP.md`.
- Architecture: Added new Git Hygiene, Timezone Communication, Atomic Commits, UI Modal Fidelity, and Strict DOM Type-Checking rules to `.agents/AGENTS.md`, `GEMINI.md`, and `CLAUDE.md`.
- Documentation: Updated `docs/MANUAL.md` to reflect new 0.10.0 features (Open Notes, GICS Sectors, Top Bar Summaries).
- Strategy update: Upgraded the vague 'Consistent Free Cash Flow' requirement in the Buffett Moat matrix to a hard 'FCF Yield > 5%' metric in `STRATEGY.md`.
- Analytics: Added total portfolio Maximum Drawdown (MDD) and Sharpe Ratio calculation to `review_stats.py` using `equity-history.json` to properly weight the varying position sizes.
- Dashboard: Reordered the Analytics tab charts to prioritize Equity Curve and Realized P/L at the top, followed by Underwater Drawdown and Sector Analysis.
- Dashboard: Added an "Underwater Drawdown" area chart beneath the Equity Curve to visualize the percentage drop from the portfolio's all-time high over time.
- Dashboard: Upgraded the "Gain vs Days Held" bar chart into a "Trade Efficiency" scatter plot, mapping every individual closed position to visually expose behavioral habits like holding losers too long.
- Dashboard: Introduced a `%` vs `$` toggle on most Win Rate and Trade Efficiency charts to instantly switch between average percentage returns and absolute realized dollars without reloading the dashboard.
- Analytics: Re-engineered Maximum Drawdown (MDD) calculation to use a compounding return index, ensuring cash deposits/withdrawals no longer falsely register as portfolio drawdowns.
- Dashboard: Grouped all Win Rate charts (over time, by rating, by RSI, by sector, by source) sequentially in the UI and updated titles for clarity.
- Dashboard: Set the "Bought" view as the default active toggle for the Day of the Week chart.
- Dashboard: Updated all chart info modals to clearly document the new `%`/`$` toggle behaviors and accurately describe the new Drawdown metric.
- Bugfix: Corrected floating-point precision noise on the Y-axis ticks of the Equity Curve and Drawdown charts.
- Bugfix: Fixed an issue where ticker hyperlinks inside markdown code blocks (e.g. \`DUOL\`) would render as raw HTML strings in the News, EOD, and Learnings UI.
- Bugfix: The \`/review\` skill now generates strict ISO 8601 timestamps in \`REVIEWS.md\` (e.g., \`[YYYY-MM-DDTHH:MM-04:00]\`), and the dashboard now correctly parses them into the user's local timezone instead of displaying raw New York time.
- Feature: Added a Treemap/Heatmap visualizer to the Portfolio tab, complete with a toggle to view "AI Advised Only" or "Entire Portfolio".
- Architecture: Refactored to a Meta-Advisor pattern, extracting `oversold` into a dedicated tactical skill and decoupling it from the `advice`, `premarket`, and `aftermarket` workflow skills.
- Architecture: Updated all skill manifests (`.claude/` and `.gemini/`) to support the new modular strategy-agnostic approach.
- Feature: Implemented an `--open-note` parameter in `advice_log.py add-pick` to persist actionable premarket/aftermarket timing advice directly into the database.
- Dashboard: Added visual rendering of the `openNote` property in the dashboard drill-down modal (displayed in orange below the Risk section).
- Pipeline: Updated the CLI to parse and accept GICS sectors exclusively instead of the legacy eToro sectors.
- Dashboard: Fixed a bug causing a DOM Exception for disabled buttons in `renderers.js` by explicitly casting to `HTMLButtonElement`.
- Dashboard: Removed the redundant "Analytics" overarching title to fix the double title display above the "~7 days after advice" card.
- Dashboard: Added "Advised" and "Bought" toggles to the "By Day of the Week" chart to allow bucketing by either the AI advice date or the eToro trade execution date.

### Added
- Dashboard: Combined the Sector division and Sector coverage charts into a single "Sector Analysis" card on the Analytics tab and added explanatory modals regarding sector accuracy.
- Dashboard: Updated the sector charts with a distinct 12-color palette for improved legibility.
- Sample Data: Added missing dummy files (`equity-history.json`, `correlation.json`, `REVIEWS.md`) and updated sectors to the GICS standard to match the real data structure.
- Pipeline: Implemented true GICS sector extraction from StockAnalysis in `screen.py` to replace broad eToro industry labels (e.g., misclassified "Consumer Goods").
- Pipeline: Updated `etoro_import.py` to prioritize cached GICS sectors over eToro industry IDs to prevent sector accuracy regressions.
- Feature: Added support for blacklisting stocks. Blacklisted stocks can be added manually or flagged from the dashboard, are tagged with customizable reasons (e.g., 'not listed', 'paused'), and are automatically ignored by the advice workflow.
- Dashboard: Added "Closed positions" and "Ignored positions" summary cards to the top bar layout.
- Dashboard: Fixed an issue where "Removed" items were completely deleted and no longer counted towards the "Ignored positions" and "Total adviced picks" totals. "Removed" items are now marked with a `removed` status instead.
- Dashboard: Fixed an issue on the Equity Curve where the "30d" view could sometimes display duplicate dates on the x-axis due to UTC boundary overlap. The chart now properly buckets by local calendar days.
- Dashboard: Fixed an issue where the Realized P/L chart would not load the current month view automatically on page load.
- Dashboard: Fixed an issue where legacy eToro sectors could cause discrepancies and missing values in the sector charts, by mapping them to GICS at render time.
- Dashboard: Re-styled the Prev/Next pagination buttons on the Realized P/L chart to match the standard refresh button style and added a visual disabled state.
- CLI: Added `open-profits` command to `scripts/advice_log.py` to quickly list open positions currently in profit.
- Pipeline: Added `--min-rsi`, `--exclude-held`, and `--exclude-advised` native filtering flags to `scripts/screen.py oversold`.
- Pipeline: Fixed a bug in `scripts/screen.py oversold` where `--min-rsi` incorrectly acted as a maximum bound instead of a lower bound.
- Added 4 new analytics charts to the dashboard for deep strategy insights:
  - **Performance by Day of the Week**: Bar chart showing average P/L% by the day of the week a stock was advised.
  - **Win Rate Over Time**: Line chart tracking the win rate % of advice generated each month.
  - **Entry Discipline**: Bar chart comparing the win rate of stocks bought "In Buy Zone" (<= target) versus "Chased" (> target).
  - **Days to Bounce vs RSI**: Bar chart showing the average days held for winning trades grouped by RSI band at advice.
- Added a new "Gain vs Days Held" bar chart to the Analytics tab to visualize the average percentage gain of closed positions grouped by the number of days they were held. Tooltips include the sample size, maximum gain, and maximum loss for that specific holding period. (Also strips out any NaN dates).
- Added a new "Learnings" tab to the dashboard to organize strategy reviews, ad-hoc analysis, and ticker deep dives using a masonry grid layout.
- Review headers generated by the `/review` skill now include exact timestamps (`[YYYY-MM-DD HH:MM]`).
- Added historical account equity tracking, automatically recording total Realized and Open P/L on data syncs.
- Added a new "Equity Curve" chart to the Analytics tab, visualizing Realized, Open, and Total P/L across 24h (1-hour buckets), 7-day, 4-week, and 12-month timeframes.
- Added S&P 500 (SPX) and Dow Jones (DJI) percentage benchmarks alongside the Nasdaq on the Equity Curve chart.
- Added `correlation.json` to the automated backup paths in `scripts/autosync.py`.
- Added 11 new stock instruments to the tracking dataset (`data/instruments.json`).
- CLI: Added new `momentum` subparser to `scripts/screen.py` to identify stocks with extreme relative strength (RSI > 70).
- AI Skills: Introduced `/momentum`, `/insider`, and `/earnings-play` workflows to both `.claude/skills` and `.gemini/skills` for identifying non-oversold market opportunities.
- AI Skills: Introduced `/market-rotation` workflow to both `.claude/skills` and `.gemini/skills` for finding opportunities in sectors gaining relative momentum using systematic tactics.
- Dashboard: Implemented a Light/Dark mode toggle (using `localStorage`) for better accessibility.

### Changed
- Architecture: Integrated `/diversify` as a tactical sub-skill under the master `/advice` orchestrator (removed as a standalone command).
- Docs: Added a non-negotiable rule to `GEMINI.md` and `CLAUDE.md` requiring the `/advice` orchestrator to explicitly list all executed sub-skills and explain any picks or rejections after the main advice table.
- Architecture: Unified the `/premarket` and `/aftermarket` skills into a single time-aware `/advice` orchestrator.
- Architecture: Renamed the `/earnings-play` skill to `/earnings` across all skills and CLI to ensure consistency.
- Docs: Exposed the available tactical sub-skills (`oversold`, `momentum`, `earnings`, `insider`, `market-rotation`) directly in the `GEMINI.md` and `CLAUDE.md` workflow documentation so orchestrators explicitly know they exist.
- Docs: Removed redundant UI and blacklist text rules from AI instructions to save tokens, as they are now strictly enforced in the python backend.
- Docs: Updated `GEMINI.md` and `CLAUDE.md` to document the asynchronous nature of the Equity Curve graph updates vs the live DOM update for Top Cards.
- Docs: Updated `.agents/AGENTS.md` to explicitly forbid hardcoding strategy thresholds in skill files and added a strict Ticker Validation Rule for generic stock symbols.
- Changed: Split the RSI bands in `scripts/review_stats.py` into more granular buckets (`<20`, `20-30`, `30-40`, `40-50`, `50-60`, `60-70`, `70+`) to better represent momentum and rotation plays.
- Strategy update: Updated `/diversify` skill criteria to require strict quality standards (A rating, zero Tech exposure) given recent underperformance.
- Workflow update: Updated `/diversify`, `/insider`, and `/earnings-play` skills to always fetch and log the exact RSI at the time of advice, ensuring better data quality for downstream analytics even on non-oversold strategies.
- Dashboard: Fixed RSI rendering to consistently display rounded integers across tables and modals.
- Analytics: Overhauled the "Entry Discipline" chart to show Average P/L % instead of Win Rate %, plotting positions across 4 distinct entry bounds ("Below Drop Below", "In Buy Zone", "Chased", "Above Drop Above") and tracking Min/Max range in tooltips.
- Dashboard: Reordered the second row of summary cards to place "Win rate (closed)" at the end for better logical flow.
- Dashboard: Replaced the native `confirm()` dialog with a custom modal (`confirmModal`) for the drop and remove actions to improve UI consistency.
- Dashboard: Fixed an issue where clicking table headers on identical values (like positions closed on the same day) resulted in unpredictable sorting. It now uses the company name or ticker as a stable alphabetical tie-breaker.
- Docs: Updated the eToro sign-up link to use the new referral URL.
- Strategy update: Updated GEMINI.md/CLAUDE.md to advise actively avoiding Tech stocks unless the setup is pristine, due to significant underperformance.
- Strategy update: Banned all new Tech sector recommendations until performance recovers due to heavy underperformance and extreme systemic correlation.
- Strategy update: Updated GEMINI.md/CLAUDE.md to remove C-rated stocks from the outperformance claim and flag them as falling-knife risks, due to poor performance.
- Workflow update: Updated GEMINI.md/CLAUDE.md to utilize the new native filtering parameters for `screen.py oversold` instead of manual post-filtering.
- Strategy update: Clarified in GEMINI.md/CLAUDE.md that B/C rated stocks historically outperform A-rated stocks in the base strategy.
- Standardized all logged timestamps (`lastUpdated`, EOD/News dates, price history) to exclusively use the `America/New_York` timezone formatted as ISO 8601 strings with offsets (e.g. `YYYY-MM-DDTHH:MM-04:00`).
- The frontend dashboard now automatically parses these ISO strings to correctly display dates in the user's local timezone.
- Replaced timezone-hacky local `date.today()` calls with a dedicated `nyse_now()` and `nyse_today()` helper across all python scripts.
- Extracted all personal strategy parameters (batch sizes, trailing stops) and learned trading rules out of the public repo files (`GEMINI.md`, `CLAUDE.md`, and skill files) into a git-ignored `data/private/STRATEGY.md` file. A generic `STRATEGY.sample.md` template is now provided for new users.
- Updated the `/review` skill to strictly propose strategy updates to the private `data/private/STRATEGY.md` file rather than modifying the open-source instructions.
- Strategy update: Broadened Tech warning in GEMINI.md/CLAUDE.md to require exceptional setups and marked 'A-rated' stocks as highly skeptical.
- **Renamed the custom `/learn` strategy-evaluation command to `/review`** across all scripts (`review_stats.py`), skills, and log files (`REVIEWS.md`) to avoid naming collisions with Antigravity's built-in `/learn` slash command.
- Strategy update: Updated GEMINI.md/CLAUDE.md to reverse the claim that B-rated stocks outperform A-rated stocks, as A-rated stocks have shown renewed strength and are now outperforming.
- Strategy update: Updated advice.md to require exceptionally strong conviction (stronger catalysts or deeper oversold indicators) before finalizing standard intraday picks, as intraday advice historically underperforms premarket and aftermarket runs.
- Dashboard: Updated the Rating Info modal to explicitly explain the A/B/C rating taxonomy instead of outdated wording.
- Dashboard: Fixed an issue where the Rating bucket chart in the Analytics tab sorted grades alphabetically (e.g. A, A+, A-, B...) rather than logically (A+, A, A-, B+, B...).
- Dashboard: Migrated all modals from pseudo-backdrop `div`s to native HTML `<dialog>` elements for better structural semantics and simplified CSS.

### Fixed
- Fixed test failures in `tests/test_advice_log.py` caused by missing mandatory parameters for new picks by updating the `_pick_args` helper.
- CLI: Enforced `--reason` and `--risk` as strictly mandatory parameters in `scripts/advice_log.py add-pick` to prevent blank UI modals.
- CLI: Added strict blacklist enforcement to `scripts/advice_log.py add-pick` to prevent adding blacklisted tickers.
- Fixed an issue where manual eToro imports permanently remained "Bought" and continued to display an active open P/L, even after being fully closed out in eToro. The sync process now properly auto-closes them.
- Fixed a duplicated ID collision between manual imports and subsequent advice runs for the same ticker.
- Fixed `advice_log.py checkin-candidates` using a hardcoded >7 days threshold instead of respecting the 3-day drop rule.
- Fixed an alphabetical sorting bug on the dashboard Analytics "By RSI band" chart that caused `<20` to render incorrectly on the right side of numerical buckets.
- Fixed `etoro_import.py` and dashboard P/L calculations to correctly use the position's `avg_open` price and `initialAmountInDollars` (invested amount) rather than dynamically recalculating invested amount, preventing discrepancies.
- Dashboard: Prevented smaller confirmation modals from stretching with an empty space at the bottom by isolating the `min-height: 40vh` CSS rule strictly to the main chart modal.
- Workflow: `etoro_import.py` now writes to `data/instruments_cache.json` instead of the version-controlled `data/instruments.json` file, preventing instrument list updates from dirtying the git status.
- Fixed an issue where identical notes could be duplicated multiple times on the same day when a ticker was repeatedly re-advised.
- Fixed date sorting so that identical local dates properly use their underlying timestamp for chronological sorting.
- Separated column sorting states per Positions filter (Open, Closed, Needs Confirm, All) so that each tab remembers its own sort order independently.
- Fixed an issue where the Macro Calendar and IPO Tracker would calculate the "current day" using the local timezone (e.g., European time) rather than New York market time, causing events from the next market day to be incorrectly flagged as happening "today" and prematurely shown as "Passed".
- Fixed an issue where the location API key dropdown in the dashboard would incorrectly reset to the backend's startup location choice across page reloads and data syncs, rather than remembering the user's explicit selection.
- Fixed an issue in the News Feed where the "Advised" filter would only show a couple of tickers (like PTC and SR). This was caused by a backend 20-ticker fetch limit intersecting with an unsorted ticker list. Tickers are now prioritized (Watchlist first, then freshest eToro positions) and the limit was increased to 45 to ensure all active advice gets news coverage.
- Fixed an edge case where aftermarket advice logs generated past midnight local time wouldn't match with eToro trades opened during the previous day's US market session. This was achieved by accurately evaluating market sessions via the `America/New_York` timezone directly instead of brittle local hour comparisons.
- Fixed `ModuleNotFoundError` for `nyse` in `yarafolio.py` by appending the `scripts` directory to `sys.path`.
- Fixed an issue where invalid ratings (like "Buy") could be added to the advice log by enforcing strict A/B/C letter grade validation via argparse choices in `advice_log.py`.
- Fixed an issue in `advice_log.py` where the new `/momentum`, `/earnings-play`, and `/insider` workflows failed to log picks due to missing source whitelists.
- Fixed `autosync.py` to include `STRATEGY.md` in the private backup sync so personal rules are safely persisted.
- Fixed `STRATEGY.md` and related AI skills to ensure strategy parameters (like minimum price and volume) apply globally and are not hardcoded into public skill files.
- Fixed `scripts/etoro_import.py` to iterate through all available `ETORO_USER_KEY` variables until a successful authentication is found, instead of failing on the first attempt.
- Fixed the dashboard Equity Curve chart to accurately update during premarket and after-hours by switching the Nasdaq reference from `^IXIC` (which only updates during the regular session) to Nasdaq 100 Futures (`NQ=F`), and by pulling live prices from the active session into the open P/L calculation.
- Fixed duplicate date labels on the 7d Equity Curve chart by including intraday time in the X-axis formatter.
- Dashboard: Fixed a Flash of Unstyled Content (FOUC) when reloading the page on non-default tabs by using an inline synchronous script.
- Dashboard: Restored the animated starry sky (sparkles) behind the Yara popup that was accidentally removed during the `<dialog>` migration.
- Dashboard: Updated chart colors to use CSS variables so axes, ticks, grids, and legend text are visible in both light and dark themes.
- Fixed an issue in `etoro_import.py` where eToro's industry metadata would aggressively overwrite custom sectors set by the advice workflow. The advice tracker's sector categorization now correctly takes precedence for both the advice log and the imported portfolio data.
- Scrubbed legacy eToro sector strings (like "Consumer Goods", "Services", "Basic Materials") from the `instruments.json` database and replaced them with standard GICS sectors to ensure consistency across UI charts.

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
