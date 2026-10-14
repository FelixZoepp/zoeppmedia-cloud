/** Werbekonto aus META_AD_ACCOUNT_ID – mit oder ohne „act_“ eingetragen, die Graph-API braucht act_<id> */
export function normalisiereAdAccount(wert: string | undefined | null): string | undefined {
  const v = (wert ?? '').trim();
  if (!v) return undefined;
  return v.startsWith('act_') ? v : `act_${v.replace(/\D/g, '')}`;
}

export function metaAdAccountId(): string | undefined {
  return normalisiereAdAccount(process.env.META_AD_ACCOUNT_ID);
}
