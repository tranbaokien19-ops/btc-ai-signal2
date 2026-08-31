import baseWorker from './worker.js';
import { buildTradePlan } from './strategy.js';
import { getFiveTimeframes } from './timeframes.js';

const API = 'https://api.exchange.coinbase.com';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  }
});

async function getCandles(granularity) {
  const r = await fetch(`${API}/products/BTC-USD/candles?granularity=${granularity}`, {
    headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2/2.1' }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Market API HTTP ${r.status}: ${text.slice(0, 160)}`);
  const raw = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error('Market API trả dữ liệu không hợp lệ');
  const candles = raw.map(x => ({
    time: +x[0], low: +x[1], high: +x[2], open: +x[3], close: +x[4], volume: +x[5]
  })).filter(x => Object.values(x).every(Number.isFinite)).sort((a, b) => a.time - b.time);
  if (candles.length < 200) throw new Error(`Không đủ nến ${granularity}s: ${candles.length}`);
  return candles;
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/api/timeframes') {
      try {
        return json(await getFiveTimeframes());
      } catch (e) {
        return json({ ok: false, error: e?.message || 'Timeframe error' }, 502);
      }
    }
    if (url.pathname === '/api/trade-plan') {
      try {
        const [m1, m5, m15] = await Promise.all([
          getCandles(60),
          getCandles(300),
          getCandles(900)
        ]);
        const plan = buildTradePlan(m1, m5, m15, {
          riskPct: url.searchParams.get('riskPct'),
          maxLeverage: url.searchParams.get('maxLeverage')
        });
        return json({ ok: true, ...plan, source: 'Coinbase BTC-USD' });
      } catch (e) {
        return json({ ok: false, error: e?.message || 'Trade plan error' }, 502);
      }
    }
    return baseWorker.fetch(req, env, ctx);
  }
};
