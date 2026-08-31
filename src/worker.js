const COINBASE = 'https://api.exchange.coinbase.com';

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

async function coinbase(path) {
  const r = await fetch(COINBASE + path, {
    headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2/1.0' },
    cf: { cacheTtl: 0, cacheEverything: false }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Market API HTTP ${r.status}: ${text.slice(0, 180)}`);
  try { return JSON.parse(text); }
  catch { throw new Error('Market API trả về dữ liệu không hợp lệ'); }
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
  const [ticker, stats, candles] = await Promise.all([
    coinbase('/products/BTC-USD/ticker'),
    coinbase('/products/BTC-USD/stats'),
    coinbase('/products/BTC-USD/candles?granularity=60')
  ]);

  if (!Array.isArray(candles) || candles.length < 200) {
    throw new Error(`Không đủ dữ liệu nến: ${Array.isArray(candles) ? candles.length : 0}`);
  }

  const ordered = candles
    .map(x => ({ time: Number(x[0]), low: Number(x[1]), high: Number(x[2]), open: Number(x[3]), close: Number(x[4]), volume: Number(x[5]) }))
    .filter(x => Number.isFinite(x.close) && Number.isFinite(x.time))
    .sort((a, b) => a.time - b.time);

  const closes = ordered.map(x => x.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  const price = Number(ticker.price);
  const open24h = Number(stats.open);
  const change24h = Number.isFinite(open24h) && open24h > 0 ? ((price - open24h) / open24h) * 100 : null;

  let score = 50;
  if (e20 != null && e50 != null) score += e20 > e50 ? 15 : -15;
  if (e50 != null && e200 != null) score += e50 > e200 ? 15 : -15;
  if (r != null) score += r > 55 ? 10 : r < 45 ? -10 : 0;
  score = Math.max(1, Math.min(99, Math.round(score)));

  const signal = score >= 65 ? 'LONG' : score <= 35 ? 'SHORT' : 'NO TRADE';
  return {
    ok: true,
    symbol: 'BTCUSDT',
    source: 'Coinbase BTC-USD',
    price,
    bid: Number(ticker.bid),
    ask: Number(ticker.ask),
    change24h,
    score,
    signal,
    indicators: { ema20: e20, ema50: e50, ema200: e200, rsi14: r },
    candles: ordered.slice(-120),
    updatedAt: new Date().toISOString()
  };
}

function html() {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTC AI Signal 2</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{font-family:Arial,sans-serif;background:#0b1020;color:#eef;padding:24px;max-width:1180px;margin:auto}h1{margin:0 0 4px;font-size:34px}small{color:#9aa8c4}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.card{background:#151d33;border:1px solid #293653;border-radius:12px;padding:16px}.v{font-size:25px;font-weight:700;margin-top:8px}.wide{margin-top:16px}.chart-wrap{height:360px;position:relative;margin-top:12px}.chart-wrap canvas{width:100%;height:100%;display:block}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.pill{padding:7px 10px;border:1px solid #33415f;border-radius:999px;color:#b9c6df;font-size:13px}.history{width:100%;border-collapse:collapse;margin-top:10px}.history th,.history td{text-align:left;padding:10px;border-bottom:1px solid #293653;font-size:14px}.long{color:#65e6a2}.short{color:#ff7d8b}.neutral{color:#cbd5e1}.muted{color:#7f8da8}@media(max-width:650px){body{padding:14px}h1{font-size:28px}.chart-wrap{height:280px}}
</style></head><body><h1>BTC AI Signal 2</h1><small>Dữ liệu BTC realtime • Paper trading • Không giao dịch tiền thật</small>
<div class="grid" style="margin-top:20px"><div class="card">Giá<div id="price" class="v">--</div></div><div class="card">24h<div id="chg" class="v">--</div></div><div class="card">Score<div id="score" class="v">--</div></div><div class="card">Tín hiệu<div id="signal" class="v">--</div></div><div class="card">EMA20<div id="e20" class="v">--</div></div><div class="card">EMA50<div id="e50" class="v">--</div></div><div class="card">EMA200<div id="e200" class="v">--</div></div><div class="card">RSI14<div id="rsi" class="v">--</div></div></div>
<div class="card wide"><b>Biểu đồ BTC/USD — 120 nến 1 phút</b><div class="toolbar"><span class="pill">Giá</span><span class="pill">EMA20</span><span class="pill">EMA50</span><span class="pill">EMA200</span></div><div class="chart-wrap"><canvas id="chart"></canvas></div></div>
<div class="card wide"><b>Lịch sử tín hiệu trong phiên</b><table class="history"><thead><tr><th>Thời gian</th><th>Giá</th><th>Score</th><th>Tín hiệu</th></tr></thead><tbody id="history"><tr><td colspan="4" class="muted">Chưa có dữ liệu</td></tr></tbody></table></div>
<div class="card wide"><b>Trạng thái</b><pre id="status" style="white-space:pre-wrap;color:#cbd5e1">Đang đồng bộ...</pre></div>
<script>
const state={history:[],lastSignal:null,lastUpdated:null};
const $=id=>document.getElementById(id);
function fmt(n,d=2){return Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'--'}
function cls(s){return s==='LONG'?'long':s==='SHORT'?'short':'neutral'}
function remember(d){
  const key=d.updatedAt+'|'+d.signal+'|'+d.score;
  if(state.lastSignal===key)return;
  state.lastSignal=key;
  state.history.unshift({time:d.updatedAt,price:d.price,score:d.score,signal:d.signal});
  state.history=state.history.slice(0,30);
  localStorage.setItem('btcSignalHistory',JSON.stringify(state.history));
}
function loadHistory(){try{const x=JSON.parse(localStorage.getItem('btcSignalHistory')||'[]');if(Array.isArray(x))state.history=x.slice(0,30)}catch{}}
function renderHistory(){
  $('history').innerHTML=state.history.length?state.history.map(x=>'<tr><td>'+new Date(x.time).toLocaleTimeString('vi-VN')+'</td><td>'+fmt(x.price)+'</td><td>'+x.score+'</td><td class="'+cls(x.signal)+'"><b>'+x.signal+'</b></td></tr>').join(''):'<tr><td colspan="4" class="muted">Chưa có dữ liệu</td></tr>';
}
function draw(c){
  const canvas=$('chart'),box=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,Math.floor(box.width*dpr));canvas.height=Math.max(1,Math.floor(box.height*dpr));
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const w=box.width,h=box.height;
  ctx.clearRect(0,0,w,h);if(!c||!c.length)return;
  const values=c.map(x=>x.close), emaN=(p)=>{if(values.length<p)return[];let k=2/(p+1),e=values.slice(0,p).reduce((a,b)=>a+b,0)/p,r=new Array(p-1).fill(null);r.push(e);for(let i=p;i<values.length;i++){e=values[i]*k+e*(1-k);r.push(e)}return r};
  const lines=[{v:values,label:'price'},{v:emaN(20),label:'ema20'},{v:emaN(50),label:'ema50'},{v:emaN(200),label:'ema200'}];
  const all=lines.flatMap(x=>x.v.filter(Number.isFinite));let min=Math.min(...all),max=Math.max(...all),pad=(max-min)*.08||1;min-=pad;max+=pad;
  const px=i=>i*(w-12)/(values.length-1)+6,py=v=>h-18-(v-min)*(h-36)/(max-min);
  ctx.strokeStyle='rgba(120,140,180,.18)';ctx.lineWidth=1;for(let i=0;i<5;i++){let y=18+i*(h-36)/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  ctx.fillStyle='#8d9ab5';ctx.font='12px Arial';ctx.fillText(fmt(max),6,13);ctx.fillText(fmt(min),6,h-4);
  const drawLine=(arr,width)=>{ctx.lineWidth=width;ctx.beginPath();let started=false;arr.forEach((v,i)=>{if(!Number.isFinite(v)){started=false;return}const x=px(i),y=py(v);if(!started){ctx.moveTo(x,y);started=true}else ctx.lineTo(x,y)});ctx.stroke()};
  ctx.strokeStyle='#eef2ff';drawLine(lines[0].v,2.2);ctx.strokeStyle='#61a5ff';drawLine(lines[1].v,1.3);ctx.strokeStyle='#f2c94c';drawLine(lines[2].v,1.3);ctx.strokeStyle='#c084fc';drawLine(lines[3].v,1.3);
}
async function tick(){
  try{
    const r=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'});const d=await r.json();
    if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));
    if(!Number.isFinite(Number(d.price)))throw new Error('API không trả về giá BTC');
    $('price').textContent=fmt(d.price)+' USD';$('chg').textContent=Number.isFinite(Number(d.change24h))?fmt(d.change24h)+'%':'--';$('score').textContent=d.score;$('signal').textContent=d.signal;$('signal').className='v '+cls(d.signal);
    $('e20').textContent=fmt(d.indicators?.ema20);$('e50').textContent=fmt(d.indicators?.ema50);$('e200').textContent=fmt(d.indicators?.ema200);$('rsi').textContent=fmt(d.indicators?.rsi14);
    $('status').textContent='Đã đồng bộ: '+new Date(d.updatedAt).toLocaleString('vi-VN')+' | Nến: '+d.candles.length+' | Nguồn: '+d.source;
    remember(d);renderHistory();draw(d.candles);
  }catch(e){$('status').textContent='Lỗi API: '+e.message;}
}
loadHistory();renderHistory();tick();setInterval(tick,10000);addEventListener('resize',()=>window.lastCandles&&draw(window.lastCandles));
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
