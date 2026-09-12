// Fictional demo seed. Every name, email, and clinical value below is invented for testing.
// Run: npm run seed  (requires MONGODB_URI or local MongoDB)
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const PatientProfile = require('../models/PatientProfile');
const StaffProfile = require('../models/StaffProfile');
const Hospital = require('../models/Hospital');
const Department = require('../models/Department');
const Intake = require('../models/Intake');
const SymptomEntry = require('../models/SymptomEntry');
const MedicalHistory = require('../models/MedicalHistory');
const VitalSigns = require('../models/VitalSigns');
const TriageAssessment = require('../models/TriageAssessment');
const QueueEntry = require('../models/QueueEntry');
const ClinicalReview = require('../models/ClinicalReview');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const TriageRule = require('../models/TriageRule');
const { RULES, RULE_VERSION, evaluateTriage, flagVitals } = require('../services/triageEngine');
const { patientId, visitId, queueToken, apptId } = require('../utils/helpers');

const DEMO_USERS = [
  { email: 'patient@demo.local', password: 'Patient123!', role: 'patient', fullName: 'Amara Osei (demo patient)' },
  { email: 'reception@demo.local', password: 'Reception123!', role: 'receptionist', fullName: 'Ravi Desk (demo reception)' },
  { email: 'nurse@demo.local', password: 'Nurse123!', role: 'nurse', fullName: 'Nadia Rao (demo nurse)' },
  { email: 'doctor@demo.local', password: 'Doctor123!', role: 'doctor', fullName: 'Dr. Elena Marsh (demo doctor)' },
  { email: 'admin@demo.local', password: 'Admin123!', role: 'admin', fullName: 'Admin Okafor (demo admin)' },
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/patientflow';
  await mongoose.connect(uri);
  console.log('[seed] connected, clearing demo collections…');
  for (const m of [User, PatientProfile, StaffProfile, Hospital, Department, Intake, SymptomEntry, MedicalHistory, VitalSigns, TriageAssessment, QueueEntry, ClinicalReview, Appointment, Notification, AuditLog, TriageRule]) {
    await m.deleteMany({});
  }

  const hospital = await Hospital.create({ name: process.env.HOSPITAL_NAME || 'City General Hospital', code: 'CGH', address: '1 Hospital Way (fictional)', phone: '+1 (555) 010-2030' });
  const depts = await Department.insertMany([
    { name: 'Emergency', code: 'EMER', location: 'Ground floor', averageConsultMinutes: 12 },
    { name: 'General Medicine', code: 'GEN', location: 'First floor', averageConsultMinutes: 15 },
    { name: 'Cardiology', code: 'CARD', location: 'Second floor', averageConsultMinutes: 20 },
    { name: 'Paediatrics', code: 'PAED', location: 'Second floor', averageConsultMinutes: 15 },
    { name: 'Maternity', code: 'MAT', location: 'Third floor', averageConsultMinutes: 20 },
  ]);
  const byCode = Object.fromEntries(depts.map((d) => [d.code, d]));

  // Triage rule catalogue
  for (const r of RULES) await TriageRule.create({ ...r, version: RULE_VERSION });

  // Users
  const users = {};
  for (const d of DEMO_USERS) {
    const u = new User({ email: d.email, role: d.role, fullName: d.fullName, phone: '+1 (555) 000-0000' });
    await u.setPassword(d.password);
    await u.save();
    users[d.role] = u;
    if (d.role !== 'patient') {
      await StaffProfile.create({ user: u._id, staffId: `ST-DEMO-${d.role.toUpperCase()}`, department: d.role === 'doctor' ? byCode.GEN._id : null, title: d.role });
    }
  }

  // Extra fictional patients (registered by reception demo)
  const patientDefs = [
    { name: 'Jonas Weber', dob: '1952-03-11', gender: 'male', phone: '+1 (555) 101-0001' },
    { name: 'Priya Nair', dob: '1994-07-22', gender: 'female', phone: '+1 (555) 101-0002' },
    { name: 'Samuel Adeyemi', dob: '2019-11-05', gender: 'male', phone: '+1 (555) 101-0003' },
    { name: 'Lucia Fernandez', dob: '1988-01-30', gender: 'female', phone: '+1 (555) 101-0004' },
    { name: 'Tom Becker', dob: '1975-09-14', gender: 'male', phone: '+1 (555) 101-0005' },
    { name: 'Aisha Khan', dob: '2001-05-19', gender: 'female', phone: '+1 (555) 101-0006' },
  ];
  const profiles = [];
  // Primary demo patient profile
  const mainProfile = await PatientProfile.create({
    user: users.patient._id, patientId: patientId(), fullName: 'Amara Osei (demo patient)',
    dateOfBirth: new Date('1990-04-12'), gender: 'female', bloodGroup: 'O+', phone: '+1 (555) 100-0000',
    email: 'patient@demo.local', address: '4 Demo Street (fictional)', emergencyContactName: 'Kofi Osei',
    emergencyContactRelationship: 'Brother', emergencyContactPhone: '+1 (555) 100-0001',
  });
  profiles.push(mainProfile);
  for (const p of patientDefs) {
    const u = new User({ email: `${p.name.toLowerCase().replace(/[^a-z]+/g, '.')}@demo.local`, role: 'patient', fullName: p.name, phone: p.phone });
    await u.setPassword('Patient123!');
    await u.save();
    profiles.push(await PatientProfile.create({
      user: u._id, patientId: patientId(), fullName: p.name, dateOfBirth: new Date(p.dob),
      gender: p.gender, bloodGroup: 'Unknown', phone: p.phone, email: u.email,
      emergencyContactName: 'Demo Contact', emergencyContactRelationship: 'Family', emergencyContactPhone: '+1 (555) 199-0000',
    }));
  }

  // Intakes across statuses/priorities (all fictional)
  const scenarios = [
    { profile: 1, complaint: 'Severe chest pressure and shortness of breath', dept: 'EMER', arrival: 'ambulance', symptoms: ['Chest pain', 'Breathing difficulty'], redFlags: ['chest-pain', 'breathing-difficulty'], pain: 9, severity: 'severe', vitals: { oxygenSaturation: 88, heartRateBpm: 128, respiratoryRate: 32, systolicBp: 86, diastolicBp: 54, temperatureC: 37.1, consciousness: 'voice' }, conditions: 'hypertension, heart disease', status: 'escalated', confirm: 'critical' },
    { profile: 2, complaint: 'High fever with spreading rash', dept: 'GEN', arrival: 'walk-in', symptoms: ['Fever', 'Rash'], redFlags: ['high-fever-with-rash'], pain: 6, severity: 'moderate', vitals: { oxygenSaturation: 95, heartRateBpm: 118, respiratoryRate: 24, systolicBp: 104, diastolicBp: 66, temperatureC: 39.8, consciousness: 'alert' }, conditions: 'asthma', status: 'awaiting-clinical-review', confirm: null },
    { profile: 3, complaint: 'Toddler with persistent cough and poor feeding', dept: 'PAED', arrival: 'walk-in', symptoms: ['Cough', 'Fatigue'], redFlags: [], pain: 3, severity: 'moderate', vitals: { oxygenSaturation: 93, heartRateBpm: 142, respiratoryRate: 38, systolicBp: 88, diastolicBp: 55, temperatureC: 38.4, consciousness: 'alert' }, conditions: '', status: 'assigned', confirm: 'urgent' },
    { profile: 4, complaint: 'Sore throat and mild headache for two days', dept: 'GEN', arrival: 'walk-in', symptoms: ['Sore throat', 'Headache'], redFlags: [], pain: 3, severity: 'mild', vitals: { oxygenSaturation: 98, heartRateBpm: 78, respiratoryRate: 16, systolicBp: 118, diastolicBp: 76, temperatureC: 37.4, consciousness: 'alert' }, conditions: '', status: 'in-consultation', confirm: 'low' },
    { profile: 5, complaint: 'Lower back pain after lifting', dept: 'GEN', arrival: 'walk-in', symptoms: ['Back pain'], redFlags: [], pain: 5, severity: 'moderate', vitals: { oxygenSaturation: 97, heartRateBpm: 88, respiratoryRate: 18, systolicBp: 132, diastolicBp: 84, temperatureC: 36.8, consciousness: 'alert' }, conditions: 'diabetes', status: 'awaiting-triage', confirm: null },
    { profile: 0, complaint: 'Dizziness and palpitations', dept: 'CARD', arrival: 'referred', symptoms: ['Dizziness', 'Palpitations'], redFlags: [], pain: 4, severity: 'moderate', vitals: { oxygenSaturation: 96, heartRateBpm: 112, respiratoryRate: 20, systolicBp: 142, diastolicBp: 88, temperatureC: 36.9, consciousness: 'alert' }, conditions: '', status: 'completed', confirm: 'moderate' },
  ];

  for (const [idx, s] of scenarios.entries()) {
    const prof = profiles[s.profile];
    const intake = await Intake.create({
      visitId: visitId(), patient: prof._id, createdBy: users.receptionist._id, status: 'draft',
      demographics: { fullName: prof.fullName, dateOfBirth: prof.dateOfBirth, gender: prof.gender, bloodGroup: prof.bloodGroup, phone: prof.phone, email: prof.email, address: prof.address, preferredLanguage: 'English', emergencyContactName: prof.emergencyContactName, emergencyContactRelationship: prof.emergencyContactRelationship, emergencyContactPhone: prof.emergencyContactPhone },
      arrivalMethod: s.arrival, visitType: idx === 0 ? 'emergency' : 'new', chiefComplaint: s.complaint,
      departmentPreference: byCode[s.dept]._id, assignedDepartment: byCode[s.dept]._id,
      symptomOnsetAt: new Date(Date.now() - 1000 * 60 * 60 * (6 + idx * 3)),
      consent: { dataProcessing: true, accuracyConfirmed: true, consentedAt: new Date() },
      statusTimeline: [{ status: 'draft', at: new Date(Date.now() - 1000 * 60 * 60 * 5), by: users.receptionist._id }],
    });
    const sym = await SymptomEntry.create({
      intake: intake._id, patient: prof._id, symptoms: s.symptoms, duration: '1 day', severity: s.severity,
      painLevel: s.pain, painLocation: '', description: `Demo case: ${s.complaint.toLowerCase()} (fictional).`,
      redFlags: s.redFlags, isWorsening: idx === 0, recordedBy: users.receptionist._id,
    });
    const hist = await MedicalHistory.create({
      intake: intake._id, patient: prof._id, conditions: s.conditions ? [s.conditions] : [],
      previousSurgeries: [], pregnancyStatus: 'not-applicable', allergies: [], medications: [],
      recentHospitalization: '', familyHistory: '', communicableScreening: {}, recordedBy: users.receptionist._id,
    });
    intake.symptoms = [sym._id];
    intake.medicalHistory = hist._id;
    const vit = { intake: intake._id, patient: prof._id, ...s.vitals, mobility: 'independent', observations: 'Demo observation (fictional).', recordedBy: users.nurse._id, recordedAt: new Date() };
    vit.abnormalFlags = flagVitals(vit);
    await VitalSigns.create(vit);
    const result = evaluateTriage({
      symptomEntry: sym, vitals: vit,
      demographics: { dateOfBirth: prof.dateOfBirth }, history: hist, arrivalMethod: s.arrival,
    });
    const assessment = await TriageAssessment.create({
      intake: intake._id, patient: prof._id, ruleVersion: result.ruleVersion,
      suggestedPriority: result.suggestedPriority, matchedRules: result.matchedRules,
      riskIndicators: result.riskIndicators, explanation: result.explanation, score: result.score,
      assessedBy: users.nurse._id, assessedAt: new Date(),
      confirmedPriority: s.confirm, confirmedBy: s.confirm ? users.nurse._id : null, confirmedAt: s.confirm ? new Date() : null,
      overrideReason: '', triageNotes: 'Demo triage note (fictional).', status: s.confirm ? 'confirmed' : 'suggested',
    });
    intake.status = s.status === 'awaiting-triage' ? 'awaiting-triage' : s.status;
    intake.statusTimeline.push({ status: 'awaiting-triage', at: new Date(), by: users.receptionist._id, note: 'Submitted (seed)' });
    if (s.confirm) intake.statusTimeline.push({ status: s.status, at: new Date(), by: users.nurse._id, note: `Confirmed ${s.confirm} (seed)` });
    await intake.save();
    await QueueEntry.create({
      intake: intake._id, patient: prof._id, token: queueToken(s.dept),
      department: byCode[s.dept]._id, suggestedPriority: result.suggestedPriority,
      confirmedPriority: s.confirm || null, status: s.status,
      arrivalAt: new Date(Date.now() - 1000 * 60 * (10 + idx * 17)),
      isEscalated: s.status === 'escalated', escalatedAt: s.status === 'escalated' ? new Date() : null,
    });
    if (idx === 0) {
      await ClinicalReview.create({ intake: intake._id, patient: prof._id, reviewer: users.doctor._id, summary: 'Escalated critical demo case.', reviewNotes: 'Acknowledged. Patient moved to resuscitation bay per drill protocol (fictional).', newStatus: 'escalated', acknowledgedEmergency: true });
    }
    await Notification.create({ recipient: users.nurse._id, type: 'triage-ready', title: 'Patient ready for triage', body: `Visit ${intake.visitId} is awaiting triage.` });
  }

  await Notification.create({ recipient: users.doctor._id, type: 'critical-case', title: 'Critical case detected', body: 'A demo critical suggestion requires review (fictional).' });
  await Notification.create({ recipient: users.patient._id, type: 'intake-submitted', title: 'Intake submitted', body: 'Your demo intake was received and is awaiting triage.' });

  // Demo appointments (fictional): one upcoming, one completed, one cancelled.
  const day = 24 * 60 * 60 * 1000;
  await Appointment.create([
    { appointmentId: apptId(), patient: profiles[2]._id, department: byCode.GEN._id, clinician: users.doctor._id, scheduledAt: new Date(Date.now() + 2 * day), durationMinutes: 30, reason: 'Follow-up: fever review (fictional).', status: 'scheduled', createdBy: users.receptionist._id },
    { appointmentId: apptId(), patient: profiles[4]._id, department: byCode.GEN._id, clinician: users.doctor._id, scheduledAt: new Date(Date.now() - 3 * day), durationMinutes: 20, reason: 'Back-pain review (fictional).', status: 'completed', completedAt: new Date(Date.now() - 3 * day), createdBy: users.receptionist._id },
    { appointmentId: apptId(), patient: profiles[5]._id, department: byCode.CARD._id, clinician: null, scheduledAt: new Date(Date.now() + 5 * day), durationMinutes: 30, reason: 'Cardiology consult request (fictional).', status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Patient requested new time (fictional).', createdBy: users.receptionist._id },
  ]);
  await AuditLog.create({ actor: users.admin._id, actorRole: 'admin', action: 'seed.completed', entityType: 'System', metadata: { note: 'Fictional demo data loaded' } });

  console.log('[seed] done. Demo logins: patient@demo.local / Patient123! · nurse@demo.local / Nurse123! · doctor@demo.local / Doctor123! · reception@demo.local / Reception123! · admin@demo.local / Admin123!');
  await mongoose.disconnect();
}

main().catch((err) => { console.error('[seed] failed:', err.message); process.exit(1); });
