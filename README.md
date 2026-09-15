# Backtest Lab 📊

A beginner-friendly historical trading terminal for US equities. Load real historical OHLCV data, inspect candlesticks, replay the tape one candle at a time, place simulated trades, build indicator rules visually, and measure strategy performance.

## What is included

- US stock ticker search
- Daily/weekly/monthly history plus free-source intraday intervals where available
- Candlestick chart with EMA 20, SMA 50 and EMA 200 overlays
- Historical chart replay mode with a candle-by-candle slider
- Paper order ticket: long/short, market/limit/stop, sizing, leverage, stop loss, take profit, slippage and commissions
- Visual strategy builder using Price, SMA, EMA, RSI and ATR rules
- Event-driven backtesting with next-bar execution to reduce look-ahead bias
- Performance report: net P&L, return, win rate, profit factor, max drawdown, Sharpe, Sortino, expectancy, fees and average win/loss
- Per-session simulated trade ledger
- No login, no brokerage integration, no real-money execution

## Free-data limitation

The app deliberately does **not** claim that five years of free 1-minute candles are available. The browser uses Yahoo's public chart endpoint without a paid API key. Its intraday history is rolling/limited, while daily/weekly/monthly history supports the requested multi-year research window. The UI shows the source limitation instead of silently filling missing history with fake data.

Yahoo's current documentation is not a formal public developer SLA, so this adapter should be treated as a personal research/data-source integration. A future provider adapter can be added without rewriting the chart or backtest engine.

## Backtest assumptions

- Signals are evaluated using information available through the previous completed bar; entries execute at the next bar's open with configurable slippage.
- Commission and slippage are included in P&L.
- Stop loss and take profit are checked against each bar's high/low. If both are touched in the same candle, the stop is evaluated first as the conservative assumption.
- Results are simulations, not forecasts.

## Run locally

```bash
npm install
npm run dev
```

Then open the Vite URL shown in your terminal.

## Stack

React 19 · Vite · browser Fetch API · SVG charting · client-side backtest engine

## Disclaimer

This project is for education and research. It is 100% simulated and does not provide investment advice or execute real trades.
