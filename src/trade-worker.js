import baseWorker from './worker.js';
import { buildTradePlan } from './strategy.js';
import { getFiveTimeframes } from './timeframes.js';
import { page } from './dashboard.js';
import { PaperTrading } from './paper-engine.js';

const API='https://api.exchange.coinbase.com';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});

async function get(path){
  const r=await fetch(API+path,{headers:{accept:'application/json','user-agent':'btc-ai-signal2/2.4'}});
  const text=await r.text();
  if(!r.ok)throw new Error(`Market API HTTP ${r.status}: ${text.slice(0,160)}`);
  return JSON.parse(text);
}
async function getCandles(granularity){
  const raw=await get(`/products/BTC-USD/candles?granularity=${granularity}`);
  if(!Array.isArray(raw))throw new Error('Market API trả dữ liệu không hợp lệ');
  const candles=raw.map(x=>({time:+x[0],low:+x[1],high:+x[2],open:+x[3],close:+x[4],volume:+x[5]})).filter(x=>Object.values(x).every(Number.isFinite)).sort((a,b)=>a.time-b.time);
  if(candles.length<200)throw new Error(`Không đủ nến ${granularity}s: ${candles.length}`);
  return candles;
}

function paperStub(env){
  if(!env.PAPER_TRADING)throw new Error('Chưa có binding PAPER_TRADING');
  return env.PAPER_TRADING.get(env.PAPER_TRADING.idFromName('btc-ai-signal2-paper'));
}
async function paperRequest(env,path,init={}){return paperStub(env).fetch(`https://paper${path}`,init);}

function paperPanel(html){
  const panel=`<div id="paper-panel" style="margin-top:18px;background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><b>Paper Trading — DEMO</b><span id="paper-live" style="color:#94a3c5">Đang kiểm tra...</span></div><div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px"><div style="background:#0d1426;border-radius:8px;padding:10px">Vốn DEMO<b id="paper-capital" style="display:block;margin-top:4px">--</b></div><div style="background:#0d1426;border-radius:8px;padding:10px">Vị thế<b id="paper-side" style="display:block;margin-top:4px">--</b></div><div style="background:#0d1426;border-radius:8px;padding:10px">Entry / Giá<b id="paper-price" style="display:block;margin-top:4px">--</b></div><div style="background:#0d1426;border-radius:8px;padding:10px">Unrealized P/L<b id="paper-pnl" style="display:block;margin-top:4px">--</b></div></div><div id="paper-detail" style="margin-top:10px;color:#94a3c5">Paper engine chưa được kiểm tra.</div></div><script>(async()=>{const f=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';async function check(){try{const m=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());const d=await fetch('/api/paper/status?price='+encodeURIComponent(m.price)+'&ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());if(!d.ok)throw Error(d.error||'Paper status lỗi');document.getElementById('paper-live').textContent='✓ PAPER ENGINE ONLINE';document.getElementById('paper-live').style.color='#55dc92';document.getElementById('paper-capital').textContent=f(d.capital);document.getElementById('paper-side').textContent=d.position?d.position.side+' / '+d.position.status:'KHÔNG CÓ LỆNH';document.getElementById('paper-price').textContent=d.position?f(d.position.entry)+' / '+f(m.price):'-- / '+f(m.price);document.getElementById('paper-pnl').textContent=d.position?f(d.position.unrealizedPnl):'0.00';document.getElementById('paper-detail').textContent='Trades: '+(d.trades?.length||0)+' | Equity: '+f(d.equity)+' | Cập nhật '+new Date(d.updatedAt).toLocaleTimeString('vi-VN');}catch(e){document.getElementById('paper-live').textContent='✕ PAPER ENGINE ERROR';document.getElementById('paper-live').style.color='#ff7181';document.getElementById('paper-detail').textContent='Lỗi: '+e.message;}}check();setInterval(check,3000)})();</script>`;
  return html.replace('</main>',panel+'</main>');
}

export { PaperTrading };

export default {
  async fetch(req,env,ctx){
    const url=new URL(req.url);
    if(url.pathname==='/')return new Response(paperPanel(page()),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if(url.pathname==='/api/timeframes'){
      try{return json(await getFiveTimeframes());}catch(e){return json({ok:false,error:e?.message||'Timeframe error'},502)}
    }
    if(url.pathname==='/api/trade-plan'){
      try{
        const [m1,m5,m15]=await Promise.all([getCandles(60),getCandles(300),getCandles(900)]);
        const plan=buildTradePlan(m1,m5,m15,{riskPct:url.searchParams.get('riskPct'),maxLeverage:url.searchParams.get('maxLeverage')});
        return json({ok:true,...plan,source:'Coinbase BTC-USD'});
      }catch(e){return json({ok:false,error:e?.message||'Trade plan error'},502)}
    }
    if(url.pathname.startsWith('/api/paper/')){
      try{
        const sub=url.pathname.slice('/api/paper'.length)||'/status';
        const init={method:req.method,headers:req.headers,body:req.method==='GET'||req.method==='HEAD'?undefined:req.body};
        const target=new URL('https://paper'+sub); target.search=url.search;
        const r=await paperRequest(env,target.pathname+target.search,init);
        return new Response(r.body,{status:r.status,headers:r.headers});
      }catch(e){return json({ok:false,error:e?.message||'Paper trading error'},502)}
    }
    return baseWorker.fetch(req,env,ctx);
  },

  async scheduled(_event,env){
    try{
      if(!env.PAPER_TRADING)return;
      const ticker=await get('/products/BTC-USD/ticker');
      const price=Number(ticker.price);
      if(!Number.isFinite(price))return;
      await paperRequest(env,'/tick',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({price})});
    }catch(_e){
      // Background paper-management errors must not break the Worker cron.
    }
  }
};
