# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0]

### Added
- Added the 'Actual' value column to the Macro Economic Events calendar and reordered the columns to Previous, Forecast, Actual.
- Added optional Financial Modeling Prep (FMP) API integration to retrieve real 'actual' macro values when `FMP_API_KEY` is provided in `.env`.
- The 'Refresh Calendar' button now bypasses the cache and forces an immediate fresh fetch of the macro events and FMP data.

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
