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
  MessageCircle,
  Send,
  Smile,
  Sparkles,
  StickyNote,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { api, formatRelativeTime, getAuthToken } from '../lib/api.ts';
import { playConfirmClick, playNotificationPop } from '../lib/sounds.ts';
import {
  MainTab,
  MuralPost,
  NotificationCategory,
  NotificationItem,
  PartnerKey,
  PartnerStatusItem,
  StudioChatMessage,
  StudioPostIt,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { SharedPostItCard } from './SharedPostItCard.tsx';

interface StudioHomeMuralWidgetProps {
  user: User;
  partners: PartnerStatusItem[];
  initialPosts?: MuralPost[];
  onNavigate: (
    tab: MainTab,
    extra?: { portalOwner?: PartnerKey; boardId?: string; clientId?: string; quickAction?: string }
  ) => void;
}

type FilterCategory = 'all' | NotificationCategory;

const QUICK_CHAT_EMOJIS = ['💜', '✨', '🌸', '👏', '🔥', '✅', '👀', '🫶', '📌', '🎉'];

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

function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function formatChatDayDivider(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  const msgKey = d.toISOString().slice(0, 10);
  if (msgKey === todayKey) return 'Hoje';
  if (msgKey === yesterdayKey) return 'Ontem';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d);
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

  if (t.includes('partner_chat')) {
    return {
      bg: 'bg-[#7A689C]',
      icon: <MessageCircle className="w-5 h-5 text-white" />,
      originFallback: 'Chat Interno · Sócias',
    };
  }
  if (t.includes('postit')) {
    return {
      bg: 'bg-[#5B8A3C]',
      icon: <StickyNote className="w-5 h-5 text-white" />,
      originFallback: 'Post-its Compartilhados',
    };
  }
  if (t.includes('approved') || t.includes('completed') || t.includes('conclu')) {
    return {
      bg: 'bg-[#4B7A2C]',
      icon: <CheckCircle2 className="w-5 h-5 text-white" />,
      originFallback: 'Portal do Cliente · Concluído',
    };
  }
  if (t.includes('finance') || n.link_tab === 'financeiro') {
    return {
      bg: 'bg-[#5B8A3C]',
      icon: <Wallet className="w-5 h-5 text-white" />,
      originFallback: 'Sistema · Financeiro',
    };
  }
  if (t.includes('event') || t.includes('deadline') || t.includes('calendar')) {
    return {
      bg: 'bg-[#6A578F]',
      icon: <CalendarClock className="w-5 h-5 text-white" />,
      originFallback: 'Sistema · Compromissos',
    };
  }
  if (cat === 'portal') {
    return {
      bg: 'bg-[#5B8A3C]',
      icon: <FolderKanban className="w-5 h-5 text-white" />,
      originFallback: n.client_name ? `Portal do Cliente · ${n.client_name}` : 'Portal do Cliente',
    };
  }
  if (cat === 'socias') {
    return {
      bg: 'bg-[#7A689C]',
      icon: <Users className="w-5 h-5 text-white" />,
      originFallback: 'Interação · Sócias',
    };
  }
  if (n.link_tab === 'servicos') {
    return {
      bg: 'bg-[#6B9A46]',
      icon: <Layers className="w-5 h-5 text-white" />,
      originFallback: 'Sistema · Serviços',
    };
  }
  return {
    bg: 'bg-[#5E4B82]',
    icon: <Bell className="w-5 h-5 text-white" />,
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
    // Do not hijack button clicks
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
      // User is scrolling vertically
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
      className={`relative rounded-[22px] overflow-hidden select-none transition-all duration-200 ${
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
        className={`group relative rounded-[22px] p-4 border touch-pan-y cursor-pointer transition-colors ${
          isUnread
            ? 'bg-white border-[#C4DBA0] shadow-[0_10px_24px_-16px_rgba(59,94,35,0.22)] hover:border-[#5B8A3C]'
            : 'bg-white/82 border-[#D7E6BE] hover:bg-white hover:border-[#7A689C]/55'
        }`}
      >
        <div className="flex items-start gap-3.5">
          {/* Solid green/purple category squircle icon */}
          <div
            className={`w-11 h-11 rounded-[14px] ${visual.bg} flex items-center justify-center shrink-0 shadow-[0_6px_14px_-6px_rgba(47,21,52,0.28)]`}
          >
            {visual.icon}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex items-center gap-2 min-w-0">
                {isUnread && (
                  <span
                    aria-label="Não lida"
                    className="w-2 h-2 rounded-full bg-[#5B8A3C] shrink-0"
                  />
                )}
                <h4
                  className={`text-[14px] leading-snug truncate ${
                    isUnread ? 'font-bold text-[#2F1534]' : 'font-semibold text-[#2F1534]/82'
                  }`}
                >
                  {item.title}
                </h4>
              </div>
              <span className="text-[11.5px] font-medium text-[#4D6E36] tabular-nums whitespace-nowrap shrink-0">
                {formatNotifTimestamp(item.created_at)}
              </span>
            </div>

            <p className="text-[13px] leading-relaxed text-[#2F1534]/75 line-clamp-2">
              {item.message}
            </p>

            {/* Footer: clean unboxed origin + inline actions */}
            <div className="pt-1 flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-medium text-[#4D6E36] truncate">
                {originText}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  title={isUnread ? 'Marcar como lida' : 'Marcar como não lida'}
                  onClick={(e) => onToggleRead(item, e)}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                    isUnread
                      ? 'text-[#5B8A3C] hover:bg-[#EAF4DF]'
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
                  className="w-7 h-7 rounded-lg text-[#4D6E36]/65 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 h-7 rounded-lg text-[#4D6E36]/60 group-hover:text-[#5B8A3C] flex items-center justify-center transition-colors">
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
  partners,
  onNavigate,
}: StudioHomeMuralWidgetProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [chatMessages, setChatMessages] = useState<StudioChatMessage[]>([]);
  const [postits, setPostits] = useState<StudioPostIt[]>([]);
  const [loading, setLoading] = useState(true);

  // Notification filters
  const [filterCat, setFilterCat] = useState<FilterCategory>('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  // Chat composer
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [showEmojis, setShowEmojis] = useState(false);
  const [chatHighlighted, setChatHighlighted] = useState(false);
  const [highlightedPostIt, setHighlightedPostIt] = useState<PartnerKey | null>(null);

  const chatListRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const userPrefsRef = useRef(user.preferences);
  userPrefsRef.current = user.preferences;

  const knownNotifIdsRef = useRef<Set<string>>(new Set());
  const knownChatIdsRef = useRef<Set<string>>(new Set());
  const initialLoadedRef = useRef(false);

  // Resolve the partner we are chatting with (Mariana when Ingrid is logged in; Ingrid when Mariana is logged in)
  const otherPartner = useMemo(() => {
    const found = partners.find((p) => p.id !== user.id);
    if (found) return found;
    const isIngrid = user.partner_key === 'ingrid';
    return {
      id: isIngrid ? 'user-mariana' : 'user-ingrid',
      name: isIngrid ? 'Mariana' : 'Ingrid',
      partner_key: (isIngrid ? 'mariana' : 'ingrid') as PartnerKey,
      avatar_url: null,
      is_online: false,
      last_seen_at: null,
      clients_count: 0,
      active_boards: 0,
      pending_cards: 0,
    };
  }, [partners, user.id, user.partner_key]);

  const syncAll = useCallback(
    async (opts?: { playSoundOnIncoming?: boolean }) => {
      try {
        const res = await api<{
          notifications: NotificationItem[];
          chat_messages: StudioChatMessage[];
          postits: StudioPostIt[];
        }>('/home-mural/sync');

        const nextNotifs = res.notifications || [];
        const nextChat = res.chat_messages || [];
        const nextPostIts = res.postits || [];

        if (initialLoadedRef.current && opts?.playSoundOnIncoming) {
          const hasNewUnreadNotif = nextNotifs.some(
            (n) => Number(n.is_read) === 0 && !knownNotifIdsRef.current.has(n.id)
          );
          const hasNewPartnerMsg = nextChat.some(
            (m) => m.sender_id !== user.id && !knownChatIdsRef.current.has(m.id)
          );
          if (hasNewUnreadNotif || hasNewPartnerMsg) {
            playNotificationPop(userPrefsRef.current);
          }
        }

        knownNotifIdsRef.current = new Set(nextNotifs.map((n) => n.id));
        knownChatIdsRef.current = new Set(nextChat.map((m) => m.id));
        initialLoadedRef.current = true;

        setNotifications(nextNotifs);
        setChatMessages(nextChat);
        setPostits(nextPostIts);
      } catch {
        // silent fallback
      } finally {
        setLoading(false);
      }
    },
    [user.id]
  );

  // Initial load + SSE real-time stream + gentle fallback sync
  useEffect(() => {
    syncAll({ playSoundOnIncoming: false });

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
          syncAll({ playSoundOnIncoming: fromOther || payload.type === 'notification_created' });
        } catch {
          syncAll({ playSoundOnIncoming: false });
        }
      });
    }

    const fallbackInterval = window.setInterval(() => {
      syncAll({ playSoundOnIncoming: true });
    }, 15000);

    return () => {
      es?.close();
      window.clearInterval(fallbackInterval);
    };
  }, [syncAll, user.id]);

  // Auto-scroll internal chat to bottom when new messages arrive
  useEffect(() => {
    if (chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  // Derived notification counts & filtered list
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

  // Notification handlers
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
      syncAll();
    }
  }

  async function handleDeleteNotification(id: string) {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
    playConfirmClick(userPrefsRef.current);
    try {
      await api(`/notifications/${id}`, { method: 'DELETE' });
    } catch {
      syncAll();
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: 1 })));
    playConfirmClick(userPrefsRef.current);
    try {
      await api('/notifications/read-all', { method: 'POST' });
    } catch {
      syncAll();
    }
  }

  async function handleClearRead() {
    if (readCount === 0) return;
    setNotifications((prev) => prev.filter((item) => Number(item.is_read) === 0));
    playConfirmClick(userPrefsRef.current);
    try {
      await api('/notifications/clear/read', { method: 'DELETE' });
    } catch {
      syncAll();
    }
  }

  function handleOpenNotificationOrigin(n: NotificationItem) {
    // Mark as read on click
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

    // Direct jump to Internal Chat
    if (t.includes('partner_chat') || n.link_entity_id === 'mural-chat') {
      setChatHighlighted(true);
      chatInputRef.current?.focus();
      chatListRef.current?.scrollTo({ top: chatListRef.current.scrollHeight, behavior: 'smooth' });
      window.setTimeout(() => setChatHighlighted(false), 1800);
      return;
    }

    // Direct jump to Shared Post-it
    if (t.includes('postit') || n.link_entity_id?.startsWith('postit-')) {
      const targetKey: PartnerKey = n.link_entity_id?.includes('mariana') ? 'mariana' : 'ingrid';
      setHighlightedPostIt(targetKey);
      document.getElementById(`postit-${targetKey}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
      window.setTimeout(() => setHighlightedPostIt(null), 2000);
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

  // Chat handlers
  async function handleSendChat(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || sendingChat) return;

    setSendingChat(true);
    setShowEmojis(false);
    try {
      const res = await api<{ message: StudioChatMessage }>('/studio-chat', {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      });
      setChatInput('');
      if (res.message) {
        knownChatIdsRef.current.add(res.message.id);
        setChatMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
      playConfirmClick(userPrefsRef.current);
    } finally {
      setSendingChat(false);
    }
  }

  async function handleDeleteChatMessage(id: string) {
    setChatMessages((prev) => prev.filter((m) => m.id !== id));
    playConfirmClick(userPrefsRef.current);
    try {
      await api(`/studio-chat/${id}`, { method: 'DELETE' });
    } catch {
      syncAll();
    }
  }

  // Ensure both Ingrid and Mariana post-its are always rendered in consistent order
  const resolvedPostIts = useMemo<StudioPostIt[]>(() => {
    const ingridPartner = partners.find((p) => p.partner_key === 'ingrid');
    const marianaPartner = partners.find((p) => p.partner_key === 'mariana');
    const byKey = new Map(postits.map((p) => [p.owner_key, p]));

    const ingridPostIt: StudioPostIt = byKey.get('ingrid') || {
      owner_key: 'ingrid',
      owner_user_id: ingridPartner?.id || 'user-ingrid',
      owner_name: ingridPartner?.name || 'Ingrid',
      owner_avatar: ingridPartner?.avatar_url || (user.partner_key === 'ingrid' ? user.avatar_url : null),
      bg_color: '#FDEBF3',
      text_html: '',
      strokes: [],
      updated_by: 'Ingrid',
      updated_at: new Date().toISOString(),
    };

    const marianaPostIt: StudioPostIt = byKey.get('mariana') || {
      owner_key: 'mariana',
      owner_user_id: marianaPartner?.id || 'user-mariana',
      owner_name: marianaPartner?.name || 'Mariana',
      owner_avatar: marianaPartner?.avatar_url || (user.partner_key === 'mariana' ? user.avatar_url : null),
      bg_color: '#F3EBFC',
      text_html: '',
      strokes: [],
      updated_by: 'Mariana',
      updated_at: new Date().toISOString(),
    };

    return [ingridPostIt, marianaPostIt];
  }, [partners, postits, user.avatar_url, user.partner_key]);

  return (
    <div className="rounded-[28px] bg-[#F5F9EE] border border-[#D3E3B8] shadow-[0_20px_48px_-24px_rgba(59,94,35,0.22)] p-5 sm:p-6 space-y-6">
      {/* Top Header — CENTRAL DE COMUNICAÇÃO */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#5B8A3C]/15">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] bg-[#5B8A3C] flex items-center justify-center text-white shadow-[0_8px_18px_-8px_rgba(91,138,60,0.55)] shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-[19px] sm:text-[21px] font-bold tracking-tight text-[#2F1534] leading-none">
              CENTRAL DE COMUNICAÇÃO
            </h2>
            <p className="mt-1 text-xs text-[#4D6E36] tabular-nums">
              Notificações, chat interno e post-its · {notifications.length}{' '}
              {notifications.length === 1 ? 'aviso' : 'avisos'}
              {unreadCount > 0 ? ` · ${unreadCount} não ${unreadCount === 1 ? 'lido' : 'lidos'}` : ' · tudo em dia'}
            </p>
          </div>
        </div>

        {/* Category Filter Bar + Clean Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Filtrar notificações"
            className="inline-flex items-center gap-1 p-1 rounded-2xl bg-[#E8F2D8] border border-[#CCE0AC]"
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#5B8A3C] text-white shadow-xs'
                      : 'text-[#3F5F29] hover:text-[#2F1534]'
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
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
              onlyUnread
                ? 'bg-[#7A689C] text-white border-[#68578A]'
                : 'bg-white text-[#2F1534]/80 border-[#CCE0AC] hover:border-[#7A689C]'
            }`}
          >
            Não lidas{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#5B8A3C] hover:bg-[#4B7530] text-white border border-[#4B7530] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Marcar lidas</span>
            </button>
          )}

          {readCount > 0 && (
            <button
              type="button"
              onClick={handleClearRead}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-red-50 text-[#4D6E36] hover:text-red-600 border border-[#CCE0AC] transition-colors whitespace-nowrap shrink-0"
            >
              Limpar lidas
            </button>
          )}
        </div>
      </div>

      {/* PRIMARY SPLIT: Central de Notificações (verde claro, left) + Liquid Chat Interno (roxo & lilás, right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
        {/* AREA 1: CENTRAL DE NOTIFICAÇÕES (Light green background + solid green & purple icons) */}
        <div className="xl:col-span-7 rounded-[24px] bg-[#EBF4DD] border border-[#CFE2B2] p-4 sm:p-5 flex flex-col min-h-[470px] max-h-[560px]">
          <div className="flex items-center justify-between gap-2 pb-3.5">
            <div>
              <h3 className="text-[15px] font-bold text-[#2F1534]">Central de Notificações</h3>
              <p className="text-[12px] text-[#4D6E36]">
                Portal do Cliente, atividades do sistema e interações entre sócias
              </p>
            </div>
            <span className="text-[11.5px] font-semibold text-[#4D6E36] tabular-nums whitespace-nowrap">
              {filteredNotifications.length}{' '}
              {filteredNotifications.length === 1 ? 'aviso' : 'avisos'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-24 rounded-[22px] bg-white/75" />
                ))}
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center px-6">
                <div className="w-14 h-14 rounded-[18px] bg-[#5B8A3C] flex items-center justify-center text-white mb-3 shadow-sm">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-[#2F1534]">
                  {onlyUnread
                    ? 'Nenhuma notificação não lida por aqui'
                    : 'Central de notificações limpa'}
                </p>
                <p className="mt-1 text-xs text-[#4D6E36] max-w-sm">
                  Novas atualizações do Portal do Cliente, movimentações do sistema e recados entre
                  vocês aparecerão aqui em tempo real.
                </p>
                {(filterCat !== 'all' || onlyUnread) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterCat('all');
                      setOnlyUnread(false);
                    }}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-white border border-[#C4DBA0] text-xs font-semibold text-[#2F1534] hover:border-[#5B8A3C]"
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
            <p className="pt-3 text-[11px] text-[#4D6E36]/85 text-center">
              Arraste um cartão para a esquerda para descartar ou clique para ir direto à origem.
            </p>
          )}
        </div>

        {/* AREA 2: LIQUID CHAT INTERNO (Roxo & Lilás liquid glass) */}
        <div
          className={`xl:col-span-5 rounded-[24px] bg-gradient-to-br from-[#F2E9FB]/92 via-white/82 to-[#ECE0FA]/90 backdrop-blur-2xl border flex flex-col min-h-[470px] max-h-[560px] overflow-hidden transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.92),0_18px_40px_-18px_rgba(122,104,156,0.3)] ${
            chatHighlighted
              ? 'border-[#7A689C] ring-2 ring-[#BC9FE6]/65'
              : 'border-[#D7C3F2]'
          }`}
        >
          {/* Chat Header (Liquid lilac) */}
          <div className="px-4 py-3.5 bg-gradient-to-r from-[#EAE0F8]/85 via-[#F6F0FD]/82 to-[#E5D6F7]/85 backdrop-blur-xl border-b border-[#7A689C]/15 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PartnerAvatar
                name={otherPartner.name}
                partnerKey={otherPartner.partner_key}
                avatarUrl={otherPartner.avatar_url}
                size="md"
                isOnline={otherPartner.is_online}
              />
              <div className="min-w-0">
                <h3 className="text-[14.5px] font-bold text-[#2F1534] truncate">
                  Chat com {otherPartner.name}
                </h3>
                <p className="text-[11.5px] text-[#7A689C] truncate">
                  {otherPartner.is_online
                    ? 'Online agora · conversa interna'
                    : otherPartner.last_seen_at
                    ? `Visto ${formatRelativeTime(otherPartner.last_seen_at)}`
                    : 'Conversa direta entre sócias'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[#7A689C] tabular-nums whitespace-nowrap">
              {chatMessages.length} {chatMessages.length === 1 ? 'msg' : 'msgs'}
            </span>
          </div>

          {/* Messages History (Translucent lilac liquid canvas) */}
          <div
            ref={chatListRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-[#F7F1FD]/60 via-white/45 to-[#F1E7FB]/65"
          >
            {chatMessages.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-5">
                <PartnerAvatar
                  name={otherPartner.name}
                  partnerKey={otherPartner.partner_key}
                  avatarUrl={otherPartner.avatar_url}
                  size="lg"
                  isOnline={otherPartner.is_online}
                />
                <p className="mt-3 text-sm font-bold text-[#2F1534]">
                  Conversa direta com {otherPartner.name}
                </p>
                <p className="mt-1 text-xs text-[#7A689C] max-w-[240px]">
                  Alinhem ideias, aprovações e recados rápidos aqui com sincronização instantânea.
                </p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMine = msg.sender_id === user.id;
                const prev = idx > 0 ? chatMessages[idx - 1] : null;
                const showDayDivider =
                  !prev || prev.created_at.slice(0, 10) !== msg.created_at.slice(0, 10);
                const avatarUrl =
                  msg.sender_avatar ||
                  (isMine ? user.avatar_url : otherPartner.avatar_url) ||
                  null;

                return (
                  <React.Fragment key={msg.id}>
                    {showDayDivider && (
                      <div className="flex items-center justify-center py-1">
                        <span className="text-[11px] font-medium text-[#7A689C]/85">
                          {formatChatDayDivider(msg.created_at)}
                        </span>
                      </div>
                    )}

                    <div
                      className={`group flex items-end gap-2 ${
                        isMine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {!isMine && (
                        <PartnerAvatar
                          name={msg.sender_name}
                          partnerKey={msg.sender_partner_key}
                          avatarUrl={avatarUrl}
                          size="sm"
                        />
                      )}

                      <div
                        className={`max-w-[80%] flex flex-col ${
                          isMine ? 'items-end' : 'items-start'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isMine && (
                            <button
                              type="button"
                              title="Excluir mensagem"
                              onClick={() => handleDeleteChatMessage(msg.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-[#7A689C]/60 hover:text-red-500 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          <div
                            className={`px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${
                              isMine
                                ? 'rounded-[20px] rounded-br-[6px] bg-[#7A689C] text-white shadow-[0_6px_16px_-10px_rgba(122,104,156,0.7)]'
                                : 'rounded-[20px] rounded-bl-[6px] bg-white/88 backdrop-blur-md border border-[#DFCEF6] text-[#2F1534] shadow-xs'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                        <span className="mt-1 px-1 text-[10.5px] text-[#7A689C]/85 tabular-nums">
                          {isMine ? 'Você' : msg.sender_name} · {formatChatTime(msg.created_at)}
                        </span>
                      </div>

                      {isMine && (
                        <PartnerAvatar
                          name={user.name}
                          partnerKey={user.partner_key}
                          avatarUrl={user.avatar_url}
                          size="xs"
                        />
                      )}
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Chat Composer (Liquid lilac glass) */}
          <form
            onSubmit={handleSendChat}
            className="p-3 bg-white/72 backdrop-blur-xl border-t border-[#7A689C]/15 space-y-2"
          >
            {showEmojis && (
              <div className="flex flex-wrap gap-1 p-1.5 rounded-2xl bg-[#F5EEFC]/90 border border-[#DFCEF6]">
                {QUICK_CHAT_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      setChatInput((prev) => `${prev}${em}`);
                      chatInputRef.current?.focus();
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-white text-sm flex items-center justify-center transition-colors"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white/80 border border-[#D9C6F3] focus-within:border-[#7A689C] focus-within:bg-white transition-colors">
                <button
                  type="button"
                  title="Inserir emoji"
                  onClick={() => setShowEmojis((v) => !v)}
                  className="text-[#7A689C] hover:text-[#2F1534] transition-colors shrink-0"
                >
                  <Smile className="w-4 h-4" />
                </button>
                <input
                  ref={chatInputRef}
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={`Escreva uma mensagem para ${otherPartner.name}...`}
                  className="flex-1 bg-transparent text-[13px] text-[#2F1534] placeholder:text-[#7A689C]/75 focus:outline-none min-w-0"
                />
              </div>

              <button
                type="submit"
                disabled={sendingChat || !chatInput.trim()}
                title="Enviar mensagem"
                className="w-10 h-10 rounded-2xl bg-[#7A689C] hover:bg-[#665489] disabled:opacity-45 text-white flex items-center justify-center shrink-0 transition-colors shadow-[0_8px_18px_-8px_rgba(122,104,156,0.65)]"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* AREA 3: POST-ITS COMPARTILHADOS (TWO LARGE POST-ITS: INGRID & MARIANA) */}
      <div className="space-y-3.5 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-[15.5px] font-bold text-[#2F1534]">Post-its compartilhados</h3>
            <p className="text-xs text-[#4D6E36]">
              Cada integrante edita o próprio post-it com texto formatado, cores e desenho livre —
              com salvamento automático.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {resolvedPostIts.map((postit) => {
            const isOwner = user.partner_key === postit.owner_key;
            return (
              <SharedPostItCard
                key={postit.owner_key}
                postit={postit}
                isEditable={isOwner}
                isHighlighted={highlightedPostIt === postit.owner_key}
                userPrefs={user.preferences}
                onSaved={(updated) => {
                  setPostits((prev) => {
                    const exists = prev.some((p) => p.owner_key === updated.owner_key);
                    return exists
                      ? prev.map((p) => (p.owner_key === updated.owner_key ? updated : p))
                      : [...prev, updated];
                  });
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
