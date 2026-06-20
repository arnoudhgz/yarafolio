# 🛠️ Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone git@github.com:arnoudhgz/assisted-stock-advice.git
   cd assisted-stock-advice
   ```

2. **Set up your environment variables (eToro API)**:
   Create a `.env` file in the root of the project. Copy the `.env.sample` to get started:
   ```bash
   cp .env.sample .env
   ```
   *Follow the instructions inside the `.env` file to retrieve your keys from `https://www.etoro.com/settings/trade`.*

   **Important eToro Setup Details:**
   - **Read-Only**: YaraFolio only provides advice; it does not execute trades. When generating your eToro API Key, **always create it in Read-Only mode** for maximum security.
   - **IP Addresses**: eToro User Keys are bound to specific IP addresses. If you use the dashboard from different locations (e.g., Home vs. Office), you must generate separate User Keys for each IP. You can specify these in your `.env` file with suffixes like `ETORO_USER_KEY_HOME` and `ETORO_USER_KEY_OFFICE`, which will automatically enable a location-switcher dropdown in the dashboard!

3. **Configure Auto-Sync for your Private Data (Highly Recommended)**:
   By default, your logs and portfolio snapshots are saved locally to `data/private/*.json`. To prevent data loss, the dashboard includes a fire-and-forget auto-sync script. 
   - Create a separate, new GitHub repository to store your data and set the SSH URL as `PRIVATE_DATA_REPO` in your `.env` file.
   - Set `STOCKS_AUTOSYNC=1` in your `.env` to enable automatic pushing.
   - **CRITICAL WARNING:** Ensure the repository you create for this is explicitly set to **PRIVATE**. Your `data/private/` folder contains your personal financial holdings and history. Do not sync this data to a public repository!

4. **Provide mock data (Optional, for testing)**:
   If you don't want to start with a blank slate, you can set `DEMO_MODE=1` in your `.env` file. This tells the system to automatically load the provided sample data from the `data/sample/` directory instead of using your personal data in `data/private/`.

5. **Run the Dashboard**:
   Start the local python server:
   ```bash
   python3 serve.py
   ```
   The dashboard will automatically open in your default browser at `http://127.0.0.1:8742/dashboard.html`.

   *Note: The port defaults to 8742. You can configure this by adding `PORT=8080` to your `.env` file.*

6. **Stop or Restart**:
   To stop the server, go back to your terminal and press `Ctrl+C`. To restart, simply run `python3 serve.py` again.
