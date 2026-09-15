const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

export const INTERVALS = [
  { value: '1m', label: '1m', range: '7d', note: 'Yahoo limits 1-minute history to a short rolling window.' },
  { value: '5m', label: '5m', range: '60d', note: 'Free source limit: roughly 60 days.' },
  { value: '15m', label: '15m', range: '60d', note: 'Free source limit: roughly 60 days.' },
  { value: '30m', label: '30m', range: '60d', note: 'Free source limit: roughly 60 days.' },
  { value: '1h', label: '1h', range: '730d', note: 'Free source availability varies by ticker.' },
  { value: '4h', label: '4h', range: '5y', note: 'Built by aggregating 1-hour bars.' },
  { value: '1d', label: 'Daily', range: '5y', note: 'Five-year historical window.' },
  { value: '1wk', label: 'Weekly', range: '5y', note: 'Five-year historical window.' },
  { value: '1mo', label: 'Monthly', range: '5y', note: 'Five-year historical window.' },
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function fetchBars(symbol, interval = '1d') {
  const meta = INTERVALS.find(item => item.value === interval) || INTERVALS[6]
  let range = meta.range
  if (interval === '1h') range = '730d'
  if (interval === '4h') range = '730d'
  const url = `${YAHOO}/${encodeURIComponent(symbol.toUpperCase())}?range=${range}&interval=${interval}&events=div%2Csplits&includeAdjustedClose=true`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Market data request failed (${response.status})`)
  const json = await response.json()
  const result = json?.chart?.result?.[0]
  if (!result?.timestamp?.length) throw new Error(`No ${interval} historical data was returned for ${symbol.toUpperCase()}.`)
  const quote = result.indicators?.quote?.[0] || {}
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || []
  return result.timestamp.map((timestamp, index) => ({
    time: timestamp * 1000,
    open: Number(quote.open?.[index]),
    high: Number(quote.high?.[index]),
    low: Number(quote.low?.[index]),
    close: Number(quote.close?.[index]),
    volume: Number(quote.volume?.[index] || 0),
    adjustedClose: Number(adjusted[index] ?? quote.close?.[index]),
  })).filter(bar => [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
}

export function aggregateTo4h(bars) {
  if (!bars.length) return []
  const bucketMs = 4 * 60 * 60 * 1000
  const buckets = new Map()
  bars.forEach(bar => {
    const key = Math.floor(bar.time / bucketMs) * bucketMs
    const current = buckets.get(key)
    if (!current) buckets.set(key, { time: key, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume })
    else {
      current.high = Math.max(current.high, bar.high)
      current.low = Math.min(current.low, bar.low)
      current.close = bar.close
      current.volume += bar.volume
    }
  })
  return [...buckets.values()]
}

export async function loadBars(symbol, interval) {
  if (interval !== '4h') return fetchBars(symbol, interval)
  const hourly = await fetchBars(symbol, '1h')
  await sleep(50)
  return aggregateTo4h(hourly)
}
