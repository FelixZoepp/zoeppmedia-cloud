'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { hatSop } from '@/lib/akademie/schritt-index';

/** Kleiner Link „SOP ansehen“ an Aufgaben/Ablauf-Schritten – nur wenn es eine SOP zum Schritt gibt */
export function SopLink({ stepKey, className = '' }: { stepKey: string | null | undefined; className?: string }) {
  if (!hatSop(stepKey)) return null;
  return (
    <Link
      href={`/akademie/schritt/${stepKey}`}
      onPointerDown={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 text-[12.5px] font-medium text-red-800 hover:underline ${className}`}
    >
      <BookOpen className="h-3.5 w-3.5" /> SOP ansehen
    </Link>
  );
}
