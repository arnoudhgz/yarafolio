
## Changelog Rule
Always update the `CHANGELOG.md` file when making code changes and before making git commits.

## Release Notes Rule
Never use "See Changelog for details" or similar placeholders for GitHub release notes. Always copy the actual release notes from `CHANGELOG.md` and use them as the proper release notes.

## Timezone & Logging Rule
When logging dates, writing data to JSON files, or manipulating market times in the backend, ALWAYS use the `scripts/nyse.py` module (e.g., `nyse_now()`, `nyse_today()`). NEVER use `datetime.now()` or `date.today()`. Save dates strictly in ISO 8601 format with explicit timezone offsets (e.g., `now.isoformat("T", "minutes")`) so the backend reliably tracks the `America/New_York` market session. The front-end JavaScript will automatically parse these strings into local time for the viewer.

## Scratch Files Rule
When creating scratch scripts, one-off data files, or temporary exploration files, ALWAYS store them in the `scratch/` or `tmp/` directories rather than the project root. This ensures they are automatically ignored by git.

## Active Release Branch Rule
When working on an active release branch (e.g., `release/0.10.0`), always verify if that version has been released yet. If the top of `CHANGELOG.md` matches the current branch version, append your changes to that existing section. Do NOT prematurely bump the version in `CHANGELOG.md` or create a new release branch unless explicitly instructed.

## Open-Source Privacy Rule
Never hardcode personal trading parameters (e.g., account sizes, specific broker workflows, quantitative screening thresholds like ROE > 15%, sector bans, or personal biases) into the public, tracked repository files (`GEMINI.md`, `CLAUDE.md`, or skill files). Skill instructions should only state *what* to filter (e.g., "Screen candidates based on the active rules in STRATEGY.md"), never *how* to filter it. All personal strategy elements must be stored exclusively in the git-ignored `data/private/STRATEGY.md` file, and a generic placeholder must be provided in `data/sample/STRATEGY.md`.

## Ticker Validation Rule
When retrieving data for or recommending stocks with highly generic ticker symbols (e.g., GOLD, SILVER, V), you MUST explicitly verify that the ticker currently maps to the intended equity (company name) rather than a commodity future or ETF. Tickers can be reassigned. Always output the full company name alongside the ticker in your advice to ensure the user searches for the right asset on their broker.
