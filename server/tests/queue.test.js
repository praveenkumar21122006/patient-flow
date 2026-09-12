const { sortQueue } = require('../services/queueService');

describe('queue ordering', () => {
  test('clinical-first: escalation beats rank; confirmed priority beats arrival', () => {
    const t = (over) => ({ arrivalAt: new Date('2026-01-01T08:00:00Z'), isEscalated: false, suggestedPriority: 'low', confirmedPriority: null, ...over });
    const entries = [
      t({ token: 'low-early', suggestedPriority: 'low', confirmedPriority: 'low', arrivalAt: new Date('2026-01-01T07:00:00Z') }),
      t({ token: 'crit-late', suggestedPriority: 'critical', confirmedPriority: 'critical', arrivalAt: new Date('2026-01-01T09:00:00Z') }),
      t({ token: 'urgent-esc', suggestedPriority: 'urgent', confirmedPriority: 'urgent', isEscalated: true, arrivalAt: new Date('2026-01-01T10:00:00Z') }),
    ];
    const sorted = sortQueue(entries).map((e) => e.token);
    expect(sorted[0]).toBe('urgent-esc');
    expect(sorted[1]).toBe('crit-late');
    expect(sorted[2]).toBe('low-early');
  });

  test('arrival-only strategy ignores priority', () => {
    const entries = [
      { token: 'b', arrivalAt: new Date('2026-01-01T09:00:00Z'), confirmedPriority: 'critical', suggestedPriority: 'critical', isEscalated: false },
      { token: 'a', arrivalAt: new Date('2026-01-01T07:00:00Z'), confirmedPriority: 'low', suggestedPriority: 'low', isEscalated: false },
    ];
    expect(sortQueue(entries, 'arrival-only').map((e) => e.token)).toEqual(['a', 'b']);
  });
});
