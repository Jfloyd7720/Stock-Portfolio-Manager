import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { X, Plus, Play, Pause, StepForward, Square, History, Search, Download, RotateCcw } from "lucide-react";

// ===================== ENGINE (pure functions) =====================

// ---------- Timeframes ----------
const TIMEFRAMES = [
  { id: "1m", label: "1m", minutes: 1, intraday: true, barsPerYear: 252 * 390, historyDays: 7, yahoo: ["1m", "7d"], av: "1min" },
  { id: "5m", label: "5m", minutes: 5, intraday: true, barsPerYear: 252 * 78, historyDays: 60, yahoo: ["5m", "60d"], av: "5min" },
  { id: "15m", label: "15m", minutes: 15, intraday: true, barsPerYear: 252 * 26, historyDays: 60, yahoo: ["15m", "60d"], av: "15min" },
  { id: "30m", label: "30m", minutes: 30, intraday: true, barsPerYear: 252 * 13, historyDays: 60, yahoo: ["30m", "60d"], av: "30min" },
  { id: "1h", label: "1H", minutes: 60, intraday: true, barsPerYear: 252 * 7, historyDays: 730, yahoo: ["60m", "730d"], av: "60min" },
  { id: "4h", label: "4H", minutes: 240, intraday: true, barsPerYear: 252 * 2, historyDays: 730, yahoo: ["60m", "730d"], av: "60min", aggregateFrom1h: true },
  { id: "1D", label: "D", intraday: false, barsPerYear: 252, historyDays: 3650, yahoo: ["1d", "10y"], av: "DAILY" },
  { id: "1W", label: "W", intraday: false, barsPerYear: 52, historyDays: 7300, yahoo: ["1wk", "max"], av: "WEEKLY" },
  { id: "1M", label: "M", intraday: false, barsPerYear: 12, historyDays: 9125, yahoo: ["1mo", "max"], av: "MONTHLY" },
];

const tfById = (id) => TIMEFRAMES.find((t) => t.id === id);

// ---------- Time helpers (US Eastern) ----------
const DAY = 86400000;
function nthSunday(y, m, n) {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((7 - first) % 7) + (n - 1) * 7;
}

function isUSDST(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 2, nthSunday(y, 2, 2), 7); // 2am ET = 7am UTC
  const end = Date.UTC(y, 10, nthSunday(y, 10, 1), 6);
  return ts >= start && ts < end;
}

const etOffsetMs = (ts) => (isUSDST(ts) ? -4 : -5) * 3600000;
// Wall-clock ET fields for a UTC timestamp
function etParts(ts) {
  const d = new Date(ts + etOffsetMs(ts));
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
}

// UTC timestamp for an ET wall-clock time on a given calendar date
function etToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo, d, h, mi) + 5 * 3600000;
  return Date.UTC(y, mo, d, h, mi) - etOffsetMs(guess);
}

// ---------- RNG ----------
function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// ---------- Aggregation ----------
function aggregate(bars, keyFn) {
  const out = [];
  let cur = null, curKey = null;
  for (const b of bars) {
    const k = keyFn(b);
    if (k !== curKey) {
      if (cur) out.push(cur);
      cur = { ...b }; curKey = k;
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const weekKey = (b) => { const p = etParts(b.t); const day = Date.UTC(p.y, p.mo, p.d); return day - ((p.wd + 6) % 7) * DAY; };
const monthKey = (b) => { const p = etParts(b.t); return p.y * 12 + p.mo; };
const fourHourKey = (b) => { const p = etParts(b.t); const mins = p.h * 60 + p.mi - 570; return `${p.y}-${p.mo}-${p.d}-${Math.floor(Math.max(0, mins) / 240)}`; };
function to4h(hourly) { return aggregate(hourly, fourHourKey); }

// ---------- Demo data (seeded, clearly synthetic) ----------
function tradingDays(endTs, calendarDays) {
  const days = [];
  const endP = etParts(endTs);
  const endDay = Date.UTC(endP.y, endP.mo, endP.d);
  for (let t = endDay - calendarDays * DAY; t <= endDay; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) {
      const d = new Date(t);
      days.push({ y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate() });
    }
  }
  return days;
}

function demoDaily(ticker, now) {
  const r = mulberry32(hashStr(ticker.toUpperCase()));
  const days = tradingDays(now, 3650);
  let price = 15 + r() * 185;
  let drift = 0, vol = 0.018;
  const out = [];
  for (let i = 0; i < days.length; i++) {
    if (i % 60 === 0) {
      drift = (r() - 0.47) * 0.0018;
      vol = 0.009 + r() * 0.024;
    }
    const { y, mo, d } = days[i];
    const open = price * Math.exp(gauss(r) * vol * 0.3);
    const close = open * Math.exp(drift + gauss(r) * vol);
    const high = Math.max(open, close) * Math.exp(Math.abs(gauss(r)) * vol * 0.45);
    const low = Math.min(open, close) * Math.exp(-Math.abs(gauss(r)) * vol * 0.45);
    const volume = Math.round(2e6 * Math.exp(gauss(r) * 0.4) * (1 + vol * 20));
    out.push({ t: etToUtc(y, mo, d, 9, 30), open, high, low, close, volume, vol });
    price = close;
  }
  return out;
}

function demoIntraday(ticker, daily, minutes, calendarDays, now) {
  const r = mulberry32(hashStr(ticker.toUpperCase() + ":" + minutes));
  const cutoff = now - calendarDays * DAY;
  const perDay = Math.ceil(390 / minutes);
  // U-shaped volume profile
  const prof = Array.from({ length: perDay }, (_, k) => { const x = (k + 0.5) / perDay; return 0.6 + 2.2 * (x - 0.5) ** 2 * 4; });
  const profSum = prof.reduce((a, b) => a + b, 0);
  const out = [];
  for (const day of daily) {
    if (day.t < cutoff) continue;
    const lo = Math.log(day.open), lc = Math.log(day.close);
    const step = day.vol / Math.sqrt(perDay);
    const w = [0];
    for (let k = 1; k <= perDay; k++) w.push(w[k - 1] + gauss(r) * step);
    const path = w.map((x, k) => lo + x - (k / perDay) * (w[perDay] - (lc - lo)));
    for (let k = 0; k < perDay; k++) {
      const o = Math.exp(path[k]), c = Math.exp(path[k + 1]);
      const wig = step * 0.6;
      out.push({
        t: day.t + k * minutes * 60000,
        open: o, close: c,
        high: Math.max(o, c) * Math.exp(Math.abs(gauss(r)) * wig),
        low: Math.min(o, c) * Math.exp(-Math.abs(gauss(r)) * wig),
        volume: Math.round((day.volume * prof[k]) / profSum * Math.exp(gauss(r) * 0.25)),
      });
    }
  }
  return out;
}

function demoBars(ticker, tfId, now = Date.now()) {
  const tf = tfById(tfId);
  const daily = demoDaily(ticker, now);
  const strip = (arr) => arr.map(({ vol, ...b }) => b);
  if (tfId === "1D") return strip(daily);
  if (tfId === "1W") return aggregate(strip(daily), weekKey);
  if (tfId === "1M") return aggregate(strip(daily), monthKey);
  if (tfId === "4h") return to4h(demoIntraday(ticker, daily, 60, tf.historyDays, now));
  return demoIntraday(ticker, daily, tf.minutes, tf.historyDays, now);
}

// ---------- Live providers ----------
async function fetchYahoo(ticker, tfId, proxy) {
  const tf = tfById(tfId);
  const [interval, range] = tf.yahoo;
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${range}&includePrePost=false`;
  const url = proxy ? proxy + encodeURIComponent(target) : target;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo returned HTTP ${res.status}.`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "Yahoo returned no data for that ticker.");
  const q = result.indicators.quote[0];
  const bars = [];
  result.timestamp.forEach((s, i) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
    bars.push({ t: s * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] || 0 });
  });
  return tf.aggregateFrom1h ? to4h(bars) : bars;
}

async function fetchAlphaVantage(ticker, tfId, key) {
  const tf = tfById(tfId);
  if (!key) throw new Error("Add your free Alpha Vantage API key in the Data tab.");
  const intraday = tf.intraday;
  const fn = intraday ? "TIME_SERIES_INTRADAY" : `TIME_SERIES_${tf.av}`;
  const params = new URLSearchParams({ function: fn, symbol: ticker, apikey: key, datatype: "json" });
  if (intraday) { params.set("interval", tf.av); params.set("outputsize", "full"); }
  else if (tf.av === "DAILY") params.set("outputsize", "full");
  const res = await fetch(`https://www.alphavantage.co/query?${params}`);
  const json = await res.json();
  if (json["Error Message"]) throw new Error("Alpha Vantage: " + json["Error Message"]);
  if (json.Note || json.Information) throw new Error("Alpha Vantage: " + (json.Note || json.Information));
  const seriesKey = Object.keys(json).find((k) => k.includes("Time Series"));
  if (!seriesKey) throw new Error("Alpha Vantage returned no price series.");
  const bars = Object.entries(json[seriesKey]).map(([ts, v]) => {
    const [datePart, timePart = "09:30:00"] = ts.split(" ");
    const [y, mo, d] = datePart.split("-").map(Number);
    const [h, mi] = timePart.split(":").map(Number); // US/Eastern wall clock
    return { t: etToUtc(y, mo - 1, d, h, mi), open: +v["1. open"], high: +v["2. high"], low: +v["3. low"], close: +v["4. close"], volume: +v["5. volume"] || 0 };
  }).sort((a, b) => a.t - b.t)
    .filter((b) => { if (!intraday) return true; const p = etParts(b.t); const m = p.h * 60 + p.mi; const len = tf.aggregateFrom1h ? 60 : tf.minutes; return m < 960 && m + len > 570; });
  return tf.aggregateFrom1h ? to4h(bars) : bars;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) throw new Error("The CSV needs a header row and at least two rows of prices.");
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const find = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const iD = find("date", "datetime", "time", "timestamp"), iO = find("open"), iH = find("high"), iL = find("low");
  const iC = head.findIndex((h) => h === "close") >= 0 ? head.findIndex((h) => h === "close") : find("close", "adj close");
  const iV = find("volume", "vol");
  if ([iD, iO, iH, iL, iC].some((i) => i < 0)) throw new Error("CSV headers must include Date, Open, High, Low and Close.");
  const bars = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",").map((x) => x.trim().replace(/"/g, ""));
    const raw = c[iD];
    let t = /^\d{9,13}$/.test(raw) ? (raw.length <= 10 ? +raw * 1000 : +raw) : NaN;
    if (isNaN(t)) {
      const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
      if (m) t = etToUtc(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 9, m[5] ? +m[5] : 30);
      else t = Date.parse(raw);
    }
    const b = { t, open: +c[iO], high: +c[iH], low: +c[iL], close: +c[iC], volume: iV >= 0 ? +c[iV] || 0 : 0 };
    if (!isNaN(t) && [b.open, b.high, b.low, b.close].every((v) => isFinite(v) && v > 0)) bars.push(b);
  }
  if (bars.length < 2) throw new Error("No valid price rows were found in the CSV.");
  return bars.sort((a, b) => a.t - b.t);
}

// ---------- Indicators ----------
function sma(v, p) {
  const o = new Array(v.length).fill(null); let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= p) s -= v[i - p]; if (i >= p - 1) o[i] = s / p; }
  return o;
}

function ema(v, p) {
  const o = new Array(v.length).fill(null); const k = 2 / (p + 1); let e = 0, s = 0;
  for (let i = 0; i < v.length; i++) {
    if (i < p) { s += v[i]; if (i === p - 1) { e = s / p; o[i] = e; } }
    else { e = v[i] * k + e * (1 - k); o[i] = e; }
  }
  return o;
}

function rsi(c, p) {
  const o = new Array(c.length).fill(null); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const ch = c[i] - c[i - 1], up = Math.max(ch, 0), dn = Math.max(-ch, 0);
    if (i <= p) { g += up; l += dn; if (i === p) { g /= p; l /= p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
    else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  }
  return o;
}

function atr(bars, p) {
  const o = new Array(bars.length).fill(null); let a = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr = i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close));
    if (i < p) { a += tr; if (i === p - 1) { a /= p; o[i] = a; } }
    else { a = (a * (p - 1) + tr) / p; o[i] = a; }
  }
  return o;
}

function makeIndicatorCache(bars) {
  const closes = bars.map((b) => b.close);
  const cache = new Map();
  return (kind, period) => {
    const key = `${kind}:${period}`;
    if (cache.has(key)) return cache.get(key);
    let s;
    if (kind === "price") s = closes;
    else if (kind === "sma") s = sma(closes, period);
    else if (kind === "ema") s = ema(closes, period);
    else if (kind === "rsi") s = rsi(closes, period);
    else if (kind === "atr") s = atr(bars, period);
    else throw new Error("Unknown indicator " + kind);
    cache.set(key, s);
    return s;
  };
}

// ---------- Strategy conditions ----------
const OPERATORS = [
  { id: ">", label: ">" }, { id: "<", label: "<" }, { id: ">=", label: "≥" }, { id: "<=", label: "≤" }, { id: "==", label: "=" },
  { id: "xa", label: "crosses above" }, { id: "xb", label: "crosses below" },
];

const OPERAND_KINDS = [
  { id: "price", label: "Price" }, { id: "sma", label: "SMA" }, { id: "ema", label: "EMA" },
  { id: "rsi", label: "RSI" }, { id: "atr", label: "ATR" }, { id: "value", label: "Number" },
];

function operandAt(get, op, i) {
  if (op.kind === "value") return Number(op.value);
  const s = get(op.kind, op.kind === "price" ? 0 : Math.max(1, Math.round(op.period || 14)));
  return s[i];
}

function evalCondition(get, c, i) {
  const a = operandAt(get, c.left, i), b = operandAt(get, c.right, i);
  if (a == null || b == null || isNaN(a) || isNaN(b)) return false;
  switch (c.op) {
    case ">": return a > b;
    case "<": return a < b;
    case ">=": return a >= b;
    case "<=": return a <= b;
    case "==": return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 0.0005);
    case "xa": case "xb": {
      if (i < 1) return false;
      const pa = operandAt(get, c.left, i - 1), pb = operandAt(get, c.right, i - 1);
      if (pa == null || pb == null) return false;
      return c.op === "xa" ? pa <= pb && a > b : pa >= pb && a < b;
    }
    default: return false;
  }
}

function evalGroup(get, conds, logic, i) {
  if (!conds.length) return false;
  return logic === "any" ? conds.some((c) => evalCondition(get, c, i)) : conds.every((c) => evalCondition(get, c, i));
}

function warmupOf(strat) {
  let w = 1;
  for (const c of [...strat.entry, ...strat.exit]) for (const o of [c.left, c.right])
    if (o.kind !== "value" && o.kind !== "price") w = Math.max(w, (o.kind === "ema" ? 3 : 1) * (o.period || 14));
  return w + 1;
}

// ---------- Costs ----------
function commissionFor(cost, notional, qty) {
  return (cost.perTrade || 0) + ((cost.pct || 0) / 100) * notional + (cost.perShare || 0) * qty;
}

const slip = (price, bps, adverseUp) => price * (1 + (adverseUp ? 1 : -1) * (bps || 0) / 10000);

// ---------- Backtester ----------
function runBacktest(bars, strat, cfg, tfId) {
  const get = makeIndicatorCache(bars);
  const atrS = get("atr", cfg.atrPeriod || 14);
  const tf = tfById(tfId) || { barsPerYear: 252 };
  const dir = strat.direction === "short" ? -1 : 1;
  const start = Math.max(0, cfg.startIdx ?? 0), end = Math.min(bars.length - 1, cfg.endIdx ?? bars.length - 1);
  const warm = warmupOf(strat);
  let cash = cfg.capital;
  let pos = null, pendEntry = false, pendExit = false, blown = false, skipped = 0, barsInMarket = 0;
  const trades = [], curve = [], markers = [];

  const closePos = (rawPrice, i, reason, applySlip) => {
    const price = applySlip ? slip(rawPrice, cfg.slippageBps, dir < 0) : rawPrice;
    const notional = price * pos.qty;
    const fee = commissionFor(cfg.cost, notional, pos.qty);
    const gross = (price - pos.entry) * pos.qty * dir;
    cash += gross - fee;
    const pnl = gross - fee - pos.fee;
    trades.push({
      id: trades.length + 1, side: dir > 0 ? "long" : "short", entryTime: bars[pos.i].t, exitTime: bars[i].t,
      entryPrice: pos.entry, exitPrice: price, qty: pos.qty, reason, pnl, fees: fee + pos.fee,
      ret: (pnl / (pos.entry * pos.qty)) * 100, bars: i - pos.i, entryIdx: pos.i, exitIdx: i, sl: pos.sl, tp: pos.tp,
    });
    markers.push({ idx: i, price, kind: "exit", side: dir > 0 ? "long" : "short", win: pnl >= 0 });
    pos = null;
  };

  const openPos = (i) => {
    const price = slip(bars[i].open, cfg.slippageBps, dir > 0);
    const a = atrS[i - 1] ?? atrS[i];
    let sl = null, tp = null;
    if (cfg.sl.mode === "pct") sl = price * (1 - dir * cfg.sl.value / 100);
    if (cfg.sl.mode === "atr" && a) sl = price - dir * cfg.sl.value * a;
    const risk = sl != null ? Math.abs(price - sl) : null;
    if (cfg.tp.mode === "pct") tp = price * (1 + dir * cfg.tp.value / 100);
    if (cfg.tp.mode === "atr" && a) tp = price + dir * cfg.tp.value * a;
    if (cfg.tp.mode === "r" && risk) tp = price + dir * cfg.tp.value * risk;
    const eq = cash;
    let qty;
    const s = cfg.sizing;
    if (s.mode === "shares") qty = s.value;
    else if (s.mode === "fixedCash") qty = s.value / price;
    else if (s.mode === "riskPct" && risk) qty = (eq * s.value / 100) / risk;
    else qty = (eq * (s.mode === "pctEquity" ? s.value : 100) / 100) / price;
    const maxQty = (eq * cfg.leverage) / price / (1 + (cfg.cost.pct || 0) / 100);
    qty = Math.min(qty, maxQty);
    if (!cfg.fractional) qty = Math.floor(qty);
    else qty = Math.floor(qty * 10000) / 10000;
    if (!(qty > 0)) { skipped++; return; }
    const fee = commissionFor(cfg.cost, price * qty, qty);
    cash -= fee;
    pos = { entry: price, qty, sl, tp, i, fee };
    markers.push({ idx: i, price, kind: "entry", side: dir > 0 ? "long" : "short" });
  };

  let peak = cfg.capital;
  for (let i = start; i <= end; i++) {
    const b = bars[i];
    if (pos && pendExit) closePos(b.open, i, "Exit signal", true);
    pendExit = false;
    if (!pos && pendEntry && i >= start) openPos(i);
    pendEntry = false;

    if (pos) {
      const { sl, tp } = pos;
      const gapSL = sl != null && (dir > 0 ? b.open <= sl : b.open >= sl);
      const gapTP = tp != null && (dir > 0 ? b.open >= tp : b.open <= tp);
      const hitSL = sl != null && (dir > 0 ? b.low <= sl : b.high >= sl);
      const hitTP = tp != null && (dir > 0 ? b.high >= tp : b.low <= tp);
      if (pos.i !== i && gapSL) closePos(b.open, i, "Stop loss (gap)", true);
      else if (pos.i !== i && gapTP) closePos(b.open, i, "Take profit (gap)", false);
      else if (hitSL) closePos(sl, i, "Stop loss", true);           // SL assumed first when both touch
      else if (hitTP) closePos(tp, i, "Take profit", false);
    }

    const unreal = pos ? (b.close - pos.entry) * pos.qty * dir : 0;
    let eq = cash + unreal;
    if (pos) barsInMarket++;
    if (eq <= 0 && pos) { closePos(b.close, i, "Margin call", false); eq = cash; blown = true; }
    peak = Math.max(peak, eq);
    curve.push({ t: b.t, equity: eq, dd: peak > 0 ? (eq / peak - 1) * 100 : 0 });
    if (blown) break;

    if (i < end && i >= warm) {
      if (pos) { if (strat.exit.length && evalGroup(get, strat.exit, strat.exitLogic, i)) pendExit = true; }
      else if (evalGroup(get, strat.entry, strat.entryLogic, i)) pendEntry = true;
    }
  }
  if (pos) closePos(bars[end].close, end, "End of test", false);
  if (curve.length) curve[curve.length - 1].equity = cash;

  const stats = computeStats(trades, curve, cfg.capital, tf.barsPerYear);
  stats.buyHold = ((bars[end].close / bars[start].open) - 1) * 100 * dir;
  stats.exposure = curve.length ? (barsInMarket / curve.length) * 100 : 0;
  stats.skipped = skipped;
  stats.blown = blown;
  stats.bars = curve.length;
  return { trades, curve, markers, stats };
}

function computeStats(trades, curve, capital, barsPerYear) {
  const final = curve.length ? curve[curve.length - 1].equity : capital;
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
  const gw = wins.reduce((a, t) => a + t.pnl, 0), gl = losses.reduce((a, t) => a + t.pnl, 0);
  const rets = [];
  for (let i = 1; i < curve.length; i++) if (curve[i - 1].equity > 0) rets.push(curve[i].equity / curve[i - 1].equity - 1);
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)) : 0;
  const dd = rets.length ? Math.sqrt(rets.reduce((a, r) => a + Math.min(r, 0) ** 2, 0) / rets.length) : 0;
  let peak = capital, maxDD = 0, maxDDAbs = 0;
  for (const c of curve) { peak = Math.max(peak, c.equity); maxDD = Math.min(maxDD, c.equity / peak - 1); maxDDAbs = Math.min(maxDDAbs, c.equity - peak); }
  return {
    final, pnl: final - capital, ret: (final / capital - 1) * 100,
    trades: trades.length, winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: gl < 0 ? gw / -gl : gw > 0 ? Infinity : 0,
    maxDD: maxDD * 100, maxDDAbs,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(barsPerYear) : 0,
    sortino: dd > 0 ? (mean / dd) * Math.sqrt(barsPerYear) : 0,
    expectancy: trades.length ? (gw + gl) / trades.length : 0,
    fees: trades.reduce((a, t) => a + t.fees, 0),
    avgWin: wins.length ? gw / wins.length : 0,
    avgLoss: losses.length ? gl / losses.length : 0,
  };
}

// ---------- Paper trading account ----------
function newAccount(capital) {
  return { capital, balance: capital, positions: [], orders: [], trades: [], log: [], nextId: 1 };
}
function positionValue(p) { return p.entry * p.qty; }
function unrealized(p) { return (p.last - p.entry) * p.qty * (p.side === "long" ? 1 : -1); }
function accountEquity(a) { return a.balance + a.positions.reduce((s, p) => s + unrealized(p), 0); }
function marginUsed(a) { return a.positions.reduce((s, p) => s + positionValue(p) / p.leverage, 0); }

function fill(acc, o, rawPrice, bar, idx, cost, bps, useSlip) {
  const price = useSlip ? slip(rawPrice, bps, o.side === "long") : rawPrice;
  const notional = price * o.qty;
  const need = notional / o.leverage;
  const free = accountEquity(acc) - marginUsed(acc);
  const fee = commissionFor(cost, notional, o.qty);
  if (need + fee > free + 1e-9) {
    return { ...acc, log: [{ t: bar.t, text: `Rejected ${o.side} ${fmtQty(o.qty)} ${o.ticker}: needs $${(need + fee).toFixed(2)} margin, $${Math.max(0, free).toFixed(2)} free.` }, ...acc.log] };
  }
  const pos = { id: acc.nextId, ticker: o.ticker, side: o.side, qty: o.qty, entry: price, last: bar.close, entryTime: bar.t, entryIdx: idx, sl: o.sl, tp: o.tp, leverage: o.leverage, fee, orderType: o.type };
  return {
    ...acc, balance: acc.balance - fee, nextId: acc.nextId + 1, positions: [...acc.positions, pos],
    log: [{ t: bar.t, text: `Filled ${o.type} ${o.side} ${fmtQty(o.qty)} ${o.ticker} @ ${price.toFixed(2)}` }, ...acc.log],
  };
}

const fmtQty = (q) => (Number.isInteger(q) ? String(q) : q.toFixed(4).replace(/0+$/, ""));

function placeOrder(acc, o, bar, idx, cost, bps) {
  if (!(o.qty > 0)) return { ...acc, log: [{ t: bar.t, text: "Order not placed: quantity must be above zero." }, ...acc.log] };
  if (o.type === "market") return fill(acc, o, bar.close, bar, idx, cost, bps, true);
  const order = { ...o, id: acc.nextId, createdTime: bar.t };
  return { ...acc, nextId: acc.nextId + 1, orders: [...acc.orders, order], log: [{ t: bar.t, text: `Placed ${o.type} ${o.side} ${fmtQty(o.qty)} ${o.ticker} @ ${o.price.toFixed(2)}` }, ...acc.log] };
}

function closePosition(acc, id, rawPrice, bar, reason, cost, bps, useSlip) {
  const p = acc.positions.find((x) => x.id === id);
  if (!p) return acc;
  const price = useSlip ? slip(rawPrice, bps, p.side === "short") : rawPrice;
  const d = p.side === "long" ? 1 : -1;
  const fee = commissionFor(cost, price * p.qty, p.qty);
  const gross = (price - p.entry) * p.qty * d;
  const pnl = gross - fee - p.fee;
  const trade = {
    id: acc.trades.length + 1, ticker: p.ticker, side: p.side, entryTime: p.entryTime, exitTime: bar.t, entryPrice: p.entry, exitPrice: price,
    qty: p.qty, reason, pnl, fees: fee + p.fee, ret: (pnl / (p.entry * p.qty)) * 100, holdMs: bar.t - p.entryTime, leverage: p.leverage,
  };
  return {
    ...acc, balance: acc.balance + gross - fee, positions: acc.positions.filter((x) => x.id !== id), trades: [trade, ...acc.trades],
    log: [{ t: bar.t, text: `Closed ${p.side} ${fmtQty(p.qty)} ${p.ticker} @ ${price.toFixed(2)} (${reason}), P&L ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` }, ...acc.log],
  };
}

function cancelOrder(acc, id) {
  return { ...acc, orders: acc.orders.filter((o) => o.id !== id) };
}

// Advance the account through one newly revealed bar for a ticker.
function processBar(acc, ticker, bar, idx, cost, bps) {
  let a = acc;
  const existing = new Set(a.positions.map((p) => p.id));
  // 1) pending orders
  for (const o of acc.orders) {
    if (o.ticker !== ticker || o.createdTime >= bar.t) continue;
    const L = o.side === "long";
    let px = null, useSlip = false;
    if (o.type === "limit") {
      if (L ? bar.open <= o.price : bar.open >= o.price) px = bar.open;
      else if (L ? bar.low <= o.price : bar.high >= o.price) px = o.price;
    } else if (o.type === "stop") {
      useSlip = true;
      if (L ? bar.open >= o.price : bar.open <= o.price) px = bar.open;
      else if (L ? bar.high >= o.price : bar.low <= o.price) px = o.price;
    }
    if (px != null) {
      a = cancelOrder(a, o.id);
      a = fill(a, o, px, bar, idx, cost, bps, useSlip);
    }
  }
  // 2) stops / targets on positions held before this bar
  for (const p of a.positions) {
    if (p.ticker !== ticker || !existing.has(p.id)) continue;
    const L = p.side === "long";
    if (p.sl != null && (L ? bar.open <= p.sl : bar.open >= p.sl)) a = closePosition(a, p.id, bar.open, bar, "Stop loss (gap)", cost, bps, true);
    else if (p.tp != null && (L ? bar.open >= p.tp : bar.open <= p.tp)) a = closePosition(a, p.id, bar.open, bar, "Take profit (gap)", cost, bps, false);
    else if (p.sl != null && (L ? bar.low <= p.sl : bar.high >= p.sl)) a = closePosition(a, p.id, p.sl, bar, "Stop loss", cost, bps, true);
    else if (p.tp != null && (L ? bar.high >= p.tp : bar.low <= p.tp)) a = closePosition(a, p.id, p.tp, bar, "Take profit", cost, bps, false);
  }
  // 3) mark to market
  a = { ...a, positions: a.positions.map((p) => (p.ticker === ticker ? { ...p, last: bar.close } : p)) };
  // 4) margin call
  if (accountEquity(a) <= 0) {
    for (const p of a.positions) a = closePosition(a, p.id, p.last, bar, "Margin call", cost, bps, false);
  }
  return a;
}

// ---------- Presets ----------
const op = (kind, period) => ({ kind, period });
const num = (value) => ({ kind: "value", value });
const PRESETS = {
  "EMA Trend": {
    direction: "long", entryLogic: "all", exitLogic: "any",
    entry: [{ left: op("ema", 20), op: ">", right: op("ema", 50) }, { left: op("price"), op: ">", right: op("ema", 20) }],
    exit: [{ left: op("ema", 20), op: "<", right: op("ema", 50) }],
    risk: { sl: { mode: "atr", value: 2 }, tp: { mode: "none", value: 2 } },
  },
  "RSI Oversold": {
    direction: "long", entryLogic: "all", exitLogic: "any",
    entry: [{ left: op("rsi", 14), op: "<", right: num(30) }],
    exit: [{ left: op("rsi", 14), op: ">", right: num(55) }],
    risk: { sl: { mode: "pct", value: 5 }, tp: { mode: "pct", value: 8 } },
  },
  "Price Above SMA": {
    direction: "long", entryLogic: "all", exitLogic: "any",
    entry: [{ left: op("price"), op: ">", right: op("sma", 200) }],
    exit: [{ left: op("price"), op: "<", right: op("sma", 200) }],
    risk: { sl: { mode: "none", value: 5 }, tp: { mode: "none", value: 2 } },
  },
};

// ===================== STYLES =====================
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
.spm{--ink:#0E1A22;--panel:#132330;--panel2:#182C3A;--rule:#25394A;--rule2:#30495C;--text:#DCE5E1;--muted:#86A0AC;--faint:#5B7482;
--up:#3DB88B;--down:#E86A5C;--amber:#F0B64A;--sky:#7CC3E6;--violet:#B79CF0;
font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums;background:var(--ink);color:var(--text);
min-height:100vh;font-size:13px;line-height:1.45;-webkit-font-smoothing:antialiased}
.spm *{box-sizing:border-box}
.spm button,.spm input,.spm select{font:inherit;color:inherit}
.spm :focus-visible{outline:2px solid var(--sky);outline-offset:1px}
.spm .top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px;padding:10px 16px;border-bottom:1px solid var(--rule);background:var(--panel)}
.spm .brand{display:flex;align-items:center;gap:10px;margin-right:4px}
.spm .brand h1{font-size:15px;font-weight:600;margin:0;letter-spacing:-.01em}
.spm .sim{font-size:11.5px;color:var(--amber);border:1px solid rgba(240,182,74,.45);border-radius:999px;padding:1px 9px}
.spm .tickerbox{display:flex;align-items:center;gap:6px}
.spm .tickerbox input{width:92px;text-transform:uppercase;font-weight:600;font-size:14px}
.spm .acct{margin-left:auto;display:flex;gap:18px;align-items:baseline}
.spm .acct div{display:flex;flex-direction:column;align-items:flex-end}
.spm .acct small{color:var(--muted);font-size:11.5px}
.spm .acct b{font-size:15px;font-weight:600}
.spm .layout{display:grid;grid-template-columns:minmax(0,1fr) 352px;gap:0;align-items:start}
.spm .main{min-width:0;border-right:1px solid var(--rule)}
.spm .side{min-width:0;background:var(--panel)}
@media (max-width:1040px){.spm .layout{grid-template-columns:1fr}.spm .main{border-right:0}.spm .side{border-top:1px solid var(--rule)}.spm .acct{margin-left:0}}
.spm .input,.spm select.input{background:var(--ink);border:1px solid var(--rule2);border-radius:6px;padding:5px 8px;height:30px;min-width:0}
.spm .input:hover{border-color:#40606f}
.spm select.input{padding-right:4px}
.spm .btn{background:var(--panel2);border:1px solid var(--rule2);border-radius:6px;height:30px;padding:0 12px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.spm .btn:hover{background:#1F3748}
.spm .btn:disabled{opacity:.45;cursor:not-allowed}
.spm .btn.primary{background:var(--sky);border-color:var(--sky);color:#0B1820;font-weight:600}
.spm .btn.primary:hover{background:#9AD3F0}
.spm .btn.long{background:var(--up);border-color:var(--up);color:#07170F;font-weight:600}
.spm .btn.short{background:var(--down);border-color:var(--down);color:#1E0805;font-weight:600}
.spm .btn.ghost{background:transparent;border-color:transparent;color:var(--muted)}
.spm .btn.ghost:hover{color:var(--text);background:var(--panel2)}
.spm .btn.icon{padding:0;width:30px}
.spm .btn.sm{height:24px;padding:0 8px;font-size:12px}
.spm .btn.on{border-color:var(--sky);color:var(--sky)}
.spm .seg{display:inline-flex;background:var(--ink);border:1px solid var(--rule2);border-radius:7px;padding:2px;gap:2px}
.spm .seg button{border:0;background:transparent;border-radius:5px;height:24px;padding:0 9px;cursor:pointer;color:var(--muted)}
.spm .seg button:hover{color:var(--text)}
.spm .seg button.act{background:var(--panel2);color:var(--text);box-shadow:inset 0 0 0 1px var(--rule2)}
.spm .seg.big{display:flex}.spm .seg.big button{flex:1;height:30px;font-weight:600}
.spm .seg button.act.long{background:var(--up);color:#07170F;box-shadow:none}
.spm .seg button.act.short{background:var(--down);color:#1E0805;box-shadow:none}
.spm .toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--rule)}
.spm .chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;border:1px solid var(--rule2);background:transparent;cursor:pointer;font-size:12px;color:var(--muted)}
.spm .chip i{width:9px;height:9px;border-radius:2px;display:inline-block;opacity:.35}
.spm .chip.act{color:var(--text);border-color:#40606f}
.spm .chip.act i{opacity:1}
.spm .pick{white-space:nowrap;flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:6px;border:1px dashed var(--rule2);background:transparent;cursor:pointer;font-size:12px;color:var(--muted)}
.spm .pick.act{border-style:solid;color:#0B1820;font-weight:600}
.spm .chartwrap{position:relative;user-select:none;touch-action:pan-y}
@media (max-width:700px){.spm .hint{display:none}.spm .readout{font-size:11px;gap:6px}}
.spm .chartwrap.picking{cursor:crosshair}
.spm .readout{position:absolute;left:12px;top:8px;display:flex;gap:10px;font-size:12px;pointer-events:none;color:var(--muted);flex-wrap:wrap;right:80px}
.spm .readout b{font-weight:500;color:var(--text)}
.spm .pickhint{position:absolute;left:50%;top:10px;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--rule2);padding:4px 12px;border-radius:999px;font-size:12px;pointer-events:none}
.spm .replay{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 12px;border-top:1px solid var(--rule);border-bottom:1px solid var(--rule);background:var(--panel)}
.spm .replay input[type=range]{flex:1;min-width:160px;accent-color:var(--amber)}
.spm .replay .when{min-width:150px;color:var(--muted);font-size:12px}
.spm .replay.live{border-top-color:rgba(240,182,74,.5)}
.spm .tabs{display:flex;gap:2px;border-bottom:1px solid var(--rule);padding:0 8px;overflow-x:auto}
.spm .tab{border:0;background:transparent;padding:10px 10px 9px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;white-space:nowrap;font-weight:500}
.spm .tab:hover{color:var(--text)}
.spm .tab.act{color:var(--text);border-bottom-color:var(--sky)}
.spm .tab .n{display:inline-block;min-width:18px;padding:0 5px;margin-left:5px;border-radius:9px;background:var(--panel2);font-size:11px;text-align:center}
.spm .pane{padding:14px 16px}
.spm .section{padding:14px 16px;border-bottom:1px solid var(--rule)}
.spm .section:last-child{border-bottom:0}
.spm h3{font-size:13px;font-weight:600;margin:0 0 10px}
.spm h4{font-size:12.5px;font-weight:600;margin:14px 0 8px;color:var(--text)}
.spm .muted{color:var(--muted)}
.spm .note{color:var(--muted);font-size:12px;margin:6px 0 0}
.spm .row{display:flex;gap:8px;align-items:center}
.spm .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.spm .field{display:flex;flex-direction:column;gap:4px;min-width:0}
.spm .field>span{font-size:12px;color:var(--muted)}
.spm .field .input{width:100%}
.spm .inline{display:flex;gap:6px;align-items:center}
.spm .inline .input{flex:1}
.spm .summary{display:grid;grid-template-columns:1fr auto;gap:4px 12px;margin-top:12px;padding:10px 12px;background:var(--ink);border-radius:8px;border:1px solid var(--rule)}
.spm .summary span{color:var(--muted)}
.spm .summary b{font-weight:500;text-align:right}
.spm .warn{margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(232,106,92,.1);border:1px solid rgba(232,106,92,.35);color:#F2A79E;font-size:12px}
.spm .info{margin-top:10px;padding:8px 10px;border-radius:6px;background:rgba(124,195,230,.08);border:1px solid rgba(124,195,230,.25);color:#B6DCEF;font-size:12px}
.spm .up{color:var(--up)} .spm .down{color:var(--down)}
.spm .tablewrap{overflow:auto;max-height:420px}
.spm table{border-collapse:collapse;width:100%;font-size:12.5px}
.spm th{position:sticky;top:0;background:var(--ink);text-align:right;font-weight:500;color:var(--muted);padding:7px 10px;border-bottom:1px solid var(--rule);white-space:nowrap}
.spm td{text-align:right;padding:6px 10px;border-bottom:1px solid #1A2D3A;white-space:nowrap}
.spm th:first-child,.spm td:first-child,.spm td.l,.spm th.l{text-align:left}
.spm tbody tr:hover{background:#15283A}
.spm tr.click{cursor:pointer}
.spm .tag{display:inline-block;padding:0 7px;border-radius:4px;font-size:11.5px;font-weight:600}
.spm .tag.long{background:rgba(61,184,139,.16);color:var(--up)}
.spm .tag.short{background:rgba(232,106,92,.16);color:var(--down)}
.spm .empty{padding:28px 16px;color:var(--muted);text-align:center}
.spm .stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));border-top:1px solid var(--rule);border-left:1px solid var(--rule)}
.spm .stat{padding:10px 12px;border-right:1px solid var(--rule);border-bottom:1px solid var(--rule)}
.spm .stat span{display:block;color:var(--muted);font-size:12px}
.spm .stat b{display:block;font-size:17px;font-weight:600;margin-top:2px}
.spm .stat.hero{grid-column:span 2;background:var(--panel)}
.spm .stat.hero b{font-size:26px;letter-spacing:-.02em}
.spm .cond{display:grid;grid-template-columns:128px minmax(0,1fr) 30px;grid-template-areas:"l l x" "op r r";gap:5px;align-items:center;padding:6px;border:1px solid var(--rule);border-radius:7px;margin-bottom:6px;background:var(--ink)}
.spm .cond .cl{grid-area:l}.spm .cond .cr{grid-area:r}.spm .cond .cx{grid-area:x}.spm .cond .op{grid-area:op}
.spm .operand{display:flex;gap:4px;min-width:0}
.spm .operand select{flex:1;min-width:0}
.spm .operand input{width:54px}
.spm .cond select.op{width:100%}
.spm .operand input{width:64px}
.spm .presets{display:flex;flex-wrap:wrap;gap:6px}
.spm .toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--rule2);padding:9px 16px;border-radius:8px;z-index:50;max-width:90vw;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.spm .loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(14,26,34,.6);font-size:13px}
.spm .errorbox{margin:12px;padding:12px 14px;border-radius:8px;background:rgba(232,106,92,.1);border:1px solid rgba(232,106,92,.4)}
.spm .log{font-size:12px;max-height:380px;overflow:auto}
.spm .log div{padding:5px 0;border-bottom:1px solid #1A2D3A;display:flex;gap:12px}
.spm .log time{color:var(--faint);min-width:120px}
.spm .toggle{display:flex;align-items:center;gap:8px;cursor:pointer}
.spm .toggle input{accent-color:var(--sky);width:15px;height:15px}
.spm .kbd{border:1px solid var(--rule2);border-radius:4px;padding:0 5px;font-size:11px;color:var(--muted)}
@media (prefers-reduced-motion:no-preference){.spm .zone{transition:opacity .2s}}
`;

// ===================== FORMAT HELPERS =====================
const fmtMoney = (v, sign = false) => {
  if (v == null || !isFinite(v)) return "–";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "−$" : sign && v > 0 ? "+$" : "$") + s;
};

const fmtPrice = (v) => (v == null || !isFinite(v) ? "–" : v.toLocaleString("en-US", { minimumFractionDigits: v < 1 ? 4 : 2, maximumFractionDigits: v < 1 ? 4 : 2 }));
const fmtPct = (v, sign = true) => (v == null || !isFinite(v) ? "–" : (sign && v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + "%");
const fmtNum = (v, d = 2) => (v == null ? "–" : v === Infinity ? "∞" : isFinite(v) ? v.toFixed(d) : "–");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTime(ts, tfId, short = false) {
  const p = etParts(ts);
  const date = `${p.d} ${MONTHS[p.mo]} ${p.y}`;
  const tf = tfById(tfId);
  if (tfId === "1M") return `${MONTHS[p.mo]} ${p.y}`;
  if (!tf || !tf.intraday) return date;
  return short ? `${p.d} ${MONTHS[p.mo]} ${pad2(p.h)}:${pad2(p.mi)}` : `${date} ${pad2(p.h)}:${pad2(p.mi)}`;
}
function fmtDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60 ? (m % 60) + "m" : ""}`.trim();
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24 ? (h % 24) + "h" : ""}`.trim();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function niceTicks(lo, hi, count) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(+v.toFixed(10));
  return out;
}
function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => (typeof c === "string" && c.includes(",") ? `"${c}"` : c)).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}

// ===================== CHART =====================
const C = { up: "#3DB88B", down: "#E86A5C", amber: "#F0B64A", sky: "#7CC3E6", rule: "#25394A", grid: "#1A2D3A", muted: "#86A0AC", text: "#DCE5E1", ink: "#0E1A22", violet: "#B79CF0" };
const AXIS_R = 70, AXIS_B = 24, PAD_T = 30, SUB_H = 88, RIGHT_SLOTS = 4;

function PriceChart({ bars, end, tfId, overlays, rsiSeries, atrSeries, showVolume, plan, lines, markers, pickMode, onPick, height, focus, loading }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(900);
  const [view, setView] = useState({ count: 140, offset: 0 });
  const [hover, setHover] = useState(null);
  const drag = useRef(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.max(320, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setView((v) => ({ count: clamp(v.count, 20, Math.max(20, bars.length)), offset: 0 })); }, [bars]);
  useEffect(() => {
    if (!focus) return;
    setView((v) => ({ ...v, offset: clamp(focus - Math.floor(v.count / 2), 0, Math.max(0, bars.length - v.count)) }));
  }, [focus, bars.length]);

  const start = Math.max(0, bars.length - view.count - view.offset);
  const endIdx = Math.min(bars.length, start + view.count);
  const vis = bars.slice(start, endIdx);
  const pad = { left: 8, right: AXIS_R, top: PAD_T, bottom: AXIS_B + (showVolume ? SUB_H : 0) + (rsiSeries ? SUB_H : 0) + (atrSeries ? SUB_H : 0) };
  const cw = Math.max(100, w - pad.left - pad.right);
  const highs = vis.map((b) => b.high), lows = vis.map((b) => b.low);
  const hi = highs.length ? Math.max(...highs) : 1, lo = lows.length ? Math.min(...lows) : 0;
  const range = hi - lo || 1, yMin = lo - range * 0.05, yMax = hi + range * 0.05;
  const x = (i) => pad.left + (i / Math.max(1, vis.length - 1)) * cw;
  const y = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * (height - pad.top - AXIS_B - (showVolume ? SUB_H : 0) - (rsiSeries ? SUB_H : 0) - (atrSeries ? SUB_H : 0));
  const barW = Math.max(1, Math.min(12, cw / Math.max(1, vis.length) * 0.7));
  const ticks = niceTicks(yMin, yMax, 6);
  const selected = hover == null ? null : vis[hover];

  const handleWheel = (e) => {
    e.preventDefault();
    const dir = e.deltaY > 0 ? 1 : -1;
    setView((v) => {
      const next = clamp(Math.round(v.count * (dir > 0 ? 1.15 : 0.87)), 20, Math.max(20, bars.length));
      const anchor = hover == null ? Math.floor(v.count / 2) : hover;
      const ratio = next / v.count;
      const off = clamp(Math.round(v.offset + anchor * (1 - ratio)), 0, Math.max(0, bars.length - next));
      return { count: next, offset: off };
    });
  };
  const onPointerDown = (e) => { drag.current = { x: e.clientX, offset: view.offset }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const step = Math.max(1, Math.round((-dx / cw) * view.count));
    setView((v) => ({ ...v, offset: clamp(drag.current.offset + step, 0, Math.max(0, bars.length - v.count)) }));
  };
  const onPointerUp = () => { drag.current = null; };
  const onClick = (e) => {
    if (!pickMode || !onPick || !vis.length) return;
    const r = wrapRef.current.getBoundingClientRect();
    const xx = clamp(e.clientX - r.left - pad.left, 0, cw);
    const idx = Math.round((xx / cw) * (vis.length - 1));
    onPick(start + idx);
  };

  return <div ref={wrapRef} className={`chartwrap ${pickMode ? "picking" : ""}`} style={{ height }} onWheel={handleWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onClick={onClick} onMouseMove={(e) => { const r = wrapRef.current.getBoundingClientRect(); const xx = clamp(e.clientX - r.left - pad.left, 0, cw); setHover(Math.round((xx / cw) * Math.max(0, vis.length - 1))); }} onMouseLeave={() => setHover(null)}>
    <svg width={w} height={height} style={{ display: "block" }}>
      <rect x="0" y="0" width={w} height={height} fill={C.ink} />
      {ticks.map((t) => <g key={t}><line x1={pad.left} x2={w - pad.right} y1={y(t)} y2={y(t)} stroke={C.grid} /><text x={w - pad.right + 8} y={y(t) + 4} fill={C.muted} fontSize="11">{fmtPrice(t)}</text></g>)}
      {vis.map((b, i) => {
        const up = b.close >= b.open;
        const yy = y(Math.max(b.open, b.close)), hh = Math.max(1, Math.abs(y(b.open) - y(b.close)));
        return <g key={b.t}><line x1={x(i)} x2={x(i)} y1={y(b.high)} y2={y(b.low)} stroke={up ? C.up : C.down} /><rect x={x(i) - barW / 2} y={yy} width={barW} height={hh} fill={up ? C.up : C.down} opacity=".9" /></g>;
      })}
      {overlays?.map((s, si) => <polyline key={si} fill="none" stroke={s.color || C.sky} strokeWidth="1.4" points={s.values.slice(start, endIdx).map((v, i) => v == null ? null : `${x(i)},${y(v)}`).filter(Boolean).join(" ")} />)}
      {lines?.map((ln, i) => <line key={i} x1={pad.left} x2={w - pad.right} y1={y(ln.value)} y2={y(ln.value)} stroke={ln.color || C.amber} strokeDasharray="4 4" />)}
      {markers?.filter((m) => m.idx >= start && m.idx < endIdx).map((m, i) => <circle key={i} cx={x(m.idx - start)} cy={y(m.price)} r="4" fill={m.kind === "entry" ? C.up : C.down} stroke={C.ink} strokeWidth="2" />)}
      {selected && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - AXIS_B} stroke={C.rule} />}
    </svg>
    {selected && <div className="readout"><span>{fmtTime(selected.t, tfId, true)}</span><span>O <b>{fmtPrice(selected.open)}</b></span><span>H <b>{fmtPrice(selected.high)}</b></span><span>L <b>{fmtPrice(selected.low)}</b></span><span>C <b>{fmtPrice(selected.close)}</b></span><span>V <b>{selected.volume?.toLocaleString() || "–"}</b></span></div>}
    {pickMode && <div className="pickhint">Click a bar to select it</div>}
    {loading && <div className="loading">Loading…</div>}
  </div>;
}

// ===================== APP =====================
export default function StockPortfolioManager() {
  const [ticker, setTicker] = useState("AAPL");
  const [tfId, setTfId] = useState("1D");
  const [bars, setBars] = useState(() => demoBars("AAPL", "1D"));
  const [source, setSource] = useState("Demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Chart");
  const [alphaKey, setAlphaKey] = useState("");
  const [proxy, setProxy] = useState("");
  const [showVolume, setShowVolume] = useState(true);
  const [showRSI, setShowRSI] = useState(false);
  const [showATR, setShowATR] = useState(false);
  const [overlays, setOverlays] = useState([]);
  const [capital, setCapital] = useState(100000);
  const [leverage, setLeverage] = useState(1);
  const [fractional, setFractional] = useState(true);
  const [slippageBps, setSlippageBps] = useState(2);
  const [cost, setCost] = useState({ perTrade: 0, pct: 0, perShare: 0 });
  const [strategy, setStrategy] = useState(() => PRESETS["EMA Trend"]);
  const [preset, setPreset] = useState("EMA Trend");
  const [backtest, setBacktest] = useState(null);
  const [account, setAccount] = useState(() => newAccount(100000));
  const [toast, setToast] = useState("");
  const [pickMode, setPickMode] = useState(false);
  const [focus, setFocus] = useState(null);
  const [replay, setReplay] = useState(false);
  const [replayIdx, setReplayIdx] = useState(() => Math.max(0, demoBars("AAPL", "1D").length - 1));
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [order, setOrder] = useState({ type: "market", side: "long", qty: 10, price: 0, sl: null, tp: null, leverage: 1 });

  const end = Math.min(bars.length - 1, replay ? replayIdx : bars.length - 1);
  const visibleBars = replay ? bars.slice(0, end + 1) : bars;
  const closes = visibleBars.map((b) => b.close);
  const get = useMemo(() => makeIndicatorCache(visibleBars), [visibleBars]);
  const rsiSeries = showRSI ? get("rsi", 14) : null;
  const atrSeries = showATR ? get("atr", 14) : null;
  const overlaysSeries = useMemo(() => overlays.map((o) => ({ ...o, values: get(o.kind, o.period) })), [overlays, get]);

  useEffect(() => {
    if (!replayPlaying) return;
    const id = setInterval(() => setReplayIdx((i) => {
      if (i >= bars.length - 1) { setReplayPlaying(false); return i; }
      return i + 1;
    }), 180);
    return () => clearInterval(id);
  }, [replayPlaying, bars.length]);

  const notify = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); }, []);

  const loadData = async (provider = source) => {
    setLoading(true); setError("");
    try {
      let next;
      if (provider === "Yahoo") next = await fetchYahoo(ticker.trim().toUpperCase(), tfId, proxy.trim());
      else if (provider === "Alpha Vantage") next = await fetchAlphaVantage(ticker.trim().toUpperCase(), tfId, alphaKey.trim());
      else next = demoBars(ticker.trim().toUpperCase() || "AAPL", tfId);
      if (!next.length) throw new Error("No bars returned.");
      setBars(next); setReplayIdx(next.length - 1); setFocus(null); setBacktest(null);
      notify(`Loaded ${next.length.toLocaleString()} bars from ${provider}.`);
    } catch (e) {
      setError(e.message || String(e));
      setBars(demoBars(ticker.trim().toUpperCase() || "AAPL", tfId));
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData("Demo"); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tfId]);

  const run = () => {
    if (bars.length < 20) return notify("Not enough bars for a backtest.");
    const cfg = { capital: Number(capital), leverage: Number(leverage), fractional, slippageBps: Number(slippageBps), cost, sizing: { mode: "pctEquity", value: 100 }, atrPeriod: 14, startIdx: 0, endIdx: bars.length - 1, sl: strategy.risk.sl, tp: strategy.risk.tp };
    setBacktest(runBacktest(bars, strategy, cfg, tfId));
    setTab("Results");
  };

  const applyPreset = (name) => { setPreset(name); setStrategy(PRESETS[name]); };
  const latest = visibleBars[end] || bars[bars.length - 1];
  const equity = accountEquity(account);
  const submitOrder = () => {
    if (!latest) return;
    const o = { ...order, ticker: ticker.toUpperCase(), qty: Number(order.qty), price: Number(order.price || latest.close), leverage: Number(order.leverage || 1) };
    setAccount((a) => placeOrder(a, o, latest, end, cost, slippageBps));
    notify("Order submitted.");
  };

  return <div className="spm">
    <style>{CSS}</style>
    <div className="top">
      <div className="brand"><h1>Stock Portfolio Manager</h1><span className="sim">SIMULATION</span></div>
      <div className="tickerbox"><input className="input" value={ticker} onChange={(e) => setTicker(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadData(source)} /><button className="btn primary" onClick={() => loadData(source)}><Search size={14}/> Load</button></div>
      <div className="seg">{TIMEFRAMES.map((tf) => <button key={tf.id} className={tf.id === tfId ? "act" : ""} onClick={() => setTfId(tf.id)}>{tf.label}</button>)}</div>
      <div className="acct"><div><small>Balance</small><b>{fmtMoney(account.balance)}</b></div><div><small>Equity</small><b>{fmtMoney(equity)}</b></div></div>
    </div>

    <div className="layout">
      <main className="main">
        <div className="toolbar">
          <button className={`chip ${showVolume ? "act" : ""}`} onClick={() => setShowVolume((x) => !x)}><i style={{ background: C.amber }}/>Volume</button>
          <button className={`chip ${showRSI ? "act" : ""}`} onClick={() => setShowRSI((x) => !x)}><i style={{ background: C.violet }}/>RSI</button>
          <button className={`chip ${showATR ? "act" : ""}`} onClick={() => setShowATR((x) => !x)}><i style={{ background: C.sky }}/>ATR</button>
          <button className="pick" onClick={() => setPickMode((x) => !x)}>{pickMode ? "Picking…" : "Pick bar"}</button>
          {source !== "Demo" && <span className="muted">Data: {source}</span>}
        </div>
        {error && <div className="errorbox">{error}<div className="note">Showing seeded demo data instead.</div></div>}
        <PriceChart bars={visibleBars} end={end} tfId={tfId} overlays={overlaysSeries} rsiSeries={rsiSeries} atrSeries={atrSeries} showVolume={showVolume} plan={null} lines={[]} markers={backtest?.markers} pickMode={pickMode} onPick={(i) => { setFocus(i); setPickMode(false); notify(`Selected ${fmtTime(bars[i].t, tfId)}.`); }} height={520} focus={focus} loading={loading}/>
        <div className="replay">
          <button className={`btn sm ${replay ? "on" : ""}`} onClick={() => { setReplay((x) => !x); setReplayIdx(bars.length - 1); }}>{replay ? "Replay on" : "Replay"}</button>
          {replay && <><button className="btn icon sm" onClick={() => setReplayPlaying((x) => !x)}>{replayPlaying ? <Pause size={14}/> : <Play size={14}/>}</button><button className="btn icon sm" onClick={() => setReplayIdx((i) => Math.min(bars.length - 1, i + 1))}><StepForward size={14}/></button><input type="range" min="0" max={Math.max(0, bars.length - 1)} value={replayIdx} onChange={(e) => setReplayIdx(+e.target.value)}/><span className="when">{latest ? fmtTime(latest.t, tfId) : "–"}</span></>}
        </div>

        <div className="tabs">
          {[["Chart", null],["Results", backtest?.trades?.length],["Paper Trading", account.positions.length],["Data", null],["Strategy", null]].map(([n, count]) => <button key={n} className={`tab ${tab === n ? "act" : ""}`} onClick={() => setTab(n)}>{n}{count ? <span className="n">{count}</span> : null}</button>)}
        </div>

        {tab === "Chart" && <div className="pane"><h3>Indicators</h3><div className="presets"><button className={`btn sm ${overlays.some((o) => o.kind === "sma" && o.period === 20) ? "on" : ""}`} onClick={() => setOverlays((a) => a.some((o) => o.kind === "sma" && o.period === 20) ? a.filter((o) => !(o.kind === "sma" && o.period === 20)) : [...a, { kind: "sma", period: 20, label: "SMA 20", color: C.amber }])}>SMA 20</button><button className="btn sm" onClick={() => setOverlays((a) => a.some((o) => o.kind === "ema" && o.period === 20) ? a.filter((o) => !(o.kind === "ema" && o.period === 20)) : [...a, { kind: "ema", period: 20, label: "EMA 20", color: C.sky }])}>EMA 20</button><button className="btn sm" onClick={() => setOverlays((a) => a.some((o) => o.kind === "ema" && o.period === 50) ? a.filter((o) => !(o.kind === "ema" && o.period === 50)) : [...a, { kind: "ema", period: 50, label: "EMA 50", color: C.violet }])}>EMA 50</button></div></div>}

        {tab === "Results" && <div className="pane">{!backtest ? <div className="empty">Run a strategy backtest to see results.</div> : <><div className="stats"><div className="stat hero"><span>Final equity</span><b className={backtest.stats.pnl >= 0 ? "up" : "down"}>{fmtMoney(backtest.stats.final)}</b></div><div className="stat"><span>Return</span><b>{fmtPct(backtest.stats.ret)}</b></div><div className="stat"><span>Max drawdown</span><b className="down">{fmtPct(backtest.stats.maxDD)}</b></div><div className="stat"><span>Trades</span><b>{backtest.stats.trades}</b></div><div className="stat"><span>Win rate</span><b>{fmtPct(backtest.stats.winRate, false)}</b></div><div className="stat"><span>Profit factor</span><b>{fmtNum(backtest.stats.profitFactor, 2)}</b></div><div className="stat"><span>Sharpe</span><b>{fmtNum(backtest.stats.sharpe, 2)}</b></div><div className="stat"><span>Fees</span><b>{fmtMoney(backtest.stats.fees)}</b></div></div><div className="tablewrap"><table><thead><tr><th className="l">#</th><th className="l">Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>P&L</th><th>Return</th><th className="l">Reason</th></tr></thead><tbody>{backtest.trades.map((t) => <tr key={t.id}><td className="l">{t.id}</td><td className="l"><span className={`tag ${t.side}`}>{t.side}</span></td><td>{fmtPrice(t.entryPrice)}</td><td>{fmtPrice(t.exitPrice)}</td><td>{fmtQty(t.qty)}</td><td className={t.pnl >= 0 ? "up" : "down"}>{fmtMoney(t.pnl, true)}</td><td>{fmtPct(t.ret)}</td><td className="l">{t.reason}</td></tr>)}</tbody></table></div></>}</div>}

        {tab === "Paper Trading" && <div className="pane"><div className="grid2"><div className="field"><span>Order type</span><select className="input" value={order.type} onChange={(e) => setOrder((o) => ({ ...o, type: e.target.value }))}><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option></select></div><div className="field"><span>Side</span><select className="input" value={order.side} onChange={(e) => setOrder((o) => ({ ...o, side: e.target.value }))}><option value="long">Long</option><option value="short">Short</option></select></div><div className="field"><span>Quantity</span><input className="input" type="number" value={order.qty} onChange={(e) => setOrder((o) => ({ ...o, qty: e.target.value }))}/></div><div className="field"><span>Price</span><input className="input" type="number" value={order.price} placeholder={latest ? String(latest.close.toFixed(2)) : ""} onChange={(e) => setOrder((o) => ({ ...o, price: e.target.value }))}/></div></div><div className="row" style={{ marginTop: 10 }}><button className={`btn ${order.side === "long" ? "long" : "short"}`} onClick={submitOrder}>{order.type === "market" ? "Execute" : "Place order"}</button><span className="muted">Current {fmtPrice(latest?.close)}</span></div><h4>Open positions</h4>{account.positions.length ? <div className="tablewrap"><table><thead><tr><th className="l">Ticker</th><th className="l">Side</th><th>Qty</th><th>Entry</th><th>Last</th><th>P&L</th><th></th></tr></thead><tbody>{account.positions.map((p) => <tr key={p.id}><td className="l">{p.ticker}</td><td className="l"><span className={`tag ${p.side}`}>{p.side}</span></td><td>{fmtQty(p.qty)}</td><td>{fmtPrice(p.entry)}</td><td>{fmtPrice(p.last)}</td><td className={unrealized(p) >= 0 ? "up" : "down"}>{fmtMoney(unrealized(p), true)}</td><td><button className="btn sm" onClick={() => setAccount((a) => closePosition(a, p.id, latest.close, latest, "Manual close", cost, slippageBps, true))}>Close</button></td></tr>)}</tbody></table></div> : <div className="empty">No open positions.</div>}<h4>Activity</h4><div className="log">{account.log.map((l, i) => <div key={i}><time>{fmtTime(l.t, tfId, true)}</time><span>{l.text}</span></div>)}</div></div>}

        {tab === "Data" && <div className="pane"><h3>Data provider</h3><div className="grid2"><div className="field"><span>Provider</span><select className="input" value={source} onChange={(e) => setSource(e.target.value)}><option>Demo</option><option>Yahoo</option><option>Alpha Vantage</option></select></div><div className="field"><span>Alpha Vantage API key</span><input className="input" value={alphaKey} onChange={(e) => setAlphaKey(e.target.value)} placeholder="Optional"/></div></div><div className="field" style={{ marginTop: 10 }}><span>Yahoo proxy prefix (optional)</span><input className="input" value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="For browser CORS proxy"/></div><button className="btn primary" style={{ marginTop: 10 }} onClick={() => loadData(source)}><Download size={14}/> Fetch data</button><div className="info">Demo data is seeded and clearly synthetic. Live providers are fetched directly from the browser and may require a CORS proxy or API key.</div></div>}

        {tab === "Strategy" && <div className="pane"><h3>Strategy</h3><div className="row"><select className="input" value={preset} onChange={(e) => applyPreset(e.target.value)}>{Object.keys(PRESETS).map((n) => <option key={n}>{n}</option>)}</select><button className="btn primary" onClick={run}><Play size={14}/> Run backtest</button></div><div className="summary"><span>Direction</span><b>{strategy.direction}</b><span>Entry logic</span><b>{strategy.entryLogic}</b><span>Entry conditions</span><b>{strategy.entry.length}</b><span>Exit conditions</span><b>{strategy.exit.length}</b><span>Stop loss</span><b>{strategy.risk.sl.mode} {strategy.risk.sl.value}</b><span>Take profit</span><b>{strategy.risk.tp.mode} {strategy.risk.tp.value}</b></div><h4>Backtest settings</h4><div className="grid2"><div className="field"><span>Capital</span><input className="input" type="number" value={capital} onChange={(e) => setCapital(e.target.value)}/></div><div className="field"><span>Leverage</span><input className="input" type="number" min="1" step="0.1" value={leverage} onChange={(e) => setLeverage(e.target.value)}/></div><div className="field"><span>Slippage (bps)</span><input className="input" type="number" value={slippageBps} onChange={(e) => setSlippageBps(e.target.value)}/></div><label className="toggle"><input type="checkbox" checked={fractional} onChange={(e) => setFractional(e.target.checked)}/> Fractional shares</label></div></div>}
      </main>

      <aside className="side">
        <div className="section"><h3>Quick actions</h3><div className="row"><button className="btn primary" onClick={run}><Play size={14}/> Backtest</button><button className="btn" onClick={() => { setAccount(newAccount(Number(capital))); notify("Paper account reset."); }}><RotateCcw size={14}/> Reset</button></div></div>
        <div className="section"><h3>Market snapshot</h3><div className="summary"><span>Ticker</span><b>{ticker.toUpperCase()}</b><span>Last</span><b>{fmtPrice(latest?.close)}</b><span>Change</span><b className={latest && visibleBars.length > 1 && latest.close >= visibleBars[visibleBars.length - 2].close ? "up" : "down"}>{latest && visibleBars.length > 1 ? fmtPct((latest.close / visibleBars[visibleBars.length - 2].close - 1) * 100) : "–"}</b><span>Bars</span><b>{visibleBars.length.toLocaleString()}</b></div></div>
        <div className="section"><h3>Costs</h3><div className="grid2"><div className="field"><span>Per trade</span><input className="input" type="number" value={cost.perTrade} onChange={(e) => setCost((c) => ({ ...c, perTrade: +e.target.value }))}/></div><div className="field"><span>Percent</span><input className="input" type="number" step="0.001" value={cost.pct} onChange={(e) => setCost((c) => ({ ...c, pct: +e.target.value }))}/></div><div className="field"><span>Per share</span><input className="input" type="number" step="0.001" value={cost.perShare} onChange={(e) => setCost((c) => ({ ...c, perShare: +e.target.value }))}/></div></div></div>
        <div className="section"><h3>Notes</h3><p className="note">This app is a simulation/backtesting tool. Demo prices are synthetic; live data availability depends on the selected provider.</p></div>
      </aside>
    </div>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}
