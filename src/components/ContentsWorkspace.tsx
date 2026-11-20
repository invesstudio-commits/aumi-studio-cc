import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Copy,
  Edit3,
  FileText,
  FolderPlus,
  Heart,
  Kanban,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api, formatRelativeTime, getAuthToken, stripHtmlTags } from '../lib/api.ts';
import { isDarkHex, renderContentIcon } from '../lib/contentPalette.tsx';
import {
  ContentColumn,
  ContentFolder,
  ContentItem,
  ContentsWorkspaceData,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';
import { ContentEditorModal } from './ContentEditorModal.tsx';
import {
  ContentColumnModal,
  ContentFolderModal,
  ContentTaxonomyManagerModal,
} from './ContentTaxonomyModals.tsx';

interface ContentsWorkspaceProps {
  user: User;
}

type QuickNavFilter = 'all' | 'favorites' | 'recent' | 'drafts' | 'shared';
type ViewMode = 'kanban' | 'list';
type SortMode = 'recent' | 'oldest' | 'az';

export function ContentsWorkspace({ user }: ContentsWorkspaceProps) {
  const [data, setData] = useState<ContentsWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Navigation & filters
  const [quickFilter, setQuickFilter] = useState<QuickNavFilter>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [selectedThemeId, setSelectedThemeId] = useState<string>('all');
  const [selectedTagId, setSelectedTagId] = useState<string>('all');
  const [selectedColumnId, setSelectedColumnId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortMode>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  // Modals
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContentItem | null>(null);
  const [editorDefaultColumnId, setEditorDefaultColumnId] = useState<string | undefined>(undefined);

  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ContentFolder | null>(null);

  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<ContentColumn | null>(null);

  const [taxonomyModal, setTaxonomyModal] = useState<'themes' | 'tags' | null>(null);

  // Open menus
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [openColMenuId, setOpenColMenuId] = useState<string | null>(null);
  const [movingFolderItemId, setMovingFolderItemId] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [draggingColId, setDraggingColId] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api<ContentsWorkspaceData>('/contents/workspace');
      setData(res);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a aba Conteúdos.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspace(false);
  }, [loadWorkspace]);

  // Real-time sync between Ingrid & Mariana
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    const es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`);
    const handleStudioEvent = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as { type?: string };
        if (parsed.type === 'contents_updated') {
          loadWorkspace(true);
        }
      } catch {
        // ignore
      }
    };
    es.addEventListener('studio', handleStudioEvent);
    return () => {
      es.removeEventListener('studio', handleStudioEvent);
      es.close();
    };
  }, [loadWorkspace]);

  // Close floating dropdowns on outside click
  useEffect(() => {
    function handleOutsideClick() {
      setOpenCardMenuId(null);
      setOpenColMenuId(null);
      setMovingFolderItemId(null);
    }
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const partnerOtherName = useMemo(() => {
    if (!data?.partners) return 'sua sócia';
    const other = data.partners.find((p) => p.id !== user.id);
    if (!other) return 'sua sócia';
    return other.name.split(' ')[0];
  }, [data?.partners, user.id]);

  const columns = data?.columns || [];
  const folders = data?.folders || [];
  const themes = data?.themes || [];
  const tags = data?.tags || [];
  const items = data?.items || [];
  const partners = data?.partners || [];

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const themeMap = useMemo(() => new Map(themes.map((t) => [t.id, t])), [themes]);
  const tagMap = useMemo(() => new Map(tags.map((tg) => [tg.id, tg])), [tags]);
  const columnMap = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const partnerMap = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  const counts = useMemo(() => {
    const favCount = items.filter((i) => i.is_favorite).length;
    const draftCount = items.filter((i) => i.is_draft).length;
    const sharedCount = items.filter((i) => i.created_by_id !== user.id || i.assignee_id === user.id).length;
    return {
      all: items.length,
      favorites: favCount,
      drafts: draftCount,
      shared: sharedCount,
    };
  }, [items, user.id]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((item) => {
      if (quickFilter === 'favorites' && !item.is_favorite) return false;
      if (quickFilter === 'drafts' && !item.is_draft) return false;
      if (quickFilter === 'shared' && item.created_by_id === user.id && item.assignee_id === user.id) return false;
      if (quickFilter === 'recent') {
        const diffDays = (Date.now() - new Date(item.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 14) return false;
      }

      if (selectedFolderId !== 'all') {
        if (selectedFolderId === 'none' ? item.folder_id !== null : item.folder_id !== selectedFolderId) {
          return false;
        }
      }
      if (selectedThemeId !== 'all' && item.theme_id !== selectedThemeId) return false;
      if (selectedTagId !== 'all' && !(item.tag_ids || []).includes(selectedTagId)) return false;
      if (selectedColumnId !== 'all' && item.column_id !== selectedColumnId) return false;

      if (q) {
        const plainBody = stripHtmlTags(item.body_html || '').toLowerCase();
        const themeName = (item.theme_id ? themeMap.get(item.theme_id)?.name : '')?.toLowerCase() || '';
        const folderName = (item.folder_id ? folderMap.get(item.folder_id)?.name : '')?.toLowerCase() || '';
        const tagNames = (item.tag_ids || [])
          .map((id) => tagMap.get(id)?.name || '')
          .join(' ')
          .toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !plainBody.includes(q) &&
          !themeName.includes(q) &&
          !folderName.includes(q) &&
          !tagNames.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });

    if (sortBy === 'az') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    }
    if (sortBy === 'oldest') {
      return [...list].sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
    }
    return [...list].sort((a, b) => {
      if (viewMode === 'kanban' && a.column_id === b.column_id && a.sort_order !== b.sort_order) {
        return a.sort_order - b.sort_order;
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [
    items,
    quickFilter,
    selectedFolderId,
    selectedThemeId,
    selectedTagId,
    selectedColumnId,
    search,
    sortBy,
    viewMode,
    user.id,
    themeMap,
    folderMap,
    tagMap,
  ]);

  const hasActiveFilters =
    quickFilter !== 'all' ||
    selectedFolderId !== 'all' ||
    selectedThemeId !== 'all' ||
    selectedTagId !== 'all' ||
    selectedColumnId !== 'all' ||
    search.trim().length > 0;

  function resetFilters() {
    setQuickFilter('all');
    setSelectedFolderId('all');
    setSelectedThemeId('all');
    setSelectedTagId('all');
    setSelectedColumnId('all');
    setSearch('');
  }

  function openNewContent(colId?: string) {
    setEditingItem(null);
    setEditorDefaultColumnId(colId || columns[0]?.id);
    setEditorOpen(true);
  }

  function openEditContent(item: ContentItem) {
    setEditingItem(item);
    setEditorDefaultColumnId(item.column_id);
    setEditorOpen(true);
  }

  async function handleToggleFavorite(item: ContentItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    // Optimistic update
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) => (it.id === item.id ? { ...it, is_favorite: !it.is_favorite } : it)),
          }
        : prev
    );
    try {
      await api(`/contents/items/${item.id}/favorite`, { method: 'PATCH' });
    } catch {
      loadWorkspace(true);
    }
  }

  async function handleDuplicateItem(item: ContentItem) {
    setOpenCardMenuId(null);
    await api(`/contents/items/${item.id}/duplicate`, { method: 'POST' });
    await loadWorkspace(true);
  }

  async function handleDeleteItem(item: ContentItem) {
    setOpenCardMenuId(null);
    await api(`/contents/items/${item.id}`, { method: 'DELETE' });
    await loadWorkspace(true);
  }

  async function handleMoveItemFolder(item: ContentItem, nextFolderId: string | null) {
    setMovingFolderItemId(null);
    setOpenCardMenuId(null);
    await api(`/contents/items/${item.id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ folder_id: nextFolderId }),
    });
    await loadWorkspace(true);
  }

  async function handleMoveCardToColumn(cardId: string, targetColumnId: string, sortOrder?: number) {
    const dragged = items.find((i) => i.id === cardId);
    if (!dragged) return;
    if (dragged.column_id === targetColumnId && sortOrder === undefined) return;

    // Optimistic move
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((it) =>
              it.id === cardId ? { ...it, column_id: targetColumnId, sort_order: sortOrder ?? it.sort_order } : it
            ),
          }
        : prev
    );

    try {
      await api(`/contents/items/${cardId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ column_id: targetColumnId, sort_order: sortOrder }),
      });
      await loadWorkspace(true);
    } catch {
      loadWorkspace(true);
    }
  }

  async function handleReorderColumns(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const order = [...columns];
    const fromIdx = order.findIndex((c) => c.id === sourceId);
    const toIdx = order.findIndex((c) => c.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);

    setData((prev) => (prev ? { ...prev, columns: order.map((c, idx) => ({ ...c, sort_order: idx })) } : prev));
    try {
      await api('/contents/columns/reorder', {
        method: 'PUT',
        body: JSON.stringify({ column_ids: order.map((c) => c.id) }),
      });
      await loadWorkspace(true);
    } catch {
      loadWorkspace(true);
    }
  }

  async function handleShiftColumn(colId: string, direction: -1 | 1) {
    setOpenColMenuId(null);
    const idx = columns.findIndex((c) => c.id === colId);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= columns.length) return;
    await handleReorderColumns(colId, columns[targetIdx].id);
  }

  const visibleColumns =
    selectedColumnId === 'all' ? columns : columns.filter((c) => c.id === selectedColumnId);

  if (loading && !data) {
    return (
      <div className="aumi-glass-strong rounded-3xl p-8 flex items-center justify-center min-h-[420px]">
        <p className="text-sm font-medium text-[#2F1534]/65">Carregando central de conteúdos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      {/* ============================================================= */}
      {/* LEFT SIDEBAR — QUICK VIEWS, PASTAS & ÚLTIMOS EDITS            */}
      {/* ============================================================= */}
      <aside className="w-full lg:w-[264px] shrink-0 rounded-3xl bg-white/88 backdrop-blur-xl border border-[#F2D5E6] shadow-[0_14px_34px_-20px_rgba(47,21,52,0.22)] p-4 space-y-4">
        {/* Sidebar Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#2F1534] leading-tight">Conteúdos</h2>
            <p className="text-[11px] text-[#7A689C] mt-0.5 leading-snug">
              Organize, crie e compartilhe suas ideias com a {partnerOtherName} ♡
            </p>
          </div>
          <Sparkles className="w-4 h-4 text-[#EC2B82] shrink-0 mt-1" />
        </div>

        {/* Primary CTA Button */}
        <button
          type="button"
          onClick={() => openNewContent()}
          className="w-full py-2.5 px-4 rounded-2xl bg-gradient-to-r from-[#EC2B82] to-[#F05A9B] hover:from-[#d92174] hover:to-[#e6468d] text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-[0_10px_22px_-10px_rgba(236,43,130,0.75)] transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Novo conteúdo</span>
        </button>

        {/* Quick Views */}
        <nav className="space-y-1">
          {[
            { id: 'all' as QuickNavFilter, label: 'Todos os conteúdos', icon: LayoutGrid, count: counts.all },
            { id: 'favorites' as QuickNavFilter, label: 'Favoritos', icon: Heart, count: counts.favorites },
            { id: 'recent' as QuickNavFilter, label: 'Recentes', icon: Clock, count: undefined },
            { id: 'drafts' as QuickNavFilter, label: 'Rascunhos', icon: FileText, count: counts.drafts },
            { id: 'shared' as QuickNavFilter, label: 'Compartilhados comigo', icon: Users, count: undefined },
          ].map((nav) => {
            const IconComp = nav.icon;
            const active = quickFilter === nav.id && selectedFolderId === 'all';
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  setQuickFilter(nav.id);
                  setSelectedFolderId('all');
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                  active
                    ? 'bg-[#F8ECF9] text-[#2F1534]'
                    : 'text-[#2F1534]/75 hover:bg-[#FAF5FA] hover:text-[#2F1534]'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <IconComp
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#EC2B82]' : 'text-[#7A689C]'
                    }`}
                  />
                  <span className="truncate">{nav.label}</span>
                </span>
                {nav.count !== undefined && (
                  <span className="text-[11px] font-bold text-[#7A689C] tabular-nums">{nav.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Pastas Section */}
        <div className="pt-3 border-t border-[#EFE3EE] space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-[#2F1534]">Pastas</span>
            <button
              type="button"
              onClick={() => {
                setEditingFolder(null);
                setFolderModalOpen(true);
              }}
              title="Nova pasta"
              className="w-6 h-6 rounded-lg bg-[#FAF4FA] hover:bg-[#FCE4F0] text-[#7A689C] hover:text-[#EC2B82] flex items-center justify-center transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-0.5 max-h-[240px] overflow-y-auto pr-0.5">
            {folders.map((folder) => {
              const active = selectedFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  className={`group flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-xl transition-colors ${
                    active ? 'bg-[#FDF2F6] text-[#EC2B82]' : 'hover:bg-[#FAF5FA] text-[#2F1534]/80'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFolderId(active ? 'all' : folder.id);
                      setQuickFilter('all');
                    }}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left text-xs font-medium"
                  >
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${folder.color}20`, color: folder.color }}
                    >
                      {renderContentIcon(folder.icon, 'w-3.5 h-3.5')}
                    </span>
                    <span className="truncate font-semibold">{folder.name}</span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolder(folder);
                        setFolderModalOpen(true);
                      }}
                      title="Editar pasta"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white text-[#7A689C] hover:text-[#EC2B82] transition-opacity"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <span className="text-[11px] font-bold text-[#7A689C] tabular-nums min-w-[16px] text-right">
                      {folder.items_count || 0}
                    </span>
                  </div>
                </div>
              );
            })}
            {folders.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setEditingFolder(null);
                  setFolderModalOpen(true);
                }}
                className="w-full py-2.5 rounded-xl border border-dashed border-[#DFC9DF] text-[11px] font-semibold text-[#7A689C] hover:border-[#EC2B82] hover:text-[#EC2B82] inline-flex items-center justify-center gap-1.5"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Criar primeira pasta</span>
              </button>
            )}
          </div>
        </div>

        {/* Últimos edits */}
        <div className="pt-3 border-t border-[#EFE3EE] space-y-2">
          <p className="text-xs font-bold text-[#2F1534] px-1">Últimos edits</p>
          {!data?.recent_edits?.length ? (
            <p className="text-[11px] text-[#2F1534]/45 px-1">Nenhuma edição registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {data.recent_edits.slice(0, 3).map((ed) => {
                const editorPartner = partnerMap.get(ed.updated_by_id);
                const isMe = ed.updated_by_id === user.id;
                const foundItem = items.find((i) => i.id === ed.id);
                return (
                  <button
                    key={ed.id}
                    type="button"
                    onClick={() => foundItem && openEditContent(foundItem)}
                    className="w-full text-left flex items-start gap-2.5 p-2 rounded-xl bg-[#FAF6FB]/80 hover:bg-[#FDF2F6] transition-colors"
                  >
                    <PartnerAvatar
                      name={editorPartner?.name || ed.updated_by_name}
                      avatarUrl={editorPartner?.avatar_url}
                      partnerKey={editorPartner?.partner_key}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[#2F1534] truncate">
                        {isMe ? 'Você editou' : `${ed.updated_by_name.split(' ')[0]} editou`}
                      </p>
                      <p className="text-[11px] text-[#7A689C] truncate">“{ed.title}”</p>
                      <p className="text-[10px] text-[#2F1534]/45 tabular-nums mt-0.5">
                        {formatRelativeTime(ed.updated_at)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ============================================================= */}
      {/* MAIN CONTENT VIEWPORT                                         */}
      {/* ============================================================= */}
      <div className="flex-1 min-w-0 w-full space-y-4">
        {error && (
          <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Soft Lilac/Pink Editorial Banner matching Mockup */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#E6D6F8] via-[#F2DDF3] to-[#E2CBF5] border border-white/80 px-5 sm:px-6 py-5 shadow-[0_14px_34px_-22px_rgba(122,104,156,0.45)]">
          <div
            className="pointer-events-none absolute -right-10 -top-12 w-56 h-56 rounded-full opacity-40"
            style={{ background: 'radial-gradient(circle, rgba(236,43,130,0.32), transparent 68%)' }}
          />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-white/85 border border-white text-[#EC2B82] flex items-center justify-center shadow-xs shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-[#2F1534] tracking-tight">Conteúdos</h1>
                <p className="text-xs sm:text-sm text-[#2F1534]/70">
                  Sua central compartilhada de criação, roteiros e organização de materiais.
                </p>
              </div>
            </div>

            {/* Independent Taxonomy Management Buttons */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setTaxonomyModal('themes')}
                className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-white border border-white text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#7A689C]" />
                <span>Temas ({themes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTaxonomyModal('tags')}
                className="px-3.5 py-2 rounded-xl bg-white/90 hover:bg-white border border-white text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors whitespace-nowrap"
              >
                <Tag className="w-3.5 h-3.5 text-[#EC2B82]" />
                <span>Etiquetas ({tags.length})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar: View Switcher + Search + Independent Filters */}
        <div className="rounded-2xl bg-white/88 backdrop-blur-xl border border-[#F2D5E6] p-3 flex flex-wrap items-center gap-2.5 shadow-xs">
          {/* Kanban | Lista Segmented Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-[#F6EEF8] border border-[#EBDCEF] shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#2F1534] shadow-xs'
                  : 'text-[#7A689C] hover:text-[#2F1534]'
              }`}
            >
              <Kanban className="w-3.5 h-3.5 text-[#EC2B82]" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-[#2F1534] shadow-xs'
                  : 'text-[#7A689C] hover:text-[#2F1534]'
              }`}
            >
              <List className="w-3.5 h-3.5 text-[#7A689C]" />
              <span>Lista</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-[#7A689C]/60 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conteúdos..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
            />
          </div>

          {/* Independent Filters */}
          <select
            value={selectedFolderId}
            onChange={(e) => setSelectedFolderId(e.target.value)}
            aria-label="Filtrar por pasta"
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
          >
            <option value="all">Todas as pastas</option>
            <option value="none">Sem pasta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          <select
            value={selectedThemeId}
            onChange={(e) => setSelectedThemeId(e.target.value)}
            aria-label="Filtrar por tema"
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
          >
            <option value="all">Todos os temas</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            aria-label="Filtrar por etiqueta"
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
          >
            <option value="all">Todas as etiquetas</option>
            {tags.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {tg.name}
              </option>
            ))}
          </select>

          <select
            value={selectedColumnId}
            onChange={(e) => setSelectedColumnId(e.target.value)}
            aria-label="Filtrar por status"
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
          >
            <option value="all">Todos os status</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            aria-label="Ordenar"
            className="px-2.5 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
            <option value="az">Título A–Z</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1.5 rounded-xl bg-[#FDF2F6] text-[#EC2B82] text-xs font-semibold inline-flex items-center gap-1 hover:bg-[#FCE2EE]"
            >
              <X className="w-3 h-3" />
              <span>Limpar</span>
            </button>
          )}

          {viewMode === 'kanban' && (
            <button
              type="button"
              onClick={() => {
                setEditingColumn(null);
                setColumnModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-[#FAF4FA] hover:bg-[#F3E5F6] border border-[#E7D4EC] text-[#2F1534] text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#7A689C]" />
              <span>Nova coluna</span>
            </button>
          )}
        </div>

        {/* ============================================================= */}
        {/* KANBAN VIEW                                                   */}
        {/* ============================================================= */}
        {viewMode === 'kanban' ? (
          <div className="flex items-start gap-3.5 overflow-x-auto pb-4 -mx-1 px-1">
            {visibleColumns.map((col, colIdx) => {
              const colCards = filteredItems.filter((it) => it.column_id === col.id);
              const isDropTarget = dragOverColId === col.id;

              return (
                <div
                  key={col.id}
                  draggable
                  onDragStart={(e) => {
                    if (draggingCardId) return;
                    setDraggingColId(col.id);
                    e.dataTransfer.setData('text/aumi-col', col.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDraggingColId(null);
                    setDragOverColId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggingCardId || draggingColId) {
                      setDragOverColId(col.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverColId === col.id) setDragOverColId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverColId(null);
                    const cardId = e.dataTransfer.getData('text/aumi-card') || draggingCardId;
                    const srcColId = e.dataTransfer.getData('text/aumi-col') || draggingColId;
                    if (cardId) {
                      handleMoveCardToColumn(cardId, col.id);
                      setDraggingCardId(null);
                    } else if (srcColId && srcColId !== col.id) {
                      handleReorderColumns(srcColId, col.id);
                      setDraggingColId(null);
                    }
                  }}
                  className={`w-[274px] sm:w-[286px] shrink-0 rounded-3xl p-3 flex flex-col gap-2.5 transition-all border ${
                    isDropTarget
                      ? 'bg-[#FDF0F7] border-[#EC2B82] shadow-[0_0_0_2px_rgba(236,43,130,0.18)]'
                      : 'bg-white/76 backdrop-blur-md border-[#F1D9E8] shadow-[0_10px_28px_-22px_rgba(47,21,52,0.3)]'
                  }`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${col.color}22`, color: col.color }}
                      >
                        {renderContentIcon(col.icon, 'w-3.5 h-3.5')}
                      </span>
                      <h3 className="text-xs font-bold text-[#2F1534] truncate">{col.title}</h3>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#FAF4FA] text-[10px] font-bold text-[#7A689C] tabular-nums shrink-0">
                        {colCards.length}
                      </span>
                    </div>

                    <div className="relative flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openNewContent(col.id)}
                        title="Adicionar conteúdo nesta coluna"
                        className="w-6 h-6 rounded-lg hover:bg-[#FCE4F0] text-[#7A689C] hover:text-[#EC2B82] flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenColMenuId(openColMenuId === col.id ? null : col.id);
                        }}
                        title="Opções da coluna"
                        className="w-6 h-6 rounded-lg hover:bg-black/[0.05] text-[#7A689C] flex items-center justify-center"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {openColMenuId === col.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-7 z-30 w-44 rounded-xl bg-white border border-black/10 shadow-xl py-1 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setOpenColMenuId(null);
                              setEditingColumn(col);
                              setColumnModalOpen(true);
                            }}
                            className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] text-[#2F1534] flex items-center gap-2"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#7A689C]" />
                            <span>Editar coluna</span>
                          </button>
                          {colIdx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleShiftColumn(col.id, -1)}
                              className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] text-[#2F1534] flex items-center gap-2"
                            >
                              <ArrowLeft className="w-3.5 h-3.5 text-[#7A689C]" />
                              <span>Mover à esquerda</span>
                            </button>
                          )}
                          {colIdx < visibleColumns.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleShiftColumn(col.id, 1)}
                              className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] text-[#2F1534] flex items-center gap-2"
                            >
                              <ArrowRight className="w-3.5 h-3.5 text-[#7A689C]" />
                              <span>Mover à direita</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cards Stack */}
                  <div className="space-y-2.5 min-h-[60px]">
                    {colCards.map((item) => {
                      const darkCard = isDarkHex(item.card_color);
                      const theme = item.theme_id ? themeMap.get(item.theme_id) : null;
                      const folder = item.folder_id ? folderMap.get(item.folder_id) : null;
                      const itemTags = (item.tag_ids || [])
                        .map((tid) => tagMap.get(tid))
                        .filter((t): t is NonNullable<typeof t> => Boolean(t));
                      const editorPartner = partnerMap.get(item.updated_by_id);

                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            setDraggingCardId(item.id);
                            e.dataTransfer.setData('text/aumi-card', item.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggingCardId(null);
                            setDragOverColId(null);
                          }}
                          onClick={() => openEditContent(item)}
                          style={{
                            backgroundColor: item.card_color || '#FFFFFF',
                            borderColor: darkCard ? 'rgba(255,255,255,0.22)' : 'rgba(47,21,52,0.09)',
                          }}
                          className={`group relative rounded-2xl border p-3.5 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md ${
                            draggingCardId === item.id ? 'opacity-55 scale-[0.98]' : 'shadow-[0_6px_16px_-12px_rgba(47,21,52,0.28)]'
                          }`}
                        >
                          {/* Top Row: Symbol Icon + Title + Favorite */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 min-w-0">
                              <span
                                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                                  darkCard
                                    ? 'bg-white/20 text-white'
                                    : 'bg-[#2F1534]/[0.06] text-[#EC2B82]'
                                }`}
                              >
                                {renderContentIcon(item.card_icon, 'w-3.5 h-3.5')}
                              </span>
                              <div className="min-w-0">
                                <h4
                                  className={`text-[13px] font-bold leading-snug line-clamp-2 ${
                                    darkCard ? 'text-white' : 'text-[#2F1534]'
                                  }`}
                                >
                                  {item.title}
                                </h4>
                                {item.is_draft && (
                                  <span
                                    className={`inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide ${
                                      darkCard ? 'text-white/80' : 'text-[#E1754C]'
                                    }`}
                                  >
                                    Rascunho
                                  </span>
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(item, e)}
                              title={item.is_favorite ? 'Remover dos favoritos' : 'Favoritar'}
                              className={`p-1 rounded-lg shrink-0 transition-colors ${
                                darkCard
                                  ? 'hover:bg-white/15 text-white'
                                  : 'hover:bg-black/[0.05] text-[#7A689C]'
                              }`}
                            >
                              <Heart
                                className={`w-3.5 h-3.5 ${
                                  item.is_favorite
                                    ? darkCard
                                      ? 'fill-white text-white'
                                      : 'fill-[#EC2B82] text-[#EC2B82]'
                                    : ''
                                }`}
                              />
                            </button>
                          </div>

                          {/* Theme & Folder Metadata */}
                          {(theme || folder) && (
                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                              {theme && (
                                <span
                                  style={
                                    darkCard
                                      ? { backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }
                                      : { backgroundColor: `${theme.color}18`, color: '#2F1534' }
                                  }
                                  className="px-2 py-0.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1"
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: darkCard ? '#FFFFFF' : theme.color }}
                                  />
                                  {theme.name}
                                </span>
                              )}
                              {folder && (
                                <span
                                  className={`text-[10px] font-medium truncate max-w-[130px] ${
                                    darkCard ? 'text-white/80' : 'text-[#7A689C]'
                                  }`}
                                >
                                  · {folder.name}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Multi-Tags (Complementary) */}
                          {itemTags.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {itemTags.slice(0, 3).map((tg) => (
                                <span
                                  key={tg.id}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 ${
                                    darkCard
                                      ? 'bg-black/15 text-white/95'
                                      : 'bg-black/[0.045] text-[#2F1534]/75'
                                  }`}
                                >
                                  <span
                                    className="w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: darkCard ? '#FFFFFF' : tg.color }}
                                  />
                                  {tg.name}
                                </span>
                              ))}
                              {itemTags.length > 3 && (
                                <span
                                  className={`text-[10px] font-semibold ${
                                    darkCard ? 'text-white/75' : 'text-[#7A689C]'
                                  }`}
                                >
                                  +{itemTags.length - 3}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Footer: Editor Avatar + Timestamp + Quick Actions */}
                          <div
                            className={`mt-3 pt-2 border-t flex items-center justify-between gap-2 ${
                              darkCard ? 'border-white/15' : 'border-black/[0.05]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <PartnerAvatar
                                name={editorPartner?.name || item.updated_by_name}
                                avatarUrl={editorPartner?.avatar_url}
                                partnerKey={editorPartner?.partner_key}
                                size="xs"
                              />
                              <span
                                className={`text-[10px] font-medium truncate tabular-nums ${
                                  darkCard ? 'text-white/85' : 'text-[#2F1534]/55'
                                }`}
                              >
                                {formatRelativeTime(item.updated_at)}
                              </span>
                            </div>

                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCardMenuId(openCardMenuId === item.id ? null : item.id);
                                  setMovingFolderItemId(null);
                                }}
                                title="Ações do cartão"
                                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                                  darkCard
                                    ? 'hover:bg-white/15 text-white/85'
                                    : 'hover:bg-black/[0.05] text-[#7A689C]'
                                }`}
                              >
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>

                              {openCardMenuId === item.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-0 bottom-7 z-30 w-44 rounded-xl bg-white border border-black/10 shadow-xl py-1 text-xs text-[#2F1534]"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenCardMenuId(null);
                                      openEditContent(item);
                                    }}
                                    className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] flex items-center gap-2"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-[#7A689C]" />
                                    <span>Editar conteúdo</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDuplicateItem(item)}
                                    className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] flex items-center gap-2"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-[#7A689C]" />
                                    <span>Duplicar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMovingFolderItemId(movingFolderItemId === item.id ? null : item.id)
                                    }
                                    className="w-full px-3 py-1.5 text-left hover:bg-[#FAF5FA] flex items-center justify-between"
                                  >
                                    <span className="inline-flex items-center gap-2">
                                      <FolderPlus className="w-3.5 h-3.5 text-[#7A689C]" />
                                      <span>Mover pasta</span>
                                    </span>
                                  </button>
                                  {movingFolderItemId === item.id && (
                                    <div className="px-2 py-1 border-y border-black/[0.06] bg-[#FAF6FB] space-y-0.5 max-h-32 overflow-y-auto">
                                      <button
                                        type="button"
                                        onClick={() => handleMoveItemFolder(item, null)}
                                        className="w-full px-2 py-1 rounded text-left text-[11px] hover:bg-white text-[#7A689C]"
                                      >
                                        Sem pasta
                                      </button>
                                      {folders.map((f) => (
                                        <button
                                          key={f.id}
                                          type="button"
                                          onClick={() => handleMoveItemFolder(item, f.id)}
                                          className="w-full px-2 py-1 rounded text-left text-[11px] hover:bg-white text-[#2F1534] truncate"
                                        >
                                          {f.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="w-full px-3 py-1.5 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Excluir</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Add in Column */}
                  <button
                    type="button"
                    onClick={() => openNewContent(col.id)}
                    className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-[#7A689C] hover:text-[#EC2B82] hover:bg-white/90 inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar conteúdo</span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          /* ============================================================= */
          /* LIST VIEW (STRUCTURED TABLE)                                  */
          /* ============================================================= */
          <div className="rounded-3xl bg-white/90 backdrop-blur-xl border border-[#F2D5E6] shadow-xs overflow-hidden">
            {filteredItems.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-[#2F1534]">Nenhum conteúdo encontrado com estes filtros.</p>
                <div className="flex items-center justify-center gap-2">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="px-3.5 py-2 rounded-xl bg-[#FAF4FA] text-xs font-semibold text-[#2F1534]"
                    >
                      Limpar filtros
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openNewContent()}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Novo conteúdo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[780px]">
                  <thead>
                    <tr className="border-b border-[#EFE3EE] bg-[#FAF6FB]/80 text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                      <th className="py-3 px-4">Conteúdo</th>
                      <th className="py-3 px-3">Pasta</th>
                      <th className="py-3 px-3">Tema</th>
                      <th className="py-3 px-3">Etiquetas</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Responsável</th>
                      <th className="py-3 px-3">Atualização</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3E9F2] text-xs">
                    {filteredItems.map((item) => {
                      const folder = item.folder_id ? folderMap.get(item.folder_id) : null;
                      const theme = item.theme_id ? themeMap.get(item.theme_id) : null;
                      const col = columnMap.get(item.column_id);
                      const assignee = item.assignee_id ? partnerMap.get(item.assignee_id) : null;
                      const itemTags = (item.tag_ids || [])
                        .map((tid) => tagMap.get(tid))
                        .filter((t): t is NonNullable<typeof t> => Boolean(t));
                      const darkSwatch = isDarkHex(item.card_color);

                      return (
                        <tr
                          key={item.id}
                          onClick={() => openEditContent(item)}
                          className="hover:bg-[#FDF6FA] cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                style={{
                                  backgroundColor: item.card_color || '#FFFFFF',
                                  borderColor: darkSwatch ? 'transparent' : 'rgba(47,21,52,0.12)',
                                }}
                                className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
                                  darkSwatch ? 'text-white' : 'text-[#EC2B82]'
                                }`}
                              >
                                {renderContentIcon(item.card_icon, 'w-4 h-4')}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-[#2F1534] truncate max-w-[240px]">{item.title}</p>
                                {item.is_draft && (
                                  <span className="text-[10px] font-semibold text-[#E1754C]">Rascunho</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[#2F1534]/80 whitespace-nowrap">
                            {folder ? (
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: folder.color }} />
                                {folder.name}
                              </span>
                            ) : (
                              <span className="text-[#2F1534]/35">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {theme ? (
                              <span
                                style={{ backgroundColor: `${theme.color}18`, color: '#2F1534' }}
                                className="px-2 py-0.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.color }} />
                                {theme.name}
                              </span>
                            ) : (
                              <span className="text-[#2F1534]/35">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap gap-1 max-w-[180px]">
                              {itemTags.length === 0 ? (
                                <span className="text-[#2F1534]/35">—</span>
                              ) : (
                                itemTags.map((tg) => (
                                  <span
                                    key={tg.id}
                                    className="px-1.5 py-0.5 rounded bg-black/[0.045] text-[10px] font-semibold text-[#2F1534]/80 inline-flex items-center gap-1"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tg.color }} />
                                    {tg.name}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {col && (
                              <span
                                style={{ backgroundColor: `${col.color}1C`, color: '#2F1534' }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5"
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                                {col.title}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {assignee ? (
                              <div className="inline-flex items-center gap-1.5">
                                <PartnerAvatar
                                  name={assignee.name}
                                  avatarUrl={assignee.avatar_url}
                                  partnerKey={assignee.partner_key}
                                  size="xs"
                                />
                                <span className="font-medium text-[#2F1534]/80">
                                  {assignee.name.split(' ')[0]}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[#2F1534]/35">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap tabular-nums text-[#7A689C]">
                            {formatRelativeTime(item.updated_at)}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => handleToggleFavorite(item, e)}
                                className="p-1.5 rounded-lg hover:bg-[#FDF2F6] text-[#7A689C]"
                                title="Favoritar"
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    item.is_favorite ? 'fill-[#EC2B82] text-[#EC2B82]' : ''
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditContent(item)}
                                className="p-1.5 rounded-lg hover:bg-[#FAF4FA] text-[#7A689C] hover:text-[#2F1534]"
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-[#7A689C] hover:text-red-600"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============================================================= */}
      {/* MODALS                                                        */}
      {/* ============================================================= */}
      <ContentEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        item={editingItem}
        defaultColumnId={editorDefaultColumnId}
        defaultFolderId={selectedFolderId !== 'all' && selectedFolderId !== 'none' ? selectedFolderId : null}
        columns={columns}
        folders={folders}
        themes={themes}
        tags={tags}
        partners={partners}
        currentUser={user}
        onSaved={() => loadWorkspace(true)}
      />

      <ContentFolderModal
        open={folderModalOpen}
        onClose={() => setFolderModalOpen(false)}
        folder={editingFolder}
        onSaved={() => loadWorkspace(true)}
      />

      <ContentColumnModal
        open={columnModalOpen}
        onClose={() => setColumnModalOpen(false)}
        column={editingColumn}
        canDelete={columns.length > 1}
        onSaved={() => loadWorkspace(true)}
      />

      <ContentTaxonomyManagerModal
        open={taxonomyModal !== null}
        mode={taxonomyModal || 'themes'}
        onClose={() => setTaxonomyModal(null)}
        themes={themes}
        tags={tags}
        onSaved={() => loadWorkspace(true)}
      />
    </div>
  );
}
