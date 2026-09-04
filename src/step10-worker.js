import baseWorker, { PaperTrading } from './demo-worker.js';

const MODEL_ACTIVE = 'rule-v1';
const MODEL_CANDIDATE = 'rule-v2-shadow';
const MIN_EVAL_TRADES = 20;
const PAPER_LEVERAGE = 3;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*'
  }
});

async function paper(env, path, init = {}) {
  if (!env.PAPER_TRADING) throw new Error('Chưa có binding PAPER_TRADING');
  const id = env.PAPER_TRADING.idFromName('btc-ai-signal2-paper');
  const stub = env.PAPER_TRADING.get(id);
  const r = await stub.fetch(`https://paper${path}`, init);
  const d = await r.json();
  if (!r.ok || d.ok === false) throw new Error(d.error || `Paper HTTP ${r.status}`);
  return d;
}

function candidateDirection(row) {
  const bias = Number(row?.forecastBias);
  if (!Number.isFinite(bias)) return 'UNKNOWN';
  if (bias >= 65) return 'UP';
  if (bias <= 35) return 'DOWN';
  return 'FLAT';
}

function maxDrawdown(rows) {
  let equity = 0, peak = 0, dd = 0;
  for (const row of rows) {
    equity += Number(row.realizedPnl) || 0;
    peak = Math.max(peak, equity);
    dd = Math.max(dd, peak - equity);
  }
  return dd;
}

function metrics(rows, label) {
  const data = rows.filter(r => Number.isFinite(Number(r.realizedPnl)));
  const wins = data.filter(r => Number(r.realizedPnl) > 0);
  const losses = data.filter(r => Number(r.realizedPnl) < 0);
  const grossProfit = wins.reduce((a, r) => a + Number(r.realizedPnl), 0);
  const grossLoss = Math.abs(losses.reduce((a, r) => a + Number(r.realizedPnl), 0));
  const sumR = data.reduce((a, r) => a + (Number(r.realizedR) || 0), 0);
  const correct = data.filter(r => r.__predicted === r.directionalOutcome).length;
  return {
    model: label,
    trades: data.length,
    wins: wins.length,
    losses: losses.length,
    winRate: data.length ? wins.length / data.length * 100 : 0,
    forecastAccuracy: data.length ? correct / data.length * 100 : 0,
    grossProfit,
    grossLoss,
    pnl: data.reduce((a, r) => a + Number(r.realizedPnl), 0),
    avgR: data.length ? sumR / data.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0),
    maxDrawdown: maxDrawdown(data)
  };
}

function sideMatchesPrediction(row, prediction) {
  return (prediction === 'UP' && row.side === 'LONG') || (prediction === 'DOWN' && row.side === 'SHORT');
}

function evaluate(rows) {
  const base = rows.map(r => ({
    ...r,
    __activePrediction: r.forecastDirection || 'UNKNOWN',
    __candidatePrediction: candidateDirection(r)
  }));

  const activeRows = base.map(r => ({ ...r, __predicted: r.__activePrediction }));
  const candidateRows = base
    .filter(r => sideMatchesPrediction(r, r.__candidatePrediction))
    .map(r => ({ ...r, __predicted: r.__candidatePrediction }));

  const active = metrics(activeRows, MODEL_ACTIVE);
  const candidate = metrics(candidateRows, MODEL_CANDIDATE);
  candidate.coverage = base.length ? candidateRows.length / base.length * 100 : 0;
  candidate.skipped = base.length - candidateRows.length;

  const enoughData = base.length >= MIN_EVAL_TRADES;
  const candidateBetter = enoughData
    && candidate.pnl > active.pnl
    && candidate.avgR > active.avgR
    && (candidate.profitFactor == null || active.profitFactor == null || candidate.profitFactor > active.profitFactor)
    && candidate.maxDrawdown <= active.maxDrawdown
    && candidate.forecastAccuracy >= active.forecastAccuracy;

  const decision = candidateBetter ? 'PROMOTE_READY' : 'KEEP_CURRENT';
  const reason = !enoughData
    ? `Chưa đủ mẫu: cần ${MIN_EVAL_TRADES}, hiện có ${base.length}`
    : candidateBetter
      ? 'Candidate vượt Active theo toàn bộ tiêu chí: P&L, Avg R, Profit Factor, Max DD và Accuracy.'
      : 'Candidate chưa vượt Active theo bộ tiêu chí; giữ model hiện tại.';

  return {
    activeModel: MODEL_ACTIVE,
    candidateModel: MODEL_CANDIDATE,
    evaluatedTrades: base.length,
    minimumTrades: MIN_EVAL_TRADES,
    active,
    candidate,
    decision,
    reason,
    promotionGuard: 'Chỉ promote khi đủ mẫu và candidate vượt toàn bộ tiêu chí; không thay model sớm.',
    modelHistory: [
      { version: MODEL_ACTIVE, status: 'ACTIVE' },
      { version: MODEL_CANDIDATE, status: candidateBetter ? 'PROMOTE_READY' : 'CANDIDATE_SHADOW' }
    ],
    evaluatedAt: new Date().toISOString()
  };
}

const DAILY_PANEL = `
<div id="daily-learning-report" style="margin-top:18px;background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
    <b>BÁO CÁO HỌC AI — HÔM NAY</b><span id="daily-report-status" style="color:#94a3c5">Đang tổng hợp...</span>
  </div>
  <div id="daily-report-grid" style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:8px;margin-top:12px"></div>
  <div id="daily-report-summary" style="margin-top:10px;padding:11px 12px;border-radius:8px;background:#0a1122;border:1px solid #293756;color:#d7e0f2;line-height:1.6">Đang tải báo cáo học hôm nay...</div>
  <div id="daily-report-lessons" style="margin-top:8px;padding:11px 12px;border-radius:8px;background:#080f1e;border:1px solid #293756;color:#d7e0f2;line-height:1.6">Bài học AI: đang phân tích...</div>
  <div id="daily-report-history" style="margin-top:10px;padding:11px 12px;border-radius:8px;background:#080f1e;border:1px solid #293756;color:#d7e0f2;line-height:1.55">Lịch sử báo cáo: đang tải...</div>
  <div style="margin-top:8px;color:#94a3c5;font-size:12px">Báo cáo được tính theo các lệnh DEMO đã đóng trong ngày Việt Nam (UTC+7). Báo cáo được lưu để AI học và đối chiếu các ngày trước.</div>
</div>
<style>@media(max-width:900px){#daily-report-grid{grid-template-columns:repeat(2,minmax(150px,1fr))!important}}@media(max-width:600px){#daily-report-grid{grid-template-columns:1fr!important}}</style>
<script>
(async()=>{
  const f=n=>Number.isFinite(Number(n))?Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"--";
  const pct=n=>Number.isFinite(Number(n))?Number(n).toFixed(2)+"%":"--";
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
  const card=(title,v)=>"<div style=\"background:#0d1426;border-radius:8px;padding:10px\">"+esc(title)+"<b style=\"display:block;margin-top:4px\">"+esc(v)+"</b></div>";
  async function check(){
    try{
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),12000);
      const r=await fetch("/api/paper/daily-learning-report?ts="+Date.now(),{cache:"no-store",signal:controller.signal});
      clearTimeout(timeout);
      const d=await r.json();
      if(!r.ok||d.ok===false) throw Error(d.error||("HTTP "+r.status));
      const el=id=>document.getElementById(id);
      el("daily-report-status").textContent="✓ BÁO CÁO "+d.dateVN;
      el("daily-report-status").style.color="#55dc92";
      const a=d.summary||{};
      el("daily-report-grid").innerHTML=
        card("Lệnh học hôm nay",a.trades)+card("Thắng / Thua",(a.wins||0)+" / "+(a.losses||0))+
        card("Win rate",pct(a.winRate))+card("P&L",f(a.pnl))+card("Avg R",Number(a.avgR||0).toFixed(2)+"R")+
        card("Forecast đúng",pct(a.forecastAccuracy))+card("Scenario khớp",pct(a.scenarioAccuracy))+card("Learning score",Number(a.avgLearningScore||0).toFixed(2));
      el("daily-report-summary").textContent=d.summaryText||"Chưa có dữ liệu.";
      el("daily-report-lessons").textContent=d.lessonText||"Chưa có bài học.";
      const hist=(d.reports||[]).map(x=>"<div style=\"padding:7px 0;border-bottom:1px solid #293756\"><b>"+esc(x.dateVN)+"</b> | "+esc(x.trades)+" lệnh | W/L "+esc(x.wins)+"/"+esc(x.losses)+" | WR "+pct(x.winRate)+" | P&L "+f(x.pnl)+" | Avg R "+Number(x.avgR||0).toFixed(2)+" | Forecast "+pct(x.forecastAccuracy)+"</div>").join("");
      el("daily-report-history").innerHTML="<b>LỊCH SỬ BÁO CÁO — 14 NGÀY GẦN NHẤT</b><div style=\"margin-top:6px\">"+(hist||"Chưa có báo cáo đã lưu.")+"</div>";
    }catch(e){
      const status=document.getElementById("daily-report-status");
      status.textContent="✕ DAILY REPORT ERROR"; status.style.color="#ff7181";
      document.getElementById("daily-report-summary").textContent=
        e.name==="AbortError" ? "Lỗi: máy chủ báo cáo phản hồi quá lâu (>12 giây)." : "Lỗi: "+e.message;
    }
  }
  check();
  setInterval(check,60000);
})();
</script>
`;
const PANEL = `<div id="model-evaluation" style="margin-top:18px;background:#121a2f;border:1px solid #293756;border-radius:12px;padding:16px"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap"><b>BƯỚC 10 — KIỂM ĐỊNH MODEL</b><span id="model-status" style="color:#94a3c5">Đang kiểm tra...</span></div><div id="model-grid" style="display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:8px;margin-top:12px"></div><div id="model-decision" style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#0a1122;border:1px solid #293756;color:#d7e0f2;line-height:1.55">Đang tải...</div><div style="margin-top:8px;color:#94a3c5;font-size:12px">Candidate là shadow model để kiểm định trên chính các lệnh DEMO đã đóng. Chưa đủ bằng chứng thì không thay Active.</div></div><style>@media(max-width:900px){#model-grid{grid-template-columns:repeat(2,minmax(150px,1fr))!important}}@media(max-width:600px){#model-grid{grid-template-columns:1fr!important}}</style><script>(async()=>{const f=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'--';const pct=n=>Number.isFinite(Number(n))?Number(n).toFixed(2)+'%':'--';const card=(title,v)=>'<div style="background:#0d1426;border-radius:8px;padding:10px">'+title+'<b style="display:block;margin-top:4px">'+v+'</b></div>';async function check(){try{const r=await fetch('/api/paper/model-evaluation?ts='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));const a=d.active,c=d.candidate;document.getElementById('model-status').textContent='✓ MODEL EVALUATOR ONLINE';document.getElementById('model-status').style.color='#55dc92';document.getElementById('model-grid').innerHTML=card('Active',a.model)+card('Candidate',c.model)+card('Mẫu kiểm định',d.evaluatedTrades+'/'+d.minimumTrades)+card('Quyết định',d.decision)+card('Active P&L',f(a.pnl))+card('Candidate Shadow P&L',f(c.pnl))+card('Active Avg R',Number(a.avgR).toFixed(2)+'R')+card('Candidate Avg R',Number(c.avgR).toFixed(2)+'R')+card('Active PF',a.profitFactor==null?'∞':Number(a.profitFactor).toFixed(2))+card('Candidate PF',c.profitFactor==null?'∞':Number(c.profitFactor).toFixed(2))+card('Active DD',f(a.maxDrawdown))+card('Candidate DD',f(c.maxDrawdown))+card('Active Accuracy',pct(a.forecastAccuracy))+card('Candidate Accuracy',pct(c.forecastAccuracy))+card('Candidate Coverage',pct(c.coverage));document.getElementById('model-decision').textContent=(d.decision==='PROMOTE_READY'?'✓ Candidate đạt điều kiện promote nhưng chưa tự áp dụng.':'⏸ Giữ Active: ')+d.reason}catch(e){document.getElementById('model-status').textContent='✕ MODEL EVALUATOR ERROR';document.getElementById('model-status').style.color='#ff7181';document.getElementById('model-decision').textContent='Lỗi: '+e.message}}check();setInterval(check,10000)})();</script>`;


function vnDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
}

function lessonForReport(report) {
  if (!report || !report.trades) return 'Bài học AI: hôm nay chưa có lệnh DEMO đóng đủ điều kiện để kết luận. Tiếp tục thu thập dữ liệu, không tự thay model.';
  if (Number(report.forecastAccuracy) < 50) return 'Bài học AI: dự báo hướng hôm nay còn yếu. Ưu tiên kiểm tra sai lệch giữa forecast 24H và thực tế, không tăng rủi ro để bù lỗ.';
  if (Number(report.scenarioAccuracy) < 50) return 'Bài học AI: hướng có thể đúng nhưng vùng vào chưa tốt. Cần cải thiện xác định vùng hỗ trợ/kháng cự và trigger xác nhận.';
  if (Number(report.pnl) < 0) return 'Bài học AI: tín hiệu có điểm đúng nhưng P&L hôm nay âm. Cần kiểm tra entry, SL/TP và timing trước khi thay model.';
  return 'Bài học AI: kết quả hôm nay đang tích cực. Giữ model hiện tại và tiếp tục kiểm định bằng mẫu mới; chưa promote chỉ vì một ngày tốt.';
}

async function dailyLearningReportApi(env) {
  // Dùng một request GET duy nhất. Endpoint /daily-reports đã tự
  // backfill learning và cập nhật snapshot của hôm nay.
  const reportsRes = await paper(env, '/daily-reports?limit=14', { method: 'GET' });
  const today = reportsRes.today;
  return {
    ok:true,
    dateVN: today.dateVN,
    summary: {
      trades: today.trades, wins: today.wins, losses: today.losses,
      winRate: today.winRate, pnl: today.pnl, avgR: today.avgR,
      forecastAccuracy: today.forecastAccuracy, scenarioAccuracy: today.scenarioAccuracy,
      avgLearningScore: today.avgLearningScore, profitFactor: today.profitFactor
    },
    summaryText: dailyReportSummaryText(today),
    lessonText: lessonForReport(today),
    reports: reportsRes.reports || [],
    savedReports: reportsRes.savedReports || 0,
    generatedAt: today.generatedAt,
    source:'PERSISTED DEMO closed trades / AI learning',
    timezone:'Asia/Ho_Chi_Minh'
  };
}

function dailyReportSummaryText(report) {
  if (!report || !report.trades) return 'Kết luận hôm nay: chưa có lệnh DEMO đóng trong ngày để đánh giá.';
  return 'Kết luận hôm nay: '+report.trades+' lệnh học | '+report.wins+' thắng / '+report.losses+' thua | P&L '+Number(report.pnl||0).toFixed(2)+' | Win rate '+Number(report.winRate||0).toFixed(2)+'% | Forecast đúng '+Number(report.forecastAccuracy||0).toFixed(2)+'% | Scenario khớp '+Number(report.scenarioAccuracy||0).toFixed(2)+'% | PF '+(report.profitFactor==null?'∞':Number(report.profitFactor).toFixed(2))+'.';
}

async function modelEvaluation(env) {
  const learning = await paper(env, '/learning?limit=200');
  const rows = Array.isArray(learning.learning) ? learning.learning : [];
  return { ok: true, ...evaluate(rows), paperLeverage: PAPER_LEVERAGE, source: 'DEMO closed trades / AI learning' };
}

async function forwardOpenWithLeverage(request) {
  const body = await request.json().catch(() => ({}));
  body.leverage = PAPER_LEVERAGE;
  const headers = new Headers(request.headers);
  headers.set('content-type', 'application/json');
  return new Request(request.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);


    if (url.pathname === '/api/paper/daily-learning-report') {
      try { return json(await dailyLearningReportApi(env)); }
      catch (e) { return json({ ok:false, error:e?.message || 'Daily learning report error' }, 502); }
    }

    if (url.pathname === '/api/paper/model-evaluation') {
      try { return json(await modelEvaluation(env)); }
      catch (e) { return json({ ok: false, error: e?.message || 'Model evaluation error' }, 502); }
    }

    const forwarded = url.pathname === '/api/paper/open' && request.method.toUpperCase() === 'POST'
      ? await forwardOpenWithLeverage(request)
      : request;

    const response = await baseWorker.fetch(forwarded, env, ctx);
    if (url.pathname !== '/' || !response.headers.get('content-type')?.includes('text/html')) return response;

    const html = await response.text();
    const injected = html.includes('id="daily-learning-report"') ? html : html.replace('</main>', PANEL + DAILY_PANEL + '</main>');
    const out = new Response(injected, response);
    out.headers.set('cache-control', 'no-store');
    return out;
  },

  async scheduled(controller, env, ctx) {
    if (typeof baseWorker.scheduled === 'function') await baseWorker.scheduled(controller, env, ctx);
    try {
      await paper(env, '/daily-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dateVN: vnDate(new Date().toISOString()) })
      });
    } catch (_e) {
      // Best-effort persistence; never break the paper/market cron.
    }
  }
};

export { PaperTrading };
