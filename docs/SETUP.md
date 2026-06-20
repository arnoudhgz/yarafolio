# 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone git@github.com:yourusername/assisted-stock-advice.git
   cd assisted-stock-advice
   ```

2. **Set up your environment variables**:
   Create a `.env` file in the root of the project to securely store your eToro API key. Copy the `.env.sample` to get started:
   ```bash
   cp .env.sample .env
   ```
   *Follow the instructions inside the `.env` file to retrieve your keys from `https://www.etoro.com/settings/trade`.*

3. **Provide mock data (Optional, for testing)**:
   If you don't want to start with a blank slate, you can set `DEMO_MODE=1` in your `.env` file. This tells the system to automatically load the provided sample data from the `data/sample/` directory instead of using your personal data in `data/private/`.

4. **Run the Dashboard**:
   Start the local python server:
   ```bash
   python3 serve.py
   ```
   The dashboard will automatically open in your default browser at `http://127.0.0.1:8742/dashboard.html`.

   *Note: The port defaults to 8742. You can configure this by adding `PORT=8080` to your `.env` file.*

5. **Stop or Restart**:
   To stop the server, go back to your terminal and press `Ctrl+C`. To restart, simply run `python3 serve.py` again.

## ⚠️ Disclaimer & Scraping Considerations
This tool includes a lightweight Python scraper (`scripts/screen.py`) designed to fetch live quotes and news from public sources like Yahoo Finance. 

**Is this safe to use?**
Yes, but use it responsibly. This dashboard is intended for **local, personal use**. Because it only fetches data sporadically when you click "Refresh" or ask the AI to run an advice check, it perfectly mimics normal human web traffic. 

However, if you attempt to deploy this on a cloud server and spam refresh every 2 seconds, financial websites *will* rate-limit or temporarily block your IP. Keep it local, keep it reasonable, and it will run flawlessly!

*Note: This software is for informational purposes only. Do your own research before executing any financial trades.*
