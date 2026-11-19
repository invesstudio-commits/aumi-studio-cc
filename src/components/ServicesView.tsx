import React, { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  ArrowLeft,
  Save,
  Copy,
  Archive,
  Trash2,
  Check,
  Sparkles,
  Package as PackageIcon,
  Layers,
  Star,
  AlertCircle,
} from 'lucide-react';
import { api, formatBRL } from '../lib/api.ts';
import {
  PackageDeliverableConfig,
  ProcessStep,
  Service,
  ServiceDeliverable,
  ServicePackage,
  ServiceRequirementField,
  User,
} from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';

interface ServicesViewProps {
  user: User;
}

const SERVICE_COLORS = [
  { hex: '#EC2B82', label: 'Rosa Aumi' },
  { hex: '#7A689C', label: 'Lilás Plum' },
  { hex: '#E1754C', label: 'Laranja Terracota' },
  { hex: '#C8C978', label: 'Oliva Neon' },
  { hex: '#232122', label: 'Preto Studio' },
];

export function ServicesView({ user }: ServicesViewProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editor form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Redes Sociais');
  const [color, setColor] = useState('#EC2B82');
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [includedItems, setIncludedItems] = useState<string[]>([]);
  const [newIncludedItem, setNewIncludedItem] = useState('');
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([]);
  const [clientInfoNeeded, setClientInfoNeeded] = useState('');
  const [clientRequirements, setClientRequirements] = useState<ServiceRequirementField[]>([]);
  const [defaultDeadlineDays, setDefaultDeadlineDays] = useState(15);
  const [internalNotes, setInternalNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(true);
  const [visibleInPortal, setVisibleInPortal] = useState(true);
  const [expectedClientActions, setExpectedClientActions] = useState('');
  const [deliverables, setDeliverables] = useState<ServiceDeliverable[]>([]);

  // Package Modal state
  const [pkgModalOpen, setPkgModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<ServicePackage | null>(null);
  const [pkgName, setPkgName] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgPricePix, setPkgPricePix] = useState(0);
  const [pkgPriceCard, setPkgPriceCard] = useState(0);
  const [pkgDeadline, setPkgDeadline] = useState(15);
  const [pkgConditions, setPkgConditions] = useState('');
  const [pkgFeatured, setPkgFeatured] = useState(false);
  const [pkgDeliverables, setPkgDeliverables] = useState<PackageDeliverableConfig[]>([]);

  const canManage = user.permissions.can_manage_services;

  async function loadServices() {
    setLoading(true);
    try {
      const res = await api<{ services: Service[] }>('/services?status=all');
      setServices(res.services);
      if (selectedService) {
        const refreshed = res.services.find((s) => s.id === selectedService.id);
        if (refreshed) {
          populateEditor(refreshed);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function populateEditor(svc: Service) {
    setSelectedService(svc);
    setIsCreating(false);
    setName(svc.name);
    setDescription(svc.description);
    setCategory(svc.category);
    setColor(svc.color || '#EC2B82');
    setStatus(svc.status);
    setIncludedItems(svc.included_items || []);
    setProcessSteps(svc.process_steps || []);
    setClientInfoNeeded(svc.client_info_needed || '');
    setClientRequirements(svc.client_requirements || []);
    setDefaultDeadlineDays(svc.default_deadline_days || 15);
    setInternalNotes(svc.internal_notes || '');
    setRequiresApproval(svc.requires_approval);
    setVisibleInPortal(svc.visible_in_portal);
    setExpectedClientActions(svc.expected_client_actions || '');
    setDeliverables(svc.deliverables || []);
    setErrorMsg('');
    setSuccessMsg('');
  }

  function startNewService() {
    setSelectedService(null);
    setIsCreating(true);
    setName('');
    setDescription('');
    setCategory('Design');
    setColor('#EC2B82');
    setStatus('active');
    setIncludedItems([]);
    setProcessSteps([
      { id: 'st-1', title: 'Briefing', description: 'Recebimento de informações do cliente.', active: true },
      { id: 'st-2', title: 'Desenvolvimento', description: 'Produção criativa das entregas.', active: true },
      { id: 'st-3', title: 'Revisão e aprovação', description: 'Validação interna e envio ao portal.', active: true },
    ]);
    setClientInfoNeeded('');
    setClientRequirements([
      { key: 'tema', label: 'Tema / Objetivo do conteúdo', type: 'textarea', required: true },
      { key: 'referencias', label: 'Links ou referências do cliente', type: 'link', required: false },
    ]);
    setDefaultDeadlineDays(15);
    setInternalNotes('');
    setRequiresApproval(true);
    setVisibleInPortal(true);
    setExpectedClientActions('');
    setDeliverables([
      {
        name: 'Entrega principal',
        description: '',
        format: 'Digital',
        default_qty: 1,
        deadline_days: 10,
        guidelines: '',
        requires_approval: true,
      },
    ]);
    setErrorMsg('');
    setSuccessMsg('');
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Informe o nome do serviço.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        name: name.trim(),
        description,
        category,
        color,
        status,
        included_items: includedItems,
        process_steps: processSteps,
        client_info_needed: clientInfoNeeded,
        client_requirements: clientRequirements.filter((r) => r.label.trim()),
        default_deadline_days: Number(defaultDeadlineDays) || 15,
        internal_notes: internalNotes,
        requires_approval: requiresApproval,
        visible_in_portal: visibleInPortal,
        expected_client_actions: expectedClientActions,
        deliverables,
      };

      if (isCreating) {
        const res = await api<{ service: Service }>('/services', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await loadServices();
        populateEditor(res.service);
        setSuccessMsg('Serviço criado com sucesso! Agora você já pode configurar pacotes.');
      } else if (selectedService) {
        const res = await api<{ service: Service }>(`/services/${selectedService.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        await loadServices();
        populateEditor(res.service);
        setSuccessMsg('Alterações salvas com sucesso.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar serviço.');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(svc: Service) {
    const nextStatus = svc.status === 'active' ? 'archived' : 'active';
    await api(`/services/${svc.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    await loadServices();
    if (selectedService?.id === svc.id) {
      setStatus(nextStatus);
    }
  }

  async function handleDeleteService(svcId: string) {
    await api(`/services/${svcId}`, { method: 'DELETE' });
    setSelectedService(null);
    setIsCreating(false);
    await loadServices();
  }

  function openPackageModal(pkg?: ServicePackage) {
    if (!selectedService) return;
    if (pkg) {
      setEditingPkg(pkg);
      setPkgName(pkg.name);
      setPkgDesc(pkg.description);
      setPkgPricePix(pkg.price_pix);
      setPkgPriceCard(pkg.price_card);
      setPkgDeadline(pkg.deadline_days);
      setPkgConditions(pkg.conditions);
      setPkgFeatured(pkg.is_featured);
      // Merge current service deliverables so user can adjust quantities
      const existingMap = new Map(pkg.deliverables_config.map((d) => [d.name, d]));
      const merged: PackageDeliverableConfig[] = deliverables.map((d) => {
        const match = existingMap.get(d.name);
        return (
          match || {
            deliverable_id: d.id,
            name: d.name,
            format: d.format,
            qty: 0,
            deadline_days: d.deadline_days,
            guidelines: d.guidelines,
            requires_approval: d.requires_approval,
          }
        );
      });
      // Keep any extra deliverables configured in package
      for (const d of pkg.deliverables_config) {
        if (!merged.some((m) => m.name === d.name)) merged.push(d);
      }
      setPkgDeliverables(merged);
    } else {
      setEditingPkg(null);
      setPkgName('');
      setPkgDesc('');
      setPkgPricePix(0);
      setPkgPriceCard(0);
      setPkgDeadline(defaultDeadlineDays || 15);
      setPkgConditions('');
      setPkgFeatured(false);
      setPkgDeliverables(
        deliverables.map((d) => ({
          deliverable_id: d.id,
          name: d.name,
          format: d.format,
          qty: d.default_qty,
          deadline_days: d.deadline_days,
          guidelines: d.guidelines,
          requires_approval: d.requires_approval,
        }))
      );
    }
    setPkgModalOpen(true);
  }

  async function handleSavePackage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedService || !pkgName.trim()) return;
    const filteredDeliverables = pkgDeliverables.filter((d) => d.qty > 0);
    const payload = {
      name: pkgName.trim(),
      description: pkgDesc.trim(),
      price_pix: Number(pkgPricePix) || 0,
      price_card: Number(pkgPriceCard) || Number(pkgPricePix) || 0,
      deadline_days: Number(pkgDeadline) || 15,
      conditions: pkgConditions.trim(),
      is_featured: pkgFeatured,
      deliverables_config: filteredDeliverables,
    };

    if (editingPkg) {
      const res = await api<{ service: Service }>(`/services/packages/${editingPkg.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      populateEditor(res.service);
    } else {
      const res = await api<{ service: Service }>(`/services/${selectedService.id}/packages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      populateEditor(res.service);
    }
    setPkgModalOpen(false);
    await loadServices();
  }

  async function handleDuplicatePackage(pkgId: string) {
    const res = await api<{ service: Service }>(`/services/packages/${pkgId}/duplicate`, { method: 'POST' });
    populateEditor(res.service);
    await loadServices();
  }

  async function handleTogglePackageStatus(pkg: ServicePackage) {
    const res = await api<{ service: Service }>(`/services/packages/${pkg.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: pkg.status === 'active' ? 'archived' : 'active' }),
    });
    populateEditor(res.service);
    await loadServices();
  }

  async function handleDeletePackage(pkgId: string) {
    const res = await api<{ service: Service }>(`/services/packages/${pkgId}`, { method: 'DELETE' });
    if (res.service) populateEditor(res.service);
    await loadServices();
  }

  const filteredServices = services.filter((s) => {
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ==================== SERVICE DETAIL / EDITOR VIEW ====================
  if (selectedService || isCreating) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedService(null);
                setIsCreating(false);
              }}
              className="px-3 py-2 rounded-xl border border-black/10 hover:bg-black/[0.03] text-xs font-medium inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Serviços</span>
            </button>
            <div>
              <h2 className="font-editorial text-2xl sm:text-3xl text-[#232122]">
                {isCreating ? 'Novo serviço' : name}
              </h2>
              <p className="text-xs text-[#232122]/55">
                Configure entregáveis, etapas do processo e pacotes utilizados automaticamente na criação de quadros.
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2.5">
              {selectedService && (
                <>
                  <button
                    type="button"
                    onClick={() => handleArchiveToggle(selectedService)}
                    className="px-3.5 py-2 rounded-xl border border-black/10 hover:bg-black/[0.03] text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{status === 'active' ? 'Arquivar' : 'Reativar'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteService(selectedService.id)}
                    className="p-2 rounded-xl border border-black/10 hover:border-red-300 hover:text-red-600 text-[#232122]/55"
                    title="Excluir serviço"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleSaveService}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Salvando...' : 'Salvar alterações'}</span>
              </button>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/30 text-sm text-[#A9195A] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-[#F4F5E2] border border-[#C8C978]/50 text-sm text-[#3E4113] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left column: Informações gerais & Configurações */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#232122]">Informações gerais</h3>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Nome do serviço *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManage}
                  placeholder="Ex: Design de Posts"
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm focus:outline-none focus:border-[#EC2B82]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canManage}
                  placeholder="Descreva o propósito e escopo deste serviço..."
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm focus:outline-none focus:border-[#EC2B82]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#232122]/75">Categoria</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={!canManage}
                    className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm focus:outline-none focus:border-[#EC2B82]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#232122]/75">Prazo padrão (dias)</label>
                  <input
                    type="number"
                    min={1}
                    value={defaultDeadlineDays}
                    onChange={(e) => setDefaultDeadlineDays(Number(e.target.value))}
                    disabled={!canManage}
                    className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums focus:outline-none focus:border-[#EC2B82]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Cor de identificação</label>
                <div className="flex items-center gap-2.5 pt-1">
                  {SERVICE_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      disabled={!canManage}
                      onClick={() => setColor(c.hex)}
                      title={c.label}
                      className={`w-7 h-7 rounded-full transition-transform ${color === c.hex ? 'ring-2 ring-offset-2 ring-[#232122] scale-105' : ''}`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* O que está incluso */}
              <div className="space-y-2 pt-2 border-t border-black/[0.06]">
                <label className="text-xs font-medium text-[#232122]/75">O que está incluso</label>
                <div className="space-y-1.5">
                  {includedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#FCF6EC]/70 text-xs">
                      <span className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-[#EC2B82]" />
                        {item}
                      </span>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setIncludedItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[#232122]/40 hover:text-red-600"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIncludedItem}
                      onChange={(e) => setNewIncludedItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newIncludedItem.trim()) {
                            setIncludedItems((p) => [...p, newIncludedItem.trim()]);
                            setNewIncludedItem('');
                          }
                        }
                      }}
                      placeholder="Adicionar item incluso..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newIncludedItem.trim()) {
                          setIncludedItems((p) => [...p, newIncludedItem.trim()]);
                          setNewIncludedItem('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-black/[0.05] hover:bg-black/10 text-xs font-medium"
                    >
                      Incluir
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-1.5 pt-2 border-t border-black/[0.06]">
                <label className="text-xs font-medium text-[#232122]/75">Informações necessárias do cliente</label>
                <textarea
                  rows={2}
                  value={clientInfoNeeded}
                  onChange={(e) => setClientInfoNeeded(e.target.value)}
                  disabled={!canManage}
                  placeholder="Ex: Briefing respondido, logotipo em vetor, copys..."
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                />
              </div>

              {/* Campos Estruturados para Envio do Cliente */}
              <div className="space-y-2.5 pt-2 border-t border-black/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-medium text-[#232122]/85">Campos exigidos do cliente no cartão</label>
                    <p className="text-[11px] text-[#232122]/50">
                      Herdados automaticamente pelos novos quadros e exibidos ao cliente no envio de conteúdo.
                    </p>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() =>
                        setClientRequirements((prev) => [
                          ...prev,
                          {
                            key: `campo_${Date.now().toString(36)}`,
                            label: 'Novo campo',
                            type: 'textarea',
                            required: false,
                          },
                        ])
                      }
                      className="text-xs font-medium text-[#EC2B82] hover:underline inline-flex items-center gap-1 shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Campo
                    </button>
                  )}
                </div>

                {clientRequirements.length > 0 && (
                  <div className="space-y-2">
                    {clientRequirements.map((reqField, idx) => (
                      <div key={reqField.key + idx} className="p-2.5 rounded-xl bg-[#F8F5FB] border border-[#BC9FE6]/30 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={reqField.label}
                            disabled={!canManage}
                            onChange={(e) =>
                              setClientRequirements((prev) =>
                                prev.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f))
                              )
                            }
                            placeholder="Nome do campo (ex: Briefing do post)"
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-black/10 bg-white text-xs"
                          />
                          <select
                            value={reqField.type}
                            disabled={!canManage}
                            onChange={(e) =>
                              setClientRequirements((prev) =>
                                prev.map((f, i) =>
                                  i === idx
                                    ? { ...f, type: e.target.value as ServiceRequirementField['type'] }
                                    : f
                                )
                              )
                            }
                            className="px-2 py-1.5 rounded-lg border border-black/10 bg-white text-xs"
                          >
                            <option value="text">Texto curto</option>
                            <option value="textarea">Texto longo</option>
                            <option value="link">Link</option>
                            <option value="file">Arquivo</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <label className="inline-flex items-center gap-1.5 text-[#232122]/70">
                            <input
                              type="checkbox"
                              checked={Boolean(reqField.required)}
                              disabled={!canManage}
                              onChange={(e) =>
                                setClientRequirements((prev) =>
                                  prev.map((f, i) => (i === idx ? { ...f, required: e.target.checked } : f))
                                )
                              }
                              className="rounded accent-[#EC2B82]"
                            />
                            Obrigatório
                          </label>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() =>
                                setClientRequirements((prev) => prev.filter((_, i) => i !== idx))
                              }
                              className="text-red-500 hover:underline"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Observações internas</label>
                <textarea
                  rows={2}
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  disabled={!canManage}
                  placeholder="Notas apenas para Ingrid e Mariana..."
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FCF6EC]/40 focus:outline-none focus:border-[#EC2B82]"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-black/[0.06]">
                <label className="flex items-center justify-between text-xs text-[#232122]/80">
                  <span>Exige aprovação do cliente</span>
                  <input
                    type="checkbox"
                    checked={requiresApproval}
                    onChange={(e) => setRequiresApproval(e.target.checked)}
                    disabled={!canManage}
                    className="rounded accent-[#EC2B82]"
                  />
                </label>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div>
                    <span className="text-xs font-medium text-[#232122]/85 block">
                      Exibir este serviço no Portal do Cliente?
                    </span>
                    <span className="text-[11px] text-[#232122]/50">
                      Apenas serviços com &ldquo;Sim&rdquo; geram e exibem demandas na área do cliente.
                    </span>
                  </div>
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-[#F3ECF9] shrink-0">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setVisibleInPortal(true)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        visibleInPortal ? 'bg-[#EC2B82] text-white shadow-xs' : 'text-[#232122]/60 hover:text-[#232122]'
                      }`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => setVisibleInPortal(false)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        !visibleInPortal ? 'bg-[#2F1534] text-white shadow-xs' : 'text-[#232122]/60 hover:text-[#232122]'
                      }`}
                    >
                      Não
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Etapas do processo */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#232122]">Etapas do processo</h3>
                {canManage && (
                  <button
                    type="button"
                    onClick={() =>
                      setProcessSteps((p) => [
                        ...p,
                        { id: `st-${Date.now()}`, title: 'Nova etapa', description: '', active: true },
                      ])
                    }
                    className="text-xs font-medium text-[#EC2B82] hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar etapa
                  </button>
                )}
              </div>
              <div className="space-y-2.5">
                {processSteps.map((step, idx) => (
                  <div key={step.id} className="p-3 rounded-xl border border-black/[0.07] bg-[#FCF6EC]/35 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[11px] font-semibold flex items-center justify-center tabular-nums shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={step.title}
                        disabled={!canManage}
                        onChange={(e) =>
                          setProcessSteps((prev) =>
                            prev.map((s, i) => (i === idx ? { ...s, title: e.target.value } : s))
                          )
                        }
                        className="flex-1 text-xs font-semibold bg-transparent border-b border-transparent focus:border-[#EC2B82] focus:outline-none"
                      />
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => setProcessSteps((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-[#232122]/35 hover:text-red-600 text-xs"
                        >
                          Remover
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={step.description}
                      disabled={!canManage}
                      placeholder="Descrição curta da etapa..."
                      onChange={(e) =>
                        setProcessSteps((prev) =>
                          prev.map((s, i) => (i === idx ? { ...s, description: e.target.value } : s))
                        )
                      }
                      className="w-full text-[11px] text-[#232122]/70 bg-transparent focus:outline-none pl-7"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: Entregáveis + Pacotes */}
          <div className="lg:col-span-7 space-y-6">
            {/* Entregáveis vinculados */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#232122]">Entregáveis do serviço</h3>
                  <p className="text-xs text-[#232122]/55">Tipos de peças e entregas que serão geradas como cartões nos quadros</p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() =>
                      setDeliverables((p) => [
                        ...p,
                        {
                          name: '',
                          description: '',
                          format: 'Digital',
                          default_qty: 1,
                          deadline_days: 7,
                          guidelines: '',
                          requires_approval: true,
                        },
                      ])
                    }
                    className="px-3 py-1.5 rounded-xl bg-[#F3ECF9] text-[#7A689C] hover:bg-[#7A689C] hover:text-white text-xs font-medium inline-flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo entregável</span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {deliverables.map((del, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-black/[0.08] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-5 space-y-1">
                        <label className="text-[11px] text-[#232122]/55">Nome do entregável</label>
                        <input
                          type="text"
                          value={del.name}
                          disabled={!canManage}
                          placeholder="Ex: Design de Posts"
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((d, i) => (i === idx ? { ...d, name: e.target.value } : d))
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-black/12 text-xs font-medium"
                        />
                      </div>
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[11px] text-[#232122]/55">Formato</label>
                        <input
                          type="text"
                          value={del.format}
                          disabled={!canManage}
                          placeholder="1080x1350px"
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((d, i) => (i === idx ? { ...d, format: e.target.value } : d))
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-black/12 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] text-[#232122]/55">Qtd padrão</label>
                        <input
                          type="number"
                          min={1}
                          value={del.default_qty}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((d, i) => (i === idx ? { ...d, default_qty: Number(e.target.value) } : d))
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-black/12 text-xs tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-2 space-y-1">
                        <label className="text-[11px] text-[#232122]/55">Prazo (d)</label>
                        <input
                          type="number"
                          min={1}
                          value={del.deadline_days}
                          disabled={!canManage}
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((d, i) => (i === idx ? { ...d, deadline_days: Number(e.target.value) } : d))
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border border-black/12 text-xs tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-8">
                        <input
                          type="text"
                          value={del.guidelines}
                          disabled={!canManage}
                          placeholder="Orientações de produção..."
                          onChange={(e) =>
                            setDeliverables((prev) =>
                              prev.map((d, i) => (i === idx ? { ...d, guidelines: e.target.value } : d))
                            )
                          }
                          className="w-full px-3 py-1.5 rounded-lg border border-black/10 text-xs bg-[#FCF6EC]/35"
                        />
                      </div>
                      <div className="sm:col-span-4 flex items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-[#232122]/70">
                          <input
                            type="checkbox"
                            checked={del.requires_approval}
                            disabled={!canManage}
                            onChange={(e) =>
                              setDeliverables((prev) =>
                                prev.map((d, i) => (i === idx ? { ...d, requires_approval: e.target.checked } : d))
                              )
                            }
                            className="rounded accent-[#EC2B82]"
                          />
                          Aprovação cliente
                        </label>
                        {canManage && deliverables.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeliverables((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-xs text-[#232122]/40 hover:text-red-600"
                          >
                            Excluir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pacotes */}
            <div className="rounded-2xl border border-black/[0.08] bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#232122]">Pacotes do serviço</h3>
                  <p className="text-xs text-[#232122]/55">
                    {isCreating
                      ? 'Salve o serviço primeiro para adicionar pacotes com quantidades personalizadas.'
                      : 'Configure planos, valores e quantidades exatas de cada entregável.'}
                  </p>
                </div>
                {!isCreating && selectedService && canManage && (
                  <button
                    type="button"
                    onClick={() => openPackageModal()}
                    className="px-3.5 py-2 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar pacote</span>
                  </button>
                )}
              </div>

              {selectedService && (
                <div className="space-y-3">
                  {selectedService.packages.length === 0 ? (
                    <div className="py-8 text-center text-sm text-[#232122]/50 border border-dashed border-black/12 rounded-2xl">
                      Nenhum pacote cadastrado ainda para este serviço.
                    </div>
                  ) : (
                    selectedService.packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className={`p-5 rounded-2xl border transition-colors ${
                          pkg.status === 'archived'
                            ? 'bg-black/[0.02] border-black/[0.06] opacity-65'
                            : pkg.is_featured
                            ? 'bg-[#FDF2F6]/45 border-[#EC97B7]/60'
                            : 'bg-white border-black/[0.08]'
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-semibold text-[#232122]">{pkg.name}</h4>
                              {pkg.is_featured && (
                                <span className="text-[11px] font-medium text-[#EC2B82] inline-flex items-center gap-1">
                                  <Star className="w-3 h-3 fill-current" /> Mais escolhido
                                </span>
                              )}
                              {pkg.status === 'archived' && (
                                <span className="text-[11px] text-[#232122]/50">Arquivado</span>
                              )}
                            </div>
                            <p className="text-xs text-[#232122]/65">{pkg.description}</p>
                          </div>

                          <div className="text-right">
                            <p className="text-sm font-semibold text-[#232122] tabular-nums">
                              {formatBRL(pkg.price_pix)} <span className="text-xs font-normal text-[#232122]/55">Pix</span>
                            </p>
                            {pkg.price_card > 0 && pkg.price_card !== pkg.price_pix && (
                              <p className="text-xs text-[#232122]/55 tabular-nums">
                                {formatBRL(pkg.price_card)} Cartão
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#232122]/75">
                          {pkg.deliverables_config.map((d, idx) => (
                            <span key={idx} className="tabular-nums">
                              <strong className="font-semibold">{d.qty}×</strong> {d.name} ({d.format})
                            </span>
                          ))}
                        </div>

                        {canManage && (
                          <div className="mt-4 pt-3 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="text-[#232122]/50 tabular-nums">
                              Prazo: {pkg.deadline_days} dias {pkg.conditions ? `· ${pkg.conditions}` : ''}
                            </span>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => openPackageModal(pkg)}
                                className="font-medium text-[#2F1534] hover:text-[#EC2B82]"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicatePackage(pkg.id)}
                                className="text-[#232122]/65 hover:text-[#232122] inline-flex items-center gap-1"
                              >
                                <Copy className="w-3 h-3" /> Duplicar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTogglePackageStatus(pkg)}
                                className="text-[#232122]/65 hover:text-[#232122]"
                              >
                                {pkg.status === 'active' ? 'Arquivar' : 'Ativar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePackage(pkg.id)}
                                className="text-red-600/75 hover:text-red-700"
                              >
                                Excluir
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Package Modal */}
        <MacWindow
          open={pkgModalOpen}
          onClose={() => setPkgModalOpen(false)}
          isDirty={Boolean(pkgName.trim())}
          maxWidthClass="max-w-2xl"
          title={editingPkg ? `Editar pacote: ${editingPkg.name}` : 'Novo pacote'}
          subtitle={selectedService?.name}
          icon={<PackageIcon className="w-4 h-4 text-[#EC2B82]" />}
        >
          <form onSubmit={handleSavePackage} className="p-6 sm:p-7 space-y-4 bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#232122]/75">Nome do pacote *</label>
                <input
                  type="text"
                  required
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  placeholder="Ex: Pro"
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#232122]/75">Prazo (dias)</label>
                <input
                  type="number"
                  min={1}
                  value={pkgDeadline}
                  onChange={(e) => setPkgDeadline(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Descrição do pacote</label>
              <input
                type="text"
                value={pkgDesc}
                onChange={(e) => setPkgDesc(e.target.value)}
                placeholder="Ex: Mais conteúdo e consistência estratégica"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#232122]/75">Valor Pix (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={pkgPricePix}
                  onChange={(e) => setPkgPricePix(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#232122]/75">Valor Cartão (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={pkgPriceCard}
                  onChange={(e) => setPkgPriceCard(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Condições e observações</label>
              <input
                type="text"
                value={pkgConditions}
                onChange={(e) => setPkgConditions(e.target.value)}
                placeholder="Ex: Pagamento 50/50 ou até 3x sem juros"
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#232122]/80">
              <input
                type="checkbox"
                checked={pkgFeatured}
                onChange={(e) => setPkgFeatured(e.target.checked)}
                className="rounded accent-[#EC2B82]"
              />
              Destacar como pacote mais escolhido
            </label>

            <div className="pt-3 border-t border-black/[0.06] space-y-2.5">
              <p className="text-xs font-semibold text-[#232122]">Quantidades de entregáveis neste pacote</p>
              {pkgDeliverables.map((d, idx) => (
                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#FCF6EC]/60">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#232122] truncate">{d.name}</p>
                    <p className="text-[11px] text-[#232122]/55">{d.format}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-[11px] text-[#232122]/60">Qtd:</label>
                    <input
                      type="number"
                      min={0}
                      value={d.qty}
                      onChange={(e) =>
                        setPkgDeliverables((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, qty: Math.max(0, Number(e.target.value)) } : item))
                        )
                      }
                      className="w-20 px-2.5 py-1.5 rounded-lg border border-black/15 bg-white text-xs text-center tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={() => setPkgModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm text-[#232122]/65 hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-sm font-medium"
              >
                Salvar pacote
              </button>
            </div>
          </form>
        </MacWindow>
      </div>
    );
  }

  // ==================== SERVICES LIST LANDING ====================
  return (
    <div className="space-y-6">
      <div className="aumi-glass-strong rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[11px] font-semibold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Catálogo Criativo
          </span>
          <h2 className="font-editorial text-3xl text-[#2F1534]">Serviços &amp; Pacotes</h2>
          <p className="text-sm text-[#232122]/65 mt-1">
            Gerencie modelos editáveis, entregáveis e pacotes integrados à criação automática de quadros.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={startNewService}
            className="px-4 py-2.5 rounded-2xl bg-[#2F1534] hover:bg-[#232122] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap self-start shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Novo serviço personalizado</span>
          </button>
        )}
      </div>

      {/* Search & Status Tabs */}
      <div className="aumi-glass rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-[#232122]/40 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar serviço ou categoria..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-black/10 bg-white/90 text-sm focus:outline-none focus:border-[#EC2B82]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/75 border border-black/[0.06] self-start">
          {[
            { id: 'active', label: 'Ativos' },
            { id: 'archived', label: 'Arquivados' },
            { id: 'all', label: 'Todos' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as 'active' | 'archived' | 'all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === tab.id ? 'bg-[#2F1534] text-white shadow-sm' : 'text-[#232122]/65 hover:text-[#232122]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-52 rounded-2xl aumi-glass animate-pulse" />
          ))}
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="aumi-glass-strong rounded-3xl border border-dashed border-black/15 p-12 text-center space-y-3">
          <Sparkles className="w-8 h-8 text-[#EC97B7] mx-auto" />
          <h3 className="text-base font-semibold text-[#232122]">Nenhum serviço encontrado</h3>
          <p className="text-sm text-[#232122]/55 max-w-md mx-auto">
            Cadastre seus serviços e pacotes para gerar entregas automaticamente ao abrir novos quadros.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={startNewService}
              className="mt-2 px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-sm font-medium inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Cadastrar serviço
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredServices.map((svc) => (
            <div
              key={svc.id}
              onClick={() => populateEditor(svc)}
              className="group aumi-glass-strong rounded-[24px] hover:border-[#EC97B7] p-6 flex flex-col justify-between gap-5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: svc.color || '#EC2B82' }}
                  >
                    <Layers className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-white/80 text-[11px] font-medium text-[#232122]/65">
                    {svc.category} · {svc.status === 'active' ? 'Ativo' : 'Arquivado'}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-[#2F1534] group-hover:text-[#EC2B82] transition-colors">
                    {svc.name}
                  </h3>
                  <p className="text-xs leading-relaxed text-[#232122]/65 mt-1 line-clamp-2">
                    {svc.description || 'Sem descrição cadastrada.'}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-black/[0.06] space-y-2 text-xs text-[#232122]/75">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <PackageIcon className="w-3.5 h-3.5 text-[#7A689C]" />
                    {svc.packages.length} {svc.packages.length === 1 ? 'pacote' : 'pacotes'} · {svc.deliverables.length} entregáveis
                  </span>
                  <span className="font-semibold text-[#2F1534] group-hover:text-[#EC2B82]">Configurar →</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#7A689C] tabular-nums">
                  <span>{svc.boards_count ?? 0} quadros</span>
                  <span>·</span>
                  <span>{svc.active_deliverables_count ?? 0} peças ativas</span>
                  {(svc.pending_demands_count ?? 0) > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-[#E1754C] font-medium">{svc.pending_demands_count} aguardando cliente</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
