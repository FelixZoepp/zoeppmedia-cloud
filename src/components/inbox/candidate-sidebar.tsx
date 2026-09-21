'use client';

import { Badge } from '@/components/ui/badge';
import { Phone, Mail, Briefcase, User } from 'lucide-react';
import Link from 'next/link';

interface Props {
  conversation: Record<string, unknown>;
}

export function CandidateSidebar({ conversation }: Props) {
  const conv = conversation as {
    candidate: {
      id: string;
      name: string;
      phone_e164: string | null;
      email: string | null;
    };
    application: Array<{
      id: string;
      job: { title: string } | null;
      stage: { name: string; color: string } | null;
    }> | null;
    state: string;
    assigned_to: string | null;
  };

  const candidate = conv.candidate;
  const app = conv.application?.[0];

  return (
    <div className="p-4 space-y-6">
      {/* Name + Link */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <User className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <Link
            href={`/candidates/${candidate.id}`}
            className="text-sm font-semibold text-gray-900 hover:underline"
          >
            {candidate.name}
          </Link>
        </div>
      </div>

      {/* Kontakt */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-gray-400 uppercase">Kontakt</h4>
        {candidate.phone_e164 && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Phone className="w-4 h-4 text-gray-400" />
            <span>{candidate.phone_e164}</span>
          </div>
        )}
        {candidate.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <Mail className="w-4 h-4 text-gray-400" />
            <span>{candidate.email}</span>
          </div>
        )}
      </div>

      {/* Job + Stufe */}
      {app && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-400 uppercase">Bewerbung</h4>
          {app.job && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Briefcase className="w-4 h-4 text-gray-400" />
              <span>{app.job.title}</span>
            </div>
          )}
          {app.stage && (
            <Badge tone="neutral">{app.stage.name}</Badge>
          )}
        </div>
      )}
    </div>
  );
}
