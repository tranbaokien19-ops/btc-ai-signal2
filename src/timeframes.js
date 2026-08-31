const API = 'https://api.exchange.coinbase.com';

// Coinbase Exchange supports 5m, 15m and 1h natively, but NOT 30m or 4h.
// M30 is built from M15 candles and H4 is built from H1 candles.
const NATIVE = {
  M5: 300,
  M15: 900,
  H1: 3600
};

async function getCandles(seconds, count = 300) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - seconds * count;
  const r = await fetch(`${API}/products/BTC-USD/candles?granularity=${seconds}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`, {
    headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2/timeframes-2.0' }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}: ${text.slice(0, 180)}`);
  const raw = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error('Coinbase trả dữ liệu nến không hợp lệ');
  return raw.map(x => ({
    time: Number(x[0]),
    low: Number(x[1]),
    high: Number(x[2]),
    open: Number(x[3]),
    close: Number(x[4]),
    volume: Number(x[5])
  })).filter(x => Object.values(x).every(Number.isFinite)).sort((a, b) => a.time - b.time);
}

async function getMany(seconds, total) {
  const out = [];
  const batches = Math.ceil(total / 300);
  for (let i = batches - 1; i >= 0; i--) {
    const end = Math.floor(Date.now() / 1000) - i * 300 * seconds;
    const start = end - 300 * seconds;
    const r = await fetch(`${API}/products/BTC-USD/candles?granularity=${seconds}&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`, {
      headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2/timeframes-2.0' }
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}: ${text.slice(0, 180)}`);
    const raw = JSON.parse(text);
    if (!Array.isArray(raw)) throw new Error('Coinbase trả dữ liệu nến không hợp lệ');
    out.push(...raw.map(x => ({
      time: Number(x[0]), low: Number(x[1]), high: Number(x[2]),
      open: Number(x[3]), close: Number(x[4]), volume: Number(x[5])
    })).filter(x => Object.values(x).every(Number.isFinite)));
  }
  const seen = new Map();
  for (const c of out) seen.set(c.time, c);
  return [...seen.values()].sort((a, b) => a.time - b.time).slice(-total);
}

function aggregate(candles, seconds) {
  const map = new Map();
  for (const c of candles) {
    const bucket = Math.floor(c.time / seconds) * seconds;
    const prev = map.get(bucket);
    if (!prev) {
      map.set(bucket, { time: bucket, low: c.low, high: c.high, open: c.open, close: c.close, volume: c.volume });
    } else {
      prev.low = Math.min(prev.low, c.low);
      prev.high = Math.max(prev.high, c.high);
      prev.close = c.close;
      prev.volume += c.volume;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
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
    ? (last.close > e20 && e20 > e50 && e50 > e200 ? 'BULLISH'
      : last.close < e20 && e20 < e50 && e50 < e200 ? 'BEARISH' : 'MIXED')
    : 'UNKNOWN';
  return {
    close: last?.close ?? null,
    ema20: e20,
    ema50: e50,
    ema200: e200,
    rsi14: r,
    trend,
    candles: candles.slice(-120)
  };
}

export async function getFiveTimeframes() {
  // Enough source candles to calculate EMA200 after aggregation.
  const [m5, m15, h1] = await Promise.all([
    getMany(NATIVE.M5, 300),
    getMany(NATIVE.M15, 600),
    getMany(NATIVE.H1, 900)
  ]);

  const data = [
    ['M5', m5],
    ['M15', m15],
    ['M30', aggregate(m15, 1800)],
    ['H1', h1],
    ['H4', aggregate(h1, 14400)]
  ].map(([name, candles]) => {
    if (candles.length < 200) throw new Error(`${name}: không đủ 200 nến sau khi chuẩn hóa (${candles.length})`);
    return { timeframe: name, ...analyze(candles), updatedAt: new Date().toISOString() };
  });

  return {
    ok: true,
    symbol: 'BTCUSDT',
    source: 'Coinbase BTC-USD (M30/H4 được ghép từ nến gốc)',
    timeframes: data,
    updatedAt: new Date().toISOString()
  };
}
