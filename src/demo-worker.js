import baseWorker, { PaperTrading } from './trade-worker.js';

function addDemoButtons(html) {
  const controls = `<div id="demo-controls" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #293756"><button id="demo-reset" style="cursor:pointer;border:1px solid #405276;background:#1a2744;color:#eef3ff;border-radius:8px;padding:10px 14px;font-weight:700">Reset DEMO 1M</button><button id="demo-long" style="cursor:pointer;border:1px solid #267a52;background:#123d2a;color:#55dc92;border-radius:8px;padding:10px 14px;font-weight:700">Mở LONG DEMO</button><button id="demo-short" style="cursor:pointer;border:1px solid #8a3b46;background:#421c24;color:#ff7181;border-radius:8px;padding:10px 14px;font-weight:700">Mở SHORT DEMO</button><button id="demo-close" style="cursor:pointer;border:1px solid #765d28;background:#3b3015;color:#f4ca58;border-radius:8px;padding:10px 14px;font-weight:700">Đóng lệnh</button><span id="demo-action" style="align-self:center;color:#94a3c5">Bấm nút để test Paper Trading</span></div>`;
  const script = `<script>(function(){const $=id=>document.getElementById(id);async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));return d}async function price(){const d=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());if(!d.ok)throw Error(d.error||'Market lỗi');return Number(d.price)}async function act(label,fn){$('demo-action').textContent=label+'...';try{await fn();$('demo-action').textContent='✓ '+label+' thành công'}catch(e){$('demo-action').textContent='✕ '+e.message;console.error(e)}}$('demo-reset').onclick=()=>act('Reset DEMO',()=>post('/api/paper/reset',{capital:1000000}));$('demo-long').onclick=()=>act('Mở LONG',async()=>{const p=await price();return post('/api/paper/open',{side:'LONG',entry:p,stopLoss:p-100,takeProfit1:p+100,takeProfit2:p+200,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_LONG_BUTTON',entryReason:'Nút demo'});});$('demo-short').onclick=()=>act('Mở SHORT',async()=>{const p=await price();return post('/api/paper/open',{side:'SHORT',entry:p,stopLoss:p+100,takeProfit1:p-100,takeProfit2:p-200,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_SHORT_BUTTON',entryReason:'Nút demo'});});$('demo-close').onclick=()=>act('Đóng lệnh',async()=>{const p=await price();return post('/api/paper/close',{price:p,reason:'BUTTON'});});})();</script>`;
  return html.replace('<script>(async()=>{', controls + '<script>(async()=>{').replace('</body></html>', script + '</body></html>');
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
    return baseWorker.fetch(req, env, ctx);
  },
  async scheduled(event, env, ctx) {
    return baseWorker.scheduled(event, env, ctx);
  }
};
