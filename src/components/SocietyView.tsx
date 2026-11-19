import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Users, Settings2, FileCheck2, Download, Handshake } from 'lucide-react';
import { api, formatBRL, formatDateBR } from '../lib/api.ts';
import { SocietyConfig, SocietyEntry, User } from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { MacWindow } from './MacWindow.tsx';

interface SocietyViewProps {
  user: User;
}

const ENTRY_TYPE_LABELS: Record<SocietyEntry['type'], string> = {
  revenue_share: 'Divisão de Receita',
  expense_share: 'Divisão de Despesa',
  withdrawal: 'Retirada',
  investment: 'Investimento',
  agreement: 'Acordo / Deliberação',
};

export function SocietyView({ user }: SocietyViewProps) {
  const [configs, setConfigs] = useState<SocietyConfig[]>([]);
  const [entries, setEntries] = useState<SocietyEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Edit Partner Config Modal
  const [editingCfg, setEditingCfg] = useState<SocietyConfig | null>(null);
  const [equityPct, setEquityPct] = useState(50);
  const [revSplit, setRevSplit] = useState(50);
  const [expSplit, setExpSplit] = useState(50);
  const [respText, setRespText] = useState('');

  // New Entry Modal
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [entryType, setEntryType] = useState<SocietyEntry['type']>('withdrawal');
  const [partnerUserId, setPartnerUserId] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');

  const canManage = user.permissions.can_manage_society;

  async function loadOverview() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (partnerFilter !== 'all') params.set('partner_id', partnerFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const res = await api<{ configs: SocietyConfig[]; entries: SocietyEntry[] }>(
        `/society/overview?${params.toString()}`
      );
      setConfigs(res.configs);
      setEntries(res.entries);
      if (!partnerUserId && res.configs.length > 0) {
        setPartnerUserId(res.configs[0].user_id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerFilter, typeFilter, fromDate, toDate]);

  function openEditConfig(cfg: SocietyConfig) {
    setEditingCfg(cfg);
    setEquityPct(cfg.equity_percent);
    setRevSplit(cfg.default_revenue_split);
    setExpSplit(cfg.default_expense_split);
    setRespText(cfg.responsibilities.join('\n'));
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCfg) return;
    await api(`/society/config/${editingCfg.partner_key}`, {
      method: 'PUT',
      body: JSON.stringify({
        equity_percent: Number(equityPct),
        default_revenue_split: Number(revSplit),
        default_expense_split: Number(expSplit),
        responsibilities: respText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    setEditingCfg(null);
    await loadOverview();
  }

  async function handleCreateEntry(e: React.FormEvent) {
    e.preventDefault();
    await api('/society/entries', {
      method: 'POST',
      body: JSON.stringify({
        type: entryType,
        partner_user_id: partnerUserId,
        description: description.trim(),
        amount: entryType === 'agreement' ? 0 : Number(amount) || 0,
        entry_date: entryDate,
        notes: notes.trim(),
      }),
    });
    setEntryModalOpen(false);
    setDescription('');
    setAmount('');
    setNotes('');
    await loadOverview();
  }

  async function handleDeleteEntry(id: string) {
    await api(`/society/entries/${id}`, { method: 'DELETE' });
    await loadOverview();
  }

  function handleExportCSV() {
    const header = ['Data', 'Sócia', 'Tipo', 'Descrição', 'Valor', 'Observações'];
    const rows = entries.map((e) => [
      e.entry_date,
      e.partner_name,
      ENTRY_TYPE_LABELS[e.type] || e.type,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      String(e.amount || 0),
      `"${(e.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aumi-sociedade-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJSON() {
    const payload = {
      exported_at: new Date().toISOString(),
      partners: configs,
      entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aumi-sociedade-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!canManage) {
    return (
      <div className="aumi-glass-strong rounded-3xl p-12 text-center space-y-2">
        <Users className="w-8 h-8 text-[#7A689C] mx-auto" />
        <h2 className="font-editorial text-2xl text-[#2F1534]">Acesso restrito à Sociedade</h2>
        <p className="text-sm text-[#232122]/60">Sua conta não possui permissão para visualizar ou gerenciar dados societários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="aumi-glass-strong rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F4F5E2] text-[#3E4113] text-[11px] font-semibold mb-2">
            <Handshake className="w-3.5 h-3.5" />
            Sociedade Aumi Studio
          </span>
          <h2 className="font-editorial text-3xl text-[#2F1534]">Sociedade · Ingrid &amp; Mariana</h2>
          <p className="text-sm text-[#232122]/65 mt-1">
            Participação configurável, responsabilidades, retiradas, investimentos, divisão financeira e acordos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3.5 py-2.5 rounded-2xl bg-white/90 border border-black/10 hover:bg-white text-xs font-semibold text-[#232122] inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#7A689C]" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handleExportJSON}
            className="px-3.5 py-2.5 rounded-2xl bg-white/90 border border-black/10 hover:bg-white text-xs font-semibold text-[#232122] inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-[#EC2B82]" />
            <span>JSON</span>
          </button>
          <button
            type="button"
            onClick={() => setEntryModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Novo registro</span>
          </button>
        </div>
      </div>

      {/* Equity visual split bar */}
      {configs.length === 2 && (
        <div className="aumi-glass-strong rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-[#2F1534]">
            <span>{configs[0].name} · {configs[0].equity_percent}%</span>
            <span className="text-[11px] font-medium text-[#232122]/55">Divisão societária atual</span>
            <span>{configs[1].name} · {configs[1].equity_percent}%</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-black/5">
            <div
              className="h-full bg-gradient-to-r from-[#EC2B82] to-[#EC97B7] transition-all"
              style={{ width: `${configs[0].equity_percent}%` }}
            />
            <div
              className="h-full bg-gradient-to-r from-[#BC9FE6] to-[#7A689C] transition-all"
              style={{ width: `${configs[1].equity_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Partner Cards (Ingrid & Mariana) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {configs.map((cfg) => {
          const isIngrid = cfg.partner_key === 'ingrid';
          return (
            <div
              key={cfg.id}
              className={`aumi-glass-strong rounded-[26px] p-6 space-y-5 ${
                isIngrid
                  ? 'bg-gradient-to-br from-[#FDF2F6]/85 to-white/90 border-[#EC97B7]/45'
                  : 'bg-gradient-to-br from-[#F3ECF9]/85 to-white/90 border-[#BC9FE6]/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <PartnerAvatar
                    name={cfg.name}
                    partnerKey={cfg.partner_key}
                    avatarUrl={cfg.avatar_url}
                    size="lg"
                  />
                  <div>
                    <h3 className="font-editorial text-2xl text-[#2F1534]">{cfg.name}</h3>
                    <p className="text-xs text-[#232122]/60">{cfg.title}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditConfig(cfg)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-black/10 hover:border-[#EC2B82] text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>Configurar</span>
                </button>
              </div>

              {/* Configurable splits */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-white/90 border border-black/[0.06]">
                  <p className="text-[11px] text-[#232122]/55">Participação</p>
                  <p className="text-lg font-semibold text-[#232122] tabular-nums mt-0.5">{cfg.equity_percent}%</p>
                </div>
                <div className="p-3 rounded-2xl bg-white/90 border border-black/[0.06]">
                  <p className="text-[11px] text-[#232122]/55">Divisão Receitas</p>
                  <p className="text-lg font-semibold text-[#EC2B82] tabular-nums mt-0.5">{cfg.default_revenue_split}%</p>
                </div>
                <div className="p-3 rounded-2xl bg-white/90 border border-black/[0.06]">
                  <p className="text-[11px] text-[#232122]/55">Divisão Despesas</p>
                  <p className="text-lg font-semibold text-[#7A689C] tabular-nums mt-0.5">{cfg.default_expense_split}%</p>
                </div>
              </div>

              {/* Real totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-white/85">
                  <p className="text-[11px] text-[#232122]/55">Receitas</p>
                  <p className="font-semibold text-[#232122] tabular-nums mt-0.5">{formatBRL(cfg.totals.revenue_share)}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/85">
                  <p className="text-[11px] text-[#232122]/55">Despesas</p>
                  <p className="font-semibold text-[#7A689C] tabular-nums mt-0.5">{formatBRL(cfg.totals.expense_share)}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/85">
                  <p className="text-[11px] text-[#232122]/55">Retiradas</p>
                  <p className="font-semibold text-[#E1754C] tabular-nums mt-0.5">{formatBRL(cfg.totals.withdrawals)}</p>
                </div>
                <div className="p-3 rounded-xl bg-white">
                  <p className="text-[11px] text-[#232122]/55">Saldo sócia</p>
                  <p className="font-semibold text-[#2F1534] tabular-nums mt-0.5">{formatBRL(cfg.totals.net_balance)}</p>
                </div>
              </div>

              {/* Operação atual */}
              {cfg.operational && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/75 border border-black/[0.05]">
                    <p className="text-[10px] text-[#232122]/55">Clientes</p>
                    <p className="font-semibold text-[#2F1534] tabular-nums">{cfg.operational.clients_count}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/75 border border-black/[0.05]">
                    <p className="text-[10px] text-[#232122]/55">Quadros ativos</p>
                    <p className="font-semibold text-[#2F1534] tabular-nums">{cfg.operational.active_boards_count}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/75 border border-black/[0.05]">
                    <p className="text-[10px] text-[#232122]/55">Tarefas abertas</p>
                    <p className="font-semibold text-[#E1754C] tabular-nums">{cfg.operational.pending_cards_count}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/75 border border-black/[0.05]">
                    <p className="text-[10px] text-[#232122]/55">Entregas feitas</p>
                    <p className="font-semibold text-[#5D601E] tabular-nums">{cfg.operational.completed_cards_count}</p>
                  </div>
                </div>
              )}

              {/* Responsabilidades */}
              <div className="space-y-1.5 pt-1">
                <p className="text-xs font-semibold text-[#232122]/75">Responsabilidades</p>
                <div className="flex flex-wrap gap-1.5 text-xs text-[#232122]/75">
                  {cfg.responsibilities.map((r, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-white/75 border border-black/[0.05]">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="aumi-glass p-4 rounded-2xl flex flex-wrap items-center gap-3">
        <select
          value={partnerFilter}
          onChange={(e) => setPartnerFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todas as sócias</option>
          {configs.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todos os tipos</option>
          {Object.entries(ENTRY_TYPE_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 ml-auto text-xs text-[#232122]/65">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white/90 text-xs tabular-nums"
          />
          <span>até</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white/90 text-xs tabular-nums"
          />
        </div>
      </div>

      {/* Society Movements & Agreements History */}
      <div className="aumi-surface-solid rounded-[24px] overflow-hidden">
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#2F1534]">Histórico de movimentações e acordos</h3>
          <span className="text-xs text-[#232122]/50 tabular-nums">{entries.length} registros</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[#232122]/50">Carregando registros...</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <FileCheck2 className="w-7 h-7 text-[#BC9FE6] mx-auto" />
            <p className="text-sm font-medium text-[#232122]">Nenhum registro societário lançado</p>
            <p className="text-xs text-[#232122]/55">
              Registre retiradas, investimentos, acordos ou vincule movimentações a partir da aba Financeiro.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-[#FCF6EC]/40">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-[#232122]">{entry.partner_name}</span>
                    <span className="text-[#232122]/35">·</span>
                    <span className="text-[#7A689C] font-medium">{ENTRY_TYPE_LABELS[entry.type]}</span>
                    {entry.origin_type === 'finance_link' && (
                      <span className="text-[11px] text-[#232122]/50">· Vinculado ao Financeiro</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#232122]">{entry.description}</p>
                  {entry.notes && <p className="text-xs text-[#232122]/60">{entry.notes}</p>}
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    {entry.type !== 'agreement' && (
                      <p className="text-sm font-semibold text-[#232122] tabular-nums">{formatBRL(entry.amount)}</p>
                    )}
                    <p className="text-[11px] text-[#232122]/50 tabular-nums">{formatDateBR(entry.entry_date)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="p-1.5 rounded-lg text-[#232122]/35 hover:text-red-600"
                    title="Remover registro"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Partner Config MacWindow */}
      <MacWindow
        open={Boolean(editingCfg)}
        onClose={() => setEditingCfg(null)}
        maxWidthClass="max-w-md"
        title={editingCfg ? `Configurar · ${editingCfg.name}` : 'Configurar'}
        subtitle="Participação societária e responsabilidades"
        icon={<Settings2 className="w-4 h-4 text-[#7A689C]" />}
      >
        <form onSubmit={handleSaveConfig} className="p-6 space-y-4 bg-white">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#232122]/75">Participação (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={equityPct}
                onChange={(e) => setEquityPct(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#232122]/75">Receitas (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={revSplit}
                onChange={(e) => setRevSplit(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-[#232122]/75">Despesas (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={expSplit}
                onChange={(e) => setExpSplit(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#232122]/75">Responsabilidades (uma por linha)</label>
            <textarea
              rows={4}
              value={respText}
              onChange={(e) => setRespText(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditingCfg(null)} className="px-4 py-2 text-xs text-[#232122]/60">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-medium">
              Salvar alterações
            </button>
          </div>
        </form>
      </MacWindow>

      {/* New Society Entry MacWindow */}
      <MacWindow
        open={entryModalOpen}
        onClose={() => setEntryModalOpen(false)}
        isDirty={Boolean(description.trim() || amount)}
        maxWidthClass="max-w-md"
        title="Novo registro societário"
        subtitle="Retiradas, investimentos ou deliberações"
        icon={<Handshake className="w-4 h-4 text-[#EC2B82]" />}
      >
        <form onSubmit={handleCreateEntry} className="p-6 space-y-4 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Tipo</label>
              <select
                value={entryType}
                onChange={(e) => setEntryType(e.target.value as SocietyEntry['type'])}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                {Object.entries(ENTRY_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Sócia relacionada</label>
              <select
                value={partnerUserId}
                onChange={(e) => setPartnerUserId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                {configs.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#232122]/75">Descrição *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Retirada pró-labore novembro"
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {entryType !== 'agreement' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-[#232122]/75">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Data</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#232122]/75">Observações / Origem</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEntryModalOpen(false)} className="px-4 py-2 text-xs text-[#232122]/60">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-medium">
              Salvar registro
            </button>
          </div>
        </form>
      </MacWindow>
    </div>
  );
}
