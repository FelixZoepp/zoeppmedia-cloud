import { z } from 'zod';

/** Eingabe eines Cash-Plan-Vertrags (Admin-API) */
/** Ohne Standardwerte, damit ein PATCH (partial) nichts ungewollt überschreibt */
export const vertragFelder = z.object({
  kunde: z.string().trim().min(1).max(120),
  monatlich: z.coerce.number().min(0).max(1_000_000),
  setup: z.coerce.number().min(0).max(1_000_000),
  setup_monat: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
  start: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/),
  laufzeit_monate: z.coerce.number().int().min(1).max(120).nullable().optional(),
  verlaengerung_monatlich: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  ust_satz: z.coerce.number().min(0).max(30),
  rechnungstag: z.coerce.number().int().min(1).max(31).nullable().optional(),
  status: z.enum(['aktiv', 'startet', 'beendet', 'streitfall']),
  abschluss_am: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  offen_betrag: z.coerce.number().min(0).max(10_000_000).nullable().optional(),
  angebot: z.string().trim().max(40).nullable().optional(),
  notiz: z.string().trim().max(500).nullable().optional(),
  lex_contact_id: z.string().trim().max(400).nullable().optional(),
});

/** Neuer Vertrag: fehlende Felder mit Standardwerten */
export const vertragSchema = vertragFelder.extend({
  setup: vertragFelder.shape.setup.default(0),
  ust_satz: vertragFelder.shape.ust_satz.default(19),
  status: vertragFelder.shape.status.default('aktiv'),
});

/** YYYY-MM → YYYY-MM-01 */
export const ersterTag = (s: string | null | undefined) => (s ? `${s.slice(0, 7)}-01` : null);
