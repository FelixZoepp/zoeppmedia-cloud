'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Upload, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface CsvImportModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  onImported: () => void;
}

type FieldKey = 'firstName' | 'lastName' | 'phone' | 'email' | 'skip';
const FIELDS: { value: FieldKey; label: string }[] = [
  { value: 'skip', label: '-- Überspringen --' },
  { value: 'firstName', label: 'Vorname' },
  { value: 'lastName', label: 'Nachname' },
  { value: 'phone', label: 'Telefon' },
  { value: 'email', label: 'E-Mail' },
];

export function CsvImportModal({ open, onClose, jobId, onImported }: CsvImportModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, FieldKey>>({});

  const importableCount = rows.filter((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((_, i) => {
      const field = mapping[i];
      if (field && field !== 'skip') obj[field] = row[i]?.trim() ?? '';
    });
    return obj.firstName || obj.phone;
  }).length;
  const [optInConfirmed, setOptInConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; duplicates: number; invalid: number } | null>(null);

  function handleFile(file: File) {
    Papa.parse(file, {
      encoding: 'UTF-8',
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][];
        if (data.length < 2) { toast.error('CSV muss mindestens eine Kopfzeile und eine Datenzeile haben.'); return; }
        setHeaders(data[0]);
        setRows(data.slice(1));
        // Auto-Mapping
        const autoMap: Record<number, FieldKey> = {};
        data[0].forEach((h, i) => {
          const lower = h.toLowerCase().trim();
          if (lower.includes('vorname') || lower === 'first_name' || lower === 'firstname') autoMap[i] = 'firstName';
          else if (lower.includes('nachname') || lower === 'last_name' || lower === 'lastname' || lower === 'name') autoMap[i] = 'lastName';
          else if (lower.includes('telefon') || lower.includes('phone') || lower.includes('mobil') || lower.includes('handy')) autoMap[i] = 'phone';
          else if (lower.includes('email') || lower.includes('e-mail') || lower.includes('mail')) autoMap[i] = 'email';
          else autoMap[i] = 'skip';
        });
        setMapping(autoMap);
      },
      error: () => toast.error('CSV konnte nicht gelesen werden.'),
    });
  }

  async function handleImport() {
    if (!optInConfirmed) { toast.error('Bitte bestätigen, dass das Opt-in für alle Kontakte vorliegt.'); return; }

    // Map rows to IngestInput-compatible objects
    const mappedRows = rows.map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((_, i) => {
        const field = mapping[i];
        if (field && field !== 'skip') obj[field] = row[i]?.trim() ?? '';
      });
      return obj;
    }).filter((r) => r.firstName || r.phone); // Mindestens eines muss vorhanden sein

    if (mappedRows.length === 0) { toast.error('Keine gültigen Zeilen gefunden. Vorname oder Telefon wird benötigt.'); return; }

    setImporting(true);
    try {
      const res = await fetch('/api/applications/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, rows: mappedRows, optInConfirmed }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult(data);
      onImported();
    } catch {
      toast.error('Fehler beim Import');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="CSV-Import" width="max-w-2xl">
      <div className="space-y-5">
        {!headers.length ? (
          <div>
            <label className="flex flex-col items-center justify-center w-full h-40 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-500">CSV-Datei hierher ziehen oder klicken</span>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          </div>
        ) : result ? (
          <div className="text-center py-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Import abgeschlossen</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-700">{result.created}</p>
                <p className="text-sm text-green-600">Angelegt</p>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-700">{result.duplicates}</p>
                <p className="text-sm text-yellow-600">Dubletten</p>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-700">{result.invalid}</p>
                <p className="text-sm text-red-600">Ungültig</p>
              </div>
            </div>
            <Button className="mt-6" onClick={onClose}>Schließen</Button>
          </div>
        ) : (
          <>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">Spalten-Zuordnung ({rows.length} Zeilen)</h3>
              <div className="grid grid-cols-2 gap-3">
                {headers.map((h, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-32 truncate" title={h}>{h}</span>
                    <Select value={mapping[i] ?? 'skip'}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [i]: e.target.value as FieldKey }))}
                      options={FIELDS} className="flex-1" />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-gray-600">
              <strong>Vorschau</strong> (erste 3 Zeilen):
              <table className="w-full mt-2 text-xs">
                <tbody>
                  {rows.slice(0, 3).map((row, ri) => (
                    <tr key={ri} className="border-t border-gray-200">
                      {headers.map((_, ci) => (
                        <td key={ci} className="py-1 px-2 truncate max-w-[120px]">{row[ci]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg cursor-pointer">
              <input type="checkbox" checked={optInConfirmed}
                onChange={(e) => setOptInConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-gray-300" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  <AlertTriangle className="w-4 h-4 inline mr-1" />
                  Ich bestätige, dass für alle importierten Kontakte ein gültiges Opt-in zur Kontaktaufnahme vorliegt.
                </p>
                <p className="text-xs text-yellow-600 mt-1">Ohne Bestätigung wird kein WhatsApp-Bot gestartet.</p>
              </div>
            </label>

            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={onClose}>Abbrechen</Button>
              <Button className="flex-1" disabled={!optInConfirmed || importing}
                onClick={handleImport}>{importing ? 'Importiert...' : `${importableCount} Kontakte importieren`}</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
