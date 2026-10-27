'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ABSAGE_GRUENDE, ABSAGE_GRUPPEN, NOTIZ_MAX, absageGrund, aggHinweis } from '@/lib/recruiting/absagegruende';

/**
 * Absagegrund wählen (Pflicht) + optionale Notiz. Wird von ✕-Absagen, Kanban, Bewerberakte und Mehrfachaktion genutzt.
 */
interface Props {
  open: boolean;
  name?: string;
  /** Mehrfachaktion: Anzahl Bewerber */
  anzahl?: number;
  laeuft?: boolean;
  onClose: () => void;
  onBestaetigt: (absage: { code: string; notiz: string | null }) => void;
}

export function AbsageDialog(props: Props) {
  // Inhalt nur bei offenem Dialog mounten → Auswahl startet jedes Mal leer
  if (!props.open || typeof document === 'undefined') return null;
  return createPortal(<DialogInhalt {...props} />, document.body);
}

function DialogInhalt({ open, name, anzahl, laeuft = false, onClose, onBestaetigt }: Props) {
  const [code, setCode] = useState('');
  const [notiz, setNotiz] = useState('');

  const grund = absageGrund(code);
  const notizFehlt = !!grund?.notizPflicht && !notiz.trim();
  const wer = anzahl && anzahl > 1 ? `${anzahl} Bewerber` : name ? <strong>{name}</strong> : 'der Bewerber';

  // Portal: Karten (Kanban/Dialer) haben transform/overflow – das Modal muss am body hängen
  // React leitet Portal-Events an die umgebende Karte weiter (Klick öffnet Akte, Pointer startet Drag) → hier stoppen
  const stopp = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div onClick={stopp} onPointerDown={stopp} onMouseDown={stopp} onTouchStart={stopp} onKeyDown={stopp}>
      <Modal open={open} onClose={onClose} title="Absagegrund" width="max-w-xl">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Warum wird {wer} abgesagt? Der Bewerber bekommt <strong>keine</strong> Nachricht.
          </p>

          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {ABSAGE_GRUPPEN.map((g) => (
              <div key={g.key}>
                <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">{g.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {ABSAGE_GRUENDE.filter((x) => x.gruppe === g.key).map((x) => (
                    <button
                      key={x.code}
                      type="button"
                      onClick={() => setCode(x.code)}
                      className={`rounded-full border px-3 py-1.5 text-[13px] transition-colors cursor-pointer ${
                        code === x.code ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {x.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value.slice(0, NOTIZ_MAX))}
              placeholder={grund?.notizPflicht ? 'Grund kurz beschreiben (Pflicht)' : 'Notiz (optional)'}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
            {aggHinweis(notiz) && (
              <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                Absagen wegen Alter, Geschlecht, Herkunft, Religion oder Behinderung sind nach AGG unzulässig – bitte nur sachliche Gründe notieren.
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="ghost" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!grund || notizFehlt || laeuft}
              onClick={() => grund && onBestaetigt({ code: grund.code, notiz: notiz.trim() || null })}
            >
              {laeuft ? 'Wird gespeichert …' : 'Absage bestätigen'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
