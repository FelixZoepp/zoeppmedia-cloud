import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/slack/kanaele', () => ({ slackKanal: vi.fn(async () => 'C-SYSTEM') }));

import { baueAlarmNachricht, meldeAlarm } from '../slack-alarm';

function svcMit(alt: Record<string, unknown> | null) {
  const upsert = vi.fn(async () => ({ error: null }));
  const svc = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: alt }) }) }),
      upsert,
    }),
  };
  return { svc: svc as never, upsert };
}

describe('slack-alarm', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ ok: true }) })));
  });

  it('kritisch erwähnt Felix, behoben nicht', () => {
    expect(baueAlarmNachricht({ schluessel: 'x', titel: 'Inbox kaputt', text: 't', schwere: 'kritisch' }).text).toContain('🚨');
    expect(JSON.stringify(baueAlarmNachricht({ schluessel: 'x', titel: 'Inbox kaputt', text: 't', schwere: 'kritisch' }).blocks)).toContain('<@U09EK5NAR4P>');
    expect(JSON.stringify(baueAlarmNachricht({ schluessel: 'x', titel: 'Inbox kaputt', text: 't', schwere: 'kritisch' }, true).blocks)).not.toContain('<@');
  });

  it('neuer Alarm geht sofort nach Slack', async () => {
    const { svc } = svcMit(null);
    expect(await meldeAlarm(svc, { schluessel: 'sonde:inbox', titel: 'T', text: 't', schwere: 'kritisch' })).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('offener Alarm wird innerhalb der Drosselung nicht erneut gesendet', async () => {
    const jetzt = new Date('2026-10-28T12:00:00Z');
    const { svc, upsert } = svcMit({ offen: true, anzahl: 3, zuletzt_gemeldet_am: '2026-10-28T11:30:00Z' });
    expect(await meldeAlarm(svc, { schluessel: 'sonde:inbox', titel: 'T', text: 't', schwere: 'kritisch' }, jetzt)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ anzahl: 4 }), expect.anything());
  });

  it('nach Ablauf der Drosselung wird erneut gemeldet', async () => {
    const jetzt = new Date('2026-10-28T12:00:00Z');
    const { svc } = svcMit({ offen: true, anzahl: 3, zuletzt_gemeldet_am: '2026-10-28T10:30:00Z' });
    expect(await meldeAlarm(svc, { schluessel: 'sonde:inbox', titel: 'T', text: 't', schwere: 'kritisch' }, jetzt)).toBe(true);
  });
});
