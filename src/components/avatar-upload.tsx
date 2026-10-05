'use client';

import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';

export const AVATAR_BUCKET = 'onboarding-assets';

/**
 * Rundes Profilbild mit Kamera-Knopf: lädt das Bild in den Storage und meldet die öffentliche URL.
 * Speichern (Profil bzw. Kunde) übernimmt der Aufrufer über onChange.
 */
export function AvatarUpload({
  name,
  src,
  folder,
  size = 96,
  onChange,
  label = 'Profilbild ändern',
}: {
  name: string;
  src: string | null;
  /** Ordner im Bucket, z. B. avatars/users/<id> */
  folder: string;
  size?: number;
  onChange: (url: string | null) => Promise<void> | void;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Bitte ein Bild auswählen (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Bild ist zu groß (max. 5 MB)');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${folder}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      await onChange(data.publicUrl);
      toast.success('Bild gespeichert');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-none">
        <span className={busy ? 'opacity-50' : ''}>
          <Avatar name={name} src={src} size={size} />
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={label}
          className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-b from-red-700 to-red-950 text-red-50 shadow-[0_0_0_3px_var(--card)] transition-transform hover:scale-105 disabled:opacity-60"
        >
          <Camera className="h-4 w-4" />
        </button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} />
      </div>
      <div className="space-y-1.5">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="block text-[14px] font-medium text-red-800 hover:underline">
          {busy ? 'Lädt hoch…' : label}
        </button>
        {src && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={busy}
            className="inline-flex items-center gap-1 text-[13px] text-gray-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Entfernen
          </button>
        )}
        <p className="text-xs text-gray-500">JPG, PNG oder WebP, max. 5 MB</p>
      </div>
    </div>
  );
}
