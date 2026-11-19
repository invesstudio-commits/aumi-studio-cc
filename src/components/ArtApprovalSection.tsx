import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Eye,
  UploadCloud,
  MessageCircle,
  Download,
  ExternalLink,
  X,
  Send,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  Palette,
  FileText,
  Link2,
  File,
  FolderOpen,
  Plus,
  Trash2,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  History,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api, copyTextSafe, formatDateBR, formatShortDateBR, sanitizeFileDisplayName, uploadFile } from '../lib/api.ts';
import {
  ApprovalDelivery,
  ApprovalDeliveryStatus,
  ApprovalItemStatus,
  ApprovalMaterialItem,
  ApprovalMaterialType,
  BoardColumn,
  Card,
} from '../types/aumi.ts';

interface ArtApprovalSectionProps {
  boardId: string;
  cards: Card[];
  columns: BoardColumn[];
  deliveries: ApprovalDelivery[];
  mode: 'partner' | 'client';
  allowClientApprovals?: boolean;
  compact?: boolean;
  initialOpenDeliveryId?: string | null;
  onClearInitialDelivery?: () => void;
  onOpenDelivery?: (deliveryId: string) => void;
  onOpenCard: (card: Card) => void;
  onViewAll?: () => void;
  onUpdated: () => Promise<void> | void;
}

interface DraftMaterial {
  tempId: string;
  type: ApprovalMaterialType;
  title: string;
  url?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  content?: string;
  notes?: string;
}

function getColumnStageBadge(colTitle: string): { label: string; bg: string; text: string } {
  const lower = (colTitle || '').toLowerCase();
  if (lower.includes('conclu')) return { label: 'Concluído', bg: '#DCFCE7', text: '#15803D' };
  if (lower.includes('altera') || lower.includes('ajuste')) return { label: 'Alteração', bg: '#FDF0E8', text: '#B84C24' };
  if (lower.includes('aprova')) return { label: 'Aprovação', bg: '#F3ECF9', text: '#6D28D9' };
  if (lower.includes('produ')) return { label: 'Em produção', bg: '#FDF2F6', text: '#EC2B82' };
  if (lower.includes('comece')) return { label: 'Comece aqui', bg: '#F3ECF9', text: '#7A689C' };
  return { label: colTitle || 'Demanda', bg: '#FAF7FC', text: '#7A689C' };
}

function detectFileMaterialType(file: File): ApprovalMaterialType {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)$/.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/\.(docx?|odt|rtf|pptx?|xlsx?|csv|txt)$/.test(name)) return 'document';
  return 'file';
}

function getMaterialTypeLabel(type: ApprovalMaterialType): string {
  switch (type) {
    case 'image':
      return 'Imagem';
    case 'pdf':
      return 'PDF';
    case 'link':
      return 'Link';
    case 'text':
      return 'Texto';
    case 'document':
      return 'Documento';
    default:
      return 'Arquivo';
  }
}

function getMaterialTypeIcon(type: ApprovalMaterialType) {
  switch (type) {
    case 'image':
      return ImageIcon;
    case 'pdf':
      return FileText;
    case 'link':
      return Link2;
    case 'text':
      return FileText;
    case 'document':
      return FolderOpen;
    default:
      return File;
  }
}

function formatDateTimeBR(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return formatShortDateBR(iso);
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function isArtApprovalCard(card: Card): boolean {
  return (
    card.approval_status === 'pending' ||
    card.approval_status === 'approved' ||
    card.approval_status === 'changes_requested'
  );
}

export function ArtApprovalSection({
  boardId,
  cards,
  columns,
  deliveries,
  mode,
  allowClientApprovals = true,
  compact = false,
  initialOpenDeliveryId,
  onClearInitialDelivery,
  onOpenDelivery,
  onOpenCard,
  onViewAll,
  onUpdated,
}: ArtApprovalSectionProps) {
  const isClient = mode === 'client';

  const [filter, setFilter] = useState<'all' | 'pending' | 'changes_requested' | 'approved'>('all');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  // Image Gallery Lightbox (supports zoom + prev/next navigation across all images of the delivery)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [galleryZoomed, setGalleryZoomed] = useState(false);

  // PDF / Text full preview modal
  const [previewItem, setPreviewItem] = useState<ApprovalMaterialItem | null>(null);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  // Per-item decision, comments, version history & team new-version states
  const [adjustingItemId, setAdjustingItemId] = useState<string | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [submittingItemId, setSubmittingItemId] = useState<string | null>(null);

  const [openCommentsItemId, setOpenCommentsItemId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [sendingCommentId, setSendingCommentId] = useState<string | null>(null);

  const [openVersionsItemId, setOpenVersionsItemId] = useState<string | null>(null);

  // Team: re-upload / publish new version for an item
  const [versioningItem, setVersioningItem] = useState<ApprovalMaterialItem | null>(null);
  const [versionUrl, setVersionUrl] = useState('');
  const [versionFileName, setVersionFileName] = useState('');
  const [versionMime, setVersionMime] = useState('');
  const [versionContent, setVersionContent] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [versionUploading, setVersionUploading] = useState(false);
  const [versionSaving, setVersionSaving] = useState(false);

  // Team: 4-Step "Nova Aprovação" Wizard Modal
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [wizardCardId, setWizardCardId] = useState<string>('');
  const [wizardDemandSearch, setWizardDemandSearch] = useState('');
  const [wizardMaterials, setWizardMaterials] = useState<DraftMaterial[]>([]);
  const [wizardTitle, setWizardTitle] = useState('');
  const [wizardDescription, setWizardDescription] = useState('');
  const [wizardUploading, setWizardUploading] = useState(false);
  const [wizardSubmitting, setWizardSubmitting] = useState(false);

  // Inline add-material forms inside Step 2 (and also reusable when adding materials to existing delivery)
  const [addMaterialTab, setAddMaterialTab] = useState<'files' | 'link' | 'text'>('files');
  const [draftLinkTitle, setDraftLinkTitle] = useState('');
  const [draftLinkUrl, setDraftLinkUrl] = useState('');
  const [draftLinkNotes, setDraftLinkNotes] = useState('');
  const [draftTextTitle, setDraftTextTitle] = useState('');
  const [draftTextContent, setDraftTextContent] = useState('');
  const [draftTextNotes, setDraftTextNotes] = useState('');

  // Team: add more materials to an already opened delivery
  const [addingToDelivery, setAddingToDelivery] = useState(false);
  const [extraMaterials, setExtraMaterials] = useState<DraftMaterial[]>([]);
  const [savingExtra, setSavingExtra] = useState(false);

  // Deep-link open delivery from notifications
  useEffect(() => {
    if (initialOpenDeliveryId) {
      const exists = deliveries.some((d) => d.id === initialOpenDeliveryId);
      if (exists) {
        setSelectedDeliveryId(initialOpenDeliveryId);
        onClearInitialDelivery?.();
      }
    }
  }, [initialOpenDeliveryId, deliveries, onClearInitialDelivery]);

  const activeDelivery = useMemo(
    () => (selectedDeliveryId ? deliveries.find((d) => d.id === selectedDeliveryId) || null : null),
    [deliveries, selectedDeliveryId]
  );

  const galleryImages = useMemo(
    () => (activeDelivery ? activeDelivery.items.filter((i) => i.type === 'image' && i.url) : []),
    [activeDelivery]
  );

  // Keyboard navigation in lightbox
  useEffect(() => {
    if (galleryIndex === null || galleryImages.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setGalleryIndex(null);
        setGalleryZoomed(false);
      } else if (e.key === 'ArrowRight') {
        setGalleryZoomed(false);
        setGalleryIndex((prev) => (prev === null ? null : (prev + 1) % galleryImages.length));
      } else if (e.key === 'ArrowLeft') {
        setGalleryZoomed(false);
        setGalleryIndex((prev) =>
          prev === null ? null : (prev - 1 + galleryImages.length) % galleryImages.length
        );
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [galleryIndex, galleryImages.length]);

  const pendingCount = deliveries.filter(
    (d) => d.status === 'pending' || d.status === 'partially_approved'
  ).length;
  const changesCount = deliveries.filter((d) => d.status === 'changes_requested').length;
  const approvedCount = deliveries.filter((d) => d.status === 'approved').length;

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      if (filter === 'all') return true;
      if (filter === 'pending') return d.status === 'pending' || d.status === 'partially_approved';
      return d.status === filter;
    });
  }, [deliveries, filter]);

  const visibleDeliveries = compact ? filteredDeliveries.slice(0, 4) : filteredDeliveries;

  const columnTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((c) => map.set(c.id, c.title));
    return map;
  }, [columns]);

  const filteredWizardCards = useMemo(() => {
    const q = wizardDemandSearch.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.service_name || '').toLowerCase().includes(q) ||
        (columnTitleMap.get(c.column_id) || '').toLowerCase().includes(q)
    );
  }, [cards, wizardDemandSearch, columnTitleMap]);

  function openNewWizard() {
    setWizardStep(1);
    setWizardCardId('');
    setWizardDemandSearch('');
    setWizardMaterials([]);
    setWizardTitle('');
    setWizardDescription('');
    setAddMaterialTab('files');
    setDraftLinkTitle('');
    setDraftLinkUrl('');
    setDraftLinkNotes('');
    setDraftTextTitle('');
    setDraftTextContent('');
    setDraftTextNotes('');
    setActionError('');
    setWizardOpen(true);
  }

  async function handleFileUploadToQueue(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'wizard' | 'extra'
  ) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setActionError('');
    setWizardUploading(true);
    try {
      const uploadedItems: DraftMaterial[] = [];
      for (const file of files) {
        const up = await uploadFile(file);
        const type = detectFileMaterialType(file);
        uploadedItems.push({
          tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type,
          title: sanitizeFileDisplayName(file.name),
          url: up.file_url,
          file_name: up.original_name,
          mime_type: up.mime_type,
          size_bytes: up.size_bytes,
          notes: '',
        });
      }
      if (target === 'wizard') {
        setWizardMaterials((prev) => [...prev, ...uploadedItems]);
      } else {
        setExtraMaterials((prev) => [...prev, ...uploadedItems]);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao enviar arquivo.');
    } finally {
      setWizardUploading(false);
      e.target.value = '';
    }
  }

  function handleAddLinkToQueue(target: 'wizard' | 'extra') {
    if (!draftLinkUrl.trim()) {
      setActionError('Informe a URL do link antes de adicionar.');
      return;
    }
    const cleanUrl = /^https?:\/\//i.test(draftLinkUrl.trim())
      ? draftLinkUrl.trim()
      : `https://${draftLinkUrl.trim()}`;
    const item: DraftMaterial = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'link',
      title: draftLinkTitle.trim() || cleanUrl.replace(/^https?:\/\//i, '').slice(0, 48),
      url: cleanUrl,
      notes: draftLinkNotes.trim(),
    };
    if (target === 'wizard') {
      setWizardMaterials((prev) => [...prev, item]);
    } else {
      setExtraMaterials((prev) => [...prev, item]);
    }
    setDraftLinkTitle('');
    setDraftLinkUrl('');
    setDraftLinkNotes('');
    setActionError('');
  }

  function handleAddTextToQueue(target: 'wizard' | 'extra') {
    if (!draftTextContent.trim()) {
      setActionError('Escreva o conteúdo do texto antes de adicionar.');
      return;
    }
    const item: DraftMaterial = {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'text',
      title: draftTextTitle.trim() || 'Texto / Copy para aprovação',
      content: draftTextContent.trim(),
      notes: draftTextNotes.trim(),
    };
    if (target === 'wizard') {
      setWizardMaterials((prev) => [...prev, item]);
    } else {
      setExtraMaterials((prev) => [...prev, item]);
    }
    setDraftTextTitle('');
    setDraftTextContent('');
    setDraftTextNotes('');
    setActionError('');
  }

  async function handleSubmitWizard() {
    if (!wizardTitle.trim()) {
      setActionError('Defina o nome da entrega antes de enviar ao cliente.');
      return;
    }
    if (wizardMaterials.length === 0) {
      setActionError('Adicione pelo menos um material.');
      return;
    }
    setWizardSubmitting(true);
    setActionError('');
    try {
      const res = await api<{ delivery: ApprovalDelivery }>(`/boards/${boardId}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          title: wizardTitle.trim(),
          description: wizardDescription.trim(),
          card_id: wizardCardId || null,
          items: wizardMaterials.map((m) => ({
            type: m.type,
            title: m.title.trim() || m.file_name || 'Material',
            url: m.url || '',
            file_name: m.file_name || '',
            mime_type: m.mime_type || '',
            size_bytes: m.size_bytes || 0,
            content: m.content || '',
            notes: m.notes || '',
          })),
        }),
      });
      setWizardOpen(false);
      await onUpdated();
      if (res.delivery?.id) {
        setSelectedDeliveryId(res.delivery.id);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Não foi possível criar a entrega.');
    } finally {
      setWizardSubmitting(false);
    }
  }

  async function handleSaveExtraMaterials() {
    if (!activeDelivery || extraMaterials.length === 0) return;
    setSavingExtra(true);
    setActionError('');
    try {
      await api(`/approvals/${activeDelivery.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          items: extraMaterials.map((m) => ({
            type: m.type,
            title: m.title.trim() || m.file_name || 'Material',
            url: m.url || '',
            file_name: m.file_name || '',
            mime_type: m.mime_type || '',
            size_bytes: m.size_bytes || 0,
            content: m.content || '',
            notes: m.notes || '',
          })),
        }),
      });
      setExtraMaterials([]);
      setAddingToDelivery(false);
      await onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao adicionar materiais.');
    } finally {
      setSavingExtra(false);
    }
  }

  async function handleItemDecision(
    deliveryId: string,
    item: ApprovalMaterialItem,
    decision: 'approved' | 'changes_requested'
  ) {
    setActionError('');
    if (decision === 'changes_requested' && !feedbackDraft.trim()) {
      setActionError('Descreva a alteração desejada antes de enviar.');
      return;
    }
    setSubmittingItemId(item.id);
    try {
      await api(`/approvals/${deliveryId}/items/${item.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          feedback: decision === 'changes_requested' ? feedbackDraft.trim() : '',
        }),
      });
      setAdjustingItemId(null);
      setFeedbackDraft('');
      await onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao registrar decisão.');
    } finally {
      setSubmittingItemId(null);
    }
  }

  async function handleSendItemComment(deliveryId: string, itemId: string) {
    const text = (commentDrafts[itemId] || '').trim();
    if (!text) return;
    setSendingCommentId(itemId);
    setActionError('');
    try {
      await api(`/approvals/${deliveryId}/items/${itemId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: text }),
      });
      setCommentDrafts((prev) => ({ ...prev, [itemId]: '' }));
      await onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao enviar comentário.');
    } finally {
      setSendingCommentId(null);
    }
  }

  function openNewVersionModal(item: ApprovalMaterialItem) {
    setVersioningItem(item);
    setVersionUrl(item.type === 'link' ? item.url || '' : '');
    setVersionFileName('');
    setVersionMime('');
    setVersionContent(item.type === 'text' ? item.content || '' : '');
    setVersionNotes('');
    setActionError('');
  }

  async function handleVersionFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setVersionUploading(true);
    setActionError('');
    try {
      const up = await uploadFile(file);
      setVersionUrl(up.file_url);
      setVersionFileName(up.original_name);
      setVersionMime(up.mime_type);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao subir arquivo da nova versão.');
    } finally {
      setVersionUploading(false);
      e.target.value = '';
    }
  }

  async function handleSubmitNewVersion() {
    if (!activeDelivery || !versioningItem) return;
    if (versioningItem.type === 'text' && !versionContent.trim()) {
      setActionError('Informe o texto atualizado para a nova versão.');
      return;
    }
    if (versioningItem.type !== 'text' && !versionUrl.trim()) {
      setActionError(
        versioningItem.type === 'link'
          ? 'Informe a URL atualizada.'
          : 'Envie o novo arquivo corrigido antes de publicar.'
      );
      return;
    }
    setVersionSaving(true);
    setActionError('');
    try {
      await api(`/approvals/${activeDelivery.id}/items/${versioningItem.id}/version`, {
        method: 'POST',
        body: JSON.stringify({
          url: versionUrl.trim(),
          file_name: versionFileName || versioningItem.file_name,
          mime_type: versionMime || versioningItem.mime_type,
          content: versionContent.trim(),
          notes: versionNotes.trim(),
        }),
      });
      setVersioningItem(null);
      await onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao salvar nova versão.');
    } finally {
      setVersionSaving(false);
    }
  }

  async function handleDeleteDelivery(delivery: ApprovalDelivery) {
    if (isClient) return;
    setActionError('');
    try {
      await api(`/approvals/${delivery.id}`, { method: 'DELETE' });
      if (selectedDeliveryId === delivery.id) setSelectedDeliveryId(null);
      await onUpdated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao remover entrega.');
    }
  }

  function renderDeliveryStatusBadge(status: ApprovalDeliveryStatus) {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#DCFCE7] text-[#15803D] border border-[#22C55E]/35 text-[11px] font-bold whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Aprovado
        </span>
      );
    }
    if (status === 'changes_requested') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FDF0E8] text-[#B84C24] border border-[#E1754C]/45 text-[11px] font-bold whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 text-[#E1754C]" />
          Em alteração
        </span>
      );
    }
    if (status === 'partially_approved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#F3ECF9] text-[#6D28D9] border border-[#BC9FE6]/55 text-[11px] font-bold whitespace-nowrap">
          <Clock className="w-3.5 h-3.5" />
          Parcialmente aprovado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FDF2F6] text-[#EC2B82] border border-[#EC97B7]/60 text-[11px] font-bold whitespace-nowrap">
        <Clock className="w-3.5 h-3.5" />
        Aguardando aprovação
      </span>
    );
  }

  function renderItemStatusBadge(status: ApprovalItemStatus) {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#DCFCE7] text-[#15803D] border border-[#22C55E]/35 text-[11px] font-bold">
          <CheckCircle2 className="w-3 h-3" />
          Aprovado
        </span>
      );
    }
    if (status === 'changes_requested') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#FDF0E8] text-[#B84C24] border border-[#E1754C]/45 text-[11px] font-bold">
          <AlertTriangle className="w-3 h-3 text-[#E1754C]" />
          Alteração solicitada
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#FDF2F6] text-[#EC2B82] border border-[#EC97B7]/60 text-[11px] font-bold">
        <Clock className="w-3 h-3" />
        Aguardando aprovação
      </span>
    );
  }

  // =========================================================================
  // DELIVERY DETAIL SCREEN (opened when clicking "Abrir" or deep-linked)
  // =========================================================================
  if (activeDelivery && !compact) {
    const approvedItemsCount = activeDelivery.items.filter((i) => i.status === 'approved').length;
    const changesItemsCount = activeDelivery.items.filter((i) => i.status === 'changes_requested').length;
    const linkedCard = activeDelivery.card_id
      ? cards.find((c) => c.id === activeDelivery.card_id)
      : undefined;

    return (
      <section className="rounded-[24px] bg-gradient-to-br from-[#FDF2F6]/90 via-white/95 to-[#FCF6EC]/90 border border-[#EC97B7]/45 p-5 sm:p-6 space-y-5 shadow-[0_14px_34px_-18px_rgba(236,43,130,0.22)]">
        {/* Top Back & Delivery Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#BC9FE6]/25">
          <div className="space-y-2 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setSelectedDeliveryId(null);
                setAddingToDelivery(false);
                setExtraMaterials([]);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#7A689C] hover:text-[#EC2B82] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar para todas as aprovações</span>
            </button>

            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#2F1534] tracking-tight">
                {activeDelivery.title}
              </h2>
              {renderDeliveryStatusBadge(activeDelivery.status)}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7A689C]">
              <span className="tabular-nums">Enviado em {formatDateBR(activeDelivery.created_at)}</span>
              <span>·</span>
              <span className="font-semibold text-[#2F1534] tabular-nums">
                {approvedItemsCount} de {activeDelivery.items.length} aprovados
              </span>
              {changesItemsCount > 0 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-[#E1754C] tabular-nums">
                    {changesItemsCount} em alteração
                  </span>
                </>
              )}
              {linkedCard && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => onOpenCard(linkedCard)}
                    className="inline-flex items-center gap-1 font-bold text-[#EC2B82] hover:underline"
                  >
                    <Layers className="w-3 h-3" />
                    Demanda: {linkedCard.title}
                  </button>
                </>
              )}
            </div>

            {activeDelivery.description && (
              <p className="text-xs sm:text-sm text-[#232122]/75 leading-relaxed pt-1">
                {activeDelivery.description}
              </p>
            )}
          </div>

          {!isClient && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setAddingToDelivery((v) => !v);
                  setExtraMaterials([]);
                  setActionError('');
                }}
                className="px-3.5 py-2 rounded-xl aumi-liquid-pink-pill text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{addingToDelivery ? 'Fechar inclusão' : 'Adicionar materiais'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDelivery(activeDelivery)}
                className="p-2 rounded-xl bg-white border border-black/10 text-[#232122]/45 hover:text-red-600 hover:border-red-200 transition-colors"
                title="Excluir entrega"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {actionError && (
          <div className="p-3 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/35 text-xs font-medium text-[#A9195A] flex items-center justify-between gap-2">
            <span>{actionError}</span>
            <button type="button" onClick={() => setActionError('')} className="text-[#EC2B82]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Team-only: Add more materials drawer */}
        {!isClient && addingToDelivery && (
          <div className="rounded-2xl bg-white border border-[#EC97B7]/50 p-4 space-y-3 shadow-sm">
            <p className="text-xs font-extrabold text-[#2F1534]">
              Adicionar novos materiais nesta entrega
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'files', label: 'Imagens / PDFs / Arquivos' },
                  { id: 'link', label: 'Link' },
                  { id: 'text', label: 'Texto' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAddMaterialTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                    addMaterialTab === t.id
                      ? 'bg-[#2F1534] text-white'
                      : 'bg-[#FAF7FC] text-[#7A689C]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {addMaterialTab === 'files' && (
              <label className="w-full py-5 px-4 rounded-xl border-2 border-dashed border-[#BC9FE6]/60 hover:border-[#EC2B82] bg-[#FAF7FC]/60 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors">
                <UploadCloud className="w-5 h-5 text-[#EC2B82]" />
                <span className="text-xs font-bold text-[#2F1534]">
                  {wizardUploading ? 'Enviando arquivos...' : 'Clique para selecionar imagens, PDFs ou documentos'}
                </span>
                <input
                  type="file"
                  multiple
                  disabled={wizardUploading}
                  onChange={(e) => handleFileUploadToQueue(e, 'extra')}
                  className="hidden"
                />
              </label>
            )}

            {addMaterialTab === 'link' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={draftLinkTitle}
                  onChange={(e) => setDraftLinkTitle(e.target.value)}
                  placeholder="Nome do link (ex: Protótipo Figma)"
                  className="px-3 py-2 rounded-xl border border-black/10 text-xs"
                />
                <input
                  type="url"
                  value={draftLinkUrl}
                  onChange={(e) => setDraftLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="px-3 py-2 rounded-xl border border-black/10 text-xs"
                />
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAddLinkToQueue('extra')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
                  >
                    + Adicionar link à lista
                  </button>
                </div>
              </div>
            )}

            {addMaterialTab === 'text' && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={draftTextTitle}
                  onChange={(e) => setDraftTextTitle(e.target.value)}
                  placeholder="Título do texto (ex: Legenda Post 01)"
                  className="w-full px-3 py-2 rounded-xl border border-black/10 text-xs"
                />
                <textarea
                  rows={3}
                  value={draftTextContent}
                  onChange={(e) => setDraftTextContent(e.target.value)}
                  placeholder="Escreva ou cole o texto para aprovação..."
                  className="w-full px-3 py-2 rounded-xl border border-black/10 text-xs"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleAddTextToQueue('extra')}
                    className="px-3.5 py-1.5 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
                  >
                    + Adicionar texto à lista
                  </button>
                </div>
              </div>
            )}

            {extraMaterials.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-black/[0.06]">
                {extraMaterials.map((em) => (
                  <div
                    key={em.tempId}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#FAF7FC] text-xs"
                  >
                    <span className="font-semibold text-[#2F1534] truncate">
                      [{getMaterialTypeLabel(em.type)}] {em.title}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setExtraMaterials((prev) => prev.filter((x) => x.tempId !== em.tempId))
                      }
                      className="text-[#232122]/45 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={savingExtra}
                    onClick={handleSaveExtraMaterials}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold"
                  >
                    {savingExtra ? 'Salvando...' : `Enviar ${extraMaterials.length} material(is)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Materials Organized Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeDelivery.items.map((item) => {
            const TypeIcon = getMaterialTypeIcon(item.type);
            const isBusy = submittingItemId === item.id;
            const isAdjusting = adjustingItemId === item.id;
            const commentsOpen = openCommentsItemId === item.id;
            const versionsOpen = openVersionsItemId === item.id;
            const canDecide = !isClient || allowClientApprovals;
            const imgIdx =
              item.type === 'image' ? galleryImages.findIndex((g) => g.id === item.id) : -1;

            return (
              <article
                key={item.id}
                className="rounded-2xl bg-white border border-[#BC9FE6]/35 hover:border-[#EC97B7]/80 overflow-hidden flex flex-col justify-between shadow-[0_10px_24px_-14px_rgba(47,21,52,0.16)]"
              >
                <div>
                  {/* Material Header */}
                  <div className="px-4 py-3 bg-[#FAF7FC]/80 border-b border-black/[0.05] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-7 h-7 rounded-xl bg-white border border-[#BC9FE6]/40 text-[#EC2B82] flex items-center justify-center shrink-0">
                        <TypeIcon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#2F1534] truncate">{item.title}</p>
                        <div className="flex items-center gap-1.5 text-[10.5px] text-[#7A689C]">
                          <span>{getMaterialTypeLabel(item.type)}</span>
                          <span>·</span>
                          <span className="font-bold text-[#2F1534]">v{item.version_number || 1}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0">{renderItemStatusBadge(item.status)}</div>
                  </div>

                  {/* Interactive Material Viewer Area */}
                  <div className="p-4 space-y-3">
                    {item.type === 'image' && item.url && (
                      <div className="relative h-56 rounded-xl bg-[#FAF7FC] border border-black/[0.06] overflow-hidden group">
                        <img
                          src={item.url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain bg-[#2F1534]/[0.03]"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setGalleryZoomed(false);
                            setGalleryIndex(imgIdx >= 0 ? imgIdx : 0);
                          }}
                          className="absolute inset-0 bg-[#2F1534]/0 group-hover:bg-[#2F1534]/30 transition-colors flex items-center justify-center"
                        >
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3.5 py-2 rounded-full bg-white/95 text-[#2F1534] text-xs font-bold inline-flex items-center gap-1.5 shadow-md">
                            <Eye className="w-3.5 h-3.5 text-[#EC2B82]" />
                            Ampliar imagem
                          </span>
                        </button>
                      </div>
                    )}

                    {item.type === 'pdf' && item.url && (
                      <div className="space-y-2">
                        <div className="h-56 rounded-xl overflow-hidden border border-[#BC9FE6]/35 bg-[#FAF7FC]">
                          <iframe
                            src={item.url}
                            title={item.title}
                            className="w-full h-full"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="px-3 py-1.5 rounded-xl bg-[#F3ECF9] hover:bg-[#7A689C] text-[#7A689C] hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Expandir PDF
                          </button>
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-semibold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir em nova aba
                          </a>
                          <a
                            href={item.url}
                            download={item.file_name || item.title}
                            className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-semibold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Baixar
                          </a>
                        </div>
                      </div>
                    )}

                    {item.type === 'link' && item.url && (
                      <div className="p-4 rounded-xl bg-gradient-to-br from-[#F3ECF9]/70 to-[#FDF2F6]/60 border border-[#BC9FE6]/40 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs text-[#7A689C] break-all">
                          <Link2 className="w-4 h-4 text-[#EC2B82] shrink-0" />
                          <span className="font-medium">{item.url}</span>
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Acessar link
                        </a>
                      </div>
                    )}

                    {item.type === 'text' && (
                      <div className="p-4 rounded-xl bg-[#FCF6EC]/85 border border-[#E1754C]/25 space-y-2.5">
                        <p className="text-xs sm:text-sm text-[#2F1534] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                          {item.content || 'Sem conteúdo textual.'}
                        </p>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setPreviewItem(item)}
                            className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Ler completo
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyTextSafe(item.content || '');
                              if (ok) {
                                setCopiedItemId(item.id);
                                setTimeout(() => setCopiedItemId(null), 1600);
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-semibold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1.5"
                          >
                            {copiedItemId === item.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-[#15803D]" />
                                Copiado
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                Copiar texto
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {(item.type === 'document' || item.type === 'file') && item.url && (
                      <div className="p-4 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-10 h-10 rounded-xl bg-white border border-[#BC9FE6]/35 flex items-center justify-center text-[#7A689C] shrink-0">
                            <File className="w-5 h-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#2F1534] truncate">
                              {item.file_name || item.title}
                            </p>
                            <p className="text-[11px] text-[#7A689C]">
                              {getMaterialTypeLabel(item.type)} anexado
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-white border border-black/10 text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Abrir
                          </a>
                          <a
                            href={item.url}
                            download={item.file_name || item.title}
                            className="px-3 py-1.5 rounded-xl bg-[#2F1534] text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Baixar
                          </a>
                        </div>
                      </div>
                    )}

                    {item.notes && (
                      <p className="text-xs text-[#232122]/75 bg-[#FAF7FC] rounded-xl px-3 py-2 border border-black/[0.04]">
                        <span className="font-bold text-[#7A689C]">Nota da equipe: </span>
                        {item.notes}
                      </p>
                    )}

                    {item.status === 'changes_requested' && item.feedback && (
                      <div className="p-3 rounded-xl bg-[#FDF0E8] border border-[#E1754C]/35 text-xs text-[#2F1534]">
                        <p className="font-bold text-[#B84C24] mb-0.5">Alteração solicitada:</p>
                        <p className="leading-relaxed">{item.feedback}</p>
                      </div>
                    )}

                    {/* Meta Action Strip: Comments + Version History + Team New Version */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenCommentsItemId(commentsOpen ? null : item.id)
                          }
                          className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors ${
                            commentsOpen
                              ? 'bg-[#2F1534] text-white'
                              : 'bg-[#FAF7FC] text-[#7A689C] hover:text-[#EC2B82]'
                          }`}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>
                            Comentários ({(item.comments || []).length})
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setOpenVersionsItemId(versionsOpen ? null : item.id)
                          }
                          className={`px-2.5 py-1 rounded-lg font-semibold inline-flex items-center gap-1.5 transition-colors ${
                            versionsOpen
                              ? 'bg-[#2F1534] text-white'
                              : 'bg-[#FAF7FC] text-[#7A689C] hover:text-[#2F1534]'
                          }`}
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Versões ({(item.versions || []).length || 1})</span>
                        </button>
                      </div>

                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => openNewVersionModal(item)}
                          className={`px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1 transition-colors ${
                            item.status === 'changes_requested'
                              ? 'bg-[#EC2B82] text-white hover:bg-[#d11f6f]'
                              : 'bg-[#F3ECF9] text-[#7A689C] hover:bg-[#7A689C] hover:text-white'
                          }`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Enviar nova versão</span>
                        </button>
                      )}
                    </div>

                    {/* Version History Drawer */}
                    {versionsOpen && (
                      <div className="rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 p-3 space-y-2">
                        <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#7A689C]">
                          Histórico de versões
                        </p>
                        {(item.versions || []).length === 0 ? (
                          <p className="text-xs text-[#232122]/60">Versão inicial (v1).</p>
                        ) : (
                          <div className="space-y-1.5 max-h-44 overflow-y-auto">
                            {[...(item.versions || [])].reverse().map((v) => (
                              <div
                                key={v.version}
                                className="p-2 rounded-lg bg-white border border-black/[0.05] flex items-center justify-between gap-2 text-[11.5px]"
                              >
                                <div className="min-w-0">
                                  <p className="font-bold text-[#2F1534]">
                                    Versão v{v.version}{' '}
                                    <span className="font-normal text-[#7A689C]">
                                      · {v.uploaded_by_name} · {formatDateTimeBR(v.created_at)}
                                    </span>
                                  </p>
                                  {v.notes && (
                                    <p className="text-[11px] text-[#232122]/70 truncate">{v.notes}</p>
                                  )}
                                </div>
                                {v.url && (
                                  <a
                                    href={v.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2 py-1 rounded-md bg-[#F3ECF9] text-[#7A689C] hover:text-[#EC2B82] font-bold shrink-0"
                                  >
                                    Abrir
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-Item Comments Thread */}
                    {commentsOpen && (
                      <div className="rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 p-3 space-y-2.5">
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {(item.comments || []).length === 0 ? (
                            <p className="text-xs text-[#232122]/55 text-center py-2">
                              Nenhum comentário neste material ainda.
                            </p>
                          ) : (
                            item.comments.map((cmt) => (
                              <div
                                key={cmt.id}
                                className={`p-2.5 rounded-xl text-xs ${
                                  cmt.author_role === 'client'
                                    ? 'bg-[#FDF2F6] border border-[#EC97B7]/40'
                                    : 'bg-white border border-black/[0.06]'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                  <span className="font-bold text-[#2F1534]">{cmt.author_name}</span>
                                  <span className="text-[10px] text-[#7A689C] tabular-nums">
                                    {formatDateTimeBR(cmt.created_at)}
                                  </span>
                                </div>
                                <p className="text-[#232122]/85 whitespace-pre-wrap leading-relaxed">
                                  {cmt.content}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={commentDrafts[item.id] || ''}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSendItemComment(activeDelivery.id, item.id);
                              }
                            }}
                            placeholder="Escrever comentário neste material..."
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-black/10 text-xs focus:outline-none focus:border-[#EC2B82]"
                          />
                          <button
                            type="button"
                            disabled={sendingCommentId === item.id}
                            onClick={() => handleSendItemComment(activeDelivery.id, item.id)}
                            className="px-3 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1 transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Per-Item Individual Approval Action Footer */}
                {canDecide && (
                  <div className="px-4 pb-4 pt-1">
                    {!isAdjusting ? (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isBusy || item.status === 'approved'}
                          onClick={() => handleItemDecision(activeDelivery.id, item, 'approved')}
                          className={`px-3 py-2.5 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 ${
                            item.status === 'approved'
                              ? 'bg-[#DCFCE7] text-[#15803D] border border-[#22C55E]/35'
                              : 'bg-[#DAD994] hover:bg-[#C8C978] text-[#2F1534]'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {item.status === 'approved'
                              ? 'Item aprovado'
                              : isBusy
                              ? 'Salvando...'
                              : 'Aprovar item'}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setAdjustingItemId(item.id);
                            setFeedbackDraft('');
                            setActionError('');
                          }}
                          className="px-3 py-2.5 rounded-xl bg-[#FDF0E8] hover:bg-[#E1754C] text-[#B84C24] hover:text-white border border-[#E1754C]/35 text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Pedir alteração</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 p-3 rounded-xl bg-[#FCF6EC] border border-[#E1754C]/40">
                        <textarea
                          rows={2}
                          value={feedbackDraft}
                          onChange={(e) => setFeedbackDraft(e.target.value)}
                          placeholder="Descreva o que deseja alterar neste material..."
                          className="w-full px-3 py-2 rounded-lg bg-white border border-[#E1754C]/30 text-xs text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustingItemId(null);
                              setFeedbackDraft('');
                            }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#232122]/60"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleItemDecision(activeDelivery.id, item, 'changes_requested')
                            }
                            className="px-3.5 py-1.5 rounded-lg bg-[#E1754C] hover:bg-[#c85f36] text-white text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" />
                            <span>{isBusy ? 'Enviando...' : 'Enviar alteração'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {/* High-Resolution Image Gallery Lightbox with Zoom + Prev/Next */}
        {galleryIndex !== null && galleryImages[galleryIndex] && (
          <div
            className="fixed inset-0 z-50 bg-[#2F1534]/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => {
              setGalleryIndex(null);
              setGalleryZoomed(false);
            }}
          >
            <div
              className="max-w-5xl w-full aumi-mac-window rounded-[28px] overflow-hidden flex flex-col max-h-[92vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 aumi-finder-chrome flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#2F1534] truncate">
                    {galleryImages[galleryIndex].title}
                  </p>
                  <p className="text-[11px] text-[#7A689C] tabular-nums">
                    Imagem {galleryIndex + 1} de {galleryImages.length} · v
                    {galleryImages[galleryIndex].version_number || 1}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setGalleryZoomed((z) => !z)}
                    className="px-3 py-1.5 rounded-xl bg-white/90 border border-[#BC9FE6]/40 text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1.5"
                  >
                    {galleryZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                    <span>{galleryZoomed ? 'Reduzir' : 'Ampliar'}</span>
                  </button>
                  <a
                    href={galleryImages[galleryIndex].url}
                    download={galleryImages[galleryIndex].file_name || galleryImages[galleryIndex].title}
                    className="px-3 py-1.5 rounded-xl bg-[#2F1534] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryIndex(null);
                      setGalleryZoomed(false);
                    }}
                    className="w-8 h-8 rounded-xl bg-white/90 border border-black/10 text-[#2F1534] hover:text-[#EC2B82] flex items-center justify-center"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 overflow-auto bg-[#232122]/8 p-5 flex items-center justify-center min-h-[320px]">
                {galleryImages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryZoomed(false);
                      setGalleryIndex((galleryIndex - 1 + galleryImages.length) % galleryImages.length);
                    }}
                    aria-label="Imagem anterior"
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/95 hover:bg-[#EC2B82] text-[#2F1534] hover:text-white shadow-lg flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}

                <img
                  src={galleryImages[galleryIndex].url}
                  alt={galleryImages[galleryIndex].title}
                  referrerPolicy="no-referrer"
                  onClick={() => setGalleryZoomed((z) => !z)}
                  className={`rounded-xl shadow-lg transition-transform duration-200 cursor-zoom-in ${
                    galleryZoomed
                      ? 'max-w-none w-[150%] cursor-zoom-out'
                      : 'max-w-full max-h-[72vh] object-contain'
                  }`}
                />

                {galleryImages.length > 1 && (
                  <button
                    type="button"
                    onClick={() => {
                      setGalleryZoomed(false);
                      setGalleryIndex((galleryIndex + 1) % galleryImages.length);
                    }}
                    aria-label="Próxima imagem"
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/95 hover:bg-[#EC2B82] text-[#2F1534] hover:text-white shadow-lg flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Full PDF / Text Preview Modal */}
        {previewItem && (
          <div
            className="fixed inset-0 z-50 bg-[#2F1534]/75 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setPreviewItem(null)}
          >
            <div
              className="max-w-4xl w-full aumi-mac-window rounded-[28px] overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-3.5 aumi-finder-chrome flex items-center justify-between gap-3">
                <p className="text-sm font-extrabold text-[#2F1534] truncate">{previewItem.title}</p>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="w-8 h-8 rounded-xl bg-white/90 border border-black/10 text-[#2F1534] hover:text-[#EC2B82] flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-white p-5">
                {previewItem.type === 'pdf' && previewItem.url ? (
                  <iframe
                    src={previewItem.url}
                    title={previewItem.title}
                    className="w-full h-[72vh] rounded-xl border border-black/10"
                  />
                ) : (
                  <div className="text-sm text-[#2F1534] whitespace-pre-wrap leading-relaxed">
                    {previewItem.content}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team-only: Publish New Version Modal (preserves version history & comments) */}
        {!isClient && versioningItem && (
          <div
            className="fixed inset-0 z-50 bg-[#2F1534]/65 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setVersioningItem(null)}
          >
            <div
              className="max-w-lg w-full aumi-mac-window rounded-[26px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 aumi-finder-chrome flex items-center justify-between">
                <div>
                  <p className="text-sm font-extrabold text-[#2F1534]">
                    Enviar versão v{(versioningItem.version_number || 1) + 1}
                  </p>
                  <p className="text-[11px] text-[#7A689C]">
                    {versioningItem.title} · Versões anteriores e comentários serão preservados
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVersioningItem(null)}
                  className="w-8 h-8 rounded-xl bg-white/90 flex items-center justify-center text-[#2F1534]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 bg-white space-y-3.5">
                {versioningItem.type === 'text' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#7A689C]">Texto atualizado</label>
                    <textarea
                      rows={5}
                      value={versionContent}
                      onChange={(e) => setVersionContent(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-black/15 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                ) : versioningItem.type === 'link' ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#7A689C]">URL atualizada</label>
                    <input
                      type="url"
                      value={versionUrl}
                      onChange={(e) => setVersionUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-black/15 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="w-full py-5 px-4 rounded-xl border-2 border-dashed border-[#BC9FE6]/65 hover:border-[#EC2B82] bg-[#FAF7FC] flex flex-col items-center justify-center gap-1.5 cursor-pointer">
                      <UploadCloud className="w-5 h-5 text-[#EC2B82]" />
                      <span className="text-xs font-bold text-[#2F1534]">
                        {versionUploading
                          ? 'Enviando arquivo...'
                          : versionFileName
                          ? `Selecionado: ${versionFileName}`
                          : 'Selecionar arquivo corrigido'}
                      </span>
                      <input
                        type="file"
                        disabled={versionUploading}
                        onChange={handleVersionFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#7A689C]">
                    Resumo da alteração realizada (opcional)
                  </label>
                  <input
                    type="text"
                    value={versionNotes}
                    onChange={(e) => setVersionNotes(e.target.value)}
                    placeholder="Ex: Ajustada cor do título e espaçamento do rodapé"
                    className="w-full px-3 py-2 rounded-xl border border-black/15 text-xs focus:outline-none focus:border-[#EC2B82]"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setVersioningItem(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#232122]/65"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={versionSaving || versionUploading}
                    onClick={handleSubmitNewVersion}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{versionSaving ? 'Publicando...' : 'Publicar nova versão'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    );
  }

  // =========================================================================
  // MAIN APPROVALS SCREEN (Clean Delivery Cards: Name, Date, Count, Status, "Abrir")
  // =========================================================================
  return (
    <section className="rounded-[24px] bg-gradient-to-br from-[#FDF2F6]/90 via-white/92 to-[#FCF6EC]/90 border border-[#EC97B7]/45 p-5 sm:p-6 space-y-4 shadow-[0_14px_34px_-18px_rgba(236,43,130,0.22)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#EC2B82] via-[#E1754C] to-[#EC97B7] text-white flex items-center justify-center shadow-sm shrink-0">
            <Palette className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-extrabold text-[#2F1534] tracking-tight">
                Aprovações
              </h2>
              {pendingCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#EC2B82] text-white text-[11px] font-bold tabular-nums shadow-xs">
                  {pendingCount} aguardando
                </span>
              )}
            </div>
            <p className="text-xs text-[#7A689C]">
              {isClient
                ? 'Abra cada entrega para visualizar imagens, PDFs, links e aprovar item por item.'
                : 'Crie entregas organizadas por demanda com imagens, PDFs, links, textos e arquivos.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isClient && (
            <button
              type="button"
              onClick={openNewWizard}
              className="px-4 py-2 rounded-xl aumi-liquid-pink-pill text-white text-xs font-bold inline-flex items-center gap-1.5 transition-all hover:brightness-105 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova aprovação</span>
            </button>
          )}

          {compact && onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="px-3 py-2 rounded-xl bg-white/90 hover:bg-white border border-[#BC9FE6]/45 text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Ver todas ({deliveries.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all', label: `Todas (${deliveries.length})` },
              { id: 'pending', label: `Aguardando (${pendingCount})` },
              { id: 'changes_requested', label: `Em alteração (${changesCount})` },
              { id: 'approved', label: `Aprovadas (${approvedCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all tabular-nums whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-[#2F1534] text-white shadow-xs'
                  : 'bg-white/80 hover:bg-white text-[#2F1534]/75 border border-[#BC9FE6]/30'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/35 text-xs font-medium text-[#A9195A] flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError('')} className="text-[#EC2B82]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Clean Delivery Cards Grid */}
      {visibleDeliveries.length === 0 ? (
        <div className="rounded-2xl bg-white/85 border border-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F3ECF9] to-[#FDF2F6] border border-[#BC9FE6]/40 flex items-center justify-center text-[#7A689C] shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#2F1534]">
                {filter === 'all'
                  ? 'Nenhuma entrega enviada para aprovação ainda'
                  : 'Nenhuma entrega neste filtro'}
              </p>
              <p className="text-xs text-[#232122]/60 mt-0.5">
                {isClient
                  ? 'Quando a equipe enviar novos materiais para aprovação, eles aparecerão aqui.'
                  : 'Clique em “Nova aprovação” para selecionar uma demanda, adicionar materiais e enviar ao cliente.'}
              </p>
            </div>
          </div>
          {!isClient && (
            <button
              type="button"
              onClick={openNewWizard}
              className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar aprovação</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleDeliveries.map((delivery) => {
            const count = (delivery.items || []).length;
            return (
              <article
                key={delivery.id}
                className="rounded-2xl bg-white/95 border border-[#BC9FE6]/35 hover:border-[#EC97B7]/85 p-5 flex flex-col justify-between gap-4 transition-all shadow-[0_10px_24px_-14px_rgba(47,21,52,0.16)]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-extrabold text-[#2F1534] leading-snug line-clamp-2">
                      {delivery.title}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {renderDeliveryStatusBadge(delivery.status)}
                    <span className="px-2.5 py-1 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/30 text-[11px] font-bold text-[#7A689C] tabular-nums">
                      {count} {count === 1 ? 'material' : 'materiais'}
                    </span>
                  </div>

                  <p className="text-xs text-[#7A689C] tabular-nums">
                    Data: <span className="font-semibold text-[#2F1534]">{formatDateBR(delivery.created_at)}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (compact && onOpenDelivery) {
                      onOpenDelivery(delivery.id);
                    } else if (compact && onViewAll) {
                      setSelectedDeliveryId(delivery.id);
                      onViewAll();
                    } else {
                      setSelectedDeliveryId(delivery.id);
                    }
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Abrir</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* TEAM 4-STEP WIZARD MODAL: 1. Demand -> 2. Materials -> 3. Name -> 4. Send */}
      {/* =================================================================== */}
      {!isClient && wizardOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#2F1534]/65 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setWizardOpen(false)}
        >
          <div
            className="max-w-2xl w-full aumi-mac-window rounded-[28px] overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Wizard Chrome */}
            <div className="px-5 py-4 aumi-finder-chrome flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#2F1534]">
                  Nova Aprovação para o Cliente
                </h3>
                <p className="text-[11px] text-[#7A689C]">
                  Passo {wizardStep} de 4 —{' '}
                  {wizardStep === 1
                    ? 'Selecionar a demanda'
                    : wizardStep === 2
                    ? 'Adicionar os materiais'
                    : wizardStep === 3
                    ? 'Definir o nome da entrega'
                    : 'Revisar e enviar ao cliente'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setWizardOpen(false)}
                className="w-8 h-8 rounded-xl bg-white/90 border border-black/10 text-[#2F1534] hover:text-[#EC2B82] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stepper Progress */}
            <div className="px-5 py-2.5 bg-white/90 border-b border-black/[0.06] grid grid-cols-4 gap-2">
              {[
                { n: 1, label: '1. Demanda' },
                { n: 2, label: '2. Materiais' },
                { n: 3, label: '3. Nome' },
                { n: 4, label: '4. Enviar' },
              ].map((s) => (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => {
                    if (s.n < wizardStep) setWizardStep(s.n as 1 | 2 | 3 | 4);
                  }}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-bold text-center transition-colors ${
                    wizardStep === s.n
                      ? 'bg-[#EC2B82] text-white'
                      : wizardStep > s.n
                      ? 'bg-[#F3ECF9] text-[#7A689C]'
                      : 'bg-black/[0.04] text-[#232122]/45'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Wizard Body */}
            <div className="flex-1 overflow-y-auto p-5 bg-white space-y-4">
              {actionError && (
                <div className="p-3 rounded-xl bg-[#FDF2F6] border border-[#EC2B82]/35 text-xs font-semibold text-[#A9195A]">
                  {actionError}
                </div>
              )}

              {/* STEP 1: Select Kanban Demand */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-[#7A689C]">
                    Escolha a demanda existente do Kanban vinculada a esta entrega:
                  </p>
                  <input
                    type="text"
                    value={wizardDemandSearch}
                    onChange={(e) => setWizardDemandSearch(e.target.value)}
                    placeholder="Buscar demanda por nome, serviço ou etapa..."
                    className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                  />

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {filteredWizardCards.map((c) => {
                      const colTitle = columnTitleMap.get(c.column_id) || '';
                      const stage = getColumnStageBadge(colTitle);
                      const selected = wizardCardId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setWizardCardId(c.id);
                            if (!wizardTitle.trim()) {
                              setWizardTitle(c.title);
                            }
                          }}
                          className={`w-full text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                            selected
                              ? 'bg-[#FDF2F6] border-[#EC2B82] shadow-xs'
                              : 'bg-white hover:bg-[#FAF7FC] border-black/[0.08]'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-[#2F1534] truncate">
                              {c.title}
                            </p>
                            {c.service_name && (
                              <p className="text-[11px] text-[#7A689C] truncate">{c.service_name}</p>
                            )}
                          </div>
                          <span
                            className="px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold shrink-0"
                            style={{ backgroundColor: stage.bg, color: stage.text }}
                          >
                            {stage.label}
                          </span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setWizardCardId('')}
                      className={`w-full text-left p-3 rounded-2xl border text-xs font-semibold transition-all ${
                        wizardCardId === ''
                          ? 'bg-[#F3ECF9] border-[#7A689C] text-[#2F1534]'
                          : 'bg-white border-dashed border-black/15 text-[#7A689C]'
                      }`}
                    >
                      Entrega avulsa (sem vincular a um card específico)
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Add Materials (Images, PDFs, Links, Texts, Docs/Files) */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: 'files', label: 'Imagens, PDFs & Documentos' },
                        { id: 'link', label: 'Adicionar Link' },
                        { id: 'text', label: 'Adicionar Texto' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setAddMaterialTab(t.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          addMaterialTab === t.id
                            ? 'bg-[#2F1534] text-white'
                            : 'bg-[#FAF7FC] text-[#7A689C] hover:text-[#2F1534]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {addMaterialTab === 'files' && (
                    <label className="w-full py-6 px-4 rounded-2xl border-2 border-dashed border-[#BC9FE6]/65 hover:border-[#EC2B82] bg-[#FAF7FC]/75 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors">
                      <UploadCloud className="w-6 h-6 text-[#EC2B82]" />
                      <span className="text-xs font-bold text-[#2F1534]">
                        {wizardUploading
                          ? 'Enviando materiais...'
                          : 'Clique para anexar imagens, PDFs, documentos ou arquivos'}
                      </span>
                      <span className="text-[11px] text-[#7A689C]">
                        Você pode selecionar vários arquivos de uma vez
                      </span>
                      <input
                        type="file"
                        multiple
                        disabled={wizardUploading}
                        onChange={(e) => handleFileUploadToQueue(e, 'wizard')}
                        className="hidden"
                      />
                    </label>
                  )}

                  {addMaterialTab === 'link' && (
                    <div className="p-4 rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/35 space-y-2.5">
                      <input
                        type="text"
                        value={draftLinkTitle}
                        onChange={(e) => setDraftLinkTitle(e.target.value)}
                        placeholder="Nome do link (ex: Apresentação Canva / Protótipo)"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-xs"
                      />
                      <input
                        type="url"
                        value={draftLinkUrl}
                        onChange={(e) => setDraftLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-xs"
                      />
                      <input
                        type="text"
                        value={draftLinkNotes}
                        onChange={(e) => setDraftLinkNotes(e.target.value)}
                        placeholder="Observação opcional para o cliente"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-xs"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleAddLinkToQueue('wizard')}
                          className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold"
                        >
                          + Incluir link
                        </button>
                      </div>
                    </div>
                  )}

                  {addMaterialTab === 'text' && (
                    <div className="p-4 rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/35 space-y-2.5">
                      <input
                        type="text"
                        value={draftTextTitle}
                        onChange={(e) => setDraftTextTitle(e.target.value)}
                        placeholder="Título do texto (ex: Copy Carrossel 01)"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-xs"
                      />
                      <textarea
                        rows={4}
                        value={draftTextContent}
                        onChange={(e) => setDraftTextContent(e.target.value)}
                        placeholder="Digite ou cole o texto para o cliente aprovar..."
                        className="w-full px-3 py-2 rounded-xl bg-white border border-black/10 text-xs"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleAddTextToQueue('wizard')}
                          className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold"
                        >
                          + Incluir texto
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Added Materials Queue */}
                  <div className="space-y-2">
                    <p className="text-xs font-extrabold text-[#2F1534]">
                      Materiais adicionados ({wizardMaterials.length})
                    </p>
                    {wizardMaterials.length === 0 ? (
                      <p className="text-xs text-[#7A689C] py-3 text-center rounded-xl bg-[#FAF7FC]">
                        Nenhum material adicionado ainda.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {wizardMaterials.map((m) => (
                          <div
                            key={m.tempId}
                            className="p-2.5 rounded-xl bg-white border border-[#BC9FE6]/40 flex items-center gap-2.5"
                          >
                            {m.type === 'image' && m.url ? (
                              <img
                                src={m.url}
                                alt={m.title}
                                referrerPolicy="no-referrer"
                                className="w-10 h-10 rounded-lg object-cover shrink-0 border border-black/10"
                              />
                            ) : (
                              <span className="w-10 h-10 rounded-lg bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center shrink-0 text-[10px] font-bold">
                                {getMaterialTypeLabel(m.type)}
                              </span>
                            )}
                            <input
                              type="text"
                              value={m.title}
                              onChange={(e) =>
                                setWizardMaterials((prev) =>
                                  prev.map((x) =>
                                    x.tempId === m.tempId ? { ...x, title: e.target.value } : x
                                  )
                                )
                              }
                              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-semibold text-[#2F1534]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setWizardMaterials((prev) =>
                                  prev.filter((x) => x.tempId !== m.tempId)
                                )
                              }
                              className="p-1.5 rounded-lg text-[#232122]/45 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 3: Define Delivery Name */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-[#2F1534]">
                      Nome da entrega (visível no portal do cliente)
                    </label>
                    <input
                      type="text"
                      value={wizardTitle}
                      onChange={(e) => setWizardTitle(e.target.value)}
                      placeholder="Ex: Novembro — Posts para Feed ou Identidade Visual — Apresentação Inicial"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#BC9FE6]/55 text-sm font-semibold text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#7A689C]">
                      Mensagem ou orientação para o cliente (opcional)
                    </label>
                    <textarea
                      rows={3}
                      value={wizardDescription}
                      onChange={(e) => setWizardDescription(e.target.value)}
                      placeholder="Ex: Revise cada peça com calma e deixe comentários individuais se precisar de algum ajuste."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-xs text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                </div>
              )}

              {/* STEP 4: Review & Send to Client */}
              {wizardStep === 4 && (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FDF2F6] to-[#F3ECF9] border border-[#EC97B7]/50 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                      Resumo da entrega
                    </p>
                    <p className="text-base font-extrabold text-[#2F1534]">{wizardTitle}</p>
                    {wizardCardId && (
                      <p className="text-xs text-[#7A689C]">
                        Demanda vinculada:{' '}
                        <strong className="text-[#2F1534]">
                          {cards.find((c) => c.id === wizardCardId)?.title}
                        </strong>
                      </p>
                    )}
                    <p className="text-xs text-[#7A689C]">
                      Quantidade de materiais:{' '}
                      <strong className="text-[#EC2B82]">{wizardMaterials.length}</strong>
                    </p>
                    {wizardDescription && (
                      <p className="text-xs text-[#232122]/75 pt-1">{wizardDescription}</p>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {wizardMaterials.map((m, idx) => (
                      <div
                        key={m.tempId}
                        className="px-3 py-2 rounded-xl bg-[#FAF7FC] border border-black/[0.05] flex items-center justify-between text-xs"
                      >
                        <span className="font-semibold text-[#2F1534] truncate">
                          {idx + 1}. {m.title}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white text-[10.5px] font-bold text-[#7A689C] shrink-0">
                          {getMaterialTypeLabel(m.type)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Footer Buttons */}
            <div className="px-5 py-3.5 bg-[#FAF7FC] border-t border-black/[0.06] flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setActionError('');
                  if (wizardStep === 1) setWizardOpen(false);
                  else setWizardStep((wizardStep - 1) as 1 | 2 | 3 | 4);
                }}
                className="px-4 py-2 rounded-xl bg-white border border-black/10 text-xs font-bold text-[#2F1534]"
              >
                {wizardStep === 1 ? 'Cancelar' : 'Voltar'}
              </button>

              {wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={() => {
                    setActionError('');
                    if (wizardStep === 2 && wizardMaterials.length === 0) {
                      setActionError('Adicione pelo menos um material antes de avançar.');
                      return;
                    }
                    if (wizardStep === 3 && !wizardTitle.trim()) {
                      setActionError('Defina o nome da entrega antes de avançar.');
                      return;
                    }
                    setWizardStep((wizardStep + 1) as 1 | 2 | 3 | 4);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Continuar</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={wizardSubmitting}
                  onClick={handleSubmitWizard}
                  className="px-5 py-2.5 rounded-xl aumi-liquid-pink-pill text-white text-xs font-extrabold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{wizardSubmitting ? 'Enviando...' : 'Enviar ao cliente'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
