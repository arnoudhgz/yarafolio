
## Changelog Rule
Always update the `CHANGELOG.md` file when making code changes and before making git commits.

## Release Notes Rule
Never use "See Changelog for details" or similar placeholders for GitHub release notes. Always copy the actual release notes from `CHANGELOG.md` and use them as the proper release notes.

## Timezone & Logging Rule
When logging dates, writing data to JSON files, or manipulating market times in the backend, ALWAYS use the `scripts/nyse.py` module (e.g., `nyse_now()`, `nyse_today()`). NEVER use `datetime.now()` or `date.today()`. Save dates strictly in ISO 8601 format with explicit timezone offsets (e.g., `now.isoformat("T", "minutes")`) so the backend reliably tracks the `America/New_York` market session. The front-end JavaScript will automatically parse these strings into local time for the viewer.

## Scratch Files Rule
When creating scratch scripts, one-off data files, or temporary exploration files, ALWAYS store them in the `scratch/` or `tmp/` directories rather than the project root. This ensures they are automatically ignored by git.
