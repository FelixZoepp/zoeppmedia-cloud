'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Bot, Check, CheckCircle2, Columns2, Download, Keyboard, Link2, Loader2, PencilLine, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { Avatar, Button, Card, Modal } from '@/components/ui';
import { VIDEO_ARTEN, VIDEO_STATUS, zeitText, type KiVideoErgebnis, type VideoArt, type VideoStatus } from '@/lib/videos/konstanten';
import { ladeVideoHoch } from '@/components/videos/hochladen';
import { standbilderMitZeit } from '@/components/videos/standbilder';
import { STATUS_STIL } from '../videos-client';
import { KUERZEL, useTastenkuerzel } from '@/components/videos/tastenkuerzel';
import { Zeitleiste, zeitLabel } from '@/components/videos/zeitleiste';
import { VersionVergleich } from '@/components/videos/version-vergleich';
import { MarkerExportModal } from '@/components/videos/marker-export-modal';
import { KundenLinkModal } from '@/components/videos/kunden-link-modal';

interface Version {
  id: string;
  version: number;
  url: string | null;
  dateiname: string | null;
  dauer_s: number | null;
  hochgeladen_von: string | null;
  created_at: string;
  ki_status: 'offen' | 'laeuft' | 'fertig' | 'fehler';
  ki_ergebnis: KiVideoErgebnis | null;
}

interface Kommentar {
  id: string;
  version_id: string | null;
  zeit_s: number | null;
  zeit_bis_s: number | null;
  text: string;
  autor_id: string | null;
  extern: boolean;
  kunde_name: string | null;
  ki: boolean;
  erledigt: boolean;
  created_at: string;
}

interface Daten {
  ich: { id: string; role: string; name: string };
  video: {
    id: string;
    titel: string;
    agencies: { name: string } | null;
    art: VideoArt;
    status: VideoStatus;
    bearbeiter_id: string | null;
    pruefer_id: string | null;
    aktuelle_version: number;
    faellig_am: string | null;
    kunden_status: 'offen' | 'freigegeben' | 'aenderungen' | null;
  };
  kundenLink: string | null;
  versionen: Version[];
  kommentare: Kommentar[];
  team: Array<{ id: string; name: string; avatar_url: string | null }>;
}

export function VideoDetail({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = useState<Daten | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [zeit, setZeit] = useState(0);
  const [dauer, setDauer] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [mitZeit, setMitZeit] = useState(true);
  const [kommentarZeit, setKommentarZeit] = useState<number | null>(null);
  const [bereichBis, setBereichBis] = useState<number | null>(null);
  const [vergleich, setVergleich] = useState(false);
  const [modal, setModal] = useState<'export' | 'kunde' | 'kuerzel' | null>(null);
  const textfeld = useRef<HTMLTextAreaElement>(null);
  const [nurOffen, setNurOffen] = useState(false);
  const [arbeit, setArbeit] = useState<string | null>(null);
  const player = useRef<HTMLVideoElement>(null);
  const neuGeladen = useRef(false);
  const autoKi = useRef<string | null>(null);
  const dateiInput = useRef<HTMLInputElement>(null);

  const anwenden = useCallback((j: Daten) => {
    setD(j);
    setVersionId((alt) => (alt && j.versionen.some((v) => v.id === alt) ? alt : j.versionen[0]?.id ?? null));
  }, []);

  const laden = useCallback(async () => {
    const r = await fetch(`/api/videos/${id}`, { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    anwenden(j);
  }, [id, anwenden]);

  useEffect(() => {
    let aktiv = true;
    fetch(`/api/videos/${id}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        if (aktiv) anwenden(j);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      aktiv = false;
    };
  }, [id, anwenden]);

  const version = d?.versionen.find((v) => v.id === versionId) ?? null;
  const kommentare = useMemo(
    () =>
      (d?.kommentare ?? [])
        .filter((k) => k.version_id === versionId || (!k.version_id && version?.version === d?.video.aktuelle_version))
        .filter((k) => !nurOffen || !k.erledigt)
        .sort((a, b) => (a.zeit_s ?? -1) - (b.zeit_s ?? -1)),
    [d, versionId, version, nurOffen],
  );
  const laenge = dauer ?? version?.dauer_s ?? null;
  const person = (pid: string | null) => d?.team.find((t) => t.id === pid) ?? null;

  const springe = (s: number | null) => {
    if (s === null || !player.current) return;
    player.current.currentTime = s;
    player.current.pause();
  };

  const kommentieren = async () => {
    if (!text.trim() || !version) return;
    const zeitS = mitZeit ? (kommentarZeit ?? zeit) : null;
    const r = await fetch(`/api/videos/${id}/kommentare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_id: version.id, zeit_s: zeitS, zeit_bis_s: zeitS !== null && bereichBis !== null && bereichBis > zeitS ? bereichBis : null, text }),
    });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setD((alt) => (alt ? { ...alt, kommentare: [...alt.kommentare, j] } : alt));
    setText('');
    setKommentarZeit(null);
    setBereichBis(null);
  };

  // Tastenkürzel: C = Kommentar, I/O = Bereich (im Vergleich steuert der Vergleich selbst)
  useTastenkuerzel(
    player,
    {
      onKommentar: () => {
        setKommentarZeit(player.current?.currentTime ?? zeit);
        setMitZeit(true);
        textfeld.current?.focus();
      },
      onAnfang: (s) => {
        setMitZeit(true);
        setKommentarZeit(s);
        setBereichBis((b) => (b !== null && b > s ? b : null));
      },
      onEnde: (s) => {
        setMitZeit(true);
        setKommentarZeit((a) => (a !== null && a < s ? a : Math.max(0, s - 2)));
        setBereichBis(s);
      },
    },
    !vergleich,
  );

  const kommentarAendern = async (k: Kommentar, patch: Partial<Kommentar>) => {
    setD((alt) => (alt ? { ...alt, kommentare: alt.kommentare.map((x) => (x.id === k.id ? { ...x, ...patch } : x)) } : alt));
    const r = await fetch(`/api/videos/kommentare/${k.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (!r.ok) {
      toast.error('Nicht gespeichert');
      void laden();
    }
  };

  const kommentarLoeschen = async (k: Kommentar) => {
    const r = await fetch(`/api/videos/kommentare/${k.id}`, { method: 'DELETE' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast.error(j.error ?? 'Löschen fehlgeschlagen');
    setD((alt) => (alt ? { ...alt, kommentare: alt.kommentare.filter((x) => x.id !== k.id) } : alt));
  };

  /** Nächstes Video, das auf meine Freigabe wartet (Prüf-Modus am Abend) */
  const naechstes = async () => {
    const r = await fetch('/api/videos', { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    const liste = ((j?.videos ?? []) as Array<{ id: string; status: string; pruefer_id: string | null; faellig_am: string | null }>)
      // Nur Videos, über die ich entscheiden darf: Admin alle, sonst nur als eingetragener Prüfer
      .filter((x) => x.id !== id && x.status === 'in_pruefung' && (d?.ich.role === 'admin' || x.pruefer_id === d?.ich.id))
      .sort((a, b) => (a.faellig_am ?? '9999').localeCompare(b.faellig_am ?? '9999'));
    if (liste[0]) router.push(`/videos/${liste[0].id}`);
    else {
      toast.success('Alles geprüft 🎉');
      router.push('/videos');
    }
  };

  const status = async (s: VideoStatus) => {
    const offeneZahl = kommentare.filter((k) => !k.erledigt).length;
    if (s === 'aenderungen' && offeneZahl === 0 && !confirm('Es gibt keine offenen Kommentare. Trotzdem Änderungen anfordern?')) return;
    if (s === 'freigegeben' && offeneZahl > 0 && !confirm(`Es sind noch ${offeneZahl} Kommentare offen. Trotzdem freigeben?`)) return;
    const r = await fetch(`/api/videos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }) });
    const j = await r.json();
    if (!r.ok) return toast.error(j.error ?? 'Fehler');
    setD((alt) => (alt ? { ...alt, video: { ...alt.video, ...j } } : alt));
    toast.success(s === 'freigegeben' ? 'Freigegeben – Bearbeiter ist informiert' : 'Änderungen angefordert – Bearbeiter ist informiert');
    await naechstes();
  };

  const kiPruefen = async (src: string, vId: string) => {
    setArbeit('KI liest die Texte im Video …');
    try {
      const frames = await standbilderMitZeit(src, (a) => setArbeit(`KI liest die Texte im Video … ${Math.round(a * 100)} %`));
      if (!frames.length) throw new Error('Das Video konnte im Browser nicht gelesen werden');
      setArbeit('KI prüft Rechtschreibung …');
      const r = await fetch(`/api/videos/${id}/ki`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version_id: vId, frames }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'KI-Prüfung fehlgeschlagen');
      toast.success(j.funde.length ? `${j.funde.length} Hinweise auf der Zeitleiste` : 'Keine Rechtschreibfehler gefunden');
      await laden();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
    } finally {
      setArbeit(null);
    }
  };

  // Noch nicht geprüft (z. B. Upload-Tab früh geschlossen) → beim Öffnen automatisch prüfen
  useEffect(() => {
    if (!d || !version?.url || arbeit) return;
    if (version.version !== d.video.aktuelle_version || version.ki_status !== 'offen' || autoKi.current === version.id) return;
    autoKi.current = version.id;
    const t = setTimeout(() => void kiPruefen(version.url!, version.id), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Versionswechsel
  }, [version?.id, version?.ki_status]);

  const neueVersion = async (datei: File) => {
    setArbeit('Lade neue Version hoch …');
    try {
      const { pfad, dauer: neueDauer, lokaleUrl } = await ladeVideoHoch(datei, (a) => setArbeit(`Lade neue Version hoch … ${Math.round(a * 100)} %`));
      const r = await fetch(`/api/videos/${id}/versionen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pfad, dateiname: datei.name, groesse: datei.size, dauer_s: neueDauer }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      setVersionId(j.version_id);
      await laden();
      await kiPruefen(lokaleUrl, j.version_id);
      URL.revokeObjectURL(lokaleUrl);
      toast.success(`Version ${j.version} hochgeladen – Prüfer ist informiert`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
      setArbeit(null);
    }
  };

  const loeschen = async () => {
    if (!confirm('Video mit allen Versionen und Kommentaren löschen?')) return;
    const r = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
    if (!r.ok) return toast.error('Löschen fehlgeschlagen');
    router.push('/videos');
  };

  if (!d) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const v = d.video;
  const istAktuell = version?.version === v.aktuelle_version;
  const darfEntscheiden = d.ich.role === 'admin' || d.ich.id === v.pruefer_id;
  const offen = kommentare.filter((k) => !k.erledigt).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/videos" className="mb-1 inline-flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Video-Freigabe
          </Link>
          <h1 className="truncate text-[24px] font-medium tracking-[-0.02em]">{v.titel}</h1>
          <p className="text-[13.5px] text-gray-600">
            {v.agencies?.name ?? 'Intern'} · {VIDEO_ARTEN[v.art]} · Bearbeiter: {person(v.bearbeiter_id)?.name ?? '–'} · Freigabe: {person(v.pruefer_id)?.name ?? '–'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${STATUS_STIL[v.status]}`}>{VIDEO_STATUS[v.status]}</span>
          {v.kunden_status && (
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${v.kunden_status === 'freigegeben' ? 'bg-green-50 text-green-800' : v.kunden_status === 'aenderungen' ? 'bg-orange-50 text-orange-800' : 'bg-gray-100 text-gray-700'}`}>
              Kunde: {v.kunden_status === 'freigegeben' ? 'freigegeben' : v.kunden_status === 'aenderungen' ? 'Änderungen' : 'offen'}
            </span>
          )}
          <Button variant="secondary" onClick={() => setModal('kunde')}>
            <Link2 className="h-4 w-4" /> Kunden-Link
          </Button>
          {darfEntscheiden && v.status !== 'freigegeben' && (
            <Button onClick={() => status('freigegeben')} disabled={!!arbeit}>
              <CheckCircle2 className="h-4 w-4" /> Freigeben
            </Button>
          )}
          {darfEntscheiden && v.status !== 'aenderungen' && (
            <Button variant="secondary" onClick={() => status('aenderungen')} disabled={!!arbeit}>
              <PencilLine className="h-4 w-4" /> Änderungen anfordern
            </Button>
          )}
          <Button variant="secondary" onClick={() => dateiInput.current?.click()} disabled={!!arbeit}>
            <Upload className="h-4 w-4" /> Neue Version
          </Button>
          <input
            ref={dateiInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void neueVersion(f);
            }}
          />
        </div>
      </div>

      {arbeit && (
        <Card className="flex items-center gap-2 text-[14px] text-gray-700">
          <Loader2 className="h-4 w-4 animate-spin text-red-700" /> {arbeit}
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <div className="space-y-3">
          <Card padding="sm">
            {vergleich ? (
              <VersionVergleich versionen={d.versionen} />
            ) : version?.url ? (
              <video
                ref={player}
                key={version.id}
                src={version.url}
                controls
                crossOrigin="anonymous"
                playsInline
                className="max-h-[70vh] w-full rounded-xl bg-black"
                onTimeUpdate={(e) => setZeit(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDauer(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
                onError={() => {
                  if (neuGeladen.current) return;
                  neuGeladen.current = true;
                  void laden();
                }}
              />
            ) : (
              <p className="p-6 text-[14px] text-gray-500">Video nicht verfügbar.</p>
            )}
            {/* Zeitleiste mit Kommentar-Markern und Bereichen */}
            {laenge && !vergleich ? (
              <Zeitleiste
                laenge={laenge}
                zeit={zeit}
                marker={kommentare
                  .filter((k) => k.zeit_s !== null)
                  .map((k) => ({
                    id: k.id,
                    zeit_s: k.zeit_s!,
                    zeit_bis_s: k.zeit_bis_s,
                    farbe: k.erledigt ? 'bg-gray-300' : k.ki ? 'bg-violet-500' : k.extern ? 'bg-orange-500' : 'bg-red-600',
                    titel: `${k.extern ? `${k.kunde_name ?? 'Kunde'}: ` : ''}${k.text}`,
                  }))}
                bereich={mitZeit && kommentarZeit !== null && (bereichBis !== null || !!text) ? { von: kommentarZeit, bis: bereichBis } : null}
                onSpringe={springe}
              />
            ) : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-gray-500">
              <span>
                {!vergleich && (
                  <>
                    {zeitText(zeit)} / {zeitText(laenge)} ·{' '}
                  </>
                )}
                <span className="text-red-700">●</span> Team · <span className="text-orange-500">●</span> Kunde · <span className="text-violet-600">●</span> KI
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setModal('kuerzel')} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-100" title="Tastenkürzel">
                  <Keyboard className="h-3.5 w-3.5" /> Kürzel
                </button>
                {d.versionen.filter((x) => x.url).length > 1 && (
                  <button
                    type="button"
                    onClick={() => setVergleich((x) => !x)}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 ${vergleich ? 'bg-red-50 text-red-800' : 'hover:bg-gray-100'}`}
                  >
                    <Columns2 className="h-3.5 w-3.5" /> {vergleich ? 'Vergleich beenden' : 'Versionen vergleichen'}
                  </button>
                )}
                <button type="button" onClick={() => setModal('export')} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-gray-100">
                  <Download className="h-3.5 w-3.5" /> Marker
                </button>
                {!vergleich && <span>Version</span>}
                <select hidden={vergleich} className="h-8 rounded-lg border border-gray-300 bg-white px-2 text-[13px]" value={versionId ?? ''} onChange={(e) => setVersionId(e.target.value)}>
                  {d.versionen.map((x) => (
                    <option key={x.id} value={x.id}>
                      V{x.version} · {new Date(x.created_at).toLocaleDateString('de-DE')}
                      {x.version === v.aktuelle_version ? ' (aktuell)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {/* KI-Ergebnis */}
          {version && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-[15px] font-medium">
                  <Sparkles className="h-4 w-4 text-violet-600" /> KI-Rechtschreibprüfung
                </p>
                <Button variant="secondary" size="sm" disabled={!!arbeit || !version.url} onClick={() => version.url && kiPruefen(version.url, version.id)}>
                  {version.ki_status === 'fertig' ? 'Erneut prüfen' : 'Jetzt prüfen'}
                </Button>
              </div>
              {version.ki_status === 'fertig' && version.ki_ergebnis ? (
                <div className="mt-2 text-[13.5px] text-gray-700">
                  <p>{version.ki_ergebnis.zusammenfassung}</p>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {version.ki_ergebnis.funde.length} Hinweise · {version.ki_ergebnis.bilder} Standbilder geprüft · {new Date(version.ki_ergebnis.am).toLocaleString('de-DE')}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-gray-500">
                  {version.ki_status === 'laeuft' ? 'Läuft gerade …' : version.ki_status === 'fehler' ? 'Letzte Prüfung fehlgeschlagen – bitte erneut starten.' : 'Noch nicht geprüft.'}
                </p>
              )}
            </Card>
          )}
        </div>

        <Card className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-medium">
              Kommentare <span className="text-gray-500">({offen} offen)</span>
            </p>
            <label className="flex items-center gap-1.5 text-[12.5px] text-gray-600">
              <input type="checkbox" checked={nurOffen} onChange={(e) => setNurOffen(e.target.checked)} /> nur offene
            </label>
          </div>

          {istAktuell && (
            <div className="mt-3 rounded-xl border border-gray-200 p-2.5">
              <textarea
                ref={textfeld}
                className="min-h-[70px] w-full resize-none text-[14px] outline-none"
                placeholder={mitZeit ? `Kommentar bei ${zeitLabel(kommentarZeit ?? zeit, bereichBis)} … (Video hält an)` : 'Allgemeiner Kommentar …'}
                value={text}
                onFocus={() => {
                  player.current?.pause();
                  // Gesetzten Bereich (I/O) nicht überschreiben
                  if (bereichBis === null) setKommentarZeit(player.current?.currentTime ?? zeit);
                }}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void kommentieren();
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-gray-600">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={mitZeit} onChange={(e) => setMitZeit(e.target.checked)} /> bei {zeitLabel(kommentarZeit ?? zeit, bereichBis)}
                  </label>
                  {mitZeit &&
                    (bereichBis === null ? (
                      <button
                        type="button"
                        onClick={() => {
                          const jetzt = player.current?.currentTime ?? zeit;
                          const von = kommentarZeit ?? jetzt;
                          if (jetzt > von) setBereichBis(jetzt);
                          else toast.info('Video bis zum Ende des Bereichs abspielen, dann hier klicken (oder Taste O)');
                        }}
                        className="rounded-md px-1.5 py-0.5 text-red-700 hover:bg-red-50"
                        title="Ende des Bereichs = aktuelle Position (Taste O)"
                      >
                        + Bereich bis {zeitText(zeit)}
                      </button>
                    ) : (
                      <button type="button" onClick={() => setBereichBis(null)} className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 hover:bg-gray-100">
                        <X className="h-3 w-3" /> Bereich
                      </button>
                    ))}
                </div>
                <Button size="sm" onClick={kommentieren} disabled={!text.trim()}>
                  Senden
                </Button>
              </div>
            </div>
          )}
          {!istAktuell && <p className="mt-3 rounded-lg bg-gray-50 p-2.5 text-[12.5px] text-gray-600">Ältere Version – Kommentare nur zum Nachlesen.</p>}

          <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
            {kommentare.length === 0 && <li className="text-[13.5px] text-gray-500">Noch keine Kommentare.</li>}
            {kommentare.map((k) => {
              const autor = person(k.autor_id);
              return (
                <li key={k.id} className={`rounded-xl border p-2.5 ${k.erledigt ? 'border-gray-100 opacity-60' : k.ki ? 'border-violet-100 bg-violet-50/40' : k.extern ? 'border-orange-100 bg-orange-50/30' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => springe(k.zeit_s)}
                      className={`mt-0.5 flex-none rounded-md px-1.5 py-0.5 text-[12px] font-semibold ${k.zeit_s === null ? 'bg-gray-100 text-gray-500' : k.extern ? 'bg-orange-50 text-orange-800 hover:bg-orange-100' : 'bg-red-50 text-red-800 hover:bg-red-100'}`}
                    >
                      {zeitLabel(k.zeit_s, k.zeit_bis_s)}
                    </button>
                    <p className={`flex-1 whitespace-pre-wrap text-[13.5px] ${k.erledigt ? 'line-through' : ''}`}>{k.text}</p>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-gray-500">
                    {k.ki ? <Bot className="h-3.5 w-3.5 text-violet-600" /> : autor ? <Avatar name={autor.name} src={autor.avatar_url} size={18} /> : null}
                    {k.extern ? (
                      <span className="rounded bg-orange-50 px-1.5 py-0.5 font-medium text-orange-800">Kunde · {k.kunde_name ?? '–'}</span>
                    ) : (
                      <span>{k.ki ? 'KI' : autor?.name ?? '–'}</span>
                    )}
                    <span>· {new Date(k.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      type="button"
                      onClick={() => kommentarAendern(k, { erledigt: !k.erledigt })}
                      className={`ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${k.erledigt ? 'text-gray-500 hover:bg-gray-100' : 'text-green-700 hover:bg-green-50'}`}
                    >
                      <Check className="h-3.5 w-3.5" /> {k.erledigt ? 'wieder öffnen' : 'erledigt'}
                    </button>
                    {(k.autor_id === d.ich.id || d.ich.role === 'admin') && (
                      <button type="button" onClick={() => kommentarLoeschen(k)} className="rounded-md p-0.5 text-gray-400 hover:text-red-700" aria-label="Kommentar löschen">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {d.ich.role === 'admin' && (
            <button type="button" onClick={loeschen} className="mt-3 self-start text-[12.5px] text-gray-400 hover:text-red-700">
              Video löschen
            </button>
          )}
        </Card>
      </div>

      {modal === 'export' && (
        <MarkerExportModal
          titel={`${v.titel} V${version?.version ?? v.aktuelle_version}`}
          dauerS={laenge ?? 0}
          kommentare={kommentare.map((k) => ({ zeit_s: k.zeit_s, zeit_bis_s: k.zeit_bis_s, text: k.text, erledigt: k.erledigt, autor: k.ki ? 'KI' : k.extern ? `Kunde ${k.kunde_name ?? ''}`.trim() : person(k.autor_id)?.name ?? 'Team' }))}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'kunde' && (
        <KundenLinkModal
          videoId={v.id}
          link={d.kundenLink}
          kundenStatus={v.kunden_status}
          onClose={() => setModal(null)}
          onAenderung={(link) => setD((alt) => (alt ? { ...alt, kundenLink: link, video: { ...alt.video, kunden_status: link ? alt.video.kunden_status ?? 'offen' : alt.video.kunden_status } } : alt))}
        />
      )}
      {modal === 'kuerzel' && (
        <Modal open onClose={() => setModal(null)} title="Tastenkürzel im Player" width="max-w-sm">
          <ul className="space-y-1.5 text-[14px]">
            {KUERZEL.map(([t, b]) => (
              <li key={t} className="flex justify-between gap-3">
                <kbd className="rounded border border-gray-300 bg-gray-50 px-1.5 text-[12.5px]">{t}</kbd>
                <span className="text-right text-gray-600">{b}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
