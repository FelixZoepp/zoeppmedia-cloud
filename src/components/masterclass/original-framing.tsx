'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  title: string;
  situation: string;
  quote: string;
  explanation?: string;
}

export function OriginalFraming({ title, situation, quote, explanation }: Props) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mb-6">
      <div className="border-l-4 border-l-red-600 bg-gray-50 rounded-r-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Original Training</span>
            <h4 className="text-sm font-semibold text-gray-900 mt-0.5">{title}</h4>
          </div>
          <button onClick={copy} className="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Kopieren">
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">{situation}</p>
        <blockquote className="text-base text-gray-900 italic leading-relaxed border-l-2 border-gray-300 pl-4">
          &ldquo;{quote}&rdquo;
        </blockquote>
      </div>
      {explanation && (
        <div className="mt-3 pl-5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Warum das funktioniert</span>
          <p className="text-sm text-gray-600 mt-1">{explanation}</p>
        </div>
      )}
    </div>
  );
}
