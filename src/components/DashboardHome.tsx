import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  EyeOff,
  FileText,
  FolderKanban,
  GripVertical,
  Layers,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { api, formatActivityActionPT, formatBRL, formatRelativeTime, formatShortDateBR } from '../lib/api.ts';
import {
  ALLOWED_COL_SPANS,
  computeCustomWidgetSurface,
  getColSpanClass,
  getDefaultHomeLayout,
  HOME_WIDGET_REGISTRY,
  mergeWithDefaultHomeLayout,
} from '../lib/homeLayout.ts';
import { playConfirmClick } from '../lib/sounds.ts';
import {
  ActivityLog,
  Client,
  HomeLayoutConfig,
  HomeWidgetConfig,
  HomeWidgetId,
  MainTab,
  MuralPost,
  PartnerKey,
  PartnerStatusItem,
  StudioEvent,
  StudioPostIt,
  User,
  WidgetColSpan,
  WidgetDensity,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { FloatingPostIts } from './FloatingPostIts.tsx';
import { HomeLayoutEditorPanel } from './HomeLayoutEditorPanel.tsx';
import { MacWindow } from './MacWindow.tsx';
import { StudioHomeMuralWidget } from './StudioHomeMuralWidget.tsx';

interface DashboardDrilldowns {
  boards_in_progress: Array<{
    id: string;
    title: string;
    portal_owner: PartnerKey;
    deadline: string | null;
    client_name: string;
    total_cards: number;
    completed_cards: number;
  }>;
  approval_cards: Array<{
    id: string;
    title: string;
    board_id: string;
    board_title: string;
    portal_owner: PartnerKey;
    client_name: string;
    due_date: string | null;
    priority: string;
    column_title: string;
  }>;
  boards_completed: Array<{
    id: string;
    title: string;
    portal_owner: PartnerKey;
    deadline: string | null;
    client_name: string;
    updated_at: string;
  }>;
  upcoming_deadlines: Array<{
    id: string;
    title: string;
    due_date: string;
    priority: string;
    board_id: string;
    board_title: string;
    portal_owner: PartnerKey;
    client_name: string;
    column_title: string;
  }>;
  pending_tasks: Array<{
    id: string;
    title: string;
    due_date: string | null;
    priority: string;
    board_id: string;
    board_title: string;
    portal_owner: PartnerKey;
    client_name: string;
    column_title: string;
  }>;
  active_clients: Array<{
    id: string;
    name: string;
    company: string;
    owner_partner: PartnerKey;
    status: string;
    active_boards_count: number;
  }>;
}

interface DashboardData {
  metrics: {
    boards_in_progress: number;
    boards_awaiting_approval: number;
    boards_completed: number;
    upcoming_deadlines_count: number;
    pending_tasks: number;
    active_clients: number;
    total_clients: number;
    today: string;
  };
  drilldowns?: DashboardDrilldowns;
  finance_summary: {
    balance: number;
    month_income: number;
    pending_receivable: number;
    total_expense: number;
  };
  upcoming_deliverables: Array<{
    id: string;
    title: string;
    due_date: string;
    priority: string;
    board_id: string;
    board_title: string;
    client_name: string;
    column_title: string;
  }>;
  upcoming_events: StudioEvent[];
  calendar_deadlines?: Array<{
    id: string;
    title: string;
    due_date: string;
    priority: string;
    board_id: string;
    board_title: string;
    portal_owner: PartnerKey;
    client_name: string;
    column_title: string;
  }>;
  recent_activities: ActivityLog[];
  mural_posts: MuralPost[];
  partner_boards_summary: { ingrid: number; mariana: number };
  partner_status: PartnerStatusItem[];
  studio_postits?: StudioPostIt[];
}

type KpiDrillKey =
  | 'boards_in_progress'
  | 'approval_cards'
  | 'boards_completed'
  | 'upcoming_deadlines'
  | 'pending_tasks'
  | 'active_clients';

interface DashboardHomeProps {
  user: User;
  onNavigate: (
    tab: MainTab,
    extra?: { portalOwner?: PartnerKey; boardId?: string; clientId?: string; quickAction?: string }
  ) => void;
  onOpenCopyComposer: () => void;
  onUserUpdated?: (user: User) => void;
}

const DENSITY_SHORT_LABELS: Array<{ id: WidgetDensity; short: string; label: string }> = [
  { id: 'compacto', short: 'C', label: 'Compacto' },
  { id: 'padrao', short: 'P', label: 'Padrão' },
  { id: 'expandido', short: 'E', label: 'Expandido' },
];

function getInitialLayoutForUser(user: User): HomeLayoutConfig {
  if (user.preferences?.home_layout) {
    return mergeWithDefaultHomeLayout(user.preferences.home_layout);
  }
  try {
    const raw = window.localStorage.getItem(`aumi_home_layout_${user.id}`);
    if (raw) {
      return mergeWithDefaultHomeLayout(JSON.parse(raw) as Partial<HomeLayoutConfig>);
    }
  } catch {
    // Ignore invalid local storage entry
  }
  return getDefaultHomeLayout();
}

function DecorativeAccentBar({
  color,
  darkBg = false,
}: {
  color: string;
  darkBg?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-3 select-none" aria-hidden="true">
      <span
        className="h-1.5 w-11 rounded-full transition-colors"
        style={{ backgroundColor: color }}
      />
      <span
        className="h-1.5 w-3.5 rounded-full opacity-55 transition-colors"
        style={{ backgroundColor: darkBg ? '#FFFFFF' : color }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full opacity-35 transition-colors"
        style={{ backgroundColor: darkBg ? '#FFFFFF' : '#7A689C' }}
      />
    </div>
  );
}

export function DashboardHome({
  user,
  onNavigate,
  onOpenCopyComposer,
  onUserUpdated,
}: DashboardHomeProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Real-time clock (updates every second)
  const [now, setNow] = useState(() => new Date());

  // KPI Drilldown Modal
  const [kpiModalKey, setKpiModalKey] = useState<KpiDrillKey | null>(null);

  // Calendar / Compromissos state
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showEventForm, setShowEventForm] = useState(false);
  const [evtTitle, setEvtTitle] = useState('');
  const [evtDate, setEvtDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [evtTime, setEvtTime] = useState('10:00');
  const [evtType, setEvtType] = useState<'meeting' | 'deadline' | 'delivery' | 'finance' | 'internal'>('meeting');
  const [evtClientId, setEvtClientId] = useState('');
  const [evtDesc, setEvtDesc] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Modular Home Layout Customization state
  const [savedLayout, setSavedLayout] = useState<HomeLayoutConfig>(() => getInitialLayoutForUser(user));
  const [draftLayout, setDraftLayout] = useState<HomeLayoutConfig>(() => getInitialLayoutForUser(user));
  const [editMode, setEditMode] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<HomeWidgetId>('welcome');
  const [draggedWidgetId, setDraggedWidgetId] = useState<HomeWidgetId | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<HomeWidgetId | null>(null);
  const [resizingWidgetId, setResizingWidgetId] = useState<HomeWidgetId | null>(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Floating Post-its bridge (notification click -> open specific paper modal, save -> refresh notifications)
  const [openPostItRequest, setOpenPostItRequest] = useState<{
    ownerKey: PartnerKey;
    nonce: number;
  } | null>(null);
  const [notifRefreshNonce, setNotifRefreshNonce] = useState(0);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const lastUserIdRef = useRef<string>(user.id);

  // Sync layout when logged-in partner changes
  useEffect(() => {
    if (lastUserIdRef.current !== user.id) {
      lastUserIdRef.current = user.id;
      const next = getInitialLayoutForUser(user);
      setSavedLayout(next);
      setDraftLayout(next);
    }
  }, [user]);

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draftLayout) !== JSON.stringify(savedLayout),
    [draftLayout, savedLayout]
  );

  const persistLayout = useCallback(
    async (nextLayout: HomeLayoutConfig, opts?: { silent?: boolean; notice?: string }) => {
      setSavingLayout(true);
      try {
        try {
          window.localStorage.setItem(`aumi_home_layout_${user.id}`, JSON.stringify(nextLayout));
        } catch {
          // Ignore storage quota errors
        }
        const res = await api<{ user: User }>('/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({
            preferences: {
              home_layout: nextLayout,
            },
          }),
        });
        setSavedLayout(nextLayout);
        onUserUpdated?.(res.user);
        if (!opts?.silent) {
          playConfirmClick(user.preferences);
        }
        if (opts?.notice) {
          setSaveNotice(opts.notice);
          window.setTimeout(() => setSaveNotice((cur) => (cur === opts.notice ? null : cur)), 2400);
        }
      } catch {
        // Local storage already updated as resilient fallback
      } finally {
        setSavingLayout(false);
      }
    },
    [onUserUpdated, user.id, user.preferences]
  );

  // Debounced auto-save when autoSave is active
  useEffect(() => {
    if (!draftLayout.autoSave || !hasUnsavedChanges) return;
    const timer = window.setTimeout(() => {
      persistLayout(draftLayout, { silent: true, notice: 'Layout salvo automaticamente' });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draftLayout, hasUnsavedChanges, persistLayout]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function fetchDashboard() {
    try {
      const [dashRes, cliRes] = await Promise.all([
        api<DashboardData>('/dashboard'),
        api<{ clients: Client[] }>('/clients'),
      ]);
      setData(dashRes);
      setClients(cliRes.clients || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboard();
  }, []);

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!evtTitle.trim() || !evtDate) return;
    setSavingEvent(true);
    try {
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: evtTitle.trim(),
          description: evtDesc.trim(),
          event_date: evtDate,
          event_time: evtTime,
          type: evtType,
          client_id: evtClientId || null,
          owner_partner: user.partner_key || 'studio',
        }),
      });
      setEvtTitle('');
      setEvtDesc('');
      setEvtClientId('');
      setSelectedDate(evtDate);
      setShowEventForm(false);
      await fetchDashboard();
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleDeleteEvent(id: string) {
    await api(`/events/${id}`, { method: 'DELETE' });
    await fetchDashboard();
  }

  // Modular widget mutations (update live preview immediately)
  const updateWidget = useCallback((id: HomeWidgetId, patch: Partial<HomeWidgetConfig>) => {
    setDraftLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  }, []);

  const moveWidgetByStep = useCallback((id: HomeWidgetId, direction: -1 | 1) => {
    setDraftLayout((prev) => {
      const list = [...prev.widgets];
      const idx = list.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const [moved] = list.splice(idx, 1);
      list.splice(targetIdx, 0, moved);
      return { ...prev, widgets: list };
    });
  }, []);

  const reorderWidgetsByDrop = useCallback((sourceId: HomeWidgetId, targetId: HomeWidgetId) => {
    if (sourceId === targetId) return;
    setDraftLayout((prev) => {
      const list = [...prev.widgets];
      const fromIdx = list.findIndex((w) => w.id === sourceId);
      const toIdx = list.findIndex((w) => w.id === targetId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return { ...prev, widgets: list };
    });
  }, []);

  const stepWidgetWidth = useCallback((cfg: HomeWidgetConfig, dir: -1 | 1) => {
    const meta = HOME_WIDGET_REGISTRY[cfg.id];
    const allowed = ALLOWED_COL_SPANS.filter((s) => s >= meta.minColSpan);
    const curIdx = allowed.indexOf(cfg.colSpan);
    const safeIdx = curIdx >= 0 ? curIdx : 0;
    const nextIdx = Math.max(0, Math.min(allowed.length - 1, safeIdx + dir));
    updateWidget(cfg.id, { colSpan: allowed[nextIdx] });
  }, [updateWidget]);

  // Interactive right-edge drag resize
  const startPointerResize = useCallback(
    (e: React.PointerEvent, cfg: HomeWidgetConfig) => {
      e.preventDefault();
      e.stopPropagation();
      const gridEl = gridRef.current;
      if (!gridEl) return;

      const meta = HOME_WIDGET_REGISTRY[cfg.id];
      const allowed = ALLOWED_COL_SPANS.filter((s) => s >= meta.minColSpan);
      const gridWidth = gridEl.getBoundingClientRect().width || 1100;
      const colPixelWidth = gridWidth / 12;
      const startX = e.clientX;
      const startCols = cfg.colSpan;

      setResizingWidgetId(cfg.id);
      setSelectedWidgetId(cfg.id);

      const handleMove = (ev: PointerEvent) => {
        const deltaCols = Math.round((ev.clientX - startX) / colPixelWidth);
        const rawTarget = Math.max(meta.minColSpan, Math.min(12, startCols + deltaCols));
        // Snap to nearest allowed colSpan
        let nearest: WidgetColSpan = allowed[0];
        let bestDiff = Math.abs(rawTarget - nearest);
        for (const span of allowed) {
          const diff = Math.abs(rawTarget - span);
          if (diff < bestDiff) {
            bestDiff = diff;
            nearest = span;
          }
        }
        updateWidget(cfg.id, { colSpan: nearest });
      };

      const handleUp = () => {
        setResizingWidgetId(null);
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [updateWidget]
  );

  const handleToggleAutoSave = useCallback(
    (nextAutoSave: boolean) => {
      const updated: HomeLayoutConfig = { ...draftLayout, autoSave: nextAutoSave };
      setDraftLayout(updated);
      if (nextAutoSave) {
        persistLayout(updated, { silent: false, notice: 'Salvamento automático ativado' });
      }
    },
    [draftLayout, persistLayout]
  );

  const handleSaveLayout = useCallback(async () => {
    if (hasUnsavedChanges) {
      await persistLayout(draftLayout, { notice: 'Personalização salva com sucesso' });
    } else {
      setEditMode(false);
    }
  }, [draftLayout, hasUnsavedChanges, persistLayout]);

  const handleDiscardPreview = useCallback(() => {
    setDraftLayout(savedLayout);
    setSaveNotice('Prévia descartada');
    window.setTimeout(() => setSaveNotice((cur) => (cur === 'Prévia descartada' ? null : cur)), 2000);
  }, [savedLayout]);

  const handleRestoreDefault = useCallback(() => {
    const def = getDefaultHomeLayout();
    const next: HomeLayoutConfig = { ...def, autoSave: draftLayout.autoSave };
    setDraftLayout(next);
    if (draftLayout.autoSave) {
      persistLayout(next, { notice: 'Layout original restaurado' });
    } else {
      setSaveNotice('Layout original carregado na prévia');
      window.setTimeout(
        () => setSaveNotice((cur) => (cur === 'Layout original carregado na prévia' ? null : cur)),
        2400
      );
    }
  }, [draftLayout.autoSave, persistLayout]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-36 rounded-[28px] bg-[#BC9FE6]/20" />
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white/50" />
          ))}
        </div>
      </div>
    );
  }

  const m = data?.metrics;
  const fin = data?.finance_summary;
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const shiftLabel = hour < 12 ? 'Turno da manhã' : hour < 18 ? 'Turno da tarde' : 'Turno da noite';
  const liveClockStr = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const liveClockShort = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const liveWeekdayStr = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(now);
  const liveDateStr = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now);

  // Calendar computations
  const allEvents = data?.upcoming_events || [];
  const allDeadlines = data?.calendar_deadlines || [];
  const selDateObj = new Date(`${selectedDate}T12:00:00`);
  const monthYearLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(selDateObj);

  function shiftCalendar(dir: -1 | 1) {
    const d = new Date(`${selectedDate}T12:00:00`);
    if (calendarView === 'day') d.setDate(d.getDate() + dir);
    else if (calendarView === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(d.toISOString().slice(0, 10));
  }

  const monthCells = (() => {
    const y = selDateObj.getFullYear();
    const mo = selDateObj.getMonth();
    const firstDay = new Date(y, mo, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const cells: Array<string | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push(`${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    }
    return cells;
  })();

  const weekDates = (() => {
    const d = new Date(`${selectedDate}T12:00:00`);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const c = new Date(start);
      c.setDate(start.getDate() + i);
      return c.toISOString().slice(0, 10);
    });
  })();

  const selectedDayEvents = allEvents.filter((ev) => ev.event_date === selectedDate);
  const selectedDayDeadlines = allDeadlines.filter((dl) => dl.due_date === selectedDate);
  const weekEvents = allEvents.filter((ev) => weekDates.includes(ev.event_date));
  const weekDeadlines = allDeadlines.filter((dl) => weekDates.includes(dl.due_date));
  const todayEventsCount = allEvents.filter((ev) => ev.event_date === (m?.today || new Date().toISOString().slice(0, 10))).length;

  const KPI_DRILL_TITLES: Record<KpiDrillKey, { title: string; subtitle: string }> = {
    boards_in_progress: { title: 'Quadros em andamento', subtitle: 'Projetos ativos no estúdio' },
    approval_cards: { title: 'Entregas em aprovação', subtitle: 'Cartões aguardando resposta do cliente' },
    boards_completed: { title: 'Projetos concluídos', subtitle: 'Quadros finalizados e arquiváveis' },
    upcoming_deadlines: { title: 'Entregas próximas do prazo', subtitle: 'Prazos vencendo nos próximos 7 dias' },
    pending_tasks: { title: 'Tarefas e demandas pendentes', subtitle: 'Cartões abertos em quadros ativos' },
    active_clients: { title: 'Clientes ativos', subtitle: 'Contas com projetos em andamento ou rascunho' },
  };

  const visibleWidgets = draftLayout.widgets.filter((w) => {
    if (w.id === 'finance' && !user.permissions.can_manage_finance) return false;
    return w.visible;
  });

  const hiddenWidgets = draftLayout.widgets.filter((w) => {
    if (w.id === 'finance' && !user.permissions.can_manage_finance) return false;
    return !w.visible;
  });

  // Smart bento vertical pairing so there are zero awkward empty gaps:
  // 1) Top cluster: [welcome (5, row-span-2)] | [clock (4) over partners (4)] | [shortcuts (3, row-span-2)]
  // 2) Bottom cluster: [calendar (7, row-span-2)] | [finance (5) over activities (5)]
  const rowSpanTwoIds = new Set<HomeWidgetId>();
  {
    const w0 = visibleWidgets[0];
    const w1 = visibleWidgets[1];
    const w2 = visibleWidgets[2];
    const w3 = visibleWidgets[3];
    if (
      w0?.id === 'welcome' &&
      w1?.id === 'clock' &&
      w2?.id === 'shortcuts' &&
      w3?.id === 'partners' &&
      w0.colSpan + w1.colSpan + w2.colSpan === 12 &&
      w3.colSpan === w1.colSpan
    ) {
      rowSpanTwoIds.add('welcome');
      rowSpanTwoIds.add('shortcuts');
    }

    const calIdx = visibleWidgets.findIndex((w) => w.id === 'calendar');
    if (calIdx >= 0) {
      const cal = visibleWidgets[calIdx];
      const next1 = visibleWidgets[calIdx + 1];
      const next2 = visibleWidgets[calIdx + 2];
      if (
        next1 &&
        next2 &&
        cal.colSpan + next1.colSpan === 12 &&
        next2.colSpan === next1.colSpan
      ) {
        rowSpanTwoIds.add('calendar');
      }
    }
  }

  function renderWidgetContent(cfg: HomeWidgetConfig) {
    const custom = cfg.useDefaultStyle ? null : computeCustomWidgetSurface(cfg);
    const isLightText = custom ? !custom.isDarkText : false;
    const headingClass = isLightText ? 'text-white' : 'text-[#2F1534]';
    const subtextClass = isLightText ? 'text-white/80' : 'text-[#232122]/60';
    const eyebrowClass = isLightText ? 'text-white/85' : 'text-[#7A689C]';
    const innerTileClass = isLightText
      ? 'bg-white/14 border border-white/20 text-white backdrop-blur-md'
      : 'aumi-surface-solid';

    switch (cfg.id) {
      /* 1. BOAS-VINDAS */
      case 'welcome': {
        const defaultShell =
          'bg-gradient-to-br from-[#7A689C] via-[#5C447E] to-[#2F1534] text-white shadow-[0_18px_42px_-16px_rgba(47,21,52,0.42)] border border-white/25';
        const darkLook = cfg.useDefaultStyle || isLightText;
        const pad =
          cfg.density === 'compacto' ? 'p-4 sm:p-5' : cfg.density === 'expandido' ? 'p-6 sm:p-7' : 'p-6';
        return (
          <div
            style={custom?.style}
            className={`rounded-[28px] relative overflow-hidden h-full flex flex-col justify-between gap-3 ${pad} ${
              cfg.useDefaultStyle ? defaultShell : `border ${custom?.extraClass || ''}`
            } ${darkLook ? 'text-white' : 'text-[#2F1534]'}`}
          >
            {cfg.useDefaultStyle && (
              <div
                className="absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-40 pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(236,151,183,0.65) 0%, transparent 70%)' }}
              />
            )}
            <div className="relative z-10">
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={darkLook} />}
              <div className="space-y-2">
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-medium border ${
                    darkLook
                      ? 'bg-white/15 backdrop-blur-md border-white/20 text-[#F6EEFC]'
                      : 'bg-white/80 border-[#7A689C]/20 text-[#5C447E]'
                  }`}
                >
                  <Sparkles className={`w-3.5 h-3.5 ${darkLook ? 'text-[#DAD994]' : 'text-[#5D601E]'}`} />
                  <span className="capitalize">{liveWeekdayStr}, {liveDateStr}</span>
                </div>
                <h1
                  className={`font-editorial leading-tight ${
                    cfg.density === 'compacto'
                      ? 'text-xl sm:text-2xl'
                      : cfg.density === 'expandido'
                      ? 'text-3xl sm:text-[34px]'
                      : 'text-2xl sm:text-[32px]'
                  } ${darkLook ? 'text-white' : 'text-[#2F1534]'}`}
                >
                  {greeting}, {user.name}.
                </h1>
                {cfg.density !== 'compacto' && (
                  <p className={`text-[13px] leading-relaxed ${darkLook ? 'text-white/82' : 'text-[#2F1534]/75'}`}>
                    Central operacional do Aumi Studio: acompanhe clientes, quadros ativos, copies compartilhadas, compromissos e saúde financeira em tempo real.
                  </p>
                )}
              </div>
            </div>

            {cfg.density === 'expandido' && (
              <div className="relative z-10 grid grid-cols-3 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setKpiModalKey('boards_in_progress')}
                  className={`p-3 rounded-2xl text-left border transition-colors ${
                    darkLook
                      ? 'bg-white/12 hover:bg-white/20 border-white/18 text-white'
                      : 'bg-white/85 hover:bg-white border-black/[0.08] text-[#2F1534]'
                  }`}
                >
                  <p className="text-[10.5px] opacity-80">Quadros ativos</p>
                  <p className="text-xl font-bold tabular-nums mt-0.5">{m?.boards_in_progress ?? 0}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setKpiModalKey('upcoming_deadlines')}
                  className={`p-3 rounded-2xl text-left border transition-colors ${
                    darkLook
                      ? 'bg-white/12 hover:bg-white/20 border-white/18 text-white'
                      : 'bg-white/85 hover:bg-white border-black/[0.08] text-[#2F1534]'
                  }`}
                >
                  <p className="text-[10.5px] opacity-80">Prazos 7 dias</p>
                  <p className="text-xl font-bold tabular-nums mt-0.5">{m?.upcoming_deadlines_count ?? 0}</p>
                </button>
                <button
                  type="button"
                  onClick={() => setKpiModalKey('active_clients')}
                  className={`p-3 rounded-2xl text-left border transition-colors ${
                    darkLook
                      ? 'bg-white/12 hover:bg-white/20 border-white/18 text-white'
                      : 'bg-white/85 hover:bg-white border-black/[0.08] text-[#2F1534]'
                  }`}
                >
                  <p className="text-[10.5px] opacity-80">Clientes ativos</p>
                  <p className="text-xl font-bold tabular-nums mt-0.5">{m?.active_clients ?? 0}</p>
                </button>
              </div>
            )}
          </div>
        );
      }

      /* 2. RELÓGIO LOCAL */
      case 'clock': {
        const defaultRoseStyle: React.CSSProperties = {
          backgroundImage:
            'radial-gradient(circle at 18% 15%, rgba(236,43,130,0.88) 0%, transparent 56%), radial-gradient(circle at 86% 84%, rgba(236,151,183,0.92) 0%, transparent 62%), linear-gradient(135deg, #EC2B82 0%, #F46CA8 48%, #F8A1C6 100%)',
          borderColor: 'rgba(255,255,255,0.78)',
          boxShadow:
            'inset 0 1.5px 1px rgba(255,255,255,0.75), 0 18px 36px -18px rgba(236,43,130,0.42)',
        };
        const darkLook = cfg.useDefaultStyle ? false : isLightText;
        const pad = cfg.density === 'compacto' ? 'p-4' : 'p-5';

        return (
          <div
            style={cfg.useDefaultStyle ? defaultRoseStyle : custom?.style}
            className={`rounded-[26px] relative overflow-hidden h-full flex flex-col justify-between border ${pad} ${
              cfg.useDefaultStyle ? '' : custom?.extraClass || ''
            } ${darkLook ? 'text-white' : 'text-[#2F1534]'}`}
          >
            {cfg.accentBar && (
              <DecorativeAccentBar
                color={cfg.accentBarColor}
                darkBg={cfg.useDefaultStyle || darkLook}
              />
            )}

            {cfg.density === 'compacto' ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest opacity-80 font-bold">Horário local</p>
                  <p className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight leading-none mt-1">
                    {liveClockShort}
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${
                    darkLook
                      ? 'bg-white/15 text-white'
                      : 'bg-white/90 text-[#2F1534] shadow-xs'
                  }`}
                >
                  {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now)}
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] uppercase tracking-widest opacity-85 font-bold">
                    Horário local
                  </span>
                  <span
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center ${
                      darkLook
                        ? 'bg-white/15 border-white/20 text-white'
                        : 'bg-white/25 border-[#2F1534]/12 text-[#2F1534]/80'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </span>
                </div>

                <div className="my-2">
                  <p className="text-3xl sm:text-[38px] font-extrabold tabular-nums tracking-tight leading-none">
                    {liveClockStr}
                  </p>
                  {cfg.density === 'expandido' && (
                    <p className="text-xs opacity-80 mt-1.5 font-medium">
                      {shiftLabel} · {todayEventsCount} compromisso(s) hoje
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p
                    className={`inline-flex items-center px-3 py-1 rounded-full border text-[11.5px] font-bold capitalize ${
                      darkLook
                        ? 'bg-white/15 border-white/20 text-white'
                        : 'bg-white/92 border-white text-[#2F1534] shadow-xs'
                    }`}
                  >
                    {liveWeekdayStr} · {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now)}
                  </p>
                  {cfg.density === 'expandido' && (
                    <span className="text-[11px] opacity-80 tabular-nums font-medium">
                      {data?.upcoming_deliverables.length ?? 0} entregas (7d)
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        );
      }

      /* 3. ATALHOS RÁPIDOS */
      case 'shortcuts': {
        const defaultShell =
          'bg-gradient-to-br from-[#F3ECF9] via-[#EFE6FB] to-[#E9DCFA] text-[#2F1534] shadow-[0_18px_38px_-16px_rgba(122,104,156,0.22)] border border-[#BC9FE6]/60';
        const pad = cfg.density === 'compacto' ? 'p-4' : 'p-5';
        const btnBase = isLightText
          ? 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
          : 'bg-white/92 hover:bg-white border-[#BC9FE6]/45 text-[#2F1534]';
        const narrowStack = cfg.colSpan <= 3 && cfg.density !== 'compacto';

        return (
          <div
            style={custom?.style}
            className={`rounded-[28px] relative overflow-hidden h-full flex flex-col justify-between gap-3 ${pad} ${
              cfg.useDefaultStyle ? defaultShell : `border ${custom?.extraClass || ''}`
            }`}
          >
            <div>
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />}
              <div className="flex items-center justify-between gap-2">
                <p className={`text-[11px] font-extrabold uppercase tracking-wider ${eyebrowClass}`}>
                  Atalhos rápidos
                </p>
                {cfg.density === 'expandido' && (
                  <button
                    type="button"
                    onClick={onOpenCopyComposer}
                    className={`text-[11px] font-semibold inline-flex items-center gap-1 hover:underline ${
                      isLightText ? 'text-white' : 'text-[#5D601E]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Nova copy</span>
                  </button>
                )}
              </div>
            </div>

            <div
              className={`grid gap-2.5 flex-1 ${
                narrowStack
                  ? 'grid-cols-1'
                  : cfg.density === 'compacto'
                  ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-2'
                  : 'grid-cols-2'
              }`}
            >
              <button
                type="button"
                onClick={() => onNavigate('portal', { portalOwner: user.partner_key || 'ingrid' })}
                className={`rounded-2xl border text-xs font-bold inline-flex items-center gap-2.5 shadow-xs transition-all text-left hover:border-[#EC2B82]/60 ${btnBase} ${
                  cfg.density === 'compacto' ? 'px-2.5 py-2' : 'px-3.5 py-2.5'
                }`}
              >
                <span className="w-8 h-8 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
                  <FolderKanban className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">Meu Portal</span>
                  {cfg.density === 'expandido' && (
                    <span className={`block text-[10.5px] font-normal mt-0.5 ${subtextClass}`}>
                      Quadros e clientes
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('clientes', { quickAction: 'new-client' })}
                className={`rounded-2xl border text-xs font-bold inline-flex items-center gap-2.5 shadow-xs transition-all text-left hover:border-[#7A689C] ${btnBase} ${
                  cfg.density === 'compacto' ? 'px-2.5 py-2' : 'px-3.5 py-2.5'
                }`}
              >
                <span className="w-8 h-8 rounded-xl bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">Novo Cliente</span>
                  {cfg.density === 'expandido' && (
                    <span className={`block text-[10.5px] font-normal mt-0.5 ${subtextClass}`}>
                      Cadastrar no CRM
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('financeiro')}
                className={`rounded-2xl border text-xs font-bold inline-flex items-center gap-2.5 shadow-xs transition-all text-left hover:border-[#E1754C]/65 ${btnBase} ${
                  cfg.density === 'compacto' ? 'px-2.5 py-2' : 'px-3.5 py-2.5'
                }`}
              >
                <span className="w-8 h-8 rounded-xl bg-[#FDF0E8] text-[#E1754C] flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">Financeiro</span>
                  {cfg.density === 'expandido' && (
                    <span className={`block text-[10.5px] font-normal mt-0.5 ${subtextClass}`}>
                      Fluxo e cobranças
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('servicos')}
                className={`rounded-2xl border text-xs font-bold inline-flex items-center gap-2.5 shadow-xs transition-all text-left hover:border-[#C8C978] ${btnBase} ${
                  cfg.density === 'compacto' ? 'px-2.5 py-2' : 'px-3.5 py-2.5'
                }`}
              >
                <span className="w-8 h-8 rounded-xl bg-[#F6F6E4] text-[#5D601E] flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block leading-tight">Serviços</span>
                  {cfg.density === 'expandido' && (
                    <span className={`block text-[10.5px] font-normal mt-0.5 ${subtextClass}`}>
                      Catálogo e pacotes
                    </span>
                  )}
                </span>
              </button>
            </div>
          </div>
        );
      }

      /* 4. INDICADORES & ANDAMENTO (6 KPIs clicáveis) */
      case 'kpis': {
        const kpiCards: Array<{
          key: KpiDrillKey;
          label: string;
          value: number;
          sub: string;
          accent: string;
          hoverBorder: string;
        }> = [
          {
            key: 'boards_in_progress',
            label: 'Em andamento',
            value: m?.boards_in_progress ?? 0,
            sub: 'Quadros ativos',
            accent: '#EC2B82',
            hoverBorder: 'hover:border-[#BC9FE6]',
          },
          {
            key: 'approval_cards',
            label: 'Em aprovação',
            value: m?.boards_awaiting_approval ?? 0,
            sub: 'Aguardando cliente',
            accent: '#7A689C',
            hoverBorder: 'hover:border-[#EC97B7]',
          },
          {
            key: 'boards_completed',
            label: 'Concluídos',
            value: m?.boards_completed ?? 0,
            sub: 'Projetos finalizados',
            accent: '#5D601E',
            hoverBorder: 'hover:border-[#C8C978]',
          },
          {
            key: 'upcoming_deadlines',
            label: 'Próximas do prazo',
            value: m?.upcoming_deadlines_count ?? 0,
            sub: 'Próximos 7 dias',
            accent: '#E1754C',
            hoverBorder: 'hover:border-[#E1754C]',
          },
          {
            key: 'pending_tasks',
            label: 'Tarefas pendentes',
            value: m?.pending_tasks ?? 0,
            sub: 'Cartões abertos',
            accent: '#7A689C',
            hoverBorder: 'hover:border-[#7A689C]',
          },
          {
            key: 'active_clients',
            label: 'Clientes ativos',
            value: m?.active_clients ?? 0,
            sub: `${m?.total_clients ?? 0} no CRM`,
            accent: '#5D601E',
            hoverBorder: 'hover:border-[#EC2B82]',
          },
        ];

        const gridCols =
          cfg.colSpan <= 6
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6';

        return (
          <div
            style={custom?.style}
            className={`rounded-[26px] transition-all ${
              cfg.useDefaultStyle
                ? 'p-1'
                : `p-4 sm:p-5 border ${custom?.extraClass || ''}`
            }`}
          >
            {cfg.accentBar && (
              <div className={cfg.useDefaultStyle ? 'px-1' : ''}>
                <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />
              </div>
            )}

            <div className={`grid ${gridCols} gap-3`}>
              {kpiCards.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => setKpiModalKey(k.key)}
                  className={`text-left rounded-2xl transition-all ${k.hoverBorder} ${
                    cfg.density === 'compacto'
                      ? 'p-3'
                      : cfg.density === 'expandido'
                      ? 'p-4 sm:p-5'
                      : 'p-4'
                  } ${
                    cfg.useDefaultStyle
                      ? 'aumi-glass'
                      : isLightText
                      ? 'bg-white/14 hover:bg-white/22 border border-white/20 text-white'
                      : 'bg-white/85 hover:bg-white border border-black/[0.06] text-[#2F1534]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-[11px] font-medium truncate ${eyebrowClass}`}>{k.label}</p>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: k.accent }}
                    />
                  </div>
                  <p
                    className={`font-semibold tabular-nums ${
                      cfg.density === 'compacto'
                        ? 'mt-1 text-xl sm:text-2xl'
                        : 'mt-1.5 text-2xl sm:text-3xl'
                    } ${headingClass}`}
                  >
                    {k.value}
                  </p>
                  {cfg.density !== 'compacto' && (
                    <p
                      className="mt-1 text-[11px] font-medium tabular-nums"
                      style={{ color: isLightText ? 'rgba(255,255,255,0.82)' : k.accent }}
                    >
                      {k.sub}
                    </p>
                  )}
                  {cfg.density === 'expandido' && (
                    <div className="mt-2.5 pt-2 border-t border-current/10 flex items-center justify-between text-[10.5px] opacity-75">
                      <span>Ver detalhes</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      }

      /* 5. CENTRAL DE NOTIFICAÇÕES */
      case 'communication': {
        return (
          <StudioHomeMuralWidget
            user={user}
            partners={data?.partner_status || []}
            initialPosts={data?.mural_posts || []}
            density={cfg.density}
            accentBar={cfg.accentBar}
            accentBarColor={cfg.accentBarColor}
            customShellStyle={custom?.style}
            customShellClass={custom?.extraClass}
            refreshNonce={notifRefreshNonce}
            onOpenPostIt={(ownerKey) =>
              setOpenPostItRequest({ ownerKey, nonce: Date.now() })
            }
            onNavigate={onNavigate}
          />
        );
      }

      /* 6. COMPROMISSOS & CALENDÁRIO */
      case 'calendar': {
        const pad = cfg.density === 'compacto' ? 'p-4 sm:p-5' : 'p-5 sm:p-6';
        const maxList = cfg.density === 'compacto' ? 3 : cfg.density === 'expandido' ? 8 : 5;

        return (
          <div
            style={custom?.style}
            className={`rounded-[26px] space-y-4 ${pad} ${
              cfg.useDefaultStyle
                ? 'aumi-glass-strong'
                : `border ${custom?.extraClass || ''}`
            }`}
          >
            <div>
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl bg-[#FDF0E8] text-[#E1754C] flex items-center justify-center shrink-0">
                    <CalendarClock className="w-4 h-4" />
                  </span>
                  <div>
                    <h3 className={`text-base font-semibold ${headingClass}`}>
                      Compromissos &amp; Calendário
                    </h3>
                    {cfg.density !== 'compacto' && (
                      <p className={`text-xs ${subtextClass}`}>
                        Agenda do estúdio e entregas previstas por dia, semana ou mês
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {cfg.density !== 'compacto' && (
                    <div className="flex items-center gap-1 p-1 rounded-xl bg-white/85 border border-black/[0.06]">
                      {(
                        [
                          { id: 'day', label: 'Dia' },
                          { id: 'week', label: 'Semana' },
                          { id: 'month', label: 'Mês' },
                        ] as const
                      ).map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setCalendarView(v.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                            calendarView === v.id
                              ? 'bg-[#2F1534] text-white'
                              : 'text-[#232122]/65 hover:text-[#2F1534]'
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEvtDate(selectedDate);
                      setShowEventForm((v) => !v);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#FDF0E8] hover:bg-[#E1754C] text-[#E1754C] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <CalendarPlus className="w-3.5 h-3.5" />
                    <span>{showEventForm ? 'Fechar' : 'Novo compromisso'}</span>
                  </button>
                </div>
              </div>
            </div>

            {showEventForm && (
              <form onSubmit={handleCreateEvent} className="aumi-surface-solid rounded-2xl p-4 space-y-3 text-[#2F1534]">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <input
                    type="text"
                    required
                    value={evtTitle}
                    onChange={(e) => setEvtTitle(e.target.value)}
                    placeholder="Ex: Reunião de alinhamento com cliente"
                    className="sm:col-span-6 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white focus:outline-none focus:border-[#7A689C]"
                  />
                  <input
                    type="date"
                    required
                    value={evtDate}
                    onChange={(e) => setEvtDate(e.target.value)}
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white tabular-nums"
                  />
                  <input
                    type="time"
                    value={evtTime}
                    onChange={(e) => setEvtTime(e.target.value)}
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                  <select
                    value={evtType}
                    onChange={(e) => setEvtType(e.target.value as StudioEvent['type'])}
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="meeting">Reunião</option>
                    <option value="delivery">Entrega / Publicação</option>
                    <option value="deadline">Prazo importante</option>
                    <option value="finance">Financeiro</option>
                    <option value="internal">Interno Aumi</option>
                  </select>
                  <select
                    value={evtClientId}
                    onChange={(e) => setEvtClientId(e.target.value)}
                    className="sm:col-span-4 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="">Sem cliente vinculado</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={evtDesc}
                    onChange={(e) => setEvtDesc(e.target.value)}
                    placeholder="Observação rápida"
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  />
                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="sm:col-span-2 py-2 px-3 rounded-xl bg-[#2F1534] text-white text-xs font-semibold hover:bg-[#232122]"
                  >
                    {savingEvent ? '...' : 'Agendar'}
                  </button>
                </div>
              </form>
            )}

            {/* Calendar Navigator (hidden in Compacto to stay ultra clean) */}
            {cfg.density !== 'compacto' && (
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-3 text-[#2F1534]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#2F1534] capitalize">{monthYearLabel}</span>
                    {cfg.density === 'expandido' && (
                      <span className="text-[10.5px] font-semibold text-[#5D601E] bg-[#F6F6E4] border border-[#DAD994] px-2 py-0.5 rounded-full tabular-nums">
                        {allEvents.length} compromissos · {allDeadlines.length} prazos
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => shiftCalendar(-1)}
                      className="p-1.5 rounded-lg border border-black/10 hover:bg-black/5 text-[#2F1534]"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                      className="px-2.5 py-1 rounded-lg bg-[#F3ECF9] text-[#7A689C] text-[11px] font-semibold"
                    >
                      Hoje
                    </button>
                    <button
                      type="button"
                      onClick={() => shiftCalendar(1)}
                      className="p-1.5 rounded-lg border border-black/10 hover:bg-black/5 text-[#2F1534]"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {calendarView === 'month' && (
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#7A689C]">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {monthCells.map((iso, i) => {
                        if (!iso) return <div key={`empty-${i}`} className="h-10" />;
                        const evCount = allEvents.filter((ev) => ev.event_date === iso).length;
                        const dlCount = allDeadlines.filter((dl) => dl.due_date === iso).length;
                        const isSel = iso === selectedDate;
                        const isToday = iso === m?.today;
                        return (
                          <button
                            key={iso}
                            type="button"
                            onClick={() => setSelectedDate(iso)}
                            className={`h-10 rounded-xl border text-xs flex flex-col items-center justify-center transition-all ${
                              isSel
                                ? 'bg-[#2F1534] text-white border-[#2F1534] shadow-xs'
                                : isToday
                                ? 'bg-[#FDF2F6] text-[#EC2B82] border-[#EC97B7]/60 font-semibold'
                                : 'bg-white border-black/[0.06] text-[#232122] hover:border-[#BC9FE6]'
                            }`}
                          >
                            <span className="tabular-nums leading-none">{Number(iso.slice(-2))}</span>
                            {(evCount > 0 || dlCount > 0) && (
                              <div className="flex items-center gap-0.5 mt-1">
                                {evCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#EC2B82]" />}
                                {dlCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#E1754C]" />}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {calendarView === 'week' && (
                  <div className="grid grid-cols-7 gap-1.5">
                    {weekDates.map((iso) => {
                      const evCount = allEvents.filter((ev) => ev.event_date === iso).length;
                      const dlCount = allDeadlines.filter((dl) => dl.due_date === iso).length;
                      const isSel = iso === selectedDate;
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSelectedDate(iso)}
                          className={`p-2 rounded-xl border text-center transition-all ${
                            isSel
                              ? 'bg-[#2F1534] text-white border-[#2F1534]'
                              : 'bg-white border-black/[0.06] hover:border-[#BC9FE6]'
                          }`}
                        >
                          <p className="text-[10px] opacity-70 capitalize">
                            {new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`))}
                          </p>
                          <p className="text-sm font-semibold tabular-nums mt-0.5">{iso.slice(-2)}</p>
                          <p className="text-[10px] mt-1 opacity-80 tabular-nums">
                            {evCount + dlCount > 0 ? `${evCount + dlCount} itens` : '·'}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected Day or Week Details */}
                <div className="pt-2 border-t border-black/[0.06] space-y-2">
                  <p className="text-[11px] font-semibold text-[#7A689C]">
                    {calendarView === 'week'
                      ? `Semana selecionada (${weekEvents.length + weekDeadlines.length} itens)`
                      : `Agenda de ${formatShortDateBR(selectedDate)} (${selectedDayEvents.length + selectedDayDeadlines.length} itens)`}
                  </p>

                  {calendarView === 'week' ? (
                    weekEvents.length + weekDeadlines.length === 0 ? (
                      <p className="text-xs text-[#232122]/50 py-2">Nenhum compromisso ou prazo nesta semana.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {weekEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className="p-2 rounded-xl bg-[#F8F5FB] flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-[#2F1534] truncate">{ev.title}</p>
                              <p className="text-[10px] text-[#7A689C] tabular-nums">
                                {formatShortDateBR(ev.event_date)} · {ev.event_time}
                                {ev.client_name ? ` · ${ev.client_name}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev.id)}
                              className="text-[#232122]/35 hover:text-red-500 p-1 shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {weekDeadlines.map((dl) => (
                          <button
                            key={dl.id}
                            type="button"
                            onClick={() => onNavigate('portal', { boardId: dl.board_id, portalOwner: dl.portal_owner })}
                            className="w-full text-left p-2 rounded-xl bg-[#FDF0E8]/70 hover:bg-[#FDF2F6] flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="truncate font-medium text-[#2F1534]">
                              Entrega: {dl.title} ({dl.client_name})
                            </span>
                            <span className="text-[10px] font-semibold text-[#E1754C] tabular-nums shrink-0">
                              {formatShortDateBR(dl.due_date)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  ) : selectedDayEvents.length + selectedDayDeadlines.length === 0 ? (
                    <p className="text-xs text-[#232122]/50 py-2">Nenhum compromisso ou entrega marcada para este dia.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selectedDayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-2.5 rounded-xl bg-[#F8F5FB] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2F1534] truncate">{ev.title}</p>
                            <p className="text-[11px] text-[#7A689C] tabular-nums">
                              {ev.event_time}
                              {ev.client_name ? ` · ${ev.client_name}` : ''}
                              {ev.description ? ` · ${ev.description}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteEvent(ev.id)}
                            className="text-[#232122]/35 hover:text-red-500 p-1 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {selectedDayDeadlines.map((dl) => (
                        <button
                          key={dl.id}
                          type="button"
                          onClick={() => onNavigate('portal', { boardId: dl.board_id, portalOwner: dl.portal_owner })}
                          className="w-full text-left p-2.5 rounded-xl bg-[#FCF6EC] hover:bg-[#FDF2F6] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#2F1534] truncate">{dl.title}</p>
                            <p className="text-[11px] text-[#232122]/60 truncate">
                              {dl.client_name} · {dl.board_title}
                            </p>
                          </div>
                          <span className="text-[11px] font-semibold text-[#E1754C] shrink-0">Abrir →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[#2F1534]">
              {/* Próximos compromissos */}
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A689C]">
                  Próximos compromissos
                </p>
                {!allEvents.length ? (
                  <p className="text-xs text-[#232122]/50 py-3 text-center">Nenhum compromisso agendado.</p>
                ) : (
                  <div className="space-y-2">
                    {allEvents.slice(0, maxList).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-xl bg-[#F8F5FB] border border-[#BC9FE6]/30 flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#2F1534] truncate">{ev.title}</p>
                          <p className="text-[11px] text-[#7A689C] tabular-nums">
                            {formatShortDateBR(ev.event_date)} · {ev.event_time}
                            {ev.client_name ? ` · ${ev.client_name}` : ''}
                          </p>
                          {cfg.density === 'expandido' && ev.description && (
                            <p className="text-[11px] text-[#232122]/60 mt-0.5 line-clamp-2">{ev.description}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id)}
                          title="Remover compromisso"
                          className="text-[#232122]/35 hover:text-red-500 p-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Entregas próximas */}
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#E1754C]">
                    Entregas (7 dias)
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('portal')}
                    className="text-[11px] font-medium text-[#7A689C] hover:underline"
                  >
                    Ver quadros
                  </button>
                </div>
                {!data?.upcoming_deliverables.length ? (
                  <p className="text-xs text-[#232122]/50 py-3 text-center">
                    Nenhuma entrega vencendo nos próximos 7 dias.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.upcoming_deliverables.slice(0, maxList).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onNavigate('portal', { boardId: item.board_id })}
                        className="w-full p-2.5 rounded-xl bg-[#FCF6EC]/70 hover:bg-[#FDF2F6] border border-black/[0.05] text-left flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#2F1534] truncate">{item.title}</p>
                          <p className="text-[11px] text-[#232122]/55 truncate">
                            {item.client_name} · {item.board_title}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold text-[#E1754C] tabular-nums shrink-0">
                          {formatShortDateBR(item.due_date)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      /* 7. SÓCIAS & PORTAIS */
      case 'partners': {
        const pad = cfg.density === 'compacto' ? 'p-4 sm:p-5' : 'p-5 sm:p-6';
        return (
          <div
            style={custom?.style}
            className={`rounded-[26px] space-y-3.5 ${pad} ${
              cfg.useDefaultStyle
                ? 'bg-white border border-[#E6D9F5] shadow-[0_12px_28px_-16px_rgba(47,21,52,0.18)]'
                : `border ${custom?.extraClass || ''}`
            }`}
          >
            <div>
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className={`w-4 h-4 ${isLightText ? 'text-white' : 'text-[#7A689C]'}`} />
                  <h3 className={`text-base font-semibold ${headingClass}`}>Sócias &amp; Portais</h3>
                </div>
                <span className={`text-[11px] font-medium ${eyebrowClass}`}>Presença real</span>
              </div>
            </div>

            <div
              className={`grid gap-3 ${
                cfg.density === 'compacto'
                  ? 'grid-cols-1'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2'
              }`}
            >
              {(data?.partner_status || []).map((partner) => {
                const isIngrid = partner.partner_key === 'ingrid';
                return (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => onNavigate('portal', { portalOwner: partner.partner_key })}
                    className={`group text-left rounded-2xl border transition-colors ${
                      cfg.density === 'compacto' ? 'p-3' : 'p-4'
                    } ${
                      isIngrid
                        ? 'bg-[#EC2B82] hover:bg-[#DC2377] border-[#D81F73] text-white'
                        : 'bg-[#7A689C] hover:bg-[#6B598C] border-[#69578A] text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PartnerAvatar
                          name={partner.name}
                          partnerKey={partner.partner_key}
                          avatarUrl={partner.avatar_url}
                          size={cfg.density === 'compacto' ? 'sm' : 'md'}
                          isOnline={partner.is_online}
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white truncate">{partner.name}</p>
                          <p className="text-[11px] text-white/85 truncate">
                            {partner.is_online
                              ? 'Online agora'
                              : partner.last_seen_at
                              ? formatRelativeTime(partner.last_seen_at)
                              : 'Offline'}
                          </p>
                        </div>
                      </div>
                      {cfg.density === 'compacto' ? (
                        <span className="text-[11px] font-semibold bg-white/15 px-2.5 py-1 rounded-full tabular-nums shrink-0">
                          {partner.active_boards} quadros
                        </span>
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-white/80 group-hover:text-white transition-colors shrink-0" />
                      )}
                    </div>

                    {cfg.density !== 'compacto' && (
                      <div className="mt-3 pt-2.5 border-t border-white/25 flex items-center justify-between text-[11px] font-medium text-white/95 tabular-nums">
                        <span>{partner.clients_count} clientes</span>
                        <span>{partner.active_boards} quadros</span>
                        <span>{partner.pending_cards} tarefas</span>
                      </div>
                    )}

                    {cfg.density === 'expandido' && (
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-white/85">
                        <span>Portal dedicado</span>
                        <span className="font-semibold underline-offset-2 group-hover:underline">
                          Abrir área →
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      /* 8. RESUMO FINANCEIRO */
      case 'finance': {
        if (!user.permissions.can_manage_finance) return null;
        const pad = cfg.density === 'compacto' ? 'p-4 sm:p-5' : 'p-5 sm:p-6';
        const income = fin?.month_income ?? 0;
        const expense = fin?.total_expense ?? 0;
        const totalFlow = Math.max(1, income + expense);
        const incomePct = Math.round((income / totalFlow) * 100);

        return (
          <div
            style={custom?.style}
            className={`rounded-[26px] space-y-4 ${pad} ${
              cfg.useDefaultStyle
                ? 'aumi-glass-strong'
                : `border ${custom?.extraClass || ''}`
            }`}
          >
            <div>
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className={`w-4 h-4 ${isLightText ? 'text-white' : 'text-[#E1754C]'}`} />
                  <h3 className={`text-base font-semibold ${headingClass}`}>Resumo Financeiro</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('financeiro')}
                  className={`text-xs font-semibold hover:underline ${
                    isLightText ? 'text-white' : 'text-[#EC2B82]'
                  }`}
                >
                  Abrir módulo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={`${innerTileClass} p-3.5 rounded-2xl`}>
                <p className={`text-[11px] ${subtextClass}`}>Saldo em caixa</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${headingClass}`}>
                  {formatBRL(fin?.balance ?? 0)}
                </p>
              </div>
              {cfg.density === 'compacto' ? (
                <div className={`${innerTileClass} p-3.5 rounded-2xl`}>
                  <p className={`text-[11px] ${subtextClass}`}>A receber</p>
                  <p
                    className={`mt-1 text-lg font-semibold tabular-nums ${
                      isLightText ? 'text-white' : 'text-[#E1754C]'
                    }`}
                  >
                    {formatBRL(fin?.pending_receivable ?? 0)}
                  </p>
                </div>
              ) : (
                <>
                  <div className={`${innerTileClass} p-3.5 rounded-2xl`}>
                    <p className={`text-[11px] ${subtextClass}`}>Entradas do mês</p>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${headingClass}`}>
                      {formatBRL(fin?.month_income ?? 0)}
                    </p>
                  </div>
                  <div className={`${innerTileClass} p-3.5 rounded-2xl`}>
                    <p className={`text-[11px] ${subtextClass}`}>A receber</p>
                    <p
                      className={`mt-1 text-lg font-semibold tabular-nums ${
                        isLightText ? 'text-white' : 'text-[#E1754C]'
                      }`}
                    >
                      {formatBRL(fin?.pending_receivable ?? 0)}
                    </p>
                  </div>
                  <div className={`${innerTileClass} p-3.5 rounded-2xl`}>
                    <p className={`text-[11px] ${subtextClass}`}>Despesas pagas</p>
                    <p
                      className={`mt-1 text-lg font-semibold tabular-nums ${
                        isLightText ? 'text-white' : 'text-[#7A689C]'
                      }`}
                    >
                      {formatBRL(fin?.total_expense ?? 0)}
                    </p>
                  </div>
                </>
              )}
            </div>

            {cfg.density === 'expandido' && (
              <div className={`${innerTileClass} p-3.5 rounded-2xl space-y-2`}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className={subtextClass}>Proporção Entradas × Despesas</span>
                  <span className={`font-semibold tabular-nums ${headingClass}`}>
                    {incomePct}% entradas
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-black/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#C8C978] transition-all"
                    style={{ width: `${incomePct}%` }}
                  />
                </div>
                <p className={`text-[11px] tabular-nums ${subtextClass}`}>
                  Projeção com recebíveis: <strong className={headingClass}>{formatBRL((fin?.balance ?? 0) + (fin?.pending_receivable ?? 0))}</strong>
                </p>
              </div>
            )}
          </div>
        );
      }

      /* 9. ATIVIDADES RECENTES */
      case 'activities': {
        const pad = cfg.density === 'compacto' ? 'p-4 sm:p-5' : 'p-5 sm:p-6';
        const limit = cfg.density === 'compacto' ? 4 : cfg.density === 'expandido' ? 12 : 7;

        return (
          <div
            style={custom?.style}
            className={`rounded-[26px] space-y-4 ${pad} ${
              cfg.useDefaultStyle
                ? 'aumi-glass-strong'
                : `border ${custom?.extraClass || ''}`
            }`}
          >
            <div>
              {cfg.accentBar && <DecorativeAccentBar color={cfg.accentBarColor} darkBg={isLightText} />}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${isLightText ? 'text-white' : 'text-[#7A689C]'}`} />
                  <h3 className={`text-base font-semibold ${headingClass}`}>Atividades recentes</h3>
                </div>
                <span className={`text-[11px] tabular-nums ${eyebrowClass}`}>
                  {data?.recent_activities.length ?? 0} registros
                </span>
              </div>
            </div>

            {!data?.recent_activities.length ? (
              <p className={`text-sm py-4 text-center ${subtextClass}`}>
                Nenhuma atividade registrada ainda.
              </p>
            ) : (
              <div className={cfg.density === 'compacto' ? 'space-y-2' : 'space-y-3'}>
                {data.recent_activities.slice(0, limit).map((act) => (
                  <div
                    key={act.id}
                    className={`flex items-start gap-3 text-xs ${
                      cfg.density === 'expandido'
                        ? `p-2.5 rounded-2xl ${isLightText ? 'bg-white/10' : 'bg-white/75 border border-black/[0.04]'}`
                        : ''
                    }`}
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                        isLightText ? 'text-white/85' : 'text-[#5D601E]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`leading-snug ${isLightText ? 'text-white/90' : 'text-[#232122]/85'}`}>
                        <span className={`font-semibold ${headingClass}`}>{act.actor_name}</span> ·{' '}
                        {act.details || formatActivityActionPT(act.action)}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${subtextClass}`}>
                        {formatRelativeTime(act.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  }

  return (
    <div
      className={`space-y-5 pb-12 transition-[padding] duration-300 ${
        editMode ? 'xl:pr-[372px]' : ''
      }`}
    >
      {/* Live Edit Mode Banner */}
      {editMode && (
        <div className="rounded-2xl bg-gradient-to-r from-[#F6F6E4] via-white to-[#F3ECF9] border border-[#DAD994] px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#C8C978] text-[#2F1534] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#2F1534]">
                Modo de personalização do painel ativo
              </p>
              <p className="text-[11px] text-[#5D601E]">
                Arraste para reorganizar, redimensione pela borda direita ou clique em qualquer widget para editar cores e modelo.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && !draftLayout.autoSave && (
              <button
                type="button"
                onClick={handleSaveLayout}
                disabled={savingLayout}
                className="px-3 py-1.5 rounded-xl bg-[#C8C978] hover:bg-[#B8B963] text-[#2F1534] text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingLayout ? 'Salvando...' : 'Salvar agora'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleRestoreDefault}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#F3ECF9] border border-[#D8C5F2] text-[#7A689C] text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Original</span>
            </button>
          </div>
        </div>
      )}

      {/* Subtle transient save feedback toast */}
      {saveNotice && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#2F1534] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-lg">
          <Check className="w-3.5 h-3.5 text-[#DAD994]" />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Modular 12-Column Responsive Bento Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch"
      >
        {visibleWidgets.map((cfg) => {
          const meta = HOME_WIDGET_REGISTRY[cfg.id];
          const isSelected = editMode && selectedWidgetId === cfg.id;
          const isDragged = draggedWidgetId === cfg.id;
          const isDragOver = dragOverWidgetId === cfg.id && draggedWidgetId !== cfg.id;
          const allowedSpans = ALLOWED_COL_SPANS.filter((s) => s >= meta.minColSpan);
          const canShrink = cfg.colSpan > allowedSpans[0];
          const canGrow = cfg.colSpan < allowedSpans[allowedSpans.length - 1];
          const spansTwoRows = rowSpanTwoIds.has(cfg.id);

          const floatingPostItsSpanClass =
            cfg.colSpan >= 10
              ? 'md:col-span-6 lg:col-span-12'
              : cfg.colSpan >= 8
              ? 'md:col-span-6 lg:col-span-4'
              : 'md:col-span-6 lg:col-span-5';

          return (
            <React.Fragment key={cfg.id}>
              <div
                draggable={editMode && !resizingWidgetId}
                onDragStart={(e) => {
                  if (!editMode) return;
                  setDraggedWidgetId(cfg.id);
                  setSelectedWidgetId(cfg.id);
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', cfg.id);
                }}
                onDragOver={(e) => {
                  if (!editMode || !draggedWidgetId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverWidgetId !== cfg.id) setDragOverWidgetId(cfg.id);
                }}
                onDragLeave={() => {
                  if (dragOverWidgetId === cfg.id) setDragOverWidgetId(null);
                }}
                onDrop={(e) => {
                  if (!editMode) return;
                  e.preventDefault();
                  const source = (e.dataTransfer.getData('text/plain') || draggedWidgetId) as HomeWidgetId | null;
                  if (source && source !== cfg.id) {
                    reorderWidgetsByDrop(source, cfg.id);
                  }
                  setDraggedWidgetId(null);
                  setDragOverWidgetId(null);
                }}
                onDragEnd={() => {
                  setDraggedWidgetId(null);
                  setDragOverWidgetId(null);
                }}
                onClick={() => {
                  if (editMode) setSelectedWidgetId(cfg.id);
                }}
                className={`relative flex flex-col transition-all duration-200 ${getColSpanClass(cfg.colSpan)} ${
                  spansTwoRows ? 'lg:row-span-2' : ''
                } ${
                  editMode ? 'rounded-[30px]' : ''
                } ${
                  isSelected
                    ? 'ring-2 ring-[#7A689C] ring-offset-2 ring-offset-[#FBF8FE]'
                    : editMode
                    ? 'ring-1 ring-dashed ring-[#7A689C]/35 hover:ring-[#C8C978]'
                    : ''
                } ${isDragged ? 'opacity-45 scale-[0.985]' : ''} ${
                  isDragOver ? 'ring-2 ring-[#C8C978] ring-offset-2 scale-[1.01]' : ''
                }`}
              >
                {/* Edit Toolbar above each widget when in editMode */}
                {editMode && (
                  <div
                    className="mb-2 px-2.5 py-1.5 rounded-2xl bg-white/95 border border-[#DECFF5] shadow-xs flex items-center justify-between gap-2 flex-wrap"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedWidgetId(cfg.id);
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 cursor-grab active:cursor-grabbing">
                      <GripVertical className="w-3.5 h-3.5 text-[#7A689C] shrink-0" />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cfg.accentBarColor }}
                      />
                      <span className="text-[11px] font-bold text-[#2F1534] truncate">
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Density quick buttons: C / P / E */}
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F6F6E4] border border-[#DAD994]">
                        {DENSITY_SHORT_LABELS.map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            title={`Modelo ${d.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateWidget(cfg.id, { density: d.id });
                            }}
                            className={`w-5.5 h-5.5 rounded-md text-[10px] font-bold transition-colors ${
                              cfg.density === d.id
                                ? 'bg-[#C8C978] text-[#2F1534]'
                                : 'text-[#5D601E] hover:bg-white'
                            }`}
                          >
                            {d.short}
                          </button>
                        ))}
                      </div>

                      {/* Width resize - / + */}
                      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-[#F3ECF9] border border-[#DFCEF6]">
                        <button
                          type="button"
                          disabled={!canShrink}
                          title="Reduzir largura"
                          onClick={(e) => {
                            e.stopPropagation();
                            stepWidgetWidth(cfg, -1);
                          }}
                          className="w-5.5 h-5.5 rounded-md flex items-center justify-center text-[#5A487A] hover:bg-white disabled:opacity-30"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-[10px] font-bold text-[#2F1534] tabular-nums px-1">
                          {cfg.colSpan}/12
                        </span>
                        <button
                          type="button"
                          disabled={!canGrow}
                          title="Aumentar largura"
                          onClick={(e) => {
                            e.stopPropagation();
                            stepWidgetWidth(cfg, 1);
                          }}
                          className="w-5.5 h-5.5 rounded-md flex items-center justify-center text-[#5A487A] hover:bg-white disabled:opacity-30"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        title="Personalizar cores e estilo"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWidgetId(cfg.id);
                        }}
                        className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#7A689C] text-white'
                            : 'bg-[#F3ECF9] text-[#7A689C] hover:bg-[#7A689C] hover:text-white'
                        }`}
                      >
                        <Palette className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        title="Ocultar widget"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateWidget(cfg.id, { visible: false });
                        }}
                        className="w-6.5 h-6.5 rounded-lg bg-black/[0.04] hover:bg-red-50 text-[#2F1534]/65 hover:text-red-600 flex items-center justify-center transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Widget Body */}
                <div className="flex-1 flex flex-col [&>*]:flex-1">{renderWidgetContent(cfg)}</div>

                {/* Interactive Right-Edge Drag Resize Handle in editMode */}
                {editMode && (
                  <button
                    type="button"
                    aria-label={`Redimensionar largura de ${meta.label}`}
                    title="Arraste para redimensionar a largura"
                    onPointerDown={(e) => startPointerResize(e, cfg)}
                    className="hidden lg:flex absolute top-14 -right-2 bottom-4 w-4 items-center justify-center cursor-ew-resize group z-20"
                  >
                    <span
                      className={`w-1.5 h-12 rounded-full transition-all ${
                        resizingWidgetId === cfg.id
                          ? 'bg-[#C8C978] h-20 scale-x-125'
                          : 'bg-[#7A689C]/45 group-hover:bg-[#C8C978] group-hover:h-16'
                      }`}
                    />
                  </button>
                )}
              </div>

              {/* Two Independent Floating Physical Post-its directly on the dashboard canvas to the right of Central de Notificações (ZERO card/container) */}
              {cfg.id === 'communication' && (
                <div className={`${floatingPostItsSpanClass} flex items-center justify-center overflow-visible`}>
                  <FloatingPostIts
                    user={user}
                    initialPostIts={data?.studio_postits}
                    openRequest={openPostItRequest}
                    onNoteMutated={() => setNotifRefreshNonce((n) => n + 1)}
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Keep the two independent floating post-its visible even if Central de Notificações is hidden */}
        {!visibleWidgets.some((w) => w.id === 'communication') && (
          <div className="md:col-span-6 lg:col-span-5 flex items-center justify-center overflow-visible">
            <FloatingPostIts
              user={user}
              initialPostIts={data?.studio_postits}
              openRequest={openPostItRequest}
              onNoteMutated={() => setNotifRefreshNonce((n) => n + 1)}
            />
          </div>
        )}
      </div>

      {/* Empty state if all widgets hidden */}
      {visibleWidgets.length === 0 && (
        <div className="rounded-[26px] border-2 border-dashed border-[#D6C3F0] bg-white/75 p-10 text-center space-y-3">
          <p className="text-sm font-bold text-[#2F1534]">Todos os widgets estão ocultos no momento.</p>
          <p className="text-xs text-[#7A689C]">
            Adicione widgets abaixo ou restaure o layout original do Aumi Studio.
          </p>
          <button
            type="button"
            onClick={handleRestoreDefault}
            className="px-4 py-2 rounded-xl bg-[#C8C978] hover:bg-[#B8B963] text-[#2F1534] text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar layout original</span>
          </button>
        </div>
      )}

      {/* Hidden Widgets Quick Re-Add Strip (shown during Edit Mode) */}
      {editMode && hiddenWidgets.length > 0 && (
        <div className="rounded-[24px] border border-dashed border-[#C7B2E8] bg-white/80 p-4 space-y-2.5">
          <p className="text-xs font-bold text-[#7A689C]">
            Widgets ocultos ({hiddenWidgets.length}) — clique para adicionar de volta ao painel
          </p>
          <div className="flex flex-wrap gap-2">
            {hiddenWidgets.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  updateWidget(w.id, { visible: true });
                  setSelectedWidgetId(w.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-[#F6F6E4] hover:bg-[#C8C978] border border-[#DAD994] text-[#5D601E] hover:text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{HOME_WIDGET_REGISTRY[w.id].label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Round Corner Sparkle Button to Open/Toggle Home Customization */}
      <button
        type="button"
        onClick={() => setEditMode((v) => !v)}
        aria-label={editMode ? 'Fechar personalização do painel' : 'Personalizar aba inicial'}
        title={editMode ? 'Fechar personalização do painel' : 'Personalizar aba inicial'}
        className={`fixed bottom-24 right-5 sm:right-7 z-40 w-13 h-13 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer border-2 ${
          editMode
            ? 'bg-[#C8C978] text-[#2F1534] border-white shadow-[0_14px_34px_-8px_rgba(93,96,30,0.45)] scale-105'
            : 'bg-gradient-to-br from-[#7A689C] via-[#9E7EB4] to-[#C8C978] text-white border-white/85 shadow-[0_16px_36px_-10px_rgba(47,21,52,0.42)] hover:scale-110'
        }`}
      >
        <Sparkles className={`w-5.5 h-5.5 transition-transform duration-300 ${editMode ? 'rotate-12' : ''}`} />
        {hasUnsavedChanges && (
          <span
            className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#EC2B82] border-2 border-white"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Customization Panel (Live Preview, Solid/Gradient/Liquid, Aumi Palette & Custom Colors, Layout Models, Restore) */}
      <HomeLayoutEditorPanel
        open={editMode}
        draft={draftLayout}
        selectedWidgetId={selectedWidgetId}
        hasUnsavedChanges={hasUnsavedChanges}
        saving={savingLayout}
        canManageFinance={user.permissions.can_manage_finance}
        onSelectWidget={setSelectedWidgetId}
        onUpdateWidget={updateWidget}
        onMoveWidget={moveWidgetByStep}
        onToggleAutoSave={handleToggleAutoSave}
        onSave={handleSaveLayout}
        onDiscard={handleDiscardPreview}
        onRestoreDefault={handleRestoreDefault}
        onClose={() => setEditMode(false)}
      />

      {/* KPI Drilldown MacWindow (100% preserved) */}
      <MacWindow
        open={Boolean(kpiModalKey)}
        onClose={() => setKpiModalKey(null)}
        maxWidthClass="max-w-2xl"
        title={kpiModalKey ? KPI_DRILL_TITLES[kpiModalKey].title : ''}
        subtitle={kpiModalKey ? KPI_DRILL_TITLES[kpiModalKey].subtitle : ''}
        icon={<FolderKanban className="w-4 h-4 text-[#EC2B82]" />}
      >
        <div className="p-5 sm:p-6 bg-white space-y-3">
          {kpiModalKey === 'boards_in_progress' && (
            <>
              {!data?.drilldowns?.boards_in_progress.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Nenhum quadro ativo no momento.</p>
              ) : (
                data.drilldowns.boards_in_progress.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('portal', { boardId: b.id, portalOwner: b.portal_owner });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#EC2B82] hover:bg-[#FDF2F6]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{b.title}</p>
                      <p className="text-xs text-[#232122]/60 truncate">
                        {b.client_name} · {b.completed_cards}/{b.total_cards} entregas concluídas
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#EC2B82] shrink-0">Abrir quadro →</span>
                  </button>
                ))
              )}
            </>
          )}

          {kpiModalKey === 'approval_cards' && (
            <>
              {!data?.drilldowns?.approval_cards.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Nenhuma entrega aguardando aprovação.</p>
              ) : (
                data.drilldowns.approval_cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('portal', { boardId: c.board_id, portalOwner: c.portal_owner });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#7A689C] hover:bg-[#F3ECF9]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{c.title}</p>
                      <p className="text-xs text-[#232122]/60 truncate">
                        {c.client_name} · {c.board_title} ({c.column_title})
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#7A689C] shrink-0">Revisar →</span>
                  </button>
                ))
              )}
            </>
          )}

          {kpiModalKey === 'boards_completed' && (
            <>
              {!data?.drilldowns?.boards_completed.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Nenhum projeto concluído ainda.</p>
              ) : (
                data.drilldowns.boards_completed.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('portal', { boardId: b.id, portalOwner: b.portal_owner });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#C8C978] hover:bg-[#F4F5E2]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{b.title}</p>
                      <p className="text-xs text-[#232122]/60 truncate">{b.client_name}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#5D601E] shrink-0">Ver projeto →</span>
                  </button>
                ))
              )}
            </>
          )}

          {kpiModalKey === 'upcoming_deadlines' && (
            <>
              {!data?.drilldowns?.upcoming_deadlines.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Sem prazos nos próximos 7 dias.</p>
              ) : (
                data.drilldowns.upcoming_deadlines.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('portal', { boardId: c.board_id, portalOwner: c.portal_owner });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#E1754C] hover:bg-[#FDF0E8]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{c.title}</p>
                      <p className="text-xs text-[#232122]/60 truncate">
                        {c.client_name} · {c.board_title}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#E1754C] tabular-nums shrink-0">
                      {formatShortDateBR(c.due_date)}
                    </span>
                  </button>
                ))
              )}
            </>
          )}

          {kpiModalKey === 'pending_tasks' && (
            <>
              {!data?.drilldowns?.pending_tasks.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Nenhuma tarefa aberta no momento.</p>
              ) : (
                data.drilldowns.pending_tasks.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('portal', { boardId: c.board_id, portalOwner: c.portal_owner });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#7A689C] hover:bg-[#F3ECF9]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{c.title}</p>
                      <p className="text-xs text-[#232122]/60 truncate">
                        {c.client_name} · {c.board_title} · {c.column_title}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#7A689C] shrink-0">Abrir →</span>
                  </button>
                ))
              )}
            </>
          )}

          {kpiModalKey === 'active_clients' && (
            <>
              {!data?.drilldowns?.active_clients.length ? (
                <p className="text-xs text-[#232122]/55 py-6 text-center">Nenhum cliente ativo com quadro no momento.</p>
              ) : (
                data.drilldowns.active_clients.map((cl) => (
                  <button
                    key={cl.id}
                    type="button"
                    onClick={() => {
                      setKpiModalKey(null);
                      onNavigate('clientes', { clientId: cl.id });
                    }}
                    className="w-full text-left p-3.5 rounded-2xl border border-black/[0.08] hover:border-[#EC2B82] hover:bg-[#FDF2F6]/40 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#2F1534] truncate">{cl.name}</p>
                      <p className="text-xs text-[#232122]/60 truncate">
                        {cl.company || 'Sem empresa'} · {cl.active_boards_count} quadro(s) ativo(s)
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-[#EC2B82] shrink-0">Ver perfil →</span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </MacWindow>
    </div>
  );
}
