/**
 * WhatsApp Cloud API Provider — Spec Abschn. 7, Integration-Design Annahme.
 * Alle Meta-Aufrufe gehen über dieses Interface, damit Direktanbindung und
 * BSP austauschbar bleiben.
 */

export interface SendMessagePayload {
  to: string; // E.164
  type: 'text' | 'template' | 'image' | 'document' | 'audio' | 'interactive';
  text?: { body: string };
  template?: {
    name: string;
    language: { code: string };
    components?: Array<Record<string, unknown>>;
  };
  image?: { id?: string; link?: string; caption?: string };
  document?: { id?: string; link?: string; filename?: string; caption?: string };
  audio?: { id?: string; link?: string };
  interactive?: Record<string, unknown>;
}

export interface SendMessageResult {
  messageId: string;
}

export interface TemplateDefinition {
  name: string;
  language: string;
  category: string;
  components: Array<Record<string, unknown>>;
}

export interface TemplateStatus {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
}

export interface WhatsAppProvider {
  sendMessage(phoneNumberId: string, token: string, payload: SendMessagePayload): Promise<SendMessageResult>;
  uploadMedia(phoneNumberId: string, token: string, file: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }>;
  getMediaUrl(mediaId: string, token: string): Promise<string>;
  createTemplate(wabaId: string, token: string, template: TemplateDefinition): Promise<{ id: string }>;
  listTemplates(wabaId: string, token: string): Promise<TemplateStatus[]>;
  registerPhone(phoneNumberId: string, token: string): Promise<void>;
  subscribeWebhook(wabaId: string, token: string): Promise<void>;
  exchangeCode(code: string, appId: string, appSecret: string): Promise<{ accessToken: string; wabaId: string; phoneNumberId: string }>;
}

const BASE_URL = process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v23.0';

async function metaFetch(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => 'Keine Details');
    throw new Error(`WhatsApp API Fehler ${res.status}: ${body}`);
  }
  return res;
}

export class CloudApiProvider implements WhatsAppProvider {
  async sendMessage(phoneNumberId: string, token: string, payload: SendMessagePayload): Promise<SendMessageResult> {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      ...payload,
    };
    const res = await metaFetch(`/${phoneNumberId}/messages`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const messageId = data.messages?.[0]?.id;
    if (!messageId) {
      throw new Error('WhatsApp API: Antwort ohne Message-ID: ' + JSON.stringify(data).slice(0, 300));
    }
    return { messageId };
  }

  async uploadMedia(phoneNumberId: string, token: string, file: Buffer, mimeType: string, filename: string): Promise<{ mediaId: string }> {
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);
    formData.append('file', new Blob([new Uint8Array(file.buffer as ArrayBuffer, file.byteOffset, file.byteLength)], { type: mimeType }), filename);
    const res = await metaFetch(`/${phoneNumberId}/media`, token, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return { mediaId: data.id };
  }

  async getMediaUrl(mediaId: string, token: string): Promise<string> {
    const res = await metaFetch(`/${mediaId}`, token);
    const data = await res.json();
    return data.url;
  }

  async createTemplate(wabaId: string, token: string, template: TemplateDefinition): Promise<{ id: string }> {
    const res = await metaFetch(`/${wabaId}/message_templates`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(template),
    });
    const data = await res.json();
    return { id: data.id };
  }

  async listTemplates(wabaId: string, token: string): Promise<TemplateStatus[]> {
    const res = await metaFetch(`/${wabaId}/message_templates?limit=100`, token);
    const data = await res.json();
    return (data.data || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: t.name as string,
      status: t.status as string,
      category: t.category as string,
      language: t.language as string,
    }));
  }

  async registerPhone(phoneNumberId: string, token: string): Promise<void> {
    // PIN wird über die Umgebungsvariable WHATSAPP_REGISTER_PIN gesetzt/geprüft
    const pin = process.env.WHATSAPP_REGISTER_PIN || '000000';
    await metaFetch(`/${phoneNumberId}/register`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
    });
  }

  async subscribeWebhook(wabaId: string, token: string): Promise<void> {
    await metaFetch(`/${wabaId}/subscribed_apps`, token, { method: 'POST' });
  }

  async exchangeCode(code: string, appId: string, appSecret: string): Promise<{ accessToken: string; wabaId: string; phoneNumberId: string }> {
    // Step 1: Exchange code for short-lived token
    const tokenRes = await fetch(
      `${BASE_URL}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`
    );
    if (!tokenRes.ok) {
      throw new Error(`Token-Austausch fehlgeschlagen (HTTP ${tokenRes.status})`);
    }
    const tokenData = await tokenRes.json();
    const shortToken = tokenData.access_token;

    // Step 2: Exchange for long-lived token
    const longRes = await fetch(
      `${BASE_URL}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortToken}`
    );
    if (!longRes.ok) {
      throw new Error(`Long-lived Token fehlgeschlagen (HTTP ${longRes.status})`);
    }
    const longData = await longRes.json();
    const accessToken = longData.access_token;

    // Step 3: Get debug token info to extract WABA and phone number
    // App-Access-Token (appId|appSecret) für /debug_token-Authentifizierung verwenden
    const appAccessToken = encodeURIComponent(`${appId}|${appSecret}`);
    const debugRes = await fetch(`${BASE_URL}/debug_token?input_token=${accessToken}&access_token=${appAccessToken}`);
    if (!debugRes.ok) {
      throw new Error(`Debug-Token fehlgeschlagen (HTTP ${debugRes.status})`);
    }
    const debugData = await debugRes.json();
    const granularScopes = debugData.data?.granular_scopes || [];
    const whatsappScope = granularScopes.find((s: Record<string, unknown>) => s.scope === 'whatsapp_business_management');
    const wabaId = whatsappScope?.target_ids?.[0] || '';

    // Step 4: Get phone numbers for this WABA
    const phonesRes = await metaFetch(`/${wabaId}/phone_numbers`, accessToken);
    const phonesData = await phonesRes.json();
    const phoneNumberId = phonesData.data?.[0]?.id || '';

    return { accessToken, wabaId, phoneNumberId };
  }
}

let providerInstance: WhatsAppProvider | null = null;

export function getProvider(): WhatsAppProvider {
  if (!providerInstance) {
    providerInstance = new CloudApiProvider();
  }
  return providerInstance;
}
