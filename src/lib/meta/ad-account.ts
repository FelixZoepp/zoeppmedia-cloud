/** Werbekonto aus META_AD_ACCOUNT_ID – mit oder ohne „act_“ eingetragen, die Graph-API braucht act_<id> */
export function normalisiereAdAccount(wert: string | undefined | null): string | undefined {
  const v = (wert ?? '').trim();
  if (!v) return undefined;
  return v.startsWith('act_') ? v : `act_${v.replace(/\D/g, '')}`;
}

/** Werbekonto von Zoepp Media – kein Geheimnis, gilt, solange META_AD_ACCOUNT_ID in Vercel fehlt */
const ZOEPP_AD_ACCOUNT = 'act_773153438539782';

export function metaAdAccountId(): string | undefined {
  return normalisiereAdAccount(process.env.META_AD_ACCOUNT_ID) ?? ZOEPP_AD_ACCOUNT;
}

/** Schlüssel für die Werbezahlen: Systembenutzer-Token (läuft nicht ab, braucht ads_read), sonst der alte Ads-Token */
export function metaAdsToken(): string | undefined {
  return process.env.META_SYSTEM_USER_TOKEN || process.env.META_ACCESS_TOKEN || undefined;
}

/** Schlüssel für die Werbekonten der Kunden: Systembenutzer-Token (Partnerzugriff), sonst der Ads-Token */
export function metaKundenToken(): string | undefined {
  return process.env.META_SYSTEM_USER_TOKEN || process.env.META_ACCESS_TOKEN || undefined;
}
