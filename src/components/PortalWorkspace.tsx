import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Edit3,
  ArrowRight,
  Eye,
  Globe,
  Lock,
  Palette,
  Instagram,
  Mail,
  Phone,
  MoveRight,
  FolderOpen,
} from 'lucide-react';
import {
  api,
  BOARD_COVER_PRESETS,
  FOLDER_COLOR_PRESETS,
  formatRelativeTime,
  formatShortDateBR,
} from '../lib/api.ts';
import {
  Board,
  Client,
  Folder,
  PartnerKey,
  PartnerStatusItem,
  Service,
  StudioSettings,
  User,
} from '../types/aumi.ts';
import { GlassFolderGraphic, PartnerAvatar } from './AumiBrand.tsx';
import { CreateBoardModal } from './CreateBoardModal.tsx';
import { MacWindow } from './MacWindow.tsx';
import { BreadcrumbCrumb } from './StudioLayout.tsx';
import { ProjectPortalShell } from './ProjectPortalShell.tsx';

interface PortalWorkspaceProps {
  user: User;
  initialPortalOwner?: PartnerKey | null;
  initialClientId?: string | null;
  initialBoardId?: string | null;
  onPreviewClientPortal: (clientId: string) => void;
  onGoToClientsTab: (clientId?: string) => void;
  onBreadcrumbsChange?: (crumbs: BreadcrumbCrumb[]) => void;
}

export function PortalWorkspace({
  user,
  initialPortalOwner,
  initialClientId,
  initialBoardId,
  onPreviewClientPortal,
  onGoToClientsTab,
  onBreadcrumbsChange,
}: PortalWorkspaceProps) {
  const [activePortal, setActivePortal] = useState<PartnerKey | null>(initialPortalOwner || null);
  const [activeClientId, setActiveClientId] = useState<string | null>(initialClientId || null);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(initialBoardId || null);

  const [partners, setPartners] = useState<User[]>([]);
  const [presenceList, setPresenceList] = useState<PartnerStatusItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'boards'>('name');

  const [createBoardOpen, setCreateBoardOpen] = useState(false);

  // Client folder customization modal
  const [customizingClient, setCustomizingClient] = useState<Client | null>(null);
  const [customColor, setCustomColor] = useState('#EC97B7');
  const [customCover, setCustomCover] = useState<string | null>(null);

  // Move board modal
  const [movingBoard, setMovingBoard] = useState<Board | null>(null);

  async function loadAll() {
    try {
      const [pRes, presRes, fRes, bRes, cRes, sRes, stRes] = await Promise.all([
        api<{ partners: User[] }>('/partners'),
        api<{ team: PartnerStatusItem[] }>('/presence'),
        api<{ folders: Folder[] }>('/folders'),
        api<{ boards: Board[] }>('/boards'),
        api<{ clients: Client[] }>('/clients'),
        api<{ services: Service[] }>('/services?status=all'),
        api<{ settings: StudioSettings }>('/settings'),
      ]);
      setPartners(pRes.partners);
      setPresenceList(presRes.team || []);
      setFolders(fRes.folders);
      setBoards(bRes.boards);
      setClients(cRes.clients);
      setServices(sRes.services);
      setSettings(stRes.settings);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (initialPortalOwner !== undefined) setActivePortal(initialPortalOwner || null);
    if (initialClientId !== undefined) setActiveClientId(initialClientId || null);
    if (initialBoardId !== undefined) setActiveBoardId(initialBoardId || null);
  }, [initialPortalOwner, initialClientId, initialBoardId]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activePortal, activeClientId, activeBoardId]);

  // Sync breadcrumbs with macOS Menu Bar
  useEffect(() => {
    if (!onBreadcrumbsChange) return;
    const crumbs: BreadcrumbCrumb[] = [
      {
        label: 'Portal do Cliente',
        onClick: () => {
          setActiveBoardId(null);
          setActiveClientId(null);
          setActivePortal(null);
        },
      },
    ];
    if (activePortal) {
      const pObj = partners.find((p) => p.partner_key === activePortal);
      const partnerLabel = pObj ? `Clientes de ${pObj.name}` : activePortal === 'ingrid' ? 'Clientes da Ingrid' : 'Clientes da Mariana';
      crumbs.push({
        label: partnerLabel,
        onClick: () => {
          setActiveBoardId(null);
          setActiveClientId(null);
        },
      });
    }
    const activeClient = clients.find((c) => c.id === activeClientId);
    if (activeClient) {
      crumbs.push({
        label: activeClient.name,
        onClick: () => setActiveBoardId(null),
      });
    }
    const activeBoard = boards.find((b) => b.id === activeBoardId);
    if (activeBoard) {
      if (!activeClient && activeBoard.client_name) {
        crumbs.push({ label: activeBoard.client_name });
      }
      crumbs.push({ label: activeBoard.title });
    }
    onBreadcrumbsChange(crumbs);
  }, [activePortal, activeClientId, activeBoardId, clients, boards, partners, onBreadcrumbsChange]);

  async function handleMoveBoard(boardId: string, folderId: string | null, owner: PartnerKey) {
    await api(`/boards/${boardId}/move-folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_id: folderId, portal_owner: owner }),
    });
    setMovingBoard(null);
    await loadAll();
  }

  async function handleSaveClientFolderCustomization(e: React.FormEvent) {
    e.preventDefault();
    if (!customizingClient) return;
    await api(`/clients/${customizingClient.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        folder_color: customColor,
        folder_cover_url: customCover,
      }),
    });
    setCustomizingClient(null);
    await loadAll();
  }

  // ==================== STEP 6: FULL PROJECT PANEL ====================
  if (activeBoardId) {
    const activeBoard = boards.find((b) => b.id === activeBoardId);
    const sameClientBoards = activeBoard
      ? boards.filter((b) => b.client_id === activeBoard.client_id && b.status !== 'archived')
      : [];

    return (
      <ProjectPortalShell
        boardId={activeBoardId}
        availableBoards={sameClientBoards.length > 0 ? sameClientBoards : activeBoard ? [activeBoard] : []}
        user={user}
        partners={partners}
        folders={folders}
        settings={settings}
        mode="partner"
        portalDefaults={settings?.portal_defaults}
        onSwitchBoard={(nextBoardId) => setActiveBoardId(nextBoardId)}
        onBackToProjects={() => {
          if (activeBoard && !activeClientId) {
            setActiveClientId(activeBoard.client_id);
          }
          setActiveBoardId(null);
          loadAll();
        }}
        onPreviewClientPortal={onPreviewClientPortal}
        onDataChanged={() => loadAll()}
      />
    );
  }

  // ==================== STEP 4 & 5: CLIENT'S PROJECTS ====================
  if (activeClientId) {
    const client = clients.find((c) => c.id === activeClientId);
    if (!client) {
      return (
        <div className="rounded-3xl bg-white/90 border border-[#BC9FE6]/30 p-10 text-center space-y-3">
          <p className="text-sm text-[#232122]/65">Cliente não encontrado.</p>
          <button
            type="button"
            onClick={() => setActiveClientId(null)}
            className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-semibold"
          >
            Voltar
          </button>
        </div>
      );
    }

    const clientBoards = boards.filter((b) => b.client_id === client.id && b.status !== 'archived');
    const activeCount = clientBoards.filter((b) => b.status === 'active').length;
    const approvalCount = clientBoards.filter((b) => (b.pending_approvals || 0) > 0).length;
    const completedCount = clientBoards.filter((b) => b.status === 'completed').length;
    const designerName =
      partners.find((p) => p.partner_key === (client.owner_partner || activePortal))?.name ||
      (client.owner_partner === 'mariana' ? 'Mariana' : 'Ingrid');

    return (
      <div className="w-full space-y-5">
        <div className="rounded-[28px] bg-white/92 backdrop-blur-xl border border-[#BC9FE6]/35 p-5 sm:p-7 space-y-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveClientId(null)}
              className="px-3.5 py-2 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 hover:border-[#EC2B82] text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar aos clientes de {designerName}</span>
            </button>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onGoToClientsTab(client.id)}
                className="px-3.5 py-2 rounded-xl bg-white border border-black/10 hover:border-[#7A689C] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar cliente</span>
              </button>
              <button
                type="button"
                onClick={() => onPreviewClientPortal(client.id)}
                className="px-3.5 py-2 rounded-xl bg-[#FDF2F6] border border-[#EC97B7]/60 text-xs font-bold text-[#EC2B82] hover:bg-[#EC2B82] hover:text-white inline-flex items-center gap-1.5 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Visão do cliente</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateBoardOpen(true)}
                className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo projeto</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 pt-3 border-t border-black/[0.06]">
            <div className="flex items-center gap-4">
              <PartnerAvatar
                name={client.name}
                partnerKey={client.owner_partner}
                avatarUrl={client.avatar_url}
                size="xl"
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2F1534] tracking-tight">{client.name}</h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F3ECF9] text-[11px] font-bold text-[#7A689C]">
                    Designer: {designerName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#232122]/65">
                  {client.company && <span className="font-semibold text-[#2F1534]">{client.company}</span>}
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {client.email}
                  </span>
                  {client.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {client.phone}
                    </span>
                  )}
                  {client.instagram && (
                    <span className="inline-flex items-center gap-1 text-[#EC2B82]">
                      <Instagram className="w-3 h-3" /> {client.instagram}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
              <div className="bg-[#FAF7FC] border border-[#BC9FE6]/25 px-4 py-2.5 rounded-2xl text-center">
                <p className="text-lg font-extrabold text-[#2F1534] tabular-nums">{clientBoards.length}</p>
                <p className="text-[11px] font-medium text-[#7A689C]">Projetos</p>
              </div>
              <div className="bg-[#FDF2F6] border border-[#EC97B7]/30 px-4 py-2.5 rounded-2xl text-center">
                <p className="text-lg font-extrabold text-[#EC2B82] tabular-nums">{activeCount}</p>
                <p className="text-[11px] font-medium text-[#EC2B82]">Em produção</p>
              </div>
              <div className="bg-[#F3ECF9] border border-[#BC9FE6]/35 px-4 py-2.5 rounded-2xl text-center">
                <p className="text-lg font-extrabold text-[#7A689C] tabular-nums">{approvalCount}</p>
                <p className="text-[11px] font-medium text-[#7A689C]">Em aprovação</p>
              </div>
              <div className="bg-[#F5F5DC] border border-[#C8C978]/65 px-4 py-2.5 rounded-2xl text-center">
                <p className="text-lg font-extrabold text-[#3D4011] tabular-nums">{completedCount}</p>
                <p className="text-[11px] font-medium text-[#3D4011]">Concluídos</p>
              </div>
            </div>
          </div>
        </div>

        {/* Client Projects Grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#2F1534]">Projetos de {client.name}</h2>
          </div>

          {clientBoards.length === 0 ? (
            <div className="rounded-3xl bg-white/90 border border-[#BC9FE6]/30 p-12 text-center space-y-3">
              <p className="text-base font-bold text-[#2F1534]">Nenhum projeto criado para este cliente ainda</p>
              <button
                type="button"
                onClick={() => setCreateBoardOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar primeiro projeto</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {clientBoards.map((board) => (
                <BoardFolderCard
                  key={board.id}
                  board={board}
                  partners={partners}
                  onOpen={() => setActiveBoardId(board.id)}
                  onMove={() => setMovingBoard(board)}
                />
              ))}
            </div>
          )}
        </div>

        {createBoardOpen && (
          <CreateBoardModal
            portalOwner={activePortal || client.owner_partner || 'ingrid'}
            folders={folders}
            clients={clients}
            services={services}
            partners={partners}
            settings={settings}
            initialClientId={client.id}
            onClose={() => setCreateBoardOpen(false)}
            onClientCreated={(cli) => setClients((prev) => [...prev, cli])}
            onCreated={(newBoardId) => {
              setCreateBoardOpen(false);
              loadAll();
              setActiveBoardId(newBoardId);
            }}
          />
        )}

        {movingBoard && (
          <MoveBoardModal
            board={movingBoard}
            folders={folders}
            onMove={handleMoveBoard}
            onClose={() => setMovingBoard(null)}
          />
        )}
      </div>
    );
  }

  // ==================== STEP 1: SELECT DESIGNER ("Entre com um dos perfis") ====================
  if (!activePortal) {
    const designerList = partners.length > 0 ? partners : [];

    const getPartnerStats = (key: PartnerKey) => {
      const pClients = clients.filter((c) => (c.owner_partner || 'ingrid') === key && c.status !== 'archived');
      const pBoards = boards.filter((b) => b.portal_owner === key && b.status !== 'archived');
      const pendingDemands = pClients.reduce((acc, c) => acc + (c.pending_demands_count || 0), 0);
      const latestUpdate = pBoards[0]?.updated_at || pClients[0]?.last_activity_at || null;
      return {
        clientsCount: pClients.length,
        boardsCount: pBoards.length,
        pendingDemands,
        latestUpdate,
      };
    };

    return (
      <div className="w-full space-y-6">
        <div className="rounded-[28px] bg-white/92 backdrop-blur-xl border border-[#BC9FE6]/35 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#F3ECF9] text-[11px] font-bold text-[#7A689C]">
              Portal do Cliente · Aumi Studio
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2F1534] tracking-tight mt-2">
              Entre com um dos perfis
            </h1>
            <p className="text-xs sm:text-sm text-[#232122]/65 mt-1">
              Selecione a designer responsável para visualizar os clientes e projetos vinculados a ela.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onGoToClientsTab()}
            className="px-4 py-2.5 rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/40 hover:border-[#EC2B82] text-xs font-bold text-[#2F1534] inline-flex items-center gap-2 self-start whitespace-nowrap transition-colors"
          >
            <span>Gerenciar Clientes ({clients.length})</span>
            <ArrowRight className="w-3.5 h-3.5 text-[#EC2B82]" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {designerList.map((partner) => {
            const key: PartnerKey = partner.partner_key === 'mariana' ? 'mariana' : 'ingrid';
            const stats = getPartnerStats(key);
            const pres = presenceList.find((p) => p.partner_key === key);
            const isPinkTheme = key === 'ingrid';

            return (
              <button
                key={partner.id}
                type="button"
                onClick={() => setActivePortal(key)}
                className={`group text-left rounded-[30px] p-7 sm:p-8 border backdrop-blur-xl hover:-translate-y-0.5 transition-all flex flex-col justify-between gap-7 ${
                  isPinkTheme
                    ? 'bg-gradient-to-br from-[#FDF2F6] via-white to-[#FCE7F3]/75 border-[#EC97B7]/55 shadow-[0_18px_42px_-16px_rgba(236,43,130,0.20)]'
                    : 'bg-gradient-to-br from-[#F3ECF9] via-white to-[#EDE9FE]/75 border-[#BC9FE6]/60 shadow-[0_18px_42px_-16px_rgba(122,104,156,0.22)]'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <PartnerAvatar
                      name={partner.name}
                      partnerKey={key}
                      avatarUrl={partner.avatar_url}
                      size="xl"
                      isOnline={pres?.is_online}
                    />
                    <div>
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          isPinkTheme ? 'text-[#EC2B82]' : 'text-[#7A689C]'
                        }`}
                      >
                        {partner.title || (isPinkTheme ? 'Direção Criativa' : 'Operação & Estratégia')}
                      </span>
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-[#2F1534] tracking-tight mt-0.5">
                        {partner.name}
                      </h2>
                      <p className="text-xs text-[#232122]/60 mt-0.5">
                        {pres?.is_online ? 'Ativa agora' : 'Disponível'} · Clientes &amp; Projetos
                      </p>
                    </div>
                  </div>
                  <GlassFolderGraphic
                    color={isPinkTheme ? '#EC97B7' : '#BC9FE6'}
                    size={62}
                    badgeText={String(stats.clientsCount)}
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="bg-white/90 rounded-2xl p-3.5 border border-black/[0.05]">
                    <p className="text-xl font-extrabold text-[#2F1534] tabular-nums">{stats.clientsCount}</p>
                    <p className="text-[11px] font-medium text-[#232122]/60">Clientes</p>
                  </div>
                  <div className="bg-white/90 rounded-2xl p-3.5 border border-black/[0.05]">
                    <p
                      className={`text-xl font-extrabold tabular-nums ${
                        isPinkTheme ? 'text-[#EC2B82]' : 'text-[#7A689C]'
                      }`}
                    >
                      {stats.boardsCount}
                    </p>
                    <p className="text-[11px] font-medium text-[#232122]/60">Projetos</p>
                  </div>
                  <div className="bg-white/90 rounded-2xl p-3.5 border border-black/[0.05]">
                    <p className="text-xl font-extrabold text-[#E1754C] tabular-nums">{stats.pendingDemands}</p>
                    <p className="text-[11px] font-medium text-[#232122]/60">Demandas</p>
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between pt-3 border-t text-xs ${
                    isPinkTheme ? 'border-[#EC97B7]/30' : 'border-[#BC9FE6]/35'
                  }`}
                >
                  <span className="text-[#232122]/60">
                    {stats.latestUpdate
                      ? `Última atividade ${formatRelativeTime(stats.latestUpdate)}`
                      : 'Pronto para iniciar projetos'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-[#2F1534] group-hover:translate-x-1 transition-transform">
                    Ver clientes
                    <ArrowRight className={`w-4 h-4 ${isPinkTheme ? 'text-[#EC2B82]' : 'text-[#7A689C]'}`} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ==================== STEP 2 & 3: DESIGNER'S CLIENTS ====================
  const currentPartner = partners.find((p) => p.partner_key === activePortal);
  const currentPresence = presenceList.find((p) => p.partner_key === activePortal);
  const canEditThisPortal = user.partner_key === activePortal || user.permissions.can_edit_other_portal;

  const partnerClients = clients
    .filter((c) => {
      if ((c.owner_partner || 'ingrid') !== activePortal) return false;
      if (c.status === 'archived') return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${c.name} ${c.company} ${c.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'boards') return (b.boards_count || 0) - (a.boards_count || 0);
      if (sortBy === 'recent') {
        return new Date(b.last_activity_at || b.created_at).getTime() - new Date(a.last_activity_at || a.created_at).getTime();
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div
        className={`rounded-[28px] p-5 sm:p-7 border backdrop-blur-xl flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 shadow-sm ${
          activePortal === 'ingrid'
            ? 'bg-gradient-to-br from-[#FDF2F6] to-white border-[#EC97B7]/45'
            : 'bg-gradient-to-br from-[#F3ECF9] to-white border-[#BC9FE6]/50'
        }`}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePortal(null)}
              className="px-3 py-1.5 rounded-xl bg-white border border-black/10 hover:border-[#EC2B82] text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Trocar perfil</span>
            </button>
            <button
              type="button"
              onClick={() => onGoToClientsTab()}
              className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-semibold text-[#2F1534]"
            >
              Base de Clientes ({clients.length})
            </button>
          </div>

          <div className="flex items-center gap-3.5">
            <PartnerAvatar
              name={currentPartner?.name || activePortal}
              partnerKey={activePortal}
              avatarUrl={currentPartner?.avatar_url}
              size="lg"
              isOnline={currentPresence?.is_online}
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2F1534] tracking-tight">
                Clientes de {currentPartner?.name || (activePortal === 'ingrid' ? 'Ingrid' : 'Mariana')}
              </h1>
              <p className="text-xs sm:text-sm text-[#232122]/65">
                Selecione um cliente para visualizar seus projetos e abrir o painel completo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canEditThisPortal && (
            <button
              type="button"
              onClick={() => setCreateBoardOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Novo projeto</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#7A689C] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nome ou marca..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-[#BC9FE6]/35 text-sm focus:outline-none focus:border-[#EC2B82]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-[#BC9FE6]/30 self-start">
          <span className="px-2.5 text-[11px] font-medium text-[#232122]/55">Ordenar:</span>
          {[
            { id: 'name', label: 'A–Z' },
            { id: 'recent', label: 'Recentes' },
            { id: 'boards', label: 'Mais projetos' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSortBy(s.id as 'name' | 'recent' | 'boards')}
              className={`px-3 py-1 rounded-xl text-xs font-semibold ${
                sortBy === s.id ? 'bg-[#FDF2F6] text-[#EC2B82]' : 'text-[#232122]/60'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clients Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-3xl bg-white/70 animate-pulse" />
          ))}
        </div>
      ) : partnerClients.length === 0 ? (
        <div className="rounded-3xl bg-white/90 border border-[#BC9FE6]/30 p-12 text-center space-y-3">
          <FolderOpen className="w-10 h-10 text-[#BC9FE6] mx-auto" />
          <p className="text-base font-bold text-[#2F1534]">
            Nenhum cliente vinculado a {currentPartner?.name || activePortal} ainda
          </p>
          <p className="text-xs text-[#232122]/60">
            Cadastre um cliente na aba Clientes ou vincule esta designer como responsável.
          </p>
          <button
            type="button"
            onClick={() => onGoToClientsTab()}
            className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
          >
            Ir para Clientes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {partnerClients.map((cli) => {
            const folderHex = cli.folder_color || (activePortal === 'ingrid' ? '#EC97B7' : '#BC9FE6');
            return (
              <div
                key={cli.id}
                className="group rounded-[26px] bg-white/92 border border-[#BC9FE6]/30 hover:border-[#EC2B82]/55 overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-all shadow-sm"
              >
                {cli.folder_cover_url && (
                  <div className="h-16 w-full overflow-hidden relative">
                    <img
                      src={cli.folder_cover_url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-90"
                    />
                  </div>
                )}

                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveClientId(cli.id)}
                      className="flex items-center gap-3.5 text-left min-w-0 flex-1"
                    >
                      <GlassFolderGraphic
                        color={folderHex}
                        size={64}
                        avatarUrl={cli.avatar_url}
                        initials={cli.name.slice(0, 2).toUpperCase()}
                        badgeText={String(cli.boards_count || 0)}
                      />
                      <div className="min-w-0">
                        <h3 className="text-base font-extrabold text-[#2F1534] group-hover:text-[#EC2B82] transition-colors truncate">
                          {cli.name}
                        </h3>
                        <p className="text-xs text-[#7A689C] truncate">{cli.company || cli.email}</p>
                        <p className="text-[11px] text-[#232122]/55 mt-1 tabular-nums">
                          {cli.boards_count || 0} projetos · {cli.pending_demands_count || 0} demandas
                        </p>
                      </div>
                    </button>

                    {canEditThisPortal && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomizingClient(cli);
                          setCustomColor(folderHex);
                          setCustomCover(cli.folder_cover_url || null);
                        }}
                        title="Personalizar pasta do cliente"
                        className="p-2 rounded-xl bg-[#FAF7FC] hover:bg-[#FDF2F6] text-[#7A689C] hover:text-[#EC2B82] border border-black/5 shrink-0"
                      >
                        <Palette className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {cli.contracted_services && cli.contracted_services.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {cli.contracted_services.slice(0, 3).map((s, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-full bg-[#F3ECF9] text-[10px] font-semibold text-[#7A689C]"
                        >
                          {s.service_name}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-[#232122]/50">
                      {cli.last_activity_at ? formatRelativeTime(cli.last_activity_at) : 'Sem atividade'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveClientId(cli.id)}
                      className="px-3.5 py-1.5 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Ver projetos</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Board Modal */}
      {createBoardOpen && (
        <CreateBoardModal
          portalOwner={activePortal}
          folders={folders}
          clients={clients}
          services={services}
          partners={partners}
          settings={settings}
          onClose={() => setCreateBoardOpen(false)}
          onClientCreated={(cli) => setClients((prev) => [...prev, cli])}
          onCreated={(newBoardId) => {
            setCreateBoardOpen(false);
            loadAll();
            setActiveBoardId(newBoardId);
          }}
        />
      )}

      {/* Customize Client Folder MacWindow */}
      <MacWindow
        open={Boolean(customizingClient)}
        onClose={() => setCustomizingClient(null)}
        maxWidthClass="max-w-md"
        title={`Personalizar pasta · ${customizingClient?.name || ''}`}
        icon={<Palette className="w-4 h-4 text-[#EC2B82]" />}
      >
        <form onSubmit={handleSaveClientFolderCustomization} className="p-5 space-y-4">
          <div className="flex justify-center py-2">
            <GlassFolderGraphic
              color={customColor}
              size={88}
              avatarUrl={customizingClient?.avatar_url}
              initials={customizingClient?.name.slice(0, 2).toUpperCase()}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#2F1534]">Cor translúcida da pasta</label>
            <div className="flex flex-wrap gap-2.5">
              {FOLDER_COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setCustomColor(c.hex)}
                  title={c.label}
                  className={`w-8 h-8 rounded-full border border-black/15 ${
                    customColor === c.hex ? 'ring-2 ring-[#2F1534] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#2F1534]">Capa opcional</label>
            <div className="grid grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setCustomCover(null)}
                className={`h-11 rounded-lg border text-[10px] font-medium ${
                  !customCover ? 'border-[#EC2B82] bg-[#FDF2F6] text-[#EC2B82]' : 'border-black/10 text-[#232122]/60'
                }`}
              >
                Limpa
              </button>
              {BOARD_COVER_PRESETS.map((p) => (
                <button
                  key={p.url}
                  type="button"
                  onClick={() => setCustomCover(p.url)}
                  className={`h-11 rounded-lg overflow-hidden border-2 ${
                    customCover === p.url ? 'border-[#EC2B82]' : 'border-transparent opacity-70'
                  }`}
                >
                  <img src={p.url} alt={p.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCustomizingClient(null)} className="px-4 py-2 text-xs text-[#232122]/60">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold">
              Aplicar estilo
            </button>
          </div>
        </form>
      </MacWindow>
    </div>
  );
}

function MoveBoardModal({
  board,
  folders,
  onMove,
  onClose,
}: {
  board: Board;
  folders: Folder[];
  onMove: (boardId: string, folderId: string | null, owner: PartnerKey) => void;
  onClose: () => void;
}) {
  return (
    <MacWindow
      open
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={`Mover projeto · ${board.title}`}
      subtitle="Escolha a pasta de destino:"
      icon={<MoveRight className="w-4 h-4 text-[#7A689C]" />}
    >
      <div className="p-5 space-y-2 max-h-72 overflow-y-auto">
        {folders.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onMove(board.id, f.id, f.portal_owner)}
            className="w-full text-left px-4 py-2.5 rounded-xl border border-black/10 hover:border-[#EC2B82] flex items-center justify-between text-xs"
          >
            <span className="font-semibold text-[#2F1534]">{f.name}</span>
            <span className="text-[#7A689C]">
              Clientes de {f.portal_owner === 'ingrid' ? 'Ingrid' : 'Mariana'}
            </span>
          </button>
        ))}
      </div>
    </MacWindow>
  );
}

function BoardFolderCard({
  board,
  partners,
  onOpen,
  onMove,
}: {
  board: Board;
  partners: User[];
  onOpen: () => void;
  onMove: () => void;
}) {
  const lead = partners.find((p) => p.id === board.lead_user_id);
  const collab = partners.find((p) => p.id === board.collaborator_user_id);
  const total = board.total_cards || 0;
  const done = board.completed_cards || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-3xl bg-white border border-[#BC9FE6]/30 hover:border-[#EC2B82] overflow-hidden transition-all shadow-sm flex flex-col justify-between">
      <div className="p-4 space-y-3">
        <div onClick={onOpen} className="cursor-pointer space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-[#232122]/55">
            <span className="truncate">{board.client_name}</span>
            <span className="shrink-0 inline-flex items-center gap-1 font-semibold">
              {board.shared_with_client ? <Globe className="w-3 h-3 text-[#EC2B82]" /> : <Lock className="w-3 h-3" />}
              {board.status === 'draft' ? 'Rascunho' : board.status === 'completed' ? 'Concluído' : 'Ativo'}
            </span>
          </div>
          <h4 className="text-base font-extrabold text-[#2F1534] hover:text-[#EC2B82] transition-colors">
            {board.title}
          </h4>
        </div>

        {board.selected_services && board.selected_services.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {board.selected_services.slice(0, 3).map((s, idx) => (
              <span key={idx} className="px-2.5 py-0.5 rounded-full bg-[#F3ECF9] text-[10px] font-semibold text-[#7A689C]">
                {s.service_name}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#232122]/60 tabular-nums">
            <span>
              Progresso: {done}/{total} demandas
            </span>
            <span className="font-bold text-[#2F1534]">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#F3ECF9] overflow-hidden">
            <div className="h-full rounded-full bg-[#EC2B82]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="pt-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {lead && <PartnerAvatar name={lead.name} partnerKey={lead.partner_key} avatarUrl={lead.avatar_url} size="xs" />}
            {collab && <PartnerAvatar name={collab.name} partnerKey={collab.partner_key} avatarUrl={collab.avatar_url} size="xs" />}
            {board.deadline && (
              <span className="text-[11px] text-[#232122]/55 tabular-nums ml-1">
                {formatShortDateBR(board.deadline)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onMove}
              title="Mover projeto de pasta"
              className="text-[11px] text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1"
            >
              <MoveRight className="w-3 h-3" />
              <span>Mover</span>
            </button>
            <button
              type="button"
              onClick={onOpen}
              className="px-3 py-1 rounded-xl bg-[#FDF2F6] hover:bg-[#EC2B82] text-[#EC2B82] hover:text-white text-[11px] font-bold transition-colors"
            >
              Abrir painel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
