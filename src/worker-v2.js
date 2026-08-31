import baseWorker from './worker.js';
import { getFiveTimeframes } from './timeframes.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  }
});

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/timeframes') {
      try {
        return json(await getFiveTimeframes());
      } catch (e) {
        return json({ ok: false, error: e?.message || 'timeframe error' }, 502);
      }
    }
    return baseWorker.fetch(request, env, ctx);
  }
};
