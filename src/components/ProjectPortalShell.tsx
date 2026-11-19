import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  MessageSquareText,
  ListChecks,
  CheckSquare,
  Calendar as CalendarIcon,
  Paperclip,
  FileText,
  Cloud,
  ScrollText,
  MessageCircle,
  Headphones,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Folder as FolderIcon,
  Zap,
  CheckCircle2,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  ExternalLink,
  Download,
  UploadCloud,
  Send,
  Search,
  Eye,
  EyeOff,
  Link2,
  Settings,
  Tag,
  LogOut,
  Check,
  Clock,
  FileCheck2,
  FileSpreadsheet,
  RefreshCw,
  Palette,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  Maximize2,
  Minimize2,
  RotateCcw,
  X,
  ArrowDown,
} from 'lucide-react';
import { api, formatRelativeTime, formatShortDateBR, stripHtmlTags, uploadFile } from '../lib/api.ts';
import {
  ApprovalDelivery,
  Board,
  BoardBriefingInfo,
  BoardColumn,
  BoardContractInfo,
  BoardDocumentItem,
  BoardDriveLink,
  Card,
  Folder,
  MuralPost,
  StudioEvent,
  StudioSettings,
  User,
} from '../types/aumi.ts';
import { AumiLogoMark, GlassFolderGraphic, PartnerAvatar } from './AumiBrand.tsx';
import { KanbanBoardView } from './KanbanBoardView.tsx';
import { CardDetailModal } from './CardDetailModal.tsx';
import { LabelsManagerModal, StudioLabelItem } from './LabelsManagerModal.tsx';
import { ArtApprovalSection, isArtApprovalCard } from './ArtApprovalSection.tsx';
import { ProjectMuralWidget } from './ProjectMuralWidget.tsx';

export type ProjectPortalSection =
  | 'visao_geral'
  | 'mural'
  | 'aprovacao'
  | 'processo'
  | 'demandas'
  | 'calendario'
  | 'anexos'
  | 'briefing'
  | 'drive'
  | 'contrato'
  | 'comentarios';

interface ServiceMetaItem {
  id: string;
  name: string;
  color: string;
  category: string;
  visible_in_portal: boolean;
  process_steps: Array<{ id: string; title: string; description: string; active: boolean }>;
}

interface ProjectPortalShellProps {
  boardId: string;
  availableBoards: Board[];
  user: User;
  partners: User[];
  folders?: Folder[];
  settings?: StudioSettings | null;
  mode: 'partner' | 'client';
  initialOpenCardId?: string | null;
  portalDefaults?: {
    welcome_message?: string;
    allow_client_comments?: boolean;
    allow_client_uploads?: boolean;
    allow_client_approvals?: boolean;
    show_mural_to_clients?: boolean;
  };
  onSwitchBoard: (boardId: string) => void;
  onBackToProjects?: () => void;
  onPreviewClientPortal?: (clientId: string) => void;
  onExitPreview?: () => void;
  onLogout?: () => void;
  onDataChanged?: () => void;
}

const PORTAL_NAV_ITEMS: Array<{
  id: ProjectPortalSection;
  label: string;
  icon: React.FC<{ className?: string }>;
  gradient: string;
  iconTone?: string;
}> = [
  { id: 'visao_geral', label: 'Visão Geral', icon: Home, gradient: 'from-[#EC2B82] to-[#EC97B7]' },
  { id: 'mural', label: 'Mural do Projeto', icon: MessageSquareText, gradient: 'from-[#7A689C] to-[#BC9FE6]' },
  { id: 'aprovacao', label: 'Aprovação de Artes', icon: Palette, gradient: 'from-[#EC2B82] to-[#E1754C]' },
  { id: 'demandas', label: 'Demandas', icon: CheckSquare, gradient: 'from-[#9333EA] to-[#BC9FE6]' },
  { id: 'processo', label: 'Processo & Etapas', icon: ListChecks, gradient: 'from-[#7A689C] to-[#2F1534]' },
  { id: 'calendario', label: 'Calendário', icon: CalendarIcon, gradient: 'from-[#E1754C] to-[#DAD994]', iconTone: 'text-[#2F1534]' },
  { id: 'briefing', label: 'Briefing', icon: FileText, gradient: 'from-[#BC9FE6] to-[#7A689C]' },
  { id: 'contrato', label: 'Contrato e Proposta', icon: ScrollText, gradient: 'from-[#2F1534] to-[#7A689C]' },
  { id: 'anexos', label: 'Anexos & Arquivos', icon: Paperclip, gradient: 'from-[#EC97B7] to-[#EC2B82]' },
  { id: 'drive', label: 'Drive', icon: Cloud, gradient: 'from-[#DAD994] to-[#C8C978]', iconTone: 'text-[#2F1534]' },
  { id: 'comentarios', label: 'Comentários', icon: MessageCircle, gradient: 'from-[#E1754C] to-[#EC2B82]' },
];

const DEFAULT_PROCESS_STEPS = [
  { id: 'stp-1', title: 'Onboarding & Briefing', description: 'Alinhamento inicial e recebimento dos materiais do cliente.', active: true },
  { id: 'stp-2', title: 'Estratégia & Conceito', description: 'Desenvolvimento da direção criativa e referências.', active: true },
  { id: 'stp-3', title: 'Em produção', description: 'Criação das peças, designs e entregas do projeto.', active: true },
  { id: 'stp-4', title: 'Aprovação', description: 'Apresentação para análise e ajustes do cliente.', active: true },
  { id: 'stp-5', title: 'Entrega Final', description: 'Arquivos finais organizados e liberação completa.', active: true },
];

function formatDateTimeBR(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const datePart = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d);
  const timePart = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d);
  return `${datePart} · ${timePart}`;
}

function getEffectiveContractDoc(info?: BoardContractInfo): BoardDocumentItem | undefined {
  if (!info) return undefined;
  if (info.contract_doc) return info.contract_doc;
  if (info.document_url || info.document_title || info.validity) {
    return {
      title: info.document_title || 'Contrato de Prestação de Serviços',
      file_url: info.document_url || '',
      file_name: info.document_title || 'Contrato',
      validity: info.validity || '',
      client_visible: true,
    };
  }
  return undefined;
}

function isImageDoc(url?: string, mime?: string): boolean {
  if (mime?.startsWith('image/')) return true;
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url);
}

function isPdfDoc(url?: string, mime?: string): boolean {
  if (mime === 'application/pdf') return true;
  if (!url) return false;
  return /\.pdf(\?.*)?$/i.test(url);
}

function DocumentPreviewBox({
  fileUrl,
  fileName,
  mimeType,
}: {
  fileUrl?: string;
  fileName?: string;
  mimeType?: string;
}) {
  if (!fileUrl) return null;

  if (isImageDoc(fileUrl, mimeType)) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[#BC9FE6]/35 bg-[#FAF7FC]">
        <img
          src={fileUrl}
          alt={fileName || 'Documento'}
          className="w-full max-h-72 object-contain bg-white"
        />
      </div>
    );
  }

  if (isPdfDoc(fileUrl, mimeType)) {
    return (
      <div className="rounded-2xl overflow-hidden border border-[#BC9FE6]/35 bg-[#FAF7FC]">
        <iframe
          src={fileUrl}
          title={fileName || 'Pré-visualização do documento PDF'}
          className="w-full h-72 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#BC9FE6]/35 bg-[#FAF7FC] p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7A689C] to-[#BC9FE6] text-white flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#2F1534] truncate">{fileName || 'Arquivo anexado'}</p>
        <p className="text-[11px] text-[#7A689C]">Pronto para abrir ou baixar.</p>
      </div>
    </div>
  );
}

export function ProjectPortalShell({
  boardId,
  availableBoards,
  user,
  partners,
  folders = [],
  settings = null,
  mode,
  initialOpenCardId = null,
  portalDefaults,
  onSwitchBoard,
  onBackToProjects,
  onPreviewClientPortal,
  onExitPreview,
  onLogout,
  onDataChanged,
}: ProjectPortalShellProps) {
  const isClient = mode === 'client';

  const [section, setSection] = useState<ProjectPortalSection>('visao_geral');
  const [sectionHistory, setSectionHistory] = useState<ProjectPortalSection[]>(['visao_geral']);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [finderQuickSearch, setFinderQuickSearch] = useState('');
  const mainScrollRef = useRef<HTMLDivElement>(null);

  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [approvalDeliveries, setApprovalDeliveries] = useState<ApprovalDelivery[]>([]);
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [servicesMeta, setServicesMeta] = useState<ServiceMetaItem[]>([]);
  const [muralPosts, setMuralPosts] = useState<MuralPost[]>([]);
  const [studioLabels, setStudioLabels] = useState<StudioLabelItem[]>(
    (settings?.labels as StudioLabelItem[]) || []
  );
  const [loading, setLoading] = useState(true);

  // Persisted Portal Layout Preferences (sidebar minimize/resize, collapsible sections, workspace height)
  type PortalSectionCollapseKey = 'mural' | 'aprovacao' | 'kanban' | 'complementar';
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('aumi_portal_layout_prefs_v1');
      if (raw) return Boolean(JSON.parse(raw).sidebarCollapsed);
    } catch {}
    return false;
  });
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('aumi_portal_layout_prefs_v1');
      if (raw) {
        const w = Number(JSON.parse(raw).sidebarWidth);
        if (w >= 200 && w <= 360) return w;
      }
    } catch {}
    return 256;
  });
  const [portalExpanded, setPortalExpanded] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('aumi_portal_layout_prefs_v1');
      if (raw) return Boolean(JSON.parse(raw).portalExpanded);
    } catch {}
    return false;
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<PortalSectionCollapseKey, boolean>>(() => {
    try {
      const raw = localStorage.getItem('aumi_portal_layout_prefs_v1');
      if (raw && JSON.parse(raw).collapsedSections) {
        return {
          mural: false,
          aprovacao: false,
          kanban: false,
          complementar: false,
          ...JSON.parse(raw).collapsedSections,
        };
      }
    } catch {}
    return { mural: false, aprovacao: false, kanban: false, complementar: false };
  });
  const [resizingSidebar, setResizingSidebar] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        'aumi_portal_layout_prefs_v1',
        JSON.stringify({
          sidebarCollapsed,
          sidebarWidth,
          portalExpanded,
          collapsedSections,
        })
      );
    } catch {}
  }, [sidebarCollapsed, sidebarWidth, portalExpanded, collapsedSections]);

  useEffect(() => {
    if (!resizingSidebar) return;
    const handleMove = (e: MouseEvent) => {
      const next = Math.max(200, Math.min(360, e.clientX - 24));
      setSidebarWidth(next);
    };
    const handleUp = () => setResizingSidebar(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizingSidebar]);

  function toggleOverviewSection(key: PortalSectionCollapseKey) {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [labelsManagerOpen, setLabelsManagerOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Triggers passed to embedded KanbanBoardView
  const [openAccessTrigger, setOpenAccessTrigger] = useState(0);
  const [openSettingsTrigger, setOpenSettingsTrigger] = useState(0);
  const [kanbanRefreshKey, setKanbanRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Demandas filters
  const [demandsSearch, setDemandsSearch] = useState('');
  const [demandsColFilter, setDemandsColFilter] = useState('all');
  const [demandsLabelFilter, setDemandsLabelFilter] = useState('all');
  const [demandsOnlyUnread, setDemandsOnlyUnread] = useState(false);
  const [newDemandModalOpen, setNewDemandModalOpen] = useState(false);
  const [newDemandTitle, setNewDemandTitle] = useState('');
  const [newDemandDesc, setNewDemandDesc] = useState('');
  const [newDemandColId, setNewDemandColId] = useState('');
  const [newDemandPriority, setNewDemandPriority] = useState<'baixa' | 'normal' | 'alta' | 'urgente'>('normal');
  const [creatingDemand, setCreatingDemand] = useState(false);

  // Calendario event composer
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventTime, setEventTime] = useState('14:00');
  const [eventType, setEventType] = useState<'meeting' | 'deadline' | 'delivery' | 'internal'>('delivery');
  const [eventDesc, setEventDesc] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  // Anexos direct upload
  const [attachTargetCardId, setAttachTargetCardId] = useState('');
  const [uploadingDirectAtt, setUploadingDirectAtt] = useState(false);

  // Drive links state
  const [driveModalOpen, setDriveModalOpen] = useState(false);
  const [driveTitle, setDriveTitle] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [driveDesc, setDriveDesc] = useState('');
  const [driveInternal, setDriveInternal] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);

  // Briefing document editor state
  const [editingBriefingDoc, setEditingBriefingDoc] = useState(false);
  const [briefingDraft, setBriefingDraft] = useState<BoardBriefingInfo>({ client_visible: true });
  const [uploadingBriefingDoc, setUploadingBriefingDoc] = useState(false);
  const [savingBriefingDoc, setSavingBriefingDoc] = useState(false);

  // Independent Contract & Proposal editors state
  const [editingContractDoc, setEditingContractDoc] = useState(false);
  const [contractDocDraft, setContractDocDraft] = useState<BoardDocumentItem>({ client_visible: true });
  const [uploadingContractDoc, setUploadingContractDoc] = useState(false);
  const [savingContractDoc, setSavingContractDoc] = useState(false);

  const [editingProposalDoc, setEditingProposalDoc] = useState(false);
  const [proposalDocDraft, setProposalDocDraft] = useState<BoardDocumentItem>({ client_visible: true });
  const [uploadingProposalDoc, setUploadingProposalDoc] = useState(false);
  const [savingProposalDoc, setSavingProposalDoc] = useState(false);

  const [editingScopeNotes, setEditingScopeNotes] = useState(false);
  const [scopeSummaryDraft, setScopeSummaryDraft] = useState('');
  const [scopeInternalNotesDraft, setScopeInternalNotesDraft] = useState('');
  const [savingScopeNotes, setSavingScopeNotes] = useState(false);

  // Comments hub composer
  const [commentCardId, setCommentCardId] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  async function loadProjectData() {
    try {
      const [bRes, mRes, lRes] = await Promise.all([
        api<{
          board: Board;
          columns: BoardColumn[];
          cards: Card[];
          approval_deliveries?: ApprovalDelivery[];
          events?: StudioEvent[];
          services_meta?: ServiceMetaItem[];
        }>(`/boards/${boardId}${isClient ? '?as_client=1' : ''}`),
        api<{ posts: MuralPost[] }>(
          `/mural?scope=board&board_id=${encodeURIComponent(boardId)}${isClient ? '&as_client=1' : ''}`
        ),
        api<{ labels: StudioLabelItem[] }>('/labels').catch(() => ({ labels: [] })),
      ]);

      setBoard(bRes.board);
      setColumns(bRes.columns);
      setCards(bRes.cards);
      setApprovalDeliveries(bRes.approval_deliveries || []);
      setEvents(bRes.events || []);
      setServicesMeta(bRes.services_meta || []);
      setMuralPosts(mRes.posts || []);
      if (lRes.labels?.length) setStudioLabels(lRes.labels);

      // Hydrate Briefing & Contract/Proposal drafts
      const bInfo = bRes.board.briefing_info || {};
      setBriefingDraft({
        title: bInfo.title || '',
        description: bInfo.description || '',
        file_url: bInfo.file_url || '',
        file_name: bInfo.file_name || '',
        mime_type: bInfo.mime_type || '',
        notes: bInfo.notes || '',
        internal_notes: bInfo.internal_notes || '',
        client_visible: bInfo.client_visible !== false,
      });

      const effContract = getEffectiveContractDoc(bRes.board.contract_info);
      setContractDocDraft(
        effContract || {
          title: 'Contrato de Prestação de Serviços',
          file_url: '',
          file_name: '',
          validity: '',
          notes: '',
          client_visible: true,
        }
      );

      const pDoc = bRes.board.contract_info?.proposal_doc;
      setProposalDocDraft(
        pDoc || {
          title: 'Proposta Comercial',
          file_url: '',
          file_name: '',
          validity: '',
          notes: '',
          client_visible: true,
        }
      );

      setScopeSummaryDraft(bRes.board.contract_info?.summary || '');
      setScopeInternalNotesDraft(bRes.board.contract_info?.internal_notes || '');

      if (!newDemandColId && bRes.columns[0]) setNewDemandColId(bRes.columns[0].id);
      if (!attachTargetCardId && bRes.cards[0]) setAttachTargetCardId(bRes.cards[0].id);
      if (!commentCardId && bRes.cards[0]) setCommentCardId(bRes.cards[0].id);

      if (selectedCard) {
        const refreshed = bRes.cards.find((c) => c.id === selectedCard.id) || null;
        setSelectedCard(refreshed);
      } else if (initialOpenCardId) {
        const found = bRes.cards.find((c) => c.id === initialOpenCardId) || null;
        if (found) setSelectedCard(found);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    setSelectedCard(null);
    loadProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, mode]);

  // Always reset scroll position to top when switching portal section or board
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [section, boardId]);

  function navigateSection(next: ProjectPortalSection) {
    setMobileSidebarOpen(false);
    if (next === section) {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSection(next);
    setSectionHistory((prev) => {
      const sliced = prev.slice(0, historyIdx + 1);
      return [...sliced, next];
    });
    setHistoryIdx((idx) => idx + 1);
  }

  function handleHistoryBack() {
    if (historyIdx <= 0) return;
    const nextIdx = historyIdx - 1;
    setHistoryIdx(nextIdx);
    setSection(sectionHistory[nextIdx]);
  }

  function handleHistoryForward() {
    if (historyIdx >= sectionHistory.length - 1) return;
    const nextIdx = historyIdx + 1;
    setHistoryIdx(nextIdx);
    setSection(sectionHistory[nextIdx]);
  }

  function scrollToKanban() {
    if (section !== 'visao_geral') {
      navigateSection('visao_geral');
      setTimeout(() => {
        document.getElementById('portal-kanban-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }
    document.getElementById('portal-kanban-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function refreshAll(alsoNotifyParent = true) {
    setRefreshing(true);
    setKanbanRefreshKey((k) => k + 1);
    try {
      await loadProjectData();
      if (alsoNotifyParent) onDataChanged?.();
    } finally {
      setRefreshing(false);
    }
  }

  // ==================== MURAL ACTIONS ====================
  async function handleToggleMuralRead(post: MuralPost, nextRead: boolean) {
    // Optimistic update
    setMuralPosts((prev) =>
      prev.map((p) => {
        if (p.id !== post.id) return p;
        const current = new Set(p.read_by || []);
        if (nextRead) current.add(user.id);
        else current.delete(user.id);
        return { ...p, read_by: Array.from(current) };
      })
    );
    await api(`/mural/${post.id}/mark-read`, {
      method: 'POST',
      body: JSON.stringify({ read: nextRead }),
    });
  }

  // ==================== BRIEFING DOCUMENT ACTIONS ====================
  async function persistBriefingInfo(nextBriefing: BoardBriefingInfo) {
    if (!board || isClient) return;
    setSavingBriefingDoc(true);
    try {
      await api(`/boards/${board.id}/workspace-meta`, {
        method: 'PUT',
        body: JSON.stringify({ briefing_info: nextBriefing }),
      });
      await loadProjectData();
    } finally {
      setSavingBriefingDoc(false);
    }
  }

  async function handleSaveBriefingDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!board || isClient) return;
    const payload: BoardBriefingInfo = {
      ...briefingDraft,
      title: briefingDraft.title?.trim() || briefingDraft.file_name || 'Documento de Briefing',
      updated_at: new Date().toISOString(),
      updated_by: user.name,
    };
    await persistBriefingInfo(payload);
    setEditingBriefingDoc(false);
  }

  async function handleToggleBriefingVisibility() {
    if (!board || isClient) return;
    const current = board.briefing_info || briefingDraft;
    const nextVisible = !(current.client_visible !== false);
    const payload: BoardBriefingInfo = {
      ...current,
      client_visible: nextVisible,
      updated_at: new Date().toISOString(),
      updated_by: user.name,
    };
    await persistBriefingInfo(payload);
  }

  async function handleRemoveBriefingDoc() {
    if (!board || isClient) return;
    await persistBriefingInfo({
      title: '',
      description: '',
      file_url: '',
      file_name: '',
      mime_type: '',
      notes: '',
      internal_notes: '',
      client_visible: false,
      updated_at: new Date().toISOString(),
      updated_by: user.name,
    });
    setEditingBriefingDoc(false);
  }

  // ==================== INDEPENDENT CONTRACT & PROPOSAL ACTIONS ====================
  async function persistContractMeta(partial: Partial<BoardContractInfo>) {
    if (!board || isClient) return;
    const existing = board.contract_info || {};
    const merged: BoardContractInfo = {
      ...existing,
      ...partial,
    };
    await api(`/boards/${board.id}/workspace-meta`, {
      method: 'PUT',
      body: JSON.stringify({ contract_info: merged }),
    });
    await loadProjectData();
  }

  async function handleSaveContractDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!board || isClient) return;
    setSavingContractDoc(true);
    try {
      const nextDoc: BoardDocumentItem = {
        ...contractDocDraft,
        title: contractDocDraft.title?.trim() || contractDocDraft.file_name || 'Contrato de Prestação de Serviços',
        client_visible: contractDocDraft.client_visible !== false,
        updated_at: new Date().toISOString(),
        updated_by: user.name,
      };
      await persistContractMeta({
        contract_doc: nextDoc,
        document_url: nextDoc.file_url || '',
        document_title: nextDoc.title || '',
        validity: nextDoc.validity || '',
      });
      setEditingContractDoc(false);
    } finally {
      setSavingContractDoc(false);
    }
  }

  async function handleToggleContractDocVisibility() {
    if (!board || isClient) return;
    const eff = getEffectiveContractDoc(board.contract_info) || contractDocDraft;
    const nextVisible = !(eff.client_visible !== false);
    await persistContractMeta({
      contract_doc: {
        ...eff,
        client_visible: nextVisible,
        updated_at: new Date().toISOString(),
        updated_by: user.name,
      },
    });
  }

  async function handleRemoveContractDoc() {
    if (!board || isClient) return;
    await persistContractMeta({
      contract_doc: undefined,
      document_url: '',
      document_title: '',
      validity: '',
    });
    setEditingContractDoc(false);
  }

  async function handleSaveProposalDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!board || isClient) return;
    setSavingProposalDoc(true);
    try {
      const nextDoc: BoardDocumentItem = {
        ...proposalDocDraft,
        title: proposalDocDraft.title?.trim() || proposalDocDraft.file_name || 'Proposta Comercial',
        client_visible: proposalDocDraft.client_visible !== false,
        updated_at: new Date().toISOString(),
        updated_by: user.name,
      };
      await persistContractMeta({ proposal_doc: nextDoc });
      setEditingProposalDoc(false);
    } finally {
      setSavingProposalDoc(false);
    }
  }

  async function handleToggleProposalDocVisibility() {
    if (!board || isClient) return;
    const current = board.contract_info?.proposal_doc || proposalDocDraft;
    const nextVisible = !(current.client_visible !== false);
    await persistContractMeta({
      proposal_doc: {
        ...current,
        client_visible: nextVisible,
        updated_at: new Date().toISOString(),
        updated_by: user.name,
      },
    });
  }

  async function handleRemoveProposalDoc() {
    if (!board || isClient) return;
    await persistContractMeta({ proposal_doc: undefined });
    setEditingProposalDoc(false);
  }

  async function handleSaveScopeNotes(e: React.FormEvent) {
    e.preventDefault();
    if (!board || isClient) return;
    setSavingScopeNotes(true);
    try {
      await persistContractMeta({
        summary: scopeSummaryDraft,
        internal_notes: scopeInternalNotesDraft,
      });
      setEditingScopeNotes(false);
    } finally {
      setSavingScopeNotes(false);
    }
  }

  // ==================== OTHER WORKSPACE ACTIONS ====================
  async function handleSaveDriveLink(e: React.FormEvent) {
    e.preventDefault();
    if (!board || !driveTitle.trim() || !driveUrl.trim() || isClient) return;
    setSavingDrive(true);
    try {
      const existingLinks: BoardDriveLink[] = board.drive_links || [];
      const nextLinks: BoardDriveLink[] = [
        ...existingLinks,
        {
          id: `drv-${Date.now().toString(36)}`,
          title: driveTitle.trim(),
          url: driveUrl.trim().startsWith('http') ? driveUrl.trim() : `https://${driveUrl.trim()}`,
          description: driveDesc.trim(),
          is_internal: driveInternal,
          created_at: new Date().toISOString(),
        },
      ];
      await api(`/boards/${board.id}/workspace-meta`, {
        method: 'PUT',
        body: JSON.stringify({ drive_links: nextLinks }),
      });
      setDriveTitle('');
      setDriveUrl('');
      setDriveDesc('');
      setDriveInternal(false);
      setDriveModalOpen(false);
      await loadProjectData();
    } finally {
      setSavingDrive(false);
    }
  }

  async function handleRemoveDriveLink(id: string) {
    if (!board || isClient) return;
    const nextLinks = (board.drive_links || []).filter((l) => l.id !== id);
    await api(`/boards/${board.id}/workspace-meta`, {
      method: 'PUT',
      body: JSON.stringify({ drive_links: nextLinks }),
    });
    await loadProjectData();
  }

  async function handleToggleProcessStep(stepId: string) {
    if (!board || isClient) return;
    const nextState = {
      ...(board.process_state || {}),
      [stepId]: !(board.process_state || {})[stepId],
    };
    setBoard({ ...board, process_state: nextState });
    await api(`/boards/${board.id}/workspace-meta`, {
      method: 'PUT',
      body: JSON.stringify({ process_state: nextState }),
    });
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!board || !eventTitle.trim() || isClient) return;
    setSavingEvent(true);
    try {
      await api('/events', {
        method: 'POST',
        body: JSON.stringify({
          title: eventTitle.trim(),
          description: eventDesc.trim(),
          event_date: eventDate,
          event_time: eventTime,
          type: eventType,
          client_id: board.client_id,
          board_id: board.id,
          owner_partner: board.portal_owner,
        }),
      });
      setEventTitle('');
      setEventDesc('');
      setEventFormOpen(false);
      await loadProjectData();
    } finally {
      setSavingEvent(false);
    }
  }

  async function handleCreateDemandFromSection(e: React.FormEvent) {
    e.preventDefault();
    if (!board || !newDemandTitle.trim()) return;
    setCreatingDemand(true);
    try {
      const colId = newDemandColId || columns[0]?.id;
      const res = await api<{ card: Card }>(`/boards/${board.id}/cards`, {
        method: 'POST',
        body: JSON.stringify({
          column_id: colId,
          title: newDemandTitle.trim(),
          description: newDemandDesc.trim(),
          priority: newDemandPriority,
          lead_user_id: board.lead_user_id,
        }),
      });
      setNewDemandTitle('');
      setNewDemandDesc('');
      setNewDemandModalOpen(false);
      await refreshAll();
      if (res.card) setSelectedCard(res.card);
    } finally {
      setCreatingDemand(false);
    }
  }

  async function handleDirectAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const targetId = attachTargetCardId || cards[0]?.id;
    if (!files.length || !targetId) return;
    setUploadingDirectAtt(true);
    try {
      for (const file of files) {
        const up = await uploadFile(file);
        await api(`/cards/${targetId}/attachments`, {
          method: 'POST',
          body: JSON.stringify({ ...up, is_internal: false }),
        });
      }
      await refreshAll();
    } finally {
      setUploadingDirectAtt(false);
      e.target.value = '';
    }
  }

  async function handleSendDirectComment(e: React.FormEvent) {
    e.preventDefault();
    const targetId = commentCardId || cards[0]?.id;
    if (!targetId || !commentDraft.trim()) return;
    setSendingComment(true);
    try {
      await api(`/cards/${targetId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: commentDraft.trim(),
          is_internal: !isClient && commentInternal,
        }),
      });
      setCommentDraft('');
      await refreshAll();
    } finally {
      setSendingComment(false);
    }
  }

  if (loading || !board) {
    return (
      <div className="w-full min-h-[78vh] aumi-glass-strong rounded-[28px] p-8 animate-pulse" />
    );
  }

  const completedColIds = new Set(
    columns
      .filter((c) => c.title.toLowerCase().includes('conclu') || (c.client_label || '').toLowerCase().includes('conclu'))
      .map((c) => c.id)
  );

  // Process steps aggregation from visible services or fallback steps
  const allProcessSteps = servicesMeta.flatMap((svc) =>
    (svc.process_steps || [])
      .filter((st) => st.active !== false)
      .map((st) => ({
        ...st,
        id: `${svc.id}:${st.id}`,
        service_name: svc.name,
      }))
  );
  const effectiveProcessSteps =
    allProcessSteps.length > 0
      ? allProcessSteps
      : DEFAULT_PROCESS_STEPS.map((st) => ({ ...st, service_name: board.title }));

  const processState = board.process_state || {};
  const completedProcessCount = effectiveProcessSteps.filter((st) => Boolean(processState[st.id])).length;
  const currentProcessStep =
    effectiveProcessSteps.find((st) => !processState[st.id]) ||
    effectiveProcessSteps[effectiveProcessSteps.length - 1];

  const totalDemandsCount = cards.length;
  const completedDemandsCount = cards.filter((c) => completedColIds.has(c.column_id)).length;
  const activeDemandsCount = totalDemandsCount - completedDemandsCount;
  const overallProgressPct =
    totalDemandsCount > 0
      ? Math.round((completedDemandsCount / totalDemandsCount) * 100)
      : effectiveProcessSteps.length > 0
      ? Math.round((completedProcessCount / effectiveProcessSteps.length) * 100)
      : 0;

  const pendingReturnCount = cards.filter(
    (c) =>
      c.approval_status === 'pending' ||
      c.content_status === 'complement_requested' ||
      (c.content_status === 'awaiting_content' && !completedColIds.has(c.column_id))
  ).length;
  const unreadSubmissionsCount = !isClient
    ? cards.filter((c) => c.content_status === 'submitted' && !c.read_at).length
    : 0;

  // Unread Mural Posts
  const unreadMuralPosts = muralPosts.filter((p) => !(p.read_by || []).includes(user.id));
  const unreadMuralCount = unreadMuralPosts.length;

  // Derived collections for Attachments, Comments
  const allAttachments = cards.flatMap((c) =>
    (c.attachments || []).map((att) => ({
      ...att,
      card_title: c.title,
      card_id: c.id,
      service_name: c.service_name,
    }))
  );

  const allComments = cards
    .flatMap((c) =>
      (c.comments || []).map((cm) => ({
        ...cm,
        card_title: c.title,
        card_id: c.id,
      }))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const clientDisplayName = board.client_name || user.name || 'Cliente';
  const muralParticipants = [
    ...partners.map((p) => ({
      id: p.id,
      name: p.name,
      role: 'partner' as const,
      partner_key: p.partner_key ?? null,
      avatar_url: p.avatar_url ?? null,
    })),
    ...(board.client_id
      ? [
          {
            id: board.client_id,
            name: clientDisplayName,
            role: 'client' as const,
            partner_key: null,
            avatar_url: null,
          },
        ]
      : []),
  ];
  const welcomeText =
    (board as unknown as { client_welcome?: string }).client_welcome ||
    portalDefaults?.welcome_message ||
    'Seja bem-vindo ao seu espaço de acompanhamento do projeto.';

  const filteredDemands = cards.filter((card) => {
    const q = demandsSearch.trim().toLowerCase();
    if (
      q &&
      !card.title.toLowerCase().includes(q) &&
      !card.description.toLowerCase().includes(q) &&
      !(card.service_name || '').toLowerCase().includes(q)
    ) {
      return false;
    }
    if (demandsColFilter !== 'all' && card.column_id !== demandsColFilter) return false;
    if (demandsLabelFilter !== 'all' && !(card.labels || []).includes(demandsLabelFilter)) return false;
    if (demandsOnlyUnread && (card.content_status !== 'submitted' || Boolean(card.read_at))) return false;
    return true;
  });

  // Combined calendar items (events + card due dates)
  const calendarTimeline = [
    ...events.map((ev) => ({
      id: ev.id,
      date: ev.event_date,
      time: ev.event_time || '—',
      title: ev.title,
      subtitle: ev.description || (ev.type === 'delivery' ? 'Entrega agendada' : ev.type === 'meeting' ? 'Reunião' : 'Marco do projeto'),
      kind: 'event' as const,
      card: null as Card | null,
    })),
    ...cards
      .filter((c) => c.due_date)
      .map((c) => ({
        id: `due-${c.id}`,
        date: c.due_date!,
        time: 'Prazo',
        title: c.title,
        subtitle: c.service_name || 'Demanda do projeto',
        kind: 'card' as const,
        card: c,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingDeadlines = calendarTimeline.filter((item) => item.date >= todayIso).slice(0, 3);
  const displayDeadlines = upcomingDeadlines.length > 0 ? upcomingDeadlines : calendarTimeline.slice(0, 3);

  // Effective documents for Briefing & Contrato/Proposta
  const savedBriefingInfo = board.briefing_info;
  const hasBriefingContent = Boolean(savedBriefingInfo?.file_url || savedBriefingInfo?.notes || savedBriefingInfo?.title);
  const briefingVisibleToClient = savedBriefingInfo?.client_visible !== false;

  const effectiveContractDoc = getEffectiveContractDoc(board.contract_info);
  const hasContractDoc = Boolean(effectiveContractDoc?.file_url || effectiveContractDoc?.notes || effectiveContractDoc?.validity);
  const contractVisibleToClient = effectiveContractDoc?.client_visible !== false;

  const effectiveProposalDoc = board.contract_info?.proposal_doc;
  const hasProposalDoc = Boolean(effectiveProposalDoc?.file_url || effectiveProposalDoc?.notes || effectiveProposalDoc?.validity);
  const proposalVisibleToClient = effectiveProposalDoc?.client_visible !== false;

  const artApprovalCards = cards.filter(isArtApprovalCard);
  const pendingDeliveriesCount = approvalDeliveries.filter(
    (d) => d.status === 'pending' || d.status === 'partially_approved' || d.status === 'changes_requested'
  ).length;
  const pendingArtApprovalsCount =
    approvalDeliveries.length > 0
      ? pendingDeliveriesCount
      : artApprovalCards.filter((c) => c.approval_status === 'pending').length;
  const activeNavMeta = PORTAL_NAV_ITEMS.find((item) => item.id === section) || PORTAL_NAV_ITEMS[0];

  function handleOpenNotificationItem(post: MuralPost) {
    const isUnread = !(post.read_by || []).includes(user.id);
    if (isUnread) {
      handleToggleMuralRead(post, true);
    }

    if (post.entity_type === 'approval_delivery' || post.event_type?.startsWith('approval_')) {
      setOpenDeliveryId(post.entity_id || null);
      navigateSection('aprovacao');
      return;
    }

    if (post.card_id) {
      const targetCard = cards.find((c) => c.id === post.card_id);
      if (targetCard) {
        setSelectedCard(targetCard);
        return;
      }
      if (post.event_type === 'card_comment') {
        navigateSection('comentarios');
        return;
      }
      navigateSection('demandas');
      return;
    }

    if (post.event_type === 'card_comment') {
      navigateSection('comentarios');
      return;
    }

    navigateSection('mural');
  }

  const renderSidebarContent = (compactIconsOnly = false) => (
    <div className={`flex flex-col min-h-full w-full ${compactIconsOnly ? 'p-2 items-center gap-3' : 'p-3.5 gap-4'}`}>
      {/* Active Project Glass Folder Card */}
      {compactIconsOnly ? (
        <button
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          title={`${clientDisplayName} — ${board.title} (${overallProgressPct}%) · Clique para expandir menu`}
          className="w-12 h-12 rounded-2xl bg-white/85 border border-white shadow-xs flex items-center justify-center hover:scale-105 transition-transform shrink-0"
        >
          <GlassFolderGraphic
            color="#EC97B7"
            size={36}
            initials={clientDisplayName.slice(0, 2).toUpperCase()}
          />
        </button>
      ) : (
        <div className="shrink-0 rounded-2xl bg-white/80 border border-white/95 p-3.5 space-y-3 shadow-[0_10px_24px_-14px_rgba(47,21,52,0.16)]">
          <div className="flex items-center gap-3">
            <GlassFolderGraphic
              color="#EC97B7"
              size={48}
              initials={clientDisplayName.slice(0, 2).toUpperCase()}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#EC2B82] truncate">
                {clientDisplayName}
              </p>
              <h2 className="text-[13px] font-extrabold text-[#2F1534] leading-tight line-clamp-2 mt-0.5">
                {board.title}
              </h2>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[#7A689C] truncate pr-2">
                {currentProcessStep?.title || 'Em andamento'}
              </span>
              <span className="font-extrabold text-[#EC2B82] tabular-nums shrink-0">{overallProgressPct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#F3ECF9] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7A689C] via-[#EC2B82] to-[#EC97B7] transition-all duration-500"
                style={{ width: `${overallProgressPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Primary Navigation List */}
      <div className={`flex-1 space-y-1 ${compactIconsOnly ? 'w-full flex flex-col items-center' : 'w-full'}`}>
        {!compactIconsOnly && (
          <div className="px-2.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A689C]/80">
              Navegação
            </p>
            <div className="hidden lg:flex items-center gap-1">
              {sidebarWidth !== 256 && (
                <button
                  type="button"
                  onClick={() => setSidebarWidth(256)}
                  title="Restaurar largura padrão do menu lateral"
                  className="p-1 rounded-md text-[#7A689C] hover:text-[#EC2B82] hover:bg-white/80 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Minimizar menu lateral"
                className="p-1 rounded-md text-[#7A689C] hover:text-[#EC2B82] hover:bg-white/80 transition-colors"
              >
                <PanelLeftClose className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <nav aria-label="Menu do Portal do Cliente" className={`space-y-1 ${compactIconsOnly ? 'w-full flex flex-col items-center' : ''}`}>
          {PORTAL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            const badgeCount =
              item.id === 'mural'
                ? unreadMuralCount
                : item.id === 'aprovacao'
                ? pendingArtApprovalsCount
                : item.id === 'demandas'
                ? unreadSubmissionsCount
                : 0;

            if (compactIconsOnly) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateSection(item.id)}
                  title={badgeCount > 0 ? `${item.label} (${badgeCount})` : item.label}
                  className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                    active
                      ? 'bg-white border border-[#BC9FE6]/65 shadow-[0_8px_18px_-10px_rgba(47,21,52,0.28)]'
                      : 'hover:bg-white/75 border border-transparent'
                  }`}
                >
                  <span
                    className={`w-8 h-8 rounded-[10px] flex items-center justify-center bg-gradient-to-br ${item.gradient} ${
                      item.iconTone || 'text-white'
                    } shadow-xs transition-transform ${active ? 'scale-105' : 'opacity-90'}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  {badgeCount > 0 && (
                    <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-[#EC2B82] text-white text-[9px] font-bold flex items-center justify-center absolute -top-1 -right-1 tabular-nums shadow-xs">
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateSection(item.id)}
                className={`w-full px-2.5 py-2 rounded-xl text-[12.5px] flex items-center justify-between gap-2 transition-all text-left ${
                  active
                    ? 'bg-white text-[#2F1534] font-extrabold border border-[#BC9FE6]/55 shadow-[0_8px_18px_-10px_rgba(47,21,52,0.24)]'
                    : 'text-[#2F1534]/80 hover:text-[#2F1534] hover:bg-white/65 font-semibold border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-7 h-7 rounded-[9px] flex items-center justify-center bg-gradient-to-br ${item.gradient} ${
                      item.iconTone || 'text-white'
                    } shadow-xs shrink-0 transition-transform ${active ? 'scale-105' : 'opacity-90'}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
                {badgeCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums shrink-0 ${
                      active
                        ? 'bg-[#EC2B82] text-white'
                        : 'bg-[#FDF2F6] text-[#EC2B82] border border-[#EC97B7]/50'
                    }`}
                  >
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Quick Folders / Expand Button */}
      {compactIconsOnly ? (
        <div className="mt-auto shrink-0 pt-2 pb-1 border-t border-[#7A689C]/12 w-full flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            title="Expandir menu lateral"
            className="w-10 h-10 rounded-xl bg-white/85 hover:bg-white border border-[#BC9FE6]/40 text-[#7A689C] hover:text-[#EC2B82] flex items-center justify-center transition-colors"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="mt-auto shrink-0 w-full pt-3 pb-1 border-t border-[#7A689C]/12 space-y-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-[#7A689C]/80">
            Pastas Rápidas
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigateSection('anexos')}
              className="px-2.5 py-2 rounded-xl bg-white/75 hover:bg-white border border-white/90 text-left transition-all"
            >
              <div className="flex items-center justify-between gap-1">
                <Paperclip className="w-3.5 h-3.5 text-[#EC2B82]" />
                <span className="text-[10px] font-bold text-[#7A689C] tabular-nums">{allAttachments.length}</span>
              </div>
              <p className="text-[11px] font-bold text-[#2F1534] mt-1 truncate">Anexos</p>
            </button>
            <button
              type="button"
              onClick={() => navigateSection('drive')}
              className="px-2.5 py-2 rounded-xl bg-white/75 hover:bg-white border border-white/90 text-left transition-all"
            >
              <div className="flex items-center justify-between gap-1">
                <Cloud className="w-3.5 h-3.5 text-[#7A689C]" />
                <span className="text-[10px] font-bold text-[#7A689C] tabular-nums">
                  {(board.drive_links || []).length}
                </span>
              </div>
              <p className="text-[11px] font-bold text-[#2F1534] mt-1 truncate">Drive</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`w-full flex flex-col gap-3 ${
        portalExpanded
          ? 'lg:h-[calc(100vh-24px)]'
          : mode === 'client'
          ? 'lg:h-[calc(100vh-36px)]'
          : 'lg:h-[calc(100vh-146px)]'
      }`}
    >
      {/* Preview Banner when internal team inspects client portal */}
      {onExitPreview && (
        <div className="rounded-2xl bg-[#2F1534] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-sm shrink-0">
          <span>
            Pré-visualizando a visão do cliente de <strong>{clientDisplayName}</strong> (itens internos e financeiros ocultos)
          </span>
          <button
            type="button"
            onClick={onExitPreview}
            className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao estúdio</span>
          </button>
        </div>
      )}

      {/* ==================== MACOS FINDER LIQUID GLASS WINDOW ==================== */}
      <div className="w-full flex-1 min-h-0 aumi-finder-window rounded-[28px] overflow-hidden flex flex-col">
        {/* ROW 1: macOS Traffic Lights + Arc/Safari-Style Project Tabs + Window Actions */}
        <header className="aumi-finder-chrome px-3.5 sm:px-5 pt-2.5 pb-2 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between gap-2.5">
            {/* Left: Traffic Lights, Mobile Sidebar Toggle, Back, Project Tabs */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="hidden sm:flex items-center gap-1.5 pr-1 shrink-0" aria-hidden="true">
                <span className="w-3 h-3 rounded-full bg-[#FF5F57] border border-black/10" />
                <span className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-black/10" />
                <span className="w-3 h-3 rounded-full bg-[#28C840] border border-black/10" />
              </div>

              {/* Mobile Finder Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="lg:hidden p-2 rounded-xl aumi-liquid-control text-[#2F1534] hover:text-[#EC2B82] shrink-0"
                aria-label="Abrir navegação do portal"
              >
                <PanelLeft className="w-4 h-4" />
              </button>

              {/* Desktop Finder Sidebar Collapse / Expand Toggle */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="hidden lg:inline-flex items-center justify-center p-2 rounded-xl aumi-liquid-control hover:bg-white text-[#2F1534] hover:text-[#EC2B82] transition-colors shrink-0"
                title={sidebarCollapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral'}
                aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral'}
              >
                {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
              </button>

              {onBackToProjects && (
                <button
                  type="button"
                  onClick={onBackToProjects}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl aumi-liquid-control hover:bg-white text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] transition-colors whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Projetos</span>
                </button>
              )}

              {/* Arc / Safari-Inspired Glass Project Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0 py-0.5">
                {availableBoards.slice(0, 4).map((b) => {
                  const isCurrent = b.id === board.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) onSwitchBoard(b.id);
                      }}
                      className={`px-3 py-1.5 rounded-2xl text-xs inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 max-w-[210px] ${
                        isCurrent
                          ? 'aumi-finder-tab-active text-[#2F1534] font-extrabold'
                          : 'bg-white/40 hover:bg-white/75 text-[#2F1534]/70 hover:text-[#2F1534] font-semibold border border-white/50'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                          isCurrent
                            ? 'bg-[#2F1534] text-[#EC97B7]'
                            : 'bg-[#F3ECF9] text-[#7A689C]'
                        }`}
                      >
                        <AumiLogoMark size={13} />
                      </span>
                      <span className="truncate">{b.title}</span>
                    </button>
                  );
                })}

                {availableBoards.length > 4 && (
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setProjectMenuOpen((v) => !v)}
                      className="px-2.5 py-1.5 rounded-xl aumi-liquid-control text-xs font-bold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1"
                    >
                      <span>+{availableBoards.length - 4}</span>
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {projectMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setProjectMenuOpen(false)} />
                        <div className="absolute left-0 top-10 w-64 rounded-2xl bg-white/95 backdrop-blur-xl border border-[#BC9FE6]/40 shadow-2xl z-30 py-1.5 text-xs">
                          <p className="px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7A689C]">
                            Todos os projetos
                          </p>
                          {availableBoards.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setProjectMenuOpen(false);
                                onSwitchBoard(b.id);
                              }}
                              className={`w-full text-left px-3.5 py-2 flex items-center justify-between hover:bg-[#FAF7FC] ${
                                b.id === board.id ? 'text-[#EC2B82] font-bold bg-[#FDF2F6]/70' : 'text-[#2F1534]'
                              }`}
                            >
                              <span className="truncate">{b.title}</span>
                              {b.id === board.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Partner Tools, Help, Notifications, Profile/Logout */}
            <div className="flex items-center gap-1.5 shrink-0">
              {!isClient && (
                <>
                  <button
                    type="button"
                    onClick={() => setLabelsManagerOpen(true)}
                    className="px-2.5 py-1.5 rounded-xl aumi-liquid-control hover:bg-white text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    title="Gerenciar etiquetas"
                  >
                    <Tag className="w-3.5 h-3.5 text-[#7A689C]" />
                    <span className="hidden xl:inline">Etiquetas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenAccessTrigger((t) => t + 1)}
                    className="px-2.5 py-1.5 rounded-xl aumi-liquid-control hover:bg-white text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    title="Link de convite e acesso do cliente"
                  >
                    <Link2 className="w-3.5 h-3.5 text-[#E1754C]" />
                    <span className="hidden xl:inline">Acesso</span>
                  </button>
                  {board.shared_with_client && onPreviewClientPortal && (
                    <button
                      type="button"
                      onClick={() => onPreviewClientPortal(board.client_id)}
                      className="px-2.5 py-1.5 rounded-xl bg-[#FDF2F6] hover:bg-[#EC2B82] text-[#EC2B82] hover:text-white border border-[#EC97B7]/50 text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                      title="Ver como o cliente enxerga este projeto"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">Visão cliente</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenSettingsTrigger((t) => t + 1)}
                    className="p-2 rounded-xl aumi-liquid-control hover:bg-white text-[#2F1534]/80 hover:text-[#EC2B82] transition-colors shrink-0"
                    title="Configurações do projeto"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => navigateSection('comentarios')}
                className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#F3ECF9]/90 hover:bg-[#7A689C] text-[#7A689C] hover:text-white border border-[#BC9FE6]/40 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                title="Falar com a equipe do projeto"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">Ajuda</span>
              </button>

              {/* Expand / Restore Portal Window Height */}
              <button
                type="button"
                onClick={() => setPortalExpanded((v) => !v)}
                className="hidden lg:inline-flex w-8 h-8 rounded-xl aumi-liquid-control hover:bg-white items-center justify-center text-[#7A689C] hover:text-[#EC2B82] transition-colors shrink-0"
                title={portalExpanded ? 'Restaurar tamanho da janela' : 'Expandir área do portal'}
              >
                {portalExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>

              <div className="flex items-center gap-1.5 pl-0.5">
                <div
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-[#BC9FE6] via-[#EC97B7] to-[#EC2B82] text-white font-bold text-[11px] flex items-center justify-center shrink-0 shadow-xs border border-white/80"
                  title={isClient ? clientDisplayName : user.name}
                >
                  {(isClient ? clientDisplayName : user.name).slice(0, 2).toUpperCase()}
                </div>
                {onLogout && isClient && !onExitPreview && (
                  <button
                    type="button"
                    onClick={onLogout}
                    title="Sair do portal"
                    className="p-2 rounded-xl aumi-liquid-control text-[#232122]/65 hover:text-[#EC2B82]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: Finder History Navigation + Breadcrumb + Quick Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#7A689C]/10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={handleHistoryBack}
                  disabled={historyIdx <= 0}
                  aria-label="Voltar seção"
                  className="w-7 h-7 rounded-lg aumi-liquid-control flex items-center justify-center text-[#2F1534] disabled:opacity-35 hover:bg-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleHistoryForward}
                  disabled={historyIdx >= sectionHistory.length - 1}
                  aria-label="Avançar seção"
                  className="w-7 h-7 rounded-lg aumi-liquid-control flex items-center justify-center text-[#2F1534] disabled:opacity-35 hover:bg-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => refreshAll(false)}
                  aria-label="Atualizar dados do projeto"
                  className="w-7 h-7 rounded-lg aumi-liquid-control flex items-center justify-center text-[#7A689C] hover:text-[#EC2B82] hover:bg-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[11.5px] text-[#7A689C] min-w-0 truncate">
                <button
                  type="button"
                  onClick={() => navigateSection('visao_geral')}
                  className="font-semibold hover:text-[#2F1534] transition-colors truncate hidden sm:inline"
                >
                  {clientDisplayName}
                </button>
                <ChevronRight className="w-3 h-3 shrink-0 opacity-50 hidden sm:inline" />
                <span className="font-bold text-[#2F1534] truncate">{activeNavMeta.label}</span>
              </div>
            </div>

            {/* Quick Finder Search */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!finderQuickSearch.trim()) return;
                setDemandsSearch(finderQuickSearch.trim());
                navigateSection('demandas');
              }}
              className="relative w-full sm:w-56 md:w-64"
            >
              <Search className="w-3.5 h-3.5 text-[#7A689C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={finderQuickSearch}
                onChange={(e) => {
                  setFinderQuickSearch(e.target.value);
                  if (section === 'demandas') setDemandsSearch(e.target.value);
                }}
                placeholder="Buscar demandas..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/75 border border-white/90 text-xs text-[#2F1534] placeholder:text-[#7A689C]/70 focus:outline-none focus:bg-white focus:border-[#EC97B7] transition-all"
              />
            </form>
          </div>
        </header>

        {/* FINDER SPLIT BODY: Left Collapsible/Resizable Sidebar + Main Scrollable Content Area */}
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
          {/* AREA A: Desktop macOS Finder Sidebar */}
          <aside
            style={{ width: sidebarCollapsed ? 72 : sidebarWidth }}
            className="hidden lg:flex shrink-0 aumi-finder-sidebar border-r border-[#7A689C]/12 overflow-y-auto flex-col transition-[width] duration-150"
          >
            {renderSidebarContent(sidebarCollapsed)}
          </aside>

          {/* Subtle Drag Handle to Resize Left Sidebar */}
          {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Redimensionar largura do menu lateral"
              onMouseDown={(e) => {
                e.preventDefault();
                setResizingSidebar(true);
              }}
              onDoubleClick={() => setSidebarWidth(256)}
              title="Arraste para ajustar a largura · Clique duplo para restaurar"
              className={`hidden lg:block w-1.5 cursor-col-resize shrink-0 transition-colors ${
                resizingSidebar ? 'bg-[#EC2B82]/55' : 'bg-transparent hover:bg-[#EC97B7]/45'
              }`}
            />
          )}

          {/* Mobile Slide-Over Finder Sidebar Drawer */}
          {mobileSidebarOpen && (
            <div className="fixed inset-0 z-50 lg:hidden flex">
              <div
                className="fixed inset-0 bg-[#2F1534]/45 backdrop-blur-xs"
                onClick={() => setMobileSidebarOpen(false)}
              />
              <aside className="relative z-10 w-72 max-w-[85vw] h-full aumi-finder-sidebar bg-white/95 border-r border-white shadow-2xl overflow-y-auto flex flex-col">
                <div className="px-4 py-3 flex items-center justify-between border-b border-[#7A689C]/12">
                  <span className="text-xs font-extrabold text-[#2F1534]">Menu do Projeto</span>
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(false)}
                    className="w-7 h-7 rounded-lg bg-white/80 flex items-center justify-center text-[#2F1534]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {renderSidebarContent()}
              </aside>
            </div>
          )}

          {/* AREA B: Main Scrollable Content Pane (Always resets scroll to top on section switch!) */}
          <div
            ref={mainScrollRef}
            className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 space-y-5 bg-gradient-to-br from-[#FCF6EC]/55 via-white/50 to-[#FDF2F6]/50"
          >
            {/* ==================== 1. VISÃO GERAL ==================== */}
            {section === 'visao_geral' && (
              <div className="space-y-5">
                {/* 1. SAUDAÇÃO E IDENTIFICAÇÃO DO CLIENTE (Top Prominence, Home-aligned Hero) */}
                <section className="rounded-[26px] bg-gradient-to-br from-[#7A689C] via-[#5C447E] to-[#2F1534] text-white p-5 sm:p-7 relative overflow-hidden shadow-[0_18px_42px_-16px_rgba(47,21,52,0.42)]">
                  <div
                    className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none opacity-65"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(236,151,183,0.52) 0%, rgba(236,43,130,0.22) 55%, transparent 72%)',
                    }}
                  />
                  <div
                    className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full pointer-events-none opacity-45"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(225,117,76,0.34) 0%, rgba(218,217,148,0.22) 55%, transparent 74%)',
                    }}
                  />

                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
                    <div className="space-y-3 max-w-2xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] font-bold text-[#DAD994]">
                          <Sparkles className="w-3 h-3" />
                          Portal do Cliente · {board.title}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-white/12 border border-white/20 text-[11px] font-semibold text-[#FCF6EC]">
                          Etapa: {currentProcessStep?.title || 'Em produção'}
                        </span>
                      </div>

                      <div>
                        <h1 className="font-editorial text-2xl sm:text-[34px] font-extrabold tracking-tight leading-tight text-white">
                          Olá, {clientDisplayName}!
                        </h1>
                        <p className="text-[13.5px] text-white/82 leading-relaxed mt-1.5 max-w-xl">
                          {welcomeText}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={scrollToKanban}
                          className="px-3.5 py-2 rounded-xl aumi-liquid-pink-pill text-white text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-105 transition-all whitespace-nowrap shrink-0"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                          <span>Ir ao Quadro Kanban</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateSection('briefing')}
                          className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                        >
                          Briefing
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateSection('contrato')}
                          className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                        >
                          Contrato e Proposta
                        </button>
                      </div>
                    </div>

                    {/* Right Side Visual Folder + Compact Progress Pill */}
                    <div className="flex md:flex-col items-center md:items-end justify-between gap-3 shrink-0">
                      <GlassFolderGraphic
                        color="#EC97B7"
                        size={74}
                        badgeText={`${overallProgressPct}%`}
                      />
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <span className="px-2.5 py-1 rounded-xl bg-white/15 border border-white/20 text-[#FCF6EC] tabular-nums">
                          {activeDemandsCount} ativas
                        </span>
                        <span className="px-2.5 py-1 rounded-xl bg-[#DAD994]/90 text-[#2F1534] tabular-nums">
                          {pendingArtApprovalsCount} artes pendentes
                        </span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* 2. MURAL DO PROJETO (Mini-app macOS em duas colunas, preservando histórico e integrações) */}
                <section>
                  {collapsedSections.mural ? (
                    <div className="rounded-[22px] bg-[#EFE5FA] border border-[#DCC8F4] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F46E9D]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#E5C95C]" />
                          <span className="w-2.5 h-2.5 rounded-full bg-[#68C481]" />
                        </div>
                        <span className="w-8 h-8 rounded-xl bg-[#7A689C] text-white flex items-center justify-center shrink-0">
                          <MessageSquareText className="w-4 h-4" />
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-[15px] font-extrabold text-[#2F1534] tracking-tight">
                            Mural do Projeto
                          </h2>
                          {unreadMuralCount > 0 && (
                            <span className="px-2 py-0.5 rounded-full bg-[#EC2B82] text-white text-[10px] font-bold tabular-nums">
                              {unreadMuralCount} {unreadMuralCount === 1 ? 'nova' : 'novas'}
                            </span>
                          )}
                          <span className="text-[11px] text-[#7A689C] font-medium">
                            ({muralPosts.length} {muralPosts.length === 1 ? 'publicação' : 'publicações'})
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleOverviewSection('mural')}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-[#FAF6FE] border border-[#D8C4F2] text-xs font-bold text-[#6B548E] hover:text-[#2F1534] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <span>Expandir Mural</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <ProjectMuralWidget
                      compact
                      boardId={board.id}
                      clientId={board.client_id}
                      user={user}
                      isClient={isClient}
                      posts={muralPosts}
                      participants={muralParticipants}
                      onPostsChange={setMuralPosts}
                      onRefresh={loadProjectData}
                      onOpenLinkedItem={handleOpenNotificationItem}
                      onOpenFullMural={() => navigateSection('mural')}
                      headerRightExtra={
                        <button
                          type="button"
                          onClick={() => toggleOverviewSection('mural')}
                          title="Recolher Mural"
                          className="p-1.5 rounded-xl bg-white hover:bg-[#FAF6FE] border border-[#DFCCF5] text-[#7A689C] hover:text-[#2F1534] transition-colors"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                      }
                    />
                  )}
                </section>

                {/* 3. APROVAÇÕES (Collapsible wrapper + Clean Delivery Cards) */}
                <section className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                      Central de Aprovações ({approvalDeliveries.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleOverviewSection('aprovacao')}
                      className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white border border-[#EC97B7]/40 text-[11px] font-bold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1 transition-colors"
                    >
                      <span>{collapsedSections.aprovacao ? 'Expandir Aprovações' : 'Recolher Aprovações'}</span>
                      {collapsedSections.aprovacao ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronUp className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  {!collapsedSections.aprovacao && (
                    <ArtApprovalSection
                      boardId={boardId}
                      cards={cards}
                      columns={columns}
                      deliveries={approvalDeliveries}
                      mode={mode}
                      allowClientApprovals={portalDefaults?.allow_client_approvals !== false}
                      compact={true}
                      onOpenDelivery={(deliveryId) => {
                        setOpenDeliveryId(deliveryId);
                        navigateSection('aprovacao');
                      }}
                      onOpenCard={(card) => setSelectedCard(card)}
                      onViewAll={() => navigateSection('aprovacao')}
                      onUpdated={() => refreshAll()}
                    />
                  )}
                </section>

                {/* 4. QUADRO KANBAN (Collapsible + 100% preserved functionality inside Finder flow) */}
                <section id="portal-kanban-section" className="scroll-mt-4 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                      Quadro de Demandas (Kanban)
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleOverviewSection('kanban')}
                      className="px-2.5 py-1 rounded-lg bg-white/80 hover:bg-white border border-[#BC9FE6]/35 text-[11px] font-bold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1 transition-colors"
                    >
                      <span>{collapsedSections.kanban ? 'Expandir Kanban' : 'Recolher Kanban'}</span>
                      {collapsedSections.kanban ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {!collapsedSections.kanban && (
                    <KanbanBoardView
                      key={`${boardId}-${kanbanRefreshKey}`}
                      boardId={boardId}
                      user={user}
                      partners={partners}
                      folders={folders}
                      settings={settings}
                      availableLabels={studioLabels}
                      mode={mode}
                      embedded={true}
                      portalDefaults={portalDefaults}
                      openAccessTrigger={openAccessTrigger}
                      openSettingsTrigger={openSettingsTrigger}
                      onOpenCalendar={() => navigateSection('calendario')}
                      onViewAllDemands={(colId) => {
                        if (colId) setDemandsColFilter(colId);
                        navigateSection('demandas');
                      }}
                      onCardAction={() => loadProjectData()}
                      onBack={onBackToProjects}
                      onLabelsUpdated={(updated) => setStudioLabels(updated)}
                    />
                  )}
                </section>

                {/* AREA C: ÁREA COMPLEMENTAR ORGANIZADA (Collapsible Finder Summary Strip) */}
                <section className="rounded-[24px] bg-white/82 backdrop-blur-xl border border-white/95 p-5 shadow-[0_12px_30px_-16px_rgba(47,21,52,0.16)] space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#7A689C]">
                      Resumo, Prazos & Pastas Rápidas
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleOverviewSection('complementar')}
                      className="px-2.5 py-1 rounded-lg bg-[#FAF7FC] hover:bg-[#F3ECF9] border border-[#BC9FE6]/35 text-[11px] font-bold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1 transition-colors"
                    >
                      <span>{collapsedSections.complementar ? 'Expandir' : 'Recolher'}</span>
                      {collapsedSections.complementar ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {!collapsedSections.complementar && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 divide-y lg:divide-y-0 lg:divide-x divide-[#7A689C]/12">
                    {/* Evolução & Sinais */}
                    <div className="lg:col-span-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7A689C] to-[#BC9FE6] text-white flex items-center justify-center">
                            <Layers className="w-3.5 h-3.5" />
                          </span>
                          <h3 className="text-sm font-extrabold text-[#2F1534]">Evolução das Entregas</h3>
                        </div>
                        <span className="text-lg font-extrabold text-[#EC2B82] tabular-nums">
                          {overallProgressPct}%
                        </span>
                      </div>

                      <div className="h-2 rounded-full bg-[#F3ECF9] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#7A689C] via-[#EC2B82] to-[#EC97B7] transition-all duration-500"
                          style={{ width: `${overallProgressPct}%` }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                        <button
                          type="button"
                          onClick={() => navigateSection('demandas')}
                          className="p-2.5 rounded-xl bg-[#FAF7FC] hover:bg-[#F3ECF9] text-left transition-colors"
                        >
                          <p className="text-[10.5px] font-semibold text-[#7A689C]">Demandas concluídas</p>
                          <p className="text-sm font-extrabold text-[#2F1534] mt-0.5">
                            {completedDemandsCount} / {totalDemandsCount}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => navigateSection('processo')}
                          className="p-2.5 rounded-xl bg-[#FDF2F6]/80 hover:bg-[#FDF2F6] text-left transition-colors"
                        >
                          <p className="text-[10.5px] font-semibold text-[#EC2B82]">Etapas do processo</p>
                          <p className="text-sm font-extrabold text-[#2F1534] mt-0.5">
                            {completedProcessCount} / {effectiveProcessSteps.length}
                          </p>
                        </button>
                      </div>

                      {!isClient && unreadSubmissionsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setDemandsOnlyUnread(true);
                            navigateSection('demandas');
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-[#FDF0E8] border border-[#E1754C]/40 text-xs font-bold text-[#B84C24] flex items-center justify-between gap-2 hover:bg-[#E1754C] hover:text-white transition-colors"
                        >
                          <span>{unreadSubmissionsCount} envios externos aguardando visualização</span>
                          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                    </div>

                    {/* Próximos Prazos */}
                    <div className="lg:col-span-4 pt-4 lg:pt-0 lg:pl-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#E1754C] to-[#DAD994] text-[#2F1534] flex items-center justify-center">
                            <CalendarIcon className="w-3.5 h-3.5" />
                          </span>
                          <h3 className="text-sm font-extrabold text-[#2F1534]">Próximos Prazos</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigateSection('calendario')}
                          className="text-xs font-bold text-[#EC2B82] hover:underline"
                        >
                          Calendário →
                        </button>
                      </div>

                      {displayDeadlines.length === 0 ? (
                        <p className="text-xs text-[#232122]/55 py-2">
                          Nenhum prazo ou entrega agendada no momento.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {displayDeadlines.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => (item.card ? setSelectedCard(item.card) : navigateSection('calendario'))}
                              className="w-full text-left px-3 py-2 rounded-xl bg-[#FAF7FC] hover:bg-[#FDF2F6] border border-[#BC9FE6]/25 flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[#2F1534] truncate">{item.title}</p>
                                <p className="text-[10.5px] text-[#7A689C] truncate">{item.subtitle}</p>
                              </div>
                              <span className="px-2 py-0.5 rounded-lg bg-white border border-[#BC9FE6]/35 text-[10.5px] font-bold text-[#EC2B82] shrink-0 tabular-nums">
                                {formatShortDateBR(item.date)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Pastas & Documentos Rápidos */}
                    <div className="lg:col-span-4 pt-4 lg:pt-0 lg:pl-5 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#EC2B82] to-[#EC97B7] text-white flex items-center justify-center">
                            <FolderIcon className="w-3.5 h-3.5" />
                          </span>
                          <h3 className="text-sm font-extrabold text-[#2F1534]">Pastas do Projeto</h3>
                        </div>
                        <span className="text-[11px] font-semibold text-[#7A689C] tabular-nums">
                          {allAttachments.length} arquivos
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { id: 'briefing', label: 'Briefing', color: '#BC9FE6' },
                            { id: 'contrato', label: 'Contrato', color: '#EC97B7' },
                            { id: 'anexos', label: 'Anexos', color: '#E1754C' },
                            { id: 'drive', label: 'Drive', color: '#DAD994' },
                          ] as const
                        ).map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => navigateSection(folder.id)}
                            className="group px-2.5 py-2 rounded-xl bg-[#FAF7FC] hover:bg-white border border-[#BC9FE6]/25 hover:border-[#EC97B7]/70 flex items-center gap-2 transition-all text-left"
                          >
                            <GlassFolderGraphic color={folder.color} size={28} />
                            <span className="text-xs font-bold text-[#2F1534] truncate">{folder.label}</span>
                          </button>
                        ))}
                      </div>

                      {allAttachments.length > 0 && (
                        <div className="pt-1.5 border-t border-[#7A689C]/10 space-y-1">
                          {allAttachments.slice(0, 2).map((att) => (
                            <a
                              key={att.id}
                              href={att.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between gap-2 text-[11px] text-[#2F1534] hover:text-[#EC2B82] transition-colors"
                            >
                              <span className="truncate font-medium">• {att.original_name}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </section>
              </div>
            )}

            {/* ==================== 1B. APROVAÇÃO DE ARTES (Dedicated Full Tab) ==================== */}
            {section === 'aprovacao' && (
              <ArtApprovalSection
                boardId={boardId}
                cards={cards}
                columns={columns}
                deliveries={approvalDeliveries}
                mode={mode}
                allowClientApprovals={portalDefaults?.allow_client_approvals !== false}
                compact={false}
                initialOpenDeliveryId={openDeliveryId}
                onClearInitialDelivery={() => setOpenDeliveryId(null)}
                onOpenCard={(card) => setSelectedCard(card)}
                onUpdated={() => refreshAll()}
              />
            )}

          {/* ==================== 2. MURAL ==================== */}
          {section === 'mural' && (
            <ProjectMuralWidget
              boardId={board.id}
              clientId={board.client_id}
              user={user}
              isClient={isClient}
              posts={muralPosts}
              participants={muralParticipants}
              onPostsChange={setMuralPosts}
              onRefresh={loadProjectData}
              onOpenLinkedItem={handleOpenNotificationItem}
            />
          )}

          {/* ==================== 3. PROCESSO ==================== */}
          {section === 'processo' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-[#F3ECF9] to-[#FDF2F6] border border-[#BC9FE6]/40 p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-[#2F1534]">Processo de Criação</h2>
                  <p className="text-xs text-[#232122]/65 mt-0.5">
                    Etapas dos serviços contratados neste projeto e andamento atual.
                  </p>
                </div>
                <span className="px-3.5 py-1.5 rounded-xl bg-white border border-[#BC9FE6]/35 text-xs font-bold text-[#7A689C]">
                  Etapa atual: {currentProcessStep?.title}
                </span>
              </div>

              <div className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-5 space-y-3">
                {effectiveProcessSteps.map((step, idx) => {
                  const done = Boolean(processState[step.id]);
                  const isCurrent = currentProcessStep?.id === step.id && !done;
                  return (
                    <div
                      key={step.id}
                      className={`p-4 rounded-2xl border flex items-start justify-between gap-4 transition-all ${
                        isCurrent
                          ? 'bg-[#FDF2F6]/70 border-[#EC2B82]/45'
                          : done
                          ? 'bg-[#ECFDF5]/65 border-[#22C55E]/30'
                          : 'bg-[#FAF7FC] border-black/[0.06]'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <button
                          type="button"
                          disabled={isClient}
                          onClick={() => handleToggleProcessStep(step.id)}
                          className={`w-8 h-8 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            done
                              ? 'bg-[#22C55E] text-white'
                              : isCurrent
                              ? 'bg-[#EC2B82] text-white'
                              : 'bg-white border border-[#BC9FE6]/50 text-[#7A689C]'
                          }`}
                        >
                          {done ? <Check className="w-4 h-4" /> : idx + 1}
                        </button>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[#2F1534]">{step.title}</p>
                            <span className="px-2 py-0.5 rounded-md bg-white border border-black/[0.06] text-[10px] font-semibold text-[#7A689C]">
                              {step.service_name}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded-md bg-[#EC2B82] text-white text-[10px] font-bold">
                                Em andamento
                              </span>
                            )}
                          </div>
                          {step.description && (
                            <p className="text-xs text-[#232122]/70 mt-1">{step.description}</p>
                          )}
                        </div>
                      </div>

                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => handleToggleProcessStep(step.id)}
                          className={`px-3 py-1.5 rounded-xl text-[11px] font-bold shrink-0 ${
                            done
                              ? 'bg-white border border-[#22C55E]/40 text-[#15803D]'
                              : 'bg-[#2F1534] text-white hover:bg-[#EC2B82]'
                          }`}
                        >
                          {done ? 'Concluída' : 'Marcar concluída'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== 4. DEMANDAS ==================== */}
          {section === 'demandas' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 text-[#7A689C] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={demandsSearch}
                      onChange={(e) => setDemandsSearch(e.target.value)}
                      placeholder="Buscar demanda ou serviço..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                  <select
                    value={demandsColFilter}
                    onChange={(e) => setDemandsColFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="all">Todas as etapas</option>
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {isClient ? c.client_label || c.title : c.title}
                      </option>
                    ))}
                  </select>
                  <select
                    value={demandsLabelFilter}
                    onChange={(e) => setDemandsLabelFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="all">Todas etiquetas</option>
                    {studioLabels.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => setDemandsOnlyUnread((v) => !v)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                        demandsOnlyUnread
                          ? 'bg-[#EC2B82] text-white border-[#EC2B82]'
                          : 'bg-[#FAF7FC] text-[#7A689C] border-black/10'
                      }`}
                    >
                      Não lidos ({unreadSubmissionsCount})
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setNewDemandModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nova demanda</span>
                </button>
              </div>

              {filteredDemands.length === 0 ? (
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 text-center text-sm text-[#232122]/55">
                  Nenhuma demanda encontrada com os filtros atuais.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredDemands.map((card) => {
                    const col = columns.find((c) => c.id === card.column_id);
                    const lead = partners.find((p) => p.id === card.lead_user_id);
                    const isDone = col ? completedColIds.has(col.id) : false;
                    return (
                      <div
                        key={card.id}
                        onClick={() => setSelectedCard(card)}
                        className="rounded-2xl bg-white border border-[#BC9FE6]/28 hover:border-[#EC2B82] p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-all shadow-xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: col?.color || '#7A689C' }}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-bold text-[#2F1534] truncate">{card.title}</p>
                              {!isClient && card.content_status === 'submitted' && !card.read_at && (
                                <span className="px-2 py-0.5 rounded-md bg-[#EC2B82] text-white text-[10px] font-bold">
                                  Novo envio
                                </span>
                              )}
                              {card.read_at && (
                                <span className="px-2 py-0.5 rounded-md bg-[#ECFDF5] text-[#15803D] text-[10px] font-semibold">
                                  ✓ Lido
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
                            <p className="text-xs text-[#7A689C] mt-0.5">
                              {col ? (isClient ? col.client_label || col.title : col.title) : 'Etapa'}
                              {card.service_name ? ` · ${card.service_name}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {lead && (
                            <PartnerAvatar
                              name={lead.name}
                              partnerKey={lead.partner_key}
                              avatarUrl={lead.avatar_url}
                              size="xs"
                            />
                          )}
                          {isDone ? (
                            <span className="px-2.5 py-1 rounded-lg bg-[#DCFCE7] text-[#15803D] text-xs font-bold">
                              Concluída
                            </span>
                          ) : card.due_date ? (
                            <span className="px-2.5 py-1 rounded-lg bg-[#FAF7FC] text-[#7A689C] text-xs font-semibold tabular-nums">
                              {formatShortDateBR(card.due_date)}
                            </span>
                          ) : null}
                          <ChevronRight className="w-4 h-4 text-[#232122]/35" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==================== 5. CALENDÁRIO ==================== */}
          {section === 'calendario' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-[#F3ECF9] to-[#FDF2F6] border border-[#BC9FE6]/40 p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-[#2F1534]">Calendário &amp; Prazos do Projeto</h2>
                  <p className="text-xs text-[#232122]/65 mt-0.5">
                    Marcos agendados, entregas previstas e prazos das demandas.
                  </p>
                </div>
                {!isClient && (
                  <button
                    type="button"
                    onClick={() => setEventFormOpen((v) => !v)}
                    className="px-4 py-2.5 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{eventFormOpen ? 'Fechar' : 'Agendar marco'}</span>
                  </button>
                )}
              </div>

              {!isClient && eventFormOpen && (
                <form
                  onSubmit={handleCreateEvent}
                  className="rounded-2xl bg-white border border-[#BC9FE6]/35 p-5 grid grid-cols-1 sm:grid-cols-12 gap-3"
                >
                  <input
                    type="text"
                    required
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Título do evento ou entrega..."
                    className="sm:col-span-5 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="sm:col-span-3 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <input
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as 'meeting' | 'deadline' | 'delivery' | 'internal')}
                    className="sm:col-span-2 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="delivery">Entrega</option>
                    <option value="meeting">Reunião</option>
                    <option value="deadline">Prazo</option>
                    <option value="internal">Interno</option>
                  </select>
                  <input
                    type="text"
                    value={eventDesc}
                    onChange={(e) => setEventDesc(e.target.value)}
                    placeholder="Observação opcional..."
                    className="sm:col-span-10 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={savingEvent}
                    className="sm:col-span-2 px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
                  >
                    {savingEvent ? 'Salvando...' : 'Salvar'}
                  </button>
                </form>
              )}

              {calendarTimeline.length === 0 ? (
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 text-center text-sm text-[#232122]/55">
                  Nenhum prazo ou compromisso registrado neste projeto ainda.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {calendarTimeline.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => item.card && setSelectedCard(item.card)}
                      className={`rounded-2xl bg-white border border-[#BC9FE6]/30 p-4 flex items-center justify-between gap-3 ${
                        item.card ? 'cursor-pointer hover:border-[#EC2B82]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-2xl bg-[#F3ECF9] text-[#7A689C] flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold uppercase">
                            {formatShortDateBR(item.date).split(' ')[1] || ''}
                          </span>
                          <span className="text-base font-extrabold text-[#2F1534] leading-none">
                            {item.date.slice(8, 10)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#2F1534] truncate">{item.title}</p>
                          <p className="text-xs text-[#232122]/60 truncate">{item.subtitle}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#FDF2F6] text-[#EC2B82] text-[11px] font-bold shrink-0 tabular-nums">
                        {item.time}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== 6. ANEXOS ==================== */}
          {section === 'anexos' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-[#2F1534]">Arquivos &amp; Anexos ({allAttachments.length})</h2>
                  <p className="text-xs text-[#232122]/60">
                    Todos os arquivos enviados nas demandas deste projeto.
                  </p>
                </div>

                {cards.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={attachTargetCardId || cards[0]?.id}
                      onChange={(e) => setAttachTargetCardId(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC] max-w-[200px]"
                    >
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                    <label className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>{uploadingDirectAtt ? 'Enviando...' : 'Enviar arquivo'}</span>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleDirectAttachmentUpload}
                      />
                    </label>
                  </div>
                )}
              </div>

              {allAttachments.length === 0 ? (
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 text-center text-sm text-[#232122]/55">
                  Nenhum anexo enviado neste projeto ainda.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {allAttachments.map((att) => {
                    const isImg = att.mime_type?.startsWith('image/');
                    return (
                      <div
                        key={att.id}
                        className="rounded-2xl bg-white border border-[#BC9FE6]/30 overflow-hidden flex flex-col justify-between shadow-xs"
                      >
                        {isImg ? (
                          <a href={att.file_url} target="_blank" rel="noreferrer" className="h-36 bg-[#FAF7FC] block overflow-hidden">
                            <img src={att.file_url} alt={att.original_name} className="w-full h-full object-cover" />
                          </a>
                        ) : (
                          <div className="h-24 bg-[#FAF7FC] flex items-center justify-center text-[#7A689C]">
                            <FileText className="w-8 h-8" />
                          </div>
                        )}
                        <div className="p-3.5 space-y-2">
                          <p className="text-xs font-bold text-[#2F1534] truncate">{att.original_name}</p>
                          <p className="text-[11px] text-[#7A689C] truncate">
                            Demanda: {att.card_title}
                          </p>
                          <div className="flex items-center justify-between pt-1 text-[11px] text-[#232122]/55">
                            <span>{att.uploaded_by_name}</span>
                            <div className="flex items-center gap-2.5">
                              <a
                                href={att.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-[#7A689C] hover:text-[#2F1534]"
                              >
                                <ExternalLink className="w-3 h-3" /> Abrir
                              </a>
                              <a
                                href={att.file_url}
                                download={att.original_name || true}
                                className="inline-flex items-center gap-1 font-bold text-[#EC2B82] hover:underline"
                              >
                                <Download className="w-3 h-3" /> Baixar
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ==================== 7. BRIEFING (Dedicated Full-Screen Page + Document Attachment) ==================== */}
          {section === 'briefing' && (
            <div className="space-y-5">
              {/* Intro Header with exact verbatim copy */}
              <div className="rounded-[24px] bg-gradient-to-br from-[#F3ECF9] via-[#FAF6FD] to-[#FDF2F6] border border-[#BC9FE6]/45 p-5 sm:p-7 space-y-2.5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-[#BC9FE6]/40 text-[11px] font-bold text-[#7A689C]">
                    <FileText className="w-3.5 h-3.5 text-[#EC2B82]" />
                    Briefing do Projeto
                  </span>
                  {!isClient && (
                    <button
                      type="button"
                      onClick={() => setEditingBriefingDoc((v) => !v)}
                      className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold transition-colors"
                    >
                      {editingBriefingDoc
                        ? 'Fechar editor'
                        : hasBriefingContent
                        ? 'Editar documento de briefing'
                        : 'Anexar documento de briefing'}
                    </button>
                  )}
                </div>

                <h2 className="text-2xl font-extrabold text-[#2F1534] tracking-tight">Briefing</h2>
                <p className="text-sm text-[#2F1534]/85 leading-relaxed max-w-3xl">
                  Olá! Seja bem-vindo(a)! Aqui está o seu briefing. Reserve um tempinho para responder às perguntas com calma. Essas informações são importantes para conhecermos melhor suas necessidades e desenvolvermos seu projeto.
                </p>
              </div>

              {/* 2-Column Layout: Left = Documento de Briefing, Right = Respostas & Demandas de Briefing */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* LEFT COLUMN: Documento de Briefing */}
                <div className="lg:col-span-7 space-y-4">
                  {!isClient && editingBriefingDoc && (
                    <form
                      onSubmit={handleSaveBriefingDoc}
                      className="rounded-2xl bg-white border border-[#BC9FE6]/40 p-5 space-y-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-[#2F1534]">
                          Configurar Documento de Briefing
                        </h3>
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#2F1534] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={briefingDraft.client_visible !== false}
                            onChange={(e) =>
                              setBriefingDraft({ ...briefingDraft, client_visible: e.target.checked })
                            }
                            className="rounded accent-[#EC2B82]"
                          />
                          <span>Disponibilizar ao cliente</span>
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#2F1534]">Título do documento</label>
                        <input
                          type="text"
                          value={briefingDraft.title || ''}
                          onChange={(e) => setBriefingDraft({ ...briefingDraft, title: e.target.value })}
                          placeholder="Ex: Briefing Estratégico de Identidade Visual"
                          className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#2F1534]">
                          Arquivo ou link do briefing (PDF, Word, imagem ou link externo)
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={briefingDraft.file_url || ''}
                            onChange={(e) => setBriefingDraft({ ...briefingDraft, file_url: e.target.value })}
                            placeholder="Cole um link ou faça upload do arquivo..."
                            className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl border border-black/12 text-xs"
                          />
                          <label className="px-4 py-2 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-[#2F1534] text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                            <UploadCloud className="w-3.5 h-3.5 text-[#7A689C]" />
                            <span>
                              {uploadingBriefingDoc
                                ? 'Enviando...'
                                : briefingDraft.file_url
                                ? 'Substituir arquivo'
                                : 'Anexar arquivo'}
                            </span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,.txt,image/*"
                              className="hidden"
                              onChange={async (e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setUploadingBriefingDoc(true);
                                try {
                                  const up = await uploadFile(f);
                                  setBriefingDraft((prev) => ({
                                    ...prev,
                                    file_url: up.file_url,
                                    file_name: up.original_name,
                                    mime_type: up.mime_type,
                                    title: prev.title || up.original_name,
                                  }));
                                } finally {
                                  setUploadingBriefingDoc(false);
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        </div>
                        {briefingDraft.file_name && (
                          <p className="text-[11px] text-[#7A689C]">
                            Arquivo selecionado: <strong>{briefingDraft.file_name}</strong>
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#2F1534]">
                          Orientações ao cliente (visível quando liberado)
                        </label>
                        <textarea
                          rows={2}
                          value={briefingDraft.notes || ''}
                          onChange={(e) => setBriefingDraft({ ...briefingDraft, notes: e.target.value })}
                          placeholder="Instruções complementares ou perguntas-guia..."
                          className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[#7A689C]">
                          Notas internas do estúdio (ocultas do cliente)
                        </label>
                        <textarea
                          rows={2}
                          value={briefingDraft.internal_notes || ''}
                          onChange={(e) => setBriefingDraft({ ...briefingDraft, internal_notes: e.target.value })}
                          placeholder="Observações da equipe sobre este briefing..."
                          className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC]"
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        {hasBriefingContent ? (
                          <button
                            type="button"
                            onClick={handleRemoveBriefingDoc}
                            className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remover documento</span>
                          </button>
                        ) : (
                          <span />
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingBriefingDoc(false)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#232122]/65"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={savingBriefingDoc}
                            className="px-5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold"
                          >
                            {savingBriefingDoc ? 'Salvando...' : 'Salvar briefing'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* Briefing Document Display Card */}
                  <div className="aumi-surface-solid rounded-2xl p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#9333EA] to-[#BC9FE6] text-white flex items-center justify-center shrink-0 shadow-xs">
                          <FileCheck2 className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                            Documento de Briefing
                          </span>
                          <h3 className="text-base font-bold text-[#2F1534]">
                            {savedBriefingInfo?.title || 'Material de Briefing do Projeto'}
                          </h3>
                          {savedBriefingInfo?.updated_at && (
                            <p className="text-[11px] text-[#232122]/55 mt-0.5 tabular-nums">
                              Atualizado em {formatDateTimeBR(savedBriefingInfo.updated_at)}
                              {savedBriefingInfo.updated_by ? ` por ${savedBriefingInfo.updated_by}` : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {!isClient && hasBriefingContent && (
                        <button
                          type="button"
                          onClick={handleToggleBriefingVisibility}
                          disabled={savingBriefingDoc}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 border transition-colors ${
                            briefingVisibleToClient
                              ? 'bg-[#ECFDF5] text-[#15803D] border-[#22C55E]/35'
                              : 'bg-[#FAF7FC] text-[#7A689C] border-[#BC9FE6]/40'
                          }`}
                        >
                          {briefingVisibleToClient ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Visível ao cliente</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Oculto · Disponibilizar ao cliente</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {isClient && (!briefingVisibleToClient || !hasBriefingContent) ? (
                      <div className="rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/25 p-6 text-center space-y-2">
                        <FileText className="w-8 h-8 text-[#BC9FE6] mx-auto" />
                        <p className="text-xs font-bold text-[#2F1534]">
                          Nenhum documento de briefing anexado ainda
                        </p>
                        <p className="text-[11px] text-[#232122]/60">
                          Enquanto isso, você pode responder às perguntas nas demandas ao lado sempre que estiverem disponíveis.
                        </p>
                      </div>
                    ) : !hasBriefingContent ? (
                      <div className="rounded-2xl bg-[#FAF7FC] border border-dashed border-[#BC9FE6]/50 p-6 text-center space-y-3">
                        <UploadCloud className="w-8 h-8 text-[#7A689C] mx-auto" />
                        <div>
                          <p className="text-xs font-bold text-[#2F1534]">
                            Nenhum arquivo de briefing anexado ainda
                          </p>
                          <p className="text-[11px] text-[#232122]/60 mt-0.5">
                            Anexe um PDF, documento ou link para disponibilizar ao cliente nesta página.
                          </p>
                        </div>
                        {!isClient && (
                          <button
                            type="button"
                            onClick={() => setEditingBriefingDoc(true)}
                            className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                          >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>Anexar documento de briefing</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {savedBriefingInfo?.notes && (
                          <p className="text-xs text-[#232122]/80 whitespace-pre-wrap leading-relaxed bg-[#FAF7FC] rounded-xl p-3.5 border border-black/[0.05]">
                            {savedBriefingInfo.notes}
                          </p>
                        )}

                        <DocumentPreviewBox
                          fileUrl={savedBriefingInfo?.file_url}
                          fileName={savedBriefingInfo?.file_name || savedBriefingInfo?.title}
                          mimeType={savedBriefingInfo?.mime_type}
                        />

                        {savedBriefingInfo?.file_url && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <a
                              href={savedBriefingInfo.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>Visualizar / Abrir</span>
                            </a>
                            <a
                              href={savedBriefingInfo.file_url}
                              download={savedBriefingInfo.file_name || true}
                              className="px-4 py-2 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-[#2F1534] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Download className="w-3.5 h-3.5 text-[#7A689C]" />
                              <span>Baixar</span>
                            </a>
                            {!isClient && (
                              <button
                                type="button"
                                onClick={() => setEditingBriefingDoc(true)}
                                className="px-3.5 py-2 rounded-xl border border-black/12 hover:border-[#EC2B82] text-xs font-semibold text-[#2F1534] inline-flex items-center gap-1.5"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Substituir</span>
                              </button>
                            )}
                          </div>
                        )}

                        {!isClient && savedBriefingInfo?.internal_notes && (
                          <div className="p-3 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 text-xs">
                            <p className="font-bold text-[#7A689C] inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Notas internas do estúdio
                            </p>
                            <p className="text-[#232122]/75 mt-1 whitespace-pre-wrap">
                              {savedBriefingInfo.internal_notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* RIGHT COLUMN: Structured Briefing Questions & Demand Answers */}
                <div className="lg:col-span-5 space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-bold text-[#2F1534]">
                      Perguntas &amp; Respostas das Demandas ({cards.length})
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSection('demandas')}
                      className="text-xs font-bold text-[#EC2B82] hover:underline"
                    >
                      Ver todas
                    </button>
                  </div>

                  {cards.length === 0 ? (
                    <div className="rounded-2xl bg-white border border-black/[0.06] p-8 text-center text-sm text-[#232122]/55">
                      Nenhuma demanda de briefing cadastrada ainda.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cards.map((card) => {
                        const plainText = stripHtmlTags(card.submitted_content?.text || card.description || '');
                        const answers = card.submitted_content?.answers || {};
                        const isFilled =
                          card.content_status === 'submitted' || card.content_status === 'content_approved';
                        return (
                          <div
                            key={card.id}
                            onClick={() => setSelectedCard(card)}
                            className="aumi-surface-solid rounded-2xl hover:border-[#EC2B82] p-4 space-y-2.5 cursor-pointer transition-all"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-[#2F1534] truncate">{card.title}</h4>
                                {card.service_name && (
                                  <p className="text-[11px] font-medium text-[#7A689C]">{card.service_name}</p>
                                )}
                              </div>
                              <span
                                className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${
                                  isFilled
                                    ? 'bg-[#DCFCE7] text-[#15803D]'
                                    : 'bg-[#FDF2F6] text-[#EC2B82]'
                                }`}
                              >
                                {isFilled ? 'Preenchido' : 'Pendente'}
                              </span>
                            </div>

                            {plainText && (
                              <p className="text-xs text-[#232122]/75 line-clamp-3 whitespace-pre-wrap">{plainText}</p>
                            )}

                            {card.client_fields && card.client_fields.length > 0 && (
                              <div className="pt-2 border-t border-black/[0.05] space-y-1">
                                {card.client_fields.slice(0, 3).map((fld) => (
                                  <div key={fld.key} className="text-[11px]">
                                    <span className="font-semibold text-[#7A689C]">{fld.label}: </span>
                                    <span className="text-[#232122]/75">
                                      {answers[fld.key] || 'Aguardando resposta'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            <p className="text-[11px] font-bold text-[#EC2B82] pt-0.5 inline-flex items-center gap-1">
                              <span>{isClient ? 'Responder / visualizar' : 'Abrir demanda'}</span>
                              <ChevronRight className="w-3 h-3" />
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 8. DRIVE ==================== */}
          {section === 'drive' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-[#2F1534]">Drive &amp; Pastas de Arquivos</h2>
                  <p className="text-xs text-[#232122]/60 mt-0.5">
                    Links externos organizados para arquivos finais, pastas em nuvem e bibliotecas visuais.
                  </p>
                </div>
                {!isClient && (
                  <button
                    type="button"
                    onClick={() => setDriveModalOpen((v) => !v)}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{driveModalOpen ? 'Fechar' : 'Adicionar pasta / link'}</span>
                  </button>
                )}
              </div>

              {!isClient && driveModalOpen && (
                <form
                  onSubmit={handleSaveDriveLink}
                  className="rounded-2xl bg-white border border-[#BC9FE6]/35 p-5 grid grid-cols-1 sm:grid-cols-12 gap-3"
                >
                  <input
                    type="text"
                    required
                    value={driveTitle}
                    onChange={(e) => setDriveTitle(e.target.value)}
                    placeholder="Nome da pasta (Ex: Arquivos Finais - Google Drive)"
                    className="sm:col-span-5 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <input
                    type="text"
                    required
                    value={driveUrl}
                    onChange={(e) => setDriveUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="sm:col-span-5 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <label className="sm:col-span-2 flex items-center gap-1.5 text-xs font-medium text-[#2F1534]">
                    <input
                      type="checkbox"
                      checked={driveInternal}
                      onChange={(e) => setDriveInternal(e.target.checked)}
                      className="rounded accent-[#7A689C]"
                    />
                    Só estúdio
                  </label>
                  <input
                    type="text"
                    value={driveDesc}
                    onChange={(e) => setDriveDesc(e.target.value)}
                    placeholder="Descrição opcional..."
                    className="sm:col-span-10 px-3 py-2 rounded-xl border border-black/12 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={savingDrive}
                    className="sm:col-span-2 px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
                  >
                    {savingDrive ? 'Salvando...' : 'Adicionar'}
                  </button>
                </form>
              )}

              {(!board.drive_links || board.drive_links.length === 0) ? (
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 text-center space-y-2">
                  <Cloud className="w-8 h-8 text-[#BC9FE6] mx-auto" />
                  <p className="text-sm font-bold text-[#2F1534]">Nenhuma pasta do Drive adicionada ainda</p>
                  <p className="text-xs text-[#232122]/55">
                    Quando links do Google Drive, Dropbox ou pastas de entregas forem vinculados, eles aparecerão aqui.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {board.drive_links.map((lnk) => (
                    <div
                      key={lnk.id}
                      className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-9 h-9 rounded-xl bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center">
                            <Cloud className="w-4.5 h-4.5" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!isClient && lnk.is_internal && (
                              <span className="px-2 py-0.5 rounded-md bg-[#2F1534] text-white text-[10px] font-bold">
                                Interno
                              </span>
                            )}
                            {!isClient && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDriveLink(lnk.id)}
                                className="p-1 text-[#232122]/35 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <h3 className="text-sm font-bold text-[#2F1534] pt-1">{lnk.title}</h3>
                        {lnk.description && <p className="text-xs text-[#232122]/65">{lnk.description}</p>}
                      </div>

                      <a
                        href={lnk.url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2 rounded-xl bg-[#FAF7FC] hover:bg-[#FDF2F6] border border-[#BC9FE6]/30 text-xs font-bold text-[#2F1534] hover:text-[#EC2B82] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Abrir pasta</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================== 9. CONTRATO E PROPOSTA COMERCIAL ==================== */}
          {section === 'contrato' && (
            <div className="space-y-5">
              {/* Header with exact verbatim copy */}
              <div className="rounded-[24px] bg-gradient-to-br from-[#F3ECF9] via-[#FAF6FD] to-[#FDF2F6] border border-[#BC9FE6]/45 p-5 sm:p-7 space-y-2.5 shadow-xs">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/90 border border-[#BC9FE6]/40 text-[11px] font-bold text-[#7A689C]">
                  <ScrollText className="w-3.5 h-3.5 text-[#EC2B82]" />
                  Documentação do Projeto
                </span>
                <h2 className="text-2xl font-extrabold text-[#2F1534] tracking-tight">
                  Contrato e Proposta Comercial
                </h2>
                <p className="text-sm text-[#2F1534]/85 leading-relaxed max-w-3xl">
                  Olá! Aqui estão os documentos referentes ao seu projeto. Você poderá acessar e consultar seu contrato e sua proposta comercial diretamente por aqui.
                </p>
              </div>

              {/* TWO INDEPENDENT DOCUMENT MODULES: (A) Contrato + (B) Proposta Comercial */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                {/* MODULE A: CONTRATO */}
                <div className="aumi-surface-solid rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2F1534] to-[#7A689C] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <ScrollText className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                          Documento 1
                        </span>
                        <h3 className="text-base font-extrabold text-[#2F1534]">Contrato</h3>
                        {effectiveContractDoc?.validity && (!isClient || contractVisibleToClient) && (
                          <p className="text-[11px] text-[#232122]/60 mt-0.5">
                            Vigência: {effectiveContractDoc.validity}
                          </p>
                        )}
                      </div>
                    </div>

                    {!isClient && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasContractDoc && (
                          <button
                            type="button"
                            onClick={handleToggleContractDocVisibility}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 border transition-colors ${
                              contractVisibleToClient
                                ? 'bg-[#ECFDF5] text-[#15803D] border-[#22C55E]/35'
                                : 'bg-[#FAF7FC] text-[#7A689C] border-[#BC9FE6]/40'
                            }`}
                          >
                            {contractVisibleToClient ? (
                              <>
                                <Eye className="w-3 h-3" />
                                <span>Visível</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Disponibilizar</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingContractDoc((v) => !v)}
                          className="px-3 py-1.5 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-[11px] font-bold transition-colors"
                        >
                          {editingContractDoc ? 'Fechar' : hasContractDoc ? 'Editar / Substituir' : 'Anexar contrato'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isClient && editingContractDoc && (
                    <form
                      onSubmit={handleSaveContractDoc}
                      className="rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/40 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#2F1534]">Anexar ou atualizar Contrato</p>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F1534] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={contractDocDraft.client_visible !== false}
                            onChange={(e) =>
                              setContractDocDraft({ ...contractDocDraft, client_visible: e.target.checked })
                            }
                            className="rounded accent-[#EC2B82]"
                          />
                          <span>Visível ao cliente</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={contractDocDraft.title || ''}
                          onChange={(e) => setContractDocDraft({ ...contractDocDraft, title: e.target.value })}
                          placeholder="Título (Ex: Contrato de Prestação de Serviços)"
                          className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                        <input
                          type="text"
                          value={contractDocDraft.validity || ''}
                          onChange={(e) => setContractDocDraft({ ...contractDocDraft, validity: e.target.value })}
                          placeholder="Vigência (Ex: 90 dias)"
                          className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={contractDocDraft.file_url || ''}
                          onChange={(e) => setContractDocDraft({ ...contractDocDraft, file_url: e.target.value })}
                          placeholder="Link ou faça upload do PDF/imagem..."
                          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                        <label className="px-3.5 py-2 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-[#2F1534] text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                          <UploadCloud className="w-3.5 h-3.5 text-[#7A689C]" />
                          <span>{uploadingContractDoc ? 'Subindo...' : 'Upload PDF'}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setUploadingContractDoc(true);
                              try {
                                const up = await uploadFile(f);
                                setContractDocDraft((prev) => ({
                                  ...prev,
                                  file_url: up.file_url,
                                  file_name: up.original_name,
                                  mime_type: up.mime_type,
                                  title: prev.title || up.original_name,
                                }));
                              } finally {
                                setUploadingContractDoc(false);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      <textarea
                        rows={2}
                        value={contractDocDraft.notes || ''}
                        onChange={(e) => setContractDocDraft({ ...contractDocDraft, notes: e.target.value })}
                        placeholder="Observações sobre o contrato (opcional)..."
                        className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                      />

                      <div className="flex items-center justify-between gap-2">
                        {hasContractDoc ? (
                          <button
                            type="button"
                            onClick={handleRemoveContractDoc}
                            className="text-xs font-semibold text-red-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remover
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="submit"
                          disabled={savingContractDoc}
                          className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold"
                        >
                          {savingContractDoc ? 'Salvando...' : 'Salvar contrato'}
                        </button>
                      </div>
                    </form>
                  )}

                  {isClient && (!contractVisibleToClient || !hasContractDoc) ? (
                    <div className="rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/25 p-6 text-center space-y-1.5">
                      <ScrollText className="w-7 h-7 text-[#BC9FE6] mx-auto" />
                      <p className="text-xs font-bold text-[#2F1534]">Contrato em preparação</p>
                      <p className="text-[11px] text-[#232122]/60">
                        Quando o documento estiver disponível para consulta, ele aparecerá aqui.
                      </p>
                    </div>
                  ) : !hasContractDoc ? (
                    <div className="rounded-2xl bg-[#FAF7FC] border border-dashed border-[#BC9FE6]/45 p-6 text-center space-y-2.5">
                      <p className="text-xs font-bold text-[#2F1534]">Nenhum contrato anexado ainda</p>
                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => setEditingContractDoc(true)}
                          className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Anexar contrato</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-[#2F1534]">
                        {effectiveContractDoc?.title || 'Contrato de Prestação de Serviços'}
                      </p>
                      {effectiveContractDoc?.notes && (
                        <p className="text-xs text-[#232122]/75 whitespace-pre-wrap">{effectiveContractDoc.notes}</p>
                      )}
                      <DocumentPreviewBox
                        fileUrl={effectiveContractDoc?.file_url}
                        fileName={effectiveContractDoc?.file_name || effectiveContractDoc?.title}
                        mimeType={effectiveContractDoc?.mime_type}
                      />
                      {effectiveContractDoc?.file_url && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={effectiveContractDoc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir contrato</span>
                          </a>
                          <a
                            href={effectiveContractDoc.file_url}
                            download={effectiveContractDoc.file_name || true}
                            className="px-4 py-2 rounded-xl bg-[#F3ECF9] hover:bg-[#E7D8F5] text-[#2F1534] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5 text-[#7A689C]" />
                            <span>Baixar</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* MODULE B: PROPOSTA COMERCIAL */}
                <div className="aumi-surface-solid rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#EC2B82] to-[#E1754C] text-white flex items-center justify-center shrink-0 shadow-xs">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#EC2B82]">
                          Documento 2
                        </span>
                        <h3 className="text-base font-extrabold text-[#2F1534]">Proposta Comercial</h3>
                        {effectiveProposalDoc?.validity && (!isClient || proposalVisibleToClient) && (
                          <p className="text-[11px] text-[#232122]/60 mt-0.5">
                            Validade: {effectiveProposalDoc.validity}
                          </p>
                        )}
                      </div>
                    </div>

                    {!isClient && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasProposalDoc && (
                          <button
                            type="button"
                            onClick={handleToggleProposalDocVisibility}
                            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 border transition-colors ${
                              proposalVisibleToClient
                                ? 'bg-[#ECFDF5] text-[#15803D] border-[#22C55E]/35'
                                : 'bg-[#FAF7FC] text-[#7A689C] border-[#BC9FE6]/40'
                            }`}
                          >
                            {proposalVisibleToClient ? (
                              <>
                                <Eye className="w-3 h-3" />
                                <span>Visível</span>
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3 h-3" />
                                <span>Disponibilizar</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingProposalDoc((v) => !v)}
                          className="px-3 py-1.5 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-[11px] font-bold transition-colors"
                        >
                          {editingProposalDoc ? 'Fechar' : hasProposalDoc ? 'Editar / Substituir' : 'Anexar proposta'}
                        </button>
                      </div>
                    )}
                  </div>

                  {!isClient && editingProposalDoc && (
                    <form
                      onSubmit={handleSaveProposalDoc}
                      className="rounded-2xl bg-[#FDF2F6]/65 border border-[#EC97B7]/45 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[#2F1534]">Anexar ou atualizar Proposta Comercial</p>
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2F1534] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={proposalDocDraft.client_visible !== false}
                            onChange={(e) =>
                              setProposalDocDraft({ ...proposalDocDraft, client_visible: e.target.checked })
                            }
                            className="rounded accent-[#EC2B82]"
                          />
                          <span>Visível ao cliente</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <input
                          type="text"
                          value={proposalDocDraft.title || ''}
                          onChange={(e) => setProposalDocDraft({ ...proposalDocDraft, title: e.target.value })}
                          placeholder="Título (Ex: Proposta Comercial 2026)"
                          className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                        <input
                          type="text"
                          value={proposalDocDraft.validity || ''}
                          onChange={(e) => setProposalDocDraft({ ...proposalDocDraft, validity: e.target.value })}
                          placeholder="Validade / Condição (Ex: 15 dias)"
                          className="px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={proposalDocDraft.file_url || ''}
                          onChange={(e) => setProposalDocDraft({ ...proposalDocDraft, file_url: e.target.value })}
                          placeholder="Link ou faça upload do PDF/imagem..."
                          className="flex-1 min-w-[180px] px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                        />
                        <label className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#FDF2F6] border border-[#EC97B7]/45 text-[#2F1534] text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                          <UploadCloud className="w-3.5 h-3.5 text-[#EC2B82]" />
                          <span>{uploadingProposalDoc ? 'Subindo...' : 'Upload PDF'}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx,image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (!f) return;
                              setUploadingProposalDoc(true);
                              try {
                                const up = await uploadFile(f);
                                setProposalDocDraft((prev) => ({
                                  ...prev,
                                  file_url: up.file_url,
                                  file_name: up.original_name,
                                  mime_type: up.mime_type,
                                  title: prev.title || up.original_name,
                                }));
                              } finally {
                                setUploadingProposalDoc(false);
                                e.target.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      <textarea
                        rows={2}
                        value={proposalDocDraft.notes || ''}
                        onChange={(e) => setProposalDocDraft({ ...proposalDocDraft, notes: e.target.value })}
                        placeholder="Observações sobre a proposta comercial (opcional)..."
                        className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs"
                      />

                      <div className="flex items-center justify-between gap-2">
                        {hasProposalDoc ? (
                          <button
                            type="button"
                            onClick={handleRemoveProposalDoc}
                            className="text-xs font-semibold text-red-600 hover:underline inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Remover
                          </button>
                        ) : (
                          <span />
                        )}
                        <button
                          type="submit"
                          disabled={savingProposalDoc}
                          className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold"
                        >
                          {savingProposalDoc ? 'Salvando...' : 'Salvar proposta'}
                        </button>
                      </div>
                    </form>
                  )}

                  {isClient && (!proposalVisibleToClient || !hasProposalDoc) ? (
                    <div className="rounded-2xl bg-[#FAF7FC] border border-[#BC9FE6]/25 p-6 text-center space-y-1.5">
                      <FileSpreadsheet className="w-7 h-7 text-[#EC97B7] mx-auto" />
                      <p className="text-xs font-bold text-[#2F1534]">Proposta comercial em preparação</p>
                      <p className="text-[11px] text-[#232122]/60">
                        Quando sua proposta estiver disponível para consulta, ela aparecerá aqui.
                      </p>
                    </div>
                  ) : !hasProposalDoc ? (
                    <div className="rounded-2xl bg-[#FAF7FC] border border-dashed border-[#EC97B7]/55 p-6 text-center space-y-2.5">
                      <p className="text-xs font-bold text-[#2F1534]">Nenhuma proposta comercial anexada ainda</p>
                      {!isClient && (
                        <button
                          type="button"
                          onClick={() => setEditingProposalDoc(true)}
                          className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Anexar proposta comercial</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm font-bold text-[#2F1534]">
                        {effectiveProposalDoc?.title || 'Proposta Comercial'}
                      </p>
                      {effectiveProposalDoc?.notes && (
                        <p className="text-xs text-[#232122]/75 whitespace-pre-wrap">{effectiveProposalDoc.notes}</p>
                      )}
                      <DocumentPreviewBox
                        fileUrl={effectiveProposalDoc?.file_url}
                        fileName={effectiveProposalDoc?.file_name || effectiveProposalDoc?.title}
                        mimeType={effectiveProposalDoc?.mime_type}
                      />
                      {effectiveProposalDoc?.file_url && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={effectiveProposalDoc.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-xl bg-[#2F1534] hover:bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Abrir proposta</span>
                          </a>
                          <a
                            href={effectiveProposalDoc.file_url}
                            download={effectiveProposalDoc.file_name || true}
                            className="px-4 py-2 rounded-xl bg-[#FDF2F6] hover:bg-[#FCE7F3] text-[#EC2B82] text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Baixar</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* BELOW: Escopo & Serviços Vinculados */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 aumi-surface-solid rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#2F1534]">Resumo do Escopo &amp; Combinados</h3>
                    {!isClient && (
                      <button
                        type="button"
                        onClick={() => setEditingScopeNotes((v) => !v)}
                        className="text-xs font-bold text-[#EC2B82] hover:underline"
                      >
                        {editingScopeNotes ? 'Cancelar' : 'Editar resumo'}
                      </button>
                    )}
                  </div>

                  {!isClient && editingScopeNotes ? (
                    <form onSubmit={handleSaveScopeNotes} className="space-y-3">
                      <textarea
                        rows={3}
                        value={scopeSummaryDraft}
                        onChange={(e) => setScopeSummaryDraft(e.target.value)}
                        placeholder="Descreva os acordos principais e condições de entrega..."
                        className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs"
                      />
                      <textarea
                        rows={2}
                        value={scopeInternalNotesDraft}
                        onChange={(e) => setScopeInternalNotesDraft(e.target.value)}
                        placeholder="Notas internas (ocultas do cliente)..."
                        className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC]"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={savingScopeNotes}
                          className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold"
                        >
                          {savingScopeNotes ? 'Salvando...' : 'Salvar resumo'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="text-xs text-[#232122]/75 whitespace-pre-wrap leading-relaxed">
                        {board.contract_info?.summary ||
                          'O escopo deste projeto abrange os serviços e entregas listados ao lado, seguindo os prazos combinados com o Aumi Studio.'}
                      </p>
                      {!isClient && board.contract_info?.internal_notes && (
                        <div className="p-3 rounded-xl bg-[#FAF7FC] border border-[#BC9FE6]/35 text-xs">
                          <p className="font-bold text-[#7A689C] inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Notas internas do estúdio
                          </p>
                          <p className="text-[#232122]/75 mt-1 whitespace-pre-wrap">
                            {board.contract_info.internal_notes}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="lg:col-span-5 aumi-surface-solid rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#2F1534]">Serviços &amp; Entregáveis vinculados</h3>
                  {(!board.selected_services || board.selected_services.length === 0) ? (
                    <p className="text-xs text-[#232122]/55">Nenhum serviço vinculado ao escopo.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {board.selected_services
                        .filter(
                          (s) =>
                            !isClient ||
                            servicesMeta.length === 0 ||
                            servicesMeta.some((sm) => sm.id === s.service_id)
                        )
                        .map((svc, idx) => (
                          <div
                            key={`${svc.service_id}-${idx}`}
                            className="p-3 rounded-xl bg-[#FAF7FC] border border-black/[0.05] space-y-1"
                          >
                            <p className="text-xs font-bold text-[#2F1534]">{svc.service_name}</p>
                            <p className="text-[11px] text-[#7A689C]">Pacote: {svc.package_name}</p>
                            {svc.deliverables?.length > 0 && (
                              <p className="text-[11px] text-[#232122]/65">
                                {svc.deliverables.map((d) => `${d.qty}x ${d.name}`).join(' · ')}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 10. COMENTÁRIOS ==================== */}
          {section === 'comentarios' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-r from-[#F3ECF9] to-[#FDF2F6] border border-[#BC9FE6]/40 p-5">
                <h2 className="text-xl font-extrabold text-[#2F1534]">Comentários &amp; Conversa do Projeto</h2>
                <p className="text-xs text-[#232122]/65 mt-0.5">
                  Central de mensagens vinculadas às demandas deste projeto.
                </p>
              </div>

              {cards.length > 0 && (
                <form
                  onSubmit={handleSendDirectComment}
                  className="rounded-2xl bg-white border border-[#BC9FE6]/30 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={commentCardId || cards[0]?.id}
                      onChange={(e) => setCommentCardId(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-[#FAF7FC] font-semibold text-[#2F1534]"
                    >
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          Demanda: {c.title}
                        </option>
                      ))}
                    </select>
                    {!isClient && (
                      <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#7A689C]">
                        <input
                          type="checkbox"
                          checked={commentInternal}
                          onChange={(e) => setCommentInternal(e.target.checked)}
                          className="rounded accent-[#7A689C]"
                        />
                        Nota interna
                      </label>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="Escreva uma mensagem ou dúvida sobre esta demanda..."
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                    <button
                      type="submit"
                      disabled={sendingComment}
                      className="px-5 py-2.5 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingComment ? 'Enviando...' : 'Enviar'}</span>
                    </button>
                  </div>
                </form>
              )}

              {allComments.length === 0 ? (
                <div className="rounded-2xl bg-white border border-black/[0.06] p-10 text-center text-sm text-[#232122]/55">
                  Nenhum comentário registrado neste projeto ainda.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allComments.map((cm) => {
                    const targetCard = cards.find((c) => c.id === cm.card_id);
                    return (
                      <div
                        key={cm.id}
                        onClick={() => targetCard && setSelectedCard(targetCard)}
                        className={`rounded-2xl border p-4 cursor-pointer transition-all ${
                          cm.is_internal
                            ? 'bg-[#FCF6EC] border-[#E1754C]/30'
                            : 'bg-white border-[#BC9FE6]/28 hover:border-[#EC2B82]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#2F1534]">{cm.author_name}</span>
                            <span className="px-2 py-0.5 rounded-md bg-[#F3ECF9] text-[#7A689C] text-[10px] font-semibold">
                              {cm.card_title}
                            </span>
                            {Boolean(cm.is_internal) && (
                              <span className="px-2 py-0.5 rounded-md bg-[#2F1534] text-white text-[10px] font-bold">
                                Interno
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#232122]/45">{formatRelativeTime(cm.created_at)}</span>
                        </div>
                        <p className="text-xs text-[#232122]/85 mt-1.5 whitespace-pre-wrap">{cm.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* New Demand Quick Modal */}
      {newDemandModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#2F1534]/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setNewDemandModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateDemandFromSection}
            className="w-full max-w-lg rounded-[26px] bg-white border border-[#BC9FE6]/40 shadow-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#2F1534]">Nova demanda no projeto</h3>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#2F1534]">Título *</label>
              <input
                type="text"
                required
                autoFocus
                value={newDemandTitle}
                onChange={(e) => setNewDemandTitle(e.target.value)}
                placeholder="Ex: Carrossel de apresentação"
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#2F1534]">Etapa inicial</label>
                <select
                  value={newDemandColId || columns[0]?.id}
                  onChange={(e) => setNewDemandColId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {isClient ? c.client_label || c.title : c.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#2F1534]">Prioridade</label>
                <select
                  value={newDemandPriority}
                  onChange={(e) => setNewDemandPriority(e.target.value as 'baixa' | 'normal' | 'alta' | 'urgente')}
                  className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                >
                  <option value="baixa">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                  <option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#2F1534]">Descrição inicial</label>
              <textarea
                rows={3}
                value={newDemandDesc}
                onChange={(e) => setNewDemandDesc(e.target.value)}
                placeholder="Detalhes, objetivo ou contexto..."
                className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNewDemandModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-[#232122]/65"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingDemand}
                className="px-5 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold"
              >
                {creatingDemand ? 'Criando...' : 'Criar e abrir'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Full-Screen Card Detail Page opened from Demandas / Briefing / Comentários / Calendário */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          columns={columns}
          partners={partners}
          availableLabels={studioLabels}
          mode={mode}
          variant="page"
          onBackLabel="Voltar ao projeto"
          portalDefaults={portalDefaults}
          onClose={() => setSelectedCard(null)}
          onUpdated={() => refreshAll()}
          onDeleted={
            !isClient
              ? () => {
                  setSelectedCard(null);
                  refreshAll();
                }
              : undefined
          }
          onLabelsUpdated={(updated) => setStudioLabels(updated)}
        />
      )}

      {/* Labels Manager Modal */}
      {!isClient && (
        <LabelsManagerModal
          open={labelsManagerOpen}
          labels={studioLabels}
          onClose={() => setLabelsManagerOpen(false)}
          onSaved={(updated) => {
            setStudioLabels(updated);
            loadProjectData();
          }}
        />
      )}
    </div>
  );
}
