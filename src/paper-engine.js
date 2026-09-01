const DEFAULT_CAPITAL = 1000000;
const MAX_TRADES = 5000;

function num(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function sideSign(side) { return side === 'LONG' ? 1 : -1; }
function snapshotPosition(p, price) {
  if (!p) return null;
  const px = num(price, p.entry);
  const pnl = sideSign(p.side) * (px - p.entry) * p.quantity;
  const r = p.riskAmount > 0 ? pnl / p.riskAmount : null;
  const favorable = p.side === 'LONG' ? px - p.entry : p.entry - px;
  const adverse = p.side === 'LONG' ? p.entry - px : px - p.entry;
  return {...p, currentPrice:px, unrealizedPnl:pnl, unrealizedR:r,
    mfePriceMove:Math.max(p.mfePriceMove || 0, favorable),
    maePriceMove:Math.max(p.maePriceMove || 0, adverse)};
}

export class PaperTrading extends DurableObject {
  async getState() {
    const s = await this.ctx.storage.get('state');
    return s || {initialCapital:DEFAULT_CAPITAL, capital:DEFAULT_CAPITAL, realizedPnl:0, position:null, trades:[], updatedAt:new Date().toISOString()};
  }
  async saveState(s) { s.updatedAt = new Date().toISOString(); await this.ctx.storage.put('state', s); return s; }

  async fetch(request) {
    const url = new URL(request.url), method = request.method.toUpperCase();
    let s = await this.getState();

    if (url.pathname === '/status' && method === 'GET') {
      const position = snapshotPosition(s.position, num(url.searchParams.get('price')));
      return Response.json({ok:true,...s,position,equity:s.capital+(position?.unrealizedPnl||0),openTrades:s.trades.filter(t=>t.status==='OPEN').length});
    }

    if (url.pathname === '/reset' && method === 'POST') {
      const body = await request.json().catch(()=>({}));
      const capital = Math.max(1000, num(body.capital, DEFAULT_CAPITAL));
      s={initialCapital:capital,capital,realizedPnl:0,position:null,trades:[],updatedAt:new Date().toISOString()};
      await this.saveState(s); return Response.json({ok:true,...s});
    }

    if (url.pathname === '/open' && method === 'POST') {
      if (s.position) return Response.json({ok:false,error:'Đang có DEMO ORDER mở'},{status:409});
      const b=await request.json(), side=String(b.side||'').toUpperCase();
      const entry=num(b.entry), stopLoss=num(b.stopLoss), tp1=num(b.takeProfit1), tp2=num(b.takeProfit2);
      if (!['LONG','SHORT'].includes(side)||!entry||!stopLoss) return Response.json({ok:false,error:'Thiếu side/entry/stopLoss'},{status:400});
      if ((side==='LONG'&&stopLoss>=entry)||(side==='SHORT'&&stopLoss<=entry)) return Response.json({ok:false,error:'Stop Loss không hợp lệ cho hướng lệnh'},{status:400});
      const leverage=Math.max(1,Math.min(20,num(b.leverage,1))), riskPct=Math.max(.1,Math.min(2,num(b.riskPct,.5)));
      const riskAmount=s.capital*riskPct/100, stopPct=Math.abs(entry-stopLoss)/entry;
      const notional=Math.min(s.capital*leverage,riskAmount/stopPct), quantity=notional/entry, now=new Date().toISOString(), id=`DEMO-${Date.now()}`;
      s.position={id,status:'OPEN',side,entry,stopLoss,tp1:tp1||null,tp2:tp2||null,quantity,notional,leverage,riskPct,riskAmount,openedAt:now,mfePriceMove:0,maePriceMove:0,confidence:num(b.confidence),timeframe:b.timeframe||'M5/M15/M30/H1/H4',signal:b.signal||'UNKNOWN'};
      s.trades=[...s.trades,s.position].slice(-MAX_TRADES); await this.saveState(s);
      return Response.json({ok:true,position:s.position,equity:s.capital});
    }

    if (url.pathname === '/tick' && method === 'POST') {
      if (!s.position) return Response.json({ok:true,position:null,capital:s.capital,realizedPnl:s.realizedPnl});
      const b=await request.json().catch(()=>({})), price=num(b.price);
      if (!price) return Response.json({ok:false,error:'Thiếu price'},{status:400});
      const p=snapshotPosition(s.position,price);
      const hitSL=p.side==='LONG'?price<=p.stopLoss:price>=p.stopLoss;
      const hitTP1=p.tp1!=null&&(p.side==='LONG'?price>=p.tp1:price<=p.tp1);
      const hitTP2=p.tp2!=null&&(p.side==='LONG'?price>=p.tp2:price<=p.tp2);
      if(hitSL||hitTP2||hitTP1){
        const exitReason=hitSL?'SL':hitTP2?'TP2':'TP1';
        const closed={...p,status:'CLOSED',exit:price,exitReason,closedAt:new Date().toISOString(),realizedPnl:p.unrealizedPnl,realizedR:p.unrealizedR};
        s.capital+=p.unrealizedPnl; s.realizedPnl+=p.unrealizedPnl; s.position=null;
        s.trades=s.trades.map(t=>t.id===closed.id?closed:t); await this.saveState(s);
        return Response.json({ok:true,closed,capital:s.capital,realizedPnl:s.realizedPnl});
      }
      s.position=p; s.trades=s.trades.map(t=>t.id===p.id?{...t,...p}:t); await this.saveState(s);
      return Response.json({ok:true,position:p,capital:s.capital,realizedPnl:s.realizedPnl});
    }

    return Response.json({ok:false,error:'Not found'},{status:404});
  }
}
