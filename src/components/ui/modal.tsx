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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/20"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`bg-white rounded-[var(--radius-2xl)] shadow-[var(--shadow-lg)] p-5 sm:p-8 w-full max-h-[calc(100dvh-2rem)] overflow-y-auto ${width} animate-in fade-in zoom-in-95 duration-200`}>
        {(title) && (
          <div className="flex items-center justify-between mb-6">
            {title && <h2 className="text-[18px] sm:text-[22px] font-bold text-gray-900 min-w-0 truncate pr-3">{title}</h2>}
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
