# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-06-22

### Fixed
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
