import React, { useEffect, useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Trash2,
  Edit3,
  Wallet,
  BarChart3,
} from 'lucide-react';
import { api, formatBRL, formatDateBR } from '../lib/api.ts';
import { Board, Client, FinanceEntry, FinanceMonthlyPoint, Service, User } from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';

interface FinanceViewProps {
  user: User;
}

interface FinanceUpcomingItem {
  id: string;
  description: string;
  amount: number;
  due_date: string | null;
  entry_date: string;
  status: string;
  client_name?: string | null;
}

interface FinanceSummaryResponse {
  summary: {
    balance: number;
    total_income: number;
    total_expense: number;
    pending_receivable: number;
    pending_payable: number;
    period_result: number;
  };
  by_client: Array<{ id: string; name: string; total: number }>;
  by_service: Array<{ name: string; total: number }>;
  monthly_series?: FinanceMonthlyPoint[];
  upcoming_receivables?: FinanceUpcomingItem[];
  upcoming_payables?: FinanceUpcomingItem[];
}

const CATEGORIES_INCOME = ['Serviços Criativos', 'Pacote Mensal', 'Identidade Visual', 'Consultoria', 'Outros Recebimentos'];
const CATEGORIES_EXPENSE = ['Softwares & Ferramentas', 'Impostos & Taxas', 'Marketing', 'Equipamentos', 'Fornecedores', 'Operacional'];

export function FinanceView({ user }: FinanceViewProps) {
  const [entries, setEntries] = useState<FinanceEntry[]>([]);
  const [summaryData, setSummaryData] = useState<FinanceSummaryResponse | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [partners, setPartners] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [responsibleFilter, setResponsibleFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<FinanceEntry | null>(null);
  const [entryType, setEntryType] = useState<'income' | 'expense'>('income');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(CATEGORIES_INCOME[0]);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'pending' | 'paid' | 'overdue' | 'cancelled'>('pending');
  const [clientId, setClientId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [boardId, setBoardId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Pix');
  const [notes, setNotes] = useState('');
  const [splitSociety, setSplitSociety] = useState(false);

  const canManage = user.permissions.can_manage_finance;

  async function loadAll() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (clientFilter !== 'all') params.set('client_id', clientFilter);
      if (responsibleFilter !== 'all') params.set('responsible', responsibleFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const sumParams = new URLSearchParams();
      if (fromDate) sumParams.set('from', fromDate);
      if (toDate) sumParams.set('to', toDate);

      const [eRes, sRes, cRes, svcRes, bRes, pRes] = await Promise.all([
        api<{ entries: FinanceEntry[] }>(`/finance/entries?${params.toString()}`),
        api<FinanceSummaryResponse>(`/finance/summary?${sumParams.toString()}`),
        api<{ clients: Client[] }>('/clients'),
        api<{ services: Service[] }>('/services?status=all'),
        api<{ boards: Board[] }>('/boards'),
        api<{ partners: User[] }>('/partners'),
      ]);
      setEntries(eRes.entries);
      setSummaryData(sRes);
      setClients(cRes.clients);
      setServices(svcRes.services);
      setBoards(bRes.boards);
      setPartners(pRes.partners || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter, categoryFilter, clientFilter, responsibleFilter, fromDate, toDate]);

  function openNewModal(defaultType: 'income' | 'expense' = 'income') {
    setEditingEntry(null);
    setEntryType(defaultType);
    setDescription('');
    setAmount('');
    setCategory(defaultType === 'income' ? CATEGORIES_INCOME[0] : CATEGORIES_EXPENSE[0]);
    setEntryDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date().toISOString().slice(0, 10));
    setStatus('pending');
    setClientId('');
    setServiceId('');
    setBoardId('');
    setPaymentMethod('Pix');
    setNotes('');
    setSplitSociety(false);
    setModalOpen(true);
  }

  function openEditModal(entry: FinanceEntry) {
    setEditingEntry(entry);
    setEntryType(entry.type);
    setDescription(entry.description);
    setAmount(String(entry.amount));
    setCategory(entry.category);
    setEntryDate(entry.entry_date);
    setDueDate(entry.due_date || '');
    setStatus(entry.status);
    setClientId(entry.client_id || '');
    setServiceId(entry.service_id || '');
    setBoardId(entry.board_id || '');
    setPaymentMethod(entry.payment_method);
    setNotes(entry.notes);
    setSplitSociety(false);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      type: entryType,
      description: description.trim(),
      amount: Number(amount),
      category,
      entry_date: entryDate,
      due_date: dueDate || null,
      status,
      client_id: clientId || null,
      service_id: serviceId || null,
      board_id: boardId || null,
      payment_method: paymentMethod,
      notes,
      split_society: splitSociety,
    };

    if (editingEntry) {
      await api(`/finance/entries/${editingEntry.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } else {
      await api('/finance/entries', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    }
    setModalOpen(false);
    await loadAll();
  }

  async function handleMarkPaid(entry: FinanceEntry) {
    await api(`/finance/entries/${entry.id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'paid' }),
    });
    await loadAll();
  }

  async function handleDelete(id: string) {
    await api(`/finance/entries/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  const sum = summaryData?.summary;
  const allCategories = Array.from(new Set([...CATEGORIES_INCOME, ...CATEGORIES_EXPENSE, ...entries.map((e) => e.category)]));
  const monthlySeries = summaryData?.monthly_series || [];
  const maxMonthVal = Math.max(
    1,
    ...monthlySeries.flatMap((m) => [Number(m.income) || 0, Number(m.expense) || 0])
  );
  const maxClientRev = Math.max(1, ...(summaryData?.by_client || []).map((c) => c.total));
  const maxServiceRev = Math.max(1, ...(summaryData?.by_service || []).map((s) => s.total));

  if (!canManage) {
    return (
      <div className="aumi-glass-strong rounded-3xl p-12 text-center space-y-2">
        <Wallet className="w-8 h-8 text-[#7A689C] mx-auto" />
        <h2 className="font-editorial text-2xl text-[#2F1534]">Acesso restrito ao Financeiro</h2>
        <p className="text-sm text-[#232122]/60">Sua conta não possui permissão ativa para visualizar ou gerenciar lançamentos financeiros.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="aumi-glass-strong rounded-[28px] p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDF0E8] text-[#E1754C] text-[11px] font-semibold mb-2">
            <Wallet className="w-3.5 h-3.5" />
            Gestão Financeira
          </span>
          <h2 className="font-editorial text-3xl text-[#2F1534]">Financeiro do Estúdio</h2>
          <p className="text-sm text-[#232122]/65 mt-1">
            Controle entradas, despesas, contas a receber/pagar e fluxo mensal por cliente e serviço.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => openNewModal('expense')}
            className="px-4 py-2.5 rounded-2xl bg-white/90 border border-black/10 hover:bg-white text-xs font-semibold text-[#232122] inline-flex items-center gap-1.5"
          >
            <ArrowDownRight className="w-4 h-4 text-[#E1754C]" />
            <span>Nova despesa</span>
          </button>
          <button
            type="button"
            onClick={() => openNewModal('income')}
            className="px-4 py-2.5 rounded-2xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>Nova entrada</span>
          </button>
        </div>
      </div>

      {/* Real KPI Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="aumi-glass-strong p-5 rounded-[22px] bg-gradient-to-br from-[#F3ECF9]/80 to-white/90">
          <p className="text-xs text-[#7A689C] font-medium">Saldo líquido</p>
          <p className="mt-2 text-2xl font-semibold text-[#2F1534] tabular-nums">{formatBRL(sum?.balance ?? 0)}</p>
        </div>
        <div className="aumi-glass-strong p-5 rounded-[22px]">
          <p className="text-xs text-[#232122]/60 font-medium">Total de entradas</p>
          <p className="mt-2 text-2xl font-semibold text-[#5D5F24] tabular-nums">{formatBRL(sum?.total_income ?? 0)}</p>
        </div>
        <div className="aumi-glass-strong p-5 rounded-[22px]">
          <p className="text-xs text-[#232122]/60 font-medium">Total de despesas</p>
          <p className="mt-2 text-2xl font-semibold text-[#7A689C] tabular-nums">{formatBRL(sum?.total_expense ?? 0)}</p>
        </div>
        <div className="aumi-glass-strong p-5 rounded-[22px] bg-gradient-to-br from-[#FDF2F6]/85 to-white/90">
          <p className="text-xs text-[#EC2B82] font-medium">A receber (pendente)</p>
          <p className="mt-2 text-2xl font-semibold text-[#EC2B82] tabular-nums">{formatBRL(sum?.pending_receivable ?? 0)}</p>
        </div>
        <div className="col-span-2 lg:col-span-1 aumi-glass-strong p-5 rounded-[22px] bg-gradient-to-br from-[#FDF0E8]/85 to-white/90">
          <p className="text-xs text-[#E1754C] font-medium">Contas a pagar</p>
          <p className="mt-2 text-2xl font-semibold text-[#E1754C] tabular-nums">{formatBRL(sum?.pending_payable ?? 0)}</p>
        </div>
      </div>

      {/* Monthly Cashflow Comparison Chart */}
      {monthlySeries.length > 0 && (
        <div className="aumi-glass-strong rounded-[24px] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#7A689C]" />
              <h3 className="text-sm font-semibold text-[#2F1534]">Fluxo mensal (Entradas vs. Despesas)</h3>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-medium text-[#232122]/70">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EC2B82]" />
                Entradas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#7A689C]" />
                Despesas
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 pt-1">
            {monthlySeries.map((pt) => {
              const incPct = Math.round(((Number(pt.income) || 0) / maxMonthVal) * 100);
              const expPct = Math.round(((Number(pt.expense) || 0) / maxMonthVal) * 100);
              return (
                <div key={pt.month} className="p-3 rounded-2xl bg-white/80 border border-black/[0.06] space-y-2.5">
                  <p className="text-xs font-semibold text-[#2F1534] tabular-nums">{pt.month}</p>
                  <div className="h-24 flex items-end gap-2 px-2">
                    <div className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-[#EC2B82] to-[#EC97B7] transition-all"
                        style={{ height: `${Math.max(incPct, pt.income > 0 ? 8 : 2)}%` }}
                        title={`Entradas: ${formatBRL(pt.income)}`}
                      />
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full rounded-t-lg bg-gradient-to-t from-[#7A689C] to-[#BC9FE6] transition-all"
                        style={{ height: `${Math.max(expPct, pt.expense > 0 ? 8 : 2)}%` }}
                        title={`Despesas: ${formatBRL(pt.expense)}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-0.5 text-[10px] tabular-nums">
                    <p className="text-[#EC2B82] font-semibold">+{formatBRL(pt.income)}</p>
                    <p className="text-[#7A689C]">-{formatBRL(pt.expense)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="aumi-glass p-4 rounded-2xl flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/75">
          {[
            { id: 'all', label: 'Tudo' },
            { id: 'income', label: 'Entradas' },
            { id: 'expense', label: 'Despesas' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTypeFilter(t.id as 'all' | 'income' | 'expense')}
              className={`px-3 py-1 rounded-lg text-xs font-medium ${
                typeFilter === t.id ? 'bg-[#2F1534] text-white shadow-sm' : 'text-[#232122]/65'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todos os status</option>
          <option value="paid">Recebido / Pago</option>
          <option value="pending">Pendente</option>
          <option value="overdue">Vencido</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todas categorias</option>
          {allCategories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-black/10 text-xs bg-white/90"
        >
          <option value="all">Todas as sócias</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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

      {/* Breakdowns + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 aumi-surface-solid rounded-[24px] overflow-hidden">
          <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#2F1534]">Histórico de movimentações</h3>
            <span className="text-xs text-[#232122]/50 tabular-nums">{entries.length} registros</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-[#232122]/50">Carregando lançamentos...</div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-medium text-[#232122]">Nenhum lançamento encontrado para este filtro</p>
              <p className="text-xs text-[#232122]/55">Registre entradas ou despesas para acompanhar o fluxo financeiro real do estúdio.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/[0.06] text-[11px] font-medium text-[#232122]/55">
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-3">Categoria</th>
                    <th className="py-3 px-3">Venc./Data</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.05] text-xs">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-[#FCF6EC]/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {e.type === 'income' ? (
                            <ArrowUpRight className="w-4 h-4 text-[#5D5F24] shrink-0" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-[#E1754C] shrink-0" />
                          )}
                          <div>
                            <p className="font-medium text-[#232122]">{e.description}</p>
                            {(e.client_name || e.service_name) && (
                              <p className="text-[11px] text-[#232122]/50">
                                {[e.client_name, e.service_name, e.payment_method].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-[#232122]/70">{e.category}</td>
                      <td className="py-3 px-3 text-[#232122]/65 tabular-nums">
                        {formatDateBR(e.due_date || e.entry_date)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-medium ${
                            e.status === 'paid'
                              ? 'text-[#5D5F24]'
                              : e.status === 'overdue'
                              ? 'text-red-600'
                              : 'text-[#E1754C]'
                          }`}
                        >
                          {e.status === 'paid' ? (e.type === 'income' ? 'Recebido' : 'Pago') : e.status === 'overdue' ? 'Vencido' : 'Pendente'}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold tabular-nums ${
                          e.type === 'income' ? 'text-[#232122]' : 'text-[#7A689C]'
                        }`}
                      >
                        {e.type === 'expense' ? '- ' : '+ '}
                        {formatBRL(e.amount)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {e.status !== 'paid' && (
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(e)}
                              title="Marcar como pago/recebido"
                              className="p-1.5 rounded-lg text-[#5D5F24] hover:bg-[#F4F5E2]"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(e)}
                            title="Editar"
                            className="p-1.5 rounded-lg text-[#232122]/50 hover:text-[#232122]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(e.id)}
                            title="Excluir"
                            className="p-1.5 rounded-lg text-[#232122]/40 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Breakdowns */}
        <div className="lg:col-span-4 space-y-5">
          <div className="aumi-glass-strong rounded-[22px] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#2F1534]">Receitas por cliente</h3>
            {!summaryData?.by_client.length ? (
              <p className="text-xs text-[#232122]/45">Sem receitas vinculadas a clientes.</p>
            ) : (
              <div className="space-y-3">
                {summaryData.by_client.map((item) => {
                  const pct = Math.round((item.total / maxClientRev) * 100);
                  return (
                    <div key={item.id} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#232122]/85 truncate font-medium">{item.name}</span>
                        <span className="font-semibold text-[#2F1534] tabular-nums">{formatBRL(item.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#EC2B82] to-[#BC9FE6]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="aumi-glass-strong rounded-[22px] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#2F1534]">Receitas por serviço</h3>
            {!summaryData?.by_service.length ? (
              <p className="text-xs text-[#232122]/45">Sem receitas por serviço ainda.</p>
            ) : (
              <div className="space-y-3">
                {summaryData.by_service.map((item, idx) => {
                  const pct = Math.round((item.total / maxServiceRev) * 100);
                  return (
                    <div key={idx} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[#232122]/85 truncate font-medium">{item.name}</span>
                        <span className="font-semibold text-[#7A689C] tabular-nums">{formatBRL(item.total)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#7A689C] to-[#E1754C]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Próximos recebimentos & pagamentos */}
          <div className="aumi-glass-strong rounded-[22px] p-5 space-y-3">
            <h3 className="text-sm font-semibold text-[#2F1534]">Próximos recebimentos &amp; pagamentos</h3>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#EC2B82]">A receber</p>
              {!summaryData?.upcoming_receivables?.length ? (
                <p className="text-xs text-[#232122]/45">Nenhum recebimento pendente.</p>
              ) : (
                <div className="space-y-1.5">
                  {summaryData.upcoming_receivables.map((item) => (
                    <div key={item.id} className="p-2.5 rounded-xl bg-white/85 border border-black/[0.05] flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-[#2F1534] truncate">{item.description}</p>
                        <p className="text-[10px] text-[#232122]/55 truncate">
                          {item.client_name || 'Estúdio'} · {formatDateBR(item.due_date || item.entry_date)}
                        </p>
                      </div>
                      <span className="font-semibold text-[#EC2B82] tabular-nums shrink-0">{formatBRL(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-black/[0.06]">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#E1754C]">A pagar</p>
              {!summaryData?.upcoming_payables?.length ? (
                <p className="text-xs text-[#232122]/45">Nenhuma conta a pagar pendente.</p>
              ) : (
                <div className="space-y-1.5">
                  {summaryData.upcoming_payables.map((item) => (
                    <div key={item.id} className="p-2.5 rounded-xl bg-white/85 border border-black/[0.05] flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-medium text-[#2F1534] truncate">{item.description}</p>
                        <p className="text-[10px] text-[#232122]/55 truncate">
                          {formatDateBR(item.due_date || item.entry_date)}
                        </p>
                      </div>
                      <span className="font-semibold text-[#E1754C] tabular-nums shrink-0">{formatBRL(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create / Edit Entry MacWindow */}
      <MacWindow
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        isDirty={Boolean(description.trim() || amount)}
        maxWidthClass="max-w-lg"
        title={editingEntry ? 'Editar lançamento' : entryType === 'income' ? 'Nova entrada' : 'Nova despesa'}
        subtitle="Fluxo financeiro do estúdio"
        icon={<Wallet className="w-4 h-4 text-[#EC2B82]" />}
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-white">
          <div className="flex gap-2 p-1 rounded-xl bg-[#FCF6EC]">
            <button
              type="button"
              onClick={() => {
                setEntryType('income');
                setCategory(CATEGORIES_INCOME[0]);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${entryType === 'income' ? 'bg-white shadow-sm text-[#232122]' : 'text-[#232122]/60'}`}
            >
              Entrada / Recebimento
            </button>
            <button
              type="button"
              onClick={() => {
                setEntryType('expense');
                setCategory(CATEGORIES_EXPENSE[0]);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-medium ${entryType === 'expense' ? 'bg-white shadow-sm text-[#232122]' : 'text-[#232122]/60'}`}
            >
              Despesa / Conta a pagar
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#232122]/75">Descrição *</label>
            <input
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Pacote Pro Design de Posts"
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Valor (R$) *</label>
              <input
                type="number"
                required
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                {(entryType === 'income' ? CATEGORIES_INCOME : CATEGORIES_EXPENSE).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Data</label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Vencimento</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'pending' | 'paid' | 'overdue' | 'cancelled')}
                className="w-full px-2.5 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                <option value="pending">Pendente</option>
                <option value="paid">{entryType === 'income' ? 'Recebido' : 'Pago'}</option>
                <option value="overdue">Vencido</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Cliente (opcional)</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                <option value="">Nenhum</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Serviço (opcional)</label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                <option value="">Nenhum</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Projeto / Quadro</label>
              <select
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                <option value="">Nenhum</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[#232122]/75">Forma de pagamento</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
              >
                <option value="Pix">Pix</option>
                <option value="Cartão">Cartão</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-[#232122]/75">Observações</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
            />
          </div>

          {!editingEntry && (
            <label className="flex items-center gap-2 p-3 rounded-xl bg-[#F3ECF9]/60 text-xs text-[#232122]">
              <input
                type="checkbox"
                checked={splitSociety}
                onChange={(e) => setSplitSociety(e.target.checked)}
                className="rounded accent-[#EC2B82]"
              />
              <span>Vincular automaticamente à divisão societária (conforme percentuais configurados)</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs text-[#232122]/60">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-medium">
              Salvar lançamento
            </button>
          </div>
        </form>
      </MacWindow>
    </div>
  );
}
