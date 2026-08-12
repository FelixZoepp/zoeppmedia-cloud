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
      className="fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur-md bg-black/25 transition-all duration-300"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`bg-white rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.12)] p-14 w-full ${width} animate-in fade-in zoom-in-95 duration-300`}>
        {(title) && (
          <div className="flex items-center justify-between mb-10">
            {title && <h2 className="text-[26px] font-bold text-gray-900">{title}</h2>}
            <IconButton size="sm" onClick={onClose}>
              <X className="w-5 h-5" />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
