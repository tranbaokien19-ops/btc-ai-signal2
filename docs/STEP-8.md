# Step 8 — 24H AI forecast, DEMO learning & model validation

## Goal
Build the AI loop that forecasts the main BTC trend for the next 24 hours, prepares trading plans before price reaches the entry area, waits for the predicted zone, automatically enters DEMO when confirmation conditions are met, evaluates the original forecast against the real outcome, learns from its own DEMO trades, validates candidate models, and repeats continuously.

## 1. Market analysis
Use realtime data from:
- M5
- M15
- M30
- H1
- H4

These timeframes are used to analyze structure, momentum, support/resistance, pullback zones and entry timing. They do not replace the primary 24H forecast.

## 2. Primary 24H forecast
For every forecast cycle, AI must determine:
- Main direction: UP / DOWN / SIDEWAYS.
- Confidence.
- Expected destination/target zones.
- Expected pullback/entry zones.
- Main and alternative scenarios.
- Invalidation conditions.

The 24H forecast is the primary forecast horizon.

## 3. Mandatory four trade scenarios
Before price moves into the entry zone, AI must prepare **2 LONG scenarios and 2 SHORT scenarios**.

### LONG A — Main
- Entry zone
- Confirmation conditions
- SL
- TP1 / TP2 / TP3
- Invalidation

### LONG B — Alternative
- Alternative entry zone
- Confirmation conditions
- SL
- TP1 / TP2 / TP3
- Invalidation

### SHORT A — Main
- Entry zone
- Confirmation conditions
- SL
- TP1 / TP2 / TP3
- Invalidation

### SHORT B — Alternative
- Alternative entry zone
- Confirmation conditions
- SL
- TP1 / TP2 / TP3
- Invalidation

The AI must create these scenarios before price movement invalidates or triggers them. It must not invent a scenario after seeing the outcome.

If none of the four scenarios is confirmed, the decision is **WAIT**.

## 4. Wait for the predicted zone
AI must not chase price.

When price reaches a planned zone, AI re-checks M5/M15/M30/H1/H4 and evaluates the confirmation conditions for the relevant scenario.

- Confirmed → activate the scenario.
- Not confirmed → WAIT.
- Price never reaches the zone → no trade.

## 5. Automatic DEMO entry
When confirmation conditions are satisfied, AI automatically decides:
- LONG
- SHORT
- WAIT

If a trade is triggered, AI opens the DEMO order automatically without manual user action.

### Temporary leverage
DEMO leverage remains **3x temporarily** by user decision. The existing Step 7 leverage >=10x issue remains open and is not considered resolved.

## 6. DEMO position management
After entry, AI must monitor realtime and manage:
- SL
- TP1
- TP2
- TP3
- Trailing/stop adjustments where applicable
- Position closing
- Holding time

Record for every closed DEMO trade:
- P&L
- R
- MFE
- MAE
- Holding time
- Win/loss result

## 7. Post-trade evaluation against the original plan
After every DEMO trade closes, AI must compare the actual outcome with the plan that existed **before entry**.

Evaluate:
- Was the 24H direction correct?
- Did price reach the predicted zone?
- Which of LONG A / LONG B / SHORT A / SHORT B was relevant?
- Was the entry appropriate?
- Did price follow the predicted scenario or reverse?
- Were SL and TP levels appropriate?
- What was correct?
- What was wrong?
- Why did the trade win or lose?

The original forecast and scenario must remain immutable for this evaluation so the system cannot rewrite history after the trade.

## 8. AI learns from its own DEMO trades
Learning must use the actual outcomes of the AI's own DEMO trades, not merely historical-data statistics.

Store and analyze successful and failed patterns, including:
- Forecast direction accuracy.
- Scenario selection accuracy.
- Entry-zone quality.
- Confirmation quality.
- SL/TP quality.
- Market conditions associated with wins/losses.
- P&L, R, MFE, MAE and holding time.

## 9. Candidate model validation
When a new/candidate model is produced:
1. Validate it against the current model using agreed performance criteria.
2. Compare results on sufficiently comparable data/trades.
3. Replace the current model only when the candidate demonstrably performs better.
4. Otherwise keep the current model.

No model replacement based only on a small number of wins or losses.

## 10. Continuous 24/7 loop
```text
REALTIME DATA
    ↓
M5 + M15 + M30 + H1 + H4 ANALYSIS
    ↓
PRIMARY 24H FORECAST
    ↓
2 LONG + 2 SHORT SCENARIOS
    ↓
WAIT FOR PLANNED ZONE
    ↓
RE-CHECK CONFIRMATION
    ↓
AUTO DEMO ENTRY / WAIT
    ↓
POSITION MANAGEMENT
    ↓
CLOSE TRADE
    ↓
COMPARE ORIGINAL PLAN VS ACTUAL RESULT
    ↓
LEARN FROM OWN DEMO TRADE
    ↓
VALIDATE CANDIDATE MODEL
    ↓
KEEP OR REPLACE MODEL
    ↓
REPEAT 24/7
```

## 11. Real Futures gate
Do not move to real Futures execution yet.

The AI must first demonstrate profitability on DEMO with enough data and validation to show that performance is not based on a short lucky streak.

## Development process
One part → build → test in reality → user confirms OK → move to the next part.

Do not change the Step 8 requirements or jump ahead without explicit user confirmation.
