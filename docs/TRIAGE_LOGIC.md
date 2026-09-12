# Triage logic (`TRIAGE v1.0-demo`)

> **Demo thresholds only.** These values are illustrative placeholders. They MUST be reviewed
> and validated by qualified clinical governance staff before any real-world use. Software
> testing does not equal clinical validation. The engine never outputs a diagnosis or
> treatment plan.

## Location of truth

All thresholds live in **one place**: `server/services/triageEngine.js`
(`RULES`, `RULE_VERSION = 'v1.0-demo'`) and are mirrored into the `TriageRule` collection
by the seed script / `POST /admin/rules/sync`. Controllers and frontend files must not
hard-code medical cutoffs — they import or fetch the catalogue.

## Inputs

- Latest `SymptomEntry`: symptoms, `painLevel` 0–10, `redFlags[]` (10 coded flags), `isWorsening`.
- Latest `VitalSigns`: temp, HR, RR, SBP/DBP, SpO2, consciousness (AVPU), glucose, BMI inputs.
- Demographics: age from DOB; `MedicalHistory`: conditions text, `pregnancyStatus`.
- `arrivalMethod` (ambulance/stretcher weighted).

## Rule catalogue (points)

| ID | Rule | Points |
|---|---|---|
| RF-01 | Any red-flag symptom | 25 |
| RF-02 | ≥2 concurrent red flags | +15 |
| VS-01 | SpO2 < 90 | 30 |
| VS-02 | SpO2 90–93 | 15 |
| VS-03/04/05 | Unresponsive / pain-only / voice-only | 40 / 25 / 15 |
| VS-06 | HR > 130 or < 40 | 20 |
| VS-07 | RR ≥ 30 | 20 |
| VS-08 | SBP < 90 | 20 |
| VS-09 | SBP > 200 or DBP > 120 | 10 |
| VS-10 | Temp ≥ 39.5 °C | 10 |
| PN-01/02 | Pain 8–10 / 5–7 | 12 / 6 |
| DG-01/02 | Age ≥ 75 / ≤ 2 | 8 / 8 |
| DG-03 | Pregnant/possibly-pregnant + red flag or severe pain | 12 |
| HX-01 | High-risk background condition keyword | 8 |
| AR-01/02 | Ambulance/stretcher arrival / worsening | 10 / 8 |
| FB-01 | No symptoms and no vitals → Unclassified | 0 |

## Priority mapping

- `score ≥ 50` → **Critical** (red)
- `score ≥ 30` → **Urgent** (orange)
- `score ≥ 12` → **Moderate** (yellow)
- `score ≥ 1` → **Low** (green)
- no data → **Unclassified** (grey, mandatory human review)

## Output

`{ suggestedPriority, score, matchedRules[{ruleId,label,points,detail}], riskIndicators[],
explanation, ruleVersion }`. Example:

- Suggested priority: Critical
- Status: Requires clinical review
- Triggered indicators: low oxygen saturation and reported breathing difficulty
- Recommended workflow action: notify authorized emergency staff immediately

The explanation always ends with the review mandate and the demo-threshold caveat.

## Human-in-the-loop

1. `POST /triage/assess` stores the suggestion (`status: suggested`).
2. A nurse/doctor confirms or overrides via `POST /triage/:id/confirm`.
3. Overrides require a written reason; original suggestion, final priority, staff, timestamp,
   and reason are persisted and audit-logged (`triage.confirm` / `triage.override`).
4. Critical suggestions trigger emergency notifications + audit events.

## Worked examples

- Chest pain + breathing difficulty, SpO2 88%, voice-responsive, ambulance: RF-01 (25) + RF-02 (15) + VS-01 (30) + VS-05 (15) + AR-01 (10) + … → ~100+ → **Critical**.
- Fever 39.8 °C, HR 118, rash flag: RF-01 (25) + VS-10 (10) ≈ 35+ → **Urgent**.
- Sore throat, normal vitals, pain 3: small or zero score → **Low** or **Unclassified** if no vitals.
