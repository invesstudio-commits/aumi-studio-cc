import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  Settings,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Calendar,
  Trash2,
  Globe,
  Lock,
  Columns,
  Link2,
  Copy,
  Check,
  UserCheck,
  ShieldOff,
  CheckCircle2,
  MessageSquarePlus,
  BookOpenCheck,
  Image as ImageIcon,
  Palette,
  Box,
  Sparkles,
  FileEdit,
  Tag,
  UploadCloud,
  CheckSquare,
  Square,
  X,
  AlignLeft,
  RotateCcw,
  Pencil,
  Send,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import { api, BOARD_COVER_PRESETS, copyTextSafe, formatShortDateBR, uploadFile } from '../lib/api.ts';
import {
  Board,
  BoardColumn,
  Card,
  CardMiniUpdateOption,
  CardMiniUpdateRecord,
  Folder,
  StudioSettings,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { CardDetailModal } from './CardDetailModal.tsx';
import { MacWindow } from './MacWindow.tsx';
import { StudioLabelItem } from './LabelsManagerModal.tsx';

interface KanbanBoardViewProps {
  boardId: string;
  user: User;
  partners?: User[];
  folders?: Folder[];
  settings?: StudioSettings | null;
  availableLabels?: StudioLabelItem[];
  mode?: 'partner' | 'client';
  embedded?: boolean;
  initialOpenCardId?: string | null;
  portalDefaults?: {
    allow_client_comments?: boolean;
    allow_client_uploads?: boolean;
    allow_client_approvals?: boolean;
    show_mural_to_clients?: boolean;
  };
  externalFilters?: {
    search?: string;
    service?: string;
    label?: string;
    lead?: string;
    onlyUnread?: boolean;
  };
  openAccessTrigger?: number;
  openSettingsTrigger?: number;
  openNewColumnTrigger?: number;
  onBack?: () => void;
  onPreviewClientPortal?: (clientId: string) => void;
  onCardAction?: () => void;
  onOpenCalendar?: () => void;
  onViewAllDemands?: (columnId?: string) => void;
  onLabelsUpdated?: (labels: StudioLabelItem[]) => void;
}

interface BoardAccessInfo {
  board_id: string;
  board_title: string;
  client_id: string;
  client_name: string;
  client_email: string;
  portal_enabled: boolean;
  shared_with_client: boolean;
  share_token: string | null;
  invite_status: 'not_invited' | 'sent' | 'accepted';
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  has_login: boolean;
  login_active: boolean;
}

const COLUMN_COLOR_DOTS = ['#7A689C', '#EC2B82', '#9333EA', '#C8C978', '#E1754C', '#2F1534'];

const DEFAULT_MINI_UPDATE_OPTIONS: CardMiniUpdateOption[] = [
  { id: 'mu-visualizado', label: 'Conteúdo visualizado', bg: '#EAEBBD', text: '#3D4011', border: '#C8C978' },
  { id: 'mu-aprovado', label: 'Conteúdo aprovado', bg: '#DAD994', text: '#2F1534', border: '#BDBF6A' },
  { id: 'mu-recusado', label: 'Conteúdo recusado', bg: '#FDF0E8', text: '#C2410C', border: '#F5B89B' },
  { id: 'mu-precisa-revisao', label: 'Conteúdo precisa de revisão', bg: '#FDF0E8', text: '#E1754C', border: '#F2A98A' },
  { id: 'mu-revisado', label: 'Conteúdo revisado', bg: '#F3ECF9', text: '#7A689C', border: '#BC9FE6' },
  { id: 'mu-referencias', label: 'Referências analisadas', bg: '#F3ECF9', text: '#6D28D9', border: '#C7B0EB' },
  { id: 'mu-material-recebido', label: 'Material recebido', bg: '#FCF6EC', text: '#2F1534', border: '#E8D7B8' },
  { id: 'mu-aprovacao-enviada', label: 'Aprovação enviada', bg: '#FDF2F6', text: '#EC2B82', border: '#F4A6C5' },
  { id: 'mu-aguardando-aprovacao', label: 'Aguardando aprovação', bg: '#FDF2F6', text: '#BE185D', border: '#EC97B7' },
  { id: 'mu-salvando-arquivos', label: 'Salvando arquivos', bg: '#FCF6EC', text: '#6E7B48', border: '#D7D89E' },
  { id: 'mu-arquivos-drive', label: 'Arquivos disponíveis no Drive', bg: '#EAEBBD', text: '#2F1534', border: '#C8C978' },
  { id: 'mu-aguardando-retorno', label: 'Aguardando retorno do cliente', bg: '#F4F1F8', text: '#2F1534', border: '#BC9FE6' },
];

const MINI_UPDATE_COLOR_PRESETS = [
  { name: 'Verde oliva', bg: '#EAEBBD', text: '#3D4011', border: '#C8C978' },
  { name: 'Pink Aumi', bg: '#FDF2F6', text: '#EC2B82', border: '#F4A6C5' },
  { name: 'Lilás', bg: '#F3ECF9', text: '#7A689C', border: '#BC9FE6' },
  { name: 'Coral', bg: '#FDF0E8', text: '#E1754C', border: '#F2A98A' },
  { name: 'Creme', bg: '#FCF6EC', text: '#2F1534', border: '#E8D7B8' },
  { name: 'Roxo grafite', bg: '#F4F1F8', text: '#2F1534', border: '#BC9FE6' },
];

function formatMiniUpdateDateTime(iso?: string | null, includeYear = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return includeYear ? `${dd}/${mm}/${yyyy} · ${hh}:${min}` : `${dd}/${mm} · ${hh}:${min}`;
}

function getAutoColumnStage(colTitle: string): {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  isConcluido: boolean;
} {
  const lower = (colTitle || '').toLowerCase();
  if (lower.includes('conclu')) {
    return {
      label: 'Concluído',
      bg: '#EAEBBD',
      text: '#3D4011',
      border: 'rgba(176, 178, 90, 0.55)',
      dot: '#B8BA5F',
      isConcluido: true,
    };
  }
  if (lower.includes('aprova')) {
    return {
      label: 'Aprovação',
      bg: '#F3ECF9',
      text: '#6D28D9',
      border: 'rgba(188, 159, 230, 0.55)',
      dot: '#BC9FE6',
      isConcluido: false,
    };
  }
  if (lower.includes('produ')) {
    return {
      label: 'Em produção',
      bg: '#FDF2F6',
      text: '#EC2B82',
      border: 'rgba(236, 151, 183, 0.55)',
      dot: '#EC2B82',
      isConcluido: false,
    };
  }
  if (lower.includes('comece')) {
    return {
      label: 'Comece aqui',
      bg: '#F3ECF9',
      text: '#7A689C',
      border: 'rgba(122, 104, 156, 0.35)',
      dot: '#7A689C',
      isConcluido: false,
    };
  }
  return {
    label: colTitle || 'Em andamento',
    bg: '#FAF7FC',
    text: '#7A689C',
    border: 'rgba(188, 159, 230, 0.4)',
    dot: '#7A689C',
    isConcluido: false,
  };
}

function stripHtmlBasic(raw?: string | null): string {
  if (!raw) return '';
  return raw.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

function hasCardContent(card: Card): boolean {
  if (stripHtmlBasic(card.description).length > 0) return true;
  if (stripHtmlBasic(card.copy_text).length > 0) return true;
  if (stripHtmlBasic(card.references_text).length > 0) return true;
  if (stripHtmlBasic(card.extra_notes).length > 0) return true;
  if (stripHtmlBasic(card.submitted_content?.text).length > 0) return true;
  if (stripHtmlBasic(card.submitted_content?.notes).length > 0) return true;
  if (
    card.submitted_content?.answers &&
    Object.values(card.submitted_content.answers).some((v) => stripHtmlBasic(v).length > 0)
  ) {
    return true;
  }
  if (Array.isArray(card.links) && card.links.length > 0) return true;
  return false;
}

function formatDueBadge(dateStr?: string | null): { text: string; tone: 'today' | 'tomorrow' | 'normal' } {
  if (!dateStr) return { text: '', tone: 'normal' };
  const clean = dateStr.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (clean === today) return { text: 'Hoje', tone: 'today' };
  if (clean === tomorrow) return { text: 'Amanhã', tone: 'tomorrow' };
  const parts = clean.split('-');
  if (parts.length === 3) return { text: `${parts[2]}/${parts[1]}`, tone: 'normal' };
  return { text: formatShortDateBR(clean), tone: 'normal' };
}

function getCardServiceIcon(card: Card, isDone: boolean) {
  if (isDone) {
    return (
      <div className="w-9 h-9 rounded-xl bg-[#DAD994]/85 text-[#3D4011] border border-[#C8C978]/70 flex items-center justify-center shrink-0">
        <CheckCircle2 className="w-4.5 h-4.5" />
      </div>
    );
  }
  const s = `${card.service_name} ${card.title}`.toLowerCase();
  if (s.includes('identidade') || s.includes('logo') || s.includes('marca') || s.includes('palette')) {
    return (
      <div className="w-9 h-9 rounded-xl bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center shrink-0">
        <Palette className="w-4 h-4" />
      </div>
    );
  }
  if (s.includes('embalagem') || s.includes('3d') || s.includes('caixa')) {
    return (
      <div className="w-9 h-9 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
        <Box className="w-4 h-4" />
      </div>
    );
  }
  if (s.includes('copy') || s.includes('roteiro') || s.includes('texto')) {
    return (
      <div className="w-9 h-9 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
        <FileEdit className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded-xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center shrink-0">
      <ImageIcon className="w-4 h-4" />
    </div>
  );
}

export function KanbanBoardView({
  boardId,
  user,
  partners = [],
  folders = [],
  settings = null,
  availableLabels,
  mode = 'partner',
  embedded = false,
  initialOpenCardId = null,
  portalDefaults,
  externalFilters,
  openAccessTrigger = 0,
  openSettingsTrigger = 0,
  openNewColumnTrigger = 0,
  onBack,
  onPreviewClientPortal,
  onCardAction,
  onOpenCalendar,
  onViewAllDemands,
  onLabelsUpdated,
}: KanbanBoardViewProps) {
  const isClient = mode === 'client';

  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [studioLabels, setStudioLabels] = useState<StudioLabelItem[]>(
    availableLabels || (settings?.labels as StudioLabelItem[]) || []
  );
  const [loading, setLoading] = useState(true);

  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [openAdjustmentDirectly, setOpenAdjustmentDirectly] = useState(false);

  // Filters (for standalone / unfiltered mode)
  const [search, setSearch] = useState('');
  const [filterLead, setFilterLead] = useState('all');
  const [filterService, setFilterService] = useState('all');
  const [filterLabel, setFilterLabel] = useState('all');

  // Quick card "..." menu & inline checklist popover
  const [cardMenuId, setCardMenuId] = useState<string | null>(null);
  const [checklistPopoverCardId, setChecklistPopoverCardId] = useState<string | null>(null);
  const [inlineCheckInput, setInlineCheckInput] = useState('');
  const [savingInlineCheck, setSavingInlineCheck] = useState(false);

  // Card mini-updates state & customization modal
  const [cardMiniUpdateOptions, setCardMiniUpdateOptions] = useState<CardMiniUpdateOption[]>(
    settings?.card_mini_updates?.length ? settings.card_mini_updates : DEFAULT_MINI_UPDATE_OPTIONS
  );
  const [sendingMiniUpdateKey, setSendingMiniUpdateKey] = useState<string | null>(null);
  const [expandedClientUpdatesCardId, setExpandedClientUpdatesCardId] = useState<Record<string, boolean>>({});
  const [miniUpdateModalOpen, setMiniUpdateModalOpen] = useState(false);
  const [miniUpdateModalTab, setMiniUpdateModalTab] = useState<'send' | 'manage'>('send');
  const [miniUpdateTargetCard, setMiniUpdateTargetCard] = useState<Card | null>(null);
  const [customUpdateText, setCustomUpdateText] = useState('');
  const [customUpdateColorIdx, setCustomUpdateColorIdx] = useState(1);
  const [saveCustomAsOption, setSaveCustomAsOption] = useState(false);
  const [submittingCustomUpdate, setSubmittingCustomUpdate] = useState(false);
  const [newOptionLabel, setNewOptionLabel] = useState('');
  const [newOptionColorIdx, setNewOptionColorIdx] = useState(2);
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [editingOptionLabel, setEditingOptionLabel] = useState('');
  const [editingOptionColorIdx, setEditingOptionColorIdx] = useState(0);
  const [savingOptions, setSavingOptions] = useState(false);

  // Board Access & Invite Modal
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const [accessInfo, setAccessInfo] = useState<BoardAccessInfo | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteShared, setInviteShared] = useState(true);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copiedBoardLink, setCopiedBoardLink] = useState(false);

  // Drag state
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Column controls
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#7A689C');
  const [newColumnCover, setNewColumnCover] = useState<string | null>(null);

  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColTitle, setEditingColTitle] = useState('');
  const [colMenuId, setColMenuId] = useState<string | null>(null);
  const [colCoverTarget, setColCoverTarget] = useState<BoardColumn | null>(null);
  const [colCoverDraft, setColCoverDraft] = useState<string | null>(null);
  const [colColorDraft, setColColorDraft] = useState('#7A689C');
  const [uploadingColCover, setUploadingColCover] = useState(false);

  // Quick add card (partners + clients)
  const [addingCardColId, setAddingCardColId] = useState<string | null>(null);
  const [quickCardTitle, setQuickCardTitle] = useState('');
  const [quickCardService, setQuickCardService] = useState('');
  const [creatingCard, setCreatingCard] = useState(false);

  // Board settings modal
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState<'draft' | 'active' | 'completed' | 'archived'>('active');
  const [editShared, setEditShared] = useState(true);
  const [editFolderId, setEditFolderId] = useState('');
  const [editDeadline, setEditDeadline] = useState('');

  useEffect(() => {
    if (availableLabels) {
      setStudioLabels(availableLabels);
    } else if (settings?.labels) {
      setStudioLabels(settings.labels as StudioLabelItem[]);
    }
  }, [availableLabels, settings?.labels]);

  useEffect(() => {
    if (settings?.card_mini_updates?.length) {
      setCardMiniUpdateOptions(settings.card_mini_updates);
    }
  }, [settings?.card_mini_updates]);

  async function loadBoard(notifyParent = false) {
    try {
      const [res, lblRes, muRes] = await Promise.all([
        api<{ board: Board; columns: BoardColumn[]; cards: Card[] }>(`/boards/${boardId}`),
        api<{ labels: StudioLabelItem[] }>('/labels').catch(() => ({ labels: [] })),
        api<{ options: CardMiniUpdateOption[] }>('/card-mini-updates').catch(() => ({ options: [] })),
      ]);
      setBoard(res.board);
      setColumns(res.columns);
      setCards(res.cards);
      if (lblRes.labels?.length && !availableLabels) {
        setStudioLabels(lblRes.labels);
      }
      if (muRes.options?.length) {
        setCardMiniUpdateOptions(muRes.options);
      }

      setEditTitle(res.board.title);
      setEditStatus(res.board.status);
      setEditShared(res.board.shared_with_client);
      setEditFolderId(res.board.folder_id || '');
      setEditDeadline(res.board.deadline || '');

      if (selectedCard) {
        const refreshed = res.cards.find((c) => c.id === selectedCard.id) || null;
        setSelectedCard(refreshed);
      } else if (initialOpenCardId) {
        const initialCard = res.cards.find((c) => c.id === initialOpenCardId) || null;
        if (initialCard) setSelectedCard(initialCard);
      }

      if (notifyParent) {
        onCardAction?.();
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedCard(null);
    loadBoard(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, mode]);

  useEffect(() => {
    if (openAccessTrigger > 0 && !isClient) {
      handleOpenAccessModal();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAccessTrigger]);

  useEffect(() => {
    if (openSettingsTrigger > 0 && !isClient) {
      setBoardSettingsOpen(true);
    }
  }, [openSettingsTrigger, isClient]);

  useEffect(() => {
    if (openNewColumnTrigger > 0 && !isClient) {
      setNewColumnOpen(true);
    }
  }, [openNewColumnTrigger, isClient]);

  async function handleOpenAccessModal() {
    setInviteError('');
    setInvitePassword('');
    setAccessModalOpen(true);
    try {
      const res = await api<{ access: BoardAccessInfo }>(`/boards/${boardId}/access`);
      setAccessInfo(res.access);
      setInviteEmail(res.access.client_email || '');
      setInviteShared(res.access.shared_with_client);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao carregar informações de acesso.');
    }
  }

  async function handleSaveInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteSaving(true);
    try {
      await api(`/boards/${boardId}/invite`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'invite',
          email: inviteEmail.trim(),
          password: invitePassword.trim() || undefined,
          shared_with_client: inviteShared,
        }),
      });
      const res = await api<{ access: BoardAccessInfo }>(`/boards/${boardId}/access`);
      setAccessInfo(res.access);
      setInvitePassword('');
      await loadBoard(true);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao salvar acesso do cliente.');
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleRevokeInvite() {
    setInviteError('');
    setInviteSaving(true);
    try {
      await api(`/boards/${boardId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ action: 'revoke' }),
      });
      const res = await api<{ access: BoardAccessInfo }>(`/boards/${boardId}/access`);
      setAccessInfo(res.access);
      setInviteShared(false);
      await loadBoard(true);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao revogar acesso.');
    } finally {
      setInviteSaving(false);
    }
  }

  async function handleMoveCard(cardId: string, targetColId: string) {
    if (isClient) return;
    setCardMenuId(null);
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, column_id: targetColId } : c)));
    await api(`/cards/${cardId}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ column_id: targetColId }),
    });
    await loadBoard(true);
  }

  async function handleQuickMarkRead(card: Card, nextRead?: boolean) {
    if (isClient) return;
    setCardMenuId(null);
    const targetRead = nextRead ?? !Boolean(card.read_at);
    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id
          ? {
              ...c,
              read_at: targetRead ? new Date().toISOString() : null,
              read_by_id: targetRead ? user.id : null,
              read_by_name: targetRead ? user.name : null,
            }
          : c
      )
    );
    await api(`/cards/${card.id}/mark-read`, {
      method: 'POST',
      body: JSON.stringify({ read: targetRead }),
    });
    await loadBoard(true);
  }

  async function handleToggleInlineCheckItem(card: Card, itemId: string) {
    if (savingInlineCheck) return;
    const nextChecklist = (card.checklist || []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, checklist: nextChecklist } : c))
    );
    setSavingInlineCheck(true);
    try {
      await api(`/cards/${card.id}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ checklist: nextChecklist }),
      });
      await loadBoard(true);
    } finally {
      setSavingInlineCheck(false);
    }
  }

  async function handleAddInlineCheckItem(card: Card) {
    if (!inlineCheckInput.trim() || savingInlineCheck) return;
    const nextChecklist = [
      ...(card.checklist || []),
      { id: `chk-${Date.now().toString(36)}`, text: inlineCheckInput.trim(), done: false },
    ];
    setInlineCheckInput('');
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, checklist: nextChecklist } : c))
    );
    setSavingInlineCheck(true);
    try {
      await api(`/cards/${card.id}/checklist`, {
        method: 'PATCH',
        body: JSON.stringify({ checklist: nextChecklist }),
      });
      await loadBoard(true);
    } finally {
      setSavingInlineCheck(false);
    }
  }

  async function handleQuickComplete(card: Card) {
    if (isClient) return;
    setCardMenuId(null);
    await api(`/cards/${card.id}/complete`, { method: 'POST' });
    await loadBoard(true);
  }

  async function handleQuickToggleVisibility(card: Card) {
    if (isClient) return;
    setCardMenuId(null);
    await api(`/cards/${card.id}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ client_visible: !card.client_visible }),
    });
    await loadBoard(true);
  }

  async function handleQuickAddCard(colId: string) {
    if (!quickCardTitle.trim() || creatingCard) return;
    setCreatingCard(true);
    try {
      const matchedSvc = board?.selected_services?.find((s) => s.service_name === quickCardService);
      const res = await api<{ card: Card }>(`/boards/${boardId}/cards`, {
        method: 'POST',
        body: JSON.stringify({
          column_id: colId,
          title: quickCardTitle.trim(),
          service_id: matchedSvc?.service_id || null,
          service_name: quickCardService || board?.selected_services?.[0]?.service_name || '',
          lead_user_id: board?.lead_user_id || user.id,
        }),
      });
      setQuickCardTitle('');
      setQuickCardService('');
      setAddingCardColId(null);
      await loadBoard(true);
      if (res.card) {
        setOpenAdjustmentDirectly(false);
        setSelectedCard(res.card);
      }
    } finally {
      setCreatingCard(false);
    }
  }

  async function handleAddColumn(e: React.FormEvent) {
    e.preventDefault();
    if (!newColumnTitle.trim() || isClient) return;
    await api(`/boards/${boardId}/columns`, {
      method: 'POST',
      body: JSON.stringify({
        title: newColumnTitle.trim(),
        color: newColumnColor,
        cover_url: newColumnCover,
      }),
    });
    setNewColumnTitle('');
    setNewColumnCover(null);
    setNewColumnOpen(false);
    await loadBoard(false);
  }

  async function handleRenameColumn(colId: string) {
    if (!editingColTitle.trim() || isClient) return;
    await api(`/columns/${colId}`, {
      method: 'PUT',
      body: JSON.stringify({ title: editingColTitle.trim(), client_label: editingColTitle.trim() }),
    });
    setEditingColId(null);
    await loadBoard(false);
  }

  async function handleSaveColumnAppearance(e: React.FormEvent) {
    e.preventDefault();
    if (!colCoverTarget || isClient) return;
    await api(`/columns/${colCoverTarget.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        cover_url: colCoverDraft,
        color: colColorDraft,
      }),
    });
    setColCoverTarget(null);
    await loadBoard(false);
  }

  async function handleToggleColClientVisible(col: BoardColumn) {
    await api(`/columns/${col.id}`, {
      method: 'PUT',
      body: JSON.stringify({ client_visible: !col.client_visible }),
    });
    setColMenuId(null);
    await loadBoard(false);
  }

  async function handleDeleteColumn(col: BoardColumn) {
    if (isClient || columns.filter((c) => !c.archived).length <= 1) return;
    await api(`/columns/${col.id}`, { method: 'DELETE' });
    setColMenuId(null);
    await loadBoard(true);
  }

  async function handleMoveColumnOrder(colId: string, direction: -1 | 1) {
    const activeCols = columns.filter((c) => !c.archived);
    const idx = activeCols.findIndex((c) => c.id === colId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= activeCols.length) return;
    const reordered = [...activeCols];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, moved);
    const allIds = [...reordered.map((c) => c.id), ...columns.filter((c) => c.archived).map((c) => c.id)];
    await api(`/boards/${boardId}/columns/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ column_ids: allIds }),
    });
    setColMenuId(null);
    await loadBoard(false);
  }

  async function handleSaveBoardSettings(e: React.FormEvent) {
    e.preventDefault();
    await api(`/boards/${boardId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: editTitle.trim(),
        status: editStatus,
        shared_with_client: editShared,
        visibility: editShared ? 'shared' : 'internal',
        folder_id: editFolderId || null,
        deadline: editDeadline || null,
      }),
    });
    setBoardSettingsOpen(false);
    await loadBoard(true);
  }

  async function handleDeleteBoard() {
    await api(`/boards/${boardId}`, { method: 'DELETE' });
    onBack?.();
  }

  async function handleSendCardMiniUpdate(
    card: Card,
    payload: { label: string; option_id?: string | null; bg: string; text: string }
  ) {
    if (isClient) return;
    const key = `${card.id}:${payload.option_id || payload.label}`;
    setSendingMiniUpdateKey(key);
    try {
      const res = await api<{
        ok: boolean;
        update: CardMiniUpdateRecord;
        mini_updates: CardMiniUpdateRecord[];
        history: Card['history'];
      }>(`/cards/${card.id}/mini-updates`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCards((prev) =>
        prev.map((c) =>
          c.id === card.id
            ? { ...c, mini_updates: res.mini_updates, history: res.history || c.history }
            : c
        )
      );
      if (selectedCard?.id === card.id) {
        setSelectedCard((prev) =>
          prev ? { ...prev, mini_updates: res.mini_updates, history: res.history || prev.history } : prev
        );
      }
      onCardAction?.();
    } finally {
      setSendingMiniUpdateKey(null);
    }
  }

  async function handleRemoveCardMiniUpdate(cardId: string, updateId: string) {
    if (isClient) return;
    const res = await api<{
      ok: boolean;
      mini_updates: CardMiniUpdateRecord[];
      history: Card['history'];
    }>(`/cards/${cardId}/mini-updates/${updateId}`, {
      method: 'DELETE',
    });
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId
          ? { ...c, mini_updates: res.mini_updates, history: res.history || c.history }
          : c
      )
    );
    if (selectedCard?.id === cardId) {
      setSelectedCard((prev) =>
        prev ? { ...prev, mini_updates: res.mini_updates, history: res.history || prev.history } : prev
      );
    }
    onCardAction?.();
  }

  async function persistMiniUpdateOptions(nextOptions: CardMiniUpdateOption[]) {
    setSavingOptions(true);
    try {
      const res = await api<{ ok: boolean; options: CardMiniUpdateOption[] }>('/card-mini-updates', {
        method: 'PUT',
        body: JSON.stringify({ options: nextOptions }),
      });
      setCardMiniUpdateOptions(res.options);
    } finally {
      setSavingOptions(false);
    }
  }

  function openMiniUpdateModal(card: Card | null, tab: 'send' | 'manage') {
    setMiniUpdateTargetCard(card);
    setMiniUpdateModalTab(tab);
    setCustomUpdateText('');
    setCustomUpdateColorIdx(1);
    setSaveCustomAsOption(false);
    setEditingOptionId(null);
    setNewOptionLabel('');
    setMiniUpdateModalOpen(true);
  }

  async function handleSubmitCustomMiniUpdate(e: React.FormEvent) {
    e.preventDefault();
    const label = customUpdateText.trim();
    if (!label || !miniUpdateTargetCard) return;
    const tone = MINI_UPDATE_COLOR_PRESETS[customUpdateColorIdx] || MINI_UPDATE_COLOR_PRESETS[0];
    setSubmittingCustomUpdate(true);
    try {
      let createdOptionId: string | null = null;
      if (saveCustomAsOption) {
        const exists = cardMiniUpdateOptions.find(
          (o) => o.label.toLowerCase() === label.toLowerCase()
        );
        if (exists) {
          createdOptionId = exists.id;
        } else {
          const newOpt: CardMiniUpdateOption = {
            id: `mu-${Date.now()}`,
            label,
            bg: tone.bg,
            text: tone.text,
            border: tone.border,
          };
          createdOptionId = newOpt.id;
          await persistMiniUpdateOptions([...cardMiniUpdateOptions, newOpt]);
        }
      }
      await handleSendCardMiniUpdate(miniUpdateTargetCard, {
        label,
        option_id: createdOptionId,
        bg: tone.bg,
        text: tone.text,
      });
      setCustomUpdateText('');
      setSaveCustomAsOption(false);
      setMiniUpdateModalOpen(false);
    } finally {
      setSubmittingCustomUpdate(false);
    }
  }

  async function handleAddReusableOption(e: React.FormEvent) {
    e.preventDefault();
    const label = newOptionLabel.trim();
    if (!label) return;
    const tone = MINI_UPDATE_COLOR_PRESETS[newOptionColorIdx] || MINI_UPDATE_COLOR_PRESETS[2];
    const next: CardMiniUpdateOption[] = [
      ...cardMiniUpdateOptions,
      {
        id: `mu-${Date.now()}`,
        label,
        bg: tone.bg,
        text: tone.text,
        border: tone.border,
      },
    ];
    setNewOptionLabel('');
    await persistMiniUpdateOptions(next);
  }

  async function handleSaveEditedOption(optionId: string) {
    const label = editingOptionLabel.trim();
    if (!label) return;
    const tone = MINI_UPDATE_COLOR_PRESETS[editingOptionColorIdx] || MINI_UPDATE_COLOR_PRESETS[0];
    const next = cardMiniUpdateOptions.map((o) =>
      o.id === optionId ? { ...o, label, bg: tone.bg, text: tone.text, border: tone.border } : o
    );
    setEditingOptionId(null);
    await persistMiniUpdateOptions(next);
  }

  async function handleDeleteReusableOption(optionId: string) {
    const next = cardMiniUpdateOptions.filter((o) => o.id !== optionId);
    await persistMiniUpdateOptions(next);
  }

  if (loading || !board) {
    return <div className="h-80 rounded-3xl bg-white/60 border border-[#BC9FE6]/25 animate-pulse" />;
  }

  const visibleColumns = columns.filter(
    (c) => !c.archived && !c.title.toLowerCase().includes('altera')
  );
  const completedColIds = new Set(
    columns
      .filter(
        (c) =>
          c.title.toLowerCase().includes('conclu') || (c.client_label || '').toLowerCase().includes('conclu')
      )
      .map((c) => c.id)
  );

  const effectiveSearch = externalFilters?.search ?? search;
  const effectiveLead = externalFilters?.lead ?? filterLead;
  const effectiveService = externalFilters?.service ?? filterService;
  const effectiveLabel = externalFilters?.label ?? filterLabel;

  const uniqueServices = Array.from(new Set(cards.map((c) => c.service_name).filter(Boolean)));
  const uniqueLabels = Array.from(new Set(cards.flatMap((c) => c.labels || [])));

  const filteredCards = cards.filter((card) => {
    const q = effectiveSearch.trim().toLowerCase();
    if (
      q &&
      !card.title.toLowerCase().includes(q) &&
      !card.description.toLowerCase().includes(q) &&
      !(card.service_name || '').toLowerCase().includes(q)
    ) {
      return false;
    }
    if (!isClient && effectiveLead !== 'all' && card.lead_user_id !== effectiveLead && card.collaborator_user_id !== effectiveLead) {
      return false;
    }
    if (effectiveService !== 'all' && card.service_name !== effectiveService) return false;
    if (effectiveLabel !== 'all' && !(card.labels || []).includes(effectiveLabel)) return false;
    if (externalFilters?.onlyUnread && (card.content_status !== 'submitted' || Boolean(card.read_at))) return false;
    return true;
  });

  const shareUrl =
    accessInfo?.share_token && typeof window !== 'undefined'
      ? `${window.location.origin}/?board=${accessInfo.share_token}`
      : '';

  const serviceOptions = Array.from(
    new Set([
      ...(board.selected_services || []).map((s) => s.service_name).filter(Boolean),
      ...uniqueServices,
    ])
  );

  return (
    <div className="space-y-4">
      {/* Standalone Header when not embedded inside ProjectPortalShell */}
      {!embedded && (
        <div className="rounded-3xl bg-white/90 border border-[#BC9FE6]/30 p-4 sm:p-5 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3 py-2 rounded-xl bg-[#FAF7FC] border border-black/10 hover:bg-white text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5 shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar</span>
                </button>
              )}
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-[#2F1534] truncate">{board.title}</h2>
                {board.description && <p className="text-xs text-[#232122]/60 truncate">{board.description}</p>}
              </div>
            </div>

            {!isClient && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenAccessModal}
                  className="px-3.5 py-2 rounded-xl bg-white border border-black/10 hover:border-[#7A689C] text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>Acesso do cliente</span>
                </button>
                {board.shared_with_client && onPreviewClientPortal && (
                  <button
                    type="button"
                    onClick={() => onPreviewClientPortal(board.client_id)}
                    className="px-3.5 py-2 rounded-xl bg-[#FDF2F6] hover:bg-[#EC2B82] text-[#EC2B82] hover:text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Visão do cliente</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNewColumnOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-[#F3ECF9] hover:bg-[#E7DCF6] text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova coluna</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBoardSettingsOpen(true)}
                  className="p-2 rounded-xl bg-white border border-black/10 hover:bg-[#FAF7FC] text-[#232122]/70"
                  title="Configurações do quadro"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-black/[0.06] flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="w-3.5 h-3.5 text-[#232122]/40 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar demandas..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs focus:outline-none focus:border-[#EC2B82]"
              />
            </div>
            {!isClient && (
              <select
                value={filterLead}
                onChange={(e) => setFilterLead(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs"
              >
                <option value="all">Todas responsáveis</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {uniqueServices.length > 0 && (
              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs"
              >
                <option value="all">Todos serviços</option>
                {uniqueServices.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            {uniqueLabels.length > 0 && (
              <select
                value={filterLabel}
                onChange={(e) => setFilterLabel(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs"
              >
                <option value="all">Todas etiquetas</option>
                {uniqueLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Embedded Header matching Reference Image 2: "Quadros do projeto" + "Ver calendário >" */}
      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FDF2F6] border border-[#EC97B7]/40 text-[#EC2B82] flex items-center justify-center shrink-0">
              <Columns className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[17px] font-bold text-[#2F1534] leading-tight">Quadros do projeto</h3>
              <p className="text-xs text-[#232122]/55">Demandas organizadas por etapas</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isClient && (
              <button
                type="button"
                onClick={() => setNewColumnOpen(true)}
                className="px-3 py-2 rounded-xl bg-white border border-[#BC9FE6]/35 hover:border-[#EC2B82] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#EC2B82]" />
                <span>Nova coluna</span>
              </button>
            )}
            {onOpenCalendar && (
              <button
                type="button"
                onClick={onOpenCalendar}
                className="px-3.5 py-2 rounded-xl bg-white border border-[#BC9FE6]/35 hover:border-[#7A689C] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Calendar className="w-3.5 h-3.5 text-[#7A689C]" />
                <span>Ver calendário</span>
                <ChevronRight className="w-3.5 h-3.5 text-[#232122]/45" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 5-Column (or N-Column) Responsive Board without cramping/overlaps */}
      <div
        className={
          visibleColumns.length <= 4
            ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5 items-start'
            : 'flex gap-3.5 overflow-x-auto pb-4 items-start'
        }
      >
        {visibleColumns.map((col, colIdx) => {
          const colCards = filteredCards.filter((c) => c.column_id === col.id);
          const isDropTarget = !isClient && dragOverColId === col.id;
          const displayColTitle = isClient ? col.client_label || col.title : col.title;
          const isDoneCol = completedColIds.has(col.id);
          const colStage = getAutoColumnStage(col.title);

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                if (isClient) return;
                e.preventDefault();
                setDragOverColId(col.id);
              }}
              onDragLeave={() => {
                if (!isClient) setDragOverColId(null);
              }}
              onDrop={(e) => {
                if (isClient) return;
                e.preventDefault();
                setDragOverColId(null);
                if (draggedCardId) {
                  handleMoveCard(draggedCardId, col.id);
                  setDraggedCardId(null);
                }
              }}
              className={`${
                visibleColumns.length <= 4
                  ? 'w-full min-w-0'
                  : 'w-[272px] xl:w-[282px] 2xl:flex-1 2xl:min-w-[252px] shrink-0'
              } rounded-[20px] border transition-all overflow-visible flex flex-col ${
                isDropTarget
                  ? 'bg-[#FDF2F6] border-[#EC2B82] shadow-md'
                  : colStage.isConcluido
                  ? 'bg-[#F5F5DC]/90 border-[#C8C978]/70 shadow-[0_6px_22px_rgba(200,201,120,0.22)]'
                  : 'bg-[#FAF6FD]/90 border-[#BC9FE6]/28 shadow-[0_6px_22px_rgba(47,21,52,0.04)]'
              }`}
            >
              {/* Optional Column Cover Banner (ONLY columns have covers, NEVER cards) */}
              {col.cover_url && (
                <div className="h-16 w-full rounded-t-[20px] overflow-hidden relative border-b border-black/[0.06]">
                  <img
                    src={col.cover_url}
                    alt={displayColTitle}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#2F1534]/25 to-transparent" />
                </div>
              )}

              <div className="p-3 flex flex-col gap-2.5">
                {/* Column Header */}
                <div className="flex items-center justify-between gap-2 px-1 relative">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.color || '#7A689C' }}
                    />
                    {!isClient && editingColId === col.id ? (
                      <input
                        type="text"
                        autoFocus
                        value={editingColTitle}
                        onChange={(e) => setEditingColTitle(e.target.value)}
                        onBlur={() => handleRenameColumn(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameColumn(col.id);
                          if (e.key === 'Escape') setEditingColId(null);
                        }}
                        className="w-full px-2 py-0.5 rounded bg-white border border-[#EC2B82] text-xs font-bold text-[#2F1534]"
                      />
                    ) : isClient ? (
                      <span className="text-[14px] font-bold text-[#2F1534] truncate">{displayColTitle}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingColId(col.id);
                          setEditingColTitle(col.title);
                        }}
                        className="text-[14px] font-bold text-[#2F1534] truncate text-left hover:text-[#EC2B82]"
                        title="Clique para renomear coluna"
                      >
                        {displayColTitle}
                      </button>
                    )}

                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#EFE7FA] text-[#7A689C] text-[11px] font-bold inline-flex items-center justify-center tabular-nums shrink-0">
                      {colCards.length}
                    </span>
                  </div>

                  {!isClient && (
                    <div className="flex items-center gap-1 shrink-0">
                      {!col.client_visible && (
                        <span title="Coluna oculta do cliente" className="text-[#7A689C]">
                          <EyeOff className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setColMenuId(colMenuId === col.id ? null : col.id)}
                        className="p-1 rounded-lg text-[#232122]/45 hover:text-[#2F1534] hover:bg-white/80"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {!isClient && colMenuId === col.id && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setColMenuId(null)} />
                      <div className="absolute right-0 top-8 w-52 rounded-2xl bg-white border border-[#BC9FE6]/35 shadow-xl z-30 py-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingColId(col.id);
                            setEditingColTitle(col.title);
                            setColMenuId(null);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] font-medium text-[#2F1534]"
                        >
                          Renomear coluna
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setColCoverTarget(col);
                            setColCoverDraft(col.cover_url || null);
                            setColColorDraft(col.color || '#7A689C');
                            setColMenuId(null);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] flex items-center gap-2 font-medium text-[#2F1534]"
                        >
                          <Palette className="w-3.5 h-3.5 text-[#EC2B82]" />
                          Capa &amp; cor da coluna
                        </button>
                        {colIdx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, -1)}
                            className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] flex items-center gap-2 text-[#232122]/80"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Mover para esquerda
                          </button>
                        )}
                        {colIdx < visibleColumns.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveColumnOrder(col.id, 1)}
                            className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] flex items-center gap-2 text-[#232122]/80"
                          >
                            <ChevronRight className="w-3.5 h-3.5" /> Mover para direita
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleColClientVisible(col)}
                          className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] flex items-center gap-2 text-[#232122]/80"
                        >
                          {col.client_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          {col.client_visible ? 'Ocultar do cliente' : 'Mostrar ao cliente'}
                        </button>
                        {visibleColumns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteColumn(col)}
                            className="w-full text-left px-3.5 py-2 hover:bg-red-50 flex items-center gap-2 text-red-600 font-medium"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Excluir coluna
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Cards List (NO covers on cards) */}
                <div className="space-y-2.5">
                  {colCards.map((card) => {
                    const lead = partners.find((p) => p.id === card.lead_user_id);
                    const collab = partners.find((p) => p.id === card.collaborator_user_id);
                    const dueBadge = formatDueBadge(card.due_date);
                    const isUnreadSubmission =
                      !isClient && card.content_status === 'submitted' && !card.read_at;
                    const cardDone = isDoneCol || card.approval_status === 'approved';

                    return (
                      <div
                        key={card.id}
                        draggable={!isClient}
                        onDragStart={() => {
                          if (!isClient) setDraggedCardId(card.id);
                        }}
                        onDragEnd={() => {
                          setDraggedCardId(null);
                          setDragOverColId(null);
                        }}
                        onClick={() => {
                          setOpenAdjustmentDirectly(false);
                          setSelectedCard(card);
                        }}
                        className={`group relative rounded-2xl border p-3.5 space-y-2.5 cursor-pointer transition-all shadow-[0_2px_10px_rgba(47,21,52,0.03)] hover:shadow-md ${
                          cardDone
                            ? 'bg-[#FAFBE8] border-[#C8C978]/75 hover:border-[#B0B25A]'
                            : 'bg-white border-[#2F1534]/[0.07] hover:border-[#EC97B7]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {getCardServiceIcon(card, isDoneCol)}

                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-bold text-[#2F1534] leading-snug line-clamp-2">
                              {card.title}
                            </p>
                            {card.service_name && (
                              <p className="text-[11.5px] text-[#7A689C] font-medium truncate mt-0.5">
                                {card.service_name}
                              </p>
                            )}
                          </div>

                          {/* Card "..." quick action menu */}
                          {!isClient && (
                            <div
                              className="relative shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => setCardMenuId(cardMenuId === card.id ? null : card.id)}
                                className="p-1 rounded-lg text-[#232122]/35 hover:text-[#2F1534] hover:bg-[#FAF7FC]"
                                title="Ações rápidas"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>

                              {cardMenuId === card.id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setCardMenuId(null)}
                                  />
                                  <div className="absolute right-0 top-7 w-52 rounded-2xl bg-white border border-[#BC9FE6]/40 shadow-xl z-30 py-1.5 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCardMenuId(null);
                                        setOpenAdjustmentDirectly(false);
                                        setSelectedCard(card);
                                      }}
                                      className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] font-semibold text-[#2F1534]"
                                    >
                                      Abrir detalhes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickMarkRead(card, !Boolean(card.read_at))}
                                      className="w-full text-left px-3.5 py-2 hover:bg-[#F5F5DC] flex items-center gap-2 text-[#3D4011] font-medium"
                                    >
                                      {card.read_at ? <Check className="w-3.5 h-3.5 text-[#3D4011]" /> : <BookOpenCheck className="w-3.5 h-3.5" />}
                                      {card.read_at ? 'Desmarcar visualização' : 'Marcar como visto'}
                                    </button>
                                    {!isDoneCol && (
                                      <button
                                        type="button"
                                        onClick={() => handleQuickComplete(card)}
                                        className="w-full text-left px-3.5 py-2 hover:bg-[#F5F5DC] flex items-center gap-2 text-[#3D4011] font-semibold"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        Marcar como concluída
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCardMenuId(null);
                                        setOpenAdjustmentDirectly(true);
                                        setSelectedCard(card);
                                      }}
                                      className="w-full text-left px-3.5 py-2 hover:bg-[#FDF2F6] flex items-center gap-2 text-[#EC2B82] font-semibold"
                                    >
                                      <MessageSquarePlus className="w-3.5 h-3.5" />
                                      Solicitar ajuste
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleQuickToggleVisibility(card)}
                                      className="w-full text-left px-3.5 py-2 hover:bg-[#FAF7FC] flex items-center gap-2 text-[#232122]/75"
                                    >
                                      {card.client_visible ? (
                                        <>
                                          <EyeOff className="w-3.5 h-3.5" /> Ocultar do cliente
                                        </>
                                      ) : (
                                        <>
                                          <Eye className="w-3.5 h-3.5" /> Visível ao cliente
                                        </>
                                      )}
                                    </button>

                                    <div className="my-1 border-t border-black/[0.06]" />
                                    <p className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#232122]/40">
                                      Mover para etapa
                                    </p>
                                    {visibleColumns
                                      .filter((target) => target.id !== card.column_id)
                                      .map((target) => (
                                        <button
                                          key={target.id}
                                          type="button"
                                          onClick={() => handleMoveCard(card.id, target.id)}
                                          className="w-full text-left px-3.5 py-1.5 hover:bg-[#FAF7FC] flex items-center gap-2 text-[#2F1534]"
                                        >
                                          <span
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: target.color }}
                                          />
                                          <span className="truncate">{target.title}</span>
                                        </button>
                                      ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Directly below title: Quick Inline Checklist Indicator */}
                        {(() => {
                          const totalChk = (card.checklist || []).length;
                          const doneChk = (card.checklist || []).filter((i) => i.done).length;
                          const allChkDone = totalChk > 0 && doneChk === totalChk;
                          const isChecklistOpen = checklistPopoverCardId === card.id;
                          const showChecklistPill = totalChk > 0 || !isClient;
                          if (!showChecklistPill) return null;

                          return (
                            <div
                              className="relative flex flex-wrap items-center gap-1.5 pt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {showChecklistPill && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setChecklistPopoverCardId(isChecklistOpen ? null : card.id);
                                    setInlineCheckInput('');
                                  }}
                                  title="Abrir checklist rápida"
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-semibold border tabular-nums transition-colors ${
                                    allChkDone
                                      ? 'bg-[#DAD994]/80 border-[#C8C978] text-[#2F1534]'
                                      : totalChk > 0
                                      ? 'bg-[#F3ECF9] border-[#BC9FE6]/35 text-[#7A689C] hover:border-[#7A689C]'
                                      : 'bg-white border-black/10 text-[#232122]/50 hover:border-[#BC9FE6] hover:text-[#7A689C]'
                                  }`}
                                >
                                  <CheckSquare className="w-3 h-3" />
                                  <span>{totalChk > 0 ? `${doneChk}/${totalChk}` : 'Checklist'}</span>
                                </button>
                              )}

                              {isChecklistOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-20"
                                    onClick={() => setChecklistPopoverCardId(null)}
                                  />
                                  <div className="absolute left-0 top-7 w-64 rounded-2xl bg-white border border-[#BC9FE6]/45 shadow-2xl z-30 p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-[#2F1534]">
                                        Checklist ({doneChk}/{totalChk})
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setChecklistPopoverCardId(null)}
                                        className="text-[#232122]/45 hover:text-[#2F1534]"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    {totalChk === 0 ? (
                                      <p className="text-[11px] text-[#232122]/55 py-1">Nenhum item nesta checklist.</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                                        {card.checklist.map((item) => (
                                          <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => handleToggleInlineCheckItem(card, item.id)}
                                            className="w-full flex items-start gap-2 text-left text-[11.5px] py-0.5 hover:bg-[#FAF7FC] rounded-lg px-1"
                                          >
                                            {item.done ? (
                                              <CheckSquare className="w-3.5 h-3.5 text-[#5D601E] shrink-0 mt-0.5" />
                                            ) : (
                                              <Square className="w-3.5 h-3.5 text-[#7A689C]/50 shrink-0 mt-0.5" />
                                            )}
                                            <span className={item.done ? 'line-through text-[#232122]/45' : 'text-[#2F1534]'}>
                                              {item.text}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {!isClient && (
                                      <div className="flex items-center gap-1.5 pt-1 border-t border-black/[0.06]">
                                        <input
                                          type="text"
                                          value={inlineCheckInput}
                                          onChange={(e) => setInlineCheckInput(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              handleAddInlineCheckItem(card);
                                            }
                                          }}
                                          placeholder="Adicionar item..."
                                          className="flex-1 px-2 py-1 rounded-lg border border-black/12 text-[11px] focus:outline-none focus:border-[#EC2B82]"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleAddInlineCheckItem(card)}
                                          className="px-2 py-1 rounded-lg bg-[#2F1534] text-white text-[10px] font-bold"
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Automatic Column Stage Badge (syncs automatically with column) + Custom Labels */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold border"
                            style={{
                              backgroundColor: colStage.bg,
                              color: colStage.text,
                              borderColor: colStage.border,
                            }}
                            title={`Etapa atual: ${colStage.label}`}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: colStage.dot }}
                            />
                            {colStage.label}
                          </span>
                          {isUnreadSubmission && (
                            <span className="px-2 py-0.5 rounded-md bg-[#EC2B82] text-white text-[10px] font-bold inline-flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" />
                              Novo envio
                            </span>
                          )}
                          {!isClient && !card.client_visible && (
                            <span className="px-2 py-0.5 rounded-md bg-[#2F1534]/10 text-[#2F1534] text-[10px] font-semibold inline-flex items-center gap-1">
                              <EyeOff className="w-2.5 h-2.5" />
                              Oculto
                            </span>
                          )}
                          {card.labels.map((lblName) => {
                            const lblObj = studioLabels.find((l) => l.name === lblName);
                            return (
                              <span
                                key={lblName}
                                className="px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                style={{
                                  backgroundColor: lblObj?.color || '#F3ECF9',
                                  color: lblObj?.text || '#7A689C',
                                }}
                              >
                                {lblName}
                              </span>
                            );
                          })}
                        </div>

                        {/* Footer: Avatars + Subtle 3-Line Content Indicator + Date/Concluída */}
                        <div className="pt-0.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center -space-x-1.5">
                              {lead ? (
                                <PartnerAvatar
                                  name={lead.name}
                                  partnerKey={lead.partner_key}
                                  avatarUrl={lead.avatar_url}
                                  size="xs"
                                />
                              ) : (
                                partners[0] && (
                                  <PartnerAvatar
                                    name={partners[0].name}
                                    partnerKey={partners[0].partner_key}
                                    avatarUrl={partners[0].avatar_url}
                                    size="xs"
                                  />
                                )
                              )}
                              {collab && (
                                <PartnerAvatar
                                  name={collab.name}
                                  partnerKey={collab.partner_key}
                                  avatarUrl={collab.avatar_url}
                                  size="xs"
                                />
                              )}
                            </div>

                            {/* 3-horizontal-lines icon ONLY when card has filled text/content */}
                            {hasCardContent(card) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenAdjustmentDirectly(false);
                                  setSelectedCard(card);
                                }}
                                title="Esta demanda possui descrição/conteúdo preenchido — clique para abrir"
                                aria-label="Abrir conteúdo da demanda"
                                className="w-6 h-6 rounded-lg bg-[#F3ECF9]/80 hover:bg-[#EC2B82]/15 text-[#7A689C] hover:text-[#EC2B82] flex items-center justify-center transition-colors"
                              >
                                <AlignLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {cardDone ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#DAD994] text-[#2F1534] border border-[#C8C978] text-[11px] font-bold">
                              <CheckCircle2 className="w-3 h-3 text-[#3D4011]" />
                              Concluída
                            </span>
                          ) : dueBadge.text ? (
                            <span
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold tabular-nums ${
                                dueBadge.tone === 'today'
                                  ? 'bg-[#F3ECF9] text-[#7A689C]'
                                  : dueBadge.tone === 'tomorrow'
                                  ? 'bg-[#FDF2F6] text-[#EC2B82]'
                                  : 'bg-[#FAF7FC] text-[#7A689C]'
                              }`}
                            >
                              {dueBadge.text}
                            </span>
                          ) : card.content_status === 'complement_requested' ? (
                            <span className="px-2.5 py-1 rounded-lg bg-[#FDF0E8] text-[#E1754C] text-[10px] font-bold">
                              Ajuste
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-[#FAF7FC] text-[#7A689C]/75 text-[10px] font-semibold">
                              Abrir
                            </span>
                          )}
                        </div>

                        {/* Bottom Card Area: Mini atualizações individuais para o cliente */}
                        {(!isClient || (card.mini_updates && card.mini_updates.length > 0)) && (
                          <div
                            className="pt-2.5 border-t border-black/[0.06] space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!isClient ? (
                              <>
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#7A689C]">
                                    Atualizações ao cliente
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openMiniUpdateModal(card, 'manage')}
                                    title="Personalizar opções de mini atualizações"
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-[#7A689C] hover:text-[#EC2B82] hover:bg-[#F3ECF9] transition-colors"
                                  >
                                    <SlidersHorizontal className="w-2.5 h-2.5" />
                                    <span>Personalizar</span>
                                  </button>
                                </div>

                                {card.mini_updates && card.mini_updates.length > 0 && (
                                  <div className="rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/30 px-2.5 py-1.5 space-y-1">
                                    {card.mini_updates.slice(0, 2).map((mu) => (
                                      <div
                                        key={mu.id}
                                        className="flex items-center justify-between gap-1.5 text-[10px]"
                                      >
                                        <span className="inline-flex items-center gap-1 min-w-0 font-bold text-[#2F1534]">
                                          <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ backgroundColor: mu.text || '#EC2B82' }}
                                          />
                                          <span className="truncate">{mu.label}</span>
                                        </span>
                                        <span className="inline-flex items-center gap-1 shrink-0 text-[9.5px] text-[#7A689C] tabular-nums">
                                          <span>{formatMiniUpdateDateTime(mu.created_at)}</span>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveCardMiniUpdate(card.id, mu.id)}
                                            title="Remover esta atualização"
                                            className="text-[#7A689C]/60 hover:text-red-500 transition-colors"
                                          >
                                            <X className="w-2.5 h-2.5" />
                                          </button>
                                        </span>
                                      </div>
                                    ))}
                                    {card.mini_updates.length > 2 && (
                                      <p className="text-[9.5px] text-[#7A689C]/80 font-medium">
                                        +{card.mini_updates.length - 2} no histórico do card
                                      </p>
                                    )}
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-1">
                                  {cardMiniUpdateOptions.map((opt) => {
                                    const matchingRecord = (card.mini_updates || []).find(
                                      (u) =>
                                        u.option_id === opt.id ||
                                        u.label.toLowerCase() === opt.label.toLowerCase()
                                    );
                                    const isSending =
                                      sendingMiniUpdateKey === `${card.id}:${opt.id}`;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        disabled={isSending}
                                        onClick={() =>
                                          handleSendCardMiniUpdate(card, {
                                            label: opt.label,
                                            option_id: opt.id,
                                            bg: opt.bg,
                                            text: opt.text,
                                          })
                                        }
                                        title={
                                          matchingRecord
                                            ? `Enviada em ${formatMiniUpdateDateTime(matchingRecord.created_at, true)} — clique para enviar novamente`
                                            : `Enviar atualização "${opt.label}" ao cliente`
                                        }
                                        style={{
                                          backgroundColor: opt.bg,
                                          color: opt.text,
                                          borderColor: opt.border || 'rgba(47,21,52,0.12)',
                                        }}
                                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold leading-tight transition-all hover:brightness-95 active:scale-[0.98] disabled:opacity-60 ${
                                          matchingRecord
                                            ? 'ring-1 ring-[#2F1534]/25 shadow-2xs'
                                            : 'opacity-90 hover:opacity-100'
                                        }`}
                                      >
                                        {matchingRecord && <Check className="w-2.5 h-2.5 shrink-0" />}
                                        <span>{isSending ? 'Enviando...' : opt.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => openMiniUpdateModal(card, 'send')}
                                  className="w-full py-1.5 px-2.5 rounded-xl bg-[#F3ECF9] hover:bg-[#EC2B82] text-[#7A689C] hover:text-white border border-[#BC9FE6]/50 text-[11px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Enviar nova atualização</span>
                                </button>
                              </>
                            ) : (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#7A689C]">
                                    Atualizações da equipe
                                  </span>
                                  {(card.mini_updates || []).length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedClientUpdatesCardId((prev) => ({
                                          ...prev,
                                          [card.id]: !prev[card.id],
                                        }))
                                      }
                                      className="text-[10px] font-bold text-[#EC2B82] hover:underline"
                                    >
                                      {expandedClientUpdatesCardId[card.id]
                                        ? 'Ver menos'
                                        : `Ver todas (${(card.mini_updates || []).length})`}
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  {(expandedClientUpdatesCardId[card.id]
                                    ? card.mini_updates || []
                                    : (card.mini_updates || []).slice(0, 2)
                                  ).map((mu) => (
                                    <div
                                      key={mu.id}
                                      style={{
                                        backgroundColor: mu.bg || '#F3ECF9',
                                        color: mu.text || '#2F1534',
                                      }}
                                      className="px-2.5 py-1.5 rounded-xl border border-black/[0.06] flex items-center justify-between gap-2 text-[11px]"
                                    >
                                      <span className="inline-flex items-center gap-1.5 font-bold min-w-0">
                                        <Check className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{mu.label}</span>
                                      </span>
                                      <span className="text-[9.5px] opacity-75 shrink-0 tabular-nums inline-flex items-center gap-0.5">
                                        <Clock className="w-2.5 h-2.5" />
                                        {formatMiniUpdateDateTime(mu.created_at)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Column Footer matching Reference Image 2 */}
                {addingCardColId === col.id ? (
                  <div className="p-2.5 rounded-xl bg-white border border-[#EC2B82]/45 space-y-2 shadow-sm">
                    <input
                      type="text"
                      autoFocus
                      value={quickCardTitle}
                      onChange={(e) => setQuickCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAddCard(col.id);
                        if (e.key === 'Escape') setAddingCardColId(null);
                      }}
                      placeholder="Nome da demanda..."
                      className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-black/10 focus:outline-none focus:border-[#EC2B82]"
                    />
                    {serviceOptions.length > 0 && (
                      <select
                        value={quickCardService}
                        onChange={(e) => setQuickCardService(e.target.value)}
                        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg border border-black/10 bg-[#FAF7FC]"
                      >
                        <option value="">Serviço vinculado (opcional)</option>
                        {serviceOptions.map((sName) => (
                          <option key={sName} value={sName}>
                            {sName}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAddingCardColId(null)}
                        className="px-2.5 py-1 text-xs text-[#232122]/60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={creatingCard}
                        onClick={() => handleQuickAddCard(col.id)}
                        className="px-3 py-1 rounded-lg bg-[#EC2B82] text-white text-xs font-bold"
                      >
                        {creatingCard ? 'Criando...' : 'Criar'}
                      </button>
                    </div>
                  </div>
                ) : isDoneCol && onViewAllDemands ? (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onViewAllDemands(col.id)}
                      className="w-full py-2.5 px-3 rounded-xl bg-white/85 hover:bg-white border border-[#BC9FE6]/25 text-xs font-semibold text-[#2F1534] inline-flex items-center justify-center gap-1 transition-colors"
                    >
                      <span>Ver todas</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[#7A689C]" />
                    </button>
                    {!isClient && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingCardColId(col.id);
                          setQuickCardTitle('');
                        }}
                        className="w-full py-1.5 px-2 rounded-xl text-[11px] font-medium text-[#7A689C] hover:text-[#2F1534] hover:bg-white/70 inline-flex items-center justify-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Adicionar demanda</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingCardColId(col.id);
                      setQuickCardTitle('');
                    }}
                    className="w-full py-2.5 px-3 mt-0.5 rounded-xl bg-white/85 hover:bg-white border border-[#BC9FE6]/25 text-xs font-semibold text-[#2F1534] inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#7A689C]" />
                    <span>Adicionar demanda</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Card Detail Full-Screen Page */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          columns={columns}
          partners={partners}
          availableLabels={studioLabels}
          mode={mode}
          variant="page"
          onBackLabel="Voltar ao quadro"
          portalDefaults={portalDefaults}
          initialOpenAdjustment={openAdjustmentDirectly}
          onClose={() => {
            setSelectedCard(null);
            setOpenAdjustmentDirectly(false);
          }}
          onUpdated={() => loadBoard(true)}
          onDeleted={
            !isClient
              ? () => {
                  setSelectedCard(null);
                  loadBoard(true);
                }
              : undefined
          }
          onLabelsUpdated={(updated) => {
            setStudioLabels(updated);
            onLabelsUpdated?.(updated);
          }}
        />
      )}

      {/* Partner-Only Modals */}
      {!isClient && (
        <>
          {/* Board Access & Invite Link MacWindow */}
          <MacWindow
            open={accessModalOpen}
            onClose={() => setAccessModalOpen(false)}
            maxWidthClass="max-w-lg"
            title="Acesso & Convite do Cliente"
            subtitle={board.title}
            icon={<UserCheck className="w-4 h-4 text-[#7A689C]" />}
          >
            <form onSubmit={handleSaveInvite} className="p-5 sm:p-6 space-y-4">
              {inviteError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {inviteError}
                </div>
              )}

              {accessInfo && (
                <div className="p-4 rounded-2xl bg-[#F3ECF9]/60 border border-[#BC9FE6]/40 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#2F1534]">Cliente: {accessInfo.client_name}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[10px] font-semibold ${
                        accessInfo.invite_status === 'accepted'
                          ? 'bg-[#DCFCE7] text-[#15803D]'
                          : accessInfo.invite_status === 'sent'
                          ? 'bg-[#FDF2F6] text-[#EC2B82]'
                          : 'bg-white text-[#232122]/65'
                      }`}
                    >
                      {accessInfo.invite_status === 'accepted'
                        ? 'Convite aceito'
                        : accessInfo.invite_status === 'sent'
                        ? 'Convite enviado'
                        : 'Não enviado'}
                    </span>
                  </div>

                  {shareUrl && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-black/10 bg-white text-[11px] text-[#232122]/80"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await copyTextSafe(shareUrl);
                          if (ok) {
                            setCopiedBoardLink(true);
                            setTimeout(() => setCopiedBoardLink(false), 2000);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-[#2F1534] text-white text-[11px] font-semibold inline-flex items-center gap-1 shrink-0"
                      >
                        {copiedBoardLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedBoardLink ? 'Copiado!' : 'Copiar link'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">E-mail de acesso do cliente</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="cliente@empresa.com"
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">
                  {accessInfo?.has_login ? 'Redefinir senha (opcional)' : 'Senha inicial de acesso *'}
                </label>
                <input
                  type="password"
                  minLength={6}
                  required={!accessInfo?.has_login}
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder={accessInfo?.has_login ? 'Deixe vazio para manter a senha atual' : 'Mínimo 6 caracteres'}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm bg-white"
                />
              </div>

              <label className="flex items-center justify-between text-xs text-[#232122]">
                <span>Quadro ativo e visível no portal do cliente</span>
                <input
                  type="checkbox"
                  checked={inviteShared}
                  onChange={(e) => setInviteShared(e.target.checked)}
                  className="rounded accent-[#EC2B82]"
                />
              </label>

              <div className="pt-3 border-t border-black/[0.06] flex flex-wrap items-center justify-between gap-2">
                {accessInfo?.shared_with_client ? (
                  <button
                    type="button"
                    disabled={inviteSaving}
                    onClick={handleRevokeInvite}
                    className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>Revogar acesso</span>
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAccessModalOpen(false)}
                    className="px-3.5 py-2 text-xs text-[#232122]/60"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSaving}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-semibold"
                  >
                    {inviteSaving ? 'Salvando...' : 'Salvar e liberar link'}
                  </button>
                </div>
              </div>
            </form>
          </MacWindow>

          {/* New Column MacWindow (with optional column cover) */}
          <MacWindow
            open={newColumnOpen}
            onClose={() => setNewColumnOpen(false)}
            isDirty={Boolean(newColumnTitle.trim())}
            maxWidthClass="max-w-md"
            title="Nova coluna"
            subtitle={board.title}
            icon={<Columns className="w-4 h-4 text-[#7A689C]" />}
          >
            <form onSubmit={handleAddColumn} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#2F1534]">Nome da coluna *</label>
                <input
                  type="text"
                  required
                  value={newColumnTitle}
                  onChange={(e) => setNewColumnTitle(e.target.value)}
                  placeholder="Ex: Revisão estratégica"
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#2F1534]">Cor indicadora</label>
                <div className="flex gap-2">
                  {COLUMN_COLOR_DOTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColumnColor(c)}
                      className={`w-7 h-7 rounded-full ${newColumnColor === c ? 'ring-2 ring-offset-2 ring-[#2F1534]' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#2F1534]">Capa da coluna (opcional)</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewColumnCover(null)}
                    className={`h-11 rounded-lg border text-[10px] font-semibold ${
                      !newColumnCover ? 'border-[#EC2B82] bg-[#FDF2F6] text-[#EC2B82]' : 'border-black/10 text-[#232122]/60'
                    }`}
                  >
                    Sem capa
                  </button>
                  {BOARD_COVER_PRESETS.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      onClick={() => setNewColumnCover(p.url)}
                      className={`h-11 rounded-lg overflow-hidden border-2 ${
                        newColumnCover === p.url ? 'border-[#EC2B82]' : 'border-transparent opacity-75'
                      }`}
                    >
                      <img src={p.url} alt={p.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setNewColumnOpen(false)} className="px-3.5 py-2 text-xs text-[#232122]/60">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold">
                  Criar coluna
                </button>
              </div>
            </form>
          </MacWindow>

          {/* Column Cover & Color Modal */}
          <MacWindow
            open={Boolean(colCoverTarget)}
            onClose={() => setColCoverTarget(null)}
            maxWidthClass="max-w-md"
            title={`Personalizar coluna · ${colCoverTarget?.title || ''}`}
            subtitle="As capas são aplicadas exclusivamente às colunas."
            icon={<Palette className="w-4 h-4 text-[#EC2B82]" />}
          >
            <form onSubmit={handleSaveColumnAppearance} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#2F1534]">Cor indicadora</label>
                <div className="flex gap-2">
                  {COLUMN_COLOR_DOTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColColorDraft(c)}
                      className={`w-7 h-7 rounded-full ${colColorDraft === c ? 'ring-2 ring-offset-2 ring-[#2F1534]' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-[#2F1534]">Capa da coluna</label>
                <div className="grid grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setColCoverDraft(null)}
                    className={`h-12 rounded-lg border text-[10px] font-semibold ${
                      !colCoverDraft ? 'border-[#EC2B82] bg-[#FDF2F6] text-[#EC2B82]' : 'border-black/10 text-[#232122]/60'
                    }`}
                  >
                    Sem capa
                  </button>
                  {BOARD_COVER_PRESETS.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      onClick={() => setColCoverDraft(p.url)}
                      className={`h-12 rounded-lg overflow-hidden border-2 ${
                        colCoverDraft === p.url ? 'border-[#EC2B82]' : 'border-transparent opacity-75'
                      }`}
                    >
                      <img src={p.url} alt={p.label} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>

                <label className="flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-[#BC9FE6] bg-[#FAF7FC] text-xs font-semibold text-[#7A689C] cursor-pointer hover:bg-[#F3ECF9]">
                  <UploadCloud className="w-4 h-4" />
                  <span>{uploadingColCover ? 'Enviando...' : 'Enviar imagem personalizada'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploadingColCover(true);
                      try {
                        const up = await uploadFile(f);
                        setColCoverDraft(up.file_url);
                      } finally {
                        setUploadingColCover(false);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>

                {colCoverDraft && (
                  <div className="h-20 rounded-xl overflow-hidden border border-black/10">
                    <img src={colCoverDraft} alt="Prévia da capa" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setColCoverTarget(null)} className="px-4 py-2 text-xs text-[#232122]/60">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold">
                  Aplicar à coluna
                </button>
              </div>
            </form>
          </MacWindow>

          {/* Board Settings MacWindow */}
          <MacWindow
            open={boardSettingsOpen}
            onClose={() => setBoardSettingsOpen(false)}
            maxWidthClass="max-w-md"
            title="Configurações do quadro"
            subtitle={board.client_name}
            icon={<Settings className="w-4 h-4 text-[#7A689C]" />}
          >
            <form onSubmit={handleSaveBoardSettings} className="p-5 sm:p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Nome do projeto / quadro</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#232122]/75">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as 'draft' | 'active' | 'completed' | 'archived')}
                    className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="active">Em andamento</option>
                    <option value="completed">Concluído</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[#232122]/75">Prazo</label>
                  <input
                    type="date"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#232122]/75">Pasta</label>
                <select
                  value={editFolderId}
                  onChange={(e) => setEditFolderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                >
                  <option value="">Sem pasta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.portal_owner === 'ingrid' ? 'Ingrid' : 'Mariana'})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center justify-between text-xs text-[#232122]">
                <span>Compartilhado no Portal do Cliente</span>
                <input
                  type="checkbox"
                  checked={editShared}
                  onChange={(e) => setEditShared(e.target.checked)}
                  className="rounded accent-[#EC2B82]"
                />
              </label>

              <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between">
                {user.permissions.can_delete_boards ? (
                  <button
                    type="button"
                    onClick={handleDeleteBoard}
                    className="text-xs text-red-600 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir quadro
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBoardSettingsOpen(false)}
                    className="px-3.5 py-2 text-xs text-[#232122]/60"
                  >
                    Cancelar
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-semibold">
                    Salvar
                  </button>
                </div>
              </div>
            </form>
          </MacWindow>
        </>
      )}

      {/* Modal: Enviar nova atualização personalizada + Personalizar opções de mini atualizações */}
      {!isClient && (
        <MacWindow
          open={miniUpdateModalOpen}
          onClose={() => setMiniUpdateModalOpen(false)}
          maxWidthClass="max-w-lg"
          title={
            miniUpdateModalTab === 'send'
              ? 'Enviar nova atualização'
              : 'Personalizar mini atualizações'
          }
          subtitle={
            miniUpdateModalTab === 'send' && miniUpdateTargetCard
              ? miniUpdateTargetCard.title
              : 'Crie, edite ou exclua opções exibidas nos cards do Kanban'
          }
          icon={<Sparkles className="w-4 h-4 text-[#EC2B82]" />}
        >
          <div className="p-5 space-y-4">
              {/* Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/30">
                {miniUpdateTargetCard && (
                  <button
                    type="button"
                    onClick={() => setMiniUpdateModalTab('send')}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors ${
                      miniUpdateModalTab === 'send'
                        ? 'bg-white text-[#2F1534] shadow-xs border border-[#BC9FE6]/35'
                        : 'text-[#7A689C] hover:text-[#2F1534]'
                    }`}
                  >
                    Enviar neste card
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMiniUpdateModalTab('manage')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-colors ${
                    miniUpdateModalTab === 'manage'
                      ? 'bg-white text-[#2F1534] shadow-xs border border-[#BC9FE6]/35'
                      : 'text-[#7A689C] hover:text-[#2F1534]'
                  }`}
                >
                  Personalizar opções ({cardMiniUpdateOptions.length})
                </button>
              </div>

              {miniUpdateModalTab === 'send' && miniUpdateTargetCard ? (
                <form onSubmit={handleSubmitCustomMiniUpdate} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#2F1534]">
                      Mensagem da atualização para o cliente
                    </label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={customUpdateText}
                      onChange={(e) => setCustomUpdateText(e.target.value)}
                      placeholder="Ex.: Roteiro ajustado e pronto para conferência..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#2F1534]">Cor na paleta Aumi</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MINI_UPDATE_COLOR_PRESETS.map((tone, idx) => (
                        <button
                          key={tone.name}
                          type="button"
                          onClick={() => setCustomUpdateColorIdx(idx)}
                          style={{
                            backgroundColor: tone.bg,
                            color: tone.text,
                            borderColor: tone.border,
                          }}
                          className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                            customUpdateColorIdx === idx
                              ? 'ring-2 ring-[#EC2B82] scale-[1.02]'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                        >
                          {tone.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-[#2F1534] bg-[#FAF7FC] border border-[#BC9FE6]/30 rounded-xl px-3 py-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveCustomAsOption}
                      onChange={(e) => setSaveCustomAsOption(e.target.checked)}
                      className="rounded accent-[#EC2B82]"
                    />
                    <span className="font-medium">
                      Salvar também como botão rápido reutilizável nos cards
                    </span>
                  </label>

                  <div className="pt-2 border-t border-black/[0.06] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setMiniUpdateModalOpen(false)}
                      className="px-3.5 py-2 text-xs font-semibold text-[#232122]/65"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submittingCustomUpdate || !customUpdateText.trim()}
                      className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d42273] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingCustomUpdate ? 'Enviando...' : 'Enviar atualização'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Create new reusable option */}
                  <form
                    onSubmit={handleAddReusableOption}
                    className="p-3.5 rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/35 space-y-2.5"
                  >
                    <p className="text-[11px] font-bold text-[#2F1534]">Criar nova opção rápida</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newOptionLabel}
                        onChange={(e) => setNewOptionLabel(e.target.value)}
                        placeholder="Nome da mini atualização..."
                        className="flex-1 px-3 py-2 rounded-xl bg-white border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                      />
                      <button
                        type="submit"
                        disabled={savingOptions || !newOptionLabel.trim()}
                        className="px-3.5 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {MINI_UPDATE_COLOR_PRESETS.map((tone, idx) => (
                        <button
                          key={tone.name}
                          type="button"
                          onClick={() => setNewOptionColorIdx(idx)}
                          style={{
                            backgroundColor: tone.bg,
                            color: tone.text,
                            borderColor: tone.border,
                          }}
                          className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                            newOptionColorIdx === idx ? 'ring-2 ring-[#EC2B82]' : 'opacity-75 hover:opacity-100'
                          }`}
                        >
                          {tone.name}
                        </button>
                      ))}
                    </div>
                  </form>

                  {/* Existing options list (edit & delete) */}
                  <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                    {cardMiniUpdateOptions.map((opt) => {
                      const isEditing = editingOptionId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          className="p-2.5 rounded-xl bg-white border border-black/[0.08] space-y-2"
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                autoFocus
                                value={editingOptionLabel}
                                onChange={(e) => setEditingOptionLabel(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEditedOption(opt.id);
                                  if (e.key === 'Escape') setEditingOptionId(null);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-[#EC2B82]/50 text-xs focus:outline-none"
                              />
                              <div className="flex flex-wrap gap-1">
                                {MINI_UPDATE_COLOR_PRESETS.map((tone, idx) => (
                                  <button
                                    key={tone.name}
                                    type="button"
                                    onClick={() => setEditingOptionColorIdx(idx)}
                                    style={{
                                      backgroundColor: tone.bg,
                                      color: tone.text,
                                      borderColor: tone.border,
                                    }}
                                    className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                                      editingOptionColorIdx === idx ? 'ring-2 ring-[#EC2B82]' : 'opacity-75'
                                    }`}
                                  >
                                    {tone.name}
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setEditingOptionId(null)}
                                  className="px-2.5 py-1 text-[11px] text-[#232122]/60"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={savingOptions}
                                  onClick={() => handleSaveEditedOption(opt.id)}
                                  className="px-3 py-1 rounded-lg bg-[#EC2B82] text-white text-[11px] font-bold"
                                >
                                  Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{
                                  backgroundColor: opt.bg,
                                  color: opt.text,
                                  borderColor: opt.border || 'rgba(47,21,52,0.12)',
                                }}
                                className="px-2.5 py-1 rounded-lg border text-[11px] font-bold truncate"
                              >
                                {opt.label}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingOptionId(opt.id);
                                    setEditingOptionLabel(opt.label);
                                    const foundIdx = MINI_UPDATE_COLOR_PRESETS.findIndex(
                                      (t) => t.bg.toLowerCase() === opt.bg.toLowerCase()
                                    );
                                    setEditingOptionColorIdx(foundIdx >= 0 ? foundIdx : 0);
                                  }}
                                  title="Editar opção"
                                  className="p-1.5 rounded-lg text-[#7A689C] hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={savingOptions}
                                  onClick={() => handleDeleteReusableOption(opt.id)}
                                  title="Excluir opção"
                                  className="p-1.5 rounded-lg text-[#7A689C] hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-black/[0.06] flex items-center justify-between gap-2">
                    <button
                      type="button"
                      disabled={savingOptions}
                      onClick={() => persistMiniUpdateOptions(DEFAULT_MINI_UPDATE_OPTIONS)}
                      className="text-[11px] font-semibold text-[#7A689C] hover:text-[#EC2B82] inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restaurar padrões</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMiniUpdateModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
                    >
                      Concluir
                    </button>
                  </div>
                </div>
              )}
            </div>
          </MacWindow>
      )}
    </div>
  );
}
