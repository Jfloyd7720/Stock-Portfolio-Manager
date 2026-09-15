# Northstar Markets 📈

A polished React trading-terminal style dashboard for exploring a paper portfolio, tracking a watchlist, and visualising simulated market data.

## Highlights

- Dark, terminal-inspired UI with responsive layout
- Portfolio value, buying power and risk cards
- Interactive stock watchlist and selected-ticker chart
- Paper-trade button with simulated order feedback
- Holdings allocation and portfolio concentration insight
- No real brokerage integration and no live trading

## Stack

React 19 · Vite · Ant Design · Chart.js · Yahoo Finance tooling

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in your terminal.

## Environment

Copy `.env.example` to `.env.local` if you add a market-data provider. Never commit real API keys. The current dashboard uses simulated values, so it works without credentials.

## Disclaimer

This project is for education and portfolio-development purposes. It is a paper-trading interface and does not provide investment advice or execute real trades.
