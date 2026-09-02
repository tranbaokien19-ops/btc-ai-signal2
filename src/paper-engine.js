import { DurableObject } from 'cloudflare:workers';

const DEFAULT_CAPITAL = 1000000;
const MAX_TRADES = 5000;
const DEFAULT_LEVERAGE = 1;
const MAX_LEVERAGE = 20;
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

function validateTarget(side, entry, stopLoss, tp1, tp2) {
  if (!['LONG', 'SHORT'].includes(side)) return 'Side phải là LONG hoặc SHORT';
  if (!(entry > 0) || !(stopLoss > 0)) return 'Entry và Stop Loss phải > 0';
  if ((side === 'LONG' && stopLoss >= entry) || (side === 'SHORT' && stopLoss <= entry)) return 'Stop Loss không hợp lệ cho hướng lệnh';
  if (tp1 != null && (!(tp1 > 0) || (side === 'LONG' ? tp1 <= entry : tp1 >= entry))) return 'TP1 không hợp lệ cho hướng lệnh';
  if (tp2 != null && (!(tp2 > 0) || (side === 'LONG' ? tp2 <= entry : tp2 >= entry))) return 'TP2 không hợp lệ cho hướng lệnh';
  if (tp1 != null && tp2 != null && (side === 'LONG' ? tp2 < tp1 : tp2 > tp1)) return 'TP2 phải nằm xa Entry hơn TP1';
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
    return s || { initialCapital: DEFAULT_CAPITAL, capital: DEFAULT_CAPITAL, realizedPnl: 0, position: null, trades: [], lastPrice: null, lastTickAt: null, engine: 'ONLINE', updatedAt: nowIso() };
  }
  async saveState(s) { s.updatedAt = nowIso(); await this.ctx.storage.put('state', s); return s; }

  async markAndMaybeClose(s, price, source = 'HTTP') {
    if (!s.position) { s.lastPrice = price; s.lastTickAt = nowIso(); return { state: s, closed: null }; }
    const p = snapshotPosition(s.position, price);
    s.lastPrice = price; s.lastTickAt = p.lastMarkedAt;
    const hitSL = p.side === 'LONG' ? price <= p.stopLoss : price >= p.stopLoss;
    const hitTP1 = p.tp1 != null && (p.side === 'LONG' ? price >= p.tp1 : price <= p.tp1);
    const hitTP2 = p.tp2 != null && (p.side === 'LONG' ? price >= p.tp2 : price <= p.tp2);
    if (!(hitSL || hitTP2 || hitTP1)) { s.position = p; s.trades = s.trades.map(t => t.id === p.id ? { ...t, ...p } : t); return { state: s, closed: null }; }
    const exitReason = hitSL ? (hitTP1 || hitTP2 ? 'SL_AND_TP_SAME_TICK' : 'SL') : hitTP2 ? 'TP2' : 'TP1';
    const closed = { ...p, status: 'CLOSED', exit: price, exitReason, closeSource: source, closedAt: nowIso(), realizedPnl: p.unrealizedPnl, realizedR: p.unrealizedR, durationSec: Math.floor((Date.now() - new Date(p.openedAt).getTime()) / 1000) };
    s.capital += closed.realizedPnl; s.realizedPnl += closed.realizedPnl; s.position = null; s.trades = s.trades.map(t => t.id === closed.id ? closed : t);
    await this.ctx.storage.deleteAlarm();
    return { state: s, closed };
  }

  async alarm() {
    const s = await this.getState();
    if (!s.position) return;
    try {
      const r = await fetch(`${MARKET_API}/products/BTC-USD/ticker`, { headers: { accept: 'application/json', 'user-agent': 'btc-ai-signal2-paper/1.1' } });
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
      s = { initialCapital: capital, capital, realizedPnl: 0, position: null, trades: [], lastPrice: null, lastTickAt: null, engine: 'ONLINE', updatedAt: nowIso() };
      await this.ctx.storage.deleteAlarm(); await this.saveState(s); return Response.json({ ok: true, ...s, stats: closedStats(s) });
    }
    if (url.pathname === '/open' && method === 'POST') {
      if (s.position) return Response.json({ ok: false, error: 'Đang có DEMO ORDER mở' }, { status: 409 });
      const b = await request.json().catch(() => ({}));
      const side = String(b.side || '').toUpperCase(); const entry = num(b.entry); const stopLoss = num(b.stopLoss); const tp1 = num(b.takeProfit1, null); const tp2 = num(b.takeProfit2, null);
      const validation = validateTarget(side, entry, stopLoss, tp1, tp2); if (validation) return Response.json({ ok: false, error: validation }, { status: 400 });
      const leverage = Math.max(1, Math.min(MAX_LEVERAGE, num(b.leverage, DEFAULT_LEVERAGE))); const riskPct = Math.max(MIN_RISK_PCT, Math.min(MAX_RISK_PCT, num(b.riskPct, DEFAULT_RISK_PCT))); const riskAmount = s.capital * riskPct / 100; const stopPct = Math.abs(entry - stopLoss) / entry; const notional = Math.min(s.capital * leverage, riskAmount / stopPct); const quantity = notional / entry; const now = nowIso(); const id = `DEMO-${Date.now()}`;
      s.position = {
        id, status: 'OPEN', side, entry, stopLoss, tp1, tp2, quantity, notional, leverage, margin: notional / leverage, riskPct, riskAmount, openedAt: now,
        mfePriceMove: 0, maePriceMove: 0, mfeR: 0, maeR: 0, confidence: num(b.confidence), timeframe: b.timeframe || 'M5/M15/M30/H1/H4',
        signal: b.signal || side, entryReason: b.entryReason || null, entryMode: b.entryMode || null,
        learningEligible: b.learningEligible === true,
        signalSnapshot: b.snapshot || null,
        snapshotAt: b.snapshot ? now : null
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
      s.capital += closed.realizedPnl; s.realizedPnl += closed.realizedPnl; s.position = null; s.trades = s.trades.map(t => t.id === closed.id ? closed : t); await this.ctx.storage.deleteAlarm(); await this.saveState(s);
      return Response.json({ ok: true, closed, ...s, equity: s.capital, stats: closedStats(s) });
    }
    if (url.pathname === '/history' && method === 'GET') {
      const limit = Math.max(1, Math.min(200, Math.floor(num(url.searchParams.get('limit'), 50))));
      return Response.json({ ok: true, trades: s.trades.slice(-limit), stats: closedStats(s), updatedAt: s.updatedAt });
    }
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}
