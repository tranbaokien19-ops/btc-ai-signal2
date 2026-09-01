import baseWorker, { PaperTrading } from './trade-worker.js';
import { getFiveTimeframes } from './timeframes.js';

const MARKET_API = 'https://api.exchange.coinbase.com';

function addDemoButtons(html) {
  const controls = `<div id="demo-controls" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #293756"><button id="demo-reset" style="cursor:pointer;border:1px solid #405276;background:#1a2744;color:#eef3ff;border-radius:8px;padding:10px 14px;font-weight:700">Reset DEMO 1M</button><button id="demo-long" style="cursor:pointer;border:1px solid #267a52;background:#123d2a;color:#55dc92;border-radius:8px;padding:10px 14px;font-weight:700">Mở LONG DEMO</button><button id="demo-short" style="cursor:pointer;border:1px solid #8a3b46;background:#421c24;color:#ff7181;border-radius:8px;padding:10px 14px;font-weight:700">Mở SHORT DEMO</button><button id="demo-close" style="cursor:pointer;border:1px solid #765d28;background:#3b3015;color:#f4ca58;border-radius:8px;padding:10px 14px;font-weight:700">Đóng lệnh</button><span style="align-self:center;color:#55dc92;font-weight:700">AI AUTO DEMO: ON</span><span id="demo-action" style="align-self:center;color:#94a3c5">AI tự động chỉ mở Paper Trading khi qua bộ lọc 5 khung</span></div>`;
  const script = `<script>(function(){const $=id=>document.getElementById(id);async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));return d}async function price(){const d=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());if(!d.ok)throw Error(d.error||'Market lỗi');return Number(d.price)}async function act(label,fn){$('demo-action').textContent=label+'...';try{await fn();$('demo-action').textContent='✓ '+label+' thành công'}catch(e){$('demo-action').textContent='✕ '+e.message;console.error(e)}}$('demo-reset').onclick=()=>act('Reset DEMO',()=>post('/api/paper/reset',{capital:1000000}));$('demo-long').onclick=()=>act('Mở LONG',async()=>{const p=await price();return post('/api/paper/open',{side:'LONG',entry:p,stopLoss:p-100,takeProfit1:p+100,takeProfit2:p+200,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_LONG_BUTTON',entryReason:'Nút demo',learningEligible:false});});$('demo-short').onclick=()=>act('Mở SHORT',async()=>{const p=await price();return post('/api/paper/open',{side:'SHORT',entry:p,stopLoss:p+100,takeProfit1:p-100,takeProfit2:p-200,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_SHORT_BUTTON',entryReason:'Nút demo',learningEligible:false});});$('demo-close').onclick=()=>act('Đóng lệnh',async()=>{const p=await price();return post('/api/paper/close',{price:p,reason:'BUTTON'});});async function auto(){try{const r=await fetch('/api/paper/auto?ts='+Date.now(),{method:'POST',cache:'no-store'});const d=await r.json();if(d.ok&&d.position){$('demo-action').textContent='✓ AI AUTO đã mở '+d.position.side+' DEMO @ '+Number(d.position.entry).toLocaleString('en-US',{maximumFractionDigits:2});}else if(d.ok&&d.signal){$('demo-action').textContent='AI AUTO: '+d.signal+' | Score '+(d.score??'--')+' | '+(d.reason||'đang chờ');}}catch(e){$('demo-action').textContent='AI AUTO CHECK: '+e.message}}auto();setInterval(auto,15000);})();</script>`;
  return html.replace('<script>(async()=>{', controls + '<script>(async()=>{').replace('</body></html>', script + '</body></html>');
}

async function getTickerPrice() {
  const r = await fetch(`${MARKET_API}/products/BTC-USD/ticker`, { headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2-auto-demo/1.1' } });
  if (!r.ok) throw new Error(`Coinbase ticker HTTP ${r.status}`);
  const d = await r.json();
  const p = Number(d?.price);
  if (!(p > 0)) throw new Error('Coinbase trả giá không hợp lệ');
  return p;
}

function timeframeScore(t) {
  let score = 50;
  if (Number.isFinite(t.ema20) && Number.isFinite(t.ema50)) score += t.ema20 > t.ema50 ? 15 : -15;
  if (Number.isFinite(t.ema50) && Number.isFinite(t.ema200)) score += t.ema50 > t.ema200 ? 15 : -15;
  if (Number.isFinite(t.rsi14)) score += t.rsi14 >= 55 && t.rsi14 <= 68 ? 10 : t.rsi14 < 42 ? -10 : 0;
  if (Number.isFinite(t.close) && Number.isFinite(t.ema20)) score += t.close > t.ema20 ? 5 : -5;
  return Math.max(1, Math.min(99, Math.round(score)));
}

function buildAutoSignal(data, price) {
  const required = ['M5', 'M15', 'M30', 'H1', 'H4'];
  if (!data || !Array.isArray(data.timeframes)) return { signal: 'WAIT', score: 50, confidence: 0, scores: {}, reason: 'Thiếu dữ liệu 5 khung' };
  const byTf = Object.fromEntries(data.timeframes.map(t => [t.timeframe, t]));
  const missing = required.filter(tf => !byTf[tf]);
  if (missing.length) return { signal: 'WAIT', score: 50, confidence: 0, scores: {}, reason: `Thiếu timeframe: ${missing.join(', ')}` };
  if (!(Number.isFinite(price) && price > 0)) return { signal: 'WAIT', score: 50, confidence: 0, scores: {}, reason: 'Giá thị trường không hợp lệ' };

  const weights = { M5: 0.10, M15: 0.15, M30: 0.20, H1: 0.25, H4: 0.30 };
  const scores = Object.fromEntries(required.map(tf => [tf, timeframeScore(byTf[tf])]));
  const score = Math.round(Object.entries(weights).reduce((sum, [tf, w]) => sum + scores[tf] * w, 0));
  const confidence = Math.round(Math.abs(score - 50) * 2);
  const bullish = required.filter(tf => scores[tf] >= 60).length;
  const bearish = required.filter(tf => scores[tf] <= 40).length;
  const highBull = scores.H1 >= 60 && scores.H4 >= 60;
  const highBear = scores.H1 <= 40 && scores.H4 <= 40;

  // Step 6 quality gate: a signal is not considered trustworthy just because
  // the weighted score crosses a threshold. Require higher-timeframe agreement,
  // 4/5 directional agreement, and a stronger margin from neutral.
  if (score >= 75 && bullish >= 4 && highBull && confidence >= 50) {
    const rsi = Number(byTf.M5.rsi14);
    if (Number.isFinite(rsi) && rsi > 72) return { signal: 'WAIT', score, confidence, scores, reason: 'LONG bị chặn: RSI M5 quá nóng' };
    const stopDistance = price * 0.003;
    return { signal: 'LONG', score, confidence, scores, qualityGate: 'PASS', learningEligible: true,
      order: { side: 'LONG', entry: price, stopLoss: price - stopDistance, takeProfit1: price + stopDistance * 1.2, takeProfit2: price + stopDistance * 2, leverage: 3, riskPct: 0.5, confidence, timeframe: 'M5/M15/M30/H1/H4', signal: 'AUTO_LONG', entryReason: `5TF quality PASS | score ${score} | bull ${bullish}/5 | H1/H4 đồng thuận`, learningEligible: true } };
  }

  if (score <= 25 && bearish >= 4 && highBear && confidence >= 50) {
    const rsi = Number(byTf.M5.rsi14);
    if (Number.isFinite(rsi) && rsi < 28) return { signal: 'WAIT', score, confidence, scores, reason: 'SHORT bị chặn: RSI M5 quá bán' };
    const stopDistance = price * 0.003;
    return { signal: 'SHORT', score, confidence, scores, qualityGate: 'PASS', learningEligible: true,
      order: { side: 'SHORT', entry: price, stopLoss: price + stopDistance, takeProfit1: price - stopDistance * 1.2, takeProfit2: price - stopDistance * 2, leverage: 3, riskPct: 0.5, confidence, timeframe: 'M5/M15/M30/H1/H4', signal: 'AUTO_SHORT', entryReason: `5TF quality PASS | score ${score} | bear ${bearish}/5 | H1/H4 đồng thuận`, learningEligible: true } };
  }

  return { signal: 'WAIT', score, confidence, scores, reason: `Quality gate WAIT | score ${score} | bull ${bullish}/5 | bear ${bearish}/5 | H1/H4 chưa đủ đồng thuận` };
}

async function autoDemo(env) {
  if (!env.PAPER_TRADING) return { ok: false, reason: 'Thiếu binding PAPER_TRADING' };
  const paper = env.PAPER_TRADING.get(env.PAPER_TRADING.idFromName('btc-ai-signal2-paper'));
  const statusRes = await paper.fetch('https://paper/status');
  const status = await statusRes.json();
  if (!status.ok) return { ok: false, reason: 'Paper status lỗi' };
  if (status.position) return { ok: true, reason: 'Đang có DEMO ORDER', position: status.position };

  const historyRes = await paper.fetch('https://paper/history?limit=1');
  const history = await historyRes.json();
  const last = history?.trades?.at(-1);
  if (last?.closedAt && Date.now() - new Date(last.closedAt).getTime() < 5 * 60 * 1000) return { ok: true, signal: 'COOLDOWN', score: null, reason: 'Nghỉ 5 phút sau lệnh đóng' };

  const [tf, price] = await Promise.all([getFiveTimeframes(), getTickerPrice()]);
  const plan = buildAutoSignal(tf, price);
  if (plan.signal === 'WAIT' || !plan.order) return { ok: true, signal: plan.signal, score: plan.score, confidence: plan.confidence, scores: plan.scores, reason: plan.reason };

  const openRes = await paper.fetch('https://paper/open', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(plan.order)
  });
  const opened = await openRes.json();
  if (!opened.ok) throw new Error(opened.error || 'Không mở được AUTO DEMO');
  return { ok: true, signal: plan.signal, score: plan.score, confidence: plan.confidence, scores: plan.scores, qualityGate: plan.qualityGate, learningEligible: plan.learningEligible, position: opened.position, reason: 'Đã mở AUTO DEMO — quality gate PASS' };
}

export { PaperTrading };

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/') {
      const r = await baseWorker.fetch(req, env, ctx);
      const html = await r.text();
      return new Response(addDemoButtons(html), { status: r.status, headers: r.headers });
    }
    if (url.pathname === '/api/paper/auto' && req.method === 'POST') {
      try { return Response.json(await autoDemo(env)); }
      catch (e) { return Response.json({ ok: false, error: e?.message || 'AUTO DEMO error' }, { status: 502 }); }
    }
    return baseWorker.fetch(req, env, ctx);
  },
  async scheduled(event, env, ctx) {
    await baseWorker.scheduled(event, env, ctx);
    try { await autoDemo(env); } catch (_e) {}
  }
};
