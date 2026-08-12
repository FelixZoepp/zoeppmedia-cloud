'use client';

import { useState, useRef } from 'react';
import { Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface FileUploadProps {
  bucket: string;
  path: string;
  accept?: string;
  maxSizeMB?: number;
  maxFiles?: number;
  value: string[];
  onChange: (urls: string[]) => void;
  label?: string;
}

export function FileUpload({
  bucket,
  path,
  accept = 'image/png,image/jpeg,image/svg+xml',
  maxSizeMB = 5,
  maxFiles = 1,
  value,
  onChange,
  label,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (value.length + files.length > maxFiles) {
      setError(`Maximal ${maxFiles} Datei${maxFiles > 1 ? 'en' : ''}`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const newUrls: string[] = [];
      for (const file of files) {
        if (file.size > maxSizeMB * 1024 * 1024) {
          setError(`${file.name} ist zu groß (max ${maxSizeMB}MB)`);
          continue;
        }
        const ext = file.name.split('.').pop();
        const fileName = `${path}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        newUrls.push(urlData.publicUrl);
      }
      onChange([...value, ...newUrls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div className="space-y-5">
      {label && (
        <label className="block text-[13px] font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {value.map((url) => (
            <div
              key={url}
              className="relative group w-20 h-20 rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-default)]"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(url)}
                className="absolute top-1 right-1 p-0.5 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition"
              >
                <X className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {value.length < maxFiles && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-5 py-3 rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-default)] text-sm text-[var(--text-tertiary)] hover:border-red-200 hover:text-[var(--danger-600)] transition disabled:opacity-50"
        >
          {uploading ? (
            <span className="animate-pulse">Hochladen...</span>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {maxFiles > 1 ? 'Dateien hochladen' : 'Datei hochladen'}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={maxFiles > 1}
        onChange={handleUpload}
        className="hidden"
      />
      {error && <p className="text-sm text-[var(--danger-600)]">{error}</p>}
    </div>
  );
}
