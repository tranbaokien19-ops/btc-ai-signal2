import { DurableObject } from 'cloudflare:workers';

const DEFAULT_CAPITAL = 1000000;
const MAX_TRADES = 5000;
const MAX_DAILY_REPORTS = 366;
const MIN_LEVERAGE = 3;
const DEFAULT_LEVERAGE = MIN_LEVERAGE;
const DEFAULT_RISK_PCT = 0.5;
const MIN_RISK_PCT = 0.1;
const MAX_RISK_PCT = 2;
const MONITOR_MS = 5000;
const MARKET_API = 'https://api.exchange.coinbase.com';

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function sideSign(side) { return side === 'LONG' ? 1 : -1; }
function nowIso() { return new Date().toISOString(); }

function validateTarget(side, entry, stopLoss, tp1, tp2, tp3) {
  if (!['LONG', 'SHORT'].includes(side)) return 'Side phải là LONG hoặc SHORT';
  if (!(entry > 0) || !(stopLoss > 0)) return 'Entry và Stop Loss phải > 0';
  if ((side === 'LONG' && stopLoss >= entry) || (side === 'SHORT' && stopLoss <= entry)) return 'Stop Loss không hợp lệ cho hướng lệnh';
  if (tp1 != null && (!(tp1 > 0) || (side === 'LONG' ? tp1 <= entry : tp1 >= entry))) return 'TP1 không hợp lệ cho hướng lệnh';
  if (tp2 != null && (!(tp2 > 0) || (side === 'LONG' ? tp2 <= entry : tp2 >= entry))) return 'TP2 không hợp lệ cho hướng lệnh';
  if (tp3 != null && (!(tp3 > 0) || (side === 'LONG' ? tp3 <= entry : tp3 >= entry))) return 'TP3 không hợp lệ cho hướng lệnh';
  if (tp1 != null && tp2 != null && (side === 'LONG' ? tp2 < tp1 : tp2 > tp1)) return 'TP2 phải nằm xa Entry hơn TP1';
  if (tp2 != null && tp3 != null && (side === 'LONG' ? tp3 < tp2 : tp3 > tp2)) return 'TP3 phải nằm xa Entry hơn TP2';
  return null;
}

function snapshotPosition(p, price, at = Date.now()) {
  if (!p) return null;
  const px = num(price, p.entry);
  const pnl = sideSign(p.side) * (px - p.entry) * p.quantity;
  const r = p.riskAmount > 0 ? pnl / p.riskAmount : null;
  const favorable = p.side === 'LONG' ? px - p.entry : p.entry - px;
  const adverse = p.side === 'LONG' ? p.entry - px : px - p.entry;
  const mfe = Math.max(p.mfePriceMove || 0, favorable, 0);
  const mae = Math.max(p.maePriceMove || 0, adverse, 0);
  const elapsed = Math.max(0, at - new Date(p.openedAt).getTime());
  return { ...p, currentPrice: px, unrealizedPnl: pnl, unrealizedR: r, mfePriceMove: mfe, maePriceMove: mae, mfeR: p.riskAmount > 0 ? mfe * p.quantity / p.riskAmount : null, maeR: p.riskAmount > 0 ? mae * p.quantity / p.riskAmount : null, durationSec: Math.floor(elapsed / 1000), lastMarkedAt: new Date(at).toISOString() };
}


function evaluateLearning(trade) {
  if (!trade || (trade.learningEligible !== true && !String(trade.signal || '').startsWith('AUTO_'))) return null;
  const snap = trade.signalSnapshot || {};
  const f = snap.forecast24h || {};
  const actualMove = Number(trade.exit) - Number(trade.entry);
  const tolerance = Math.abs(Number(trade.entry) || 0) * 0.001;
  const direction = String(f.direction || '');
  const directionalOutcome = actualMove > tolerance ? 'UP' : actualMove < -tolerance ? 'DOWN' : 'FLAT';
  const forecastDirection = direction === 'BULLISH_24H' ? 'UP' : direction === 'BEARISH_24H' ? 'DOWN' : 'FLAT';
  const forecastDirectionCorrect = forecastDirection === directionalOutcome;
  const sideCorrect = (trade.side === 'LONG' && directionalOutcome === 'UP') || (trade.side === 'SHORT' && directionalOutcome === 'DOWN');
  const scenarios = snap.scenarios || {};
  const scenario = trade.side === 'LONG' ? (String(trade.signal || '').includes('ALTERNATIVE') ? scenarios.longB : scenarios.longA) : (String(trade.signal || '').includes('ALTERNATIVE') ? scenarios.shortB : scenarios.shortA);
  const entryLow = Number(scenario?.entryLow), entryHigh = Number(scenario?.entryHigh);
  const entryInScenario = Number.isFinite(entryLow) && Number.isFinite(entryHigh) && Number(trade.entry) >= entryLow && Number(trade.entry) <= entryHigh;
  const result = Number(trade.realizedPnl) > tolerance * Number(trade.quantity || 0) ? 'WIN' : Number(trade.realizedPnl) < -tolerance * Number(trade.quantity || 0) ? 'LOSS' : 'BREAKEVEN';
  const learningScore = result === 'WIN' && forecastDirectionCorrect ? 1 : result === 'WIN' || forecastDirectionCorrect ? 0.5 : 0;
  return {
    tradeId: trade.id, modelVersion: 'rule-v1', evaluatedAt: nowIso(),
    side: trade.side, signal: trade.signal, entryMode: trade.entryMode,
    forecastDirection: direction || 'UNKNOWN', forecastBias: num(f.bias), forecastConfidence: num(f.confidence),
    actualMove, directionalOutcome, forecastDirectionCorrect, sideCorrect, scenarioMatched: entryInScenario,
    scenarioId: scenario?.id || null, result, realizedPnl: num(trade.realizedPnl, 0), realizedR: num(trade.realizedR, 0),
    mfeR: num(trade.mfeR, 0), maeR: num(trade.maeR, 0), durationSec: num(trade.durationSec, 0), learningScore
  };
}
function learningStats(s) {
  const rows = Array.isArray(s.learning) ? s.learning : [];
  const scored = rows.filter(x => Number.isFinite(x.learningScore));
  const correct = scored.filter(x => x.forecastDirectionCorrect);
  const wins = scored.filter(x => x.result === 'WIN');
  return {
    evaluated: rows.length,
    forecastCorrect: correct.length,
    forecastAccuracy: scored.length ? correct.length / scored.length * 100 : 0,
    wins: wins.length,
    winRate: scored.length ? wins.length / scored.length * 100 : 0,
    avgLearningScore: scored.length ? scored.reduce((a,x)=>a+x.learningScore,0)/scored.length : 0,
    modelVersion: 'rule-v1'
  };
}
function dailyReportForDate(s, dateVN) {
  const rows = (s.learning || []).filter(r => r && r.evaluatedAt && vnDate(r.evaluatedAt) === dateVN && Number.isFinite(Number(r.realizedPnl)));
  const wins = rows.filter(r => Number(r.realizedPnl) > 0);
  const losses = rows.filter(r => Number(r.realizedPnl) < 0);
  const pnl = rows.reduce((a,r) => a + Number(r.realizedPnl), 0);
  const avgR = rows.length ? rows.reduce((a,r) => a + (Number(r.realizedR) || 0), 0) / rows.length : 0;
  const forecastCorrect = rows.filter(r => r.forecastDirectionCorrect === true).length;
  const scenarioMatched = rows.filter(r => r.scenarioMatched === true).length;
  const learningScore = rows.length ? rows.reduce((a,r) => a + (Number(r.learningScore) || 0), 0) / rows.length : 0;
  const grossProfit = wins.reduce((a,r) => a + Number(r.realizedPnl), 0);
  const grossLoss = Math.abs(losses.reduce((a,r) => a + Number(r.realizedPnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0);
  const winRate = rows.length ? wins.length / rows.length * 100 : 0;
  const forecastAccuracy = rows.length ? forecastCorrect / rows.length * 100 : 0;
  const scenarioAccuracy = rows.length ? scenarioMatched / rows.length * 100 : 0;
  return {
    dateVN, trades: rows.length, wins: wins.length, losses: losses.length,
    winRate, pnl, avgR, forecastAccuracy, scenarioAccuracy,
    avgLearningScore: learningScore, profitFactor,
    generatedAt: nowIso(), updatedAt: nowIso()
  };
}
function vnDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
}
function upsertDailyReport(s, dateVN = vnDate(new Date().toISOString())) {
  const report = dailyReportForDate(s, dateVN);
  const rows = Array.isArray(s.dailyReports) ? s.dailyReports.filter(r => r.dateVN !== dateVN) : [];
  s.dailyReports = [...rows, report].sort((a,b) => String(a.dateVN).localeCompare(String(b.dateVN))).slice(-MAX_DAILY_REPORTS);
  return report;
}
function dailyReportSummary(report) {
  if (!report || !report.trades) return 'Chưa có lệnh học đóng đủ điều kiện trong ngày.';
  return report.trades+' lệnh | '+report.wins+' thắng / '+report.losses+' thua | P&L '+Number(report.pnl||0).toFixed(2)+' | Win rate '+Number(report.winRate||0).toFixed(2)+'% | Forecast đúng '+Number(report.forecastAccuracy||0).toFixed(2)+'% | Scenario khớp '+Number(report.scenarioAccuracy||0).toFixed(2)+'% | Learning '+Number(report.avgLearningScore||0).toFixed(2);
}

function recordLearning(s, closed) {
  const row = evaluateLearning(closed);
  if (!row) return null;
  const existing = new Set((s.learning || []).map(x => x.tradeId));
  if (existing.has(row.tradeId)) return row;
  s.learning = [...(Array.isArray(s.learning) ? s.learning : []), row].slice(-MAX_TRADES);
  // Lưu snapshot báo cáo ngay khi lệnh học được ghi nhận, không phụ thuộc vào lần mở dashboard.
  upsertDailyReport(s, vnDate(row.evaluatedAt));
  return row;
}
function backfillLearning(s) {
  const existing = new Set((s.learning || []).map(x => x.tradeId));
  const rows = [];
  for (const trade of (s.trades || []).filter(t => t.status === 'CLOSED')) {
    if (existing.has(trade.id)) continue;
    const row = evaluateLearning(trade);
    if (row) { rows.push(row); existing.add(row.tradeId); }
  }
  if (rows.length) s.learning = [...(Array.isArray(s.learning) ? s.learning : []), ...rows].slice(-MAX_TRADES);
  return rows.length;
}

function closedStats(s) {
  const closed = s.trades.filter(t => t.status === 'CLOSED');
  const wins = closed.filter(t => t.realizedPnl > 0);
  const losses = closed.filter(t => t.realizedPnl < 0);
  const grossProfit = wins.reduce((a, t) => a + t.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.realizedPnl, 0));
  const avgR = closed.length ? closed.reduce((a, t) => a + (num(t.realizedR, 0) || 0), 0) / closed.length : 0;
  let peak = s.initialCapital, equity = s.initialCapital, maxDrawdown = 0;
  for (const t of closed) { equity += num(t.realizedPnl, 0) || 0; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity); }
  return { closedTrades: closed.length, wins: wins.length, losses: losses.length, winRate: closed.length ? wins.length / closed.length * 100 : 0, grossProfit, grossLoss, profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? null : 0), avgR, maxDrawdown, maxDrawdownPct: s.initialCapital > 0 ? maxDrawdown / s.initialCapital * 100 : 0 };
}

export class PaperTrading extends DurableObject {
  constructor(ctx, env) { super(ctx, env); this.env = env; }

  async getState() {
    const s = await this.ctx.storage.get('state');
    return s || { initialCapital: DEFAULT_CAPITAL, capital: DEFAULT_CAPITAL, realizedPnl: 0, position: null, trades: [], learning: [], dailyReports: [], lastPrice: null, lastTickAt: null, engine: 'ONLINE', updatedAt: nowIso() };
  }
  async saveState(s) { s.updatedAt = nowIso(); await this.ctx.storage.put('state', s); return s; }

  async markAndMaybeClose(s, price, source = 'HTTP') {
    if (!s.position) { s.lastPrice = price; s.lastTickAt = nowIso(); return { state: s, closed: null }; }
    let p = snapshotPosition(s.position, price);
    s.lastPrice = price; s.lastTickAt = p.lastMarkedAt;

    const hitSL = p.side === 'LONG' ? price <= p.stopLoss : price >= p.stopLoss;
    const hitTP1 = p.tp1 != null && (p.side === 'LONG' ? price >= p.tp1 : price <= p.tp1);
    const hitTP2 = p.tp2 != null && (p.side === 'LONG' ? price >= p.tp2 : price <= p.tp2);
    const hitTP3 = p.tp3 != null && (p.side === 'LONG' ? price >= p.tp3 : price <= p.tp3);

    if (hitSL) {
      const closed = { ...p, status: 'CLOSED', exit: price, exitReason: 'SL', closeSource: source, closedAt: nowIso(), realizedPnl: p.unrealizedPnl, realizedR: p.unrealizedR, durationSec: Math.floor((Date.now() - new Date(p.openedAt).getTime()) / 1000) };
      s.capital += closed.realizedPnl; s.realizedPnl += closed.realizedPnl; s.position = null; s.trades = s.trades.map(t => t.id === closed.id ? closed : t);
      await this.ctx.storage.deleteAlarm();
      const learning = recordLearning(s, closed); closed.learning = learning; s.trades = s.trades.map(t => t.id === closed.id ? closed : t); return { state: s, closed, learning };
    }

    if (hitTP3 || (!p.tp3 && hitTP2)) {
      const exitReason = hitTP3 ? 'TP3' : 'TP2';
      const closed = { ...p, status: 'CLOSED', exit: price, exitReason, closeSource: source, closedAt: nowIso(), realizedPnl: p.unrealizedPnl, realizedR: p.unrealizedR, durationSec: Math.floor((Date.now() - new Date(p.openedAt).getTime()) / 1000) };
      s.capital += closed.realizedPnl; s.realizedPnl += closed.realizedPnl; s.position = null; s.trades = s.trades.map(t => t.id === closed.id ? closed : t);
      await this.ctx.storage.deleteAlarm();
      return { state: s, closed };
    }

    let protectedStop = p.stopLoss;
    let trailStage = p.trailStage || 'INITIAL';
    if (hitTP2) {
      const candidate = p.tp1;
      if (candidate != null) protectedStop = p.side === 'LONG' ? Math.max(protectedStop, candidate) : Math.min(protectedStop, candidate);
      trailStage = 'TP2_PROTECTED';
    } else if (hitTP1) {
      protectedStop = p.side === 'LONG' ? Math.max(protectedStop, p.entry) : Math.min(protectedStop, p.entry);
      trailStage = 'TP1_BREAKEVEN';
    }
    if (protectedStop !== p.stopLoss || trailStage !== p.trailStage) p = { ...p, stopLoss: protectedStop, trailStage, lastManagementAt: nowIso() };

    s.position = p; s.trades = s.trades.map(t => t.id === p.id ? { ...t, ...p } : t);
    return { state: s, closed: null };
  }

  async alarm() {
    const s = await this.getState();
    if (!s.position) return;
    try {
      const r = await fetch(`${MARKET_API}/products/BTC-USD/ticker`, { headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2-paper/1.3' } });
      if (!r.ok) throw new Error(`Coinbase HTTP ${r.status}`);
      const data = await r.json(); const price = num(data?.price);
      if (!(price > 0)) throw new Error('Coinbase trả giá không hợp lệ');
      const result = await this.markAndMaybeClose(s, price, 'ALARM');
      await this.saveState(result.state);
      if (result.state.position) await this.ctx.storage.setAlarm(Date.now() + MONITOR_MS);
    } catch (e) {
      s.engineError = String(e?.message || e); s.updatedAt = nowIso(); await this.ctx.storage.put('state', s); await this.ctx.storage.setAlarm(Date.now() + MONITOR_MS);
    }
  }

  async fetch(request) {
    const url = new URL(request.url); const method = request.method.toUpperCase(); let s = await this.getState();
    if (url.pathname === '/status' && method === 'GET') {
      const position = snapshotPosition(s.position, num(url.searchParams.get('price'), s.lastPrice));
      return Response.json({ ok: true, ...s, position, equity: s.capital + (position?.unrealizedPnl || 0), openTrades: s.trades.filter(t => t.status === 'OPEN').length, stats: closedStats(s), nextAlarmAt: await this.ctx.storage.getAlarm() });
    }
    if (url.pathname === '/reset' && method === 'POST') {
      const body = await request.json().catch(() => ({})); const capital = Math.max(1000, num(body.capital, DEFAULT_CAPITAL));
      s = { initialCapital: capital, capital, realizedPnl: 0, position: null, trades: [], learning: [], dailyReports: [], lastPrice: null, lastTickAt: null, engine: 'ONLINE', updatedAt: nowIso() };
      await this.ctx.storage.deleteAlarm(); await this.saveState(s); return Response.json({ ok: true, ...s, stats: closedStats(s) });
    }
    if (url.pathname === '/open' && method === 'POST') {
      if (s.position) return Response.json({ ok: false, error: 'Đang có DEMO ORDER mở' }, { status: 409 });
      const b = await request.json().catch(() => ({}));
      const side = String(b.side || '').toUpperCase(); const entry = num(b.entry); const stopLoss = num(b.stopLoss); const tp1 = num(b.takeProfit1, null); const tp2 = num(b.takeProfit2, null); const tp3 = num(b.takeProfit3, null);
      const validation = validateTarget(side, entry, stopLoss, tp1, tp2, tp3); if (validation) return Response.json({ ok: false, error: validation }, { status: 400 });
      const requestedLeverage = num(b.leverage, DEFAULT_LEVERAGE);
      const leverage = Math.max(MIN_LEVERAGE, requestedLeverage || DEFAULT_LEVERAGE);
      const riskPct = Math.max(MIN_RISK_PCT, Math.min(MAX_RISK_PCT, num(b.riskPct, DEFAULT_RISK_PCT))); const riskAmount = s.capital * riskPct / 100; const stopPct = Math.abs(entry - stopLoss) / entry; const notional = Math.min(s.capital * leverage, riskAmount / stopPct); const quantity = notional / entry; const now = nowIso(); const id = `DEMO-${Date.now()}`;
      const riskDistance = Math.abs(entry - stopLoss);
      const rewardDistance = tp3 != null ? Math.abs(tp3 - entry) : tp2 != null ? Math.abs(tp2 - entry) : tp1 != null ? Math.abs(tp1 - entry) : 0;
      const rr = riskDistance > 0 ? rewardDistance / riskDistance : null;
      s.position = {
        id, status: 'OPEN', side, entry, stopLoss, tp1, tp2, tp3, quantity, notional, leverage, margin: notional / leverage, riskPct, riskAmount, openedAt: now,
        mfePriceMove: 0, maePriceMove: 0, mfeR: 0, maeR: 0, confidence: num(b.confidence), timeframe: b.timeframe || 'M5/M15/M30/H1/H4',
        signal: b.signal || side, entryReason: b.entryReason || null, entryMode: b.entryMode || null,
        learningEligible: b.learningEligible === true, signalSnapshot: b.snapshot || null, snapshotAt: b.snapshot ? now : null,
        rr, trailStage: 'INITIAL', lastManagementAt: now, tpPlan: b.tpPlan || 'ADAPTIVE_STRUCTURE'
      };
      s.engineError = null; s.trades = [...s.trades, s.position].slice(-MAX_TRADES); await this.saveState(s); await this.ctx.storage.setAlarm(Date.now() + MONITOR_MS);
      return Response.json({ ok: true, position: s.position, equity: s.capital, stats: closedStats(s) });
    }
    if (url.pathname === '/tick' && method === 'POST') {
      const b = await request.json().catch(() => ({})); const price = num(b.price); if (!(price > 0)) return Response.json({ ok: false, error: 'Thiếu price hợp lệ' }, { status: 400 });
      const result = await this.markAndMaybeClose(s, price, b.source || 'HTTP'); s = result.state; await this.saveState(s); if (s.position) await this.ctx.storage.setAlarm(Date.now() + MONITOR_MS);
      return Response.json({ ok: true, ...s, position: s.position, closed: result.closed, equity: s.capital + (s.position?.unrealizedPnl || 0), stats: closedStats(s) });
    }
    if (url.pathname === '/close' && method === 'POST') {
      if (!s.position) return Response.json({ ok: false, error: 'Không có DEMO ORDER đang mở' }, { status: 409 });
      const b = await request.json().catch(() => ({})); const price = num(b.price, s.lastPrice); if (!(price > 0)) return Response.json({ ok: false, error: 'Thiếu price hợp lệ để đóng lệnh' }, { status: 400 });
      const p = snapshotPosition(s.position, price); const closed = { ...p, status: 'CLOSED', exit: price, exitReason: String(b.reason || 'MANUAL'), closeSource: 'HTTP', closedAt: nowIso(), realizedPnl: p.unrealizedPnl, realizedR: p.unrealizedR, durationSec: Math.floor((Date.now() - new Date(p.openedAt).getTime()) / 1000) };
      s.capital += closed.realizedPnl; s.realizedPnl += closed.realizedPnl; s.position = null; s.trades = s.trades.map(t => t.id === closed.id ? closed : t); const learning = recordLearning(s, closed); closed.learning = learning; s.trades = s.trades.map(t => t.id === closed.id ? closed : t); await this.ctx.storage.deleteAlarm(); await this.saveState(s);
      return Response.json({ ok: true, closed, learning, learningStats: learningStats(s), ...s, equity: s.capital, stats: closedStats(s) });
    }
    if (url.pathname === '/daily-report' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const dateVN = String(body.dateVN || vnDate(new Date().toISOString()));
      const report = upsertDailyReport(s, dateVN);
      await this.saveState(s);
      return Response.json({ ok: true, report, summaryText: dailyReportSummary(report), savedReports: s.dailyReports.length, updatedAt: s.updatedAt });
    }
    if (url.pathname === '/daily-reports' && method === 'GET') {
      const limit = Math.max(1, Math.min(MAX_DAILY_REPORTS, Math.floor(num(url.searchParams.get('limit'), 14))));
      // GET phải nhẹ và không ghi storage. Việc lưu snapshot được thực hiện khi
      // lệnh đóng (/close, alarm) và bởi cron /daily-report.
      const today = vnDate(new Date().toISOString());
      let report = (s.dailyReports || []).find(r => r.dateVN === today);
      if (!report) report = dailyReportForDate(s, today);
      const reports = Array.isArray(s.dailyReports) ? s.dailyReports.slice(-limit).reverse() : [];
      if (report && !reports.some(r => r.dateVN === today)) reports.unshift(report);
      return Response.json({ ok: true, today: report, reports, savedReports: (s.dailyReports || []).length, updatedAt: s.updatedAt });
    }
    if (url.pathname === '/learning' && method === 'GET') { const added=backfillLearning(s); if(added) await this.saveState(s); const limit = Math.max(1, Math.min(200, Math.floor(num(url.searchParams.get('limit'), 50)))); return Response.json({ ok: true, learning: (s.learning || []).slice(-limit), stats: learningStats(s), backfilled: added, updatedAt: s.updatedAt }); }
    if (url.pathname === '/history' && method === 'GET') {
      const limit = Math.max(1, Math.min(200, Math.floor(num(url.searchParams.get('limit'), 50))));
      return Response.json({ ok: true, trades: s.trades.slice(-limit), stats: closedStats(s), updatedAt: s.updatedAt });
    }
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}
