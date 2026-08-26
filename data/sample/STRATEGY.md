# Personal Trading Strategy

## Strategy parameters

(See data/private/STRATEGY.md for actual trading parameters. Provide dummy thresholds here if publishing a public version, but never commit personal thresholds.)

## Learned strategy rules

- Flag falling-knife and value-trap risks explicitly in the Rating or Risk column. 
- Time-based stop (Watchlist only): The strategy relies on quick oversold bounces. If a "watching" pick has not bounced within 3 days, it should be dropped from the watchlist. (Do not apply to open 'bought' positions; we do not sell in the red).
- **Volume Confirmation (OBV):** Reject any oversold bounces that occur on low or weak volume. Mandate that the reversal is accompanied by a massive green volume spike or rising On-Balance Volume (OBV) to confirm institutional buying.
- **Bollinger Bands (Mean Reversion):** Wait for the price to pierce the lower Bollinger Band and then close back inside it before entering a trade. This structural signal proves the free-fall has stopped and stabilization has begun.
- **Buffett Quality Matrix:** To combine high upside with market stability, researchers must reject value traps that lack a competitive moat. An oversold stock must demonstrate high and consistent margins (ROE > 15%), low financial leverage (Debt/Equity < 0.5), and strong cash generation (FCF Yield > 5%) to be considered a quality bounce setup.
- **Piotroski F-Score (Bankruptcy Defense):** Since we buy heavily beaten-down stocks, survival is key. Seek out companies with an F-Score of 7 or higher, indicating improving liquidity and profitability year-over-year. Reject anything below 4 as a dying asset.
- **Altman Z-Score (Absolute Credit Strength):** Use alongside Piotroski. Require a Z-Score > 2.99 (Safe Zone) for industrial/manufacturing stocks to ensure they have the absolute balance sheet strength to survive the selloff.
- **Beneish M-Score (Fraud Detection):** Use as a hard veto. If an oversold stock flags a high M-Score (> -1.78), drop it immediately. Do not catch falling knives if the math suggests the company is actively manipulating its earnings.
- **Greenblatt Magic Formula:** Look for companies that are objectively cheap relative to their cash generation (High Earnings Yield: EBIT/EV) while maintaining high Return on Invested Capital (ROIC).
- **Growth At a Reasonable Price (GARP):** Avoid stocks with extreme trailing valuations unless forward growth justifies it (PEG ratio < 1.5).
- **The Lynch "Cannibal" Factor:** If a stock is crashing but management is aggressively buying back shares or executives are buying on the open market, it is a massive bullish signal and overrides minor technical flaws.
- **Permanent Holds:** Never recommend closing `QYLD` under any circumstances (including EOD or trailing stops); it is a permanent hold for dividend yield.
- Never add a ticker to the dashboard/advice when we already have two open positions for it, or when it is blacklisted in the advice log.
- Only open a second position (average down) if the stock has dropped at least 40% from the first entry and the RSI has fallen back into the 15-30 range.
- Avoid initiating new positions in oversold stocks if they report earnings within the next 7 days, to avoid unpredictable binary risk (does not apply to `/earnings`).
- Never exceed 25% total portfolio allocation in a single sector, and never exceed 10% allocation in a single stock.
- **Cluster Risk:** Treat highly correlated clusters (e.g. cloud/software) as a single exposure block. Do not add new names to a saturated cluster.
- **Avoid Momentum:** De-prioritize the `momentum` tactic and completely avoid recommending new momentum trades (RSI > 70). They consistently catch tops and underperform.
- **Market Rotation (Test Batch):** The outright ban on market-rotation has been lifted to gather fresh data. You may recommend market-rotation trades, but they must strictly adhere to the A/B rating constraints and require high conviction.
- **Avoid IPOs:** De-prioritize the `ipos` tactic and completely avoid recommending new IPOs (including SPACs and PE-style rollups). They are too volatile and lack a clear trading range or established RSI baseline. Only consider them if explicitly requested.
- **Price Action > News Headlines:** When determining macro posture or sector rotation, real-time price action and index momentum strictly override news headlines. Do not build a bearish/defensive thesis on a scary headline if the Nasdaq/S&P 500 is actively rallying that day.
- **Utilities Exemption:** Relax the strict Debt-to-Equity (< 0.5) and Altman Z-Score (> 2.99) requirements specifically for stocks in the Utilities sector, recognizing that their naturally capital-intensive and regulated structures inherently run with higher safe leverage and lower Z-Scores.
