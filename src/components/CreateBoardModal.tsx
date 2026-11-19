import React, { useState } from 'react';
import {
  Plus,
  Check,
  Calendar,
  Sparkles,
  UserPlus,
  AlertCircle,
  Wallet,
  FolderKanban,
} from 'lucide-react';
import { api, formatBRL } from '../lib/api.ts';
import {
  Client,
  Folder,
  PartnerKey,
  SelectedBoardService,
  Service,
  StudioSettings,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { MacWindow } from './MacWindow.tsx';

interface CreateBoardModalProps {
  portalOwner: PartnerKey;
  folders: Folder[];
  clients: Client[];
  services: Service[];
  partners: User[];
  settings: StudioSettings | null;
  initialClientId?: string;
  onClose: () => void;
  onCreated: (boardId: string) => void;
  onClientCreated: (client: Client) => void;
}

export function CreateBoardModal({
  portalOwner,
  folders,
  clients,
  services,
  partners,
  settings,
  initialClientId,
  onClose,
  onCreated,
  onClientCreated,
}: CreateBoardModalProps) {
  const defaultLead = partners.find((p) => p.partner_key === portalOwner)?.id || partners[0]?.id || '';

  // Left panel state
  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || '');
  const [showNewClient, setShowNewClient] = useState(clients.length === 0);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientPassword, setNewClientPassword] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedServices, setSelectedServices] = useState<SelectedBoardService[]>([]);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [initialNotes, setInitialNotes] = useState('');
  const [createFinanceEntry, setCreateFinanceEntry] = useState(true);
  const [financePaymentMethod, setFinancePaymentMethod] = useState('Pix');

  // Right panel state
  const portalFolders = folders.filter((f) => f.portal_owner === portalOwner);
  const [folderId, setFolderId] = useState<string>(portalFolders[0]?.id || '');
  const [leadUserId, setLeadUserId] = useState(defaultLead);
  const [collaboratorUserId, setCollaboratorUserId] = useState<string>('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<'baixa' | 'normal' | 'alta' | 'urgente'>('normal');
  const [labels, setLabels] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'shared' | 'internal'>('shared');
  const [addDefaultChecklist, setAddDefaultChecklist] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [servicePickerOpen, setServicePickerOpen] = useState(true);

  const activeServices = services.filter((s) => s.status === 'active');

  const isDirty = Boolean(
    title.trim() ||
      description.trim() ||
      selectedServices.length > 0 ||
      initialNotes.trim() ||
      newClientName.trim() ||
      newClientEmail.trim()
  );

  async function handleQuickCreateClient() {
    if (!newClientName.trim() || !newClientEmail.trim()) {
      setError('Informe nome e e-mail do novo cliente.');
      return;
    }
    setCreatingClient(true);
    setError('');
    try {
      const res = await api<{ client: Client }>('/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: newClientName.trim(),
          company: newClientCompany.trim(),
          email: newClientEmail.trim(),
          phone: newClientPhone.trim(),
          owner_partner: portalOwner,
          portal_enabled: true,
          portal_password: newClientPassword.trim() || undefined,
        }),
      });
      onClientCreated(res.client);
      setClientId(res.client.id);
      setShowNewClient(false);
      setNewClientName('');
      setNewClientCompany('');
      setNewClientEmail('');
      setNewClientPhone('');
      setNewClientPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar cliente.');
    } finally {
      setCreatingClient(false);
    }
  }

  function toggleService(svc: Service) {
    const exists = selectedServices.find((s) => s.service_id === svc.id);
    if (exists) {
      setSelectedServices((prev) => prev.filter((s) => s.service_id !== svc.id));
    } else {
      const firstPkg = svc.packages.find((p) => p.status === 'active') || svc.packages[0];
      if (!firstPkg) {
        setSelectedServices((prev) => [
          ...prev,
          {
            service_id: svc.id,
            service_name: svc.name,
            package_id: '',
            package_name: 'Personalizado',
            price: 0,
            deliverables: svc.deliverables.map((d) => ({
              name: d.name,
              format: d.format,
              qty: d.default_qty,
              deadline_days: d.deadline_days,
              guidelines: d.guidelines,
              requires_approval: d.requires_approval,
            })),
          },
        ]);
      } else {
        setSelectedServices((prev) => [
          ...prev,
          {
            service_id: svc.id,
            service_name: svc.name,
            package_id: firstPkg.id,
            package_name: firstPkg.name,
            price: firstPkg.price_pix,
            deliverables: firstPkg.deliverables_config.map((d) => ({ ...d })),
          },
        ]);
      }
    }
  }

  function selectPackageForService(svc: Service, pkgId: string) {
    const pkg = svc.packages.find((p) => p.id === pkgId);
    if (!pkg) return;
    setSelectedServices((prev) =>
      prev.map((item) =>
        item.service_id === svc.id
          ? {
              ...item,
              package_id: pkg.id,
              package_name: pkg.name,
              price: pkg.price_pix,
              deliverables: pkg.deliverables_config.map((d) => ({ ...d })),
            }
          : item
      )
    );
  }

  function updateDeliverableQty(serviceId: string, delIdx: number, qty: number) {
    setSelectedServices((prev) =>
      prev.map((svc) =>
        svc.service_id === serviceId
          ? {
              ...svc,
              deliverables: svc.deliverables.map((d, idx) =>
                idx === delIdx ? { ...d, qty: Math.max(0, qty) } : d
              ),
            }
          : svc
      )
    );
  }


  const totalDeliverablesCount = selectedServices.reduce((sum, s) => {
    const svcObj = activeServices.find((svc) => svc.id === s.service_id);
    if (svcObj && !svcObj.visible_in_portal) return sum;
    return sum + s.deliverables.reduce((dSum, d) => dSum + (Number(d.qty) || 0), 0);
  }, 0);
  const totalValue = selectedServices.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  async function handleSubmit(targetStatus: 'active' | 'draft') {
    setError('');
    if (!clientId) {
      setError('Selecione ou cadastre um cliente antes de criar o quadro.');
      return;
    }
    if (!title.trim()) {
      setError('Informe o nome do quadro.');
      return;
    }

    setSubmitting(true);
    try {
      const leadPartner = partners.find((p) => p.id === leadUserId);
      const ownerKey = (leadPartner?.partner_key as PartnerKey) || portalOwner;
      const res = await api<{ board: { id: string } }>('/boards', {
        method: 'POST',
        body: JSON.stringify({
          portal_owner: ownerKey,
          folder_id: folderId || null,
          client_id: clientId,
          title: title.trim(),
          description: description.trim(),
          cover_url: null,
          lead_user_id: leadUserId,
          collaborator_user_id: collaboratorUserId || null,
          start_date: startDate,
          deadline: deadline || null,
          priority,
          labels,
          status: targetStatus,
          visibility,
          shared_with_client: visibility === 'shared',
          initial_notes: initialNotes.trim(),
          selected_services: selectedServices.map((s) => ({
            ...s,
            deliverables: s.deliverables.filter((d) => d.qty > 0),
          })),
          add_default_checklist: addDefaultChecklist,
          create_finance_entry: createFinanceEntry && targetStatus === 'active' && totalValue > 0,
          finance_payment_method: financePaymentMethod,
          finance_due_date: deadline || startDate,
        }),
      });
      onCreated(res.board.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar quadro.');
    } finally {
      setSubmitting(false);
    }
  }

  const availableLabels = settings?.labels || [
    { id: 'lbl-mensal', name: 'Mensal', color: '#FDF2F6', text: '#EC2B82' },
    { id: 'lbl-campanha', name: 'Campanha', color: '#F3ECF9', text: '#7A689C' },
    { id: 'lbl-identidade', name: 'Identidade', color: '#FDF0E8', text: '#E1754C' },
  ];

  return (
    <MacWindow
      open
      onClose={onClose}
      isDirty={isDirty}
      maxWidthClass="max-w-6xl"
      title="Criar novo quadro"
      subtitle="Configure as informações do projeto, serviços contratados e permissões do portal."
      icon={<FolderKanban className="w-4 h-4 text-[#EC2B82]" />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-[#232122]/70 tabular-nums">
            {totalDeliverablesCount > 0
              ? `${totalDeliverablesCount} cartões de entrega serão gerados automaticamente no quadro.`
              : 'Você poderá criar cartões manualmente dentro do quadro a qualquer momento.'}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('draft')}
              className="px-4 py-2 rounded-xl border border-black/12 bg-white hover:bg-black/[0.03] text-xs font-semibold text-[#232122]"
            >
              Salvar como rascunho
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => handleSubmit('active')}
              className="px-5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{submitting ? 'Criando quadro...' : 'Criar quadro'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5 sm:p-6 bg-[#FAF6FD]/60 space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/30 text-xs text-[#A9195A] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LADO ESQUERDO — INFORMAÇÕES DO PROJETO */}
          <div className="lg:col-span-7 aumi-surface-solid rounded-2xl p-5 sm:p-6 space-y-5">
            <p className="text-[11px] font-semibold tracking-wide text-[#7A689C] uppercase">
              Informações do Projeto
            </p>

            {/* Cliente + Inline create */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-[#232122]/80">Cliente *</label>
                <button
                  type="button"
                  onClick={() => setShowNewClient((v) => !v)}
                  className="text-xs font-semibold text-[#EC2B82] hover:underline inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{showNewClient ? 'Selecionar existente' : '+ Cadastrar novo cliente'}</span>
                </button>
              </div>

              {!showNewClient ? (
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 bg-white text-sm focus:outline-none focus:border-[#EC2B82]"
                >
                  <option value="">Selecione um cliente...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company ? `(${c.company})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-4 rounded-2xl bg-[#FCF6EC]/70 border border-black/[0.08] space-y-3">
                  <p className="text-xs font-semibold text-[#232122]">Cadastro rápido de cliente</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Nome completo *"
                      className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                    />
                    <input
                      type="text"
                      value={newClientCompany}
                      onChange={(e) => setNewClientCompany(e.target.value)}
                      placeholder="Marca / Empresa"
                      className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                    />
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="E-mail de acesso *"
                      className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                    />
                    <input
                      type="password"
                      value={newClientPassword}
                      onChange={(e) => setNewClientPassword(e.target.value)}
                      placeholder="Senha inicial do portal (opcional, mín. 6)"
                      className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleQuickCreateClient}
                      disabled={creatingClient}
                      className="px-4 py-1.5 rounded-xl bg-[#2F1534] text-white text-xs font-medium"
                    >
                      {creatingClient ? 'Cadastrando...' : 'Salvar cliente'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Nome do quadro */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#232122]/80">Nome do quadro *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Projetos de Novembro — Marca"
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm focus:outline-none focus:border-[#EC2B82]"
              />
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#232122]/80">Descrição do projeto</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Objetivos, escopo geral e direcionamento visual..."
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm focus:outline-none focus:border-[#EC2B82]"
              />
            </div>

            {/* Serviços e Pacotes */}
            <div className="space-y-3 pt-2 border-t border-black/[0.06]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[#232122]/80">Serviços &amp; Pacotes</label>
                <button
                  type="button"
                  onClick={() => setServicePickerOpen((v) => !v)}
                  className="text-xs font-medium text-[#EC2B82] hover:underline inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{servicePickerOpen ? 'Ocultar lista' : 'Mostrar serviços'}</span>
                </button>
              </div>

              {servicePickerOpen && (
                <div className="flex flex-wrap gap-2">
                  {activeServices.map((svc) => {
                    const isSelected = selectedServices.some((s) => s.service_id === svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => toggleService(svc)}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center gap-2 transition-colors ${
                          isSelected
                            ? 'bg-[#FDF2F6] border-[#EC2B82] text-[#232122]'
                            : 'bg-white border-black/12 text-[#232122]/75 hover:border-black/25'
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center ${
                            isSelected ? 'bg-[#EC2B82] text-white' : 'border border-black/20'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </span>
                        <span>{svc.name}</span>
                        {!svc.visible_in_portal && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/[0.06] text-[#232122]/60">
                            Oculto no portal
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Selected services -> choose package & review deliverable quantities */}
              {selectedServices.length > 0 && (
                <div className="space-y-3 pt-2">
                  {selectedServices.map((sel) => {
                    const svcObj = activeServices.find((s) => s.id === sel.service_id);
                    const pkgs = svcObj?.packages.filter((p) => p.status === 'active') || [];
                    return (
                      <div key={sel.service_id} className="p-4 rounded-2xl bg-[#FCF6EC]/60 border border-black/[0.08] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#232122]">{sel.service_name}</span>
                          <span className="text-xs font-semibold text-[#EC2B82] tabular-nums">{formatBRL(sel.price)}</span>
                        </div>

                        {pkgs.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {pkgs.map((pkg) => {
                              const activePkg = sel.package_id === pkg.id;
                              return (
                                <button
                                  key={pkg.id}
                                  type="button"
                                  onClick={() => svcObj && selectPackageForService(svcObj, pkg.id)}
                                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                                    activePkg
                                      ? 'bg-white border-[#EC2B82] shadow-sm'
                                      : 'bg-white/60 border-black/10 hover:bg-white'
                                  }`}
                                >
                                  <p className="text-xs font-semibold text-[#232122]">{pkg.name}</p>
                                  <p className="text-[11px] text-[#232122]/60 tabular-nums mt-0.5">{formatBRL(pkg.price_pix)}</p>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium text-[#232122]/60">
                            Entregáveis incluídos (serão criados como cartões no quadro):
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {sel.deliverables.map((d, dIdx) => (
                              <div
                                key={dIdx}
                                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-white border border-black/[0.06] text-xs"
                              >
                                <span className="truncate text-[#232122]/85">
                                  {d.name} <span className="text-[10px] text-[#232122]/45">({d.format})</span>
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={d.qty}
                                  onChange={(e) => updateDeliverableQty(sel.service_id, dIdx, Number(e.target.value))}
                                  className="w-14 px-1.5 py-0.5 rounded border border-black/15 text-center text-xs tabular-nums"
                                />
                              </div>
                            ))}
                          </div>
                          {svcObj?.client_requirements && svcObj.client_requirements.length > 0 && (
                            <p className="text-[11px] text-[#7A689C] pt-1">
                              Campos do cliente herdados automaticamente ({svcObj.client_requirements.length}):{' '}
                              {svcObj.client_requirements.map((r) => r.label).join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Datas e observações */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-black/[0.06]">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/80">Data de início</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/80">Observações iniciais (internas)</label>
                <input
                  type="text"
                  value={initialNotes}
                  onChange={(e) => setInitialNotes(e.target.value)}
                  placeholder="Notas operacionais..."
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
                />
              </div>
            </div>

            {totalValue > 0 && (
              <div className="p-4 rounded-2xl bg-[#F3ECF9]/60 border border-[#BC9FE6]/40 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-[#232122]">
                  <input
                    type="checkbox"
                    checked={createFinanceEntry}
                    onChange={(e) => setCreateFinanceEntry(e.target.checked)}
                    className="rounded accent-[#EC2B82]"
                  />
                  <Wallet className="w-4 h-4 text-[#7A689C]" />
                  <span>Gerar conta a receber no Financeiro ({formatBRL(totalValue)})</span>
                </label>
                {createFinanceEntry && (
                  <select
                    value={financePaymentMethod}
                    onChange={(e) => setFinancePaymentMethod(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-black/10 bg-white text-xs"
                  >
                    <option value="Pix">Pix</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Transferência">Transferência</option>
                    <option value="Boleto">Boleto</option>
                  </select>
                )}
              </div>
            )}
          </div>

          {/* LADO DIREITO — CONFIGURAÇÕES DO QUADRO */}
          <div className="lg:col-span-5 aumi-surface-solid rounded-2xl p-5 sm:p-6 space-y-5">
            <p className="text-[11px] font-semibold tracking-wide text-[#7A689C] uppercase">
              Configurações do Projeto
            </p>

            {/* Pasta */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#232122]/80">Pasta de status</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 bg-white text-sm"
              >
                <option value="">Sem pasta específica</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.portal_owner === 'ingrid' ? 'Ingrid' : 'Mariana'})
                  </option>
                ))}
              </select>
            </div>

            {/* Responsável principal e Colaboradora */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/80">Responsável principal</label>
                <div className="space-y-1.5">
                  {partners.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setLeadUserId(p.id)}
                      className={`w-full px-3 py-2 rounded-xl border text-left flex items-center gap-2 text-xs font-medium transition-colors ${
                        leadUserId === p.id
                          ? 'bg-[#FDF2F6] border-[#EC2B82] text-[#232122]'
                          : 'bg-white border-black/10 text-[#232122]/70'
                      }`}
                    >
                      <PartnerAvatar name={p.name} partnerKey={p.partner_key} avatarUrl={p.avatar_url} size="xs" />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/80">Colaboradora</label>
                <select
                  value={collaboratorUserId}
                  onChange={(e) => setCollaboratorUserId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/12 bg-white text-xs"
                >
                  <option value="">Nenhuma</option>
                  {partners
                    .filter((p) => p.id !== leadUserId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>

                <label className="text-xs font-medium text-[#232122]/80 block pt-2">Prazo de entrega</label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-[#232122]/40 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Prioridade */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#232122]/80">Prioridade</label>
              <div className="grid grid-cols-4 gap-2">
                {(['baixa', 'normal', 'alta', 'urgente'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl border text-xs font-medium capitalize transition-colors ${
                      priority === p
                        ? 'bg-[#2F1534] text-white border-[#2F1534]'
                        : 'bg-white text-[#232122]/70 border-black/12 hover:bg-black/[0.02]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Etiquetas */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#232122]/80">Etiquetas</label>
              <div className="flex flex-wrap gap-2">
                {availableLabels.map((lbl) => {
                  const active = labels.includes(lbl.name);
                  return (
                    <button
                      key={lbl.id}
                      type="button"
                      onClick={() =>
                        setLabels((prev) => (active ? prev.filter((x) => x !== lbl.name) : [...prev, lbl.name]))
                      }
                      className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                        active ? 'ring-2 ring-[#232122] border-transparent' : 'border-black/10 opacity-75'
                      }`}
                      style={{ backgroundColor: lbl.color, color: lbl.text }}
                    >
                      {lbl.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visibilidade e Checklist */}
            <div className="space-y-3 pt-2 border-t border-black/[0.06]">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-[#232122]">Compartilhar com o cliente?</p>
                  <p className="text-[11px] text-[#232122]/55">Disponibiliza o projeto no Portal Externo</p>
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FCF6EC]">
                  <button
                    type="button"
                    onClick={() => setVisibility('shared')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      visibility === 'shared' ? 'bg-[#EC2B82] text-white' : 'text-[#232122]/65'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibility('internal')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${
                      visibility === 'internal' ? 'bg-[#232122] text-white' : 'text-[#232122]/65'
                    }`}
                  >
                    Só interno
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between text-xs text-[#232122]/80">
                <span>Adicionar checklist padrão nas entregas</span>
                <input
                  type="checkbox"
                  checked={addDefaultChecklist}
                  onChange={(e) => setAddDefaultChecklist(e.target.checked)}
                  className="rounded accent-[#EC2B82]"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    </MacWindow>
  );
}
