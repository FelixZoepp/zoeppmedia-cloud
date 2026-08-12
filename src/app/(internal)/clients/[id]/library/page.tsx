'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ContentLibraryItem } from '@/lib/types/database';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft, FileText, Phone, Video, Globe, Briefcase,
  MessageSquare, Eye, Pencil, Check, X,
} from 'lucide-react';

type ContentType = ContentLibraryItem['content_type'];
type ContentStatus = ContentLibraryItem['status'];

const contentTypeConfig: Record<ContentType, { label: string; icon: React.ReactNode }> = {
  ad_copy:        { label: 'Ad Copys',         icon: <FileText className="w-4 h-4" /> },
  phone_script:   { label: 'Telefon-Skripte',  icon: <Phone className="w-4 h-4" /> },
  video_script:   { label: 'Video-Skripte',    icon: <Video className="w-4 h-4" /> },
  funnel_text:    { label: 'Funnel-Texte',     icon: <Globe className="w-4 h-4" /> },
  job_posting:    { label: 'Stellenanzeigen',  icon: <Briefcase className="w-4 h-4" /> },
  creative_brief: { label: 'Creative Briefs',  icon: <MessageSquare className="w-4 h-4" /> },
};

const statusConfig: Record<ContentStatus, { label: string; tone: 'neutral' | 'softAccent' | 'accent' | 'success' | 'outline' }> = {
  draft:             { label: 'Entwurf',            tone: 'neutral' },
  internal_review:   { label: 'Interne Prüfung',   tone: 'outline' },
  approved_internal: { label: 'Intern freigegeben', tone: 'softAccent' },
  client_review:     { label: 'Beim Kunden',        tone: 'accent' },
  approved:          { label: 'Freigegeben',         tone: 'success' },
  changes_requested: { label: 'Änderungen',         tone: 'neutral' },
  deployed:          { label: 'Live',               tone: 'success' },
  archived:          { label: 'Archiviert',         tone: 'neutral' },
};

const contentTypeSegments = [
  { value: 'all', label: 'Alle' },
  { value: 'ad_copy', label: 'Ad Copys' },
  { value: 'phone_script', label: 'Telefon-Skripte' },
  { value: 'video_script', label: 'Video-Skripte' },
  { value: 'funnel_text', label: 'Funnel-Texte' },
  { value: 'job_posting', label: 'Stellenanzeigen' },
];

export default function LibraryPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<ContentLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [viewItem, setViewItem] = useState<ContentLibraryItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async () => {
    const url = filter === 'all'
      ? `/api/library?agency_id=${id}`
      : `/api/library?agency_id=${id}&content_type=${filter}`;
    const res = await fetch(url);
    const data: ContentLibraryItem[] = await res.json();
    setItems(data);
    setLoading(false);
  }, [id, filter]);

  useEffect(() => {
    setLoading(true);
    fetchItems();
  }, [fetchItems]);

  async function updateItem(itemId: string, updates: Partial<ContentLibraryItem>) {
    setSaving(true);
    const res = await fetch(`/api/library/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const updated: ContentLibraryItem = await res.json();
    setItems((prev) => prev.map((item) => (item.id === itemId ? updated : item)));
    if (viewItem?.id === itemId) setViewItem(updated);
    setSaving(false);
    setEditMode(false);
  }

  function updateStatus(itemId: string, status: ContentStatus) {
    return updateItem(itemId, { status });
  }

  function openView(item: ContentLibraryItem) {
    setViewItem(item);
    setEditContent(item.content);
    setEditTitle(item.title);
    setEditMode(false);
  }

  function closeView() {
    setViewItem(null);
    setEditMode(false);
    setEditContent('');
    setEditTitle('');
  }

  // Group items by content type
  const grouped = items.reduce<Record<string, ContentLibraryItem[]>>((acc, item) => {
    const key = item.content_type;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-[3px] border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <Link
        href={`/clients/${id}`}
        className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-red-500 text-[14px] mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück zum Kunden
      </Link>

      <PageHeader
        label="CONTENT"
        title="Library"
        description={`${items.length} Inhalte \u00B7 ${items.filter((i) => i.status === 'internal_review').length} in interner Prüfung \u00B7 ${items.filter((i) => i.status === 'changes_requested').length} Änderungen`}
      />

      {/* Filter */}
      <div className="mb-10 overflow-x-auto">
        <SegmentedControl
          items={contentTypeSegments}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* Content grouped by type */}
      {filter === 'all' ? (
        <div className="space-y-10">
          {Object.entries(contentTypeConfig).map(([type, config]) => {
            const typeItems = grouped[type];
            if (!typeItems || typeItems.length === 0) return null;

            return (
              <div key={type}>
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-red-50 text-red-500 flex items-center justify-center">
                    {config.icon}
                  </div>
                  <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
                    {config.label}
                  </h2>
                  <span className="text-[13px] text-[var(--text-tertiary)] font-medium">
                    ({typeItems.length})
                  </span>
                </div>

                <div className="space-y-6">
                  {typeItems.map((item) => (
                    <ContentCard key={item.id} item={item} onView={() => openView(item)} onStatusChange={updateStatus} />
                  ))}
                </div>
              </div>
            );
          })}

          {items.length === 0 && (
            <Card padding="lg" className="text-center">
              <p className="text-[var(--text-secondary)]">
                Noch keine Inhalte generiert. Starte den SOP-Prozess, um Inhalte zu erstellen.
              </p>
              <Link href={`/clients/${id}/sop`} className="inline-block mt-4">
                <Button variant="soft" size="sm">Zum SOP &rarr;</Button>
              </Link>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((item) => (
            <ContentCard key={item.id} item={item} onView={() => openView(item)} onStatusChange={updateStatus} />
          ))}
          {items.length === 0 && (
            <Card padding="lg" className="text-center">
              <p className="text-[var(--text-secondary)]">
                Keine Inhalte in dieser Kategorie.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* View/Edit Modal */}
      <Modal
        open={viewItem !== null}
        onClose={closeView}
        title={viewItem?.title || 'Inhalt'}
        width="max-w-2xl"
      >
        {viewItem && (
          <div className="space-y-8">
            {/* Meta info */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge tone={statusConfig[viewItem.status].tone}>
                {statusConfig[viewItem.status].label}
              </Badge>
              <span className="text-[13px] text-[var(--text-tertiary)]">
                {contentTypeConfig[viewItem.content_type].label}
              </span>
              {viewItem.variant && (
                <span className="text-[13px] text-[var(--text-tertiary)]">
                  Variante: {viewItem.variant}
                </span>
              )}
              <span className="text-[13px] text-[var(--text-tertiary)]">
                Version {viewItem.version}
              </span>
              <span className="text-[13px] text-[var(--text-tertiary)]">
                {new Date(viewItem.created_at).toLocaleDateString('de-DE')}
              </span>
            </div>

            {/* Client feedback banner */}
            {viewItem.client_feedback && (
              <div className="flex items-start gap-3 p-5 bg-amber-100/50 border border-amber-500/20 rounded-[var(--radius-md)]">
                <MessageSquare className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-amber-500 mb-1">Kunden-Feedback</p>
                  <p className="text-[13px] text-[var(--text-primary)]">{viewItem.client_feedback}</p>
                </div>
              </div>
            )}
            {/* Internal feedback banner */}
            {viewItem.feedback && (
              <div className="flex items-start gap-3 p-5 bg-gray-50 border border-[var(--border-default)] rounded-[var(--radius-md)]">
                <MessageSquare className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-secondary)] mb-1">Interne Notiz</p>
                  <p className="text-[13px] text-[var(--text-primary)]">{viewItem.feedback}</p>
                </div>
              </div>
            )}

            {/* Content area */}
            {editMode ? (
              <div className="space-y-4">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-5 py-3 text-[15px] font-semibold border border-[var(--border-default)] rounded-[var(--radius-md)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={12}
                  className="w-full px-5 py-4 text-[14px] font-mono leading-relaxed border border-[var(--border-default)] rounded-[var(--radius-md)] bg-white text-[var(--text-primary)] focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 resize-none"
                />
              </div>
            ) : (
              <div className="bg-gray-025 border border-gray-100 rounded-[var(--radius-md)] p-6 max-h-80 overflow-y-auto">
                <pre className="text-[14px] text-[var(--text-primary)] whitespace-pre-wrap font-[var(--font-ui)] leading-relaxed">
                  {viewItem.content}
                </pre>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-[var(--border-default)]">
              <div className="flex gap-2">
                {editMode ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => updateItem(viewItem.id, {
                        title: editTitle,
                        content: editContent,
                      })}
                      disabled={saving}
                    >
                      {saving ? 'Speichert...' : 'Speichern'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      setEditMode(false);
                      setEditContent(viewItem.content);
                      setEditTitle(viewItem.title);
                    }}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                    <Pencil className="w-3.5 h-3.5" /> Bearbeiten
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                {viewItem.status === 'draft' && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => updateStatus(viewItem.id, 'internal_review')}
                    disabled={saving}
                  >
                    <Eye className="w-3.5 h-3.5" /> Zur Prüfung
                  </Button>
                )}
                {viewItem.status === 'internal_review' && (
                  <Button
                    size="sm"
                    onClick={() => updateStatus(viewItem.id, 'approved_internal')}
                    disabled={saving}
                  >
                    <Check className="w-3.5 h-3.5" /> Für Kunden freigeben
                  </Button>
                )}
                {viewItem.status === 'changes_requested' && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => updateStatus(viewItem.id, 'approved_internal')}
                    disabled={saving}
                  >
                    <Check className="w-3.5 h-3.5" /> Erneut freigeben
                  </Button>
                )}
                {viewItem.status === 'approved_internal' && (
                  <Button
                    size="sm"
                    onClick={() => updateStatus(viewItem.id, 'client_review')}
                    disabled={saving}
                  >
                    Zum Kunden senden
                  </Button>
                )}
                {viewItem.status === 'approved' && (
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => updateStatus(viewItem.id, 'deployed')}
                    disabled={saving}
                  >
                    Als Live markieren
                  </Button>
                )}
                {viewItem.status !== 'archived' && viewItem.status !== 'deployed' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateItem(viewItem.id, { status: 'archived' })}
                    disabled={saving}
                  >
                    Archivieren
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---- Content Card sub-component ---- */

function ContentCard({
  item,
  onView,
  onStatusChange,
}: {
  item: ContentLibraryItem;
  onView: () => void;
  onStatusChange: (id: string, status: ContentStatus) => void;
}) {
  const config = statusConfig[item.status];
  const typeConfig = contentTypeConfig[item.content_type];

  return (
    <Card
      padding="md"
      className="flex items-start gap-6 group hover:shadow-[var(--shadow-md)] transition-shadow"
    >
      {/* Clickable area */}
      <div
        className="w-10 h-10 rounded-[var(--radius-md)] bg-red-50 text-red-500 flex items-center justify-center flex-shrink-0 cursor-pointer"
        onClick={onView}
      >
        {typeConfig.icon}
      </div>

      <div className="flex-1 min-w-0 cursor-pointer" onClick={onView}>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-[15px] text-[var(--text-primary)] truncate">
            {item.title}
          </h3>
          {item.variant && (
            <span className="text-[12px] text-[var(--text-tertiary)] font-medium bg-gray-100 px-1.5 py-0.5 rounded">
              {item.variant}
            </span>
          )}
          <span className="text-[12px] text-[var(--text-tertiary)]">
            v{item.version}
          </span>
        </div>

        <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
          {item.content.slice(0, 150)}{item.content.length > 150 ? '...' : ''}
        </p>

        {(item.feedback || item.client_feedback) && (
          <div className="flex items-center gap-1.5 mt-2 text-amber-500">
            <MessageSquare className="w-3 h-3" />
            <span className="text-[12px] font-medium truncate">
              {(item.client_feedback || item.feedback || '').slice(0, 80)}
              {((item.client_feedback || item.feedback) || '').length > 80 ? '...' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <Badge tone={config.tone}>{config.label}</Badge>
        <span className="text-[12px] text-[var(--text-tertiary)]">
          {new Date(item.updated_at).toLocaleDateString('de-DE')}
        </span>
        {/* Quick action buttons */}
        <div className="flex gap-2 mt-1">
          {item.status === 'draft' && (
            <Button
              size="sm"
              variant="soft"
              onClick={(e) => { e.stopPropagation(); onStatusChange(item.id, 'internal_review'); }}
            >
              Zur Prüfung
            </Button>
          )}
          {item.status === 'internal_review' && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); onStatusChange(item.id, 'approved_internal'); }}
            >
              Für Kunden freigeben
            </Button>
          )}
          {item.status === 'changes_requested' && (
            <Button
              size="sm"
              variant="soft"
              onClick={(e) => { e.stopPropagation(); onStatusChange(item.id, 'approved_internal'); }}
            >
              Erneut freigeben
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
