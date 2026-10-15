-- Phase „Kontaktiert“ abgeschafft (Felix 15.10.): Wer nicht rangeht, bleibt in der Anrufliste (Sperre bis morgen),
-- es gibt keinen Zwischenstatus mehr. Die Standard-Phase, in die der Bot A/B-Bewerber legt, heißt jetzt „Qualifiziert“
-- (= vom Bot geprüft, jetzt anrufen). Keine Bewerber betroffen (0 in der Phase).
update pipeline_stages set name = 'Qualifiziert', stage_type = 'qualified', color = '#3B82F6'
where agency_id is null and name = 'Kontaktiert';
