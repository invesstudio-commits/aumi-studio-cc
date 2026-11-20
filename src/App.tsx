import React, { useEffect, useState } from 'react';
import { api, getAuthToken, setAuthToken } from './lib/api.ts';
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
import { FinanceView } from './components/FinanceView.tsx';
import { SocietyView } from './components/SocietyView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ClientExternalPortal } from './components/ClientExternalPortal.tsx';
import { CopyManagerModal } from './components/CopyManagerModal.tsx';

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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
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
      const token = getAuthToken();
      if (!token) {
        applyStudioTheme(null);
        setCheckingSession(false);
        return;
      }
      try {
        const res = await api<{ user: User }>('/auth/me');
        setUser(res.user);
        await loadThemeSettings();
      } catch {
        setAuthToken(null);
        applyStudioTheme(null);
      } finally {
        setCheckingSession(false);
      }
    }
    restoreSession();
  }, []);

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
    let cancelled = false;
    async function resolveBoardLink() {
      try {
        const res = await api<{ board: { id: string; portal_owner?: PartnerKey } }>(
          `/boards/resolve-link/${encodeURIComponent(initialBoardToken!)}`
        );
        if (cancelled) return;
        if (user!.role === 'partner') {
          setActiveTab('portal');
          if (res.board.portal_owner) setPortalFocusOwner(res.board.portal_owner);
          setPortalFocusBoardId(res.board.id);
          clearBoardTokenFromUrl();
        } else {
          setResolvedClientBoardId(res.board.id);
        }
      } catch {
        // ignore invalid/unauthorized board token
      }
    }
    resolveBoardLink();
    return () => {
      cancelled = true;
    };
  }, [user, initialBoardToken]);

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

  if (!user) {
    return (
      <LoginScreen
        hasSharedCopyLink={Boolean(initialCopyToken)}
        hasSharedBoardLink={Boolean(initialBoardToken)}
        onLoginSuccess={async (u) => {
          setUser(u);
          await loadThemeSettings();
        }}
      />
    );
  }

  // External Client Account -> isolated Client Portal
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
