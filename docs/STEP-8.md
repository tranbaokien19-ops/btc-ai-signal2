# Step 8 — DEMO performance learning & model validation

## Goal
After the DEMO auto-trading loop is running, collect real results from its own DEMO trades and use those results to evaluate whether the AI strategy/model should be retained or replaced.

## Scope
- Record every closed DEMO trade.
- Separate winning and losing trades.
- Track P&L, R, MFE, MAE and holding time.
- Calculate performance metrics such as win rate, profit factor, total P&L and drawdown.
- Analyze results by timeframe/signal direction where available.
- Build a validation process for a candidate/new model against the current model.
- Only allow model replacement when the candidate demonstrably performs better under the agreed validation criteria.
- Keep the DEMO loop running continuously.

## Current temporary setting
- DEMO leverage remains **3x temporarily** by user decision.
- The existing Step 7 leverage >=10x issue remains open and must not be considered resolved.

## Rule
Do not move to real Futures execution. The AI must prove profitability on DEMO first.

## Development process
One part → build → test in reality → user confirms OK → move to the next part.
