---
name: advice
description: Run the primary eToro stock advice workflow (picks with upward potential, strategy focus)
license: Apache-2.0
metadata:
  version: v1
  publisher: arnoudhgz
---

# Advice Workflow

This skill executes the primary `/advice` workflow for the assisted-stock-advice project.

## Instructions
When the user asks you to run `/advice`:
1. Read the `GEMINI.md` file in the project root.
2. Strictly follow the **Strategy parameters**, **Output rules**, **Research workflow**, and **Advice tracking** steps defined in that file.
3. Specifically, use the exact scripts and tools mentioned in the `GEMINI.md` file to fetch candidates based on STRATEGY.md, perform deep dives, check red flags, and then log the picks.
4. **Report Generation:** You MUST synthesize the data from all tactical screens and subagent deep-dives into the exact 10-section "Cross-Check" format defined in the `GEMINI.md` output rules. You must explicitly list all tactics in Section 7, even if they yield zero candidates, stating "No suitable candidates" and explaining why.
