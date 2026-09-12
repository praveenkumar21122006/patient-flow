// Transparent rule-based triage engine (DEMO thresholds only).
// IMPORTANT: thresholds below are illustrative placeholders. They MUST be reviewed and
// validated by qualified clinical governance staff before any real-world use. This engine
// provides workflow support ("Suggested Priority – Requires Clinical Review") and never
// produces a diagnosis or treatment plan.

const RULE_VERSION = 'v1.0-demo';

const HIGH_RISK_CONDITIONS = [
  'heart disease', 'coronary', 'heart failure', 'stroke', 'diabetes', 'copd',
  'asthma', 'hypertension', 'kidney disease', 'cancer', 'immunosuppress',
  'hiv', 'tuberculosis', 'epilepsy',
];

// Canonical rule catalogue. Controllers and UI must not hard-code thresholds;
// import from here (or the TriageRule collection seeded from here).
const RULES = [
  { ruleId: 'RF-01', label: 'Red-flag symptom reported', category: 'red-flag', points: 25, description: 'Any red-flag symptom checkbox (chest pain, breathing difficulty, unresponsive, severe bleeding, stroke signs, severe allergy, head injury, severe abdominal pain, suicidal thoughts).' },
  { ruleId: 'RF-02', label: 'Multiple red flags', category: 'red-flag', points: 15, description: 'Two or more distinct red flags reported together.' },
  { ruleId: 'VS-01', label: 'Critically low oxygen saturation', category: 'vitals', points: 30, description: 'SpO2 below 90%.' },
  { ruleId: 'VS-02', label: 'Low oxygen saturation', category: 'vitals', points: 15, description: 'SpO2 90–93%.' },
  { ruleId: 'VS-03', label: 'Depressed consciousness', category: 'vitals', points: 40, description: 'Unresponsive on AVPU scale.' },
  { ruleId: 'VS-04', label: 'Responds to pain only', category: 'vitals', points: 25, description: 'Pain response on AVPU scale.' },
  { ruleId: 'VS-05', label: 'Responds to voice only', category: 'vitals', points: 15, description: 'Voice response on AVPU scale.' },
  { ruleId: 'VS-06', label: 'Extreme heart rate', category: 'vitals', points: 20, description: 'Heart rate above 130 or below 40 bpm.' },
  { ruleId: 'VS-07', label: 'Severe tachypnoea', category: 'vitals', points: 20, description: 'Respiratory rate 30/min or higher.' },
  { ruleId: 'VS-08', label: 'Hypotension signal', category: 'vitals', points: 20, description: 'Systolic BP below 90 mmHg.' },
  { ruleId: 'VS-09', label: 'Hypertensive urgency signal', category: 'vitals', points: 10, description: 'Systolic BP above 200 or diastolic above 120 mmHg.' },
  { ruleId: 'VS-10', label: 'High fever signal', category: 'vitals', points: 10, description: 'Temperature 39.5 °C or higher.' },
  { ruleId: 'PN-01', label: 'Severe pain', category: 'pain', points: 12, description: 'Pain score 8–10.' },
  { ruleId: 'PN-02', label: 'Moderate pain', category: 'pain', points: 6, description: 'Pain score 5–7.' },
  { ruleId: 'DG-01', label: 'Advanced age risk', category: 'demographic', points: 8, description: 'Age 75 years or older.' },
  { ruleId: 'DG-02', label: 'Infant risk', category: 'demographic', points: 8, description: 'Age 2 years or younger.' },
  { ruleId: 'DG-03', label: 'Pregnancy warning flag', category: 'demographic', points: 12, description: 'Pregnant or possibly pregnant with red-flag symptom or severe pain.' },
  { ruleId: 'HX-01', label: 'High-risk background condition', category: 'history', points: 8, description: 'Known cardiac, respiratory, metabolic, renal, oncologic or immunosuppressive condition.' },
  { ruleId: 'AR-01', label: 'Emergency arrival', category: 'arrival', points: 10, description: 'Arrival by ambulance or stretcher.' },
  { ruleId: 'AR-02', label: 'Worsening condition', category: 'arrival', points: 8, description: 'Patient reports symptoms getting worse.' },
  { ruleId: 'FB-01', label: 'Insufficient data for suggestion', category: 'fallback', points: 0, description: 'No symptoms and no vital signs recorded; case stays Unclassified for staff review.' },
  { ruleId: 'FB-02', label: 'Routine presentation, no escalation indicators', category: 'fallback', points: 0, description: 'Complete symptoms and vital signs recorded; none of the escalation thresholds were met. Suggested as Low Priority, still requiring clinical review.' },
];

function priorityForScore(score, hasData) {
  if (!hasData) return 'unclassified';
  if (score >= 50) return 'critical';
  if (score >= 30) return 'urgent';
  if (score >= 12) return 'moderate';
  // Any assessed case with recorded symptoms or vitals defaults to Low rather than
  // Unclassified; Unclassified is reserved for cases with no data at all.
  return 'low';
}

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// Abnormal vital flags — informational only, never a diagnosis.
function flagVitals(v = {}) {
  const flags = [];
  if (v.oxygenSaturation != null && v.oxygenSaturation < 94) flags.push('low-spo2');
  if (v.heartRateBpm != null && (v.heartRateBpm > 100 || v.heartRateBpm < 60)) flags.push('abnormal-heart-rate');
  if (v.respiratoryRate != null && (v.respiratoryRate >= 24 || v.respiratoryRate < 10)) flags.push('abnormal-respiratory-rate');
  if (v.systolicBp != null && (v.systolicBp < 90 || v.systolicBp > 180)) flags.push('abnormal-systolic-bp');
  if (v.diastolicBp != null && (v.diastolicBp < 60 || v.diastolicBp > 110)) flags.push('abnormal-diastolic-bp');
  if (v.temperatureC != null && (v.temperatureC >= 38 || v.temperatureC < 35)) flags.push('abnormal-temperature');
  if (v.consciousness && v.consciousness !== 'alert') flags.push('altered-consciousness');
  return flags;
}

function evaluateTriage({ symptomEntry = null, vitals = null, demographics = {}, history = null, arrivalMethod = 'walk-in' } = {}) {
  const matched = [];
  const risks = [];
  let score = 0;
  const push = (ruleId, detail) => {
    const rule = RULES.find((r) => r.ruleId === ruleId);
    if (!rule) return;
    score += rule.points;
    matched.push({ ruleId: rule.ruleId, label: rule.label, points: rule.points, detail: detail || '' });
  };

  const redFlags = (symptomEntry && symptomEntry.redFlags) || [];
  if (redFlags.length >= 1) {
    push('RF-01', `Reported: ${redFlags.join(', ')}`);
    redFlags.forEach((f) => risks.push(`red-flag:${f}`));
  }
  if (redFlags.length >= 2) push('RF-02', `${redFlags.length} concurrent red flags`);

  if (vitals) {
    const spo2 = vitals.oxygenSaturation;
    if (spo2 != null && spo2 < 90) { push('VS-01', `SpO2 ${spo2}%`); risks.push('low oxygen saturation'); }
    else if (spo2 != null && spo2 <= 93) { push('VS-02', `SpO2 ${spo2}%`); risks.push('borderline oxygen saturation'); }
    const c = vitals.consciousness;
    if (c === 'unresponsive') { push('VS-03', 'Unresponsive'); risks.push('unresponsive'); }
    else if (c === 'pain') { push('VS-04', 'Responds to pain only'); risks.push('depressed consciousness'); }
    else if (c === 'voice') { push('VS-05', 'Responds to voice only'); risks.push('drowsy / altered alertness'); }
    const hr = vitals.heartRateBpm;
    if (hr != null && (hr > 130 || hr < 40)) { push('VS-06', `HR ${hr} bpm`); risks.push('extreme heart rate'); }
    if (vitals.respiratoryRate != null && vitals.respiratoryRate >= 30) { push('VS-07', `RR ${vitals.respiratoryRate}/min`); risks.push('severe breathing rate elevation'); }
    if (vitals.systolicBp != null && vitals.systolicBp < 90) { push('VS-08', `SBP ${vitals.systolicBp} mmHg`); risks.push('low systolic blood pressure'); }
    if (vitals.systolicBp != null && (vitals.systolicBp > 200 || (vitals.diastolicBp != null && vitals.diastolicBp > 120))) { push('VS-09', `BP ${vitals.systolicBp}/${vitals.diastolicBp ?? '—'}`); risks.push('very high blood pressure'); }
    if (vitals.temperatureC != null && vitals.temperatureC >= 39.5) { push('VS-10', `Temp ${vitals.temperatureC} °C`); risks.push('high fever'); }
  }

  const pain = symptomEntry ? Number(symptomEntry.painLevel) : NaN;
  if (!Number.isNaN(pain) && pain >= 8) { push('PN-01', `Pain ${pain}/10`); risks.push('severe pain'); }
  else if (!Number.isNaN(pain) && pain >= 5) push('PN-02', `Pain ${pain}/10`);

  const age = ageFromDob(demographics.dateOfBirth);
  if (age != null && age >= 75) { push('DG-01', `Age ${age}`); risks.push('advanced age'); }
  if (age != null && age <= 2) { push('DG-02', `Age ${age}`); risks.push('infant age'); }
  const preg = history ? history.pregnancyStatus : null;
  if ((preg === 'pregnant' || preg === 'possibly-pregnant') && (redFlags.length > 0 || pain >= 8)) {
    push('DG-03', `Pregnancy status: ${preg}`);
    risks.push('pregnancy warning flag');
  }

  const conds = history && Array.isArray(history.conditions) ? history.conditions.join(' ').toLowerCase() : '';
  if (conds && HIGH_RISK_CONDITIONS.some((c) => conds.includes(c))) {
    push('HX-01', 'High-risk condition on record');
    risks.push('high-risk background condition');
  }

  if (arrivalMethod === 'ambulance' || arrivalMethod === 'stretcher') { push('AR-01', `Arrival: ${arrivalMethod}`); risks.push('emergency arrival'); }
  if (symptomEntry && symptomEntry.isWorsening) push('AR-02', 'Patient reports worsening');

  const hasData = Boolean(symptomEntry || vitals);
  if (!hasData) {
    matched.push({ ruleId: 'FB-01', label: 'Insufficient data for suggestion', points: 0, detail: 'No symptoms or vitals recorded yet.' });
  } else if (matched.length === 0) {
    matched.push({ ruleId: 'FB-02', label: 'Routine presentation, no escalation indicators', points: 0, detail: 'Recorded findings met none of the escalation thresholds.' });
  }

  const suggestedPriority = priorityForScore(score, hasData);
  const explanation = buildExplanation(suggestedPriority, matched, risks);

  return { suggestedPriority, score, matchedRules: matched, riskIndicators: [...new Set(risks)], explanation, ruleVersion: RULE_VERSION };
}

function buildExplanation(priority, matched, risks) {
  const label = { critical: 'Critical', urgent: 'Urgent', moderate: 'Moderate', low: 'Low Priority', unclassified: 'Unclassified' }[priority];
  if (priority === 'unclassified') {
    return 'Unclassified: not enough information was available for an automated suggestion. A clinician must review this case directly. Status: Suggested Priority – Requires Clinical Review.';
  }
  const top = matched.slice(0, 3).map((m) => m.label.toLowerCase()).join('; ') || 'reported findings';
  const riskText = risks.slice(0, 3).join(', ') || 'reported findings';
  const action = priority === 'critical'
    ? 'Recommended workflow action: notify authorized emergency staff immediately.'
    : priority === 'urgent'
      ? 'Recommended workflow action: prioritize for early clinician assessment.'
      : 'Recommended workflow action: place in routine review order.';
  return `Suggested Priority – Requires Clinical Review: ${label}. Key indicators: ${riskText}. Triggered rules: ${top}. ${action} Demo thresholds only — clinical confirmation is mandatory.`;
}

module.exports = { RULE_VERSION, RULES, HIGH_RISK_CONDITIONS, evaluateTriage, flagVitals, priorityForScore };
