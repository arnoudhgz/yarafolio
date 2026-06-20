# 🖥️ The Dashboard Screens

YaraFolio features a local web interface that completely replaces complex spreadsheets. 

## 1. Advice Tab (Live Watchlist)
![Advice Tab Screenshot](images/advice_tab.png)

This is the core of the dashboard. It tracks all the stocks the AI has recommended.
- **Dynamic Tracking**: Automatically highlights whether an AI-advised stock has hit your custom "Buy Zone" (Green line) or dropped below your Stop-Loss line (Red line).
- **Deep-Dive Modals**: Click on any stock row to instantly view the AI's full research thesis, known risks, and an embedded price chart.

## 2. Positions Tab
![Positions Tab Screenshot](images/positions_tab.png)

Once you actually buy a stock on eToro, the `import` script detects it and moves it here. 
- Tracks your **Realized** and **Unrealized (Open)** P/L specifically for AI-advised lots.
- Preserves the history of every single lot forever.

## 3. Portfolio Tab
![Portfolio Tab Screenshot](images/portfolio_tab.png)

A complete sync of your eToro holdings.
- **Sector Analytics**: Visualizes your entire portfolio in a pie chart to instantly expose "Sector Gaps". If you are dangerously underweighted in Healthcare, the dashboard will highlight it in <span style="color:#ef4444;font-weight:600">Red</span> or <span style="color:#f59e0b;font-weight:600">Orange</span>.

## 4. Analytics Tab
![Analytics Tab Screenshot](images/analytics_tab.png)

Once you start closing positions (or after 7 days have passed), this tab analyzes the AI's win rate. It buckets performance by:
- Rating (A, B, C)
- RSI Band (How oversold was it?)
- Sector
- Source (Advice vs Diversify)

## Features Available on Every Screen
- **Live Market Timers**: A built-in countdown clock synced exactly to the New York Stock Exchange (NYSE) trading hours, tracking the Pre-Market, Open Session, and After-Hours.
- **Location Switcher**: A dropdown menu allowing you to swap between your Home or Office eToro API keys on the fly.
