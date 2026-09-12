# Database schema (MongoDB + Mongoose)

All models use timestamps (`createdAt/updatedAt`), ObjectId references, enum validation,
and targeted indexes. No single oversized document: intake data is normalized across
`Intake`, `SymptomEntry`, `MedicalHistory`, `VitalSigns`, `TriageAssessment`,
`QueueEntry`, and `ClinicalReview`.

## User

`{ email unique/lowercase/index, passwordHash select:false, role enum[patient|receptionist|nurse|doctor|admin] index, fullName, phone, isActive index (soft deactivation), mustChangePassword, lastLoginAt }`
Passwords hashed with bcrypt (cost 12) via `setPassword`; `toSafeJSON` strips secrets.

## PatientProfile

`{ user unique ref User, patientId unique (PT-YYYYMMDD-####), fullName text-index, dateOfBirth, gender enum, bloodGroup enum(+Unknown), phone index, email index, address, preferredLanguage, emergencyContact{Name,Relationship,Phone}, privacyConsent, privacyPreferences{shareForCare,allowSms,allowEmail}, isGuest, isActive }`
Text index on `(fullName, patientId, phone, email)` for front-desk search.

## StaffProfile

`{ user unique ref User, staffId unique, department ref Department, title, licenseNumber, isActive }`

## Hospital

`{ name unique, code unique, address, phone, isActive }` — single-row identity for header/seed.

## Department

`{ name unique, code unique uppercase, description, location, isActive, averageConsultMinutes }` — drives wait estimates.

## Intake (visit)

`{ visitId unique (VS-…), patient ref PatientProfile index, createdBy ref User, status enum(11) index, demographics{…snapshot}, arrivalMethod enum, visitType enum, chiefComplaint, departmentPreference ref, assignedDepartment ref index, symptomOnsetAt, previousVisitRef, symptoms[ref SymptomEntry], medicalHistory ref MedicalHistory, consent{dataProcessing,accuracyConfirmed,consentedAt}, documents[{filename,originalName,mime,size,uploadedAt}], assignedClinician ref User index, statusTimeline[{status,at,by,note}], isEmergencyGuest }`
Indexes: `(status,createdAt)`, `(assignedDepartment,status)`.

## SymptomEntry

`{ intake ref index, patient ref index, symptoms[String], duration, durationHours, severity enum, painLevel 0–10, painLocation, description, redFlags enum[10] , isWorsening, recordedBy ref }`

## MedicalHistory

`{ intake ref, patient ref, conditions[], previousSurgeries[], pregnancyStatus enum, allergies[{name,reaction}], medications[{name,dosage,frequency}], recentHospitalization, familyHistory, communicableScreening{fever,cough,contactWithInfectious,recentTravel,notes}, recordedBy }`

## VitalSigns (append-only)

`{ intake ref index, patient ref index, temperatureC, heartRateBpm, respiratoryRate, systolicBp, diastolicBp, oxygenSaturation, consciousness enum[alert|voice|pain|unresponsive], bloodGlucoseMgDl, weightKg, heightCm, bmi (pre-save), mobility enum, observations, recordedBy ref, recordedAt, abnormalFlags[] }`
New document per reading; history never overwritten.

## TriageAssessment

`{ intake ref index, patient ref index, ruleVersion index, suggestedPriority enum index, matchedRules[{ruleId,label,points,detail}], riskIndicators[], explanation, score, confirmedPriority enum, confirmedBy ref, confirmedAt, overrideReason, triageNotes, assessedBy ref, assessedAt, status enum[suggested|confirmed|overridden] index }`

## QueueEntry

`{ intake ref unique index, patient ref index, token unique, department ref index, suggestedPriority index, confirmedPriority index, status index, arrivalAt index, estimatedWaitMinutes, assignedClinician ref, isEscalated index, escalatedAt, position }`
Compound index `(confirmedPriority, isEscalated, arrivalAt)` supports the sort strategy.

## ClinicalReview

`{ intake ref index, patient ref index, reviewer ref User index, summary, reviewNotes required, newStatus, acknowledgedEmergency, reviewedAt }`

## Notification

`{ recipient ref User index, type index, title, body, relatedIntake ref, isRead index, readAt }`
Index `(recipient, isRead, createdAt)`. Bodies carry identifiers/status only — never records.

## AuditLog (immutable)

`{ actor ref User, actorRole, action index, entityType index, entityId index, metadata{}, ip }`
Index `(createdAt)`. No update/delete API; schema hook blocks `findOneAndUpdate`.

## TriageRule

`{ ruleId unique, version index, label, category enum[red-flag|vitals|pain|demographic|history|arrival|fallback], points 0–100, condition{}, isActive index, description }` — seeded from the engine catalogue; admins tune points/flags.

## PasswordResetToken

`{ user ref index, tokenHash unique (sha256), expiresAt index (TTL), usedAt }` — single-use, 1h.
