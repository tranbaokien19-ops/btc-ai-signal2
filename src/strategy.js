function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  return avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length <= period) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  if (tr.length < period) return null;
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function timeframeScore(candles) {
  const closes = candles.map(c => c.close);
  const price = closes.at(-1);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const r = rsi(closes, 14);
  let score = 50;
  if (e20 != null && e50 != null) score += e20 > e50 ? 15 : -15;
  if (e50 != null && e200 != null) score += e50 > e200 ? 15 : -15;
  if (r != null) score += r >= 55 && r <= 68 ? 10 : r < 42 ? -10 : 0;
  if (price > e20) score += 5;
  else if (price < e20) score -= 5;
  return { score: Math.max(1, Math.min(99, Math.round(score))), price, ema20: e20, ema50: e50, ema200: e200, rsi14: r, atr14: atr(candles) };
}

function buildTradePlan(candles1m, candles5m, candles15m, options = {}) {
  const one = timeframeScore(candles1m);
  const five = timeframeScore(candles5m);
  const fifteen = timeframeScore(candles15m);
  const price = one.price;

  // Higher timeframes carry more weight so a short 1m spike cannot dominate the decision.
  const score = Math.round(one.score * 0.25 + five.score * 0.35 + fifteen.score * 0.40);
  const signal = score >= 70 ? 'LONG' : score <= 30 ? 'SHORT' : 'WAIT';
  const confidence = Math.round(Math.abs(score - 50) * 2);

  const a = one.atr14 || price * 0.003;
  const stopDistance = Math.max(a * 1.5, price * 0.0025);
  const targetDistance = stopDistance * 2;
  let entryLow = price - a * 0.35;
  let entryHigh = price + a * 0.15;
  let stop = price - stopDistance;
  let target1 = price + stopDistance * 1.2;
  let target2 = price + targetDistance;
  if (signal === 'SHORT') {
    entryLow = price - a * 0.15;
    entryHigh = price + a * 0.35;
    stop = price + stopDistance;
    target1 = price - stopDistance * 1.2;
    target2 = price - targetDistance;
  }
  if (signal === 'WAIT') {
    entryLow = price;
    entryHigh = price;
    stop = null;
    target1 = null;
    target2 = null;
  }

  const riskPct = Number.isFinite(+options.riskPct) ? Math.max(0.1, Math.min(2, +options.riskPct)) : 0.5;
  const maxLeverage = Number.isFinite(+options.maxLeverage) ? Math.max(1, Math.min(10, +options.maxLeverage)) : 3;
  const stopPct = stop ? Math.abs(price - stop) / price * 100 : null;
  // This is a risk-control ceiling, not a promise of safe leverage.
  const leverageByRisk = stopPct ? Math.min(maxLeverage, riskPct / stopPct) : 1;
  const suggestedLeverage = signal === 'WAIT' ? 1 : Math.max(1, Math.floor(leverageByRisk * 10) / 10);

  const reasons = [];
  if (five.score >= 60 && fifteen.score >= 60) reasons.push('Khung 5m và 15m đồng thuận tăng');
  if (five.score <= 40 && fifteen.score <= 40) reasons.push('Khung 5m và 15m đồng thuận giảm');
  if (one.rsi14 != null) reasons.push(`RSI 1m ${one.rsi14.toFixed(1)}`);
  if (one.ema20 != null && one.ema50 != null) reasons.push(one.ema20 > one.ema50 ? 'EMA20 trên EMA50' : 'EMA20 dưới EMA50');
  if (signal === 'WAIT') reasons.push('Chưa đủ đồng thuận để mở vị thế');

  return {
    signal,
    score,
    confidence,
    price,
    timeframes: { m1: one, m5: five, m15: fifteen },
    tradePlan: {
      entryLow,
      entryHigh,
      stopLoss: stop,
      takeProfit1: target1,
      takeProfit2: target2,
      riskPct,
      suggestedLeverage,
      maxLeverage,
      riskModel: 'Rủi ro tài khoản cố định; đòn bẩy chỉ là giới hạn kiểm soát vị thế'
    },
    reasons,
    generatedAt: new Date().toISOString()
  };
}

export { buildTradePlan };