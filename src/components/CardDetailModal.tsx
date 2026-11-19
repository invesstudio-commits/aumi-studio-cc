import React, { useEffect, useState } from 'react';
import {
  X,
  Check,
  MessageSquare,
  Eye,
  EyeOff,
  MoreHorizontal,
  UploadCloud,
  Link2,
  Plus,
  Send,
  Trash2,
  Download,
  FileText,
  Info,
  Tag,
  CheckSquare,
  Square,
  BookOpenCheck,
  AlertCircle,
  Calendar,
  Columns,
  Sparkles,
  Edit3,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Lock,
} from 'lucide-react';
import { api, formatRelativeTime, formatShortDateBR, uploadFile } from '../lib/api.ts';
import {
  AdjustmentType,
  BoardColumn,
  Card,
  CardHiddenSections,
  CardReferenceLink,
  ChecklistItem,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { RichTextBox, sanitizeRichHtml } from './RichTextBox.tsx';
import { LabelsManagerModal, StudioLabelItem } from './LabelsManagerModal.tsx';

interface CardDetailModalProps {
  card: Card;
  columns: BoardColumn[];
  partners: User[];
  availableLabels: StudioLabelItem[];
  mode?: 'partner' | 'client';
  variant?: 'page' | 'modal';
  onBackLabel?: string;
  portalDefaults?: {
    allow_client_comments?: boolean;
    allow_client_uploads?: boolean;
    allow_client_approvals?: boolean;
  };
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  onLabelsUpdated?: (labels: StudioLabelItem[]) => void;
  initialOpenAdjustment?: boolean;
}

const ADJUSTMENT_TYPES: AdjustmentType[] = [
  'Alteração',
  'Melhorar texto',
  'Corrigir informações',
  'Solicitar novas informações',
  'Solicitar novos materiais',
  'Outro ajuste',
];

const PRIORITY_CARDS: Array<{
  key: 'baixa' | 'normal' | 'alta' | 'urgente';
  label: string;
  desc: string;
  dot: string;
}> = [
  { key: 'baixa', label: 'Baixa', desc: 'Pode aguardar.', dot: '#22C55E' },
  { key: 'normal', label: 'Normal', desc: 'Segue a ordem de produção.', dot: '#EC2B82' },
  { key: 'alta', label: 'Alta', desc: 'Precisa de atenção prioritária.', dot: '#E1754C' },
  { key: 'urgente', label: 'Urgente', desc: 'Máxima prioridade.', dot: '#DC2626' },
];

export function CardDetailModal({
  card,
  columns,
  partners,
  availableLabels,
  mode = 'partner',
  variant = 'page',
  onBackLabel = 'Voltar ao quadro',
  portalDefaults,
  onClose,
  onUpdated,
  onDeleted,
  onLabelsUpdated,
  initialOpenAdjustment = false,
}: CardDetailModalProps) {
  const isClient = mode === 'client';
  const isPage = variant === 'page';

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [submittedText, setSubmittedText] = useState(card.submitted_content?.text || '');
  const [observations, setObservations] = useState(card.submitted_content?.notes || '');
  const [extraNotes, setExtraNotes] = useState(card.extra_notes || '');
  const [links, setLinks] = useState<CardReferenceLink[]>(() => {
    if (Array.isArray(card.links) && card.links.length > 0) return card.links;
    const legacyLinks = card.submitted_content?.links || [];
    return legacyLinks.map((u, idx) => ({ id: `lnk-${idx}`, url: u, description: 'Referência enviada' }));
  });
  const [clientAnswers, setClientAnswers] = useState<Record<string, string>>(card.submitted_content?.answers || {});
  const [columnId, setColumnId] = useState(card.column_id);
  const [leadUserId, setLeadUserId] = useState(card.lead_user_id || partners[0]?.id || '');
  const [dueDate, setDueDate] = useState(card.due_date || '');
  const [publishDate, setPublishDate] = useState(card.publish_date || '');
  const [priority, setPriority] = useState<'baixa' | 'normal' | 'alta' | 'urgente'>(card.priority || 'normal');
  const [labels, setLabels] = useState<string[]>(card.labels || []);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(card.checklist || []);
  const [clientVisible, setClientVisible] = useState(card.client_visible);
  const [hiddenSections, setHiddenSections] = useState<CardHiddenSections>(card.hidden_sections || {});
  const [internalNotes, setInternalNotes] = useState(card.internal_notes || '');

  // UI controls
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [labelsDropdownOpen, setLabelsDropdownOpen] = useState(false);
  const [labelsManagerOpen, setLabelsManagerOpen] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [addingCheck, setAddingCheck] = useState(false);
  const [linkFormOpen, setLinkFormOpen] = useState(false);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkDesc, setNewLinkDesc] = useState('');
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Comments
  const [commentText, setCommentText] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');

  // Adjustment modal
  const [adjModalOpen, setAdjModalOpen] = useState(initialOpenAdjustment);
  const [adjType, setAdjType] = useState<AdjustmentType>('Alteração');
  const [adjMessage, setAdjMessage] = useState('');
  const [adjLabelName, setAdjLabelName] = useState('Fazer alterações');
  const [adjFiles, setAdjFiles] = useState<
    Array<{ filename: string; original_name: string; mime_type: string; size_bytes: number; file_url: string }>
  >([]);
  const [adjSending, setAdjSending] = useState(false);

  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description);
    setSubmittedText(card.submitted_content?.text || '');
    setObservations(card.submitted_content?.notes || '');
    setExtraNotes(card.extra_notes || '');
    if (Array.isArray(card.links) && card.links.length > 0) {
      setLinks(card.links);
    } else {
      const legacyLinks = card.submitted_content?.links || [];
      setLinks(legacyLinks.map((u, idx) => ({ id: `lnk-${idx}`, url: u, description: 'Referência enviada' })));
    }
    setClientAnswers(card.submitted_content?.answers || {});
    setColumnId(card.column_id);
    setLeadUserId(card.lead_user_id || partners[0]?.id || '');
    setDueDate(card.due_date || '');
    setPublishDate(card.publish_date || '');
    setPriority(card.priority || 'normal');
    setLabels(card.labels || []);
    setChecklist(card.checklist || []);
    setClientVisible(card.client_visible);
    setHiddenSections(card.hidden_sections || {});
    setInternalNotes(card.internal_notes || '');
  }, [card.id, card.updated_at, card.read_at, card.column_id, card.content_status, card.approval_status, partners]);

  const currentCol = columns.find((c) => c.id === columnId) || columns[0];
  const assignedPartner = partners.find((p) => p.id === leadUserId) || partners[0];
  const primaryLabelObj = availableLabels.find((l) => labels.includes(l.name));
  const doneChecklistCount = checklist.filter((i) => i.done).length;
  const checklistPct = checklist.length > 0 ? Math.round((doneChecklistCount / checklist.length) * 100) : 0;
  const isCompleted = currentCol?.title.toLowerCase().includes('conclu');

  async function toggleSectionVisibility(section: keyof CardHiddenSections) {
    if (isClient) return;
    const nextHidden = { ...hiddenSections, [section]: !hiddenSections[section] };
    setHiddenSections(nextHidden);
    try {
      await api(`/cards/${card.id}/visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ hidden_sections: nextHidden }),
      });
      onUpdated();
    } catch {
      // revert silently if failed
    }
  }

  async function toggleCardClientVisible() {
    if (isClient) return;
    const nextVal = !clientVisible;
    setClientVisible(nextVal);
    await api(`/cards/${card.id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ client_visible: nextVal }),
    });
    onUpdated();
  }

  function renderSectionEye(section: keyof CardHiddenSections) {
    if (isClient) return null;
    const hidden = Boolean(hiddenSections[section]);
    return (
      <button
        type="button"
        onClick={() => toggleSectionVisibility(section)}
        title={hidden ? 'Oculto do cliente — clique para exibir' : 'Visível ao cliente — clique para ocultar'}
        className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full transition-colors ${
          hidden
            ? 'text-[#7A689C] bg-[#F3ECF9] hover:bg-[#E7DDF3]'
            : 'text-[#15803D] bg-[#ECFDF5] hover:bg-[#D1FAE5]'
        }`}
      >
        {hidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        <span>{hidden ? 'Oculto do cliente' : 'Visível ao cliente'}</span>
      </button>
    );
  }

  async function handleSavePartner() {
    setSaving(true);
    setActionError('');
    setActionMsg('');
    try {
      await api(`/cards/${card.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim() || card.title,
          description,
          column_id: columnId,
          lead_user_id: leadUserId || null,
          due_date: dueDate || null,
          publish_date: publishDate || null,
          priority,
          labels,
          checklist,
          extra_notes: extraNotes,
          internal_notes: internalNotes,
          links,
          hidden_sections: hiddenSections,
          client_visible: clientVisible,
          submitted_content: {
            ...(card.submitted_content || {}),
            text: submittedText,
            notes: observations,
            answers: clientAnswers,
            links: links.map((l) => l.url),
          },
        }),
      });
      setActionMsg('Alterações salvas com sucesso.');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitClient() {
    setSaving(true);
    setActionError('');
    setActionMsg('');
    try {
      await api(`/cards/${card.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim() || card.title,
          priority,
          checklist,
          extra_notes: extraNotes,
          links,
          references_text: links.map((l) => l.url).join('\n'),
          submitted_content: {
            ...(card.submitted_content || {}),
            text: submittedText,
            notes: observations,
            answers: clientAnswers,
            links: links.map((l) => l.url),
          },
          notify_team: true,
        }),
      });
      setActionMsg('Conteúdo enviado para a equipe!');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao enviar conteúdo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkRead(nextRead?: boolean) {
    setActionError('');
    const targetRead = nextRead ?? !Boolean(card.read_at);
    try {
      await api(`/cards/${card.id}/mark-read`, {
        method: 'POST',
        body: JSON.stringify({ read: targetRead }),
      });
      setActionMsg(targetRead ? 'Demanda marcada como lida.' : 'Leitura desmarcada.');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao atualizar leitura.');
    }
  }

  async function handleCompleteCard() {
    setActionError('');
    try {
      await api(`/cards/${card.id}/complete`, { method: 'POST' });
      setActionMsg('Demanda marcada como concluída!');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao concluir demanda.');
    }
  }

  async function handleSendAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!adjMessage.trim()) {
      setActionError('Descreva a orientação do ajuste para o cliente.');
      return;
    }
    setAdjSending(true);
    setActionError('');
    try {
      await api(`/cards/${card.id}/request-adjustment`, {
        method: 'POST',
        body: JSON.stringify({
          adjustment_type: adjType,
          message: adjMessage.trim(),
          label_name: adjLabelName,
          attachments: adjFiles,
        }),
      });
      setAdjModalOpen(false);
      setAdjMessage('');
      setAdjFiles([]);
      setActionMsg('Solicitação de ajuste enviada ao cliente.');
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao solicitar ajuste.');
    } finally {
      setAdjSending(false);
    }
  }

  async function handleUploadAttachment(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setActionError('');
    try {
      for (const file of files) {
        const up = await uploadFile(file);
        await api(`/cards/${card.id}/attachments`, {
          method: 'POST',
          body: JSON.stringify({
            ...up,
            is_internal: false,
          }),
        });
      }
      onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao enviar arquivo.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteAttachment(attId: string) {
    await api(`/attachments/${attId}`, { method: 'DELETE' });
    onUpdated();
  }

  function handleAddLink(e: React.FormEvent) {
    e.preventDefault();
    const cleanUrl = newLinkUrl.trim();
    if (!cleanUrl) return;
    const normalized = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') ? cleanUrl : `https://${cleanUrl}`;
    setLinks((prev) => [
      ...prev,
      {
        id: `lnk-${Date.now().toString(36)}`,
        url: normalized,
        description: newLinkDesc.trim() || 'Link de referência',
      },
    ]);
    setNewLinkUrl('');
    setNewLinkDesc('');
    setLinkFormOpen(false);
  }

  async function handleSendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await api(`/cards/${card.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: commentText.trim(),
          is_internal: !isClient && commentInternal,
        }),
      });
      setCommentText('');
      setCommentInternal(false);
      onUpdated();
    } finally {
      setSendingComment(false);
    }
  }

  async function handleDeleteCard() {
    await api(`/cards/${card.id}`, { method: 'DELETE' });
    onDeleted?.();
  }

  const visibleAttachments = showAllAttachments ? card.attachments : card.attachments.slice(0, 2);
  const extraAttCount = Math.max(0, card.attachments.length - 2);
  const historyList = card.history || [];
  const visibleHistory = showAllHistory ? historyList : historyList.slice(0, 4);

  const canClientEdit = !isClient || portalDefaults?.allow_client_uploads !== false;
  const canClientComment = !isClient || portalDefaults?.allow_client_comments !== false;

  return (
    <div
      className={
        isPage
          ? 'fixed inset-0 z-50 aumi-wallpaper overflow-y-auto'
          : 'fixed inset-0 z-50 bg-[#2F1534]/35 backdrop-blur-md flex items-center justify-center p-2 sm:p-5 overflow-y-auto'
      }
      onClick={isPage ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={
          isPage
            ? 'min-h-screen w-full flex flex-col'
            : 'w-full max-w-[1140px] bg-white rounded-[26px] shadow-[0_28px_80px_-16px_rgba(47,21,52,0.34)] border border-[#BC9FE6]/30 overflow-hidden flex flex-col max-h-[94vh]'
        }
      >
        {/* TOP NAVIGATION BAR */}
        <div
          className={
            isPage
              ? 'sticky top-0 z-30 bg-white/88 backdrop-blur-xl border-b border-[#BC9FE6]/25 px-4 sm:px-8 py-3.5 shadow-[0_6px_24px_-12px_rgba(47,21,52,0.12)]'
              : 'px-5 py-3.5 border-b border-black/[0.07] bg-white shrink-0'
          }
        >
          <div className={`${isPage ? 'max-w-[1320px] mx-auto' : ''} flex flex-wrap items-center justify-between gap-3`}>
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={isPage ? onBackLabel : 'Fechar janela'}
              className={
                isPage
                  ? 'px-3 py-1.5 rounded-xl bg-[#FAF7FC] hover:bg-[#F3ECF9] border border-[#BC9FE6]/35 inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F1534] transition-colors shrink-0'
                  : 'w-8 h-8 rounded-xl hover:bg-black/[0.05] flex items-center justify-center text-[#2F1534]/70 transition-colors shrink-0'
              }
            >
              {isPage ? (
                <>
                  <ArrowLeft className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>{onBackLabel}</span>
                </>
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>

            <div className="w-8 h-8 rounded-xl bg-[#FDF2F6] border border-[#EC97B7]/40 flex items-center justify-center text-[#EC2B82] shrink-0">
              <Edit3 className="w-4 h-4" />
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#2F1534] truncate max-w-[360px]">
                {title || card.title}
              </h2>

              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: primaryLabelObj?.color || '#F3ECF9',
                  color: primaryLabelObj?.text || '#7A689C',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: primaryLabelObj?.text || '#7A689C' }}
                />
                {primaryLabelObj?.name || currentCol?.title || 'Em andamento'}
              </span>

              {card.read_at && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#DAD994]/85 text-[#2F1534] border border-[#C8C978]">
                  <Check className="w-3 h-3" />
                  <span>Visto {card.read_by_name ? `por ${card.read_by_name}` : ''}</span>
                </span>
              )}
            </div>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {!isClient && (
              <>
                <button
                  type="button"
                  onClick={() => handleMarkRead(!Boolean(card.read_at))}
                  title={
                    card.read_at
                      ? `Visto por ${card.read_by_name || 'equipe'} — clique para desmarcar visualização`
                      : 'Marcar esta demanda como vista'
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border ${
                    card.read_at
                      ? 'bg-[#C8C978] hover:bg-[#BDBF6A] border-[#AEB05C] text-[#2F1534]'
                      : 'bg-[#DAD994]/90 hover:bg-[#C8C978] border-[#C8C978] text-[#2F1534]'
                  }`}
                >
                  {card.read_at ? <Check className="w-3.5 h-3.5" /> : <BookOpenCheck className="w-3.5 h-3.5" />}
                  <span>{card.read_at ? 'Visto · Desfazer' : 'Marcar como visto'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCompleteCard}
                  disabled={isCompleted}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs ${
                    isCompleted
                      ? 'bg-[#DAD994] text-[#2F1534] border border-[#C8C978] cursor-default'
                      : 'bg-[#EC2B82] hover:bg-[#d11f6f] text-white'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isCompleted ? 'Concluída' : 'Marcar como concluída'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAdjModalOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl border border-[#BC9FE6]/60 bg-white hover:bg-[#FAF6FD] text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>Solicitar ajuste</span>
                </button>

                <button
                  type="button"
                  onClick={toggleCardClientVisible}
                  title={clientVisible ? 'Cartão visível ao cliente (clique para ocultar)' : 'Cartão oculto do cliente (clique para exibir)'}
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-colors ${
                    clientVisible
                      ? 'border-black/10 text-[#2F1534]/70 hover:bg-black/[0.04]'
                      : 'border-[#EC2B82]/40 bg-[#FDF2F6] text-[#EC2B82]'
                  }`}
                >
                  {clientVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen((v) => !v);
                      setConfirmDelete(false);
                    }}
                    className="w-8 h-8 rounded-xl border border-black/10 hover:bg-black/[0.04] flex items-center justify-center text-[#2F1534]/70"
                    title="Mais opções"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 rounded-2xl bg-white border border-black/10 shadow-xl p-3 space-y-3 z-40">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-[#7A689C] flex items-center gap-1">
                          <Columns className="w-3 h-3" /> Etapa no Kanban
                        </label>
                        <select
                          value={columnId}
                          onChange={(e) => setColumnId(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-xl border border-black/12 text-xs bg-[#FAF7FC]"
                        >
                          {columns.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-[#7A689C]">Entrega</label>
                          <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-black/12 text-[11px]"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-[#7A689C]">Publicação</label>
                          <input
                            type="date"
                            value={publishDate}
                            onChange={(e) => setPublishDate(e.target.value)}
                            className="w-full px-2 py-1 rounded-lg border border-black/12 text-[11px]"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleMarkRead(!Boolean(card.read_at))}
                        className="w-full px-3 py-1.5 rounded-xl bg-[#DAD994]/80 hover:bg-[#C8C978] text-[#2F1534] text-xs font-semibold flex items-center gap-1.5"
                      >
                        <BookOpenCheck className="w-3.5 h-3.5" />
                        <span>{card.read_at ? 'Desmarcar visualização' : 'Marcar como visto'}</span>
                      </button>

                      <div className="pt-2 border-t border-black/[0.06]">
                        {!confirmDelete ? (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="w-full px-3 py-1.5 rounded-xl text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Excluir demanda</span>
                          </button>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-red-600 font-semibold">Confirmar?</span>
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={handleDeleteCard}
                                className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold"
                              >
                                Excluir
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDelete(false)}
                                className="px-2 py-1 rounded-lg bg-black/5 text-[11px]"
                              >
                                Não
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          </div>
        </div>

        {/* FEEDBACK BANNERS */}
        {(actionError || actionMsg) && (
          <div
            className={`px-5 py-2 text-xs font-medium flex items-center justify-between ${
              actionError ? 'bg-[#FDF2F6] text-[#A9195A]' : 'bg-[#ECFDF5] text-[#15803D]'
            }`}
          >
            <span className="flex items-center gap-2">
              {actionError ? <AlertCircle className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              {actionError || actionMsg}
            </span>
            <button
              type="button"
              onClick={() => {
                setActionError('');
                setActionMsg('');
              }}
              className="opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* MAIN 2-COLUMN BODY */}
        <div className={isPage ? 'flex-1 w-full max-w-[1320px] mx-auto p-4 sm:p-8' : 'flex-1 overflow-y-auto bg-[#FAF7FC]/55 p-4 sm:p-6'}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN (65% -> 8 cols) */}
            <div className="lg:col-span-8 space-y-4">
              {/* Adjustment Notice Banner (if designer requested adjustment) */}
              {card.adjustment_request && (
                <div className="rounded-2xl bg-[#FDF2F6] border border-[#EC97B7]/60 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#EC2B82]">
                      <AlertCircle className="w-4 h-4" />
                      Ajuste solicitado: {card.adjustment_request.type}
                    </span>
                    <span className="text-[11px] text-[#2F1534]/60">
                      Por {card.adjustment_request.requested_by_name} · {formatRelativeTime(card.adjustment_request.requested_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[#2F1534] leading-relaxed">{card.adjustment_request.message}</p>
                  {card.adjustment_request.attachments && card.adjustment_request.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {card.adjustment_request.attachments.map((att, idx) => (
                        <a
                          key={idx}
                          href={att.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-[#EC97B7]/40 text-[11px] font-medium text-[#2F1534] hover:border-[#EC2B82]"
                        >
                          <FileText className="w-3 h-3 text-[#EC2B82]" />
                          <span>{att.original_name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Primary Card Form Panel */}
              <div className="rounded-2xl bg-white border border-black/[0.07] p-5 space-y-5 shadow-xs">
                {/* Título da demanda */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FDF2F6] border border-[#EC97B7]/40 flex items-center justify-center text-[#EC2B82] shrink-0 mt-5">
                    <Edit3 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#2F1534]">
                        Título da demanda <span className="text-[#EC2B82]">*</span>
                      </label>
                      {!isClient && (
                        <span className="text-[11px] font-medium text-[#15803D] inline-flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Visível ao cliente
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={isClient && !canClientEdit}
                      placeholder="Ex: Carrossel institucional"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.11] text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                </div>

                {/* Descrição / Conteúdo */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-[#2F1534]">
                      {isClient ? 'Conteúdo / Briefing da demanda' : 'Descrição / Conteúdo'}{' '}
                      <span className="text-[#EC2B82]">*</span>
                    </label>
                    {!isClient && (
                      <span className="text-[11px] font-medium text-[#7A689C]">
                        {card.service_name ? `Serviço: ${card.service_name}` : 'Formulário padrão'}
                      </span>
                    )}
                  </div>

                  {isClient && description && (
                    <div className="px-3.5 py-2.5 rounded-xl bg-[#F8F5FB] border border-[#BC9FE6]/30 text-xs text-[#2F1534]/80 aumi-copy-prose">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A689C] mb-1">
                        Orientação do estúdio
                      </p>
                      <div dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(description) }} />
                    </div>
                  )}

                  <RichTextBox
                    value={isClient ? submittedText : description}
                    onChange={isClient ? setSubmittedText : setDescription}
                    readOnly={isClient && !canClientEdit}
                    placeholder={
                      isClient
                        ? 'Escreva o texto, ideias, copy ou instruções deste material...'
                        : 'Descreva os detalhes da demanda ou orientações de criação...'
                    }
                    minHeightClass="min-h-[120px]"
                  />

                  {/* Partner sees client's submitted rich text content + quick "Marcar como lido" */}
                  {!isClient && (submittedText || card.content_status === 'submitted') && (
                    <div className="rounded-xl bg-[#F8F5FB] border border-[#BC9FE6]/40 p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#7A689C] inline-flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          Conteúdo enviado pelo cliente
                          {card.submitted_content?.submitted_at && (
                            <span className="font-normal text-[#2F1534]/55">
                              · {formatRelativeTime(card.submitted_content.submitted_at)}
                            </span>
                          )}
                        </span>
                        {!card.read_at ? (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(true)}
                            className="px-2.5 py-1 rounded-lg bg-[#DAD994] hover:bg-[#C8C978] border border-[#C8C978] text-[#2F1534] text-[11px] font-semibold inline-flex items-center gap-1"
                          >
                            <BookOpenCheck className="w-3 h-3" />
                            <span>Marcar como visto</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(false)}
                            title="Clique para desmarcar visualização"
                            className="text-[11px] font-semibold text-[#3D4011] hover:underline inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Visto por {card.read_by_name}
                          </button>
                        )}
                      </div>
                      <RichTextBox
                        value={submittedText}
                        onChange={setSubmittedText}
                        placeholder="O cliente ainda não escreveu conteúdo aqui..."
                        minHeightClass="min-h-[76px]"
                      />
                    </div>
                  )}
                </div>

                {/* Observações (opcional) — controllable via Eye */}
                {(!isClient || !hiddenSections.observations) && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-[#7A689C]" />
                        <span>Observações (opcional)</span>
                      </label>
                      {renderSectionEye('observations')}
                    </div>
                    <input
                      type="text"
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                      disabled={isClient && !canClientEdit}
                      placeholder="Adicione informações extras, se necessário..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/[0.11] text-xs text-[#232122] bg-[#FAF7FC]/50 focus:bg-white focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                )}

                {/* Referências e anexos — controllable via Eye */}
                {(!isClient || !hiddenSections.attachments) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                        <UploadCloud className="w-3.5 h-3.5 text-[#EC2B82]" />
                        <span>Referências e anexos</span>
                      </label>
                      {renderSectionEye('attachments')}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
                      {canClientEdit && (
                        <label
                          className={`sm:col-span-6 rounded-xl border border-dashed border-[#BC9FE6] bg-[#FAF7FC] hover:bg-[#F3ECF9]/60 p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                            card.attachments.length === 0 ? 'sm:col-span-12' : ''
                          }`}
                        >
                          <UploadCloud className="w-5 h-5 text-[#7A689C] mb-1" />
                          <span className="text-xs font-bold text-[#2F1534]">
                            {uploading ? 'Enviando arquivos...' : 'Adicionar arquivos'}
                          </span>
                          <span className="text-[11px] text-[#232122]/55">
                            Imagens, PDF, referências ou outros arquivos
                          </span>
                          <input
                            type="file"
                            multiple
                            onChange={handleUploadAttachment}
                            disabled={uploading}
                            className="hidden"
                          />
                        </label>
                      )}

                      {card.attachments.length > 0 && (
                        <div className={`${canClientEdit ? 'sm:col-span-6' : 'sm:col-span-12'} flex items-center gap-2 flex-wrap`}>
                          {visibleAttachments.map((att) => {
                            const isImg = att.mime_type.startsWith('image/');
                            return (
                              <div
                                key={att.id}
                                className="group relative w-20 h-20 rounded-xl border border-black/10 bg-white overflow-hidden flex items-center justify-center shrink-0"
                                title={att.original_name}
                              >
                                {isImg ? (
                                  <img
                                    src={att.file_url}
                                    alt={att.original_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="p-2 text-center">
                                    <FileText className="w-5 h-5 text-[#7A689C] mx-auto" />
                                    <span className="text-[9px] text-[#232122]/70 block truncate w-14 mt-1">
                                      {att.original_name}
                                    </span>
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-[#2F1534]/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                                  <a
                                    href={att.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-6 h-6 rounded-lg bg-white text-[#2F1534] flex items-center justify-center"
                                    title="Baixar / Abrir"
                                  >
                                    <Download className="w-3 h-3" />
                                  </a>
                                  {!isClient && (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAttachment(att.id)}
                                      className="w-6 h-6 rounded-lg bg-white text-red-600 flex items-center justify-center"
                                      title="Remover"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {extraAttCount > 0 && !showAllAttachments && (
                            <button
                              type="button"
                              onClick={() => setShowAllAttachments(true)}
                              className="w-20 h-20 rounded-xl bg-[#F3ECF9] hover:bg-[#E7DDF3] text-[#7A689C] text-sm font-bold flex items-center justify-center"
                            >
                              +{extraAttCount}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Links e referências — controllable via Eye */}
                {(!isClient || !hiddenSections.references) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-[#7A689C]" />
                        <span>Links e referências</span>
                      </label>
                      {renderSectionEye('references')}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {links.map((lnk) => (
                        <div
                          key={lnk.id}
                          className="group p-2.5 rounded-xl border border-black/[0.08] bg-[#FAF7FC]/70 flex items-center justify-between gap-2"
                        >
                          <a
                            href={lnk.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 min-w-0 flex-1"
                          >
                            <div className="w-7 h-7 rounded-lg bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center shrink-0">
                              <Link2 className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-[#2F1534] truncate">{lnk.url}</p>
                              <p className="text-[10px] text-[#232122]/55 truncate">{lnk.description}</p>
                            </div>
                          </a>
                          {canClientEdit && (
                            <button
                              type="button"
                              onClick={() => setLinks((prev) => prev.filter((x) => x.id !== lnk.id))}
                              className="opacity-0 group-hover:opacity-100 text-[#232122]/40 hover:text-red-600 p-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}

                      {canClientEdit && (
                        <button
                          type="button"
                          onClick={() => setLinkFormOpen((v) => !v)}
                          className="p-2.5 rounded-xl border border-dashed border-[#BC9FE6] bg-[#F8F5FB] hover:bg-[#F3ECF9] text-xs font-semibold text-[#7A689C] flex items-center justify-center gap-1.5 min-h-[50px]"
                        >
                          <span>Adicionar link</span>
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {linkFormOpen && (
                      <form
                        onSubmit={handleAddLink}
                        className="p-3 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/40 grid grid-cols-1 sm:grid-cols-12 gap-2"
                      >
                        <input
                          type="text"
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          placeholder="https://br.pinterest.com/..."
                          className="sm:col-span-5 px-3 py-1.5 rounded-lg border border-black/12 bg-white text-xs"
                        />
                        <input
                          type="text"
                          value={newLinkDesc}
                          onChange={(e) => setNewLinkDesc(e.target.value)}
                          placeholder="Descrição curta (ex: Referência visual)"
                          className="sm:col-span-5 px-3 py-1.5 rounded-lg border border-black/12 bg-white text-xs"
                        />
                        <button
                          type="submit"
                          className="sm:col-span-2 px-3 py-1.5 rounded-lg bg-[#EC2B82] text-white text-xs font-semibold"
                        >
                          Incluir
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Informações adicionais (Briefing fields from Service) — controllable via Eye */}
                {card.client_fields && card.client_fields.length > 0 && (!isClient || !hiddenSections.extra_info) && (
                  <div className="space-y-2.5 pt-2 border-t border-black/[0.06]">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold text-[#2F1534]">Informações adicionais do serviço</label>
                      {renderSectionEye('extra_info')}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {card.client_fields.map((fld) => (
                        <div key={fld.key} className="space-y-1">
                          <label className="text-[11px] font-medium text-[#232122]/75">{fld.label}</label>
                          {fld.type === 'textarea' ? (
                            <textarea
                              rows={2}
                              value={clientAnswers[fld.key] || ''}
                              disabled={isClient && !canClientEdit}
                              onChange={(e) => setClientAnswers((p) => ({ ...p, [fld.key]: e.target.value }))}
                              className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC]/50"
                            />
                          ) : (
                            <input
                              type="text"
                              value={clientAnswers[fld.key] || ''}
                              disabled={isClient && !canClientEdit}
                              onChange={(e) => setClientAnswers((p) => ({ ...p, [fld.key]: e.target.value }))}
                              className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC]/50"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Internal Partner-only Note (never sent to client) */}
                {!isClient && (
                  <div className="space-y-1 pt-2 border-t border-black/[0.06]">
                    <label className="text-[11px] font-semibold text-[#7A689C] inline-flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Nota interna da equipe (nunca visível ao cliente)
                    </label>
                    <input
                      type="text"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      placeholder="Anotação privada entre Ingrid e Mariana..."
                      className="w-full px-3 py-1.5 rounded-xl border border-[#BC9FE6]/35 bg-[#F8F5FB] text-xs"
                    />
                  </div>
                )}
              </div>

              {/* BOTTOM 3-BOX STRIP — Reference Image 1 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* 1. Anotações complementares */}
                {(!isClient || !hiddenSections.notes) && (
                  <div className="rounded-2xl bg-white border border-black/[0.07] p-4 flex flex-col justify-between space-y-2 shadow-xs">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-[#7A689C]" />
                          Anotações complementares
                        </span>
                        {!isClient && (
                          <button
                            type="button"
                            onClick={() => toggleSectionVisibility('notes')}
                            title={hiddenSections.notes ? 'Oculto do cliente' : 'Visível ao cliente'}
                            className="text-[#7A689C] hover:text-[#EC2B82]"
                          >
                            {hiddenSections.notes ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={4}
                        value={extraNotes}
                        onChange={(e) => setExtraNotes(e.target.value)}
                        disabled={isClient && !canClientEdit}
                        placeholder="Notas rápidas, tom de voz ou detalhes extras..."
                        className="w-full text-xs text-[#232122]/85 bg-transparent resize-none focus:outline-none"
                      />
                    </div>
                    <p className="text-[10px] text-[#232122]/45 pt-1 border-t border-black/[0.05]">
                      Atualizado {formatRelativeTime(card.updated_at)}
                    </p>
                  </div>
                )}

                {/* 2. Comentários e conversa */}
                {(!isClient || !hiddenSections.comments) && (
                  <div className="rounded-2xl bg-white border border-black/[0.07] p-4 flex flex-col justify-between space-y-2.5 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-[#7A689C]" />
                        Comentários e conversa
                        <span className="px-1.5 py-0.5 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[10px] font-bold">
                          {card.comments.length}
                        </span>
                      </span>
                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => toggleSectionVisibility('comments')}
                          title={hiddenSections.comments ? 'Oculto do cliente' : 'Visível ao cliente'}
                          className="text-[#7A689C] hover:text-[#EC2B82]"
                        >
                          {hiddenSections.comments ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>

                    <div className={isPage ? 'space-y-2 pr-1' : 'space-y-2 max-h-32 overflow-y-auto pr-1'}>
                      {card.comments.length === 0 ? (
                        <p className="text-[11px] text-[#232122]/45">Nenhuma mensagem ainda.</p>
                      ) : (
                        card.comments.map((cm) => (
                          <div key={cm.id} className="text-[11px] space-y-0.5">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-[#2F1534]">
                                {cm.author_name}
                                {cm.is_internal ? (
                                  <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-[#F3ECF9] text-[#7A689C]">
                                    Interno
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[10px] text-[#232122]/45">{formatRelativeTime(cm.created_at)}</span>
                            </div>
                            <p className="text-[#232122]/80 leading-snug">{cm.content}</p>
                          </div>
                        ))
                      )}
                    </div>

                    {canClientComment && (
                      <form onSubmit={handleSendComment} className="space-y-1.5 pt-1 border-t border-black/[0.05]">
                        {!isClient && (
                          <label className="flex items-center gap-1.5 text-[10px] text-[#7A689C]">
                            <input
                              type="checkbox"
                              checked={commentInternal}
                              onChange={(e) => setCommentInternal(e.target.checked)}
                              className="rounded accent-[#EC2B82]"
                            />
                            <span>Só equipe (interno)</span>
                          </label>
                        )}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Escreva um comentário..."
                            className="flex-1 px-2.5 py-1.5 rounded-xl bg-[#FAF7FC] border border-black/[0.08] text-xs focus:outline-none focus:border-[#EC2B82]"
                          />
                          <button
                            type="submit"
                            disabled={sendingComment || !commentText.trim()}
                            className="w-7 h-7 rounded-xl bg-[#F3ECF9] hover:bg-[#EC2B82] text-[#7A689C] hover:text-white flex items-center justify-center transition-colors disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                {/* 3. Histórico de atividades */}
                <div className="rounded-2xl bg-white border border-black/[0.07] p-4 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#2F1534]">Histórico de atividades</span>
                    {historyList.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllHistory((v) => !v)}
                        className="text-[11px] font-semibold text-[#7A689C] hover:text-[#EC2B82] inline-flex items-center gap-0.5"
                      >
                        <span>{showAllHistory ? 'Menos' : 'Ver todos'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className={isPage ? 'space-y-2.5 pr-1' : 'space-y-2.5 max-h-48 overflow-y-auto pr-1'}>
                    {visibleHistory.length === 0 ? (
                      <p className="text-[11px] text-[#232122]/45">Cartão criado em {formatShortDateBR(card.created_at)}</p>
                    ) : (
                      visibleHistory.map((h) => {
                        const isMiniUpdate = h.action === 'mini_update';
                        const dt = h.created_at ? new Date(h.created_at) : null;
                        const exactStamp =
                          dt && !Number.isNaN(dt.getTime())
                            ? `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} às ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
                            : formatRelativeTime(h.created_at);
                        return (
                          <div key={h.id} className="flex items-start gap-2">
                            <span
                              className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                                isMiniUpdate ? 'bg-[#EC2B82]' : 'bg-[#7A689C]'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {isMiniUpdate && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#FDF2F6] text-[#EC2B82] border border-[#EC97B7]/45 text-[9.5px] font-bold">
                                    Atualização
                                  </span>
                                )}
                                <p className="text-[11px] font-semibold text-[#2F1534] leading-tight">
                                  {h.details}
                                </p>
                              </div>
                              <p className="text-[10px] text-[#232122]/50 tabular-nums mt-0.5">
                                {h.actor_name ? `${h.actor_name} · ` : ''}
                                {exactStamp}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR (35% -> 4 cols) — Reference Image 1 */}
            <div className="lg:col-span-4 rounded-2xl bg-white border border-black/[0.07] p-5 space-y-5 shadow-xs">
              {/* Responsável pela criação */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                    Responsável pela criação
                    <Info className="w-3.5 h-3.5 text-[#7A689C]/60" />
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FAF7FC] border border-black/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {assignedPartner && (
                      <PartnerAvatar
                        name={assignedPartner.name}
                        partnerKey={assignedPartner.partner_key}
                        avatarUrl={assignedPartner.avatar_url}
                        size="sm"
                      />
                    )}
                    {!isClient ? (
                      <select
                        value={leadUserId}
                        onChange={(e) => setLeadUserId(e.target.value)}
                        className="bg-transparent text-xs font-bold text-[#2F1534] focus:outline-none"
                      >
                        {partners.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs font-bold text-[#2F1534]">{assignedPartner?.name || 'Equipe Aumi'}</span>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-[#232122]/55">
                  {isClient
                    ? `Você está enviando este material para ${assignedPartner?.name || 'a equipe'}.`
                    : `Responsável direto por esta entrega: ${assignedPartner?.name || 'Estúdio'}.`}
                </p>
              </div>

              {/* Prioridade do conteúdo */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1">
                  Prioridade do conteúdo <span className="text-[#EC2B82]">*</span>
                </span>
                <div className="space-y-2">
                  {PRIORITY_CARDS.map((pr) => {
                    const active = priority === pr.key;
                    return (
                      <button
                        key={pr.key}
                        type="button"
                        disabled={isClient && !canClientEdit}
                        onClick={() => setPriority(pr.key)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                          active
                            ? 'bg-[#FDF2F6]/65 border-[#EC2B82] shadow-xs'
                            : 'bg-white border-black/[0.09] hover:border-black/20'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            active ? 'border-[#EC2B82]' : 'border-black/15'
                          }`}
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: pr.dot }} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#2F1534] leading-tight">{pr.label}</p>
                          <p className="text-[11px] text-[#232122]/55 leading-tight">{pr.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Etiquetas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                    Etiquetas
                    <Info className="w-3.5 h-3.5 text-[#7A689C]/60" />
                  </span>
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => setLabelsManagerOpen(true)}
                      className="text-[11px] font-semibold text-[#EC2B82] hover:underline"
                    >
                      Gerenciar
                    </button>
                  )}
                </div>

                {!isClient && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setLabelsDropdownOpen((v) => !v)}
                      className="w-full px-3 py-2 rounded-xl border border-black/[0.11] bg-white flex items-center justify-between text-xs text-[#2F1534]/80"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-[#7A689C]" />
                        <span>Selecionar etiquetas</span>
                      </span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    </button>

                    {labelsDropdownOpen && (
                      <div className="absolute left-0 right-0 mt-1 p-2 rounded-2xl bg-white border border-black/12 shadow-xl z-30 space-y-1 max-h-48 overflow-y-auto">
                        {availableLabels.map((lbl) => {
                          const selected = labels.includes(lbl.name);
                          return (
                            <button
                              key={lbl.id}
                              type="button"
                              onClick={() =>
                                setLabels((prev) =>
                                  selected ? prev.filter((x) => x !== lbl.name) : [...prev, lbl.name]
                                )
                              }
                              className="w-full px-2.5 py-1.5 rounded-xl hover:bg-[#FAF7FC] flex items-center justify-between text-xs"
                            >
                              <span
                                className="px-2 py-0.5 rounded-lg font-semibold"
                                style={{ backgroundColor: lbl.color, color: lbl.text }}
                              >
                                {lbl.name}
                              </span>
                              {selected && <Check className="w-3.5 h-3.5 text-[#EC2B82]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {labels.map((name) => {
                      const found = availableLabels.find((l) => l.name === name);
                      return (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                          style={{
                            backgroundColor: found?.color || '#F3ECF9',
                            color: found?.text || '#7A689C',
                          }}
                        >
                          <span>{name}</span>
                          {!isClient && (
                            <button
                              type="button"
                              onClick={() => setLabels((p) => p.filter((x) => x !== name))}
                              className="opacity-70 hover:opacity-100"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Checklist — controllable via Eye */}
              {(!isClient || !hiddenSections.checklist) && (
                <div className="space-y-2.5 pt-2 border-t border-black/[0.06]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                      Checklist
                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => toggleSectionVisibility('checklist')}
                          title={hiddenSections.checklist ? 'Oculto do cliente' : 'Visível ao cliente'}
                          className="text-[#7A689C] hover:text-[#EC2B82]"
                        >
                          {hiddenSections.checklist ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </span>
                    <span className="text-[11px] text-[#232122]/55 tabular-nums">
                      {doneChecklistCount} de {checklist.length} concluídos
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 rounded-full bg-[#F3ECF9] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#7A689C] to-[#EC2B82] transition-all"
                      style={{ width: `${checklistPct}%` }}
                    />
                  </div>

                  <div className={isPage ? 'space-y-1.5' : 'space-y-1.5 max-h-40 overflow-y-auto'}>
                    {checklist.map((item) => (
                      <div key={item.id} className="group flex items-center justify-between gap-2 py-0.5">
                        <button
                          type="button"
                          disabled={isClient && !canClientEdit}
                          onClick={() =>
                            setChecklist((prev) =>
                              prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c))
                            )
                          }
                          className="flex items-center gap-2 text-left text-xs min-w-0 flex-1"
                        >
                          {item.done ? (
                            <CheckSquare className="w-4 h-4 text-[#7A689C] shrink-0" />
                          ) : (
                            <Square className="w-4 h-4 text-black/25 shrink-0" />
                          )}
                          <span className={item.done ? 'line-through text-[#232122]/45' : 'text-[#232122]'}>
                            {item.text}
                          </span>
                        </button>
                        {!isClient && (
                          <button
                            type="button"
                            onClick={() => setChecklist((prev) => prev.filter((c) => c.id !== item.id))}
                            className="opacity-0 group-hover:opacity-100 text-[#232122]/35 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {canClientEdit && (
                    addingCheck ? (
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newCheckItem}
                          onChange={(e) => setNewCheckItem(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newCheckItem.trim()) {
                                setChecklist((p) => [
                                  ...p,
                                  { id: `chk-${Date.now()}`, text: newCheckItem.trim(), done: false },
                                ]);
                                setNewCheckItem('');
                                setAddingCheck(false);
                              }
                            }
                          }}
                          placeholder="Novo item..."
                          className="flex-1 px-2.5 py-1.5 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCheckItem.trim()) {
                              setChecklist((p) => [
                                ...p,
                                { id: `chk-${Date.now()}`, text: newCheckItem.trim(), done: false },
                              ]);
                              setNewCheckItem('');
                            }
                            setAddingCheck(false);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-[#2F1534] text-white text-xs font-semibold"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingCheck(true)}
                        className="w-full py-2 rounded-xl border border-black/[0.09] hover:bg-[#FAF7FC] text-xs font-semibold text-[#2F1534] flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar item</span>
                      </button>
                    )
                  )}
                </div>
              )}

              {/* Due date summary for client */}
              {dueDate && (
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-[#FAF7FC] border border-black/[0.06]">
                  <span className="text-[#232122]/65 inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#7A689C]" /> Prazo previsto
                  </span>
                  <span className="font-bold text-[#2F1534] tabular-nums">{formatShortDateBR(dueDate)}</span>
                </div>
              )}

              {/* Primary Solid Pink CTA */}
              {canClientEdit && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={isClient ? handleSubmitClient : handleSavePartner}
                  className="w-full py-3 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {saving
                      ? 'Salvando...'
                      : isClient
                      ? card.content_status === 'submitted'
                        ? 'Atualizar conteúdo'
                        : 'Enviar conteúdo'
                      : 'Salvar alterações'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SUB-MODAL: SOLICITAR AJUSTE */}
      {adjModalOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[#2F1534]/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setAdjModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSendAdjustment}
            className="w-full max-w-lg rounded-3xl bg-white border border-[#BC9FE6]/40 shadow-2xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between bg-[#FAF7FC]">
              <div>
                <h3 className="text-sm font-bold text-[#2F1534]">Solicitar ajuste ao cliente</h3>
                <p className="text-[11px] text-[#232122]/60">
                  A solicitação fica registrada neste mesmo cartão e notifica o cliente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="w-8 h-8 rounded-xl hover:bg-black/5 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2F1534]">Tipo de ajuste</label>
                <div className="grid grid-cols-2 gap-2">
                  {ADJUSTMENT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAdjType(t)}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-semibold transition-colors ${
                        adjType === t
                          ? 'bg-[#FDF2F6] border-[#EC2B82] text-[#EC2B82]'
                          : 'bg-white border-black/10 text-[#232122]/75 hover:bg-[#FAF7FC]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2F1534]">Etiqueta aplicada ao cartão</label>
                <select
                  value={adjLabelName}
                  onChange={(e) => setAdjLabelName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                >
                  {availableLabels.map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name}
                    </option>
                  ))}
                  {!availableLabels.some((l) => l.name === 'Fazer alterações') && (
                    <option value="Fazer alterações">Fazer alterações</option>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2F1534]">Explicação / Orientação *</label>
                <textarea
                  rows={3}
                  value={adjMessage}
                  onChange={(e) => setAdjMessage(e.target.value)}
                  placeholder="Explique o que precisa ser ajustado, complementado ou reenviado..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#2F1534]">Anexar referência (opcional)</label>
                <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-[#BC9FE6] bg-[#FAF7FC] text-xs font-medium text-[#7A689C] cursor-pointer hover:bg-[#F3ECF9]">
                  <UploadCloud className="w-4 h-4" />
                  <span>Anexar imagem ou arquivo de apoio</span>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      for (const f of files) {
                        const up = await uploadFile(f);
                        setAdjFiles((prev) => [...prev, up]);
                      }
                    }}
                  />
                </label>
                {adjFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {adjFiles.map((f, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-lg bg-[#F3ECF9] text-[11px] font-medium text-[#2F1534] inline-flex items-center gap-1"
                      >
                        {f.original_name}
                        <button
                          type="button"
                          onClick={() => setAdjFiles((p) => p.filter((_, idx) => idx !== i))}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-black/[0.06] bg-[#FAF7FC] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdjModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-black/10 bg-white text-xs font-semibold text-[#232122]/75"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={adjSending}
                className="px-5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold disabled:opacity-60"
              >
                {adjSending ? 'Enviando...' : 'Enviar ajuste'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* LABELS MANAGER MODAL */}
      <LabelsManagerModal
        open={labelsManagerOpen}
        labels={availableLabels}
        onClose={() => setLabelsManagerOpen(false)}
        onSaved={(updated) => {
          onLabelsUpdated?.(updated);
          onUpdated();
        }}
      />
    </div>
  );
}
