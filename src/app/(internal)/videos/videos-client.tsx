'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Clapperboard, Loader2, MessageSquare, Upload } from 'lucide-react';
import { Button, Card, Modal, PageHeader, SegmentedControl } from '@/components/ui';
import { MAX_VIDEO_MB, VIDEO_ARTEN, VIDEO_STATUS, type VideoArt, type VideoStatus } from '@/lib/videos/konstanten';
import { ladeVideoHoch } from '@/components/videos/hochladen';
import { standbilderMitZeit } from '@/components/videos/standbilder';

interface VideoZeile {
  id: string;
  titel: string;
  agency_id: string | null;
  agencies: { name: string } | null;
  art: VideoArt;
  status: VideoStatus;
  bearbeiter_id: string | null;
  pruefer_id: string | null;
  aktuelle_version: number;
  faellig_am: string | null;
  updated_at: string;
  offene_kommentare: number;
}

interface Daten {
  ich: { id: string; role: string };
  standardPruefer: string | null;
  videos: VideoZeile[];
  agencies: Array<{ id: string; name: string }>;
  team: Array<{ id: string; name: string; avatar_url: string | null }>;
}

export const STATUS_STIL: Record<VideoStatus, string> = {
  in_pruefung: 'bg-amber-50 text-amber-800',
  aenderungen: 'bg-red-50 text-red-800',
  freigegeben: 'bg-green-50 text-green-800',
};
const inputCls = 'w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm';

function UploadModal({ d, onClose }: { d: Daten; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ titel: '', agency_id: '', art: 'ad' as VideoArt, pruefer_id: d.standardPruefer ?? '', faellig_am: '' });
  const [datei, setDatei] = useState<File | null>(null);
  const [schritt, setSchritt] = useState<string | null>(null);

  const los = async () => {
    if (!datei || !f.titel.trim()) return;
    try {
      setSchritt('Lade hoch …');
      const { pfad, dauer, lokaleUrl } = await ladeVideoHoch(datei);
      setSchritt('Lege Video an …');
      const r = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, pfad, dateiname: datei.name, groesse: datei.size, dauer_s: dauer }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Fehler');
      // KI-Rechtschreibprüfung direkt mit der lokalen Datei (schnell, ohne CORS)
      setSchritt('KI liest die Texte im Video …');
      const frames = await standbilderMitZeit(lokaleUrl, (a) => setSchritt(`KI liest die Texte im Video … ${Math.round(a * 100)} %`));
      if (frames.length) {
        setSchritt('KI prüft Rechtschreibung …');
        const k = await fetch(`/api/videos/${j.id}/ki`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version_id: j.version_id, frames }) });
        if (!k.ok) toast.error('KI-Prüfung fehlgeschlagen – im Video nochmal starten');
      }
      URL.revokeObjectURL(lokaleUrl);
      toast.success('Video hochgeladen');
      router.push(`/videos/${j.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler');
      setSchritt(null);
    }
  };

  const label = 'mb-1 block text-[12.5px] font-medium text-gray-600';
  return (
    <Modal open onClose={() => !schritt && onClose()} title="Video hochladen" width="max-w-xl">
      {schritt ? (
        <div className="flex flex-col items-center gap-3 py-10 text-[14px] text-gray-600">
          <Loader2 className="h-7 w-7 animate-spin text-red-700" />
          {schritt}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className={label}>Titel</label>
            <input className={inputCls} placeholder="z. B. Turhan – Ad Vertriebler Hamburg V1" value={f.titel} onChange={(e) => setF({ ...f, titel: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Kunde</label>
              <select className={inputCls} value={f.agency_id} onChange={(e) => setF({ ...f, agency_id: e.target.value })}>
                <option value="">– intern / ohne –</option>
                {d.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Art</label>
              <select className={inputCls} value={f.art} onChange={(e) => setF({ ...f, art: e.target.value as VideoArt })}>
                {Object.entries(VIDEO_ARTEN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Freigabe durch</label>
              <select className={inputCls} value={f.pruefer_id} onChange={(e) => setF({ ...f, pruefer_id: e.target.value })}>
                {d.team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Fällig am</label>
              <input type="date" className={inputCls} value={f.faellig_am} onChange={(e) => setF({ ...f, faellig_am: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Videodatei (max. {MAX_VIDEO_MB} MB)</label>
            <input type="file" accept="video/*" onChange={(e) => setDatei(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            {datei && <p className="mt-1 text-[12px] text-gray-500">{(datei.size / 1024 / 1024).toFixed(1)} MB</p>}
          </div>
          <p className="text-[12px] text-gray-500">Nach dem Hochladen prüft die KI automatisch alle Texte im Video auf Rechtschreibung und markiert Fehler auf der Zeitleiste.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button onClick={los} disabled={!datei || !f.titel.trim()}>
              <Upload className="h-4 w-4" /> Hochladen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function VideosClient() {
  const [d, setD] = useState<Daten | null>(null);
  const [tab, setTab] = useState<string>('in_pruefung');
  const [kunde, setKunde] = useState('');
  const [upload, setUpload] = useState(false);

  useEffect(() => {
    let aktiv = true;
    fetch('/api/videos', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Fehler');
        if (aktiv) setD(j);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      aktiv = false;
    };
  }, []);

  const liste = useMemo(() => (d?.videos ?? []).filter((v) => (tab === 'alle' || v.status === tab) && (!kunde || v.agency_id === kunde)), [d, tab, kunde]);
  const anzahl = (s: VideoStatus) => d?.videos.filter((v) => v.status === s).length ?? 0;
  const name = (id: string | null) => d?.team.find((t) => t.id === id)?.name ?? '–';

  return (
    <div>
      <PageHeader
        title="Video-Freigabe"
        description="Ads, Website-Videos und Reels hochladen, von der KI auf Rechtschreibung prüfen lassen, zeitgenau kommentieren und freigeben."
        action={
          <Button onClick={() => setUpload(true)} disabled={!d}>
            <Upload className="h-4 w-4" /> Video hochladen
          </Button>
        }
      />
      {!d ? (
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              items={[
                { value: 'in_pruefung', label: `Zu prüfen (${anzahl('in_pruefung')})` },
                { value: 'aenderungen', label: `Änderungen nötig (${anzahl('aenderungen')})` },
                { value: 'freigegeben', label: 'Freigegeben' },
                { value: 'alle', label: 'Alle' },
              ]}
              value={tab}
              onChange={setTab}
            />
            <select className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm" value={kunde} onChange={(e) => setKunde(e.target.value)}>
              <option value="">Alle Kunden</option>
              {d.agencies
                .filter((a) => d.videos.some((v) => v.agency_id === a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>

          {liste.length === 0 ? (
            <Card className="text-[14px] text-gray-500">Keine Videos in dieser Ansicht.</Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {liste.map((v) => (
                <Link key={v.id} href={`/videos/${v.id}`} className="block">
                  <Card className="h-full transition hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                        <Clapperboard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium">{v.titel}</p>
                        <p className="truncate text-[12.5px] text-gray-500">
                          {v.agencies?.name ?? 'Intern'} · {VIDEO_ARTEN[v.art]} · V{v.aktuelle_version}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                      <span className={`rounded-full px-2.5 py-0.5 font-semibold ${STATUS_STIL[v.status]}`}>{VIDEO_STATUS[v.status]}</span>
                      {v.offene_kommentare > 0 && (
                        <span className="inline-flex items-center gap-1 text-gray-600">
                          <MessageSquare className="h-3.5 w-3.5" /> {v.offene_kommentare} offen
                        </span>
                      )}
                      <span className="ml-auto text-gray-500">{v.status === 'aenderungen' ? `bei ${name(v.bearbeiter_id)}` : v.status === 'in_pruefung' ? `bei ${name(v.pruefer_id)}` : ''}</span>
                    </div>
                    {v.faellig_am && v.status !== 'freigegeben' && (
                      <p className="mt-1 text-[12px] text-gray-500">fällig {new Date(`${v.faellig_am}T12:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' })}</p>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
      {upload && d && <UploadModal d={d} onClose={() => setUpload(false)} />}
    </div>
  );
}
