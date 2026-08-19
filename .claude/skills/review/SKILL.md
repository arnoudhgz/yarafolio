---
name: review
description: Self-learning pass over advice outcomes. Use when the user types /review, asks "how good were your advices", "what should we change in the strategy", or after an advice run suggested it. Computes outcome stats, proposes concrete skill/agent/CLAUDE.md improvements, applies them only after approval.
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Learn from advice outcomes

Compare past advice against what actually happened, then improve the advice pipeline. Changes are proposals, never silent edits.

## Step 1: Gather

- `python3 scripts/review_stats.py` (and `--json` if you need exact numbers): win rate and avg/median move by rating, RSI band, sector, source, plus the ~7-day-after-advice stat and the measurable-outcome count.
- Run `python3 scripts/correlation.py` to generate the latest 30-day Pearson correlation matrix for the active portfolio, and read the output from `data/private/correlation.json` to identify overlapping systemic risks between current holdings.
- Read `data/private/REVIEWS.md`: what was already concluded and changed in earlier runs. Never re-propose something that was applied or explicitly rejected before.

## Step 2: Interpret with discipline

- Small-n caveats are mandatory. Buckets the script marks "insufficient data" support no conclusions.
- Look for actionable patterns, for example: a rating grade that consistently loses (tighten the rating guide or drop the grade from advice), an RSI band that underperforms (falling knives live under some threshold, adjust the screen floor), a sector where theses keep breaking, a source (/advice vs /premarket vs /diversify) with structurally worse outcomes, dropped picks that kept falling (drops were right) or recovered (drops were too eager), or highly correlated holdings (> 0.70) in the correlation matrix that suggest concentrated systemic risk.
- Distinguish strategy problems (the rules are wrong) from execution problems (the rules weren't followed). Only the first kind warrants a skill edit.
- **Ban Re-evaluation:** Strict bans on tactics (e.g., `market-rotation`) or sectors create data blind spots because they stop generating new data. Always cross-reference current bans in `STRATEGY.md` with their date of origin in `REVIEWS.md`. If a ban is older than 3-4 weeks, automatically propose lifting it for a "test batch" so we can gather fresh outcome data in future reviews.

## Step 3: Propose (max 3 per run)

For each proposal, show: the stat that triggered it (with n), the exact file, and the concrete before/after text. Targets: `.claude/commands/advice.md`, `.claude/skills/premarket/SKILL.md`, `.claude/skills/check/SKILL.md`, `.claude/skills/diversify/SKILL.md`, `.claude/agents/stock-researcher.md`, `data/private/STRATEGY.md`. Keep proposals small and testable; one rule change per proposal.

## Step 4: Approval gate

One AskUserQuestion round listing the proposals (accept/reject each). Apply only the accepted ones, exactly as shown.

## Step 5: Record

Append one entry to `data/private/REVIEWS.md` (newest on top, below the header). Use the current date and time in strict ISO 8601 format with explicit timezone offsets (generated via `scripts/nyse.py`) for the header:

```markdown
## [YYYY-MM-DDTHH:MM-04:00]

### Strategy Review

- Measurable outcomes: N (was M last run)
- Key stats: 2-4 bullets with the numbers that mattered
- Proposed: short bullet per proposal, marked applied / rejected
```

The "Measurable outcomes" line is load-bearing: advice runs compare `review_stats.py --count-only` against the latest entry to decide when to nudge for the next /review.

## Step 6: Auto-backup

Run `python3 scripts/autosync.py "learn pass"`. Commits + pushes `data/private/REVIEWS.md` and `data/private/STRATEGY.md` (and any other data changes) to the private backup repo when `STOCKS_AUTOSYNC=1`, silent no-op otherwise. Accepted skill edits are code, not data, so commit those yourself.
