'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Upload, Link2, MessageSquare, Clock, Image as ImageIcon, Film, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';
import { AssetPreview, isLinkErlaubt } from '@/components/ads/asset-preview';
import { AD_STAGES, AD_TYPEN, AD_ASSET_BUCKET, type AdItem, type AdStage } from '@/lib/ads/constants';
import { KiPruefungAnzeige, videoStandbilder } from '@/components/ads/ki-pruefung-anzeige';
import type { FreigabeStatus, KiPruefung } from '@/lib/ads/ki-pruefung';

type AdRow = AdItem & {
  agency_name: string;
  assignee_name: string | null;
  vorschau_url: string | null;
  ki_pruefung: KiPruefung | null;
  ki_status: FreigabeStatus;
};

const KI_PUNKT: Record<FreigabeStatus, { cls: string; titel: string }> = {
  ok: { cls: 'bg-green-500', titel: 'KI-Prüfung grün' },
  warnung: { cls: 'bg-amber-500', titel: 'KI-Prüfung gelb' },
  rot: { cls: 'bg-red-600', titel: 'KI-Prüfung rot' },
  uebersteuert: { cls: 'bg-gray-500', titel: 'Ohne grüne KI-Prüfung freigegeben (begründet)' },
  fehlt: { cls: 'bg-gray-200', titel: 'Noch nicht KI-geprüft' },
};
interface BoardData {
  ads: AdRow[];
  agencies: Array<{ id: string; name: string }>;
  team: Array<{ id: string; name: string }>;
}

const inputCls = 'w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm';
/** Supabase-Free-Plan: max. 50 MB pro Datei. Größere Rohvideos als Link. */
const MAX_UPLOAD_MB = 50;

function AdDetail({
  ad,
  data,
  onSave,
  onClose,
}: {
  ad: AdRow;
  data: BoardData;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ titel: ad.titel, idee: ad.idee ?? '', typ: ad.typ, assignee_id: ad.assignee_id ?? '', faellig_am: ad.faellig_am ?? '' });
  const [link, setLink] = useState('');
  const [assetLink, setAssetLink] = useState(ad.asset_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [prueft, setPrueft] = useState(false);

  const kiPruefen = async () => {
    setPrueft(true);
    try {
      // Video aus dem eigenen Speicher: Standbilder im Browser ziehen (Drive-Videos: Vorschaubild serverseitig)
      const frames =
        ad.typ !== 'grafik' && ad.typ !== 'karussell' && ad.typ !== 'indeed' && ad.asset_path && ad.vorschau_url
          ? await videoStandbilder(ad.vorschau_url)
          : [];
      const res = await fetch(`/api/ads/${ad.id}/ki-pruefung`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frames }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? 'KI-Prüfung fehlgeschlagen');
      toast.success(d.pruefung.ampel === 'gruen' ? 'KI-Prüfung grün' : d.pruefung.ampel === 'gelb' ? 'KI-Prüfung gelb – Verbesserungen ansehen' : 'KI-Prüfung rot – bitte verbessern');
      await onSave({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'KI-Prüfung fehlgeschlagen');
    } finally {
      setPrueft(false);
    }
  };

  const upload = async (file: File) => {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`Datei ist größer als ${MAX_UPLOAD_MB} MB – bitte als Link (Drive/Dropbox) unter "Material" einfügen.`);
      return;
    }
    setUploading(true);
    try {
      const res = await fetch(`/api/ads/${ad.id}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Upload nicht möglich');
      const { path, token } = (await res.json()) as { path: string; token: string };
      const { error } = await createClient().storage.from(AD_ASSET_BUCKET).uploadToSignedUrl(path, token, file);
      if (error) throw new Error(error.message);
      await onSave({ asset_path: path });
      toast.success('Hochgeladen');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const stageIdx = AD_STAGES.findIndex((s) => s.key === ad.stage);
  const next = AD_STAGES[stageIdx + 1];

  return (
    <Modal open onClose={onClose} title={ad.agency_name} width="max-w-2xl">
      <div className="space-y-4">
        {ad.kunden_kommentar && ad.stage === 'bearbeitung' && (
          <div className="rounded-lg bg-amber-50 text-amber-900 text-sm px-3 py-2 flex gap-2">
            <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span><strong>Änderungswunsch vom Kunden:</strong> {ad.kunden_kommentar}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <input className={`${inputCls} col-span-2 font-semibold`} value={form.titel} onChange={(e) => setForm({ ...form, titel: e.target.value })} />
          <textarea
            className="col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]"
            placeholder="Idee / Hook / Text"
            value={form.idee}
            onChange={(e) => setForm({ ...form, idee: e.target.value })}
          />
          <select className={inputCls} value={form.typ} onChange={(e) => setForm({ ...form, typ: e.target.value as AdItem['typ'] })}>
            {AD_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select className={inputCls} value={form.assignee_id} onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}>
            <option value="">– niemand –</option>
            {data.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" className={inputCls} value={form.faellig_am} onChange={(e) => setForm({ ...form, faellig_am: e.target.value })} />
          <button onClick={() => onSave(form)} className="h-10 rounded-lg border border-gray-300 bg-white text-sm font-semibold hover:bg-gray-50">
            Speichern
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Fertige Ad (Google Drive / Dropbox)</p>
          <AssetPreview url={ad.vorschau_url} titel={ad.titel} />
          <div className="flex gap-2 mt-2">
            <input
              className={inputCls}
              placeholder="https://drive.google.com/… oder https://www.dropbox.com/…"
              value={assetLink}
              onChange={(e) => setAssetLink(e.target.value)}
            />
            <button
              disabled={!assetLink || assetLink === (ad.asset_url ?? '')}
              onClick={async () => {
                if (!isLinkErlaubt(assetLink) && !window.confirm('Das ist kein Drive- oder Dropbox-Link. Trotzdem speichern?')) return;
                await onSave({ asset_url: assetLink, asset_path: null });
              }}
              className="h-10 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              Link speichern
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Freigabe in Drive/Dropbox auf „Jeder mit dem Link“ stellen, sonst sieht der Kunde keine Vorschau.
          </p>
          <label className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500 cursor-pointer hover:text-red-600">
            <Upload className="w-3 h-3" /> {uploading ? 'Lädt hoch …' : `oder Datei hochladen (max. ${MAX_UPLOAD_MB} MB)`}
            <input type="file" className="hidden" accept="image/*,video/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          </label>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">KI-Prüfung (doppelter Boden vor dem Kunden)</p>
            <button
              onClick={kiPruefen}
              disabled={prueft}
              className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-[13px] font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              {prueft ? 'Prüft … (bis zu 1 Min.)' : ad.ki_pruefung ? 'Erneut prüfen' : 'Mit KI prüfen'}
            </button>
          </div>
          {ad.ki_pruefung ? (
            <KiPruefungAnzeige p={ad.ki_pruefung} veraltet={ad.ki_status === 'fehlt'} />
          ) : (
            <p className="text-[13px] text-gray-500">Noch nicht geprüft. Vor „An Kunden zur Freigabe“ einmal prüfen lassen.</p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Material (Rohvideos, Fotos – Drive/Dropbox-Links)</p>
          <div className="space-y-1">
            {ad.material_urls.map((u, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <a href={u} target="_blank" rel="noreferrer" className="text-red-600 truncate flex-1 inline-flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5 flex-shrink-0" /> {u}
                </a>
                <button onClick={() => onSave({ material_urls: ad.material_urls.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input className={inputCls} placeholder="https://…" value={link} onChange={(e) => setLink(e.target.value)} />
            <button
              disabled={!/^https?:\/\//.test(link)}
              onClick={async () => {
                await onSave({ material_urls: [...ad.material_urls, link] });
                setLink('');
              }}
              className="h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-50"
            >
              Hinzufügen
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
          {next && next.key !== 'freigabe_kunde' && (
            <button onClick={() => onSave({ stage: next.key })} className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
              Weiter: {next.label}
            </button>
          )}
          {ad.stage === 'bearbeitung' && (
            <button
              onClick={() => {
                if (!ad.vorschau_url && !window.confirm('Noch keine Datei hochgeladen. Trotzdem zur Freigabe schicken?')) return;
                void onSave({ stage: 'freigabe_kunde' });
              }}
              className="h-10 px-4 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
            >
              An Kunden zur Freigabe schicken
            </button>
          )}
          {ad.stage === 'freigabe_kunde' && (
            <button onClick={() => onSave({ stage: 'bereit', kommentar: 'intern freigegeben' })} className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm">
              Kunde hat anders freigegeben → Bereit
            </button>
          )}
          {stageIdx > 0 && (
            <button onClick={() => onSave({ stage: AD_STAGES[stageIdx - 1].key })} className="h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm">
              Zurück: {AD_STAGES[stageIdx - 1].label}
            </button>
          )}
          <button
            onClick={() => window.confirm('Diese Ad verwerfen?') && onSave({ stage: 'verworfen' })}
            className="h-10 px-4 rounded-lg text-sm text-gray-500 hover:text-red-600 ml-auto"
          >
            Verwerfen
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function AdsPage() {
  const [data, setData] = useState<BoardData | null>(null);
  const [agencyFilter, setAgencyFilter] = useState('');
  const [nurMeine, setNurMeine] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [neu, setNeu] = useState(false);
  const [neuForm, setNeuForm] = useState({ agency_id: '', titel: '', idee: '', typ: 'grafik', assignee_id: '', faellig_am: '' });
  const [dragging, setDragging] = useState<string | null>(null);

  const load = () => fetch('/api/ads').then((r) => (r.ok ? r.json() : null)).then((d) => d && setData(d));

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ads')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setData(d);
      });
    createClient().auth.getUser().then(({ data: u }) => {
      if (!cancelled) setMe(u.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ads = useMemo(
    () => (data?.ads ?? []).filter((a) => (!agencyFilter || a.agency_id === agencyFilter) && (!nurMeine || a.assignee_id === me)),
    [data, agencyFilter, nurMeine, me],
  );

  const save = async (id: string, patch: Record<string, unknown>) => {
    if (!Object.keys(patch).length) return void (await load());
    let res = await fetch(`/api/ads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (res.status === 409) {
      const info = (await res.clone().json().catch(() => ({}))) as { code?: string; error?: string };
      if (info.code === 'ki_pruefung') {
        const grund = window.prompt(`${info.error ?? 'KI-Prüfung fehlt.'}\n\nTrotzdem zum Kunden? Dann kurz begründen (wird gespeichert):`);
        if (!grund) return void (await load());
        res = await fetch(`/api/ads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, ki_override_grund: grund }) });
        if (!res.ok) toast.error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'Konnte nicht gespeichert werden');
        return void (await load());
      }
      // Live ohne Kundenfreigabe nur nach ausdrücklicher Bestätigung
      if (confirm('Der Kunde hat diese Ad noch nicht freigegeben. Trotzdem live schalten?')) {
        res = await fetch(`/api/ads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, ohne_freigabe: true }) });
      } else {
        await load();
        return;
      }
    }
    if (!res.ok) toast.error('Konnte nicht gespeichert werden');
    await load();
  };

  const open = data?.ads.find((a) => a.id === openId) ?? null;

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        label="FULFILLMENT"
        title="Ads"
        counter={`${ads.length} Ads`}
        action={
          <button onClick={() => setNeu(true)} className="h-10 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-red-700">
            <Plus className="w-4 h-4" /> Neue Ad
          </button>
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <select className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm" value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
          <option value="">Alle Kunden</option>
          {data.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={nurMeine} onChange={(e) => setNurMeine(e.target.checked)} /> Nur meine
        </label>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {AD_STAGES.map((s) => {
          const col = ads.filter((a) => a.stage === s.key);
          return (
            <div
              key={s.key}
              className="flex-shrink-0 w-64"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) void save(dragging, { stage: s.key as AdStage });
                setDragging(null);
              }}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                <span className="text-xs font-semibold text-gray-900 uppercase tracking-wide">{s.label}</span>
                <span className="text-xs text-gray-400 ml-auto">{col.length}</span>
              </div>
              <p className="text-[11px] text-gray-400 px-1 mb-2">{s.hinweis}</p>
              <div className="space-y-2.5 min-h-[120px] rounded-xl p-2.5 bg-gray-50 border border-dashed border-gray-200">
                {col.map((a) => (
                  <Card
                    key={a.id}
                    padding="none"
                    className="p-3 cursor-pointer hover:shadow-md space-y-2"
                    draggable
                    onDragStart={() => setDragging(a.id)}
                    onClick={() => setOpenId(a.id)}
                  >
                    {a.vorschau_url && <AssetPreview url={a.vorschau_url} small titel={a.titel} />}
                    <p className="text-xs font-semibold text-red-600">{a.agency_name}</p>
                    <p className="text-sm font-medium text-gray-900 leading-snug">{a.titel}</p>
                    <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        {a.typ === 'grafik' || a.typ === 'karussell' ? <ImageIcon className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                        {AD_TYPEN.find((t) => t.key === a.typ)?.label}
                      </span>
                      <span title={KI_PUNKT[a.ki_status].titel} className={`h-2 w-2 rounded-full ${KI_PUNKT[a.ki_status].cls}`} />
                      {a.assignee_name && <span>· {a.assignee_name}</span>}
                      {a.faellig_am && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(`${a.faellig_am}T00:00:00`).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {a.kunden_kommentar && a.stage === 'bearbeitung' && (
                      <p className="text-[11px] rounded bg-amber-50 text-amber-800 px-2 py-1">Änderung: {a.kunden_kommentar}</p>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {open && <AdDetail key={open.id + open.updated_at} ad={open} data={data} onSave={(p) => save(open.id, p)} onClose={() => setOpenId(null)} />}

      <Modal open={neu} onClose={() => setNeu(false)} title="Neue Ad">
        <div className="space-y-3">
          <select className={inputCls} value={neuForm.agency_id} onChange={(e) => setNeuForm({ ...neuForm, agency_id: e.target.value })}>
            <option value="">Kunde wählen …</option>
            {data.agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input className={inputCls} placeholder="Titel, z.B. Reel: Ein Tag im Außendienst" value={neuForm.titel} onChange={(e) => setNeuForm({ ...neuForm, titel: e.target.value })} />
          <textarea className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[80px]" placeholder="Idee / Hook" value={neuForm.idee} onChange={(e) => setNeuForm({ ...neuForm, idee: e.target.value })} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select className={inputCls} value={neuForm.typ} onChange={(e) => setNeuForm({ ...neuForm, typ: e.target.value })}>
              {AD_TYPEN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <select className={inputCls} value={neuForm.assignee_id} onChange={(e) => setNeuForm({ ...neuForm, assignee_id: e.target.value })}>
              <option value="">zuständig …</option>
              {data.team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="date" className={inputCls} value={neuForm.faellig_am} onChange={(e) => setNeuForm({ ...neuForm, faellig_am: e.target.value })} />
          </div>
          <button
            disabled={!neuForm.agency_id || !neuForm.titel.trim()}
            onClick={async () => {
              const res = await fetch('/api/ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(neuForm) });
              if (!res.ok) {
                toast.error('Konnte nicht angelegt werden');
                return;
              }
              setNeu(false);
              setNeuForm({ agency_id: '', titel: '', idee: '', typ: 'grafik', assignee_id: '', faellig_am: '' });
              await load();
            }}
            className="w-full h-10 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            Anlegen
          </button>
        </div>
      </Modal>
    </div>
  );
}
