import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2, Minus, X, AlertTriangle } from 'lucide-react';

interface MacWindowProps {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose: () => void;
  isDirty?: boolean;
  maxWidthClass?: string;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  zIndexClass?: string;
}

export function MacWindow({
  open,
  title,
  subtitle,
  icon,
  onClose,
  isDirty = false,
  maxWidthClass = 'max-w-4xl',
  headerExtra,
  footer,
  children,
  zIndexClass = 'z-50',
}: MacWindowProps) {
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) {
      setExpanded(false);
      setMinimized(false);
      setConfirmDiscard(false);
    }
  }, [open]);

  if (!open) return null;

  function requestClose() {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }

  // Minimized floating Liquid Glass pill above the Dock so the user never loses unsaved work
  if (minimized) {
    return (
      <div className={`fixed bottom-24 right-4 sm:right-6 ${zIndexClass} animate-in fade-in duration-150`}>
        <div className="aumi-dock-glass rounded-2xl px-3.5 py-2 flex items-center gap-2.5 max-w-[280px]">
          <button
            type="button"
            onClick={() => setMinimized(false)}
            className="flex items-center gap-2 text-left min-w-0 flex-1"
            title="Restaurar janela"
          >
            {icon && <span className="shrink-0">{icon}</span>}
            <span className="text-xs font-semibold text-[#2F1534] truncate">{title}</span>
          </button>
          <button
            type="button"
            onClick={() => setMinimized(false)}
            aria-label="Restaurar janela"
            className="p-1 rounded-lg hover:bg-black/5 text-[#2F1534]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Fechar janela"
            className="p-1 rounded-lg hover:bg-[#EC2B82]/10 text-[#EC2B82]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} bg-[#2F1534]/28 backdrop-blur-md flex items-center justify-center p-2 sm:p-5`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`aumi-mac-window w-full flex flex-col overflow-hidden transition-all duration-200 ${
          expanded
            ? 'max-w-[96vw] h-[93vh] rounded-[24px]'
            : `${maxWidthClass} max-h-[90vh] rounded-[24px]`
        }`}
      >
        {/* macOS Liquid Glass Titlebar */}
        <div className="px-4 sm:px-5 py-3.5 bg-gradient-to-r from-[#F6EEFC]/85 via-white/90 to-[#FDF2F6]/85 border-b border-[#2F1534]/[0.07] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Traffic Lights */}
            <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Controles da janela">
              <button
                type="button"
                onClick={requestClose}
                title="Fechar janela"
                aria-label="Fechar janela"
                className="w-3.5 h-3.5 rounded-full bg-[#FF5F57] hover:brightness-90 border border-black/10 flex items-center justify-center group transition-all"
              >
                <X className="w-2 h-2 text-[#4A0B08] opacity-0 group-hover:opacity-100" strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => setMinimized(true)}
                title="Minimizar janela"
                aria-label="Minimizar janela"
                className="w-3.5 h-3.5 rounded-full bg-[#FEBC2E] hover:brightness-90 border border-black/10 flex items-center justify-center group transition-all"
              >
                <Minus className="w-2 h-2 text-[#5E4100] opacity-0 group-hover:opacity-100" strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                title={expanded ? 'Tamanho padrão' : 'Expandir janela'}
                aria-label={expanded ? 'Tamanho padrão' : 'Expandir janela'}
                className="w-3.5 h-3.5 rounded-full bg-[#28C840] hover:brightness-90 border border-black/10 flex items-center justify-center group transition-all"
              >
                {expanded ? (
                  <Minimize2 className="w-2 h-2 text-[#0B4713] opacity-0 group-hover:opacity-100" strokeWidth={2.5} />
                ) : (
                  <Maximize2 className="w-2 h-2 text-[#0B4713] opacity-0 group-hover:opacity-100" strokeWidth={2.5} />
                )}
              </button>
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              {icon && (
                <div className="w-7 h-7 rounded-xl bg-white/90 border border-[#2F1534]/10 flex items-center justify-center shrink-0 shadow-xs">
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-sm sm:text-[15px] font-semibold text-[#2F1534] truncate leading-tight">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-[11px] text-[#232122]/55 truncate leading-tight mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Fechar"
              className="w-8 h-8 rounded-xl hover:bg-[#2F1534]/6 text-[#232122]/60 hover:text-[#2F1534] flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Window Body (solid readable surface inside) */}
        <div className="flex-1 overflow-y-auto bg-white/95 relative">
          {children}

          {confirmDiscard && (
            <div className="absolute inset-0 z-20 bg-[#2F1534]/30 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="aumi-mac-window max-w-sm w-full rounded-2xl p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[#2F1534]">Alterações não salvas</h3>
                    <p className="text-xs text-[#232122]/65 mt-1">
                      Você tem edições em andamento nesta janela. Deseja descartar e fechar mesmo assim?
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="px-3.5 py-2 rounded-xl border border-black/10 text-xs font-medium text-[#232122] hover:bg-black/5 whitespace-nowrap"
                  >
                    Continuar editando
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDiscard(false);
                      onClose();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-medium hover:bg-[#d11f6f] whitespace-nowrap"
                  >
                    Descartar e fechar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {footer && (
          <div className="px-4 sm:px-5 py-3 bg-[#FCF6EC]/70 border-t border-[#2F1534]/[0.07] shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
