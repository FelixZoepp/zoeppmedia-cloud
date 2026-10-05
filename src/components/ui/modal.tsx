'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './icon-button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`fx-sheet bg-card rounded-t-2xl sm:rounded-2xl shadow-[0_30px_80px_-30px_#1a151480] p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-[26px] w-full ${width} max-h-[92dvh] sm:max-h-[90vh] overflow-y-auto overscroll-contain`}>
        {(title) && (
          <div className="flex items-center justify-between mb-6">
            {title && <h2 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>}
            <IconButton size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
