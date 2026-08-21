
## Changelog Rule
Always update the `CHANGELOG.md` file when making code changes and before making git commits.

## Release Notes Rule
Never use "See Changelog for details" or similar placeholders for GitHub release notes. Always copy the actual release notes from `CHANGELOG.md` and use them as the proper release notes.

## Timezone & Logging Rule
When logging dates, writing data to JSON files, or manipulating market times in the backend, ALWAYS use the `scripts/nyse.py` module (e.g., `nyse_now()`, `nyse_today()`). NEVER use `datetime.now()` or `date.today()`. Save dates strictly in ISO 8601 format with explicit timezone offsets (e.g., `now.isoformat("T", "minutes")`) so the backend reliably tracks the `America/New_York` market session. The front-end JavaScript will automatically parse these strings into local time for the viewer.

## Scratch Files Rule
When creating scratch scripts, one-off data files, or temporary exploration files, ALWAYS store them in the `scratch/` or `tmp/` directories rather than the project root. This ensures they are automatically ignored by git.

## Active Release Branch Rule
When working on an active release branch (e.g., `release/0.10.0`), always verify if that version has been released yet. If the top of `CHANGELOG.md` matches the current branch version, append your changes to that existing section. Do NOT prematurely bump the version in `CHANGELOG.md` or create a new release branch unless explicitly instructed. Always update the release date (e.g., `[0.10.0] - YYYY-MM-DD`) in `CHANGELOG.md` to the current date whenever appending new changes.

## Open-Source Privacy Rule
Never hardcode personal trading parameters (e.g., account sizes, specific broker workflows, quantitative screening thresholds like ROE > 15%, sector bans, or personal biases) into the public, tracked repository files (`GEMINI.md`, `CLAUDE.md`, or skill files). Skill instructions should only state *what* to filter (e.g., "Screen candidates based on the active rules in STRATEGY.md"), never *how* to filter it. All personal strategy elements must be stored exclusively in the git-ignored `data/private/STRATEGY.md` file, and a generic placeholder must be provided in `data/sample/STRATEGY.md`.

## Ticker Validation Rule
When retrieving data for or recommending stocks with highly generic ticker symbols (e.g., GOLD, SILVER, V), you MUST explicitly verify that the ticker currently maps to the intended equity (company name) rather than a commodity future or ETF. Tickers can be reassigned. Always output the full company name alongside the ticker in your advice to ensure the user searches for the right asset on their broker.

## Git Hygiene Rule
After completing a major task, feature, or refactor—or before concluding a session—ALWAYS run `git status` to check for modified files. You must proactively document your changes in `CHANGELOG.md` and commit/push them to the active release branch so that work is never left dangling in the working directory.

## Timezone Communication Rule
When discussing US stock market hours, premarket/aftermarket trading windows, or broker cut-offs, ALWAYS check the `USER_TIMEZONE` environment variable in the `.env` file (e.g., `Europe/Amsterdam`). You must automatically translate the New York Eastern Time (ET) schedule into the user's configured local timezone for absolute clarity. If the variable is missing, fallback to calculating the offset using the local time provided in your system metadata prompt.


## Atomic Commits & Versioning Rule
Never bundle multiple unrelated features or fixes into a single massive git commit. Commits must be small and atomic. Furthermore, never proactively bump software versions (e.g., to 1.0.0) or assume it's time for a release unless explicitly commanded by the user. The user always controls the timeline.

## UI Modal Fidelity Rule
Whenever modifying the underlying logic of a chart (such as swapping between % and $ calculations), immediately verify and update the corresponding informational modals in the HTML so the descriptive UI text perfectly matches the new data behavior. Never leave the UI text out of sync with the data.

## Strict DOM Type-Checking Rule
When writing or refactoring JavaScript in this project, always use strict JSDoc type casting (e.g., `/** @type {HTMLElement} */`) and explicit runtime checks (`instanceof HTMLElement`) when interacting with DOM elements, otherwise the strict type-checker will throw implicit `any` errors.

## Plan Artifacts Rule
When using the /plan command to generate an Implementation Plan artifact, ALWAYS save a copy of the plan markdown file directly to the project's 	mp/ directory (e.g., 	mp/plan_name.md) so the user can easily read it in their IDE without it being committed.
