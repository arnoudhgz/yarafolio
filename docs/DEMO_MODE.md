# 🏗️ Architecture & Privacy (Why JSON?)

You might wonder why YaraFolio uses flat JSON files (`data/advice-log.json`) instead of a robust SQL database like Postgres or SQLite. 

1. **Zero Dependencies**: You can clone this repo and run it instantly without configuring Docker containers or database schemas.
2. **Human-Readable & Editable**: If a scrape goes wrong or you need to fix a typo, you can literally open the JSON file in a text editor and change it. 
3. **Git-Native Backups**: JSON diffs perfectly in Git. This allows for a completely decoupled backup system!

## 🔒 Keeping Your Data Private

Your personal trading data is heavily protected by `.gitignore`. It is physically impossible to accidentally push your real `data/*.json` files to this public repository. 

To give others a way to try out the dashboard, YaraFolio includes a **Demo Mode**.
By setting `DEMO_MODE=1` in your `.env` file, the entire system switches over to using `data/advice-log.sample.json`.

## 🔄 Automatic Backups (Private Repository)
You can configure YaraFolio to automatically commit and push your real JSON data to a totally separate, *private* GitHub repository every time a trade is updated. 

1. Create a private, empty repository on GitHub (e.g. `my-private-trading-data`).
2. Add the SSH URL to your `.env` file:
   ```bash
   PRIVATE_DATA_REPO=git@github.com:yourusername/my-private-trading-data.git
   ```

Now, every time you hit "Update from eToro" or the AI logs a new piece of advice, `scripts/autosync.py` will silently commit and push your data to that private repository in the background.
