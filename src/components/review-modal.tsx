'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Check, RotateCcw, X } from 'lucide-react';

const REVIEW_QUESTIONS = [
  'Firmenname korrekt?',
  'Branche/Region passend?',
  'Tonalität professionell und motivierend?',
  'Keine Rechtschreibfehler?',
  'Call-to-Action vorhanden?',
  'Kontaktdaten/Links korrekt?',
];

export interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  content: string;
  contentType: string;
  agencyId: string;
  taskId?: string;
  onApprove: () => void;
  onRevise: (feedback: string) => void;
  onDiscard: () => void;
}

export function ReviewModal({
  open,
  onClose,
  content,
  contentType,
  agencyId,
  taskId,
  onApprove,
  onRevise,
  onDiscard,
}: ReviewModalProps) {
  const [checks, setChecks] = useState<boolean[]>(REVIEW_QUESTIONS.map(() => false));
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);

  // Reset checks whenever modal opens
  const allChecked = checks.every(Boolean);

  function toggleCheck(index: number) {
    setChecks((prev) => prev.map((c, i) => (i === index ? !c : c)));
  }

  async function handleApprove() {
    setSaving(true);
    try {
      await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: agencyId,
          content_type: contentType,
          title: contentType,
          content,
          status: 'internal_review',
        }),
      });
      onApprove();
    } finally {
      setSaving(false);
    }
  }

  async function handleRevise() {
    const issues = REVIEW_QUESTIONS.filter((_, i) => !checks[i]);
    const feedback = `Bitte überarbeite: ${issues.join(', ')}`;
    setRevising(true);
    try {
      onRevise(feedback);
    } finally {
      setRevising(false);
    }
  }

  function handleDiscard() {
    setChecks(REVIEW_QUESTIONS.map(() => false));
    onDiscard();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Content prüfen"
      width="max-w-3xl"
    >
      <div className="space-y-6">
        {/* Content Preview */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Generierter Content
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
            <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed">
              {content}
            </pre>
          </div>
        </div>

        {/* Checklist */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Prüfliste
          </p>
          <div className="space-y-2">
            {REVIEW_QUESTIONS.map((question, i) => (
              <label
                key={i}
                className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={checks[i]}
                  onChange={() => toggleCheck(i)}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                />
                <span className="text-sm text-gray-900">{question}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
          <Button
            variant="primary"
            size="sm"
            onClick={handleApprove}
            disabled={!allChecked || saving}
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Speichert...' : 'Freigeben'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRevise}
            disabled={revising}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {revising ? 'Überarbeitet...' : 'Überarbeiten'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            className="ml-auto"
          >
            <X className="w-3.5 h-3.5" />
            Verwerfen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
