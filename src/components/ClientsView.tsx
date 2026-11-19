import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  Eye,
  KeyRound,
  Globe,
  Lock,
  Upload,
  FolderKanban,
  FileText,
  Wallet,
  Instagram,
  Phone,
  Mail,
  Edit3,
  Check,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { api, FOLDER_COLOR_PRESETS, formatBRL, formatDateBR, formatRelativeTime, uploadFile } from '../lib/api.ts';
import { Board, Client, CopyItem, FinanceEntry, PartnerKey, Service, StudioSettings, User } from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';
import { PartnerAvatar } from './AumiBrand.tsx';
import { CopyManagerModal } from './CopyManagerModal.tsx';

interface ClientsViewProps {
  user: User;
  initialClientId?: string | null;
  autoOpenNew?: boolean;
  onClearAutoOpen?: () => void;
  onOpenBoard: (boardId: string, portalOwner: PartnerKey) => void;
  onPreviewClientPortal: (clientId: string) => void;
}

interface ClientDetailPayload {
  client: Client;
  boards: Board[];
  copies: CopyItem[];
  finance_entries: FinanceEntry[];
}

const STATUS_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'Ativo', bg: '#F4F5E2', text: '#3E4113' },
  paused: { label: 'Pausado', bg: '#FDF0E8', text: '#E1754C' },
  archived: { label: 'Arquivado', bg: '#F4F4F5', text: '#52525B' },
};

export function ClientsView({
  user,
  initialClientId,
  autoOpenNew,
  onClearAutoOpen,
  onOpenBoard,
  onPreviewClientPortal,
}: ClientsViewProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'archived'>('all');
  const [partnerFilter, setPartnerFilter] = useState<'all' | PartnerKey>('all');

  // Selected client detail
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId || null);
  const [detail, setDetail] = useState<ClientDetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Client Create / Edit MacWindow
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formError, setFormError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [ownerPartner, setOwnerPartner] = useState<PartnerKey>('ingrid');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'active' | 'paused' | 'archived'>('active');
  const [contractedServices, setContractedServices] = useState<Array<{ service_id?: string; service_name: string; package_name?: string }>>([]);
  const [folderColor, setFolderColor] = useState('#EC97B7');
  const [notes, setNotes] = useState('');
  const [portalWelcome, setPortalWelcome] = useState('');
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [initialPassword, setInitialPassword] = useState('');

  // Credentials MacWindow
  const [credClient, setCredClient] = useState<Client | null>(null);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credActive, setCredActive] = useState(true);
  const [credFeedback, setCredFeedback] = useState('');

  // Copy modal inside client CRM
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const canManage = user.permissions.can_manage_clients;

  async function loadBase() {
    try {
      const [cRes, sRes, pRes, stRes] = await Promise.all([
        api<{ clients: Client[] }>('/clients'),
        api<{ services: Service[] }>('/services?status=active'),
        api<{ partners: User[] }>('/partners'),
        api<{ settings: StudioSettings }>('/settings'),
      ]);
      setClients(cRes.clients);
      setServices(sRes.services);
      setPartners(pRes.partners);
      setSettings(stRes.settings);
      if (!selectedClientId && cRes.clients.length > 0 && !initialClientId) {
        setSelectedClientId(cRes.clients[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadClientDetail(cliId: string) {
    setLoadingDetail(true);
    try {
      const res = await api<ClientDetailPayload>(`/clients/${cliId}/detail`);
      setDetail(res);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => {
    loadBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialClientId) {
      setSelectedClientId(initialClientId);
    }
  }, [initialClientId]);

  useEffect(() => {
    if (autoOpenNew && canManage) {
      openNewClientForm();
      onClearAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNew]);

  useEffect(() => {
    if (selectedClientId) {
      loadClientDetail(selectedClientId);
    } else {
      setDetail(null);
    }
  }, [selectedClientId]);

  function openNewClientForm() {
    setEditingClient(null);
    setName('');
    setCompany('');
    setContactName('');
    setEmail('');
    setPhone('');
    setInstagram('');
    setAvatarUrl(null);
    setDescription('');
    setOwnerPartner(user.partner_key || 'ingrid');
    setStartDate(new Date().toISOString().slice(0, 10));
    setStatus('active');
    setContractedServices([]);
    setFolderColor('#EC97B7');
    setNotes('');
    setPortalWelcome('');
    setPortalEnabled(true);
    setInitialPassword('');
    setIsDirty(false);
    setFormError('');
    setFormOpen(true);
  }

  function openEditClientForm(cli: Client) {
    setEditingClient(cli);
    setName(cli.name);
    setCompany(cli.company || '');
    setContactName(cli.contact_name || '');
    setEmail(cli.email);
    setPhone(cli.phone || '');
    setInstagram(cli.instagram || '');
    setAvatarUrl(cli.avatar_url || null);
    setDescription(cli.description || '');
    setOwnerPartner(cli.owner_partner || 'ingrid');
    setStartDate(cli.start_date || new Date().toISOString().slice(0, 10));
    setStatus(cli.status || 'active');
    setContractedServices(cli.contracted_services || []);
    setFolderColor(cli.folder_color || '#EC97B7');
    setNotes(cli.notes || '');
    setPortalWelcome(cli.portal_welcome || '');
    setPortalEnabled(cli.portal_enabled);
    setInitialPassword('');
    setIsDirty(false);
    setFormError('');
    setFormOpen(true);
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const res = await uploadFile(file);
      setAvatarUrl(res.file_url);
      setIsDirty(true);
    } finally {
      setUploadingLogo(false);
    }
  }

  function toggleContractedService(svc: Service) {
    setContractedServices((prev) => {
      const exists = prev.some((s) => s.service_id === svc.id || s.service_name === svc.name);
      if (exists) {
        return prev.filter((s) => s.service_id !== svc.id && s.service_name !== svc.name);
      }
      return [...prev, { service_id: svc.id, service_name: svc.name, package_name: svc.packages[0]?.name || '' }];
    });
    setIsDirty(true);
  }

  async function handleSaveClient(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setFormError('Informe o nome e o e-mail do cliente.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        name: name.trim(),
        company: company.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        instagram: instagram.trim(),
        avatar_url: avatarUrl,
        description: description.trim(),
        owner_partner: ownerPartner,
        start_date: startDate,
        status,
        contracted_services: contractedServices,
        folder_color: folderColor,
        notes: notes.trim(),
        portal_welcome: portalWelcome.trim(),
        portal_enabled: portalEnabled,
        ...(editingClient ? {} : { portal_password: initialPassword.trim() || undefined }),
      };

      if (editingClient) {
        await api(`/clients/${editingClient.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        await loadBase();
        await loadClientDetail(editingClient.id);
      } else {
        const res = await api<{ client: Client }>('/clients', { method: 'POST', body: JSON.stringify(payload) });
        await loadBase();
        setSelectedClientId(res.client.id);
      }
      setIsDirty(false);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!credClient) return;
    setCredFeedback('');
    try {
      await api(`/clients/${credClient.id}/credentials`, {
        method: 'POST',
        body: JSON.stringify({
          email: credEmail.trim(),
          password: credPassword.trim() || undefined,
          active: credActive,
        }),
      });
      setCredClient(null);
      setCredPassword('');
      await loadBase();
      if (selectedClientId) await loadClientDetail(selectedClientId);
    } catch (err) {
      setCredFeedback(err instanceof Error ? err.message : 'Erro ao salvar credenciais.');
    }
  }

  async function handleToggleBoardSharing(board: Board) {
    await api(`/boards/${board.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        shared_with_client: !board.shared_with_client,
        visibility: !board.shared_with_client ? 'shared' : 'internal',
      }),
    });
    if (selectedClientId) await loadClientDetail(selectedClientId);
  }

  async function handleTogglePortalAccess(cli: Client) {
    await api(`/clients/${cli.id}`, {
      method: 'PUT',
      body: JSON.stringify({ portal_enabled: !cli.portal_enabled }),
    });
    await loadBase();
    if (selectedClientId === cli.id) await loadClientDetail(cli.id);
  }

  const filteredClients = clients.filter((c) => {
    if (statusFilter !== 'all' && (c.status || 'active') !== statusFilter) return false;
    if (partnerFilter !== 'all' && (c.owner_partner || 'ingrid') !== partnerFilter) return false;
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${c.name} ${c.company} ${c.email} ${c.instagram} ${c.contact_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeClient = detail?.client || clients.find((c) => c.id === selectedClientId) || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="aumi-glass-strong rounded-[26px] p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#EC2B82]">
            Base de Clientes &amp; Portais Externos
          </span>
          <h1 className="font-editorial text-3xl text-[#2F1534] mt-0.5">Clientes do Aumi Studio</h1>
          <p className="text-xs sm:text-sm text-[#232122]/65 mt-1">
            Base única de clientes sincronizada com pastas do portal, quadros, envios de copy e financeiro.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openNewClientForm}
            className="px-4 py-2.5 rounded-2xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-sm self-start lg:self-auto whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Novo cliente</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#7A689C] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, marca, e-mail ou @instagram..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/85 backdrop-blur-md border border-white text-sm focus:outline-none focus:border-[#EC2B82]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-2xl aumi-glass">
            {[
              { id: 'all', label: 'Todas sócias' },
              { id: 'ingrid', label: 'Ingrid' },
              { id: 'mariana', label: 'Mariana' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPartnerFilter(p.id as 'all' | PartnerKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                  partnerFilter === p.id ? 'bg-white text-[#2F1534] shadow-xs' : 'text-[#232122]/65'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-2xl aumi-glass">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'paused', label: 'Pausados' },
              { id: 'archived', label: 'Arquivados' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id as 'all' | 'active' | 'paused' | 'archived')}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                  statusFilter === st.id ? 'bg-white text-[#2F1534] shadow-xs' : 'text-[#232122]/65'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Master-Detail CRM Grid */}
      {loading ? (
        <div className="h-64 rounded-3xl bg-white/50 animate-pulse" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Client List (Left 5 cols) */}
          <div className="lg:col-span-5 space-y-2.5">
            {filteredClients.length === 0 ? (
              <div className="aumi-glass-strong rounded-3xl p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-[#2F1534]">Nenhum cliente encontrado</p>
                <p className="text-xs text-[#232122]/60">Ajuste os filtros ou cadastre um novo cliente.</p>
              </div>
            ) : (
              filteredClients.map((cli) => {
                const selected = cli.id === selectedClientId;
                const badge = STATUS_BADGES[cli.status || 'active'] || STATUS_BADGES.active;
                return (
                  <button
                    key={cli.id}
                    type="button"
                    onClick={() => setSelectedClientId(cli.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      selected
                        ? 'bg-white border-[#EC2B82]/55 shadow-[0_12px_28px_-10px_rgba(236,43,130,0.22)]'
                        : 'bg-white/78 hover:bg-white border-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PartnerAvatar
                        name={cli.name}
                        partnerKey={cli.owner_partner}
                        avatarUrl={cli.avatar_url}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-[#2F1534] truncate">{cli.name}</p>
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                            style={{ backgroundColor: badge.bg, color: badge.text }}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#7A689C] truncate">
                          {cli.company || cli.email}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-[#232122]/55 tabular-nums">
                          <span>{cli.owner_partner === 'mariana' ? 'Mariana' : 'Ingrid'}</span>
                          <span>·</span>
                          <span>{cli.boards_count || 0} quadros</span>
                          <span>·</span>
                          <span className={cli.portal_enabled ? 'text-[#EC2B82]' : ''}>
                            {cli.portal_enabled ? 'Portal ativo' : 'Portal off'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Client Detail Inspector (Right 7 cols) */}
          <div className="lg:col-span-7">
            {!activeClient ? (
              <div className="aumi-glass-strong rounded-3xl p-12 text-center text-sm text-[#232122]/55">
                Selecione um cliente ao lado para visualizar dados completos, credenciais, quadros e copies.
              </div>
            ) : loadingDetail && !detail ? (
              <div className="h-96 rounded-3xl bg-white/60 animate-pulse" />
            ) : (
              <div className="aumi-glass-strong rounded-[28px] p-5 sm:p-6 space-y-6">
                {/* Top Header */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <PartnerAvatar
                      name={activeClient.name}
                      partnerKey={activeClient.owner_partner}
                      avatarUrl={activeClient.avatar_url}
                      size="xl"
                    />
                    <div className="min-w-0">
                      <h2 className="font-editorial text-2xl sm:text-3xl text-[#2F1534] truncate">
                        {activeClient.name}
                      </h2>
                      <p className="text-xs text-[#7A689C] font-medium">
                        {activeClient.company || 'Sem empresa vinculada'} · Responsável:{' '}
                        {activeClient.owner_partner === 'mariana' ? 'Mariana' : 'Ingrid'}
                      </p>
                      {activeClient.start_date && (
                        <p className="text-[11px] text-[#232122]/50 mt-0.5 tabular-nums">
                          Cliente desde {formatDateBR(activeClient.start_date)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => openEditClientForm(activeClient)}
                        className="px-3.5 py-2 rounded-xl bg-white border border-black/10 hover:border-[#7A689C] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Editar ficha</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onPreviewClientPortal(activeClient.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Abrir Portal Externo</span>
                    </button>
                  </div>
                </div>

                {/* Contact & Description */}
                <div className="aumi-surface-solid rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#232122]/80">
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-[#7A689C]" />
                      {activeClient.email}
                    </span>
                    {activeClient.phone && (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#7A689C]" />
                        {activeClient.phone}
                      </span>
                    )}
                    {activeClient.instagram && (
                      <span className="inline-flex items-center gap-1.5">
                        <Instagram className="w-3.5 h-3.5 text-[#EC2B82]" />
                        {activeClient.instagram}
                      </span>
                    )}
                    {activeClient.contact_name && (
                      <span className="inline-flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#E1754C]" />
                        Contato: {activeClient.contact_name}
                      </span>
                    )}
                  </div>
                  {activeClient.description && (
                    <p className="text-xs text-[#232122]/70 leading-relaxed pt-2 border-t border-black/[0.05]">
                      {activeClient.description}
                    </p>
                  )}
                  {activeClient.contracted_services && activeClient.contracted_services.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeClient.contracted_services.map((cs, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[11px] font-medium"
                        >
                          {cs.service_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* External Access Control */}
                <div className="aumi-surface-solid rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-[#2F1534]">Acesso ao Portal Externo do Cliente</p>
                    <p className="text-[11px] text-[#232122]/60">
                      Login: <span className="font-mono">{activeClient.login_email || activeClient.email}</span> ·{' '}
                      <strong className={activeClient.has_login ? 'text-[#3E4113]' : 'text-[#E1754C]'}>
                        {activeClient.has_login ? 'Senha configurada' : 'Sem senha criada'}
                      </strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTogglePortalAccess(activeClient)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border ${
                            activeClient.portal_enabled
                              ? 'bg-[#F4F5E2] border-[#C8C978] text-[#3E4113]'
                              : 'bg-black/5 border-black/10 text-[#232122]/60'
                          }`}
                        >
                          {activeClient.portal_enabled ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          <span>{activeClient.portal_enabled ? 'Portal ativo' : 'Portal desativado'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCredClient(activeClient);
                            setCredEmail(activeClient.login_email || activeClient.email);
                            setCredPassword('');
                            setCredActive(activeClient.login_active !== false);
                            setCredFeedback('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#FCF6EC] hover:bg-[#F3ECF9] border border-black/10 text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-[#7A689C]" />
                          <span>{activeClient.has_login ? 'Credenciais' : 'Criar senha'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Linked Boards (with per-board client sharing toggle) */}
                <div className="aumi-surface-solid rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5">
                      <FolderKanban className="w-4 h-4 text-[#EC2B82]" />
                      Quadros vinculados ({detail?.boards.length || 0})
                    </span>
                  </div>

                  {!detail?.boards.length ? (
                    <p className="text-xs text-[#232122]/50 py-2">Nenhum quadro criado para este cliente ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.boards.map((b) => (
                        <div
                          key={b.id}
                          className="p-3 rounded-xl border border-black/[0.07] bg-white flex items-center justify-between gap-3"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenBoard(b.id, b.portal_owner)}
                            className="text-left min-w-0 flex-1"
                          >
                            <p className="text-xs font-semibold text-[#2F1534] hover:text-[#EC2B82] truncate">
                              {b.title}
                            </p>
                            <p className="text-[11px] text-[#232122]/55 tabular-nums">
                              {b.completed_cards || 0}/{b.total_cards || 0} entregas · Atualizado{' '}
                              {formatRelativeTime(b.updated_at)}
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleToggleBoardSharing(b)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 shrink-0 ${
                              b.shared_with_client
                                ? 'bg-[#FDF2F6] text-[#EC2B82]'
                                : 'bg-black/5 text-[#232122]/60'
                            }`}
                          >
                            {b.shared_with_client ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                            <span>{b.shared_with_client ? 'Visível no portal' : 'Interno'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Copies & Finance Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="aumi-surface-solid rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-[#7A689C]" />
                        Copies ({detail?.copies.length || 0})
                      </span>
                      <button
                        type="button"
                        onClick={() => setCopyModalOpen(true)}
                        className="text-[11px] font-semibold text-[#EC2B82] hover:underline"
                      >
                        Gerenciar / Nova
                      </button>
                    </div>
                    {!detail?.copies.length ? (
                      <p className="text-[11px] text-[#232122]/50">Nenhuma copy enviada ainda.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.copies.slice(0, 3).map((cp) => (
                          <div key={cp.id} className="text-xs flex items-center justify-between gap-2">
                            <span className="truncate text-[#2F1534]">{cp.title}</span>
                            <span className="text-[10px] text-[#7A689C] shrink-0">
                              {cp.shared_with_client ? 'Compartilhada' : 'Interna'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="aumi-surface-solid rounded-2xl p-4 space-y-2">
                    <span className="text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-[#E1754C]" />
                      Financeiro vinculado
                    </span>
                    <p className="text-lg font-semibold text-[#2F1534] tabular-nums">
                      {formatBRL(
                        (detail?.finance_entries || [])
                          .filter((f) => f.type === 'income' && f.status !== 'cancelled')
                          .reduce((acc, f) => acc + Number(f.amount || 0), 0)
                      )}
                    </p>
                    <p className="text-[11px] text-[#232122]/55 tabular-nums">
                      {detail?.finance_entries.length || 0} lançamentos registrados
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Client Create/Edit MacWindow */}
      <MacWindow
        open={formOpen}
        onClose={() => setFormOpen(false)}
        isDirty={isDirty}
        maxWidthClass="max-w-3xl"
        title={editingClient ? `Editar Cliente · ${editingClient.name}` : 'Novo Cliente'}
        subtitle="Cadastro centralizado sincronizado com Portal do Cliente, Quadros, Copies e Financeiro."
        icon={<Sparkles className="w-4 h-4 text-[#EC2B82]" />}
      >
        <form onSubmit={handleSaveClient} className="p-5 sm:p-6 space-y-5">
          {formError && (
            <div className="p-3 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/30 text-xs text-[#A9195A]">
              {formError}
            </div>
          )}

          {/* Logo + Basic Identity */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-4 border-b border-black/[0.06]">
            <PartnerAvatar name={name || 'C'} partnerKey={ownerPartner} avatarUrl={avatarUrl} size="xl" />
            <div className="space-y-1.5">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleLogoUpload(e.target.files?.[0])}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="px-3 py-1.5 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingLogo ? 'Enviando...' : 'Logo / Foto do cliente'}</span>
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarUrl(null);
                      setIsDirty(true);
                    }}
                    className="text-xs text-red-500"
                  >
                    Remover
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#232122]/55">Aparece na pasta do cliente e no Portal Externo.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Nome do cliente / marca *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Ex: Atelier Lumière"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Empresa / Razão</label>
              <input
                type="text"
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Ex: Lumière Cosméticos Ltda"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Nome do contato principal</label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => {
                  setContactName(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Ex: Camila Rocha"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">E-mail *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="contato@cliente.com"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Telefone / WhatsApp</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="(11) 99999-9999"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Instagram / Rede social</label>
              <input
                type="text"
                value={instagram}
                onChange={(e) => {
                  setInstagram(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="@marca"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Sócia responsável</label>
              <select
                value={ownerPartner}
                onChange={(e) => {
                  setOwnerPartner(e.target.value as PartnerKey);
                  setIsDirty(true);
                }}
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm bg-white"
              >
                <option value="ingrid">Ingrid</option>
                <option value="mariana">Mariana</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#2F1534]">Início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#2F1534]">Status</label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as 'active' | 'paused' | 'archived');
                    setIsDirty(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-sm bg-white"
                >
                  <option value="active">Ativo</option>
                  <option value="paused">Pausado</option>
                  <option value="archived">Arquivado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#2F1534]">Serviços contratados</label>
            <div className="flex flex-wrap gap-1.5">
              {services.map((svc) => {
                const selected = contractedServices.some((c) => c.service_id === svc.id || c.service_name === svc.name);
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => toggleContractedService(svc)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all inline-flex items-center gap-1 ${
                      selected
                        ? 'bg-[#2F1534] text-white border-[#2F1534]'
                        : 'bg-white text-[#232122] border-black/12 hover:border-[#EC2B82]'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3" />}
                    <span>{svc.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#2F1534]">Cor da pasta no Portal do Cliente</label>
            <div className="flex items-center gap-2.5">
              {FOLDER_COLOR_PRESETS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => {
                    setFolderColor(c.hex);
                    setIsDirty(true);
                  }}
                  title={c.label}
                  className={`w-7 h-7 rounded-full border border-black/15 ${
                    folderColor === c.hex ? 'ring-2 ring-[#2F1534] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Descrição do projeto / marca</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Resumo do posicionamento e escopo..."
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#2F1534]">Observações internas</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Anotações visíveis apenas para Ingrid e Mariana..."
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs bg-[#FCF6EC]/40"
              />
            </div>
          </div>

          <div className="space-y-2 p-3.5 rounded-2xl bg-[#F3ECF9]/60 border border-[#BC9FE6]/40">
            <label className="flex items-center justify-between text-xs font-semibold text-[#2F1534] cursor-pointer">
              <span>Liberar acesso ao Portal Externo do Cliente</span>
              <input
                type="checkbox"
                checked={portalEnabled}
                onChange={(e) => {
                  setPortalEnabled(e.target.checked);
                  setIsDirty(true);
                }}
                className="accent-[#EC2B82]"
              />
            </label>
            {!editingClient && (
              <input
                type="password"
                value={initialPassword}
                onChange={(e) => {
                  setInitialPassword(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Senha inicial de acesso do cliente (opcional, mín. 6 caracteres)"
                className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
              />
            )}
            <input
              type="text"
              value={portalWelcome}
              onChange={(e) => {
                setPortalWelcome(e.target.value);
                setIsDirty(true);
              }}
              placeholder="Mensagem de boas-vindas personalizada no portal..."
              className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#232122]/65 hover:bg-black/5"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold"
            >
              {saving ? 'Salvando...' : editingClient ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
          </div>
        </form>
      </MacWindow>

      {/* Credentials MacWindow */}
      <MacWindow
        open={Boolean(credClient)}
        onClose={() => setCredClient(null)}
        maxWidthClass="max-w-md"
        title={`Credenciais Externas · ${credClient?.name || ''}`}
        subtitle="Configure e-mail e senha para o cliente acessar seu portal exclusivo."
        icon={<KeyRound className="w-4 h-4 text-[#7A689C]" />}
      >
        <form onSubmit={handleSaveCredentials} className="p-5 space-y-4">
          {credFeedback && <p className="text-xs text-red-600">{credFeedback}</p>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#2F1534]">E-mail de login</label>
            <input
              type="email"
              required
              value={credEmail}
              onChange={(e) => setCredEmail(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#2F1534]">
              {credClient?.has_login ? 'Nova senha (deixe em branco para manter)' : 'Senha (mín. 6 caracteres)'}
            </label>
            <input
              type="password"
              required={!credClient?.has_login}
              value={credPassword}
              onChange={(e) => setCredPassword(e.target.value)}
              placeholder="••••••"
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
            />
          </div>
          <label className="flex items-center justify-between text-xs font-medium text-[#2F1534]">
            <span>Conta ativa</span>
            <input
              type="checkbox"
              checked={credActive}
              onChange={(e) => setCredActive(e.target.checked)}
              className="accent-[#EC2B82]"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCredClient(null)}
              className="px-4 py-2 text-xs text-[#232122]/60"
            >
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-semibold">
              Salvar acesso
            </button>
          </div>
        </form>
      </MacWindow>

      {/* Copy Manager Modal for selected client */}
      {activeClient && (
        <CopyManagerModal
          open={copyModalOpen}
          onClose={() => setCopyModalOpen(false)}
          user={user}
          partners={partners}
          clients={clients}
          boards={detail?.boards || []}
          initialClientId={activeClient.id}
          settings={settings}
          onSaved={() => loadClientDetail(activeClient.id)}
        />
      )}
    </div>
  );
}
