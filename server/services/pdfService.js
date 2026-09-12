const PDFDocument = require('pdfkit');

// Server-side PDF rendering for the printable patient intake summary.
// Mirrors the data contract of buildIntakeSummary(); never invents clinical content.
function fmt(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function section(doc, title) {
  doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#14273f').text(title);
  doc.moveTo(doc.page.margins.left, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2).stroke('#0e7c7b');
  doc.moveDown(0.4).font('Helvetica').fontSize(10).fillColor('#1c2733');
}

function kv(doc, label, value) {
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(fmt(value));
}

function buildIntakePdf({ intake, symptoms, history, vitals, triage, reviews, queue, disclaimer, generatedAt }, hospitalName = 'City General Hospital') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const p = intake.patient || {};
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#14273f').text(hospitalName);
    doc.fontSize(13).text('Patient Intake Summary');
    doc.font('Helvetica').fontSize(9).fillColor('#5d6b7a')
      .text(`Visit ${fmt(intake.visitId)} · Patient ${fmt(p.patientId)} · Generated ${fmtDate(generatedAt)}`);
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#8f1d12')
      .text('Suggested Priority – Requires Clinical Review. Not a diagnosis. See safety note at the end.');

    section(doc, 'Patient & visit');
    const d = intake.demographics || {};
    kv(doc, 'Patient', `${fmt(d.fullName || p.fullName)} (${fmt(d.gender || p.gender)})`);
    kv(doc, 'Contact', fmt(d.phone || p.phone));
    kv(doc, 'Emergency contact', `${fmt(d.emergencyContactName)} (${fmt(d.emergencyContactPhone)})`);
    kv(doc, 'Chief complaint', intake.chiefComplaint);
    kv(doc, 'Arrival / type', `${fmt(intake.arrivalMethod)} / ${fmt(intake.status)}`);
    kv(doc, 'Department', fmt(intake.assignedDepartment && (intake.assignedDepartment.name || intake.assignedDepartment)));
    kv(doc, 'Queue token', fmt(queue && queue.token));

    section(doc, 'Symptoms');
    (symptoms || []).forEach((s, i) => {
      doc.font('Helvetica-Bold').text(`Entry ${i + 1}: `, { continued: true }).font('Helvetica')
        .text(`${(s.symptoms || []).join(', ')} · Pain ${fmt(s.painLevel)}/10 · Severity ${fmt(s.severity)}`);
      if ((s.redFlags || []).length) doc.text(`Red flags: ${s.redFlags.join(', ')}`);
      if (s.description) doc.fillColor('#5d6b7a').text(fmt(s.description)).fillColor('#1c2733');
    });
    if (!symptoms || !symptoms.length) doc.text('No symptoms recorded.');

    section(doc, 'Medical background');
    if (history) {
      kv(doc, 'Conditions', (history.conditions || []).join(', '));
      kv(doc, 'Surgeries', (history.previousSurgeries || []).join(', '));
      kv(doc, 'Pregnancy', history.pregnancyStatus);
      kv(doc, 'Allergies', (history.allergies || []).map((a) => `${a.name || ''}${a.reaction ? ` (${a.reaction})` : ''}`).join(', '));
      kv(doc, 'Medications', (history.medications || []).map((m) => m.name || '').join(', '));
      kv(doc, 'Recent hospitalization', history.recentHospitalization);
      kv(doc, 'Family history', history.familyHistory);
    } else doc.text('No medical background recorded.');

    section(doc, 'Vital-sign history (informational only, not a diagnosis)');
    (vitals || []).forEach((v) => {
      doc.text(`${fmtDate(v.recordedAt)} — Temp ${fmt(v.temperatureC)} °C · HR ${fmt(v.heartRateBpm)} · RR ${fmt(v.respiratoryRate)} · BP ${fmt(v.systolicBp)}/${fmt(v.diastolicBp)} · SpO2 ${fmt(v.oxygenSaturation)}% · ${fmt(v.consciousness)}${(v.abnormalFlags || []).length ? ` [${v.abnormalFlags.join(', ')}]` : ''}`);
    });
    if (!vitals || !vitals.length) doc.text('No vital signs recorded.');

    section(doc, 'Triage assessments');
    (triage || []).forEach((a, i) => {
      doc.font('Helvetica-Bold').text(`Assessment ${i + 1} (rule ${fmt(a.ruleVersion)}, ${fmtDate(a.assessedAt)}): `, { continued: true })
        .font('Helvetica').text(`Suggested ${fmt(a.suggestedPriority)}${a.confirmedPriority ? ` · Confirmed ${a.confirmedPriority}` : ' · Awaiting confirmation'}`);
      if ((a.matchedRules || []).length) {
        a.matchedRules.forEach((m) => doc.text(`  • ${m.label} (+${m.points})${m.detail ? ` — ${m.detail}` : ''}`, { indent: 12 }));
      }
      if (a.explanation) doc.fillColor('#5d6b7a').text(fmt(a.explanation)).fillColor('#1c2733');
      if (a.overrideReason) kv(doc, 'Override reason', a.overrideReason);
    });
    if (!triage || !triage.length) doc.text('No triage assessment yet.');

    section(doc, 'Status timeline');
    (intake.statusTimeline || []).forEach((t) => doc.text(`• ${fmt(t.status)} — ${fmtDate(t.at)}${t.note ? ` — ${t.note}` : ''}`));
    if ((reviews || []).length) {
      section(doc, 'Clinical reviews');
      reviews.forEach((r) => doc.text(`• ${fmtDate(r.reviewedAt)} — ${fmt(r.reviewNotes)}${r.newStatus ? ` [${r.newStatus}]` : ''}`));
    }

    section(doc, 'Safety notice');
    doc.text(fmt(disclaimer));
    doc.text('If you believe you are experiencing a medical emergency, contact local emergency services immediately.');
    doc.end();
  });
}

module.exports = { buildIntakePdf };
