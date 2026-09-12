// Queue ordering: confirmed clinical priority first, then escalation, then arrival time.
// Administrators can change the strategy via the sortStrategy argument ('clinical-first' default,
// 'arrival-only' for walk-in order during drills).
const PRIORITY_RANK = { critical: 0, urgent: 1, moderate: 2, low: 3, unclassified: 4 };

function effectiveRank(entry) {
  const p = entry.confirmedPriority || entry.suggestedPriority || 'unclassified';
  return PRIORITY_RANK[p] ?? 4;
}

function sortQueue(entries, strategy = 'clinical-first') {
  const list = [...entries];
  if (strategy === 'arrival-only') {
    return list.sort((a, b) => new Date(a.arrivalAt) - new Date(b.arrivalAt));
  }
  return list.sort((a, b) => {
    if (Boolean(b.isEscalated) !== Boolean(a.isEscalated)) return b.isEscalated ? 1 : -1;
    const r = effectiveRank(a) - effectiveRank(b);
    if (r !== 0) return r;
    return new Date(a.arrivalAt) - new Date(b.arrivalAt);
  });
}

function estimateWaitMinutes(position, avgConsultMinutes = 15) {
  if (position == null || position < 0) return null;
  return position * avgConsultMinutes;
}

module.exports = { PRIORITY_RANK, sortQueue, estimateWaitMinutes };
