'use client';

import { ExternalLink } from 'lucide-react';

/**
 * Vorschau für Ad-Dateien – Standard sind Google-Drive- und Dropbox-Links.
 * Drive: eingebetteter Drive-Player (Datei muss "Jeder mit dem Link" freigegeben sein).
 * Dropbox: direkte Datei über raw=1.
 */

export function driveFileId(url: string): string | null {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
  return m ? m[1] : null;
}

export function dropboxRaw(url: string): string | null {
  if (!/dropbox\.com\//.test(url)) return null;
  const u = new URL(url);
  u.searchParams.delete('dl');
  u.searchParams.set('raw', '1');
  return u.toString();
}

export function isLinkErlaubt(url: string): boolean {
  return /^https:\/\/(drive\.google\.com|docs\.google\.com|(www\.)?dropbox\.com|dl\.dropboxusercontent\.com)\//.test(url);
}

const VIDEO = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const BILD = /\.(png|jpe?g|webp|gif)(\?|$)/i;

export function AssetPreview({ url, small = false, titel = '' }: { url: string | null; small?: boolean; titel?: string }) {
  if (!url) return null;
  const h = small ? 'h-28' : 'h-[420px]';

  const driveId = driveFileId(url);
  if (driveId) {
    return (
      <div className="space-y-1">
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          className={`w-full ${h} rounded-lg bg-gray-100 ${small ? 'pointer-events-none' : ''}`}
          allow="autoplay"
          title={titel || 'Vorschau'}
        />
        {!small && <OpenLink url={url} label="In Google Drive öffnen" />}
      </div>
    );
  }

  const raw = dropboxRaw(url) ?? url;
  if (VIDEO.test(url) || VIDEO.test(raw)) {
    return (
      <div className="space-y-1">
        <video src={raw} controls={!small} muted={small} className={`w-full rounded-lg bg-black ${small ? 'h-28 object-cover' : 'max-h-[480px]'}`} />
        {!small && <OpenLink url={url} label="Datei öffnen" />}
      </div>
    );
  }
  if (BILD.test(url) || BILD.test(raw) || url.includes('/storage/')) {
    return (
      <div className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={raw} alt={titel} className={`w-full rounded-lg ${small ? 'h-28 object-cover' : 'max-h-[480px] object-contain bg-gray-50'}`} />
        {!small && <OpenLink url={url} label="Datei öffnen" />}
      </div>
    );
  }
  return <OpenLink url={url} label={small ? 'Datei' : 'Datei öffnen'} />;
}

function OpenLink({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-red-600 font-medium inline-flex items-center gap-1">
      <ExternalLink className="w-3 h-3" /> {label}
    </a>
  );
}
