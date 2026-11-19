import React, { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderKanban,
  Layers,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { api, formatActivityActionPT, formatBRL, formatRelativeTime, formatShortDateBR } from '../lib/api.ts';
import {
  ActivityLog,
  Client,
  MainTab,
  MuralPost,
  PartnerKey,
  PartnerStatusItem,
  StudioEvent,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
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
}

export function DashboardHome({ user, onNavigate }: DashboardHomeProps) {
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
  const liveClockStr = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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

  const KPI_DRILL_TITLES: Record<KpiDrillKey, { title: string; subtitle: string }> = {
    boards_in_progress: { title: 'Quadros em andamento', subtitle: 'Projetos ativos no estúdio' },
    approval_cards: { title: 'Entregas em aprovação', subtitle: 'Cartões aguardando resposta do cliente' },
    boards_completed: { title: 'Projetos concluídos', subtitle: 'Quadros finalizados e arquiváveis' },
    upcoming_deadlines: { title: 'Entregas próximas do prazo', subtitle: 'Prazos vencendo nos próximos 7 dias' },
    pending_tasks: { title: 'Tarefas e demandas pendentes', subtitle: 'Cartões abertos em quadros ativos' },
    active_clients: { title: 'Clientes ativos', subtitle: 'Contas com projetos em andamento ou rascunho' },
  };

  return (
    <div className="space-y-6 sm:space-y-7">
      {/* Top Row: 3 Independent Side-by-Side Widgets (Boas-vindas | Relógio Rosa | Atalhos Lilás Clarinho) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 items-stretch">
        {/* Widget 1 — Boas-vindas */}
        <div className="md:col-span-1 lg:col-span-5 rounded-[28px] bg-gradient-to-br from-[#7A689C] via-[#5C447E] to-[#2F1534] text-white p-6 relative overflow-hidden shadow-[0_18px_42px_-16px_rgba(47,21,52,0.42)] border border-white/25 flex flex-col justify-between gap-3">
          <div
            className="absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-40 pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(236,151,183,0.65) 0%, transparent 70%)' }}
          />
          <div className="relative z-10 space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-[11px] font-medium text-[#F6EEFC]">
              <Sparkles className="w-3.5 h-3.5 text-[#DAD994]" />
              <span className="capitalize">{liveWeekdayStr}, {liveDateStr}</span>
            </div>
            <h1 className="font-editorial text-2xl sm:text-[32px] text-white leading-tight">
              {greeting}, {user.name}.
            </h1>
            <p className="text-[13px] text-white/82 leading-relaxed">
              Central operacional do Aumi Studio: acompanhe clientes, quadros ativos, copies compartilhadas, compromissos e saúde financeira em tempo real.
            </p>
          </div>
        </div>

        {/* Widget 2 — Relógio (Roxo sólido da paleta do sistema) */}
        <div className="md:col-span-1 lg:col-span-3 rounded-[28px] bg-[#7A689C] text-white p-6 relative overflow-hidden shadow-[0_14px_30px_-14px_rgba(79,57,118,0.45)] border border-[#68578A] flex flex-col justify-between">
          <div className="relative z-10 flex items-center justify-between gap-2">
            <span className="text-[10.5px] uppercase tracking-widest text-white/85 font-bold">
              Horário local
            </span>
            <span className="w-8 h-8 rounded-xl bg-[#665488] border border-white/15 flex items-center justify-center text-white">
              <Clock className="w-4 h-4" />
            </span>
          </div>

          <div className="relative z-10 my-3">
            <p className="text-4xl sm:text-[42px] font-extrabold text-white tabular-nums tracking-tight leading-none">
              {liveClockStr}
            </p>
          </div>

          <div className="relative z-10">
            <p className="inline-flex items-center px-3 py-1 rounded-full bg-[#665488] border border-white/15 text-[11.5px] font-bold text-white capitalize">
              {liveWeekdayStr} · {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(now)}
            </p>
          </div>
        </div>

        {/* Widget 3 — Atalhos (Lilás clarinho da paleta do sistema) */}
        <div className="md:col-span-2 lg:col-span-4 rounded-[28px] bg-gradient-to-br from-[#F3ECF9] via-[#EFE6FB] to-[#E9DCFA] text-[#2F1534] p-6 relative overflow-hidden shadow-[0_18px_38px_-16px_rgba(122,104,156,0.22)] border border-[#BC9FE6]/60 flex flex-col justify-between gap-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A689C]">
              Atalhos rápidos
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 flex-1">
            <button
              type="button"
              onClick={() => onNavigate('portal', { portalOwner: user.partner_key || 'ingrid' })}
              className="px-3.5 py-3 rounded-2xl bg-white/90 hover:bg-white border border-[#BC9FE6]/45 hover:border-[#EC2B82]/55 text-[#2F1534] text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all text-left"
            >
              <span className="w-7 h-7 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
                <FolderKanban className="w-3.5 h-3.5" />
              </span>
              <span className="leading-tight">Meu Portal do Cliente</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('clientes', { quickAction: 'new-client' })}
              className="px-3.5 py-3 rounded-2xl bg-white/90 hover:bg-white border border-[#BC9FE6]/45 hover:border-[#7A689C] text-[#2F1534] text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all text-left"
            >
              <span className="w-7 h-7 rounded-xl bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center shrink-0">
                <UserPlus className="w-3.5 h-3.5" />
              </span>
              <span className="leading-tight">Novo Cliente</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('financeiro')}
              className="px-3.5 py-3 rounded-2xl bg-white/90 hover:bg-white border border-[#BC9FE6]/45 hover:border-[#E1754C]/65 text-[#2F1534] text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all text-left"
            >
              <span className="w-7 h-7 rounded-xl bg-[#FDF0E8] text-[#E1754C] flex items-center justify-center shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </span>
              <span className="leading-tight">Financeiro</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('servicos')}
              className="px-3.5 py-3 rounded-2xl bg-white/90 hover:bg-white border border-[#BC9FE6]/45 hover:border-[#7A689C] text-[#2F1534] text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all text-left"
            >
              <span className="w-7 h-7 rounded-xl bg-[#F4F5E2] text-[#5D601E] flex items-center justify-center shrink-0">
                <Layers className="w-3.5 h-3.5" />
              </span>
              <span className="leading-tight">Serviços</span>
            </button>
          </div>
        </div>
      </section>

      {/* Real KPI Strip — ALL 6 clickable with drilldown */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <button
          type="button"
          onClick={() => setKpiModalKey('boards_in_progress')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#BC9FE6] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Em andamento</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.boards_in_progress ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#EC2B82] font-medium">Quadros ativos</p>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('approval_cards')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#EC97B7] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Em aprovação</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.boards_awaiting_approval ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#7A689C] font-medium">Aguardando cliente</p>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('boards_completed')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#C8C978] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Concluídos</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.boards_completed ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#5D601E] font-medium">Projetos finalizados</p>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('upcoming_deadlines')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#E1754C] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Próximas do prazo</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.upcoming_deadlines_count ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#E1754C] font-medium">Próximos 7 dias</p>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('pending_tasks')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#7A689C] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Tarefas pendentes</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.pending_tasks ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#232122]/55">Cartões abertos</p>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('active_clients')}
          className="text-left p-4 rounded-2xl aumi-glass hover:border-[#EC2B82] transition-all"
        >
          <p className="text-[11px] font-medium text-[#7A689C]">Clientes ativos</p>
          <p className="mt-1.5 text-2xl sm:text-3xl font-semibold text-[#2F1534] tabular-nums">
            {m?.active_clients ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-[#232122]/60 tabular-nums">{m?.total_clients ?? 0} no CRM</p>
        </button>
      </section>

      {/* Restructured Home Mural (Mini web environment with Chrome-style tabs, real-time sync, Portal ticker) */}
      <section>
        <StudioHomeMuralWidget
          user={user}
          partners={data?.partner_status || []}
          initialPosts={data?.mural_posts || []}
          onNavigate={onNavigate}
        />
      </section>

      {/* Main Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT 7 cols: Compromissos & Calendário */}
        <div className="lg:col-span-7 space-y-6">
          {/* Compromissos & Calendário Integrado (Dia / Semana / Mês) */}
          <div className="aumi-glass-strong rounded-[26px] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#FDF0E8] text-[#E1754C] flex items-center justify-center">
                  <CalendarClock className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-[#2F1534]">Compromissos &amp; Calendário</h3>
                  <p className="text-xs text-[#232122]/55">Agenda do estúdio e entregas previstas por dia, semana ou mês</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/80 border border-black/[0.06]">
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
                        calendarView === v.id ? 'bg-[#2F1534] text-white' : 'text-[#232122]/65 hover:text-[#2F1534]'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
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

            {showEventForm && (
              <form onSubmit={handleCreateEvent} className="aumi-surface-solid rounded-2xl p-4 space-y-3">
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

            {/* Calendar Navigator */}
            <div className="aumi-surface-solid rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#2F1534] capitalize">{monthYearLabel}</span>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Próximos compromissos */}
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7A689C]">Próximos compromissos</p>
                {!allEvents.length ? (
                  <p className="text-xs text-[#232122]/50 py-4 text-center">Nenhum compromisso agendado.</p>
                ) : (
                  <div className="space-y-2">
                    {allEvents.slice(0, 5).map((ev) => (
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
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#E1754C]">Entregas (7 dias)</p>
                  <button
                    type="button"
                    onClick={() => onNavigate('portal')}
                    className="text-[11px] font-medium text-[#7A689C] hover:underline"
                  >
                    Ver quadros
                  </button>
                </div>
                {!data?.upcoming_deliverables.length ? (
                  <p className="text-xs text-[#232122]/50 py-4 text-center">
                    Nenhuma entrega vencendo nos próximos 7 dias.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.upcoming_deliverables.slice(0, 5).map((item) => (
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

        </div>

        {/* RIGHT 5 cols: Status Ingrid & Mariana + Financeiro + Atividades */}
        <div className="lg:col-span-5 space-y-6">
          {/* Status de Ingrid e Mariana em tempo real (cores sólidas por perfil) */}
          <div className="bg-white rounded-[26px] border border-[#E6D9F5] shadow-[0_12px_28px_-16px_rgba(47,21,52,0.18)] p-5 sm:p-6 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#7A689C]" />
                <h3 className="text-base font-semibold text-[#2F1534]">Sócias &amp; Portais</h3>
              </div>
              <span className="text-[11px] text-[#7A689C] font-medium">Presença real</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              {(data?.partner_status || []).map((partner) => {
                const isIngrid = partner.partner_key === 'ingrid';
                return (
                  <button
                    key={partner.id}
                    type="button"
                    onClick={() => onNavigate('portal', { portalOwner: partner.partner_key })}
                    className={`group text-left p-4 rounded-2xl border transition-colors ${
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
                          size="md"
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
                      <ArrowUpRight className="w-4 h-4 text-white/80 group-hover:text-white transition-colors shrink-0" />
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/25 flex items-center justify-between text-[11px] font-medium text-white/95 tabular-nums">
                      <span>{partner.clients_count} clientes</span>
                      <span>{partner.active_boards} quadros</span>
                      <span>{partner.pending_cards} tarefas</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Resumo Financeiro */}
          {user.permissions.can_manage_finance && (
            <div className="aumi-glass-strong rounded-[26px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#E1754C]" />
                  <h3 className="text-base font-semibold text-[#2F1534]">Resumo Financeiro</h3>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('financeiro')}
                  className="text-xs font-semibold text-[#EC2B82] hover:underline"
                >
                  Abrir módulo
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="aumi-surface-solid p-3.5 rounded-2xl">
                  <p className="text-[11px] text-[#232122]/55">Saldo em caixa</p>
                  <p className="mt-1 text-lg font-semibold text-[#2F1534] tabular-nums">
                    {formatBRL(fin?.balance ?? 0)}
                  </p>
                </div>
                <div className="aumi-surface-solid p-3.5 rounded-2xl">
                  <p className="text-[11px] text-[#232122]/55">Entradas do mês</p>
                  <p className="mt-1 text-lg font-semibold text-[#2F1534] tabular-nums">
                    {formatBRL(fin?.month_income ?? 0)}
                  </p>
                </div>
                <div className="aumi-surface-solid p-3.5 rounded-2xl">
                  <p className="text-[11px] text-[#232122]/55">A receber</p>
                  <p className="mt-1 text-lg font-semibold text-[#E1754C] tabular-nums">
                    {formatBRL(fin?.pending_receivable ?? 0)}
                  </p>
                </div>
                <div className="aumi-surface-solid p-3.5 rounded-2xl">
                  <p className="text-[11px] text-[#232122]/55">Despesas pagas</p>
                  <p className="mt-1 text-lg font-semibold text-[#7A689C] tabular-nums">
                    {formatBRL(fin?.total_expense ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Atividades Recentes */}
          <div className="aumi-glass-strong rounded-[26px] p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#7A689C]" />
              <h3 className="text-base font-semibold text-[#2F1534]">Atividades recentes</h3>
            </div>

            {!data?.recent_activities.length ? (
              <p className="text-sm text-[#232122]/50 py-4 text-center">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {data.recent_activities.slice(0, 7).map((act) => (
                  <div key={act.id} className="flex items-start gap-3 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#7A689C] mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[#232122]/85 leading-snug">
                        <span className="font-semibold text-[#2F1534]">{act.actor_name}</span> · {act.details || formatActivityActionPT(act.action)}
                      </p>
                      <p className="text-[11px] text-[#232122]/45 mt-0.5">{formatRelativeTime(act.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Drilldown MacWindow */}
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

