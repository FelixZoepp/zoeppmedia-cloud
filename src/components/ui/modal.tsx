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
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0B1C30]/20 backdrop-blur-md transition-all duration-300"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className={`bg-white/90 backdrop-blur-[40px] rounded-[20px] shadow-[0_24px_80px_rgba(11,28,48,0.12),0_0_0_1px_rgba(255,255,255,0.6)_inset] p-10 w-full ${width} animate-in fade-in zoom-in-95 duration-300`}>
        {(title) && (
          <div className="flex items-center justify-between mb-8">
            {title && <h2 className="text-[24px] font-bold text-[var(--text-primary)]">{title}</h2>}
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
