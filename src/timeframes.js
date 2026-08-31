const API = 'https://api.exchange.coinbase.com';

const TF = [
  ['M5', 300],
  ['M15', 900],
  ['M30', 1800],
  ['H1', 3600],
  ['H4', 21600]
];

async function get(path) {
  const r = await fetch(API + path, {
    headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2/timeframes-1.0' }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Market API HTTP ${r.status}: ${text.slice(0, 160)}`);
  return JSON.parse(text);
}

function normalize(raw) {
  return raw
    .map(x => ({
      time: Number(x[0]),
      low: Number(x[1]),
      high: Number(x[2]),
      open: Number(x[3]),
      close: Number(x[4]),
      volume: Number(x[5])
    }))
    .filter(x => Object.values(x).every(Number.isFinite))
    .sort((a, b) => a.time - b.time);
}

function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / period, al = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    ag = (ag * (period - 1) + g) / period;
    al = (al * (period - 1) + l) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function analyze(candles) {
  const closes = candles.map(x => x.close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200), r = rsi(closes);
  const last = candles.at(-1);
  const trend = e20 != null && e50 != null && e200 != null
    ? (last.close > e20 && e20 > e50 && e50 > e200 ? 'BULLISH' : last.close < e20 && e20 < e50 && e50 < e200 ? 'BEARISH' : 'MIXED')
    : 'UNKNOWN';
  return { close: last?.close ?? null, ema20: e20, ema50: e50, ema200: e200, rsi14: r, trend, candles: candles.slice(-100) };
}

export async function getFiveTimeframes() {
  const data = await Promise.all(TF.map(async ([name, seconds]) => {
    const raw = await get(`/products/BTC-USD/candles?granularity=${seconds}`);
    const candles = normalize(raw);
    if (candles.length < 200) throw new Error(`${name}: không đủ 200 nến hợp lệ`);
    return { timeframe: name, granularity: seconds, ...analyze(candles), updatedAt: new Date().toISOString() };
  }));
  return { ok: true, symbol: 'BTCUSDT', source: 'Coinbase BTC-USD', timeframes: data, updatedAt: new Date().toISOString() };
}
