# Personal Trading Strategy

## Strategy parameters

| Parameter | Value |
|---|---|
| Broker | eToro |
| Batch size | $1000 per position |
| Trailing stop loss | Use a multiple of Average True Range (e.g., 2x ATR) instead of a fixed percentage to allow for normal volatility. Start trailing around +5% profit. |
| Minimum stock price | $20 |
| Minimum daily volume | > 500k shares |
| Focus | Oversold stocks with bounce potential (RSI between 15 and 30, confirm entry with a positive MACD histogram reversal/crossover). |
| Technical Confirmation | Verify stabilization by closing back inside the lower Bollinger Band, and demand Volume Confirmation / rising OBV to ensure institutional support. |
| Quality metrics (Buffett Moat) | High ROE (> 15%), Low Debt-to-Equity (< 0.5), FCF Yield > 5%. |
| Financial Health (Piotroski) | Piotroski F-Score >= 7 (Strong financial trend, not a dying company). |
| Bankruptcy Risk (Altman Z) | Altman Z-Score > 2.99 (Safe Zone, minimal risk of bankruptcy within 2 years). |
| Fraud Detection (Beneish M) | Beneish M-Score < -1.78 (Mathematically unlikely to be a manipulator). |
| Value metrics (Greenblatt & GARP) | High Earnings Yield (EBIT/EV), High ROIC, PEG Ratio < 1.5. |
| Catalyst metrics (Lynch) | Strong Shareholder Yield (Share Buybacks) or active Insider Buying. |

## Learned strategy rules

*(Populated automatically by the `/review` workflow based on your trading outcomes. Add your own sector biases or risk rules here.)*

- **Volume Confirmation (OBV):** Reject any oversold bounces that occur on low or weak volume. Mandate that the reversal is accompanied by a massive green volume spike or rising On-Balance Volume (OBV) to confirm institutional buying.
- **Bollinger Bands (Mean Reversion):** Wait for the price to pierce the lower Bollinger Band and then close back inside it before entering a trade. This structural signal proves the free-fall has stopped and stabilization has begun.
- **Buffett Quality Matrix:** To combine high upside with market stability, researchers must reject value traps that lack a competitive moat. An oversold stock must demonstrate high and consistent margins (ROE > 15%), low financial leverage, and strong cash generation.
- **Piotroski & Altman Z:** Since the strategy buys heavily beaten-down stocks, survival is key. Seek out companies with an F-Score of 7 or higher. Require a Z-Score > 2.99 for industrial/manufacturing stocks to ensure balance sheet strength.
- **Beneish M-Score (Fraud Detection):** Use as a hard veto. If an oversold stock flags a high M-Score (> -1.78), drop it immediately to avoid catching falling knives manipulated by accounting fraud.
- **Time-based stop (Watchlist only):** The strategy relies on quick oversold bounces. If a "watching" pick has not bounced within 3 days, it should be dropped from the watchlist. (Do not apply to open 'bought' positions; we do not sell in the red).
- **Position Sizing:** Only average down if the stock has dropped at least 25% from the first entry and the RSI has fallen back into the 15-30 range.
- **Cluster Risk:** Treat highly correlated clusters (e.g. cloud/software) as a single exposure block. Do not add new names to a saturated cluster.
- **Earnings Risk:** Avoid initiating new positions in oversold stocks if they report earnings within the next 7 days, to avoid unpredictable binary risk.
- **Avoid IPOs:** De-prioritize the `ipos` tactic and completely avoid recommending new IPOs (including SPACs and PE-style rollups). They are too volatile and lack a clear trading range or established RSI baseline. Only consider them if explicitly requested.
