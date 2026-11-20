import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  CheckCircle2,
  FolderKanban,
  Layers,
  StickyNote,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { api, getAuthToken } from '../lib/api.ts';
import { playConfirmClick, playNotificationPop } from '../lib/sounds.ts';
import {
  MainTab,
  MuralPost,
  NotificationCategory,
  NotificationItem,
  PartnerKey,
  PartnerStatusItem,
  User,
  WidgetDensity,
} from '../types/aumi.ts';

interface StudioHomeMuralWidgetProps {
  user: User;
  partners?: PartnerStatusItem[];
  initialPosts?: MuralPost[];
  density?: WidgetDensity;
  customShellStyle?: React.CSSProperties;
  customShellClass?: string;
  accentBar?: boolean;
  accentBarColor?: string;
  refreshNonce?: number;
  onOpenPostIt?: (ownerKey: PartnerKey) => void;
  onNavigate: (
    tab: MainTab,
    extra?: { portalOwner?: PartnerKey; boardId?: string; clientId?: string; quickAction?: string }
  ) => void;
}

type FilterCategory = 'all' | NotificationCategory;

function formatNotifTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin} min`;
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function resolveNotificationCategory(n: NotificationItem): NotificationCategory {
  if (n.category === 'portal' || n.category === 'sistema' || n.category === 'socias') {
    return n.category;
  }
  const t = (n.type || '').toLowerCase();
  if (t.includes('partner_chat') || t.includes('postit') || t.includes('studio_demand')) {
    return 'socias';
  }
  if (
    n.link_tab === 'portal' ||
    Boolean(n.board_id) ||
    t.includes('portal') ||
    t.includes('approval') ||
    t.includes('card_mini_update') ||
    t.includes('client')
  ) {
    return 'portal';
  }
  return 'sistema';
}

function getNotificationVisual(n: NotificationItem): {
  bg: string;
  icon: React.ReactNode;
  originFallback: string;
} {
  const t = (n.type || '').toLowerCase();
  const cat = resolveNotificationCategory(n);

  if (t.includes('postit')) {
    return {
      bg: 'bg-[#C8C978]',
      icon: <StickyNote className="w-4.5 h-4.5 text-[#2F1534]" />,
      originFallback: 'Post-it · Painel Inicial',
    };
  }
  if (t.includes('approved') || t.includes('completed') || t.includes('conclu')) {
    return {
      bg: 'bg-[#C8C978]',
      icon: <CheckCircle2 className="w-4.5 h-4.5 text-[#2F1534]" />,
      originFallback: 'Portal do Cliente · Concluído',
    };
  }
  if (t.includes('finance') || n.link_tab === 'financeiro') {
    return {
      bg: 'bg-[#DAD994]',
      icon: <Wallet className="w-4.5 h-4.5 text-[#2F1534]" />,
      originFallback: 'Sistema · Financeiro',
    };
  }
  if (t.includes('event') || t.includes('deadline') || t.includes('calendar')) {
    return {
      bg: 'bg-[#6A578F]',
      icon: <CalendarClock className="w-4.5 h-4.5 text-white" />,
      originFallback: 'Sistema · Compromissos',
    };
  }
  if (cat === 'portal') {
    return {
      bg: 'bg-[#C8C978]',
      icon: <FolderKanban className="w-4.5 h-4.5 text-[#2F1534]" />,
      originFallback: n.client_name ? `Portal do Cliente · ${n.client_name}` : 'Portal do Cliente',
    };
  }
  if (cat === 'socias') {
    return {
      bg: 'bg-[#7A689C]',
      icon: <Users className="w-4.5 h-4.5 text-white" />,
      originFallback: 'Interação · Sócias',
    };
  }
  if (n.link_tab === 'servicos') {
    return {
      bg: 'bg-[#DAD994]',
      icon: <Layers className="w-4.5 h-4.5 text-[#2F1534]" />,
      originFallback: 'Sistema · Serviços',
    };
  }
  return {
    bg: 'bg-[#5E4B82]',
    icon: <Bell className="w-4.5 h-4.5 text-white" />,
    originFallback: 'Sistema · Aumi Studio',
  };
}

interface SwipeNotificationCardProps {
  item: NotificationItem;
  onOpen: (n: NotificationItem) => void;
  onToggleRead: (n: NotificationItem, e: React.MouseEvent) => void;
  onDelete: (id: string) => void;
}

function SwipeNotificationCard({
  item,
  onOpen,
  onToggleRead,
  onDelete,
}: SwipeNotificationCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const startXRef = useRef<number | null>(null);
  const startYRef = useRef<number | null>(null);
  const swipedRef = useRef(false);

  const isUnread = Number(item.is_read) === 0;
  const visual = getNotificationVisual(item);
  const originText = item.origin_label || visual.originFallback;

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    swipedRef.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging || startXRef.current === null || startYRef.current === null) return;
    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;
    if (!swipedRef.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) {
      setDragging(false);
      startXRef.current = null;
      return;
    }
    if (dx < -6) {
      swipedRef.current = true;
      setOffsetX(Math.max(-180, dx));
    } else if (dx > 0) {
      setOffsetX(Math.min(18, dx * 0.25));
    }
  }

  function handlePointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (offsetX <= -96) {
      setDismissing(true);
      setOffsetX(-320);
      window.setTimeout(() => {
        onDelete(item.id);
      }, 170);
    } else {
      setOffsetX(0);
    }
    startXRef.current = null;
    startYRef.current = null;
  }

  function handleCardClick() {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    onOpen(item);
  }

  const revealOpacity = Math.min(1, Math.abs(Math.min(0, offsetX)) / 70);

  return (
    <div
      className={`relative rounded-[20px] overflow-hidden select-none transition-all duration-200 ${
        dismissing ? 'opacity-0 scale-y-90' : 'opacity-100'
      }`}
    >
      {/* Underlying Swipe-to-Dismiss Action Surface */}
      <div
        aria-hidden="true"
        style={{ opacity: revealOpacity }}
        className="absolute inset-0 bg-gradient-to-r from-[#E1754C] to-[#DC2626] flex items-center justify-end pr-6 text-white font-semibold text-xs gap-2"
      >
        <Trash2 className="w-4 h-4" />
        <span>Solte para descartar</span>
      </div>

      {/* Main iOS-inspired Notification Card */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(item);
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{
          transform: `translate3d(${offsetX}px, 0, 0)`,
          transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className={`group relative rounded-[20px] p-3.5 border touch-pan-y cursor-pointer transition-colors ${
          isUnread
            ? 'bg-white border-[#C8C978] shadow-[0_8px_20px_-14px_rgba(93,96,30,0.22)] hover:border-[#A9AB52]'
            : 'bg-white/88 border-[#E2E2BE] hover:bg-white hover:border-[#7A689C]/55'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* Solid palette green/purple category squircle icon */}
          <div
            className={`w-10 h-10 rounded-[13px] ${visual.bg} flex items-center justify-center shrink-0 shadow-[0_6px_14px_-8px_rgba(47,21,52,0.24)]`}
          >
            {visual.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {isUnread && (
                  <span
                    aria-label="Não lida"
                    className="w-2 h-2 rounded-full bg-[#C8C978] shrink-0"
                  />
                )}
                <h4
                  className={`text-[13.5px] leading-snug truncate ${
                    isUnread ? 'font-bold text-[#2F1534]' : 'font-semibold text-[#2F1534]/82'
                  }`}
                >
                  {item.title}
                </h4>
              </div>
              <span className="text-[11px] font-medium text-[#5D601E] tabular-nums whitespace-nowrap shrink-0">
                {formatNotifTimestamp(item.created_at)}
              </span>
            </div>

            <p className="text-[12.5px] leading-snug text-[#2F1534]/75 line-clamp-2">
              {item.message}
            </p>

            {/* Footer: clean unboxed origin + inline actions */}
            <div className="pt-0.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#5D601E] truncate">
                {originText}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title={isUnread ? 'Marcar como lida' : 'Marcar como não lida'}
                  onClick={(e) => onToggleRead(item, e)}
                  className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center transition-colors ${
                    isUnread
                      ? 'text-[#5D601E] hover:bg-[#F1F2D6]'
                      : 'text-[#6A578F]/70 hover:bg-[#F1ECF9] hover:text-[#2F1534]'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  title="Excluir notificação"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="w-6.5 h-6.5 rounded-lg text-[#5D601E]/65 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-6.5 h-6.5 rounded-lg text-[#5D601E]/65 group-hover:text-[#2F1534] flex items-center justify-center transition-colors">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudioHomeMuralWidget({
  user,
  density = 'padrao',
  customShellStyle,
  customShellClass,
  accentBar = false,
  accentBarColor = '#C8C978',
  refreshNonce = 0,
  onOpenPostIt,
  onNavigate,
}: StudioHomeMuralWidgetProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<FilterCategory>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const userPrefsRef = useRef(user.preferences);
  userPrefsRef.current = user.preferences;

  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);

  const syncNotifications = useCallback(async (opts?: { playSoundOnIncoming?: boolean }) => {
    try {
      const res = await api<{ notifications: NotificationItem[] }>('/home-mural/sync');
      const nextNotifs = res.notifications || [];

      if (initialLoadedRef.current && opts?.playSoundOnIncoming) {
        const hasNewUnreadNotif = nextNotifs.some(
          (n) => Number(n.is_read) === 0 && !knownNotifIdsRef.current.has(n.id)
        );
        if (hasNewUnreadNotif) {
          playNotificationPop(userPrefsRef.current);
        }
      }

      knownNotifIdsRef.current = new Set(nextNotifs.map((n) => n.id));
      initialLoadedRef.current = true;
      setNotifications(nextNotifs);
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + SSE real-time stream + gentle fallback sync
  useEffect(() => {
    syncNotifications({ playSoundOnIncoming: false });

    const token = getAuthToken();
    let es: EventSource | null = null;
    if (token && typeof EventSource !== 'undefined') {
      es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('studio', (evt) => {
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as {
            type?: string;
            actorId?: string;
          };
          const fromOther = Boolean(payload.actorId && payload.actorId !== user.id);
          syncNotifications({
            playSoundOnIncoming: fromOther || payload.type === 'notification_created',
          });
        } catch {
          syncNotifications({ playSoundOnIncoming: false });
        }
      });
    }

    const fallbackInterval = window.setInterval(() => {
      syncNotifications({ playSoundOnIncoming: true });
    }, 15000);

    return () => {
      es?.close();
      window.clearInterval(fallbackInterval);
    };
  }, [syncNotifications, user.id]);

  // Immediate refresh when a floating post-it is saved/updated
  useEffect(() => {
    if (refreshNonce > 0) {
      syncNotifications({ playSoundOnIncoming: false });
    }
  }, [refreshNonce, syncNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => Number(n.is_read) === 0).length,
    [notifications]
  );
  const readCount = notifications.length - unreadCount;

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (onlyUnread && Number(n.is_read) !== 0) return false;
      if (filterCat !== 'all' && resolveNotificationCategory(n) !== filterCat) return false;
      return true;
    });
  }, [notifications, filterCat, onlyUnread]);

  async function handleToggleRead(n: NotificationItem, e: React.MouseEvent) {
    e.stopPropagation();
    const nextRead = Number(n.is_read) === 0;
    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, is_read: nextRead ? 1 : 0 } : item))
    );
    playConfirmClick(userPrefsRef.current);
    try {
      await api(`/notifications/${n.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: nextRead }),
      });
    } catch {
      syncNotifications();
    }
  }

  async function handleDeleteNotification(id: string) {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    playConfirmClick(userPrefsRef.current);
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' });
    } catch {
      syncNotifications();
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
    playConfirmClick(userPrefsRef.current);
    try {
      await api('/notifications/read-all', { method: 'POST' });
    } catch {
      syncNotifications();
    }
  }

  async function handleClearRead() {
    if (readCount === 0) return;
    setNotifications((prev) => prev.filter((item) => Number(item.is_read) === 0));
    playConfirmClick(userPrefsRef.current);
    try {
      await api('/notifications/clear/read', { method: 'DELETE' });
    } catch {
      syncNotifications();
    }
  }

  function handleOpenNotificationOrigin(n: NotificationItem) {
    if (Number(n.is_read) === 0) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, is_read: 1 } : item))
      );
      api(`/notifications/${n.id}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ is_read: true }),
      }).catch(() => {});
    }

    const t = (n.type || '').toLowerCase();

    // Direct jump to the matching floating post-it editor modal
    if (t.includes('postit') || n.link_entity_id?.startsWith('postit-')) {
      const targetKey: PartnerKey = n.link_entity_id?.includes('mariana') ? 'mariana' : 'ingrid';
      onOpenPostIt?.(targetKey);
      return;
    }

    // Direct jump to Portal do Cliente / specific board
    if (n.board_id) {
      onNavigate('portal', {
        boardId: n.board_id,
        portalOwner: n.portal_owner || undefined,
      });
      return;
    }

    if (n.link_tab === 'portal') {
      onNavigate('portal', {
        boardId: n.link_entity_id || undefined,
        portalOwner: n.portal_owner || undefined,
      });
      return;
    }

    const validTabs: MainTab[] = [
      'inicio',
      'portal',
      'servicos',
      'clientes',
      'financeiro',
      'sociedade',
      'configuracoes',
    ];
    if (n.link_tab && validTabs.includes(n.link_tab as MainTab) && n.link_tab !== 'inicio') {
      onNavigate(n.link_tab as MainTab, {
        clientId: n.link_tab === 'clientes' ? n.link_entity_id || undefined : undefined,
      });
    }
  }

  const listHeightClass =
    density === 'compacto'
      ? 'min-h-[215px] max-h-[250px]'
      : density === 'expandido'
      ? 'min-h-[365px] max-h-[430px]'
      : 'min-h-[270px] max-h-[325px]';

  return (
    <div
      style={customShellStyle}
      className={`rounded-[28px] border transition-all flex flex-col h-full ${
        customShellStyle
          ? customShellClass || ''
          : 'bg-[#F6F6E4] border-[#DAD994] shadow-[0_18px_42px_-24px_rgba(93,96,30,0.22)]'
      } ${density === 'compacto' ? 'p-4 space-y-3' : 'p-4 sm:p-5 space-y-3.5'}`}
    >
      {/* Top Header — CENTRAL DE NOTIFICAÇÕES (sem ícone de brilho) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#C8C978]/40">
        <div>
          {accentBar && (
            <div className="flex items-center gap-1.5 mb-2.5">
              <span
                className="h-1.5 w-11 rounded-full"
                style={{ backgroundColor: accentBarColor }}
              />
              <span className="h-1.5 w-3.5 rounded-full bg-[#7A689C]/55" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#EC2B82]/55" />
            </div>
          )}
          <h2 className="text-[17px] sm:text-[18.5px] font-bold tracking-tight text-[#2F1534] leading-none">
            CENTRAL DE NOTIFICAÇÕES
          </h2>
          <p className="mt-1.5 text-xs text-[#5D601E] tabular-nums">
            Portal do Cliente, sistema e anotações · {notifications.length}{' '}
            {notifications.length === 1 ? 'aviso' : 'avisos'}
            {unreadCount > 0 ? ` · ${unreadCount} não ${unreadCount === 1 ? 'lido' : 'lidos'}` : ' · tudo em dia'}
          </p>
        </div>

        {/* Category Filter Bar + Clean Quick Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="tablist"
            aria-label="Filtrar notificações"
            className="inline-flex items-center gap-0.5 p-1 rounded-2xl bg-[#ECECC8] border border-[#DAD994]"
          >
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'portal', label: 'Portal' },
                { id: 'sistema', label: 'Sistema' },
                { id: 'socias', label: 'Sócias' },
              ] as const
            ).map((tab) => {
              const active = filterCat === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilterCat(tab.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11.5px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#C8C978] text-[#2F1534] shadow-xs'
                      : 'text-[#5D601E] hover:text-[#2F1534]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setOnlyUnread((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              onlyUnread
                ? 'bg-[#7A689C] text-white border-[#68578A]'
                : 'bg-white text-[#2F1534]/80 border-[#DAD994] hover:border-[#7A689C]'
            }`}
          >
            Não lidas{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold bg-[#C8C978] hover:bg-[#B9BA64] text-[#2F1534] border border-[#B5B662] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar lidas</span>
            </button>
          )}

          {readCount > 0 && (
            <button
              type="button"
              onClick={handleClearRead}
              className="px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold bg-white hover:bg-red-50 text-[#5D601E] hover:text-red-600 border border-[#DAD994] transition-colors whitespace-nowrap shrink-0"
            >
              Limpar lidas
            </button>
          )}
        </div>
      </div>

      {/* Notification Feed Surface (Aumi palette soft olive green) */}
      <div className={`flex-1 rounded-[22px] bg-[#EFEFD4] border border-[#DAD994] p-3.5 flex flex-col ${listHeightClass}`}>
        <div className="flex-1 overflow-y-auto pr-1 space-y-2">
          {loading ? (
            <div className="space-y-2.5 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-[20px] bg-white/75" />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="h-full min-h-[185px] flex flex-col items-center justify-center text-center px-5">
              <div className="w-11 h-11 rounded-[15px] bg-[#C8C978] flex items-center justify-center text-[#2F1534] mb-2.5 shadow-sm">
                <Bell className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-[#2F1534]">
                {onlyUnread
                  ? 'Nenhuma notificação não lida por aqui'
                  : 'Central de notificações limpa'}
              </p>
              <p className="mt-1 text-xs text-[#5D601E] max-w-sm">
                Novas atualizações do Portal do Cliente, movimentações do sistema e alterações nos
                post-its aparecerão aqui em tempo real.
              </p>
              {(filterCat !== 'all' || onlyUnread) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterCat('all');
                    setOnlyUnread(false);
                  }}
                  className="mt-2.5 px-3.5 py-1.5 rounded-xl bg-white border border-[#C8C978] text-xs font-semibold text-[#2F1534] hover:bg-[#F6F6E4]"
                >
                  Mostrar todas
                </button>
              )}
            </div>
          ) : (
            filteredNotifications.map((item) => (
              <SwipeNotificationCard
                key={item.id}
                item={item}
                onOpen={handleOpenNotificationOrigin}
                onToggleRead={handleToggleRead}
                onDelete={handleDeleteNotification}
              />
            ))
          )}
        </div>

        {filteredNotifications.length > 0 && (
          <p className="pt-2 text-[10.5px] text-[#5D601E]/85 text-center">
            Arraste um cartão para a esquerda para descartar ou clique para abrir direto na origem.
          </p>
        )}
      </div>
    </div>
  );
}
