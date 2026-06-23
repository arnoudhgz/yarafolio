# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0]

### Added
- `scripts/screen.py quote` now tags the session on its human-readable output (pre-market / after-hours, with the as-of time and the regular-session close), so the advice researchers can read the correct session price straight from the row instead of re-searching for it.
- New `scripts/advice_log.py get-entry TICKER [--json]` command that reads a single tracked entry of any status, so `/check` no longer hand-parses `advice-log.json`.
- `/premarket` now runs the IPO screen step (`screen.py ipos`) that was documented but never wired into the skill.

### Changed
- The mandatory litigation/fraud red-flag gate is now present and identically worded across all five advice skills (it was missing in `/aftermarket` and `/check`).
- `/premarket` and `/aftermarket` now trust the session-tagged quote price; `/aftermarket` and `/diversify` now flag earnings-gap risk like `/premarket` already did.
- `/check` reads tracked entries via `advice_log.py get-entry` and `/check` can add a brand-new ticker with full `/advice` rigor (all entry/exit levels), not a partial entry.
- `/diversify` describes the correct 10-sector taxonomy (underweight computed over the 9 investable sectors).
- Skills genericized for open source: US session times stated in ET (dropped the Netherlands/CEST local times), a hardcoded absolute path removed, and the eToro credential docs corrected to the project `.env` to match the code. Every skill now carries uniform frontmatter and the `.claude` / `.gemini` skill trees are back in sync.

### Fixed
- `scripts/etoro_import.py` no longer drops a price point when a new day's price matches the previous day's last price. Its price-history bookkeeping now matches `advice_log.py` exactly.
- The scripts no longer crash on legacy entries missing `priceHistory`, `status`, or `firstAdvised`. Entries are normalized on load and the hot paths (`find`, `latest_price`, check-in candidates, learn stats) read defensively.

### Changed
- Extracted the shared price-history pruning into `scripts/price_history.py` and entry normalization into `scripts/entries.py`, so `advice_log.py` and `etoro_import.py` can't drift out of sync.

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
