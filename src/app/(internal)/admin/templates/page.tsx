'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Save, ChevronDown, ChevronRight } from 'lucide-react';
import type { ContentTemplate } from '@/lib/types/database';

const CONTENT_TYPE_LABELS: Record<string, string> = {
  generator_rules: 'Generator-Regeln',
  ad_winkel_1: 'Winkel 1: Geld/Verdienst',
  ad_winkel_2: 'Winkel 2: Freiheit/Lifestyle',
  ad_winkel_3: 'Winkel 3: Karriere/Aufstieg',
  funnel: 'Funnel (7 Screens)',
  phone_script: 'Telefon-Skript',
  vg_leitfaden: 'VG-Leitfaden',
  follow_up: 'Follow-Up Scripts',
  absage_telefon: 'Absage: Telefonisch',
  absage_vg: 'Absage: Nach VG',
  absage_schriftlich: 'Absage: Schriftlich',
  indeed: 'Indeed-Vorlage',
};

const CONTENT_TYPE_ORDER = [
  'generator_rules',
  'ad_winkel_1',
  'ad_winkel_2',
  'ad_winkel_3',
  'funnel',
  'phone_script',
  'vg_leitfaden',
  'follow_up',
  'absage_telefon',
  'absage_vg',
  'absage_schriftlich',
  'indeed',
];

const BRANCH_LABELS: Record<string, string> = {
  all: 'Alle Branchen',
  solar: 'Solar',
  glasfaser: 'Glasfaser',
  strom_gas: 'Strom & Gas',
  telko: 'Telko',
  versicherung: 'Versicherung',
};

interface GroupedTemplates {
  [contentType: string]: ContentTemplate[];
}

export default function AdminTemplatesPage() {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/templates');
    if (res.ok) {
      const data: ContentTemplate[] = await res.json();
      setTemplates(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function toggleGroup(contentType: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(contentType)) {
        next.delete(contentType);
      } else {
        next.add(contentType);
      }
      return next;
    });
  }

  function startEditing(template: ContentTemplate) {
    setEditingId(template.id);
    setEditText(template.template_text);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditText('');
  }

  async function saveTemplate(id: string) {
    setSaving(id);
    const res = await fetch(`/api/templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_text: editText }),
    });

    if (res.ok) {
      const updated: ContentTemplate = await res.json();
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? updated : t))
      );
      setEditingId(null);
      setEditText('');
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
    }
    setSaving(null);
  }

  // Group templates by content_type
  const grouped: GroupedTemplates = {};
  for (const t of templates) {
    if (!grouped[t.content_type]) grouped[t.content_type] = [];
    grouped[t.content_type].push(t);
  }

  // Sort groups by predefined order
  const sortedTypes = CONTENT_TYPE_ORDER.filter((ct) => grouped[ct]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="VERWALTUNG"
        title="Templates"
        description="Vorlagen-Datenbank fuer Ad-Texte, Skripte, Funnel-Texte und Leitfaeden. Die Templates werden bei der KI-Generierung als Grundlage verwendet."
        counter={`${templates.length} Templates`}
      />

      <div className="space-y-3">
        {sortedTypes.map((contentType) => {
          const items = grouped[contentType];
          const isExpanded = expandedGroups.has(contentType);

          return (
            <Card key={contentType} padding="none" className="overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(contentType)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {CONTENT_TYPE_LABELS[contentType] || contentType}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {items.length} {items.length === 1 ? 'Template' : 'Templates'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {items.map((t) => (
                    <Badge key={t.id} tone="neutral">
                      {BRANCH_LABELS[t.branch] || t.branch}
                    </Badge>
                  ))}
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-gray-200 divide-y divide-gray-100">
                  {items.map((template) => {
                    const isEditing = editingId === template.id;
                    const isSaving = saving === template.id;
                    const wasSaved = saved === template.id;

                    return (
                      <div key={template.id} className="px-5 py-4">
                        {/* Template header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {template.title}
                            </span>
                            <Badge tone="neutral">
                              {BRANCH_LABELS[template.branch] || template.branch}
                            </Badge>
                            <span className="text-xs text-gray-400 font-mono">
                              {template.template_key}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {wasSaved && (
                              <span className="text-xs text-green-600 font-medium">
                                Gespeichert
                              </span>
                            )}
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={cancelEditing}
                                >
                                  Abbrechen
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveTemplate(template.id)}
                                  disabled={isSaving}
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  {isSaving ? 'Speichert...' : 'Speichern'}
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => startEditing(template)}
                              >
                                Bearbeiten
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Template text */}
                        {isEditing ? (
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full min-h-[300px] p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-y"
                            spellCheck={false}
                          />
                        ) : (
                          <pre className="w-full max-h-[400px] overflow-auto p-3 rounded-lg bg-gray-50 border border-gray-100 text-xs font-mono text-gray-700 whitespace-pre-wrap">
                            {template.template_text}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {sortedTypes.length === 0 && (
          <Card padding="lg">
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">
                Keine Templates vorhanden. Die Templates werden bei der Datenbank-Migration automatisch angelegt.
              </p>
            </div>
          </Card>
        )}
      </div>

      <p className="text-sm text-gray-400 mt-8">
        Platzhalter-Syntax: {'{{field}}'} wird beim Generieren durch Agenturdaten ersetzt. Bedingte Bloecke: {'{{#wenn field=value}}...{{/wenn}}'}.
      </p>
    </div>
  );
}
