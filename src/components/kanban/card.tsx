'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import type { ApplicationRow } from './board';
import { AbsageKnopf, type AbsageErgebnis } from '@/components/candidates/absage-knopf';

const sourceLabels: Record<string, string> = {
  meta: 'Meta', indeed: 'Indeed', manual: 'Manuell', form: 'Formular', csv: 'CSV-Import',
};

const sourceTones: Record<string, 'accent' | 'softAccent' | 'neutral'> = {
  meta: 'softAccent', indeed: 'accent', manual: 'neutral', form: 'neutral', csv: 'neutral',
};

const scoreTones: Record<string, 'accent' | 'softAccent' | 'neutral'> = {
  A: 'accent', B: 'softAccent', C: 'neutral',
};

export function KanbanCard({
  application,
  onClick,
  abgesagt = false,
  onAbgesagt,
  onWiederhergestellt,
}: {
  application: ApplicationRow;
  onClick: () => void;
  abgesagt?: boolean;
  onAbgesagt?: (e: AbsageErgebnis) => void;
  onWiederhergestellt?: (e: AbsageErgebnis) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
    data: { application },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}
      className="bg-card rounded-xl p-4 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 text-sm">{application.candidate.name}</p>
        <AbsageKnopf
          candidateId={application.candidate_id}
          name={application.candidate.name}
          abgesagt={abgesagt || application.status === 'rejected'}
          onAbgesagt={onAbgesagt}
          onWiederhergestellt={onWiederhergestellt}
          className="-mr-1.5 -mt-1.5"
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">{application.job.title}</p>
      {application.candidate.phone && (
        <p className="text-xs text-gray-600 mt-2">{application.candidate.phone}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <Badge tone={sourceTones[application.source] ?? 'neutral'}>
          {sourceLabels[application.source] ?? application.source}
        </Badge>
        {application.score_label && (
          <Badge tone={scoreTones[application.score_label] ?? 'neutral'}>
            {application.score_label}
          </Badge>
        )}
        {application.candidate.persona_typ && (
          <span
            className="truncate rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800"
            title={application.candidate.persona_fit ? `Persona-Test: ${application.candidate.persona_typ} – ${application.candidate.persona_fit}` : `Persona-Test: ${application.candidate.persona_typ}`}
          >
            {application.candidate.persona_typ}
          </span>
        )}
      </div>
    </div>
  );
}
