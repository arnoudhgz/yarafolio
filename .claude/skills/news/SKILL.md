---
name: news
description: Generates a quick AI management summary of the latest news for your active and watched tickers.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# News Summary

Generates a concise management summary of the most impactful recent news for the portfolio's active and watched tickers, logging the result to `data/private/news.md`.

## Instructions
1. Retrieve the list of currently active tickers (`bought` or `watching` status) from `data/private/advice-log.json`.
2. Run `python3 scripts/screen.py news TICKER1 TICKER2 ...` to fetch the latest headlines for those tickers. (Batches of 5-10 tickers are recommended).
3. Review the headlines for major catalysts, earnings previews, macro shifts, or sector-wide themes.
4. Synthesize the findings into a concise, high-level management summary (focusing on actionable insights, broad themes, or red flags, rather than just listing ticker by ticker).
5. Run `python3 scripts/advice_log.py add-news-summary --summary "YOUR_SUMMARY_HERE"` to persist the update. Ensure to escape quotes properly.
6. The autosync will automatically push `news.md` to your private git repo if configured.
