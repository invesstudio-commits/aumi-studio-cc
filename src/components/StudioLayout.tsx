import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  FolderKanban,
  Layers,
  Users,
  Wallet,
  Handshake,
  Settings,
  Bell,
  Search,
  LogOut,
  CheckCheck,
  Wifi,
  ChevronRight,
  MoreHorizontal,
  X,
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  MoveHorizontal,
  PenTool,
} from 'lucide-react';
import { api, formatCopyStatusPT, formatRelativeTime } from '../lib/api.ts';
import { playNotificationPop } from '../lib/sounds.ts';
import {
  MainTab,
  NotificationItem,
  PartnerKey,
  PartnerStatusItem,
  SearchResults,
  User,
} from '../types/aumi.ts';
import { AumiLogoMark, PartnerAvatar } from './AumiBrand.tsx';

export interface BreadcrumbCrumb {
  label: string;
  onClick?: () => void;
}

interface StudioLayoutProps {
  user: User;
  activeTab: MainTab;
  breadcrumbs?: BreadcrumbCrumb[];
  onSelectTab: (tab: MainTab, extra?: { portalOwner?: PartnerKey; boardId?: string; clientId?: string }) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const NAV_APPS: Array<{
  id: MainTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconColor: string;
}> = [
  {
    id: 'inicio',
    label: 'Início',
    shortLabel: 'Início',
    icon: Home,
    gradient: 'from-[#7A689C] to-[#2F1534]',
    iconColor: 'text-white',
  },
  {
    id: 'portal',
    label: 'Portal do Cliente',
    shortLabel: 'Portal',
    icon: FolderKanban,
    gradient: 'from-[#EC2B82] to-[#EC97B7]',
    iconColor: 'text-white',
  },
  {
    id: 'servicos',
    label: 'Serviços',
    shortLabel: 'Serviços',
    icon: Layers,
    gradient: 'from-[#BC9FE6] to-[#7A689C]',
    iconColor: 'text-white',
  },
  {
    id: 'clientes',
    label: 'Clientes',
    shortLabel: 'Clientes',
    icon: Users,
    gradient: 'from-[#F4B6CE] to-[#EC2B82]',
    iconColor: 'text-white',
  },
  {
    id: 'conteudos',
    label: 'Conteúdos',
    shortLabel: 'Conteúdos',
    icon: PenTool,
    gradient: 'from-white to-[#FFF7FB] border border-[#F5C6DE]',
    iconColor: 'text-[#EC2B82]',
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    shortLabel: 'Financeiro',
    icon: Wallet,
    gradient: 'from-[#E1754C] to-[#C85930]',
    iconColor: 'text-white',
  },
  {
    id: 'sociedade',
    label: 'Sociedade',
    shortLabel: 'Sociedade',
    icon: Handshake,
    gradient: 'from-[#DAD994] to-[#9E9F4A]',
    iconColor: 'text-[#2F1534]',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    shortLabel: 'Ajustes',
    icon: Settings,
    gradient: 'from-[#E7E2EC] to-[#C8BED4]',
    iconColor: 'text-[#2F1534]',
  },
];

export function StudioLayout({
  user,
  activeTab,
  breadcrumbs,
  onSelectTab,
  onLogout,
  children,
}: StudioLayoutProps) {
  const [now, setNow] = useState(() => new Date());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [presenceOpen, setPresenceOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [teamPresence, setTeamPresence] = useState<PartnerStatusItem[]>([]);
  const [isOnlineBrowser, setIsOnlineBrowser] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Spotlight search
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const spotlightInputRef = useRef<HTMLInputElement>(null);

  // Mobile "Mais" iOS sheet
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  // Persisted visualization preferences (dock expand/minimize + workspace width)
  const [dockMinimized, setDockMinimized] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('aumi_layout_prefs_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { dockMinimized?: boolean };
        return Boolean(parsed.dockMinimized);
      }
    } catch {
      // ignore
    }
    return false;
  });

  const [workspaceWidth, setWorkspaceWidth] = useState<'compact' | 'standard' | 'wide' | 'full'>(() => {
    try {
      const raw = localStorage.getItem('aumi_layout_prefs_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as { workspaceWidth?: 'compact' | 'standard' | 'wide' | 'full' };
        if (parsed.workspaceWidth && ['compact', 'standard', 'wide', 'full'].includes(parsed.workspaceWidth)) {
          return parsed.workspaceWidth;
        }
      }
    } catch {
      // ignore
    }
    return 'standard';
  });
  const [widthMenuOpen, setWidthMenuOpen] = useState(false);
  const widthRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('aumi_layout_prefs_v1');
      const prev = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        'aumi_layout_prefs_v1',
        JSON.stringify({ ...prev, dockMinimized, workspaceWidth })
      );
    } catch {
      // ignore
    }
  }, [dockMinimized, workspaceWidth]);

  const notifRef = useRef<HTMLDivElement>(null);
  const presenceRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  // Always start at the top when switching main workspace tabs
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeTab]);

  // Real-time clock every 15s
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Browser online/offline status
  useEffect(() => {
    const onUp = () => setIsOnlineBrowser(true);
    const onDown = () => setIsOnlineBrowser(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  // Cmd/Ctrl + K Spotlight shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSpotlightOpen((v) => !v);
      } else if (e.key === 'Escape') {
        setSpotlightOpen(false);
        setNotifOpen(false);
        setPresenceOpen(false);
        setProfileOpen(false);
        setWidthMenuOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (spotlightOpen) {
      setTimeout(() => spotlightInputRef.current?.focus(), 40);
    }
  }, [spotlightOpen]);

  const knownLayoutNotifIdsRef = useRef<Set<string>>(new Set());
  const layoutNotifsInitializedRef = useRef(false);
  const userPrefsRef = useRef(user.preferences);
  const activeTabRef = useRef(activeTab);

  useEffect(() => {
    userPrefsRef.current = user.preferences;
  }, [user.preferences]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Real heartbeat + notifications + team presence polling
  async function syncPresenceAndNotifs() {
    try {
      await api('/presence/heartbeat', { method: 'POST' });
      const [notifRes, presRes] = await Promise.all([
        api<{ notifications: NotificationItem[] }>('/notifications'),
        api<{ team: PartnerStatusItem[] }>('/presence'),
      ]);
      const nextNotifs = notifRes.notifications || [];
      if (layoutNotifsInitializedRef.current && activeTabRef.current !== 'inicio') {
        const hasNewUnread = nextNotifs.some(
          (n) => !n.is_read && !knownLayoutNotifIdsRef.current.has(n.id)
        );
        if (hasNewUnread) {
          playNotificationPop(userPrefsRef.current);
        }
      }
      knownLayoutNotifIdsRef.current = new Set(nextNotifs.map((n) => n.id));
      layoutNotifsInitializedRef.current = true;
      setNotifications(nextNotifs);
      setTeamPresence(presRes.team || []);
    } catch {
      // silent background sync
    }
  }

  useEffect(() => {
    syncPresenceAndNotifs();
    const interval = setInterval(syncPresenceAndNotifs, 20000);
    return () => clearInterval(interval);
  }, []);

  // Debounced Spotlight Search
  useEffect(() => {
    if (!spotlightOpen) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, spotlightOpen]);

  // Outside click closes popovers
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) setNotifOpen(false);
      if (presenceRef.current && !presenceRef.current.contains(target)) setPresenceOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  async function markRead(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
    } catch {
      // ignore
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const activeAppMeta = NAV_APPS.find((a) => a.id === activeTab) || NAV_APPS[0];
  const onlinePartnersCount = teamPresence.filter((p) => p.is_online).length;

  const formattedClock = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(now)
    .replace('.', '');

  const crumbList: BreadcrumbCrumb[] =
    breadcrumbs && breadcrumbs.length > 0 ? breadcrumbs : [{ label: activeAppMeta.label }];

  const totalSearchHits = searchResults
    ? searchResults.clients.length +
      searchResults.boards.length +
      searchResults.services.length +
      searchResults.copies.length +
      searchResults.cards.length
    : 0;

  return (
    <div className="min-h-screen aumi-wallpaper flex flex-col relative">
      {/* macOS Top Menu Bar (Desktop & Tablet md+) */}
      <header className="hidden md:flex sticky top-0 z-30 h-11 aumi-menubar-glass px-4 items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => onSelectTab('inicio')}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/60 transition-colors whitespace-nowrap shrink-0"
          >
            <AumiLogoMark size={18} />
            <span className="text-[13px] font-semibold text-[#2F1534]">Aumi Studio</span>
          </button>

          <span className="h-4 w-px bg-[#2F1534]/12 shrink-0" />

          {/* Interactive Location Breadcrumb */}
          <nav aria-label="Localização atual" className="flex items-center gap-1 text-xs min-w-0">
            {crumbList.map((crumb, idx) => {
              const isLast = idx === crumbList.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#232122]/35 shrink-0" />}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="px-1.5 py-0.5 rounded-md text-[#7A689C] hover:text-[#2F1534] hover:bg-white/60 font-medium truncate max-w-[160px] transition-colors"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={`px-1.5 py-0.5 truncate max-w-[200px] ${
                        isLast ? 'font-semibold text-[#2F1534]' : 'text-[#232122]/65'
                      }`}
                    >
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Global Spotlight Search Trigger */}
          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            className="h-7 px-2.5 rounded-lg bg-white/60 hover:bg-white/90 border border-[#2F1534]/8 text-xs text-[#232122]/75 flex items-center gap-2 transition-colors whitespace-nowrap"
            title="Busca rápida (Ctrl/Cmd + K)"
          >
            <Search className="w-3.5 h-3.5 text-[#7A689C]" />
            <span className="hidden lg:inline">Buscar</span>
            <kbd className="hidden xl:inline text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-[#232122]/55 font-sans">
              ⌘K
            </kbd>
          </button>

          {/* Team Presence & Connection Indicator */}
          <div className="relative" ref={presenceRef}>
            <button
              type="button"
              onClick={() => {
                setPresenceOpen((v) => !v);
                setNotifOpen(false);
                setProfileOpen(false);
              }}
              className="h-7 px-2.5 rounded-lg hover:bg-white/70 border border-transparent hover:border-[#2F1534]/8 flex items-center gap-1.5 text-xs text-[#2F1534] transition-colors whitespace-nowrap"
              title="Status da equipe e conexão"
            >
              <Wifi className={`w-3.5 h-3.5 ${isOnlineBrowser ? 'text-[#7A689C]' : 'text-[#EC2B82]'}`} />
              <div className="flex items-center -space-x-1">
                {teamPresence.map((p) => (
                  <span
                    key={p.id}
                    className={`w-2 h-2 rounded-full ring-1 ring-white ${
                      p.is_online ? 'bg-[#C8C978]' : 'bg-[#232122]/25'
                    }`}
                  />
                ))}
              </div>
              <span className="hidden lg:inline text-[11px] font-medium text-[#232122]/75 tabular-nums">
                {onlinePartnersCount}/{teamPresence.length || 2} online
              </span>
            </button>

            {presenceOpen && (
              <div className="absolute right-0 mt-2 w-72 aumi-glass-strong rounded-2xl p-3 space-y-2.5 z-50">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-[#2F1534]">Equipe Conectada</span>
                  <span className="text-[11px] text-[#7A689C] font-medium">
                    {isOnlineBrowser ? 'Sincronizado' : 'Sem conexão'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {teamPresence.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/80 border border-white"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PartnerAvatar
                          name={p.name}
                          partnerKey={p.partner_key}
                          avatarUrl={p.avatar_url}
                          size="sm"
                          isOnline={p.is_online}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#2F1534] truncate">{p.name}</p>
                          <p className="text-[10px] text-[#232122]/55 truncate">{p.title}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${
                          p.is_online
                            ? 'bg-[#F4F5E2] text-[#3E4113]'
                            : 'bg-black/5 text-[#232122]/55'
                        }`}
                      >
                        {p.is_online ? 'Online' : p.last_seen_at ? formatRelativeTime(p.last_seen_at) : 'Ausente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Workspace Width Control */}
          <div className="relative" ref={widthRef}>
            <button
              type="button"
              onClick={() => {
                setWidthMenuOpen((v) => !v);
                setPresenceOpen(false);
                setNotifOpen(false);
                setProfileOpen(false);
              }}
              className="h-7 px-2 rounded-lg hover:bg-white/70 border border-transparent hover:border-[#2F1534]/8 flex items-center gap-1 text-[11px] font-medium text-[#2F1534] transition-colors whitespace-nowrap"
              title="Ajustar largura da área de trabalho"
            >
              <MoveHorizontal className="w-3.5 h-3.5 text-[#7A689C]" />
              <span className="hidden xl:inline">
                {workspaceWidth === 'compact'
                  ? 'Compacto'
                  : workspaceWidth === 'wide'
                  ? 'Amplo'
                  : workspaceWidth === 'full'
                  ? 'Tela cheia'
                  : 'Padrão'}
              </span>
            </button>

            {widthMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 aumi-glass-strong rounded-2xl p-2 space-y-1 z-50">
                <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#7A689C]">
                  Largura do conteúdo
                </p>
                {(
                  [
                    { id: 'compact', label: 'Compacto', hint: '1160px' },
                    { id: 'standard', label: 'Padrão', hint: '1380px' },
                    { id: 'wide', label: 'Amplo', hint: '1600px' },
                    { id: 'full', label: 'Tela cheia', hint: '100%' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setWorkspaceWidth(opt.id);
                      setWidthMenuOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      workspaceWidth === opt.id
                        ? 'bg-[#2F1534] text-white font-semibold'
                        : 'text-[#2F1534] hover:bg-white/80'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[10px] tabular-nums ${workspaceWidth === opt.id ? 'text-white/75' : 'text-[#7A689C]'}`}>
                      {opt.hint}
                    </span>
                  </button>
                ))}
                <div className="pt-1 mt-1 border-t border-black/[0.06]">
                  <button
                    type="button"
                    onClick={() => {
                      setDockMinimized((v) => !v);
                      setWidthMenuOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-xl text-xs text-[#2F1534] hover:bg-white/80 flex items-center justify-between"
                  >
                    <span>{dockMinimized ? 'Expandir menu inferior' : 'Minimizar menu inferior'}</span>
                    {dockMinimized ? <Maximize2 className="w-3.5 h-3.5 text-[#EC2B82]" /> : <Minimize2 className="w-3.5 h-3.5 text-[#7A689C]" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setPresenceOpen(false);
                setProfileOpen(false);
              }}
              aria-label="Notificações"
              className="relative h-7 w-7 rounded-lg hover:bg-white/70 flex items-center justify-center text-[#2F1534] transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#EC2B82] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 aumi-glass-strong rounded-2xl overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-black/[0.06] flex items-center justify-between bg-white/70">
                  <span className="text-xs font-semibold text-[#2F1534]">Central de Notificações</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-[11px] font-medium text-[#EC2B82] hover:text-[#a9195a] inline-flex items-center gap-1"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Marcar lidas</span>
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-black/[0.05] bg-white/90">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#232122]/55">
                      Nenhuma notificação recente no estúdio.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.is_read) markRead(n.id);
                          if (n.link_tab) {
                            const extra =
                              n.link_entity_id?.startsWith('brd-')
                                ? { boardId: n.link_entity_id }
                                : n.link_entity_id?.startsWith('cli-')
                                ? { clientId: n.link_entity_id }
                                : undefined;
                            onSelectTab(n.link_tab as MainTab, extra);
                            setNotifOpen(false);
                          }
                        }}
                        className={`p-3 hover:bg-[#FDF2F6]/60 cursor-pointer transition-colors ${
                          !n.is_read ? 'bg-[#F3ECF9]/45' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-[#2F1534]">{n.title}</p>
                          <span className="text-[10px] text-[#232122]/45 whitespace-nowrap">
                            {formatRelativeTime(n.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#232122]/70 mt-0.5 leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Live Date & Clock */}
          <span className="px-2 py-1 text-[11px] font-medium text-[#2F1534]/85 tabular-nums whitespace-nowrap select-none">
            {formattedClock}
          </span>

          {/* Profile Menu */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setNotifOpen(false);
                setPresenceOpen(false);
              }}
              className="h-7 pl-1 pr-2 rounded-full hover:bg-white/70 flex items-center gap-1.5 transition-colors"
            >
              <PartnerAvatar
                name={user.name}
                partnerKey={user.partner_key}
                avatarUrl={user.avatar_url}
                size="xs"
                isOnline={isOnlineBrowser}
              />
              <span className="text-xs font-medium text-[#2F1534] hidden xl:inline">{user.name}</span>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-56 aumi-glass-strong rounded-2xl p-2 space-y-1 z-50">
                <div className="px-3 py-2 border-b border-black/[0.06]">
                  <p className="text-xs font-semibold text-[#2F1534]">{user.name}</p>
                  <p className="text-[11px] text-[#232122]/55 truncate">{user.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSelectTab('configuracoes');
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#2F1534] hover:bg-white/80 flex items-center gap-2"
                >
                  <Settings className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>Preferências do Sistema</span>
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-[#EC2B82] hover:bg-[#FDF2F6] flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sair da conta</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile iOS-style Liquid Glass Top Bar (< md) */}
      <header className="md:hidden sticky top-0 z-30 aumi-menubar-glass px-3.5 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => onSelectTab('inicio')}
            className="w-9 h-9 rounded-2xl bg-white/80 border border-white flex items-center justify-center shrink-0 shadow-xs"
            aria-label="Ir para Início"
          >
            <AumiLogoMark size={18} />
          </button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#2F1534] truncate leading-tight">
              {crumbList[crumbList.length - 1]?.label || activeAppMeta.label}
            </p>
            <p className="text-[10px] text-[#7A689C] truncate leading-tight">
              {crumbList.length > 1
                ? crumbList.slice(0, -1).map((c) => c.label).join(' · ')
                : `Aumi Studio · ${formattedClock}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setSpotlightOpen(true)}
            aria-label="Buscar"
            className="w-11 h-11 rounded-2xl bg-white/75 border border-white flex items-center justify-center text-[#2F1534]"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notificações"
            className="relative w-11 h-11 rounded-2xl bg-white/75 border border-white flex items-center justify-center text-[#2F1534]"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#EC2B82]" />
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main
        className={`flex-1 w-full mx-auto transition-[max-width,padding] duration-200 ${
          dockMinimized ? 'pb-20 md:pb-20' : 'pb-28 md:pb-28'
        } ${
          workspaceWidth === 'compact'
            ? 'max-w-[1160px] px-3 sm:px-5 pt-3.5 sm:pt-5'
            : workspaceWidth === 'wide'
            ? 'max-w-[1600px] px-3 sm:px-5 pt-3.5 sm:pt-5'
            : workspaceWidth === 'full'
            ? 'max-w-none px-2.5 sm:px-4 lg:px-5 pt-3 sm:pt-4'
            : activeTab === 'portal'
            ? 'max-w-[1460px] px-2.5 sm:px-4 lg:px-5 pt-3 sm:pt-4'
            : 'max-w-[1380px] px-3.5 sm:px-6 lg:px-8 pt-4 sm:pt-6'
        }`}
      >
        <div key={activeTab} className="animate-in fade-in duration-200">
          {children}
        </div>
      </main>

      {/* Desktop macOS Liquid Glass Bottom Dock (Expandable / Minimizable) */}
      <nav
        aria-label="Menu principal do Aumi Studio"
        className="hidden md:flex fixed bottom-3 left-1/2 -translate-x-1/2 z-40 items-center"
      >
        <div
          className={`aumi-dock-glass transition-all duration-200 flex items-center ${
            dockMinimized ? 'rounded-[20px] px-2 py-1.5 gap-1.5' : 'rounded-[26px] px-3 py-2 gap-2 items-end'
          }`}
        >
          {NAV_APPS.map((app) => {
            const Icon = app.icon;
            const active = activeTab === app.id;
            const showPortalBadge = app.id === 'portal' && unreadCount > 0;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onSelectTab(app.id)}
                className={`group relative flex flex-col items-center rounded-2xl transition-all duration-200 hover:-translate-y-1 focus:outline-none ${
                  dockMinimized ? 'px-1 py-0.5' : 'px-1.5 py-1'
                }`}
                title={app.label}
              >
                {/* Floating tooltip on hover */}
                <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 px-2.5 py-1 rounded-xl bg-[#2F1534] text-white text-[11px] font-medium whitespace-nowrap shadow-md">
                  {app.label}
                </span>

                <div
                  className={`relative bg-gradient-to-br ${app.gradient} flex items-center justify-center shadow-md border border-white/60 transition-all duration-200 ${
                    dockMinimized ? 'w-9 h-9 rounded-[12px]' : 'w-11 h-11 rounded-[15px]'
                  } ${
                    active ? 'scale-105 ring-2 ring-[#EC2B82]/45' : 'group-hover:scale-105'
                  }`}
                >
                  <Icon className={`${dockMinimized ? 'w-4 h-4' : 'w-5 h-5'} ${app.iconColor}`} />
                  {showPortalBadge && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#EC2B82] text-white text-[9.5px] font-bold flex items-center justify-center border-2 border-white shadow-xs tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </div>

                {!dockMinimized && (
                  <span
                    className={`mt-1 text-[10px] leading-none whitespace-nowrap ${
                      active ? 'font-semibold text-[#2F1534]' : 'font-medium text-[#232122]/65'
                    }`}
                  >
                    {app.shortLabel}
                  </span>
                )}

                <span
                  className={`mt-0.5 w-1 h-1 rounded-full transition-opacity ${
                    active ? 'bg-[#EC2B82] opacity-100' : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}

          <div className={`w-px bg-[#2F1534]/12 self-stretch my-1.5 ${dockMinimized ? 'mx-0.5' : 'mx-1'}`} />

          {/* Expand / Minimize Dock Toggle */}
          <button
            type="button"
            onClick={() => setDockMinimized((v) => !v)}
            title={dockMinimized ? 'Expandir menu (mostrar nomes)' : 'Minimizar menu (apenas ícones)'}
            aria-label={dockMinimized ? 'Expandir menu principal' : 'Minimizar menu principal'}
            className={`group relative flex flex-col items-center justify-center rounded-xl text-[#7A689C] hover:text-[#EC2B82] hover:bg-white/75 transition-all shrink-0 ${
              dockMinimized ? 'w-8 h-9' : 'px-2 py-2 self-center'
            }`}
          >
            <span className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 px-2.5 py-1 rounded-xl bg-[#2F1534] text-white text-[11px] font-medium whitespace-nowrap shadow-md">
              {dockMinimized ? 'Expandir menu' : 'Minimizar menu'}
            </span>
            {dockMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {!dockMinimized && (
              <span className="mt-1 text-[9.5px] font-semibold leading-none whitespace-nowrap">
                Minimizar
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile iOS Liquid Glass Floating Tab Bar (< md) */}
      <nav
        aria-label="Navegação do Aumi Studio"
        className="md:hidden fixed bottom-2.5 left-3 right-3 z-40"
      >
        <div className="aumi-dock-glass rounded-[28px] px-2 py-1.5 flex items-center justify-around">
          {(['inicio', 'portal', 'clientes', 'financeiro'] as MainTab[]).map((tabId) => {
            const app = NAV_APPS.find((a) => a.id === tabId)!;
            const Icon = app.icon;
            const active = activeTab === tabId;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => {
                  onSelectTab(tabId);
                  setMobileMoreOpen(false);
                }}
                className={`min-h-[46px] min-w-[56px] px-2.5 py-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                  active ? 'bg-white/90 text-[#EC2B82] shadow-xs' : 'text-[#2F1534]/70'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold whitespace-nowrap">{app.shortLabel}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileMoreOpen((v) => !v)}
            className={`min-h-[46px] min-w-[56px] px-2.5 py-1 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all ${
              mobileMoreOpen || ['servicos', 'sociedade', 'configuracoes'].includes(activeTab)
                ? 'bg-white/90 text-[#7A689C] shadow-xs'
                : 'text-[#2F1534]/70'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-semibold whitespace-nowrap">Mais</span>
          </button>
        </div>
      </nav>

      {/* Mobile iOS Sheet for Serviços, Sociedade, Configurações & Conta */}
      {mobileMoreOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-[#2F1534]/35 backdrop-blur-sm flex items-end p-3"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full aumi-glass-strong rounded-[28px] p-4 space-y-3"
          >
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <PartnerAvatar name={user.name} partnerKey={user.partner_key} avatarUrl={user.avatar_url} size="sm" isOnline />
                <div>
                  <p className="text-sm font-semibold text-[#2F1534]">{user.name}</p>
                  <p className="text-[11px] text-[#232122]/60">{user.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center text-[#2F1534]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['conteudos', 'servicos', 'sociedade', 'configuracoes'] as MainTab[]).map((tabId) => {
                const app = NAV_APPS.find((a) => a.id === tabId)!;
                const Icon = app.icon;
                const active = activeTab === tabId;
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => {
                      onSelectTab(tabId);
                      setMobileMoreOpen(false);
                    }}
                    className={`min-h-[72px] p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 border transition-all ${
                      active
                        ? 'bg-[#2F1534] text-white border-[#2F1534]'
                        : 'bg-white/85 text-[#2F1534] border-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs font-semibold">{app.label}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="w-full min-h-[44px] rounded-2xl bg-[#FDF2F6] text-[#EC2B82] text-xs font-semibold flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair da conta</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Notification Drawer */}
      {notifOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-[#2F1534]/35 backdrop-blur-sm flex items-start justify-center p-3 pt-16"
          onClick={() => setNotifOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md aumi-glass-strong rounded-3xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-black/8 flex items-center justify-between bg-white/80">
              <span className="text-sm font-semibold text-[#2F1534]">Notificações</span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="text-xs font-medium text-[#EC2B82]">
                    Marcar lidas
                  </button>
                )}
                <button type="button" onClick={() => setNotifOpen(false)} className="p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-black/5 bg-white/95">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#232122]/55">Sem notificações.</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => {
                      if (!n.is_read) markRead(n.id);
                      if (n.link_tab) {
                        const extra =
                          n.link_entity_id?.startsWith('brd-')
                            ? { boardId: n.link_entity_id }
                            : n.link_entity_id?.startsWith('cli-')
                            ? { clientId: n.link_entity_id }
                            : undefined;
                        onSelectTab(n.link_tab as MainTab, extra);
                      }
                      setNotifOpen(false);
                    }}
                    className={`p-3.5 ${!n.is_read ? 'bg-[#F3ECF9]/45' : ''}`}
                  >
                    <p className="text-xs font-semibold text-[#2F1534]">{n.title}</p>
                    <p className="text-[11px] text-[#232122]/70 mt-0.5">{n.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global macOS Spotlight Search Modal */}
      {spotlightOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#2F1534]/35 backdrop-blur-md flex items-start justify-center p-4 pt-16 sm:pt-24"
          onClick={() => setSpotlightOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl aumi-mac-window rounded-[24px] overflow-hidden"
          >
            <div className="px-4 py-3.5 border-b border-black/[0.07] flex items-center gap-3 bg-white/90">
              <Search className="w-5 h-5 text-[#7A689C] shrink-0" />
              <input
                ref={spotlightInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar clientes, quadros, serviços, copies ou cartões..."
                className="flex-1 bg-transparent text-sm sm:text-base text-[#2F1534] placeholder:text-[#232122]/40 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 rounded-lg hover:bg-black/5 text-[#232122]/50"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3 bg-white/95">
              {!searchQuery.trim() ? (
                <div className="p-4 text-center space-y-2">
                  <Sparkles className="w-5 h-5 text-[#BC9FE6] mx-auto" />
                  <p className="text-xs text-[#232122]/60">
                    Digite para pesquisar em todo o estúdio ou navegue direto pelos atalhos abaixo:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 pt-2">
                    {NAV_APPS.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          onSelectTab(a.id);
                          setSpotlightOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-xs font-medium text-[#2F1534]"
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : searching ? (
                <div className="p-6 text-center text-xs text-[#232122]/55">Buscando no Aumi Studio...</div>
              ) : totalSearchHits === 0 ? (
                <div className="p-6 text-center text-xs text-[#232122]/55">
                  Nenhum resultado encontrado para &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="space-y-3">
                  {searchResults && searchResults.clients.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7A689C]">
                        Clientes
                      </p>
                      <div className="space-y-1">
                        {searchResults.clients.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              onSelectTab('portal', { portalOwner: c.owner_partner || 'ingrid', clientId: c.id });
                              setSpotlightOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#FDF2F6] flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold text-[#2F1534]">{c.name}</span>
                            <span className="text-[#232122]/55">{c.company || 'Abrir pasta do cliente'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults && searchResults.boards.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#EC2B82]">
                        Quadros &amp; Projetos
                      </p>
                      <div className="space-y-1">
                        {searchResults.boards.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              onSelectTab('portal', { portalOwner: b.portal_owner, boardId: b.id });
                              setSpotlightOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#F3ECF9] flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold text-[#2F1534]">{b.title}</span>
                            <span className="text-[#232122]/55">{b.client_name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults && searchResults.copies.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#7A689C]">
                        Copies
                      </p>
                      <div className="space-y-1">
                        {searchResults.copies.map((cp) => (
                          <button
                            key={cp.id}
                            type="button"
                            onClick={() => {
                              if (cp.board_id) {
                                onSelectTab('portal', { boardId: cp.board_id });
                              } else {
                                onSelectTab('clientes', { clientId: cp.client_id || undefined });
                              }
                              setSpotlightOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#FCF6EC] flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold text-[#2F1534] inline-flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-[#EC2B82]" />
                              {cp.title}
                            </span>
                            <span className="text-[#232122]/55">{formatCopyStatusPT(cp.status)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults && searchResults.services.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#E1754C]">
                        Serviços
                      </p>
                      <div className="space-y-1">
                        {searchResults.services.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => {
                              onSelectTab('servicos');
                              setSpotlightOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#FDF0E8] flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold text-[#2F1534]">{s.name}</span>
                            <span className="text-[#232122]/55">{s.category}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {searchResults && searchResults.cards.length > 0 && (
                    <div>
                      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#2F1534]">
                        Entregas / Cartões
                      </p>
                      <div className="space-y-1">
                        {searchResults.cards.map((card) => (
                          <button
                            key={card.id}
                            type="button"
                            onClick={() => {
                              onSelectTab('portal', { boardId: card.board_id });
                              setSpotlightOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/5 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold text-[#2F1534]">{card.title}</span>
                            <span className="text-[#232122]/55">{card.board_title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
