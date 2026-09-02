import baseWorker, { PaperTrading } from './trade-worker.js';
import { getFiveTimeframes } from './timeframes.js';

const MARKET_API = 'https://api.exchange.coinbase.com';

function addDemoButtons(html) {
  const controls = `<div id="demo-controls" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid #293756"><button id="demo-reset" style="cursor:pointer;border:1px solid #405276;background:#1a2744;color:#eef3ff;border-radius:8px;padding:10px 14px;font-weight:700">Reset DEMO 1M</button><button id="demo-long" style="cursor:pointer;border:1px solid #267a52;background:#123d2a;color:#55dc92;border-radius:8px;padding:10px 14px;font-weight:700">Mở LONG DEMO</button><button id="demo-short" style="cursor:pointer;border:1px solid #8a3b46;background:#421c24;color:#ff7181;border-radius:8px;padding:10px 14px;font-weight:700">Mở SHORT DEMO</button><button id="demo-close" style="cursor:pointer;border:1px solid #765d28;background:#3b3015;color:#f4ca58;border-radius:8px;padding:10px 14px;font-weight:700">Đóng lệnh</button><span style="align-self:center;color:#55dc92;font-weight:700">AI AUTO DEMO: ON</span><span id="demo-action" style="align-self:center;color:#94a3c5">AI phân tích xu hướng 24H trước khi chọn entry</span></div><div id="demo-forecast" style="margin-top:8px;padding:9px 12px;border-radius:8px;background:#0c1427;color:#aebbd6;font-size:13px">24H FORECAST: đang phân tích...</div><div id="demo-plan" style="margin-top:8px;padding:11px 12px;border-radius:8px;background:#0a1122;border:1px solid #293756;color:#d7e0f2;font-size:13px;line-height:1.65">KẾ HOẠCH LỆNH: đang tính vùng vào...</div>`;
  const script = `<script>(function(){const $=id=>document.getElementById(id);const fmt=v=>Number(v).toLocaleString('en-US',{maximumFractionDigits:2});const onePlan=p=>!p?'chưa có dữ liệu':'KẾ HOẠCH '+p.planSide+' | Vùng vào '+fmt(p.entryLow)+'–'+fmt(p.entryHigh)+' | Entry '+fmt(p.plannedEntry)+' | SL '+fmt(p.plannedStop)+' | TP1 '+fmt(p.plannedTp1)+' | TP2 '+fmt(p.plannedTp2)+' | TP3 '+fmt(p.plannedTp3)+' | R:R 1:'+fmt(p.plannedRR)+' | '+p.planCondition;const planText=p=>{if(!p)return'KẾ HOẠCH LỆNH: chưa có dữ liệu';if(p.planSide==='RANGE')return'KẾ HOẠCH RANGE | LONG breakout '+fmt(p.long?.trigger)+' → retest '+fmt(p.long?.plannedEntry)+' | SL '+fmt(p.long?.plannedStop)+' | TP1 '+fmt(p.long?.plannedTp1)+' | TP2 '+fmt(p.long?.plannedTp2)+' | TP3 '+fmt(p.long?.plannedTp3)+' | R:R 1:'+fmt(p.long?.plannedRR)+' || SHORT breakout '+fmt(p.short?.trigger)+' → retest '+fmt(p.short?.plannedEntry)+' | SL '+fmt(p.short?.plannedStop)+' | TP1 '+fmt(p.short?.plannedTp1)+' | TP2 '+fmt(p.short?.plannedTp2)+' | TP3 '+fmt(p.short?.plannedTp3)+' | R:R 1:'+fmt(p.short?.plannedRR)+' | '+p.planCondition;return onePlan(p)};async function post(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));return d}async function price(){const d=await fetch('/api/market?ts='+Date.now(),{cache:'no-store'}).then(r=>r.json());if(!d.ok)throw Error(d.error||'Market lỗi');return Number(d.price)}async function act(label,fn){$('demo-action').textContent=label+'...';try{await fn();$('demo-action').textContent='✓ '+label+' thành công'}catch(e){$('demo-action').textContent='✕ '+e.message;console.error(e)}}$('demo-reset').onclick=()=>act('Reset DEMO',()=>post('/api/paper/reset',{capital:1000000}));$('demo-long').onclick=()=>act('Mở LONG',async()=>{const p=await price(),r=p*.0035;return post('/api/paper/open',{side:'LONG',entry:p,stopLoss:p-r,takeProfit1:p+r*1.2,takeProfit2:p+r*2,takeProfit3:p+r*3,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_LONG_BUTTON',entryReason:'Nút demo',entryMode:'MANUAL_DEMO',tpPlan:'MANUAL_3R',learningEligible:false});});$('demo-short').onclick=()=>act('Mở SHORT',async()=>{const p=await price(),r=p*.0035;return post('/api/paper/open',{side:'SHORT',entry:p,stopLoss:p+r,takeProfit1:p-r*1.2,takeProfit2:p-r*2,takeProfit3:p-r*3,leverage:3,riskPct:.5,confidence:80,timeframe:'M5/M15/M30/H1/H4',signal:'DEMO_SHORT_BUTTON',entryReason:'Nút demo',entryMode:'MANUAL_DEMO',tpPlan:'MANUAL_3R',learningEligible:false});});$('demo-close').onclick=()=>act('Đóng lệnh',async()=>{const p=await price();return post('/api/paper/close',{price:p,reason:'BUTTON'});});async function auto(){try{const r=await fetch('/api/paper/auto?ts='+Date.now(),{method:'POST',cache:'no-store'});const d=await r.json();if(d.forecast24h&&$('demo-forecast'))$('demo-forecast').textContent='24H FORECAST: '+d.forecast24h.direction+' | Bias '+d.forecast24h.bias+' | Hỗ trợ '+fmt(d.forecast24h.supportDeep)+'–'+fmt(d.forecast24h.support)+' | Kháng cự '+fmt(d.forecast24h.resistance)+'–'+fmt(d.forecast24h.resistanceHigh)+' | '+d.forecast24h.entryPlan;if($('demo-plan'))$('demo-plan').textContent=planText(d.plan);if(d.ok&&d.position){const p=d.position;$('demo-action').textContent='✓ AI AUTO '+p.side+' | Entry '+fmt(p.entry)+' | SL '+fmt(p.stopLoss)+' | TP1 '+fmt(p.tp1)+' | TP2 '+fmt(p.tp2)+' | TP3 '+fmt(p.tp3)+' | R:R 1:'+fmt(p.rr||0);if($('demo-plan'))$('demo-plan').textContent='KẾ HOẠCH LỆNH ĐÃ KÍCH HOẠT | '+p.side+' | Entry '+fmt(p.entry)+' | SL '+fmt(p.stopLoss)+' | TP1 '+fmt(p.tp1)+' | TP2 '+fmt(p.tp2)+' | TP3 '+fmt(p.tp3)+' | R:R 1:'+fmt(p.rr||0)}else if(d.ok&&d.signal){$('demo-action').textContent='AI AUTO: '+d.signal+' | Score '+(d.score??'--')+' | '+(d.entryMode||'WAIT')+' | '+(d.reason||'đang chờ')}}catch(e){$('demo-action').textContent='AI AUTO CHECK: '+e.message}}auto();setInterval(auto,15000);})();</script>`;
  return html.replace('<script>(async()=>{', controls + '<script>(async()=>{').replace('</body></html>', script + '</body></html>');
}

async function getTickerPrice() {
  const r = await fetch(`${MARKET_API}/products/BTC-USD/ticker`, { headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2-auto-demo/1.4' } });
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
function nearEma(price, ema, maxPct = 0.0045) { return Number.isFinite(ema) && Math.abs(price - ema) / price <= maxPct; }
function previousClose(t) { const candles = Array.isArray(t?.calcCandles) ? t.calcCandles : []; return Number(candles.length >= 2 ? candles[candles.length - 2]?.close : NaN); }
function slopePct(t, lookback) { const candles = Array.isArray(t?.calcCandles) ? t.calcCandles : []; if (candles.length <= lookback) return 0; const a = Number(candles[candles.length - 1]?.close), b = Number(candles[candles.length - 1 - lookback]?.close); if (!(a > 0) || !(b > 0)) return 0; return (a / b - 1) * 100; }
function recentRange(t, lookback) { const candles = Array.isArray(t?.calcCandles) ? t.calcCandles.slice(-lookback) : []; if (!candles.length) return { low: null, high: null }; const lows = candles.map(c => Number(c.low)).filter(Number.isFinite), highs = candles.map(c => Number(c.high)).filter(Number.isFinite); return { low: lows.length ? Math.min(...lows) : null, high: highs.length ? Math.max(...highs) : null }; }

function forecast24h(data, price) {
  const byTf = Object.fromEntries((data?.timeframes || []).map(t => [t.timeframe, t]));
  const h1 = byTf.H1, h4 = byTf.H4, m30 = byTf.M30;
  if (!h1 || !h4 || !(price > 0)) return { direction:'NEUTRAL_24H', bias:50, confidence:0, support:price, supportDeep:price, resistance:price, resistanceHigh:price, entryPlan:'CHỜ DỮ LIỆU' };
  let bull = 0, bear = 0;
  const vote = (v, points = 1) => { if (v > 0) bull += points; else if (v < 0) bear += points; };
  const trendVote = t => t?.trend === 'BULLISH' ? 1 : t?.trend === 'BEARISH' ? -1 : 0;
  vote(trendVote(h4),5); vote(trendVote(h1),4); vote(trendVote(m30),2); vote(slopePct(h4,3),3); vote(slopePct(h1,8),3); vote(slopePct(m30,8),1.5);
  if (Number.isFinite(h4.rsi14)) vote(h4.rsi14 - 50,2); if (Number.isFinite(h1.rsi14)) vote(h1.rsi14 - 50,1.5);
  const total = bull + bear; let bias = total ? Math.round(50 + (bull - bear) / total * 50) : 50; bias = Math.max(1,Math.min(99,bias));
  const direction = bias >= 62 ? 'BULLISH_24H' : bias <= 38 ? 'BEARISH_24H' : 'RANGE_24H'; const confidence = Math.abs(bias - 50) * 2;
  const h1Range = recentRange(h1,24), h4Range = recentRange(h4,6); const support = Math.max(0,Math.min(h1Range.low ?? price,h4Range.low ?? price)); const resistance = Math.max(h1Range.high ?? price,h4Range.high ?? price); const span = Math.max(price*.003,(resistance-support)*.10); const supportDeep = Math.max(0,support-span), resistanceHigh = resistance+span;
  let entryPlan='RANGE: chờ breakout hoặc hồi về biên, không đuổi giá'; if(direction==='BULLISH_24H') entryPlan='ƯU TIÊN LONG: hồi về hỗ trợ/EMA20 rồi reclaim'; if(direction==='BEARISH_24H') entryPlan='ƯU TIÊN SHORT: hồi lên kháng cự/EMA20 rồi reject';
  return { direction,bias,confidence,support,supportDeep,resistance,resistanceHigh,entryPlan,h1SlopePct:Number(slopePct(h1,8).toFixed(2)),h4SlopePct:Number(slopePct(h4,3).toFixed(2)),range24hLow:h1Range.low,range24hHigh:h1Range.high,generatedAt:new Date().toISOString() };
}

function adaptiveTargets(side, entry, stopDistance, f24) {
  const risk = Math.max(stopDistance, entry * 0.0035);
  const min1 = side === 'LONG' ? entry + risk * 1.2 : entry - risk * 1.2;
  const min2 = side === 'LONG' ? entry + risk * 2 : entry - risk * 2;
  const min3 = side === 'LONG' ? entry + risk * 2.5 : entry - risk * 2.5;
  if (side === 'LONG') {
    const r1 = Number(f24.resistance), r2 = Number(f24.resistanceHigh), ext = Number(f24.range24hHigh);
    const tp1 = Math.max(min1, Number.isFinite(r1) && r1 > entry ? r1 : min1);
    const tp2 = Math.max(tp1 + risk * 0.35, min2, Number.isFinite(r2) && r2 > entry ? r2 : min2);
    const tp3 = Math.max(tp2 + risk * 0.35, min3, Number.isFinite(ext) && ext > entry ? ext : min3);
    return { tp1, tp2, tp3, rr: (tp3-entry)/risk, tpPlan:'ADAPTIVE_STRUCTURE_LONG' };
  }
  const r1 = Number(f24.support), r2 = Number(f24.supportDeep), ext = Number(f24.range24hLow);
  const tp1 = Math.min(min1, Number.isFinite(r1) && r1 < entry ? r1 : min1);
  const tp2 = Math.min(tp1 - risk * 0.35, min2, Number.isFinite(r2) && r2 < entry ? r2 : min2);
  const tp3 = Math.min(tp2 - risk * 0.35, min3, Number.isFinite(ext) && ext < entry ? ext : min3);
  return { tp1, tp2, tp3, rr: (entry-tp3)/risk, tpPlan:'ADAPTIVE_STRUCTURE_SHORT' };
}

function planFromForecast(side, price, f24, m5, m15) {
  if (!f24) return null;
  const ema20s = [m5?.ema20,m15?.ema20].map(Number).filter(Number.isFinite);
  if (side === 'RANGE') {
    const longTrigger = Number(f24.resistanceHigh), shortTrigger = Number(f24.supportDeep);
    const longEntry = longTrigger, shortEntry = shortTrigger;
    const longRisk = Math.max(price*.0035, longEntry*.0035), shortRisk = Math.max(price*.0035, shortEntry*.0035);
    const longStop = longEntry-longRisk, shortStop = shortEntry+shortRisk;
    const lt = adaptiveTargets('LONG',longEntry,longRisk,f24), st = adaptiveTargets('SHORT',shortEntry,shortRisk,f24);
    return {planSide:'RANGE',long:{trigger:longTrigger,plannedEntry:longEntry,plannedStop:longStop,plannedTp1:lt.tp1,plannedTp2:lt.tp2,plannedTp3:lt.tp3,plannedRR:lt.rr},short:{trigger:shortTrigger,plannedEntry:shortEntry,plannedStop:shortStop,plannedTp1:st.tp1,plannedTp2:st.tp2,plannedTp3:st.tp3,plannedRR:st.rr},planCondition:'chờ breakout biên + retest xác nhận; không vào giữa range'};
  }
  if (!['LONG','SHORT'].includes(side)) return null;
  if (side === 'SHORT') {
    const structureLow = Number(f24.resistance), structureHigh = Number(f24.resistanceHigh), ema = ema20s.length ? Math.max(...ema20s) : price;
    let low = Math.max(structureLow, ema), high = Math.max(structureHigh, ema);
    if (!(low > price)) { low = Math.max(price, structureLow); high = Math.max(low + price*.0025, structureHigh); }
    if (high <= low) high = low + price*.0035;
    const entry = (low + high) / 2, risk = Math.max(price*.0035,(high-low)*.75,entry*.0035), stop = high + risk*.55, t = adaptiveTargets('SHORT',entry,stop-entry,f24);
    return {planSide:'SHORT',entryLow:low,entryHigh:high,plannedEntry:entry,plannedStop:stop,plannedTp1:t.tp1,plannedTp2:t.tp2,plannedTp3:t.tp3,plannedRR:t.rr,planCondition:'chờ giá hồi vào vùng kháng cự rồi có nến reject; không short giữa vùng'};
  }
  const structureHigh = Number(f24.support), structureLow = Number(f24.supportDeep), ema = ema20s.length ? Math.min(...ema20s) : price;
  let low = Math.min(structureLow, ema), high = Math.min(structureHigh, ema);
  if (!(high < price)) { high = Math.min(price, structureHigh); low = Math.min(high-price*.0025,structureLow); }
  if (high <= low) low = high-price*.0035;
  const entry = (low + high) / 2, risk = Math.max(price*.0035,(high-low)*.75,entry*.0035), stop = low-risk*.55, t = adaptiveTargets('LONG',entry,entry-stop,f24);
  return {planSide:'LONG',entryLow:low,entryHigh:high,plannedEntry:entry,plannedStop:stop,plannedTp1:t.tp1,plannedTp2:t.tp2,plannedTp3:t.tp3,plannedRR:t.rr,planCondition:'chờ giá hồi vào vùng hỗ trợ rồi reclaim; không long giữa vùng'};
}

function buildAutoSignal(data, price) {
  const required = ['M5','M15','M30','H1','H4'];
  if (!data || !Array.isArray(data.timeframes)) return { signal:'WAIT',score:50,confidence:0,scores:{},reason:'Thiếu dữ liệu 5 khung' };
  const byTf = Object.fromEntries(data.timeframes.map(t => [t.timeframe,t])); const missing=required.filter(tf=>!byTf[tf]); if(missing.length)return{signal:'WAIT',score:50,confidence:0,scores:{},reason:`Thiếu timeframe: ${missing.join(', ')}`}; if(!(Number.isFinite(price)&&price>0))return{signal:'WAIT',score:50,confidence:0,scores:{},reason:'Giá thị trường không hợp lệ'};
  const weights={M5:.10,M15:.15,M30:.20,H1:.25,H4:.30}; const scores=Object.fromEntries(required.map(tf=>[tf,timeframeScore(byTf[tf])])); const score=Math.round(Object.entries(weights).reduce((sum,[tf,w])=>sum+scores[tf]*w,0)); const confidence=Math.round(Math.abs(score-50)*2); const bullish=required.filter(tf=>scores[tf]>=60).length; const bearish=required.filter(tf=>scores[tf]<=40).length; const highBull=scores.H1>=60&&scores.H4>=60; const highBear=scores.H1<=40&&scores.H4<=40; const f24=forecast24h(data,price); const m5=byTf.M5,m15=byTf.M15; const m5Prev=previousClose(m5),m15Prev=previousClose(m15); const priceToSupport=f24.support>0?Math.max(0,(price-f24.support)/price):1; const priceToResistance=f24.resistance>0?Math.max(0,(f24.resistance-price)/price):1;
  const bullStructure=(scores.H4>=60&&scores.H1>=50)||(f24.bias>=70&&scores.H4>=60); const bearStructure=(scores.H4<=40&&scores.H1<=50)||(f24.bias<=30&&scores.H4<=40);
  const longPullback=f24.direction==='BULLISH_24H'&&bullStructure&&bullish>=2&&score>=52&&(nearEma(price,m5.ema20,.009)||nearEma(price,m15.ema20,.009)||priceToSupport<=.012)&&Number.isFinite(m5.rsi14)&&m5.rsi14>=42&&m5.rsi14<=68&&price<=m5.ema20*1.008&&(m5Prev<m5.ema20||m15Prev<m15.ema20||priceToSupport<=.006);
  const shortPullback=f24.direction==='BEARISH_24H'&&bearStructure&&bearish>=2&&score<=48&&(nearEma(price,m5.ema20,.009)||nearEma(price,m15.ema20,.009)||priceToResistance<=.012)&&Number.isFinite(m5.rsi14)&&m5.rsi14>=32&&m5.rsi14<=58&&price>=m5.ema20*.992&&(m5Prev>m5.ema20||m15Prev>m15.ema20||priceToResistance<=.006);
  const waitPlan=f24.direction==='BEARISH_24H'?planFromForecast('SHORT',price,f24,m5,m15):f24.direction==='BULLISH_24H'?planFromForecast('LONG',price,f24,m5,m15):planFromForecast('RANGE',price,f24,m5,m15);
  if(longPullback){const stopDistance=Math.max(price*.0035,Math.min(price*.006,Math.abs(price-f24.support)*.65||price*.0035)),targets=adaptiveTargets('LONG',price,stopDistance,f24),timingConfidence=Math.max(58,Math.min(84,Math.round(58+(score-52)*1.4+(f24.bias-62)*.25))),snapshot={timeframes:data.timeframes,forecast24h:f24};return{signal:'LONG',score,confidence:timingConfidence,scores,qualityGate:'PASS',entryMode:'24H_BIAS_PULLBACK',forecast24h:f24,plan:planFromForecast('LONG',price,f24,m5,m15),learningEligible:true,order:{side:'LONG',entry:price,stopLoss:price-stopDistance,takeProfit1:targets.tp1,takeProfit2:targets.tp2,takeProfit3:targets.tp3,leverage:3,riskPct:.5,confidence:timingConfidence,timeframe:'M5/M15/M30/H1/H4',signal:'AUTO_LONG_24H_PULLBACK',entryMode:'24H_BIAS_PULLBACK',entryReason:`24H ${f24.direction} | bias ${f24.bias} | vùng cản ${Math.round(f24.resistance)} → ${Math.round(f24.resistanceHigh)}`,tpPlan:targets.tpPlan,learningEligible:true,snapshot}};
  }
  if(shortPullback){const stopDistance=Math.max(price*.0035,Math.min(price*.006,Math.abs(f24.resistance-price)*.65||price*.0035)),targets=adaptiveTargets('SHORT',price,stopDistance,f24),timingConfidence=Math.max(58,Math.min(84,Math.round(58+(48-score)*1.4+(38-f24.bias)*.25))),snapshot={timeframes:data.timeframes,forecast24h:f24};return{signal:'SHORT',score,confidence:timingConfidence,scores,qualityGate:'PASS',entryMode:'24H_BIAS_PULLBACK',forecast24h:f24,plan:planFromForecast('SHORT',price,f24,m5,m15),learningEligible:true,order:{side:'SHORT',entry:price,stopLoss:price+stopDistance,takeProfit1:targets.tp1,takeProfit2:targets.tp2,takeProfit3:targets.tp3,leverage:3,riskPct:.5,confidence:timingConfidence,timeframe:'M5/M15/M30/H1/H4',signal:'AUTO_SHORT_24H_PULLBACK',entryMode:'24H_BIAS_PULLBACK',entryReason:`24H ${f24.direction} | bias ${f24.bias} | vùng hỗ trợ ${Math.round(f24.supportDeep)} → ${Math.round(f24.support)}`,tpPlan:targets.tpPlan,learningEligible:true,snapshot}};
  }
  if(score>=75&&bullish>=4&&highBull&&confidence>=50){const rsi=Number(byTf.M5.rsi14);if(Number.isFinite(rsi)&&rsi>72)return{signal:'WAIT',score,confidence,scores,forecast24h:f24,plan:waitPlan,reason:'LONG bị chặn: RSI M5 quá nóng / không đuổi giá'};if(!nearEma(price,byTf.M5.ema20,.012))return{signal:'WAIT',score,confidence,scores,forecast24h:f24,plan:waitPlan,reason:'LONG bị chặn: giá đã chạy quá xa EMA20 M5'};const stopDistance=price*.003,targets=adaptiveTargets('LONG',price,stopDistance,f24),snapshot={timeframes:data.timeframes,forecast24h:f24};return{signal:'LONG',score,confidence,scores,qualityGate:'PASS',entryMode:'CONFIRMED',forecast24h:f24,plan:planFromForecast('LONG',price,f24,m5,m15),learningEligible:true,order:{side:'LONG',entry:price,stopLoss:price-stopDistance,takeProfit1:targets.tp1,takeProfit2:targets.tp2,takeProfit3:targets.tp3,leverage:3,riskPct:.5,confidence,timeframe:'M5/M15/M30/H1/H4',signal:'AUTO_LONG',entryMode:'CONFIRMED',entryReason:`5TF quality PASS | score ${score} | bull ${bullish}/5 | H1/H4 đồng thuận`,tpPlan:targets.tpPlan,learningEligible:true,snapshot}};
  }
  if(score<=25&&bearish>=4&&highBear&&confidence>=50){const rsi=Number(byTf.M5.rsi14);if(Number.isFinite(rsi)&&rsi<28)return{signal:'WAIT',score,confidence,scores,forecast24h:f24,plan:waitPlan,reason:'SHORT bị chặn: RSI M5 quá bán / không đuổi giá'};if(!nearEma(price,byTf.M5.ema20,.012))return{signal:'WAIT',score,confidence,scores,forecast24h:f24,plan:waitPlan,reason:'SHORT bị chặn: giá đã chạy quá xa EMA20 M5'};const stopDistance=price*.003,targets=adaptiveTargets('SHORT',price,stopDistance,f24),snapshot={timeframes:data.timeframes,forecast24h:f24};return{signal:'SHORT',score,confidence,scores,qualityGate:'PASS',entryMode:'CONFIRMED',forecast24h:f24,plan:planFromForecast('SHORT',price,f24,m5,m15),learningEligible:true,order:{side:'SHORT',entry:price,stopLoss:price+stopDistance,takeProfit1:targets.tp1,takeProfit2:targets.tp2,takeProfit3:targets.tp3,leverage:3,riskPct:.5,confidence,timeframe:'M5/M15/M30/H1/H4',signal:'AUTO_SHORT',entryMode:'CONFIRMED',entryReason:`5TF quality PASS | score ${score} | bear ${bearish}/5 | H1/H4 đồng thuận`,tpPlan:targets.tpPlan,learningEligible:true,snapshot}};
  }
  return{signal:'WAIT',score,confidence,scores,forecast24h:f24,plan:waitPlan,reason:`24H ${f24.direction} | bias ${f24.bias} | Entry timing WAIT | chờ đúng trigger kế hoạch, không đuổi giá`};
}

async function autoDemo(env){
  if(!env.PAPER_TRADING)return{ok:false,reason:'Thiếu binding PAPER_TRADING'};const paper=env.PAPER_TRADING.get(env.PAPER_TRADING.idFromName('btc-ai-signal2-paper'));const statusRes=await paper.fetch('https://paper/status');const status=await statusRes.json();if(!status.ok)return{ok:false,reason:'Paper status lỗi'};if(status.position)return{ok:true,reason:'Đang có DEMO ORDER',position:status.position};const historyRes=await paper.fetch('https://paper/history?limit=1');const history=await historyRes.json();const last=history?.trades?.at(-1);if(last?.closedAt&&Date.now()-new Date(last.closedAt).getTime()<5*60*1000)return{ok:true,signal:'COOLDOWN',score:null,reason:'Nghỉ 5 phút sau lệnh đóng'};const [tf,price]=await Promise.all([getFiveTimeframes(),getTickerPrice()]);const plan=buildAutoSignal(tf,price);if(plan.signal==='WAIT'||!plan.order)return{ok:true,signal:plan.signal,score:plan.score,confidence:plan.confidence,scores:plan.scores,forecast24h:plan.forecast24h,plan:plan.plan,reason:plan.reason};const openRes=await paper.fetch('https://paper/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(plan.order)});const opened=await openRes.json();if(!opened.ok)throw new Error(opened.error||'Không mở được AUTO DEMO');return{ok:true,signal:plan.signal,score:plan.score,confidence:plan.confidence,scores:plan.scores,qualityGate:plan.qualityGate,entryMode:plan.entryMode,learningEligible:plan.learningEligible,forecast24h:plan.forecast24h,plan:plan.plan,position:opened.position,reason:`Đã mở AUTO DEMO — ${plan.entryMode}`};
}

export { PaperTrading };
export default { async fetch(req,env,ctx){const url=new URL(req.url);if(url.pathname==='/'){const r=await baseWorker.fetch(req,env,ctx);const html=await r.text();return new Response(addDemoButtons(html),{status:r.status,headers:r.headers});}if(url.pathname==='/api/paper/auto'&&req.method==='POST'){try{return Response.json(await autoDemo(env));}catch(e){return Response.json({ok:false,error:e?.message||'AUTO DEMO error'},{status:502});}}return baseWorker.fetch(req,env,ctx);},async scheduled(event,env,ctx){await baseWorker.scheduled(event,env,ctx);try{await autoDemo(env);}catch(_e){}}};