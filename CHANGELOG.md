# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2026-06-26

### Changed
- Standardized all logged timestamps (`lastUpdated`, EOD/News dates, price history) to exclusively use the `America/New_York` timezone formatted as ISO 8601 strings with offsets (e.g. `YYYY-MM-DDTHH:MM-04:00`).
- The frontend dashboard now automatically parses these ISO strings to correctly display dates in the user's local timezone.
- Replaced timezone-hacky local `date.today()` calls with a dedicated `nyse_now()` and `nyse_today()` helper across all python scripts.

### Fixed
- Fixed an edge case where aftermarket advice logs generated past midnight local time wouldn't match with eToro trades opened during the previous day's US market session. This was achieved by accurately evaluating market sessions via the `America/New_York` timezone directly instead of brittle local hour comparisons.

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
