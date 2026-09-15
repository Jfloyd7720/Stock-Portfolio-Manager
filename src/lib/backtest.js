const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export function sma(values, length) {
  return values.map((_, index) => index < length - 1 ? null : values.slice(index - length + 1, index + 1).reduce((a, b) => a + b, 0) / length)
}

export function ema(values, length) {
  const out = Array(values.length).fill(null)
  if (values.length < length) return out
  out[length - 1] = values.slice(0, length).reduce((a, b) => a + b, 0) / length
  const multiplier = 2 / (length + 1)
  for (let i = length; i < values.length; i += 1) {
    out[i] = (values[i] - out[i - 1]) * multiplier + out[i - 1]
  }
  return out
}

export function rsi(values, length = 14) {
  const out = Array(values.length).fill(null)
  if (values.length <= length) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= length; i += 1) {
    const d = values[i] - values[i - 1]
    gain += Math.max(d, 0)
    loss += Math.max(-d, 0)
  }
  let avgGain = gain / length
  let avgLoss = loss / length
  out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = length + 1; i < values.length; i += 1) {
    const d = values[i] - values[i - 1]
    avgGain = (avgGain * (length - 1) + Math.max(d, 0)) / length
    avgLoss = (avgLoss * (length - 1) + Math.max(-d, 0)) / length
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export function atr(bars, length = 14) {
  const tr = bars.map((bar, i) => i === 0
    ? bar.high - bar.low
    : Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - bars[i - 1].close),
      Math.abs(bar.low - bars[i - 1].close),
    ))
  return sma(tr, length)
}

function seriesForCondition(bars, condition) {
  const closes = bars.map(b => b.close)
  if (condition.indicator === 'price') return closes
  if (condition.indicator === 'sma') return sma(closes, Number(condition.period) || 20)
  if (condition.indicator === 'ema') return ema(closes, Number(condition.period) || 20)
  if (condition.indicator === 'rsi') return rsi(closes, Number(condition.period) || 14)
  if (condition.indicator === 'atr') return atr(bars, Number(condition.period) || 14)
  return closes
}

function compare(left, operator, right) {
  if (left == null || right == null || !Number.isFinite(left) || !Number.isFinite(right)) return false
  if (operator === '>') return left > right
  if (operator === '<') return left < right
  if (operator === '>=') return left >= right
  if (operator === '<=') return left <= right
  if (operator === '=') return Math.abs(left - right) < 1e-9
  return false
}

export function conditionIsTrue(bars, index, condition) {
  const series = seriesForCondition(bars, condition)
  const right = condition.rightType === 'indicator'
    ? seriesForCondition(bars, { indicator: condition.rightIndicator, period: condition.rightPeriod })[index]
    : condition.rightType === 'price'
      ? bars[index].close
      : Number(condition.value)
  return compare(series[index], condition.operator, right)
}

function allConditions(bars, index, conditions) {
  return conditions.length > 0 && conditions.every(condition => conditionIsTrue(bars, index, condition))
}

export function runBacktest(bars, settings) {
  const {
    initialCapital,
    riskPct,
    commissionPct,
    slippageBps,
    leverage,
    side = 'long',
    stopLossPct,
    takeProfitPct,
    conditions = [],
  } = settings

  let cash = initialCapital
  let position = null
  const trades = []
  const equity = []

  const slip = Number(slippageBps) / 10000
  const fee = Number(commissionPct) / 100
  const lev = Math.max(1, Number(leverage) || 1)
  const stopPct = Number(stopLossPct) / 100
  const targetPct = Number(takeProfitPct) / 100
  const barsSafe = Array.isArray(bars) ? bars : []

  const markEquity = (bar, index) => {
    const positionMarketValue = position ? position.qty * bar.close : 0
    equity.push({ time: bar.time, value: cash + positionMarketValue, index })
  }

  const closePosition = (bar, price, reason) => {
    if (!position) return

    const exitPrice = position.side === 'long'
      ? price * (1 - slip)
      : price * (1 + slip)
    const gross = position.side === 'long'
      ? (exitPrice - position.entryPrice) * position.qty
      : (position.entryPrice - exitPrice) * position.qty
    const exitFee = Math.abs(exitPrice * position.qty) * fee
    const pnl = gross - position.entryFee - exitFee

    cash += position.entryNotional + gross - exitFee
    trades.push({
      ...position,
      exitTime: bar.time,
      exitPrice,
      exitReason: reason,
      pnl,
      returnPct: position.entryNotional ? pnl / position.entryNotional * 100 : 0,
      fees: position.entryFee + exitFee,
      barsHeld: Math.max(1, Math.round((bar.time - position.entryTime) / 86400000)),
    })
    position = null
  }

  for (let i = 0; i < barsSafe.length; i += 1) {
    const bar = barsSafe[i]

    if (position) {
      const stop = position.side === 'long'
        ? position.entryPrice * (1 - stopPct)
        : position.entryPrice * (1 + stopPct)
      const target = position.side === 'long'
        ? position.entryPrice * (1 + targetPct)
        : position.entryPrice * (1 - targetPct)

      if (stopPct > 0 && (
        (position.side === 'long' && bar.low <= stop) ||
        (position.side === 'short' && bar.high >= stop)
      )) {
        closePosition(bar, stop, 'stop loss')
      } else if (targetPct > 0 && (
        (position.side === 'long' && bar.high >= target) ||
        (position.side === 'short' && bar.low <= target)
      )) {
        closePosition(bar, target, 'take profit')
      }
    }

    if (!position && i > 0 && allConditions(barsSafe, i - 1, conditions)) {
      const rawEntry = bar.open
      const entryPrice = side === 'long'
        ? rawEntry * (1 + slip)
        : rawEntry * (1 - slip)
      const allocation = clamp(Number(riskPct) / 100, 0.01, 1) * initialCapital * lev
      const qty = allocation / entryPrice
      const entryFee = Math.abs(entryPrice * qty) * fee
      const entryNotional = entryPrice * qty
      const requiredCash = entryNotional / lev + entryFee

      if (cash >= requiredCash) {
        cash -= requiredCash
        position = {
          side,
          qty,
          entryPrice,
          entryTime: bar.time,
          entryNotional,
          entryCash: entryNotional / lev,
          entryFee,
        }
      }
    }

    markEquity(bar, i)
  }

  if (position && barsSafe.length) {
    const lastBar = barsSafe[barsSafe.length - 1]
    closePosition(lastBar, lastBar.close, 'end of test')
  }

  const pnl = trades.reduce((sum, trade) => sum + trade.pnl, 0)
  const wins = trades.filter(trade => trade.pnl > 0)
  const losses = trades.filter(trade => trade.pnl <= 0)
  const grossProfit = wins.reduce((sum, trade) => sum + trade.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0))
  const values = equity.map(entry => entry.value)

  let peak = initialCapital
  let maxDrawdown = 0
  values.forEach(value => {
    peak = Math.max(peak, value)
    maxDrawdown = Math.max(maxDrawdown, peak ? (peak - value) / peak : 0)
  })

  const returns = values
    .slice(1)
    .map((value, index) => values[index] ? value / values[index] - 1 : 0)
    .filter(Number.isFinite)
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
    : 0
  const sharpe = variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(252) : 0
  const downside = returns.filter(returnValue => returnValue < 0)
  const downsideDev = downside.length
    ? Math.sqrt(downside.reduce((a, b) => a + b * b, 0) / downside.length)
    : 0
  const sortino = downsideDev ? mean / downsideDev * Math.sqrt(252) : 0

  return {
    trades,
    equity,
    metrics: {
      finalCapital: initialCapital + pnl,
      pnl,
      returnPct: initialCapital ? pnl / initialCapital * 100 : 0,
      winRate: trades.length ? wins.length / trades.length * 100 : 0,
      profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? Infinity : 0,
      expectancy: trades.length ? pnl / trades.length : 0,
      maxDrawdown: maxDrawdown * 100,
      sharpe,
      sortino,
      trades: trades.length,
      fees: trades.reduce((sum, trade) => sum + trade.fees, 0),
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? losses.reduce((sum, trade) => sum + trade.pnl, 0) / losses.length : 0,
    },
  }
}
