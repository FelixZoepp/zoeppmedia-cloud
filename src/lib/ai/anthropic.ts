import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic-Client für alle KI-Funktionen der Cloud.
 * Ist der Schlüssel keinem Workspace zugeordnet, muss jede Anfrage die Workspace-ID mitschicken –
 * dafür ANTHROPIC_WORKSPACE_ID in Vercel setzen (sonst wird der Header weggelassen).
 */
export function anthropicClient(): Anthropic {
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(workspace ? { defaultHeaders: { 'anthropic-workspace-id': workspace } } : {}),
  });
}
