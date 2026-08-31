const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function page() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BTC AI Signal 2</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080d1b;color:#eef3ff;font-family:Arial,sans-serif}main{max-width:1400px;margin:auto;padding:28px}h1{margin:0 0 6px;font-size:34px}h2{margin:0;font-size:18px}small,.muted{color:#94a3c5}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:20px}.badge{border:1px solid #2b3a5e;border-radius:999px;padding:8px 12px;color:#b9c7e8}.grid{display:grid;grid-template-columns:repeat(8,minmax(120px,1fr));gap:12px}.card{background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px}.metric{font-size:24px;font-weight:700;margin-top:8px}.section{margin-top:18px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.tf-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.tf{padding:14px}.tf-head{display:flex;justify-content:space-between;align-items:center}.tf-name{font-size:22px;font-weight:700}.trend{font-size:12px;border-radius:999px;padding:5px 8px;border:1px solid #344362}.bull{color:#55dc92}.bear{color:#ff7181}.mixed{color:#f4ca58}.tf-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.mini{background:#0d1426;border-radius:8px;padding:8px}.mini b{display:block;margin-top:4px}.chart{height:150px;margin-top:12px}.chart canvas{width:100%;height:100%;display:block}.consensus{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.status{line-height:1.7}.good{color:#55dc92}.warn{color:#f4ca58}.bad{color:#ff7181}.error{color:#ff7181;white-space:pre-wrap}.loading{opacity:.7}@media(max-width:1050px){.grid{grid-template-columns:repeat(4,1fr)}.tf-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){main{padding:14px}h1{font-size:28px}.grid{grid-template-columns:repeat(2,1fr)}.tf-grid,.consensus{grid-template-columns:1fr}.metric{font-size:20px}}
</style>
</head>
<body><main>
<div class="top"><div><h1>BTC AI Signal 2</h1><small>Dữ liệu BTC realtime • Paper trading • Không giao dịch tiền thật</small></div><div id="updated" class="badge">Đang đồng bộ...</div></div>
<div class="grid">
<div class="card">Giá<div id="price" class="metric">--</div></div>
<div class="card">24h<div id="change" class="metric">--</div></div>
<div class="card">Score<div id="score" class="metric">--</div></div>
<div class="card">Tín hiệu<div id="signal" class="metric">--</div></div>
<div class="card">EMA20<div id="ema20" class="metric">--</div></div>
<div class="card">EMA50<div id="ema50" class="metric">--</div></div>
<div class="card">EMA200<div id="ema200" class="metric">--</div></div>
<div class="card">RSI14<div id="rsi" class="metric">--</div></div>
</div>
<div class="section"><div class="section-head"><h2>5 KHUNG AI HỌC — M5 • M15 • M30 • H1 • H4</h2><span class="muted">Cùng một BTC-USD realtime</span></div><div id="tfGrid" class="tf-grid"><div class="card loading">Đang tải 5 khung...</div></div></div>
<div class="section"><div class="section-head"><h2>Đồng thuận đa khung</h2><span class="muted">Chỉ là phân tích, chưa tự giao dịch</span></div><div class="consensus"><div class="card">Xu hướng chung<div id="consensusTrend" class="metric">--</div></div><div class="card">Số khung tăng<div id="bullCount" class="metric">--</div></div><div class="card">Số khung giảm<div id="bearCount" class="metric">--</div></div></div></div>
<div class="section card status"><b>Trạng thái hệ thống</b><div id="status" class="muted">Đang đồng bộ dữ liệu...</div></div>
</main>
<script>
const $=(id)=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'--';
const trendClass=(t)=>t==='BULLISH'?'bull':t==='BEARISH'?'bear':'mixed';
const trendText=(t)=>t==='BULLISH'?'TĂNG':t==='BEARISH'?'GIẢM':'HỖN HỢP';
function drawCandles(canvas,candles){
  const box=canvas.getBoundingClientRect(),q=devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(box.width*q));canvas.height=Math.max(1,Math.floor(box.height*q));
  const x=canvas.getContext('2d');x.setTransform(q,0,0,q,0,0);const w=box.width,h=box.height;x.clearRect(0,0,w,h);if(!candles?.length)return;
  const c=candles.slice(-60),lo=Math.min(...c.map(z=>z.low)),hi=Math.max(...c.map(z=>z.high)),span=hi-lo||1,pad=span*.08,min=lo-pad,max=hi+pad,left=4,right=4,top=8,bottom=8,ww=w-left-right,hh=h-top-bottom,px=i=>left+i*ww/Math.max(1,c.length-1),py=v=>top+(max-v)*hh/(max-min),cw=Math.max(2,ww/c.length*.68);
  x.strokeStyle='rgba(120,140,180,.16)';x.lineWidth=1;for(let i=1;i<4;i++){const y=top+i*hh/4;x.beginPath();x.moveTo(left,y);x.lineTo(w-right,y);x.stroke()}
  c.forEach((z,i)=>{const xx=px(i),yo=py(z.open),yc=py(z.close),yh=py(z.high),yl=py(z.low),up=z.close>=z.open,col=up?'#35d07f':'#ff6575';x.strokeStyle=col;x.fillStyle=col;x.lineWidth=1;x.beginPath();x.moveTo(xx,yh);x.lineTo(xx,yl);x.stroke();const y=Math.min(yo,yc),bh=Math.max(2,Math.abs(yc-yo));x.fillRect(xx-cw/2,y,cw,bh)});
}
function renderTF(data){
  const grid=$('tfGrid');if(!Array.isArray(data)||!data.length){grid.innerHTML='<div class="card error">Không nhận được dữ liệu 5 khung.</div>';return}
  let bull=0,bear=0;
  grid.innerHTML=data.map((t,i)=>{if(t.trend==='BULLISH')bull++;if(t.trend==='BEARISH')bear++;return '<div class="card tf"><div class="tf-head"><span class="tf-name">'+t.timeframe+'</span><span class="trend '+trendClass(t.trend)+'">'+trendText(t.trend)+'</span></div><div class="chart"><canvas id="tf-'+i+'"></canvas></div><div class="tf-metrics"><div class="mini">Giá đóng<b>'+fmt(t.close)+'</b></div><div class="mini">RSI14<b>'+fmt(t.rsi14)+'</b></div><div class="mini">EMA20<b>'+fmt(t.ema20)+'</b></div><div class="mini">EMA50<b>'+fmt(t.ema50)+'</b></div><div class="mini">EMA200<b>'+fmt(t.ema200)+'</b></div><div class="mini">Nến<b>'+(t.candles?.length||0)+'</b></div></div></div>'}).join('');
  data.forEach((t,i)=>drawCandles($('tf-'+i),t.candles));
  $('bullCount').textContent=bull;$('bearCount').textContent=bear;$('consensusTrend').textContent=bull>=4?'TĂNG MẠNH':bear>=4?'GIẢM MẠNH':bull>bear?'NGHIÊNG TĂNG':bear>bull?'NGHIÊNG GIẢM':'TRUNG TÍNH';
}
async function getJSON(path){const r=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));return d}
async function tick(){try{
  const [m,tf]=await Promise.all([getJSON('/api/market'),getJSON('/api/timeframes')]);
  $('price').textContent=fmt(m.price)+' USD';$('change').textContent=Number.isFinite(+m.change24h)?fmt(m.change24h)+'%':'--';$('score').textContent=m.score;$('signal').textContent=m.signal;$('ema20').textContent=fmt(m.indicators.ema20);$('ema50').textContent=fmt(m.indicators.ema50);$('ema200').textContent=fmt(m.indicators.ema200);$('rsi').textContent=fmt(m.indicators.rsi14);renderTF(tf.timeframes);$('updated').textContent='Cập nhật '+new Date(m.updatedAt||tf.updatedAt).toLocaleTimeString('vi-VN');$('status').innerHTML='<span class="good">✓ Đã đồng bộ</span> | '+tf.source+' | 5 khung: M5, M15, M30, H1, H4 | Giá cập nhật '+new Date(m.updatedAt||tf.updatedAt).toLocaleTimeString('vi-VN');
}catch(e){$('status').innerHTML='<span class="error">Lỗi: '+esc(e.message)+'</span>'}}
tick();setInterval(tick,2000);addEventListener('resize',()=>document.querySelectorAll('canvas').forEach((c)=>{const i=c.id.startsWith('tf-')?Number(c.id.slice(3)):-1;if(i>=0&&window.__tf)drawCandles(c,window.__tf[i].candles)}));
const oldRender=renderTF;renderTF=(data)=>{window.__tf=data;oldRender(data)};
</script></body></html>`;
}
