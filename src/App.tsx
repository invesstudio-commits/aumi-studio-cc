import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  api,
  getAuthToken,
  getClientPortalToken,
  setAuthToken,
  setClientPortalToken,
} from './lib/api.ts';
import { applyStudioTheme } from './lib/theme.ts';
import { setActiveUserSoundPrefs } from './lib/sounds.ts';
import {
  Board,
  Client,
  CopyItem,
  MainTab,
  PartnerKey,
  StudioSettings,
  User,
} from './types/aumi.ts';
import { LoginScreen } from './components/LoginScreen.tsx';
import { BreadcrumbCrumb, StudioLayout } from './components/StudioLayout.tsx';
import { DashboardHome } from './components/DashboardHome.tsx';
import { PortalWorkspace } from './components/PortalWorkspace.tsx';
import { ServicesView } from './components/ServicesView.tsx';
import { ClientsView } from './components/ClientsView.tsx';
import { ContentsWorkspace } from './components/ContentsWorkspace.tsx';
import { FinanceView } from './components/FinanceView.tsx';
import { SocietyView } from './components/SocietyView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ClientExternalPortal } from './components/ClientExternalPortal.tsx';
import { CopyManagerModal } from './components/CopyManagerModal.tsx';
import { AumiLogoMark } from './components/AumiBrand.tsx';

function readInitialCopyToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const val = params.get('copy');
  return val ? val.trim() : null;
}

function readInitialBoardToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const val = params.get('board');
  return val ? val.trim() : null;
}

function readInitialClientPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('portal') || params.get('client');
  if (queryToken && queryToken.trim()) return queryToken.trim();

  // Also support clean path format: /portal-cliente/<token>
  const match = window.location.pathname.match(/^\/portal-cliente\/([^/?#]+)/i);
  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  return null;
}

function readClientPinEntryParams(): { isClientEntry: boolean; email: string | null } {
  if (typeof window === 'undefined') return { isClientEntry: false, email: null };
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('cliente') || params.get('portal_login');
  const email = params.get('email');
  return {
    isClientEntry: flag === '1' || flag === 'true' || window.location.pathname === '/portal-cliente',
    email: email ? email.trim() : null,
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [clientLinkError, setClientLinkError] = useState<string | null>(null);
  const [clientPinEntry] = useState(readClientPinEntryParams);
  const [isDirectClientLinkSession, setIsDirectClientLinkSession] = useState<boolean>(() =>
    Boolean(readInitialClientPortalToken() || getClientPortalToken() || readClientPinEntryParams().isClientEntry)
  );

  const [activeTab, setActiveTab] = useState<MainTab>('inicio');
  const [portalFocusOwner, setPortalFocusOwner] = useState<PartnerKey | null>(null);
  const [portalFocusClientId, setPortalFocusClientId] = useState<string | null>(null);
  const [portalFocusBoardId, setPortalFocusBoardId] = useState<string | null>(null);
  const [clientsFocusId, setClientsFocusId] = useState<string | null>(null);
  const [autoOpenNewClient, setAutoOpenNewClient] = useState(false);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbCrumb[]>([]);

  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [initialCopyToken, setInitialCopyToken] = useState<string | null>(readInitialCopyToken);
  const [initialBoardToken, setInitialBoardToken] = useState<string | null>(readInitialBoardToken);
  const [resolvedClientBoardId, setResolvedClientBoardId] = useState<string | null>(null);

  // Quick Copy Composer launched from DashboardHome or partner shared-copy token
  const [quickCopyOpen, setQuickCopyOpen] = useState(false);
  const [quickCopyPrefill, setQuickCopyPrefill] = useState<CopyItem | null>(null);
  const [copyContextData, setCopyContextData] = useState<{
    partners: User[];
    clients: Client[];
    boards: Board[];
  }>({ partners: [], clients: [], boards: [] });

  async function loadThemeSettings() {
    try {
      const res = await api<{ settings: StudioSettings }>('/settings');
      setSettings(res.settings);
      applyStudioTheme(res.settings);
    } catch {
      applyStudioTheme(null);
    }
  }

  useEffect(() => {
    async function restoreSession() {
      const urlPortalToken = readInitialClientPortalToken();
      const urlBoardToken = readInitialBoardToken();

      // 1. Direct Client Portal Link (?portal=<token> or /portal-cliente/<token>)
      // Always enters the client's isolated Portal directly — ZERO partner login screen!
      if (urlPortalToken) {
        setIsDirectClientLinkSession(true);
        try {
          const res = await fetch('/api/auth/client-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ portal_token: urlPortalToken }),
            cache: 'no-store',
          });
          const data = (await res.json().catch(() => ({}))) as {
            token?: string;
            user?: User;
            board_id?: string | null;
            error?: string;
          };
          if (!res.ok || !data.token || !data.user) {
            setClientPortalToken(null);
            setClientLinkError(data.error || 'Link do Portal do Cliente inválido ou desativado.');
            applyStudioTheme(null);
            setCheckingSession(false);
            return;
          }
          setClientPortalToken(data.token);
          setUser(data.user);
          if (data.board_id) setResolvedClientBoardId(data.board_id);
          await loadThemeSettings();
          setCheckingSession(false);
          return;
        } catch {
          setClientPortalToken(null);
          setClientLinkError('Não foi possível abrir o Portal do Cliente. Verifique sua conexão e tente novamente.');
          applyStudioTheme(null);
          setCheckingSession(false);
          return;
        }
      }

      // 2. Direct Board Share Link (?board=aumi-brd-...) -> ALWAYS enters Client Portal directly!
      if (urlBoardToken && urlBoardToken.startsWith('aumi-brd-')) {
        setIsDirectClientLinkSession(true);
        try {
          const res = await fetch('/api/auth/client-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ board_token: urlBoardToken }),
            cache: 'no-store',
          });
          const data = (await res.json().catch(() => ({}))) as {
            token?: string;
            user?: User;
            board_id?: string | null;
            error?: string;
          };
          if (!res.ok || !data.token || !data.user) {
            setClientPortalToken(null);
            setClientLinkError(data.error || 'Este link de acesso ao projeto está desativado ou expirou.');
            applyStudioTheme(null);
            setCheckingSession(false);
            return;
          }
          setClientPortalToken(data.token);
          setUser(data.user);
          if (data.board_id) setResolvedClientBoardId(data.board_id);
          await loadThemeSettings();
          setCheckingSession(false);
          return;
        } catch {
          setClientPortalToken(null);
          setClientLinkError('Não foi possível validar o link do projeto. Tente novamente em instantes.');
          applyStudioTheme(null);
          setCheckingSession(false);
          return;
        }
      }

      // 3. Dedicated Client PIN entry (?cliente=1 or /portal-cliente)
      // If a client session already exists in this tab, restore it; otherwise show ONLY Client PIN login (never partner session!)
      if (clientPinEntry.isClientEntry) {
        const clientTok = getClientPortalToken();
        if (clientTok) {
          try {
            const res = await api<{ user: User }>('/auth/me');
            if (res.user.role === 'client') {
              setUser(res.user);
              await loadThemeSettings();
              setCheckingSession(false);
              return;
            }
          } catch {
            setClientPortalToken(null);
          }
        }
        applyStudioTheme(null);
        setCheckingSession(false);
        return;
      }

      // 4. Check existing session (tab-isolated client token OR normal partner/client login token)
      const existingToken = getAuthToken();
      if (existingToken) {
        try {
          const res = await api<{ user: User }>('/auth/me');
          setUser(res.user);
          if (res.user.role === 'client') {
            setIsDirectClientLinkSession(Boolean(getClientPortalToken()));
          }
          await loadThemeSettings();
          setCheckingSession(false);
          return;
        } catch {
          if (getClientPortalToken()) {
            setClientPortalToken(null);
            setClientLinkError('Seu acesso ao Portal do Cliente expirou ou foi atualizado. Solicite o novo PIN ao Aumi Studio.');
            applyStudioTheme(null);
            setCheckingSession(false);
            return;
          }
          setAuthToken(null);
        }
      }

      applyStudioTheme(null);
      setCheckingSession(false);
    }
    restoreSession();
  }, []);

  // Hard URL/Route Lockdown whenever authenticated as an external client
  useEffect(() => {
    if (!user || user.role !== 'client' || typeof window === 'undefined') return;
    function enforceClientUrlIsolation() {
      const path = window.location.pathname;
      const isAllowedPath = path === '/' || path.startsWith('/portal-cliente');
      if (!isAllowedPath) {
        const search = window.location.search || '';
        window.history.replaceState({}, '', `/portal-cliente${search}`);
      }
    }
    enforceClientUrlIsolation();
    window.addEventListener('popstate', enforceClientUrlIsolation);
    return () => window.removeEventListener('popstate', enforceClientUrlIsolation);
  }, [user]);

  useEffect(() => {
    setActiveUserSoundPrefs(user?.preferences ?? null);
  }, [user]);

  // If a partner opens a ?copy=<token> link, resolve and open it in CopyManagerModal
  useEffect(() => {
    if (!user || user.role !== 'partner' || !initialCopyToken) return;
    let cancelled = false;
    async function openSharedForPartner() {
      try {
        const [copyRes, pRes, cRes, bRes] = await Promise.all([
          api<{ copy: CopyItem }>(`/copies/shared/${encodeURIComponent(initialCopyToken!)}`),
          api<{ partners: User[] }>('/partners'),
          api<{ clients: Client[] }>('/clients'),
          api<{ boards: Board[] }>('/boards'),
        ]);
        if (!cancelled) {
          setCopyContextData({
            partners: pRes.partners,
            clients: cRes.clients,
            boards: bRes.boards,
          });
          setQuickCopyPrefill(copyRes.copy);
          setQuickCopyOpen(true);
        }
      } catch {
        // ignore invalid token on partner load
      }
    }
    openSharedForPartner();
    return () => {
      cancelled = true;
    };
  }, [user, initialCopyToken]);

  // If an authenticated user opens a ?board=<tokenOrId> link, resolve and focus the board
  useEffect(() => {
    if (!user || !initialBoardToken) return;
    if (user.role === 'client' && resolvedClientBoardId) return;
    let cancelled = false;
    async function resolveBoardLink() {
      try {
        const res = await api<{ board_id?: string; board?: { id: string; portal_owner?: PartnerKey }; portal_owner?: PartnerKey }>(
          `/boards/resolve-link/${encodeURIComponent(initialBoardToken!)}`
        );
        if (cancelled) return;
        const resolvedId = res.board_id || res.board?.id;
        const resolvedOwner = res.portal_owner || res.board?.portal_owner;
        if (!resolvedId) return;
        if (user!.role === 'partner') {
          setActiveTab('portal');
          if (resolvedOwner) setPortalFocusOwner(resolvedOwner);
          setPortalFocusBoardId(resolvedId);
          clearBoardTokenFromUrl();
        } else {
          setResolvedClientBoardId(resolvedId);
        }
      } catch {
        // ignore invalid/unauthorized board token
      }
    }
    resolveBoardLink();
    return () => {
      cancelled = true;
    };
  }, [user, initialBoardToken, resolvedClientBoardId]);

  function clearCopyTokenFromUrl() {
    setInitialCopyToken(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('copy')) {
        url.searchParams.delete('copy');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    }
  }

  function clearBoardTokenFromUrl() {
    setInitialBoardToken(null);
    setResolvedClientBoardId(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('board')) {
        url.searchParams.delete('board');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      }
    }
  }

  async function openQuickCopyComposer() {
    const [pRes, cRes, bRes] = await Promise.all([
      api<{ partners: User[] }>('/partners'),
      api<{ clients: Client[] }>('/clients'),
      api<{ boards: Board[] }>('/boards'),
    ]);
    setCopyContextData({
      partners: pRes.partners,
      clients: cRes.clients,
      boards: bRes.boards,
    });
    setQuickCopyPrefill(null);
    setQuickCopyOpen(true);
  }

  async function handleLogout() {
    if (isDirectClientLinkSession && getClientPortalToken()) {
      setClientPortalToken(null);
      setUser(null);
      setClientLinkError('Você saiu do Portal do Cliente. Para acessar novamente, basta abrir o link enviado pelo Aumi Studio.');
      return;
    }
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
    setPreviewClientId(null);
    setActiveTab('inicio');
    setBreadcrumbs([]);
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen aumi-wallpaper flex items-center justify-center">
        <div className="aumi-glass-strong px-6 py-4 rounded-2xl text-sm font-medium text-[#2F1534]/75">
          Carregando Aumi Studio...
        </div>
      </div>
    );
  }

  // Dedicated isolated error view for invalid/revoked client links (never exposes employee login!)
  if (clientLinkError && !user) {
    return (
      <div className="min-h-screen aumi-wallpaper flex items-center justify-center p-4">
        <div className="w-full max-w-md aumi-glass-strong rounded-3xl p-7 text-center space-y-4 border border-white/80 shadow-xl">
          <div className="w-12 h-12 rounded-2xl bg-[#FDF2F6] border border-[#F5C6DE] text-[#EC2B82] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex justify-center">
            <AumiLogoMark />
          </div>
          <h1 className="text-lg font-bold text-[#2F1534]">Acesso ao Portal do Cliente</h1>
          <p className="text-sm text-[#232122]/70 leading-relaxed">{clientLinkError}</p>
          <p className="text-xs text-[#7A689C]">
            Entre em contato com a equipe do Aumi Studio pelo WhatsApp ou e-mail para receber um novo link exclusivo.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginScreen
        hasSharedCopyLink={Boolean(initialCopyToken)}
        hasSharedBoardLink={Boolean(initialBoardToken)}
        clientOnlyMode={clientPinEntry.isClientEntry}
        initialClientEmail={clientPinEntry.email}
        onLoginSuccess={async (u) => {
          setUser(u);
          await loadThemeSettings();
        }}
      />
    );
  }

  // External Client Account -> strictly isolated Client Portal (ZERO admin views ever mounted!)
  if (user.role === 'client') {
    return (
      <ClientExternalPortal
        user={user}
        initialCopyToken={initialCopyToken}
        initialBoardId={resolvedClientBoardId}
        onClearCopyToken={clearCopyTokenFromUrl}
        onClearBoardToken={clearBoardTokenFromUrl}
        onLogout={handleLogout}
      />
    );
  }

  // Partner previewing a specific client's external portal
  if (previewClientId) {
    return (
      <ClientExternalPortal
        user={user}
        previewClientId={previewClientId}
        onExitPreview={() => setPreviewClientId(null)}
        onLogout={handleLogout}
      />
    );
  }

  function handleNavigate(
    tab: MainTab,
    extra?: { portalOwner?: PartnerKey; boardId?: string; clientId?: string; quickAction?: string }
  ) {
    setActiveTab(tab);
    if (tab !== 'portal') {
      setBreadcrumbs([]);
    }

    if (tab === 'portal') {
      if (extra?.portalOwner) {
        setPortalFocusOwner(extra.portalOwner);
      } else if (!extra?.boardId && !extra?.clientId) {
        setPortalFocusOwner(null);
      }
      setPortalFocusClientId(extra?.clientId || null);
      setPortalFocusBoardId(extra?.boardId || null);
    }

    if (tab === 'clientes') {
      setClientsFocusId(extra?.clientId || null);
      setAutoOpenNewClient(extra?.quickAction === 'new-client');
    } else {
      setAutoOpenNewClient(false);
    }
  }

  return (
    <>
      <StudioLayout
        user={user}
        activeTab={activeTab}
        breadcrumbs={breadcrumbs}
        onSelectTab={handleNavigate}
        onLogout={handleLogout}
      >
        {activeTab === 'inicio' && (
          <DashboardHome
            user={user}
            onNavigate={handleNavigate}
            onOpenCopyComposer={openQuickCopyComposer}
            onUserUpdated={(updated) => setUser(updated)}
          />
        )}

        {activeTab === 'portal' && (
          <PortalWorkspace
            user={user}
            initialPortalOwner={portalFocusOwner}
            initialClientId={portalFocusClientId}
            initialBoardId={portalFocusBoardId}
            onPreviewClientPortal={(cliId) => setPreviewClientId(cliId)}
            onGoToClientsTab={(cliId) => handleNavigate('clientes', { clientId: cliId })}
            onBreadcrumbsChange={setBreadcrumbs}
          />
        )}

        {activeTab === 'servicos' && <ServicesView user={user} />}

        {activeTab === 'clientes' && (
          <ClientsView
            user={user}
            initialClientId={clientsFocusId}
            autoOpenNew={autoOpenNewClient}
            onClearAutoOpen={() => setAutoOpenNewClient(false)}
            onOpenBoard={(boardId, portalOwner) =>
              handleNavigate('portal', { boardId, portalOwner })
            }
            onPreviewClientPortal={(cliId) => setPreviewClientId(cliId)}
          />
        )}

        {activeTab === 'conteudos' && <ContentsWorkspace user={user} />}

        {activeTab === 'financeiro' && <FinanceView user={user} />}

        {activeTab === 'sociedade' && <SocietyView user={user} />}

        {activeTab === 'configuracoes' && (
          <SettingsView
            user={user}
            onUserUpdated={(updated) => setUser(updated)}
            onSettingsUpdated={(updatedSettings) => {
              setSettings(updatedSettings);
              applyStudioTheme(updatedSettings);
            }}
          />
        )}
      </StudioLayout>

      <CopyManagerModal
        open={quickCopyOpen}
        onClose={() => {
          setQuickCopyOpen(false);
          setQuickCopyPrefill(null);
          if (initialCopyToken) clearCopyTokenFromUrl();
        }}
        user={user}
        partners={copyContextData.partners}
        clients={copyContextData.clients}
        boards={copyContextData.boards}
        initialCopy={quickCopyPrefill}
        startInComposer={!quickCopyPrefill}
        settings={settings}
      />
    </>
  );
}
