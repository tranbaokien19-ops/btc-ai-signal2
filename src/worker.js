const BINANCE = 'https://data-api.binance.vision';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*'
    }
  });
}

async function binance(path) {
  const r = await fetch(BINANCE + path, {
    headers: { accept: 'application/json' },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Binance HTTP ${r.status}: ${text.slice(0, 180)}`);
  try { return JSON.parse(text); }
  catch { throw new Error('Binance trả về dữ liệu không hợp lệ'); }
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
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

async function market() {
  const [ticker, candles] = await Promise.all([
    binance('/api/v3/ticker/24hr?symbol=BTCUSDT'),
    binance('/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=250')
  ]);

  if (!Array.isArray(candles) || candles.length < 200) {
    throw new Error(`Không đủ dữ liệu nến: ${Array.isArray(candles) ? candles.length : 0}`);
  }

  const closes = candles.map(x => Number(x[4])).filter(Number.isFinite);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200), r = rsi(closes, 14);

  let score = 50;
  if (e20 && e50) score += e20 > e50 ? 15 : -15;
  if (e50 && e200) score += e50 > e200 ? 15 : -15;
  if (r != null) score += r > 55 ? 10 : r < 45 ? -10 : 0;
  score = Math.max(1, Math.min(99, Math.round(score)));

  const signal = score >= 65 ? 'LONG' : score <= 35 ? 'SHORT' : 'NO TRADE';
  return {
    ok: true,
    symbol: 'BTCUSDT',
    price: Number(ticker.lastPrice),
    bid: Number(ticker.bidPrice),
    ask: Number(ticker.askPrice),
    change24h: Number(ticker.priceChangePercent),
    score,
    signal,
    indicators: { ema20: e20, ema50: e50, ema200: e200, rsi14: r },
    candles: candles.slice(-120),
    updatedAt: new Date().toISOString()
  };
}

function html() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTC AI Signal 2</title><style>body{font-family:Arial,sans-serif;background:#0b1020;color:#eef;padding:24px;max-width:1100px;margin:auto}h1{margin-bottom:4px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.card{background:#151d33;border:1px solid #293653;border-radius:12px;padding:16px}.v{font-size:25px;font-weight:700;margin-top:8px}small{color:#9aa8c4}#signal{font-size:34px}pre{white-space:pre-wrap;color:#cbd5e1}</style></head><body><h1>BTC AI Signal 2</h1><small>Dữ liệu BTCUSDT realtime • Paper trading • Không giao dịch tiền thật</small><div class="grid" style="margin-top:20px"><div class="card">Giá<div id="price" class="v">--</div></div><div class="card">24h<div id="chg" class="v">--</div></div><div class="card">Score<div id="score" class="v">--</div></div><div class="card">Tín hiệu<div id="signal" class="v">--</div></div><div class="card">EMA20<div id="e20" class="v">--</div></div><div class="card">EMA50<div id="e50" class="v">--</div></div><div class="card">EMA200<div id="e200" class="v">--</div></div><div class="card">RSI14<div id="rsi" class="v">--</div></div></div><div class="card" style="margin-top:16px"><b>Trạng thái</b><pre id="status">Đang đồng bộ...</pre></div><script>
async function tick(){
  try{
    const r=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'});
    const d=await r.json();
    if(!r.ok || d.ok===false) throw new Error(d.error||('HTTP '+r.status));
    if(!Number.isFinite(d.price)) throw new Error('API không trả về giá BTC');
    document.getElementById('price').textContent=d.price.toLocaleString('en-US',{maximumFractionDigits:2})+' USDT';
    document.getElementById('chg').textContent=Number(d.change24h).toFixed(2)+'%';
    document.getElementById('score').textContent=d.score;
    document.getElementById('signal').textContent=d.signal;
    document.getElementById('e20').textContent=d.indicators?.ema20?.toFixed(2)??'--';
    document.getElementById('e50').textContent=d.indicators?.ema50?.toFixed(2)??'--';
    document.getElementById('e200').textContent=d.indicators?.ema200?.toFixed(2)??'--';
    document.getElementById('rsi').textContent=d.indicators?.rsi14?.toFixed(2)??'--';
    document.getElementById('status').textContent='Đã đồng bộ: '+d.updatedAt+' | Nến: '+d.candles.length;
  }catch(e){document.getElementById('status').textContent='Lỗi API: '+e.message;}
}
tick();setInterval(tick,3000);
</script></body></html>`;
}

export default {
  async fetch(request) {
    const u = new URL(request.url);
    try {
      if (u.pathname === '/health') return json({ ok: true, service: 'btc-ai-signal2', time: new Date().toISOString() });
      if (u.pathname === '/api/market') return json(await market());
      if (u.pathname === '/') return new Response(html(), { headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store' } });
      return json({ ok: false, error: 'Not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: e?.message || 'Unknown error' }, 502);
    }
  }
};
