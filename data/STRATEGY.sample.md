# Personal Trading Strategy

## Strategy parameters

| Parameter | Value |
|---|---|
| Broker | [e.g., eToro, Robinhood, IBKR] |
| Batch size | [e.g., $600 per position] |
| Trailing stop loss | [e.g., Start around +5% profit] |
| Minimum stock price | [e.g., $20] (applies to all skills) |
| Minimum daily volume | [e.g., > 500k shares] |
| Focus | Oversold stocks with bounce potential (prefer RSI 20-30, strictly avoid RSI < 20) |
| Bearish / geopolitical stress | Switch to defensive picks (staples, healthcare, utilities, defense) |

## Learned strategy rules

*(Populated automatically by the `/review` workflow based on your trading outcomes. Add your own sector biases or risk rules here.)*

- Never add a ticker to the dashboard/advice when we already have two open positions for it, or when it is blacklisted in the advice log.
- [e.g., Only average down if the stock has dropped at least 10%.]
- [e.g., Avoid initiating new positions if earnings are within 7 days.]
- [e.g., Never exceed 25% portfolio allocation in a single sector.]
