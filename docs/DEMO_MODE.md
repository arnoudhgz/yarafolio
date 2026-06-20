# 🏗️ Architecture & Privacy (Why JSON?)

You might wonder why YaraFolio uses flat JSON files (`data/advice-log.json`) instead of a robust SQL database like Postgres or SQLite. 

1. **Zero Install Dependencies**: You can clone this repo and run it instantly without running `npm install`, `pip install`, or configuring Docker/databases. (Note: While it requires no package installs, the dashboard does act as an aggregator, pulling live data from external APIs like eToro and Yahoo Finance).
2. **Human-Readable & Editable**: If a scrape goes wrong or you need to fix a typo, you can literally open the JSON file in a text editor and change it. 
3. **Git-Native Backups**: JSON diffs perfectly in Git. This allows for a completely decoupled backup system!

## 🔒 Keeping Your Data Private & Demo Mode

Your personal trading data in `data/private/` is heavily protected by `.gitignore`. It is physically impossible to accidentally push your real `data/private/*.json` files to this public repository. 

### What is Demo Mode?

To give others a way to try out the dashboard safely without needing your personal portfolio data, YaraFolio includes a **Demo Mode**. 

When Demo Mode is activated, the dashboard completely ignores your actual eToro API keys and `data/private/` files. Instead, it reads from a safe, mock dataset located in `data/sample/`. This allows you to explore the dashboard, click around, and view the analytics tabs exactly as a real user would, but with dummy data.

**How to activate Demo Mode:**
1. Open your `.env` file.
2. Add or change the line to say: `DEMO_MODE=1`
3. Restart the python server (`python3 serve.py`).

*Tip: When you are taking screenshots or recording videos of YaraFolio to share online (e.g. on LinkedIn), always turn on Demo Mode first to prevent leaking your real account balance or open trades!*

## 🔄 Automatic Backups (Private Repository)
You can configure YaraFolio to automatically commit and push your real JSON data to a totally separate, *private* GitHub repository every time a trade is updated. 

1. Create a private, empty repository on GitHub (e.g. `my-private-trading-data`).
2. Add the SSH URL to your `.env` file:
   ```bash
   PRIVATE_DATA_REPO=git@github.com:yourusername/my-private-trading-data.git
   ```

Now, every time you hit "Update from eToro" or the AI logs a new piece of advice, `scripts/autosync.py` will silently commit and push your data to that private repository in the background.
