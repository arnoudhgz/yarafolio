# 🛠️ Installation & Setup

## Prerequisites
Before you begin, ensure that your system has **Python 3** installed (minimum version 3.9). You can check this by running `python3 --version` in your terminal. All background tasks and local API endpoints rely on Python.

## Clone or Fork the repository
- **To just check it out:** Clone my repository directly to test it in demo mode.
  ```bash
  git clone git@github.com:arnoudhgz/yarafolio.git
  cd yarafolio
  ```
- **To really use it:** Click the **Fork** button on GitHub first to create your own copy of the repository.

## Configure Your Personal Strategy
Your personal trading parameters (like batch sizes, trailing stop targets, and sector biases) are stored in a private file so they aren't accidentally pushed back to GitHub.
Copy the sample template to get started:
```bash
cp data/sample/STRATEGY.md data/private/STRATEGY.md
```
Open `data/private/STRATEGY.md` and customize the parameters to fit your trading style!

## Set up your environment variables (eToro API)
Create a `.env` file in the root of the project. Copy the `.env.sample` to get started:
```bash
cp .env.sample .env
```
*Follow the instructions inside the `.env` file to retrieve your keys from [https://www.etoro.com/settings/trade](https://www.etoro.com/settings/trade).*

**Important eToro Setup Details:**
- **Read-Only**: YaraFolio only provides advice and insights; it does not execute trades. When generating your eToro API Key, **always create it in Read-Only mode** for maximum security.
- **IP Addresses**: While not strictly required, it is **strongly recommended** to bind your eToro User Keys to specific IP addresses for security. If you do this and use the dashboard from different locations (e.g., Home vs. Office), you should generate separate User Keys for each IP. You can specify these in your `.env` file with suffixes like `ETORO_USER_KEY_HOME` and `ETORO_USER_KEY_OFFICE`, which will automatically enable a location-switcher dropdown in the dashboard!
  - **CLI Note**: The command-line scripts (like `scripts/etoro_import.py`) look for a default `ETORO_USER_KEY`. You must provide this default key in your `.env` file. If you want a script to use one of your suffix keys instead, you must set the environment variable in your terminal first (e.g., `export ETORO_SUFFIX=HOME`).

## Configure Auto-Sync for your Private Data (Highly Recommended)
By default, your logs and portfolio snapshots are saved locally to `data/private/*.json`. To prevent data loss, the dashboard includes a fire-and-forget auto-sync script. 
- Create a separate, new GitHub repository to store your data and set the SSH URL as `PRIVATE_DATA_REPO` in your `.env` file.
- Set `STOCKS_AUTOSYNC=1` in your `.env` to enable automatic pushing.
- **CRITICAL WARNING:** Ensure the repository you create for this is explicitly set to **PRIVATE**. Your `data/private/` folder contains your personal financial holdings and history. Do not sync this data to a public repository!

## Provide mock data (Optional, for testing)
If you don't want to start with a blank slate, you can set `DEMO_MODE=1` in your `.env` file. This tells the system to automatically load the provided sample data from the `data/sample/` directory instead of using your personal data in `data/private/`.

## Run YaraFolio
Start YaraFolio:
```bash
python3 yarafolio.py
```
The dashboard will automatically open in your default browser at `http://127.0.0.1:8742/dashboard.html`.

*Note: The port defaults to 8742. You can configure this by adding `PORT=<PORTNUMBER>` to your `.env` file.*

## Stop or Restart
To stop YaraFolio, go back to your terminal and press `Ctrl+C`. To restart, simply run `python3 yarafolio.py` again.
