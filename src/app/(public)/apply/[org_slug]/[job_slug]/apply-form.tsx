'use client';

import { useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Script from 'next/script';

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function ApplyForm({
  agencyId,
  agencySlug,
  jobId,
  jobTitle,
}: {
  agencyId: string;
  agencySlug: string;
  jobId: string;
  jobTitle: string;
}) {
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    postalCode: '',
    city: '',
    consentWhatsapp: false,
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim()) { setError('Vorname ist erforderlich.'); return; }
    if (!form.phone.trim()) { setError('Telefonnummer ist erforderlich.'); return; }
    if (!form.consentWhatsapp) { setError('Bitte stimme der Kontaktaufnahme per WhatsApp zu.'); return; }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('agencyId', agencyId);
      formData.append('jobId', jobId);
      formData.append('firstName', form.firstName);
      formData.append('lastName', form.lastName);
      formData.append('phone', form.phone);
      formData.append('email', form.email);
      formData.append('postalCode', form.postalCode);
      formData.append('city', form.city);
      formData.append('consentWhatsapp', String(form.consentWhatsapp));

      // UTM-Parameter
      const campaign: Record<string, string> = {};
      for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src']) {
        const val = searchParams.get(key);
        if (val) campaign[key] = val;
      }
      formData.append('campaign', JSON.stringify(campaign));

      if (file) {
        formData.append('resume', file);
      }

      const res = await fetch('/api/apply', { method: 'POST', body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Fehler beim Absenden');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Absenden');
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Vielen Dank!</h2>
        <p className="text-gray-600">Deine Bewerbung als <strong>{jobTitle}</strong> ist eingegangen. Wir melden uns in Kuerze bei dir.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <h2 className="font-semibold text-gray-900 text-lg">Jetzt bewerben</h2>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
        <input type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none"
          required />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nachname</label>
        <input type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Telefonnummer *</label>
        <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)}
          placeholder="z.B. 0176 1234567"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none"
          required />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
        <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
          <input type="text" value={form.postalCode} onChange={(e) => update('postalCode', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ort</label>
          <input type="text" value={form.city} onChange={(e) => update('city', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lebenslauf (PDF, max. 10 MB)</label>
        <input ref={fileRef} type="file" accept=".pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > 10 * 1024 * 1024) { setError('Datei zu gross (max. 10 MB)'); return; }
            setFile(f);
          }}
          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 file:text-red-600 hover:file:bg-red-100" />
      </div>

      <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
        <input type="checkbox" checked={form.consentWhatsapp}
          onChange={(e) => update('consentWhatsapp', e.target.checked)}
          className="mt-0.5 rounded border-gray-300" />
        <span className="text-sm text-gray-700">
          Ich bin damit einverstanden, per WhatsApp kontaktiert zu werden. Meine Daten werden zur Bearbeitung meiner Bewerbung gespeichert. Ich kann meine Einwilligung jederzeit widerrufen. *
        </span>
      </label>
      {siteKey ? (
        <>
          <div className="cf-turnstile" data-sitekey={siteKey} data-response-field-name="turnstileToken" />
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
        </>
      ) : null}

      <button type="submit" disabled={submitting}
        className="w-full py-3 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {submitting ? 'Wird gesendet...' : 'Bewerbung absenden'}
      </button>

      <p className="text-xs text-gray-400 text-center">
        Mit dem Absenden stimmst du der Verarbeitung deiner Daten zu.
      </p>
    </form>
  );
}
