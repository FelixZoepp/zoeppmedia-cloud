'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Video, ExternalLink, Eye, Link2, BarChart3 } from 'lucide-react';

interface DankevideoSettingsProps {
  agencyId: string;
}

interface VideoData {
  dankevideo_url: string | null;
  dankevideo_active: boolean;
  total_links: number;
  total_views: number;
  view_rate: number;
}

export function DankevideoSettings({ agencyId }: DankevideoSettingsProps) {
  const [data, setData] = useState<VideoData | null>(null);
  const [url, setUrl] = useState('');
  const [active, setActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch(`/api/admin/agencies/${agencyId}/video`)
      .then((r) => r.json())
      .then((d: VideoData) => {
        setData(d);
        setUrl(d.dankevideo_url || '');
        setActive(d.dankevideo_active);
      })
      .catch(() => setError('Daten konnten nicht geladen werden'));
  }, [agencyId]);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');

    const res = await fetch(`/api/admin/agencies/${agencyId}/video`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dankevideo_url: url || null,
        dankevideo_active: active,
      }),
    });

    if (!res.ok) {
      const d = await res.json();
      setError(d.error || 'Fehler beim Speichern');
    } else {
      setSuccess('Gespeichert');
      // Refresh stats
      const refreshRes = await fetch(`/api/admin/agencies/${agencyId}/video`);
      if (refreshRes.ok) {
        const refreshed: VideoData = await refreshRes.json();
        setData(refreshed);
      }
      setTimeout(() => setSuccess(''), 3000);
    }

    setSaving(false);
  }

  function handleToggle() {
    setActive((prev) => !prev);
  }

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-red-600" />
          <h3 className="text-base font-bold text-gray-900">Dankevideo</h3>
        </div>
        {data && (
          <Badge tone={active ? 'success' : 'neutral'}>
            {active ? 'Aktiv' : 'Inaktiv'}
          </Badge>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Willkommensvideo, das neuen Bewerbern automatisch zugesendet wird.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Video-URL
          </label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            icon={<Link2 className="w-4 h-4" />}
            placeholder="https://youtube.com/watch?v=... oder Vimeo-Link"
          />
          <p className="text-xs text-gray-400 mt-1">
            YouTube, Vimeo oder ein anderer direkter Video-Link
          </p>
        </div>

        <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer">
          <input
            type="checkbox"
            checked={active}
            onChange={handleToggle}
            className="w-5 h-5 rounded accent-red-600"
          />
          <div>
            <p className="text-sm font-medium text-gray-900">Video aktiv</p>
            <p className="text-xs text-gray-400">
              Neue Bewerber erhalten automatisch einen Tracking-Link zum Video
            </p>
          </div>
        </label>

        {/* Stats */}
        {data && (data.total_links > 0 || data.total_views > 0) && (
          <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Link2 className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{data.total_links}</p>
              <p className="text-xs text-gray-500">Links erstellt</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <Eye className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{data.total_views}</p>
              <p className="text-xs text-gray-500">Aufrufe</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <p className="text-lg font-bold text-gray-900">{data.view_rate}%</p>
              <p className="text-xs text-gray-500">View-Rate</p>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        {success && (
          <p className="text-green-600 text-xs bg-green-50 px-3 py-2 rounded-lg">{success}</p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? 'Speichern...' : 'Speichern'}
          </Button>
          {url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(url, '_blank')}
            >
              <ExternalLink className="w-4 h-4" /> Vorschau
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
