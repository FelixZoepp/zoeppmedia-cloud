export async function verifyTurnstile(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // env-gated: ohne Key kein Zwang (Ruling P7-R4). In Produktion laut melden, damit es nicht unbemerkt offen bleibt.
    if (process.env.NODE_ENV === 'production') console.warn('[turnstile] TURNSTILE_SECRET_KEY fehlt – Bot-Schutz für /api/apply ist aus');
    return true;
  }
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
