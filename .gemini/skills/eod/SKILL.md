---
name: eod
description: End-of-Day check to secure small profits on low-conviction picks before the market closes.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# End-of-Day (EOD) Check

Evaluates the active positions in the portfolio roughly 30 minutes before the market closes to lock in small profits on low-conviction or highly volatile picks, reducing overnight risk.

## Instructions
1. Review the currently open positions from `data/private/portfolio.json`. Focus on the recently added positions or those marked with high volatility.
2. Cross-reference the original entry ratings in `data/private/advice-log.json`. Look specifically for lower-tier picks (e.g. C-tier) or those flagged for quick exits.
3. Determine if any positions should be closed right now to lock in small profits or cut loose before the close to avoid gap-downs tomorrow.
4. Draft a short report summarizing the market close context, identifying which positions to close, and why. **CRITICAL:** You MUST format your report exactly like this so the dashboard parser picks up the title and lists:
   ```markdown
   ### Your Short Descriptive Title Here
   A brief 1-2 sentence context about the market close.
   - **TICKER (+X.XX%)**: Action and reasoning.
   - **TICKER (-Y.YY%)**: Action and reasoning.
   ```
5. Run `python3 scripts/advice_log.py add-eod --summary "YOUR_EOD_REPORT_HERE"` to append the decision to the log. Ensure to escape quotes properly.
6. The autosync will automatically push `eod.md` to your private git repo if configured.
