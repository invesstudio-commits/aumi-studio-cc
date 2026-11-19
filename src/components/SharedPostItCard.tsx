import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Check,
  Eraser,
  Highlighter,
  Italic,
  List,
  Lock,
  PenTool,
  Redo2,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import { playConfirmClick } from '../lib/sounds.ts';
import { PostItStroke, StudioPostIt, UserPreferences } from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';

const PAPER_COLORS: Array<{ hex: string; border: string; label: string }> = [
  { hex: '#FDEBF3', border: '#F2C7DC', label: 'Rosa Blush' },
  { hex: '#F3EBFC', border: '#DBC6F5', label: 'Lilás Suave' },
  { hex: '#FCF6EC', border: '#EBDCC2', label: 'Creme Aumi' },
  { hex: '#FDF0E6', border: '#F2CDB5', label: 'Pêssego' },
  { hex: '#F1F6E4', border: '#CFE0AC', label: 'Verde Oliva' },
  { hex: '#FEF7D6', border: '#EDE09F', label: 'Amarelo Suave' },
];

const INK_COLORS: Array<{ hex: string; label: string }> = [
  { hex: '#2F1534', label: 'Ameixa' },
  { hex: '#EC2B82', label: 'Rosa Aumi' },
  { hex: '#7A689C', label: 'Roxo Aumi' },
  { hex: '#E1754C', label: 'Laranja' },
  { hex: '#5B8A3C', label: 'Verde' },
  { hex: '#232122', label: 'Grafite' },
];

const STROKE_SIZES: Array<{ value: number; label: string; dot: string }> = [
  { value: 2.5, label: 'Fino', dot: 'w-1.5 h-1.5' },
  { value: 5, label: 'Médio', dot: 'w-2.5 h-2.5' },
  { value: 9, label: 'Grosso', dot: 'w-3.5 h-3.5' },
];

interface PostItSnapshot {
  bg_color: string;
  text_html: string;
  strokes: PostItStroke[];
}

interface SharedPostItCardProps {
  postit: StudioPostIt;
  isEditable: boolean;
  isHighlighted?: boolean;
  userPrefs?: Partial<UserPreferences>;
  onSaved?: (updated: StudioPostIt) => void;
}

function formatSavedClock(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function sanitizePostItHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

function drawStrokesOnCanvas(
  canvas: HTMLCanvasElement,
  strokes: PostItStroke[],
  activeStroke: PostItStroke | null
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes;

  for (const stroke of allStrokes) {
    if (!stroke.points || stroke.points.length === 0) continue;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = Math.max(stroke.size * 3.2, 12);
    } else if (stroke.tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = stroke.color || '#EC2B82';
      ctx.lineWidth = Math.max(stroke.size * 3.2, 12);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = stroke.color || '#2F1534';
      ctx.lineWidth = stroke.size || 3;
    }

    const pts = stroke.points.map(([nx, ny]) => [nx * rect.width, ny * rect.height] as const);

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.tool === 'eraser' ? 'rgba(0,0,0,1)' : ctx.strokeStyle;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i][0] + pts[i + 1][0]) / 2;
        const midY = (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0], last[1]);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
}

export function SharedPostItCard({
  postit,
  isEditable,
  isHighlighted = false,
  userPrefs,
  onSaved,
}: SharedPostItCardProps) {
  const [mode, setMode] = useState<'text' | 'draw'>('text');
  const [bgColor, setBgColor] = useState(postit.bg_color || '#FCF6EC');
  const [textHtml, setTextHtml] = useState(postit.text_html || '');
  const [strokes, setStrokes] = useState<PostItStroke[]>(postit.strokes || []);

  // Drawing controls
  const [drawTool, setDrawTool] = useState<'pen' | 'highlighter' | 'eraser'>('pen');
  const [inkColor, setInkColor] = useState('#2F1534');
  const [strokeSize, setStrokeSize] = useState<number>(4);

  // History for Undo / Redo (covers both text, color & strokes)
  const [history, setHistory] = useState<PostItSnapshot[]>([
    {
      bg_color: postit.bg_color || '#FCF6EC',
      text_html: postit.text_html || '',
      strokes: postit.strokes || [],
    },
  ]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Autosave state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedAt, setSavedAt] = useState<string>(postit.updated_at);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  const activeStrokeRef = useRef<PostItStroke | null>(null);
  const isDrawingRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const textHistoryTimerRef = useRef<number | null>(null);
  const localDirtyUntilRef = useRef<number>(0);

  // Latest values ref for safe debounced autosave
  const latestRef = useRef<PostItSnapshot>({
    bg_color: bgColor,
    text_html: textHtml,
    strokes,
  });
  latestRef.current = { bg_color: bgColor, text_html: textHtml, strokes };

  // Sync editor DOM initially and when remote updates arrive
  useEffect(() => {
    const isLocallyDirty = Date.now() < localDirtyUntilRef.current;
    if (isEditable && isLocallyDirty) return;

    setBgColor(postit.bg_color || '#FCF6EC');
    setTextHtml(postit.text_html || '');
    setStrokes(postit.strokes || []);
    setSavedAt(postit.updated_at);

    if (editorRef.current && editorRef.current.innerHTML !== (postit.text_html || '')) {
      editorRef.current.innerHTML = sanitizePostItHtml(postit.text_html || '');
    }

    if (!isEditable) {
      setHistory([
        {
          bg_color: postit.bg_color || '#FCF6EC',
          text_html: postit.text_html || '',
          strokes: postit.strokes || [],
        },
      ]);
      setHistoryIdx(0);
    }
  }, [postit.bg_color, postit.text_html, postit.strokes, postit.updated_at, isEditable]);

  // Mount initial HTML into editable div once
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && postit.text_html) {
      editorRef.current.innerHTML = sanitizePostItHtml(postit.text_html);
    }
  }, []);

  // Re-render canvas strokes whenever strokes change or container resizes
  const redrawCanvas = useCallback(() => {
    if (!canvasRef.current) return;
    drawStrokesOnCanvas(canvasRef.current, strokes, activeStrokeRef.current);
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  useEffect(() => {
    const target = sheetRef.current;
    if (!target) return;
    const observer = new ResizeObserver(() => {
      redrawCanvas();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [redrawCanvas]);

  // Clean up timers
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (textHistoryTimerRef.current) window.clearTimeout(textHistoryTimerRef.current);
    };
  }, []);

  const persistNow = useCallback(
    async (snapshot: PostItSnapshot) => {
      if (!isEditable) return;
      setSaveState('saving');
      try {
        const res = await api<{ postit: StudioPostIt }>(`/studio-postits/${postit.owner_key}`, {
          method: 'PUT',
          body: JSON.stringify({
            bg_color: snapshot.bg_color,
            text_html: sanitizePostItHtml(snapshot.text_html),
            strokes: snapshot.strokes,
          }),
        });
        setSaveState('saved');
        setSavedAt(res.postit?.updated_at || new Date().toISOString());
        if (res.postit && onSaved) {
          onSaved(res.postit);
        }
      } catch {
        setSaveState('idle');
      }
    },
    [isEditable, onSaved, postit.owner_key]
  );

  const scheduleAutosave = useCallback(
    (snapshot: PostItSnapshot, delayMs = 600) => {
      if (!isEditable) return;
      localDirtyUntilRef.current = Date.now() + Math.max(delayMs + 1200, 1800);
      setSaveState('saving');
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        persistNow(snapshot);
      }, delayMs);
    },
    [isEditable, persistNow]
  );

  const pushHistory = useCallback(
    (snapshot: PostItSnapshot) => {
      setHistory((prev) => {
        const truncated = prev.slice(0, historyIdx + 1);
        const next = [...truncated, snapshot].slice(-45);
        setHistoryIdx(next.length - 1);
        return next;
      });
    },
    [historyIdx]
  );

  const applySnapshot = useCallback(
    (snap: PostItSnapshot) => {
      setBgColor(snap.bg_color);
      setTextHtml(snap.text_html);
      setStrokes(snap.strokes);
      if (editorRef.current && editorRef.current.innerHTML !== snap.text_html) {
        editorRef.current.innerHTML = sanitizePostItHtml(snap.text_html);
      }
      scheduleAutosave(snap, 260);
    },
    [scheduleAutosave]
  );

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!isEditable || historyIdx <= 0) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    applySnapshot(history[nextIdx]);
    playConfirmClick(userPrefs);
  }, [applySnapshot, history, historyIdx, isEditable, userPrefs]);

  const handleRedo = useCallback(() => {
    if (!isEditable || historyIdx >= history.length - 1) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    applySnapshot(history[nextIdx]);
    playConfirmClick(userPrefs);
  }, [applySnapshot, history, historyIdx, isEditable, userPrefs]);

  function handleBgChange(hex: string) {
    if (!isEditable) return;
    const snap: PostItSnapshot = {
      bg_color: hex,
      text_html: latestRef.current.text_html,
      strokes: latestRef.current.strokes,
    };
    setBgColor(hex);
    pushHistory(snap);
    scheduleAutosave(snap, 220);
    playConfirmClick(userPrefs);
  }

  function handleEditorInput() {
    if (!isEditable || !editorRef.current) return;
    const html = sanitizePostItHtml(editorRef.current.innerHTML);
    setTextHtml(html);
    const snap: PostItSnapshot = {
      bg_color: latestRef.current.bg_color,
      text_html: html,
      strokes: latestRef.current.strokes,
    };
    scheduleAutosave(snap, 650);

    if (textHistoryTimerRef.current) window.clearTimeout(textHistoryTimerRef.current);
    textHistoryTimerRef.current = window.setTimeout(() => {
      pushHistory(snap);
    }, 900);
  }

  function execTextCmd(command: string, value?: string) {
    if (!isEditable || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    handleEditorInput();
  }

  // Pointer drawing handlers (normalized 0..1 coordinates for crisp responsiveness)
  function getNormalizedPoint(e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return [Number(nx.toFixed(4)), Number(ny.toFixed(4))];
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isEditable || mode !== 'draw') return;
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    activeStrokeRef.current = {
      id: `stk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tool: drawTool,
      color: inkColor,
      size: strokeSize,
      points: [pt],
    };
    if (canvasRef.current) {
      drawStrokesOnCanvas(canvasRef.current, strokes, activeStrokeRef.current);
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    e.preventDefault();
    const pt = getNormalizedPoint(e);
    if (!pt) return;
    const prevPts = activeStrokeRef.current.points;
    const last = prevPts[prevPts.length - 1];
    // Skip microscopic jitter (< 0.15% movement)
    if (last && Math.hypot(pt[0] - last[0], pt[1] - last[1]) < 0.0015) return;
    prevPts.push(pt);
    if (canvasRef.current) {
      drawStrokesOnCanvas(canvasRef.current, strokes, activeStrokeRef.current);
    }
  }

  function finishStroke(e?: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current || !activeStrokeRef.current) return;
    isDrawingRef.current = false;
    if (e && canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId);
    }
    const finished = activeStrokeRef.current;
    activeStrokeRef.current = null;
    const nextStrokes = [...strokes, finished];
    setStrokes(nextStrokes);
    const snap: PostItSnapshot = {
      bg_color: latestRef.current.bg_color,
      text_html: latestRef.current.text_html,
      strokes: nextStrokes,
    };
    pushHistory(snap);
    scheduleAutosave(snap, 260);
  }

  function handleClearDrawings() {
    if (!isEditable || strokes.length === 0) return;
    const snap: PostItSnapshot = {
      bg_color: latestRef.current.bg_color,
      text_html: latestRef.current.text_html,
      strokes: [],
    };
    setStrokes([]);
    pushHistory(snap);
    scheduleAutosave(snap, 220);
    playConfirmClick(userPrefs);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isEditable) return;
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;
    if (e.key.toLowerCase() === 'z' && !e.shiftKey && mode === 'draw') {
      e.preventDefault();
      handleUndo();
    } else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || (e.key.toLowerCase() === 'y' && mode === 'draw')) {
      e.preventDefault();
      handleRedo();
    }
  }

  const paperMeta = PAPER_COLORS.find((c) => c.hex === bgColor) || PAPER_COLORS[0];
  const isIngridPostIt = postit.owner_key === 'ingrid';

  return (
    <div
      id={`postit-${postit.owner_key}`}
      onKeyDown={handleKeyDown}
      style={{
        backgroundColor: bgColor,
        borderColor: isHighlighted ? '#EC2B82' : paperMeta.border,
      }}
      className={`relative rounded-[26px] border transition-all duration-200 flex flex-col overflow-hidden shadow-[0_14px_34px_-18px_rgba(47,21,52,0.18)] ${
        isHighlighted ? 'ring-2 ring-[#EC2B82]/35' : ''
      }`}
    >
      {/* Subtle folded paper corner highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 w-10 h-10"
        style={{
          background:
            'linear-gradient(225deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.65) 48%, rgba(47,21,52,0.06) 50%, transparent 56%)',
        }}
      />

      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-2.5 border-b border-[#2F1534]/[0.07]">
        <div className="flex items-center gap-3 min-w-0">
          <PartnerAvatar
            name={postit.owner_name}
            partnerKey={postit.owner_key}
            avatarUrl={postit.owner_avatar}
            size="md"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-[15px] font-bold text-[#2F1534] truncate">
                Post-it de {postit.owner_name}
              </h4>
            </div>
            <p className="text-[11.5px] text-[#2F1534]/60 flex items-center gap-1.5">
              {isEditable ? (
                <>
                  <span>Seu espaço editável</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums inline-flex items-center gap-1">
                    {saveState === 'saving' ? (
                      'Salvando...'
                    ) : (
                      <>
                        <Check className="w-3 h-3 text-[#4B7A2C]" />
                        {savedAt ? `Salvo às ${formatSavedClock(savedAt)}` : 'Salvamento automático'}
                      </>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-[#7A689C]" />
                  <span>Somente visualização</span>
                  {savedAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">atualizado às {formatSavedClock(savedAt)}</span>
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Mode toggle + Paper Color dots (only for owner) */}
        {isEditable && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Paper swatches */}
            <div className="flex items-center gap-1.5" aria-label="Cor do post-it">
              {PAPER_COLORS.map((c) => {
                const active = bgColor === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={`Cor do papel: ${c.label}`}
                    onClick={() => handleBgChange(c.hex)}
                    style={{ backgroundColor: c.hex, borderColor: active ? '#2F1534' : c.border }}
                    className={`w-5 h-5 rounded-full border transition-transform ${
                      active ? 'scale-115 ring-2 ring-white shadow-xs' : 'hover:scale-110'
                    }`}
                  />
                );
              })}
            </div>

            {/* Segmented Mode Control: Texto vs Desenho */}
            <div className="inline-flex items-center p-0.5 rounded-xl bg-white/75 border border-[#2F1534]/10">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`px-2.5 py-1 rounded-[10px] text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  mode === 'text'
                    ? isIngridPostIt
                      ? 'bg-[#EC2B82] text-white shadow-xs'
                      : 'bg-[#7A689C] text-white shadow-xs'
                    : 'text-[#2F1534]/70 hover:text-[#2F1534]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Texto</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('draw')}
                className={`px-2.5 py-1 rounded-[10px] text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  mode === 'draw'
                    ? isIngridPostIt
                      ? 'bg-[#EC2B82] text-white shadow-xs'
                      : 'bg-[#7A689C] text-white shadow-xs'
                    : 'text-[#2F1534]/70 hover:text-[#2F1534]'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Desenho</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contextual Formatting / Drawing Toolbar (Owner only) */}
      {isEditable && (
        <div className="px-4 py-2 bg-white/55 border-b border-[#2F1534]/[0.07] flex flex-wrap items-center justify-between gap-2">
          {mode === 'text' ? (
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                title="Negrito"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execTextCmd('bold')}
                className="w-7 h-7 rounded-lg hover:bg-white/90 text-[#2F1534] flex items-center justify-center transition-colors"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Itálico"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execTextCmd('italic')}
                className="w-7 h-7 rounded-lg hover:bg-white/90 text-[#2F1534] flex items-center justify-center transition-colors"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Sublinhado"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execTextCmd('underline')}
                className="w-7 h-7 rounded-lg hover:bg-white/90 text-[#2F1534] flex items-center justify-center transition-colors"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Tachado"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execTextCmd('strikeThrough')}
                className="w-7 h-7 rounded-lg hover:bg-white/90 text-[#2F1534] flex items-center justify-center transition-colors"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Lista com marcadores"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => execTextCmd('insertUnorderedList')}
                className="w-7 h-7 rounded-lg hover:bg-white/90 text-[#2F1534] flex items-center justify-center transition-colors"
              >
                <List className="w-3.5 h-3.5" />
              </button>

              <span className="h-4 w-px bg-[#2F1534]/12 mx-1" />

              {/* Font size shortcuts */}
              {(
                [
                  { size: '2', label: 'P' },
                  { size: '3', label: 'M' },
                  { size: '4', label: 'G' },
                ] as const
              ).map((sz) => (
                <button
                  key={sz.size}
                  type="button"
                  title={`Tamanho ${sz.label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execTextCmd('fontSize', sz.size)}
                  className="px-1.5 h-7 rounded-lg hover:bg-white/90 text-[11px] font-bold text-[#2F1534]/80 transition-colors"
                >
                  {sz.label}
                </button>
              ))}

              <span className="h-4 w-px bg-[#2F1534]/12 mx-1" />

              {/* Text color dots */}
              {INK_COLORS.slice(0, 5).map((ic) => (
                <button
                  key={ic.hex}
                  type="button"
                  title={`Cor do texto: ${ic.label}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execTextCmd('foreColor', ic.hex)}
                  style={{ backgroundColor: ic.hex }}
                  className="w-4 h-4 rounded-full border border-white shadow-xs hover:scale-115 transition-transform mx-0.5"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Drawing Tools: Caneta, Marca-texto, Borracha */}
              <button
                type="button"
                title="Caneta"
                onClick={() => setDrawTool('pen')}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  drawTool === 'pen' ? 'bg-[#2F1534] text-white' : 'text-[#2F1534]/75 hover:bg-white/80'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Caneta</span>
              </button>
              <button
                type="button"
                title="Marca-texto"
                onClick={() => setDrawTool('highlighter')}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  drawTool === 'highlighter' ? 'bg-[#E1754C] text-white' : 'text-[#2F1534]/75 hover:bg-white/80'
                }`}
              >
                <Highlighter className="w-3.5 h-3.5" />
                <span>Marca-texto</span>
              </button>
              <button
                type="button"
                title="Borracha"
                onClick={() => setDrawTool('eraser')}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                  drawTool === 'eraser' ? 'bg-[#EC2B82] text-white' : 'text-[#2F1534]/75 hover:bg-white/80'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>Borracha</span>
              </button>

              <span className="h-4 w-px bg-[#2F1534]/12 mx-0.5" />

              {/* Ink colors */}
              {INK_COLORS.map((ic) => (
                <button
                  key={ic.hex}
                  type="button"
                  title={`Tinta: ${ic.label}`}
                  onClick={() => {
                    setInkColor(ic.hex);
                    if (drawTool === 'eraser') setDrawTool('pen');
                  }}
                  style={{ backgroundColor: ic.hex }}
                  className={`w-4.5 h-4.5 rounded-full border-2 transition-transform ${
                    inkColor === ic.hex && drawTool !== 'eraser'
                      ? 'border-white ring-2 ring-[#2F1534] scale-110'
                      : 'border-white/90 hover:scale-110'
                  }`}
                />
              ))}

              <span className="h-4 w-px bg-[#2F1534]/12 mx-0.5" />

              {/* Stroke sizes */}
              {STROKE_SIZES.map((sz) => (
                <button
                  key={sz.value}
                  type="button"
                  title={`Espessura ${sz.label}`}
                  onClick={() => setStrokeSize(sz.value)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    strokeSize === sz.value ? 'bg-white shadow-xs ring-1 ring-[#2F1534]/20' : 'hover:bg-white/60'
                  }`}
                >
                  <span className={`${sz.dot} rounded-full bg-[#2F1534]`} />
                </button>
              ))}
            </div>
          )}

          {/* Right side: Undo / Redo + Clear Drawing */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              title="Desfazer"
              disabled={!canUndo}
              onClick={handleUndo}
              className="w-7 h-7 rounded-lg hover:bg-white/90 disabled:opacity-35 text-[#2F1534] flex items-center justify-center transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Refazer"
              disabled={!canRedo}
              onClick={handleRedo}
              className="w-7 h-7 rounded-lg hover:bg-white/90 disabled:opacity-35 text-[#2F1534] flex items-center justify-center transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            {mode === 'draw' && strokes.length > 0 && (
              <button
                type="button"
                title="Limpar desenhos deste post-it"
                onClick={handleClearDrawings}
                className="w-7 h-7 rounded-lg hover:bg-red-50 text-[#7A689C] hover:text-red-600 flex items-center justify-center transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Layered Paper Sheet: Rich Text + HiDPI Drawing Canvas */}
      <div
        ref={sheetRef}
        className="relative flex-1 min-h-[300px] sm:min-h-[320px] select-none"
        style={{
          backgroundImage:
            'radial-gradient(rgba(47, 21, 52, 0.055) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {/* Text Layer */}
        {isEditable ? (
          <div
            ref={editorRef}
            contentEditable={mode === 'text'}
            suppressContentEditableWarning
            onInput={handleEditorInput}
            data-placeholder={`Escreva seus recados, lembretes ou ideias aqui, ${postit.owner_name}...`}
            className={`relative z-10 w-full h-full min-h-[300px] sm:min-h-[320px] p-5 text-[14px] leading-relaxed text-[#2F1534] focus:outline-none aumi-copy-prose select-text empty:before:content-[attr(data-placeholder)] empty:before:text-[#2F1534]/38 ${
              mode === 'draw' ? 'pointer-events-none select-none' : ''
            }`}
          />
        ) : (
          <div
            className="relative z-10 w-full h-full min-h-[300px] sm:min-h-[320px] p-5 text-[14px] leading-relaxed text-[#2F1534] aumi-copy-prose select-text"
            dangerouslySetInnerHTML={{
              __html:
                sanitizePostItHtml(textHtml) ||
                `<p style="opacity:0.42">Nenhum recado escrito por ${postit.owner_name} ainda.</p>`,
            }}
          />
        )}

        {/* Freehand Drawing Overlay Canvas */}
        <canvas
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`absolute inset-0 z-20 w-full h-full touch-none ${
            isEditable && mode === 'draw'
              ? drawTool === 'eraser'
                ? 'pointer-events-auto cursor-cell'
                : 'pointer-events-auto cursor-crosshair'
              : 'pointer-events-none'
          }`}
        />

        {/* Subtle bottom mode helper when drawing */}
        {isEditable && mode === 'draw' && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-30 px-2.5 py-1 rounded-lg bg-white/80 text-[11px] font-medium text-[#2F1534]/75 border border-[#2F1534]/10">
            {drawTool === 'eraser'
              ? 'Modo borracha · arraste para apagar traços'
              : 'Desenho livre ativo · arraste para rabiscar'}
          </div>
        )}
      </div>
    </div>
  );
}
