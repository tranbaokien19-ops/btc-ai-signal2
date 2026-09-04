const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function page() {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BTC AI Signal 2</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080d1b;color:#eef3ff;font-family:Arial,sans-serif}main{max-width:1400px;margin:auto;padding:28px}h1{margin:0 0 6px;font-size:34px}h2{margin:0;font-size:18px}small,.muted{color:#94a3c5}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:20px}.badge{border:1px solid #2b3a5e;border-radius:999px;padding:8px 12px;color:#b9c7e8}.grid{display:grid;grid-template-columns:repeat(8,minmax(120px,1fr));gap:12px}.card{background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px}.metric{font-size:24px;font-weight:700;margin-top:8px}.section{margin-top:18px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.tf-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.tf{padding:14px}.tf-head{display:flex;justify-content:space-between;align-items:center}.tf-name{font-size:22px;font-weight:700}.trend{font-size:12px;border-radius:999px;padding:5px 8px;border:1px solid #344362}.bull{color:#55dc92}.bear{color:#ff7181}.mixed{color:#f4ca58}.live{color:#55dc92;border-color:#55dc92}.tf-metrics{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.mini{background:#0d1426;border-radius:8px;padding:8px}.mini b{display:block;margin-top:4px}.chart{height:150px;margin-top:12px}.chart canvas{width:100%;height:100%;display:block}.consensus{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.status{line-height:1.7}.good{color:#55dc92}.warn{color:#f4ca58}.bad,.error{color:#ff7181}.error{white-space:pre-wrap}.loading{opacity:.7}@media(max-width:1050px){.grid{grid-template-columns:repeat(4,1fr)}.tf-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){main{padding:14px}h1{font-size:28px}.grid{grid-template-columns:repeat(2,1fr)}.tf-grid,.consensus{grid-template-columns:1fr}.metric{font-size:20px}}
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
<div class="section"><div class="section-head"><h2>5 KHUNG AI HỌC — M5 • M15 • M30 • H1 • H4</h2><span class="muted">Mỗi khung dùng nến đúng timeframe</span></div><div id="tfGrid" class="tf-grid"><div class="card loading">Đang tải 5 khung...</div></div></div>
<div class="section"><div class="section-head"><h2>Đồng thuận đa khung</h2><span class="muted">Chỉ là phân tích, chưa tự giao dịch</span></div><div class="consensus"><div class="card">Xu hướng chung<div id="consensusTrend" class="metric">--</div></div><div class="card">Số khung tăng<div id="bullCount" class="metric">--</div></div><div class="card">Số khung giảm<div id="bearCount" class="metric">--</div></div></div></div>
<div class="section card status"><b>Trạng thái hệ thống</b><div id="status" class="muted">Đang đồng bộ dữ liệu...</div></div>
</main>
<script>
const $=(id)=>document.getElementById(id);
const fmt=(n,d=2)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'--';
const trendClass=(t)=>t==='BULLISH'?'bull':t==='BEARISH'?'bear':'mixed';
const trendText=(t)=>t==='BULLISH'?'TĂNG':t==='BEARISH'?'GIẢM':'HỖN HỢP';
const STEP={M5:300,M15:900,M30:1800,H1:3600,H4:14400};
let liveStore={};

function ema(values,period){
  if(!Array.isArray(values)||values.length<period)return null;
  const k=2/(period+1);let e=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++)e=values[i]*k+e*(1-k);
  return e;
}
function rsi(values,period=14){
  if(!Array.isArray(values)||values.length<=period)return null;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];if(d>=0)gain+=d;else loss-=d;}
  let ag=gain/period,al=loss/period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1],g=Math.max(d,0),l=Math.max(-d,0);ag=(ag*(period-1)+g)/period;al=(al*(period-1)+l)/period;}
  return al===0?100:100-100/(1+ag/al);
}
function analyzeLive(candles){
  const closes=candles.map(c=>Number(c.close)).filter(Number.isFinite);
  const e20=ema(closes,20),e50=ema(closes,50),e200=ema(closes,200),r=rsi(closes),last=candles[candles.length-1];
  const trend=e20!=null&&e50!=null&&e200!=null
    ?(last.close>e20&&e20>e50&&e50>e200?'BULLISH':last.close<e20&&e20<e50&&e50<e200?'BEARISH':'MIXED'):'UNKNOWN';
  return {close:last?.close??null,ema20:e20,ema50:e50,ema200:e200,rsi14:r,trend};
}

// Server supplies enough historical candles for EMA200. The current candle is
// then updated directly from the same realtime BTC price. Thus each timeframe
// has its own OHLC and its own live EMA/RSI calculation.
function syncLiveCandles(timeframes,price){
  const p=Number(price);if(!Array.isArray(timeframes)||!Number.isFinite(p))return [];
  const now=Math.floor(Date.now()/1000);
  return timeframes.map(t=>{
    const step=STEP[t.timeframe];
    const source=Array.isArray(t.calcCandles)?t.calcCandles:t.candles;
    if(!step||!Array.isArray(source)||!source.length)return t;
    const bucket=Math.floor(now/step)*step;
    let state=liveStore[t.timeframe];
    if(!state||state.bucket!==bucket){
      const arr=source.map(c=>({time:Number(c.time),open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume)||0}));
      let current=arr.find(c=>c.time===bucket);
      if(!current){
        const prev=arr[arr.length-1],open=Number.isFinite(prev?.close)?prev.close:p;
        current={time:bucket,open,high:Math.max(open,p),low:Math.min(open,p),close:p,volume:0};arr.push(current);
      }else{current.close=p;current.high=Math.max(current.high,p);current.low=Math.min(current.low,p);}
      liveStore[t.timeframe]={bucket,candles:arr.slice(-300)};state=liveStore[t.timeframe];
    }else{
      const arr=state.candles;let current=arr[arr.length-1];
      if(!current||current.time!==bucket){const open=Number.isFinite(current?.close)?current.close:p;current={time:bucket,open,high:Math.max(open,p),low:Math.min(open,p),close:p,volume:0};arr.push(current);}
      else{current.close=p;current.high=Math.max(current.high,p);current.low=Math.min(current.low,p);}
      state.candles=arr.slice(-300);
    }
    const calc=analyzeLive(state.candles);
    return {...t,...calc,candles:state.candles.slice(-120),calcCandles:state.candles};
  });
}

function drawCandles(canvas,candles){
  const box=canvas.getBoundingClientRect(),q=devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(box.width*q));canvas.height=Math.max(1,Math.floor(box.height*q));
  const x=canvas.getContext('2d');x.setTransform(q,0,0,q,0,0);const w=box.width,h=box.height;x.clearRect(0,0,w,h);if(!candles?.length)return;
  const c=candles.slice(-60),lo=Math.min(...c.map(z=>z.low)),hi=Math.max(...c.map(z=>z.high)),span=hi-lo||1,pad=span*.08,min=lo-pad,max=hi+pad,left=4,right=42,top=8,bottom=8,ww=w-left-right,hh=h-top-bottom;
  const px=i=>left+i*ww/Math.max(1,c.length-1),py=v=>top+(max-v)*hh/(max-min),cw=Math.max(2,ww/c.length*.68);
  x.strokeStyle='rgba(120,140,180,.16)';x.lineWidth=1;for(let i=1;i<4;i++){const y=top+i*hh/4;x.beginPath();x.moveTo(left,y);x.lineTo(w-right,y);x.stroke();}
  c.forEach((z,i)=>{const xx=px(i),yo=py(z.open),yc=py(z.close),yh=py(z.high),yl=py(z.low),up=z.close>=z.open,live=i===c.length-1,col=up?'#35d07f':'#ff6575';x.strokeStyle=col;x.fillStyle=col;x.lineWidth=live?2:1;x.beginPath();x.moveTo(xx,yh);x.lineTo(xx,yl);x.stroke();const y=Math.min(yo,yc),bh=Math.max(2,Math.abs(yc-yo));x.fillRect(xx-cw/2,y,cw,bh);if(live){x.strokeStyle='#fff';x.lineWidth=1;x.strokeRect(xx-cw/2-1,y-1,cw+2,bh+2);}});
  const live=c[c.length-1],liveY=py(live.close),liveX=px(c.length-1);x.setLineDash([4,4]);x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=1;x.beginPath();x.moveTo(left,liveY);x.lineTo(w-right,liveY);x.stroke();x.setLineDash([]);x.fillStyle='#fff';x.font='10px Arial';x.fillText(fmt(live.close),Math.min(w-right+3,liveX+6),Math.max(11,liveY-4));
}

function renderTF(data){
  const grid=$('tfGrid');if(!Array.isArray(data)||!data.length){grid.innerHTML='<div class="card error">Không nhận được dữ liệu 5 khung.</div>';return;}
  let bull=0,bear=0;
  grid.innerHTML=data.map((t,i)=>{if(t.trend==='BULLISH')bull++;if(t.trend==='BEARISH')bear++;return '<div class="card tf"><div class="tf-head"><span class="tf-name">'+t.timeframe+'</span><span class="trend '+trendClass(t.trend)+'">'+trendText(t.trend)+'</span></div><div class="chart"><canvas id="tf-'+i+'"></canvas></div><div class="tf-metrics"><div class="mini">Giá hiện tại<b>'+fmt(t.close)+'</b></div><div class="mini">RSI14<b>'+fmt(t.rsi14)+'</b></div><div class="mini">EMA20<b>'+fmt(t.ema20)+'</b></div><div class="mini">EMA50<b>'+fmt(t.ema50)+'</b></div><div class="mini">EMA200<b>'+fmt(t.ema200)+'</b></div><div class="mini">Nến tính EMA<b>'+(t.calcCandles?.length||0)+'</b></div></div></div>';}).join('');
  data.forEach((t,i)=>drawCandles($('tf-'+i),t.candles));$('bullCount').textContent=bull;$('bearCount').textContent=bear;$('consensusTrend').textContent=bull>=4?'TĂNG MẠNH':bear>=4?'GIẢM MẠNH':bull>bear?'NGHIÊNG TĂNG':bear>bull?'NGHIÊNG GIẢM':'TRUNG TÍNH';
}

async function getJSON(path){const r=await fetch(path+'?ts='+Date.now(),{cache:'no-store'});const d=await r.json();if(!r.ok||d.ok===false)throw new Error(d.error||('HTTP '+r.status));return d}

async function tick(){try{
  const [m,tf]=await Promise.all([getJSON('/api/market'),getJSON('/api/timeframes')]);
  const liveTF=syncLiveCandles(tf.timeframes,m.price);window.__tf=liveTF;
  $('price').textContent=fmt(m.price)+' USD';$('change').textContent=Number.isFinite(+m.change24h)?fmt(m.change24h)+'%':'--';$('score').textContent=m.score;$('signal').textContent=m.signal;
  $('ema20').textContent=fmt(m.indicators.ema20);$('ema50').textContent=fmt(m.indicators.ema50);$('ema200').textContent=fmt(m.indicators.ema200);$('rsi').textContent=fmt(m.indicators.rsi14);
  renderTF(liveTF);const tm=new Date(m.updatedAt||tf.updatedAt);$('updated').textContent='Cập nhật '+tm.toLocaleTimeString('vi-VN');$('status').innerHTML='<span class="good">✓ Đã đồng bộ</span> | '+tf.source+' | <span class="live">5 EMA realtime theo đúng timeframe</span> | M30=2×M15, H4=4×H1 | Giá '+fmt(m.price)+' | '+tm.toLocaleTimeString('vi-VN');
}catch(e){$('status').innerHTML='<span class="error">Lỗi: '+esc(e.message)+'</span>'}}

async function loadDailyReport(){
  const status=document.getElementById('daily-report-status');
  if(!status)return;
  const f=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';
  const pct=n=>Number.isFinite(Number(n))?Number(n).toFixed(2)+'%':'--';
  const esc=v=>String(v??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])).replace(/'/g,'&#39;');
  const card=(title,v)=>'<div style="background:#0d1426;border-radius:8px;padding:10px">'+esc(title)+'<b style="display:block;margin-top:4px">'+esc(v)+'</b></div>';
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    const r=await fetch('/api/paper/daily-learning-report?ts='+Date.now(),{cache:'no-store',signal:controller.signal});
    clearTimeout(timer);
    const d=await r.json();
    if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));
    const a=d.summary||{};
    status.textContent='✓ BÁO CÁO '+(d.dateVN||'HÔM NAY'); status.style.color='#55dc92';
    document.getElementById('daily-report-grid').innerHTML=
      card('Lệnh học hôm nay',a.trades||0)+card('Thắng / Thua',(a.wins||0)+' / '+(a.losses||0))+
      card('Win rate',pct(a.winRate))+card('P&L',f(a.pnl))+card('Avg R',Number(a.avgR||0).toFixed(2)+'R')+
      card('Forecast đúng',pct(a.forecastAccuracy))+card('Scenario khớp',pct(a.scenarioAccuracy))+
      card('Learning score',Number(a.avgLearningScore||0).toFixed(2));
    document.getElementById('daily-report-summary').textContent=d.summaryText||'Chưa có dữ liệu.';
    document.getElementById('daily-report-lessons').textContent=d.lessonText||'Chưa có bài học.';
    const hist=(d.reports||[]).map(x=>'<div style="padding:7px 0;border-bottom:1px solid #293756"><b>'+esc(x.dateVN)+'</b> | '+esc(x.trades)+' lệnh | W/L '+esc(x.wins)+'/'+esc(x.losses)+' | WR '+pct(x.winRate)+' | P&L '+f(x.pnl)+' | Avg R '+Number(x.avgR||0).toFixed(2)+' | Forecast '+pct(x.forecastAccuracy)+'</div>').join('');
    document.getElementById('daily-report-history').innerHTML='<b>LỊCH SỬ BÁO CÁO — 14 NGÀY GẦN NHẤT</b><div style="margin-top:6px">'+(hist||'Chưa có báo cáo đã lưu.')+'</div>';
  }catch(e){
    status.textContent=e.name==='AbortError'?'✕ DAILY REPORT TIMEOUT':'✕ DAILY REPORT ERROR'; status.style.color='#ff7181';
    document.getElementById('daily-report-summary').textContent='Lỗi tải báo cáo: '+(e.message||'Không đọc được dữ liệu');
    document.getElementById('daily-report-lessons').textContent='Bài học AI: chưa thể tổng hợp do lỗi tải báo cáo.';
    document.getElementById('daily-report-history').textContent='Lịch sử báo cáo: chưa tải được.';
  }
}
tick();setInterval(tick,1000);
addEventListener('resize',()=>document.querySelectorAll('canvas').forEach((c)=>{const i=c.id.startsWith('tf-')?Number(c.id.slice(3)):-1;if(i>=0&&window.__tf)drawCandles(c,window.__tf[i].candles)}));
addEventListener('DOMContentLoaded',()=>{loadDailyReport();setInterval(loadDailyReport,60000)});
</script></body></html>`;
}
