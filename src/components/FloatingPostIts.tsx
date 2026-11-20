import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Palette, PenLine, Save, StickyNote, Trash2 } from 'lucide-react';
import { api, getAuthToken } from '../lib/api.ts';
import { playConfirmClick } from '../lib/sounds.ts';
import { PartnerKey, StudioPostIt, User } from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';

interface FloatingPostItsProps {
  user: User;
  initialPostIts?: StudioPostIt[];
  openRequest?: { ownerKey: PartnerKey; nonce: number } | null;
  onNoteMutated?: () => void;
}

const PAPER_SWATCHES: Array<{ label: string; hex: string; tape: string; border: string }> = [
  { label: 'Branco papel', hex: '#FFFFFF', tape: 'rgba(236, 151, 183, 0.62)', border: '#DDD1E8' },
  { label: 'Rosa suave', hex: '#FCE6F0', tape: 'rgba(244, 189, 214, 0.72)', border: '#ECC3D7' },
  { label: 'Lilás suave', hex: '#F1E8FC', tape: 'rgba(209, 189, 240, 0.72)', border: '#D8C3F2' },
  { label: 'Verde paleta', hex: '#F4F5D8', tape: 'rgba(200, 201, 120, 0.62)', border: '#D7D893' },
  { label: 'Creme papel', hex: '#FCF5E3', tape: 'rgba(235, 215, 174, 0.72)', border: '#E8D9B5' },
  { label: 'Pêssego suave', hex: '#FCECE3', tape: 'rgba(241, 198, 176, 0.72)', border: '#EBC8B6' },
  { label: 'Lavanda clara', hex: '#EAE4FA', tape: 'rgba(198, 184, 238, 0.72)', border: '#CFC1EE' },
];

// Delicate SVG paper grain texture (embedded, zero network dependency)
const PAPER_GRAIN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.065'/%3E%3C/svg%3E")`;

/**
 * Gracefully converts legacy rich-text HTML or plain text into clean newline-preserved text
 * so any previously saved notes render cleanly on the stationery sheets.
 */
function htmlToPlainText(raw: string): string {
  if (!raw) return '';
  if (!/[<>]/.test(raw) && !raw.includes('&')) return raw.trim();
  const normalized = raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  if (typeof document !== 'undefined') {
    const decoder = document.createElement('textarea');
    decoder.innerHTML = normalized;
    return decoder.value.replace(/\n{3,}/g, '\n\n').trim();
  }
  return normalized
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatPostItDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function isDarkHex(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.52;
}

function getPaperInkColor(hex: string): string {
  return isDarkHex(hex) ? '#FFFDFC' : '#351B3D';
}

function getTapeColorForBg(hex: string): string {
  const match = PAPER_SWATCHES.find((s) => s.hex.toLowerCase() === hex.toLowerCase());
  if (match) return match.tape;
  return 'rgba(255, 252, 245, 0.7)';
}

function getPostItTitle(ownerKey: PartnerKey): string {
  return ownerKey === 'ingrid' ? 'Post-it 1' : 'Post-it 2';
}

function getDefaultBg(ownerKey: PartnerKey): string {
  return ownerKey === 'ingrid' ? '#FFFFFF' : '#F1E8FC';
}

export function FloatingPostIts({
  user,
  initialPostIts,
  openRequest,
  onNoteMutated,
}: FloatingPostItsProps) {
  const [postits, setPostits] = useState<StudioPostIt[]>(() =>
    Array.isArray(initialPostIts) ? initialPostIts : []
  );
  const [editingKey, setEditingKey] = useState<PartnerKey | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftColor, setDraftColor] = useState('#FFFFFF');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<PartnerKey | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastHandledNonceRef = useRef<number>(0);

  const fetchPostIts = useCallback(async () => {
    try {
      const res = await api<{ postits: StudioPostIt[] }>('/studio-postits', {
        cache: 'no-store',
      });
      if (Array.isArray(res.postits) && res.postits.length > 0) {
        setPostits(res.postits);
      }
    } catch {
      // Keep current state silently on transient errors
    }
  }, []);

  useEffect(() => {
    fetchPostIts();

    const token = getAuthToken();
    let es: EventSource | null = null;
    if (token && typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('studio', (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { type?: string };
          if (payload.type === 'postit_updated') {
            fetchPostIts();
          }
        } catch {
          // ignore
        }
      });
    }

    return () => {
      es?.close();
    };
  }, [fetchPostIts]);

  const resolvedPair = useMemo<[StudioPostIt, StudioPostIt]>(() => {
    const byKey = new Map(postits.map((p) => [p.owner_key, p]));

    const firstRaw = byKey.get('ingrid');
    const secondRaw = byKey.get('mariana');

    const first: StudioPostIt = firstRaw
      ? {
          ...firstRaw,
          bg_color:
            !firstRaw.bg_color || firstRaw.bg_color === '#FCF6EC' || firstRaw.bg_color === '#FDEBF3'
              ? '#FFFFFF'
              : firstRaw.bg_color,
        }
      : {
          owner_key: 'ingrid',
          owner_user_id: 'user-ingrid',
          owner_name: 'Post-it 1',
          owner_avatar: null,
          bg_color: '#FFFFFF',
          text_html: '',
          strokes: [],
          updated_by: user.name,
          updated_at: '',
        };

    const second: StudioPostIt = secondRaw
      ? {
          ...secondRaw,
          bg_color:
            !secondRaw.bg_color || secondRaw.bg_color === '#FCF6EC' || secondRaw.bg_color === '#F3EBFC'
              ? '#F1E8FC'
              : secondRaw.bg_color,
        }
      : {
          owner_key: 'mariana',
          owner_user_id: 'user-mariana',
          owner_name: 'Post-it 2',
          owner_avatar: null,
          bg_color: '#F1E8FC',
          text_html: '',
          strokes: [],
          updated_by: user.name,
          updated_at: '',
        };

    return [first, second];
  }, [postits, user.name]);

  const openEditorFor = useCallback(
    (ownerKey: PartnerKey) => {
      const target = resolvedPair.find((p) => p.owner_key === ownerKey);
      setEditingKey(ownerKey);
      setDraftText(htmlToPlainText(target?.text_html || ''));
      setDraftColor(target?.bg_color || getDefaultBg(ownerKey));
      setConfirmClear(false);
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
    },
    [resolvedPair]
  );

  // React to notification clicks from Central de Notificações
  useEffect(() => {
    if (!openRequest || openRequest.nonce === lastHandledNonceRef.current) return;
    lastHandledNonceRef.current = openRequest.nonce;
    setHighlightedKey(openRequest.ownerKey);
    stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    openEditorFor(openRequest.ownerKey);
    const timer = window.setTimeout(() => setHighlightedKey(null), 2200);
    return () => window.clearTimeout(timer);
  }, [openRequest, openEditorFor]);

  const editingPostIt = editingKey
    ? resolvedPair.find((p) => p.owner_key === editingKey) || null
    : null;

  const originalPlain = editingPostIt ? htmlToPlainText(editingPostIt.text_html) : '';
  const originalColor = editingPostIt?.bg_color || (editingKey ? getDefaultBg(editingKey) : '#FFFFFF');
  const isDirty = Boolean(
    editingKey && (draftText.trim() !== originalPlain || draftColor.toLowerCase() !== originalColor.toLowerCase())
  );

  async function handleSave() {
    if (!editingKey || saving) return;
    setSaving(true);
    try {
      const res = await api<{ postit?: StudioPostIt }>(`/studio-postits/${editingKey}`, {
        method: 'PUT',
        body: JSON.stringify({
          bg_color: draftColor,
          text_html: draftText.trim(),
          strokes: [],
        }),
      });
      if (res.postit) {
        setPostits((prev) => {
          const exists = prev.some((p) => p.owner_key === editingKey);
          return exists
            ? prev.map((p) => (p.owner_key === editingKey ? res.postit! : p))
            : [...prev, res.postit!];
        });
      } else {
        await fetchPostIts();
      }
      playConfirmClick(user.preferences);
      setEditingKey(null);
      setConfirmClear(false);
      onNoteMutated?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteNote() {
    if (!editingKey || deleting) return;
    if (originalPlain.length > 0 && !confirmClear) {
      setConfirmClear(true);
      return;
    }
    setDeleting(true);
    try {
      const res = await api<{ ok: boolean; postit?: StudioPostIt }>(`/studio-postits/${editingKey}`, {
        method: 'DELETE',
      });
      if (res.postit) {
        setPostits((prev) => {
          const exists = prev.some((p) => p.owner_key === editingKey);
          return exists
            ? prev.map((p) => (p.owner_key === editingKey ? res.postit! : p))
            : [...prev, res.postit!];
        });
      } else {
        await fetchPostIts();
      }
      playConfirmClick(user.preferences);
      setDraftText('');
      setConfirmClear(false);
      setEditingKey(null);
      onNoteMutated?.();
    } finally {
      setDeleting(false);
    }
  }

  const [paperOne, paperTwo] = resolvedPair;
  const noteOne = htmlToPlainText(paperOne.text_html);
  const noteTwo = htmlToPlainText(paperTwo.text_html);
  const inkOne = getPaperInkColor(paperOne.bg_color);
  const inkTwo = getPaperInkColor(paperTwo.bg_color);
  const editorInk = getPaperInkColor(draftColor);

  return (
    <>
      {/* Bare, independent floating stage directly over the dashboard background (NO card, NO box, NO container) */}
      <div
        ref={stageRef}
        className="relative w-full h-full min-h-[380px] sm:min-h-[430px] flex items-center justify-center py-6 px-0 sm:px-1 overflow-visible select-none"
        aria-label="Anotações em post-its"
      >
        <div className="relative flex items-start justify-center w-full max-w-[590px]">
          {/* POST-IT 1 — Rosa Suave (esquerda superior, levemente inclinado para a esquerda) */}
          <button
            id="postit-ingrid"
            type="button"
            onClick={() => openEditorFor('ingrid')}
            style={{
              backgroundColor: paperOne.bg_color,
              backgroundImage: `${PAPER_GRAIN_BG}, repeating-linear-gradient(180deg, transparent 0px, transparent 30px, rgba(122,104,156,0.095) 31px), linear-gradient(155deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.04) 44%, rgba(47,21,52,0.045) 100%)`,
              color: inkOne,
              border:
                paperOne.bg_color.toLowerCase() === '#ffffff'
                  ? '1px solid rgba(47,21,52,0.11)'
                  : '1px solid rgba(47,21,52,0.07)',
              boxShadow:
                highlightedKey === 'ingrid'
                  ? '0 0 0 3px rgba(236,43,130,0.45), 0 24px 38px -14px rgba(47,21,52,0.34), 0 8px 16px -6px rgba(47,21,52,0.18)'
                  : '0 24px 38px -15px rgba(47,21,52,0.28), 0 9px 18px -6px rgba(47,21,52,0.15), 0 1px 3px rgba(47,21,52,0.09)',
            }}
            className="group relative z-10 hover:z-30 w-[58%] sm:w-[272px] xl:w-[292px] min-h-[296px] sm:min-h-[328px] -rotate-[3deg] hover:-rotate-[1.5deg] hover:-translate-y-2 hover:scale-[1.02] transition-all duration-300 ease-out text-left px-6 pt-8 pb-5 rounded-[3px] rounded-br-[20px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EC2B82]"
          >
            {/* Realistic curled bottom-right corner shadow lift */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-1.5 right-3 w-28 h-5 rounded-full bg-[#2F1534]/22 blur-[6px] rotate-[5deg] -z-10"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 w-8 h-8 rounded-tl-[11px]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(47,21,52,0.07) 0%, rgba(255,255,255,0.45) 55%, rgba(255,255,255,0.72) 100%)',
                clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
              }}
            />

            {/* Decorative translucent washi tape at top center */}
            <span
              aria-hidden="true"
              style={{
                backgroundColor: getTapeColorForBg(paperOne.bg_color),
                backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.4) 100%)',
                boxShadow: '0 2px 5px -2px rgba(47,21,52,0.18)',
              }}
              className="pointer-events-none absolute -top-3.5 left-1/2 -translate-x-1/2 w-[88px] h-[24px] rotate-[2.2deg] rounded-[2px] backdrop-blur-[1px] border-x border-white/45"
            />

            {/* Top stationery header */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-55">
                Post-it 1
              </span>
              {/* Subtle hand-drawn four-point star */}
              <svg
                aria-hidden="true"
                viewBox="0 0 18 18"
                className="w-4 h-4 opacity-45 group-hover:opacity-80 transition-opacity"
                fill="none"
              >
                <path
                  d="M9 1.5C9.4 5.5 12.5 8.6 16.5 9C12.5 9.4 9.4 12.5 9 16.5C8.6 12.5 5.5 9.4 1.5 9C5.5 8.6 8.6 5.5 9 1.5Z"
                  fill="currentColor"
                />
              </svg>
            </div>

            {/* Handwritten note content */}
            <div
              style={{ fontFamily: "'Caveat', cursive" }}
              className="min-h-[205px] sm:min-h-[228px] text-[24px] sm:text-[26px] leading-[1.24] whitespace-pre-wrap break-words line-clamp-8"
            >
              {noteOne ? (
                <span>{noteOne}</span>
              ) : (
                <span className="opacity-45">
                  Clique neste papel para anotar lembretes, ideias ou recados rápidos...
                </span>
              )}
            </div>

            {/* Paper footer */}
            <div className="mt-3 pt-2.5 border-t border-current/10 flex items-center justify-between gap-2 text-[10.5px] opacity-55">
              <span className="truncate">
                {noteOne && paperOne.updated_at ? formatPostItDate(paperOne.updated_at) : 'Papel livre'}
              </span>
              <span className="inline-flex items-center gap-1 font-medium opacity-75 group-hover:opacity-100 transition-opacity">
                <PenLine className="w-3 h-3" />
                <span>Editar</span>
              </span>
            </div>
          </button>

          {/* POST-IT 2 — Lilás Suave (direita inferior, levemente sobreposto ao primeiro, inclinação oposta) */}
          <button
            id="postit-mariana"
            type="button"
            onClick={() => openEditorFor('mariana')}
            style={{
              backgroundColor: paperTwo.bg_color,
              backgroundImage: `${PAPER_GRAIN_BG}, repeating-linear-gradient(180deg, transparent 0px, transparent 30px, rgba(122,104,156,0.09) 31px), linear-gradient(155deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.06) 44%, rgba(47,21,52,0.05) 100%)`,
              color: inkTwo,
              border:
                paperTwo.bg_color.toLowerCase() === '#ffffff'
                  ? '1px solid rgba(47,21,52,0.11)'
                  : '1px solid rgba(47,21,52,0.07)',
              boxShadow:
                highlightedKey === 'mariana'
                  ? '0 0 0 3px rgba(122,104,156,0.55), 0 26px 40px -14px rgba(47,21,52,0.34), 0 8px 16px -6px rgba(47,21,52,0.18)'
                  : '0 26px 38px -15px rgba(47,21,52,0.3), 0 10px 18px -6px rgba(47,21,52,0.16), 0 1px 3px rgba(47,21,52,0.09)',
            }}
            className="group relative z-20 hover:z-30 -ml-10 sm:-ml-12 xl:-ml-14 mt-10 sm:mt-14 w-[58%] sm:w-[272px] xl:w-[292px] min-h-[296px] sm:min-h-[328px] rotate-[2.7deg] hover:rotate-[1.2deg] hover:-translate-y-2 hover:scale-[1.02] transition-all duration-300 ease-out text-left px-6 pt-8 pb-5 rounded-[3px] rounded-br-[20px] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7A689C]"
          >
            {/* Realistic curled bottom-right corner shadow lift */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-1.5 right-3 w-28 h-5 rounded-full bg-[#2F1534]/22 blur-[6px] rotate-[4deg] -z-10"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 w-8 h-8 rounded-tl-[11px]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(47,21,52,0.07) 0%, rgba(255,255,255,0.45) 55%, rgba(255,255,255,0.72) 100%)',
                clipPath: 'polygon(100% 0, 0 100%, 100% 100%)',
              }}
            />

            {/* Dainty angled washi mini-tape on top-left corner */}
            <span
              aria-hidden="true"
              style={{
                backgroundColor: getTapeColorForBg(paperTwo.bg_color),
                backgroundImage:
                  'linear-gradient(90deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.36) 100%)',
                boxShadow: '0 2px 5px -2px rgba(47,21,52,0.16)',
              }}
              className="pointer-events-none absolute -top-3 left-6 w-[62px] h-[20px] -rotate-[12deg] rounded-[2px] border-x border-white/40"
            />

            {/* Realistic metallic decorative paperclip on top-right edge */}
            <svg
              aria-hidden="true"
              viewBox="0 0 28 54"
              fill="none"
              className="pointer-events-none absolute -top-4.5 right-6 w-[24px] h-[46px] rotate-[6deg] drop-shadow-[0_3px_3px_rgba(47,21,52,0.22)]"
            >
              <path
                d="M19.5 14V37C19.5 41.7 15.9 45.5 11.4 45.5C6.9 45.5 3.3 41.7 3.3 37V11.5C3.3 6.2 7.5 2 12.8 2C18.1 2 22.3 6.2 22.3 11.5V34.5C22.3 37.3 20.1 39.5 17.3 39.5C14.5 39.5 12.3 37.3 12.3 34.5V15.5"
                stroke="#7A689C"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M19.5 14V37C19.5 41.7 15.9 45.5 11.4 45.5C6.9 45.5 3.3 41.7 3.3 37V11.5C3.3 6.2 7.5 2 12.8 2C18.1 2 22.3 6.2 22.3 11.5V34.5C22.3 37.3 20.1 39.5 17.3 39.5C14.5 39.5 12.3 37.3 12.3 34.5V15.5"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
            </svg>

            {/* Top stationery header */}
            <div className="flex items-center justify-between gap-2 mb-3 pr-7">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-55">
                Post-it 2
              </span>
            </div>

            {/* Handwritten note content */}
            <div
              style={{ fontFamily: "'Caveat', cursive" }}
              className="min-h-[205px] sm:min-h-[228px] text-[24px] sm:text-[26px] leading-[1.24] whitespace-pre-wrap break-words line-clamp-8"
            >
              {noteTwo ? (
                <span>{noteTwo}</span>
              ) : (
                <span className="opacity-45">
                  Espaço livre para anotações do dia, prioridades ou recados do estúdio...
                </span>
              )}
            </div>

            {/* Paper footer */}
            <div className="mt-3 pt-2.5 border-t border-current/10 flex items-center justify-between gap-2 text-[10.5px] opacity-55">
              <span className="truncate">
                {noteTwo && paperTwo.updated_at ? formatPostItDate(paperTwo.updated_at) : 'Papel livre'}
              </span>
              <span className="inline-flex items-center gap-1 font-medium opacity-75 group-hover:opacity-100 transition-opacity">
                <PenLine className="w-3 h-3" />
                <span>Editar</span>
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Individual Post-it Edit Modal (Aumi Studio MacWindow) */}
      <MacWindow
        open={Boolean(editingKey)}
        title={editingKey ? `Editar ${getPostItTitle(editingKey)}` : 'Editar Post-it'}
        subtitle={
          editingPostIt?.updated_at && originalPlain
            ? `Última atualização por ${editingPostIt.updated_by || user.name} · ${formatPostItDate(
                editingPostIt.updated_at
              )}`
            : 'Escreva sua anotação e escolha a cor do papel'
        }
        icon={<StickyNote className="w-4 h-4 text-[#7A689C]" />}
        isDirty={isDirty}
        maxWidthClass="max-w-lg"
        onClose={() => {
          setEditingKey(null);
          setConfirmClear(false);
        }}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              {originalPlain.length > 0 ? (
                confirmClear ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDeleteNote}
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{deleting ? 'Excluindo...' : 'Confirmar exclusão'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-[#2F1534]/70 hover:bg-black/5"
                    >
                      Voltar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDeleteNote}
                    className="px-3 py-1.5 rounded-xl border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir anotação</span>
                  </button>
                )
              ) : (
                <span className="text-[11px] text-[#7A689C]">
                  Salvo automaticamente no painel inicial
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingKey(null);
                  setConfirmClear(false);
                }}
                className="px-3.5 py-2 rounded-xl border border-[#2F1534]/12 bg-white hover:bg-black/[0.03] text-xs font-semibold text-[#2F1534]/80 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-[#7A689C] hover:bg-[#665489] disabled:opacity-55 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Salvando...' : 'Salvar alterações'}</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="p-5 space-y-5">
          {/* Paper Sheet Editor Preview */}
          <div className="space-y-2">
            <label
              htmlFor="floating-postit-textarea"
              className="block text-xs font-semibold text-[#2F1534]"
            >
              Conteúdo da anotação
            </label>
            <div
              style={{
                backgroundColor: draftColor,
                backgroundImage: `${PAPER_GRAIN_BG}, repeating-linear-gradient(180deg, transparent 0px, transparent 31px, rgba(53,27,61,0.06) 32px)`,
                boxShadow: '0 14px 28px -18px rgba(47,21,52,0.28), inset 0 1px 0 rgba(255,255,255,0.65)',
              }}
              className="relative rounded-2xl border border-[#2F1534]/10 p-4 transition-colors"
            >
              <textarea
                id="floating-postit-textarea"
                ref={textareaRef}
                rows={7}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Escreva aqui sua anotação, lembrete ou recado rápido..."
                style={{
                  fontFamily: "'Caveat', cursive",
                  color: editorInk,
                }}
                className="w-full bg-transparent resize-none focus:outline-none text-[24px] leading-[1.33] placeholder:opacity-45"
              />
              <div
                style={{ color: editorInk }}
                className="mt-1 flex items-center justify-between text-[11px] opacity-55 tabular-nums"
              >
                <span>Fonte manuscrita no papel</span>
                <span>{draftText.length} caracteres</span>
              </div>
            </div>
          </div>

          {/* Paper Color Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F1534]">
                <Palette className="w-3.5 h-3.5 text-[#7A689C]" />
                Cor do papel
              </span>
              <span className="text-[11px] font-medium text-[#7A689C] uppercase tabular-nums">
                {draftColor}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {PAPER_SWATCHES.map((swatch) => {
                const selected = draftColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => setDraftColor(swatch.hex)}
                    title={swatch.label}
                    className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                      selected
                        ? 'border-[#7A689C] bg-[#F5EFFC] text-[#2F1534] shadow-xs'
                        : 'border-[#2F1534]/10 bg-white text-[#2F1534]/75 hover:border-[#7A689C]/50'
                    }`}
                  >
                    <span
                      style={{ backgroundColor: swatch.hex, borderColor: swatch.border }}
                      className="w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0"
                    >
                      {selected && <Check className="w-2.5 h-2.5 text-[#2F1534]" strokeWidth={3} />}
                    </span>
                    <span>{swatch.label}</span>
                  </button>
                );
              })}

              {/* Manual custom color picker */}
              <label
                title="Escolher outra cor"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-dashed border-[#7A689C]/45 bg-white hover:bg-[#F5EFFC] text-xs font-medium text-[#7A689C] cursor-pointer transition-colors"
              >
                <input
                  type="color"
                  value={draftColor}
                  onChange={(e) => setDraftColor(e.target.value)}
                  className="w-4 h-4 rounded border-0 bg-transparent cursor-pointer p-0"
                />
                <span>Outra cor</span>
              </label>
            </div>
          </div>
        </div>
      </MacWindow>
    </>
  );
}
