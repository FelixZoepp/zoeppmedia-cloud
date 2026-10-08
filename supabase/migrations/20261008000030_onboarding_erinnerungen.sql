-- Onboarding-Erinnerungen: höchstens drei (Tag 2/5/10) statt täglich ohne Ende.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_erinnerungen integer NOT NULL DEFAULT 0;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS onboarding_erinnert_am timestamptz;

-- Bestandskunden wurden bisher täglich erinnert: als "alle Stufen erledigt" markieren,
-- damit nach dem Deploy keine Mail nachgeholt wird.
UPDATE agencies SET onboarding_erinnerungen = 3, onboarding_erinnert_am = now()
WHERE onboarding_completed = false;
