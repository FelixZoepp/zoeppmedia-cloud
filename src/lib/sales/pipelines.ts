/**
 * Close-Pipelines: „D2D Sales“ (Neukunden: Setting → Closing) und „Upsell (Bestandskunden)“
 * (Verlängerung, Upgrade, Großdeals – ohne Setting). Status-IDs gehören immer zu genau einer Pipeline:
 * Wer einen Status aus der anderen Pipeline setzt, verschiebt den Deal dorthin.
 */

export const D2D_PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
export const UPSELL_PIPELINE_ID = 'pipe_5OH4GlgrDzXupG8IFA9JMF';

export const UPSELL_STATUS = {
  potenzial: 'stat_OBAEVAwpq09YR0N7GeuFF8Zt4QlAycUNRmf88JTZ3AN',
  strategietermin: 'stat_WEKJijRPsQybJcoGhit9rkhqImph7jHgS1tB1sP7iiy',
  konzept: 'stat_RrSDOCdFILg6qphuwTwkxbYWEtIYpGb9CcjeDuce6OT',
  entscheidung: 'stat_7kEUHW4wykcSy6Yg1bR9jdbcn6RzWO6hbPGOjIHHT6N',
  gewonnen: 'stat_7NL2g8Yj20LVCQZtfAtLD3oe5DDZkMNHSJmsK9XEcAX',
  verloren: 'stat_gkZ8TgDDZPJOzHkRNL9Pjxt6XbDu6O34uA4KLCnpTOf',
} as const;

/** Lead-Status „Kunde“ / „Ex-Kunde“ → neue Deals gehören in die Upsell-Pipeline */
export function istBestandskunde(statusLabel: string | null | undefined): boolean {
  return ['kunde', 'ex-kunde'].includes((statusLabel ?? '').trim().toLowerCase());
}
