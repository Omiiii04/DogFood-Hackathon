import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) => {
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Support both controlled (isOpen prop) and uncontrolled (always-open) usage
  const shouldRender = isOpen === undefined ? true : isOpen;
  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-on-surface/30 backdrop-blur-sm transition-opacity animate-scale-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className={`relative bg-surface-container-lowest border border-outline-variant/60 rounded-2xl shadow-[0_20px_60px_rgba(0,72,212,0.15)] w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden z-10 animate-fade-in-up`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container bg-surface-container-low/50">
            <h3 className="font-title-md text-title-md text-on-surface font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};
