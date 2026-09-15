import { useMemo, useState } from 'react'
import './App.css'

const stocks = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 184.92, change: 4.82, sector: 'Semiconductors', shares: 18 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', price: 511.14, change: 1.36, sector: 'Software', shares: 9 },
  { symbol: 'AAPL', name: 'Apple Inc.', price: 236.78, change: -0.74, sector: 'Consumer Tech', shares: 14 },
  { symbol: 'AMZN', name: 'Amazon.com', price: 228.41, change: 2.18, sector: 'E-Commerce', shares: 7 },
  { symbol: 'META', name: 'Meta Platforms', price: 764.25, change: -1.12, sector: 'Social Media', shares: 3 },
  { symbol: 'TSLA', name: 'Tesla Inc.', price: 341.62, change: 3.44, sector: 'Automotive', shares: 5 },
]
const chartPoints = [41,44,42,48,45,53,50,58,56,61,57,66,64,72,69,76,74,82,79,88,86,94]
const money = (value) => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP',maximumFractionDigits:0}).format(value)

function Sparkline({ positive = true }) {
  const points = positive ? '0,24 12,21 24,23 36,16 48,18 60,10 72,12 84,4 96,7' : '0,7 12,5 24,11 36,8 48,14 60,12 72,20 84,17 96,24'
  return <svg className="sparkline" viewBox="0 0 96 28" preserveAspectRatio="none"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function PriceChart() {
  const points = chartPoints.map((y,i)=>`${i*5.7},${100-y}`).join(' ')
  return <svg className="price-chart" viewBox="0 0 120 100" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopOpacity=".28"/><stop offset="100%" stopOpacity="0"/></linearGradient></defs><line x1="0" y1="25" x2="120" y2="25" className="gridline"/><line x1="0" y1="50" x2="120" y2="50" className="gridline"/><line x1="0" y1="75" x2="120" y2="75" className="gridline"/><polygon points={`0,100 ${points} 120,100`} fill="url(#chartFill)"/><polyline points={points} fill="none" className="chart-line"/><circle cx="120" cy="6" r="2.2" className="chart-dot"/></svg>
}

function App() {
  const [selected,setSelected] = useState('NVDA')
  const [range,setRange] = useState('1M')
  const [cash,setCash] = useState(12480)
  const [watchlist,setWatchlist] = useState(['NVDA','MSFT','AAPL','TSLA'])
  const [toast,setToast] = useState('')
  const active = stocks.find(s=>s.symbol===selected) ?? stocks[0]
  const holdings = useMemo(()=>stocks.map(s=>({...s,value:s.price*s.shares})),[])
  const invested = holdings.reduce((sum,s)=>sum+s.value,0)
  const total = invested+cash
  const dayMove = holdings.reduce((sum,s)=>sum+s.value*(s.change/100),0)
  const toggleWatch = (symbol) => setWatchlist(items=>items.includes(symbol)?items.filter(i=>i!==symbol):[...items,symbol])
  const simulateTrade = () => { const cost=active.price*2; setCash(v=>Math.max(0,v-cost)); setToast(`Paper trade: bought 2 ${active.symbol} shares for ${money(cost)}`); window.setTimeout(()=>setToast(''),2600) }

  return <main className="app-shell">
    {toast && <div className="toast">✓ {toast}</div>}
    <header className="topbar"><div className="brand"><span className="brand-mark">↗</span><span>Northstar</span><small>MARKETS</small></div><nav><a className="active">Terminal</a><a>Portfolio</a><a>Watchlist</a><a>Research</a></nav><div className="market-status"><span className="pulse"/> US MARKET <b>OPEN</b><button className="avatar">JF</button></div></header>
    <section className="hero"><div><p className="eyebrow">PERSONAL TRADING TERMINAL</p><h1>Good morning, Jeff.</h1><p className="subtle">Your portfolio is outperforming the market today.</p></div><button className="trade-btn" onClick={simulateTrade}>＋ Paper trade</button></section>
    <section className="metrics">
      <article className="metric-card"><span>Portfolio value</span><strong>{money(total)}</strong><em className="positive">+{money(dayMove)} today</em><Sparkline/></article>
      <article className="metric-card"><span>Invested capital</span><strong>{money(invested)}</strong><em>76.8% deployed</em><div className="progress"><i style={{width:'76.8%'}}/></div></article>
      <article className="metric-card"><span>Buying power</span><strong>{money(cash)}</strong><em className="positive">+2.4% this week</em><Sparkline/></article>
      <article className="metric-card"><span>Risk score</span><strong>62 <small>/ 100</small></strong><em>Moderate</em><div className="risk"><i style={{width:'62%'}}/></div></article>
    </section>
    <section className="workspace">
      <div className="panel chart-panel"><div className="panel-head"><div className="stock-title"><span className="ticker-badge">{active.symbol.slice(0,2)}</span><div><h2>{active.symbol}</h2><p>{active.name}</p></div></div><button className={`star ${watchlist.includes(active.symbol)?'saved':''}`} onClick={()=>toggleWatch(active.symbol)}>★</button></div><div className="quote"><strong>{money(active.price)}</strong><span className={active.change>=0?'positive':'negative'}>{active.change>=0?'+':''}{active.change}%</span><span className="muted">Today</span></div><div className="chart-wrap"><div className="y-labels"><span>200</span><span>190</span><span>180</span><span>170</span></div><PriceChart/></div><div className="range-row">{['1D','1W','1M','3M','1Y'].map(item=><button key={item} className={range===item?'range active':'range'} onClick={()=>setRange(item)}>{item}</button>)}<span className="chart-note">Simulated market data · {range}</span></div></div>
      <div className="panel watch-panel"><div className="panel-head"><div><p className="eyebrow">LIVE WATCHLIST</p><h2>Markets</h2></div><span className="count">{watchlist.length}</span></div><div className="watch-list">{stocks.filter(s=>watchlist.includes(s.symbol)).map(stock=><button className={`watch-row ${selected===stock.symbol?'selected':''}`} key={stock.symbol} onClick={()=>setSelected(stock.symbol)}><span className="mini-logo">{stock.symbol.slice(0,2)}</span><span className="watch-name"><b>{stock.symbol}</b><small>{stock.sector}</small></span><Sparkline positive={stock.change>=0}/><span className="watch-price"><b>{money(stock.price)}</b><small className={stock.change>=0?'positive':'negative'}>{stock.change>=0?'+':''}{stock.change}%</small></span></button>)}</div></div>
    </section>
    <section className="bottom-grid">
      <div className="panel holdings-panel"><div className="panel-head"><div><p className="eyebrow">ALLOCATION</p><h2>Portfolio holdings</h2></div><span className="muted">{holdings.length} positions</span></div><div className="table">{holdings.map(stock=><button className="holding-row" key={stock.symbol} onClick={()=>setSelected(stock.symbol)}><span className="mini-logo">{stock.symbol.slice(0,2)}</span><span><b>{stock.symbol}</b><small>{stock.shares} shares</small></span><span className="bar"><i style={{width:`${Math.min(100,(stock.value/invested)*100*2.2)}%`}}/></span><span><b>{money(stock.value)}</b><small className={stock.change>=0?'positive':'negative'}>{stock.change>=0?'+':''}{stock.change}%</small></span></button>)}</div></div>
      <div className="panel insight-panel"><p className="eyebrow">NORTHSTAR INSIGHT</p><h2>Concentration is your edge — and your risk.</h2><p className="insight-copy">Semiconductors and software make up a large share of your portfolio. Strong momentum is helping returns, but a sector rotation could increase drawdown.</p><div className="sector"><span>Tech concentration</span><b>58%</b><div><i style={{width:'58%'}}/></div></div><div className="insight-footer"><span>Suggested action</span><b>Review diversification</b></div></div>
    </section>
    <footer><span>Northstar Markets · Paper trading only</span><span>Data shown for demonstration · No investment advice</span></footer>
  </main>
}
export default App
