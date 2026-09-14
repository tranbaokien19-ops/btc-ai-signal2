import step10Worker, { PaperTrading } from './step10-worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  }
});

async function paperLearning(env) {
  if (!env.PAPER_TRADING) throw new Error('Chưa có binding PAPER_TRADING');
  const id = env.PAPER_TRADING.idFromName('btc-ai-signal2-paper');
  const stub = env.PAPER_TRADING.get(id);
  const r = await stub.fetch('https://paper/learning?limit=200');
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.error || `Paper HTTP ${r.status}`);
  return d;
}

const TRADE_TABLE_PANEL = `
<div id="ai-trade-results" style="margin-top:18px;background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
    <b>LỆNH AI — THẮNG / THUA</b><span id="ai-trade-status" style="color:#94a3c5">Đang tải...</span>
  </div>
  <div id="ai-trade-warning" style="display:none;margin-top:10px;padding:11px 12px;border-radius:8px;background:#2a1117;border:1px solid #7b2f3b;color:#ff9aa6;line-height:1.55"></div>
  <div id="ai-trade-summary" style="display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:8px;margin-top:12px"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
    <div style="background:#0a1122;border:1px solid #293756;border-radius:10px;padding:12px">
      <div style="font-weight:700;color:#55dc92;margin-bottom:8px">✓ LỆNH THẮNG</div>
      <div id="ai-winning-trades">Đang tải...</div>
    </div>
    <div style="background:#0a1122;border:1px solid #293756;border-radius:10px;padding:12px">
      <div style="font-weight:700;color:#ff7181;margin-bottom:8px">✕ LỆNH THUA</div>
      <div id="ai-losing-trades">Đang tải...</div>
    </div>
  </div>
  <div style="margin-top:10px;color:#94a3c5;font-size:12px">Chỉ hiển thị các lệnh đã đóng và đủ điều kiện AI learning. Dữ liệu lấy trực tiếp từ kho lệnh DEMO đã lưu.</div>
</div>
<style>
.ai-trade-table{width:100%;border-collapse:collapse;font-size:12px}
.ai-trade-table th,.ai-trade-table td{padding:7px 6px;border-bottom:1px solid #293756;text-align:left;white-space:nowrap}
.ai-trade-table th{color:#94a3c5;font-weight:600}
.ai-trade-table td{color:#d7e0f2}
.ai-trade-scroll{overflow:auto;max-height:360px}
.ai-win{color:#55dc92!important;font-weight:700}
.ai-loss{color:#ff7181!important;font-weight:700}
.ai-neutral{color:#f4ca58!important;font-weight:700}
@media(max-width:1000px){#ai-trade-results>div:nth-of-type(3){grid-template-columns:1fr!important}#ai-trade-summary{grid-template-columns:repeat(3,minmax(140px,1fr))!important}}
@media(max-width:900px){#ai-trade-summary{grid-template-columns:repeat(2,minmax(140px,1fr))!important}}
@media(max-width:600px){#ai-trade-summary{grid-template-columns:1fr!important}.ai-trade-table{font-size:11px}}
</style>
<script>
(async()=>{
  const $=id=>document.getElementById(id);
  const f=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';
  const r=n=>Number.isFinite(Number(n))?Number(n).toFixed(2)+'R':'--';
  const pct=n=>Number.isFinite(Number(n))?Number(n).toFixed(2)+'%':'--';
  const date=v=>{const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'--'};
  const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const card=(title,value)=>'<div style="background:#0d1426;border-radius:8px;padding:10px">'+title+'<b style="display:block;margin-top:4px">'+value+'</b></div>';
  function table(rows,kind){
    if(!rows.length)return '<div style="color:#94a3c5;padding:8px 0">Chưa có lệnh '+(kind==='WIN'?'thắng':'thua')+'.</div>';
    return '<div class="ai-trade-scroll"><table class="ai-trade-table"><thead><tr><th>Thời gian</th><th>ID lệnh</th><th>Hướng</th><th>Kết quả</th><th>P&L</th><th>R</th><th>Dự báo</th><th>Thực tế</th><th>Khớp KB</th></tr></thead><tbody>'+rows.map(x=>{
      const cls=kind==='WIN'?'ai-win':'ai-loss';
      return '<tr><td>'+date(x.evaluatedAt)+'</td><td title="'+esc(x.tradeId)+'">'+esc(String(x.tradeId||'').slice(-10))+'</td><td>'+esc(x.side||'--')+'</td><td class="'+cls+'">'+(kind==='WIN'?'THẮNG':'THUA')+'</td><td class="'+cls+'">'+f(x.realizedPnl)+'</td><td>'+r(x.realizedR)+'</td><td>'+esc(x.forecastDirection||'--')+'</td><td>'+esc(x.directionalOutcome||'--')+'</td><td>'+(x.scenarioMatched?'CÓ':'KHÔNG')+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  }
  async function load(){
    try{
      const res=await fetch('/api/paper/ai-trade-results?ts='+Date.now(),{cache:'no-store'});
      const d=await res.json();
      if(!res.ok||d.ok===false)throw Error(d.error||('HTTP '+res.status));
      const rows=Array.isArray(d.trades)?d.trades:[];
      const wins=rows.filter(x=>x.result==='WIN'),losses=rows.filter(x=>x.result==='LOSS');
      const pnl=rows.reduce((a,x)=>a+(Number(x.realizedPnl)||0),0);
      const winRate=rows.length?wins.length/rows.length*100:0;
      const grossProfit=wins.reduce((a,x)=>a+(Number(x.realizedPnl)||0),0);
      const grossLoss=Math.abs(losses.reduce((a,x)=>a+(Number(x.realizedPnl)||0),0));
      const pf=grossLoss>0?grossProfit/grossLoss:(grossProfit>0?null:0);
      $('ai-trade-status').textContent='✓ '+rows.length+' lệnh AI đã đóng';$('ai-trade-status').style.color=winRate>=50?'#55dc92':'#ff7181';
      $('ai-trade-summary').innerHTML=card('Tổng lệnh học',rows.length)+card('Lệnh thắng',wins.length)+card('Lệnh thua',losses.length)+card('Tỷ lệ thắng',pct(winRate))+card('P&L',f(pnl));
      const warning=$('ai-trade-warning');
      if(rows.length>=5 && (winRate<50 || pnl<0 || (pf!==null && pf<1))){
        warning.style.display='block';
        warning.textContent='⚠ CẢNH BÁO CHẤT LƯỢNG AI: '+wins.length+' thắng / '+losses.length+' thua | Win rate '+pct(winRate)+' | P&L '+f(pnl)+' | Profit Factor '+(pf===null?'∞':f(pf))+'. Model hiện tại CHƯA ĐƯỢC COI LÀ ĐẠT để dùng lệnh thật. Cần tiếp tục kiểm định và sửa logic vào lệnh trước khi liên kết Binance.';
      }else{
        warning.style.display='none';
      }
      $('ai-winning-trades').innerHTML=table(wins,'WIN');$('ai-losing-trades').innerHTML=table(losses,'LOSS');
    }catch(e){$('ai-trade-status').textContent='✕ Lỗi tải dữ liệu';$('ai-trade-status').style.color='#ff7181';$('ai-trade-warning').style.display='block';$('ai-trade-warning').textContent='Lỗi: '+e.message;$('ai-winning-trades').textContent='Lỗi: '+e.message;$('ai-losing-trades').textContent='Lỗi: '+e.message;}
  }
  load();setInterval(load,10000);
})();
</script>
`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/paper/ai-trade-results') {
      try {
        const d = await paperLearning(env);
        const trades = (Array.isArray(d.learning) ? d.learning : [])
          .filter(x => x && (x.result === 'WIN' || x.result === 'LOSS'))
          .sort((a,b) => String(b.evaluatedAt || '').localeCompare(String(a.evaluatedAt || '')))
          .slice(0, 200);
        return json({
          ok: true,
          trades,
          wins: trades.filter(x => x.result === 'WIN').length,
          losses: trades.filter(x => x.result === 'LOSS').length,
          updatedAt: new Date().toISOString()
        });
      } catch (e) {
        return json({ ok:false, error:e?.message || 'AI trade results error' }, 502);
      }
    }

    const response = await step10Worker.fetch(request, env, ctx);
    if (url.pathname !== '/' || !response.headers.get('content-type')?.includes('text/html')) return response;
    const html = await response.text();
    const injected = html.includes('id="ai-trade-results"') ? html : html.replace('</main>', TRADE_TABLE_PANEL + '</main>');
    const out = new Response(injected, response);
    out.headers.set('cache-control','no-store');
    return out;
  },

  async scheduled(controller, env, ctx) {
    if (typeof step10Worker.scheduled === 'function') return step10Worker.scheduled(controller, env, ctx);
  }
};

export { PaperTrading };
