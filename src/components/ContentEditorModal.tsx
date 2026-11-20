import React, { useEffect, useState } from 'react';
import {
  Check,
  FileEdit,
  Folder,
  Heart,
  Layers,
  Palette,
  Save,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  CONTENT_CARD_COLORS,
  CONTENT_ICON_OPTIONS,
  isDarkHex,
  renderContentIcon,
} from '../lib/contentPalette.tsx';
import {
  ContentColumn,
  ContentFolder,
  ContentItem,
  ContentTag,
  ContentTheme,
  PartnerKey,
  User,
} from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';
import { RichTextBox } from './RichTextBox.tsx';

interface ContentEditorModalProps {
  open: boolean;
  onClose: () => void;
  item: ContentItem | null;
  defaultColumnId?: string;
  defaultFolderId?: string | null;
  columns: ContentColumn[];
  folders: ContentFolder[];
  themes: ContentTheme[];
  tags: ContentTag[];
  partners: Array<{
    id: string;
    name: string;
    partner_key: PartnerKey | null;
    avatar_url: string | null;
    title: string;
  }>;
  currentUser: User;
  onSaved: () => Promise<void>;
  onDeleted?: () => Promise<void>;
}

export function ContentEditorModal({
  open,
  onClose,
  item,
  defaultColumnId,
  defaultFolderId,
  columns,
  folders,
  themes,
  tags,
  partners,
  currentUser,
  onSaved,
  onDeleted,
}: ContentEditorModalProps) {
  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [columnId, setColumnId] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [themeId, setThemeId] = useState<string>('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [cardColor, setCardColor] = useState('#FFFFFF');
  const [cardIcon, setCardIcon] = useState('sparkles');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>(currentUser.id);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setConfirmDelete(false);
    if (item) {
      setTitle(item.title);
      setBodyHtml(item.body_html || '');
      setColumnId(item.column_id || columns[0]?.id || '');
      setFolderId(item.folder_id || '');
      setThemeId(item.theme_id || '');
      setSelectedTagIds(item.tag_ids || []);
      setCardColor(item.card_color || '#FFFFFF');
      setCardIcon(item.card_icon || 'sparkles');
      setIsFavorite(Boolean(item.is_favorite));
      setIsDraft(Boolean(item.is_draft));
      setAssigneeId(item.assignee_id || currentUser.id);
    } else {
      setTitle('');
      setBodyHtml('');
      setColumnId(defaultColumnId || columns[0]?.id || '');
      setFolderId(defaultFolderId || '');
      setThemeId('');
      setSelectedTagIds([]);
      setCardColor('#FFFFFF');
      setCardIcon('sparkles');
      setIsFavorite(false);
      setIsDraft(false);
      setAssigneeId(currentUser.id);
    }
  }, [open, item, defaultColumnId, defaultFolderId, columns, currentUser.id]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function handleSave(asDraft?: boolean) {
    if (!title.trim()) {
      setError('Dê um título ao conteúdo antes de salvar.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        body_html: bodyHtml,
        column_id: columnId || columns[0]?.id,
        folder_id: folderId || null,
        theme_id: themeId || null,
        tag_ids: selectedTagIds,
        card_color: cardColor,
        card_icon: cardIcon,
        is_favorite: isFavorite,
        is_draft: asDraft !== undefined ? asDraft : isDraft,
        assignee_id: assigneeId || currentUser.id,
      };

      if (item) {
        await api(`/contents/items/${item.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/contents/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar conteúdo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    setSaving(true);
    setError('');
    try {
      await api(`/contents/items/${item.id}`, { method: 'DELETE' });
      if (onDeleted) {
        await onDeleted();
      } else {
        await onSaved();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir conteúdo.');
    } finally {
      setSaving(false);
    }
  }

  const darkPreview = isDarkHex(cardColor);
  const selectedTheme = themes.find((t) => t.id === themeId);

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      title={item ? 'Editar conteúdo' : 'Novo conteúdo'}
      subtitle={item ? `Última atualização por ${item.updated_by_name}` : 'Editor compartilhado do Aumi Studio'}
      icon={<FileEdit className="w-4 h-4 text-[#EC2B82]" />}
    >
      <div className="p-5 sm:p-6 space-y-5">
        {error && (
          <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Title + Rich Text Editor */}
          <div className="lg:col-span-8 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#2F1534]">Título do conteúdo *</label>
                <button
                  type="button"
                  onClick={() => setIsFavorite((v) => !v)}
                  title={isFavorite ? 'Remover dos favoritos' : 'Marcar como favorito'}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border transition-colors ${
                    isFavorite
                      ? 'bg-[#FDF2F6] border-[#EC2B82]/40 text-[#EC2B82]'
                      : 'bg-white border-black/10 text-[#2F1534]/65 hover:text-[#EC2B82]'
                  }`}
                >
                  <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-[#EC2B82]' : ''}`} />
                  <span>{isFavorite ? 'Favorito' : 'Favoritar'}</span>
                </button>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Carrossel — bastidores do processo criativo"
                className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 bg-white text-sm font-semibold text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#2F1534]">Texto, roteiro ou briefing</label>
                <span className="text-[11px] text-[#2F1534]/45">Editor com formatação completa</span>
              </div>
              <RichTextBox
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Escreva roteiros, legendas, tópicos, referências e ideias..."
                minHeightClass="min-h-[260px]"
              />
            </div>

            {/* Live Card Preview (Solid Color + Symbol Icon — NO photos) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#2F1534]">Pré-visualização do cartão</label>
              <div
                style={{
                  backgroundColor: cardColor,
                  borderColor: darkPreview ? 'rgba(255,255,255,0.22)' : 'rgba(47,21,52,0.1)',
                }}
                className="rounded-2xl border p-3.5 max-w-sm shadow-xs transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        darkPreview ? 'bg-white/20 text-white' : 'bg-[#2F1534]/[0.07] text-[#2F1534]'
                      }`}
                    >
                      {renderContentIcon(cardIcon, 'w-4 h-4')}
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-bold truncate ${
                          darkPreview ? 'text-white' : 'text-[#2F1534]'
                        }`}
                      >
                        {title.trim() || 'Título do seu conteúdo'}
                      </p>
                      {selectedTheme && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold mt-0.5 ${
                            darkPreview ? 'text-white/85' : 'text-[#7A689C]'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: darkPreview ? '#FFFFFF' : selectedTheme.color }}
                          />
                          {selectedTheme.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {isFavorite && (
                    <Heart
                      className={`w-4 h-4 shrink-0 ${
                        darkPreview ? 'text-white fill-white' : 'text-[#EC2B82] fill-[#EC2B82]'
                      }`}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Organization + Personalization */}
          <div className="lg:col-span-4 space-y-4">
            {/* Organization Fields */}
            <div className="rounded-2xl bg-[#FAF6FB] border border-[#EBD8EE] p-3.5 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#EC2B82]" />
                  <span>Status / Coluna</span>
                </label>
                <select
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>Pasta</span>
                </label>
                <select
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                >
                  <option value="">Sem pasta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#E1754C]" />
                  <span>Tema principal (categoria)</span>
                </label>
                <select
                  value={themeId}
                  onChange={(e) => setThemeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                >
                  <option value="">Sem tema definido</option>
                  {themes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#7A689C]" />
                  <span>Responsável</span>
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-xs font-medium text-[#2F1534] focus:outline-none focus:border-[#EC2B82]"
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Multi-Tags (Strictly Separate from Themes) */}
            <div className="rounded-2xl bg-white border border-black/[0.08] p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-[#EC2B82]" />
                  <span>Etiquetas ({selectedTagIds.length})</span>
                </span>
                <span className="text-[10px] text-[#2F1534]/45">Múltipla escolha</span>
              </div>
              {tags.length === 0 ? (
                <p className="text-[11px] text-[#2F1534]/45">Nenhuma etiqueta criada ainda.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tg) => {
                    const active = selectedTagIds.includes(tg.id);
                    return (
                      <button
                        key={tg.id}
                        type="button"
                        onClick={() => toggleTag(tg.id)}
                        style={
                          active
                            ? { backgroundColor: tg.color, borderColor: tg.color, color: '#FFFFFF' }
                            : { borderColor: 'rgba(47,21,52,0.12)', color: '#2F1534' }
                        }
                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition-all ${
                          active ? 'shadow-xs' : 'bg-[#FAF7FC] hover:bg-white'
                        }`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: active ? '#FFFFFF' : tg.color }}
                        />
                        <span>{tg.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Solid Card Color Picker */}
            <div className="rounded-2xl bg-white border border-black/[0.08] p-3.5 space-y-2.5">
              <span className="text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-[#EC2B82]" />
                <span>Cor sólida do cartão</span>
              </span>
              <div className="grid grid-cols-4 gap-2">
                {CONTENT_CARD_COLORS.map((swatch) => {
                  const selected = cardColor.toLowerCase() === swatch.hex.toLowerCase();
                  return (
                    <button
                      key={swatch.id}
                      type="button"
                      onClick={() => setCardColor(swatch.hex)}
                      title={swatch.label}
                      style={{
                        backgroundColor: swatch.hex,
                        borderColor: selected ? '#2F1534' : swatch.borderHex,
                      }}
                      className={`h-8 rounded-xl border-2 flex items-center justify-center transition-transform ${
                        selected ? 'scale-105 ring-2 ring-[#EC2B82]/40' : 'hover:scale-105'
                      }`}
                    >
                      {selected && (
                        <Check
                          className={`w-3.5 h-3.5 ${swatch.darkText ? 'text-[#2F1534]' : 'text-white'}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[#2F1534]/50">
                Selecionada:{' '}
                <strong className="text-[#2F1534]">
                  {CONTENT_CARD_COLORS.find((c) => c.hex.toLowerCase() === cardColor.toLowerCase())?.label ||
                    cardColor}
                </strong>
              </p>
            </div>

            {/* Symbol Icon Picker */}
            <div className="rounded-2xl bg-white border border-black/[0.08] p-3.5 space-y-2">
              <span className="text-[11px] font-bold text-[#2F1534]">Ícone do cartão</span>
              <div className="grid grid-cols-7 gap-1.5 max-h-[120px] overflow-y-auto pr-0.5">
                {CONTENT_ICON_OPTIONS.map((opt) => {
                  const active = cardIcon === opt.key;
                  const IconComp = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      title={opt.label}
                      onClick={() => setCardIcon(opt.key)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                        active
                          ? 'bg-[#EC2B82] border-[#EC2B82] text-white shadow-xs'
                          : 'bg-[#FAF7FC] border-black/[0.06] text-[#2F1534]/70 hover:bg-white hover:text-[#EC2B82]'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="pt-4 border-t border-black/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div>
            {item ? (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-red-600">Excluir definitivamente?</span>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleDelete}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1.5 rounded-xl text-xs text-[#2F1534]/60 hover:bg-black/5"
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              )
            ) : (
              <label className="inline-flex items-center gap-2 text-xs text-[#2F1534]/75 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isDraft}
                  onChange={(e) => setIsDraft(e.target.checked)}
                  className="rounded accent-[#EC2B82]"
                />
                <span>Marcar como rascunho</span>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#2F1534]/65 hover:bg-black/5"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="px-3.5 py-2 rounded-xl bg-[#FAF6FB] hover:bg-[#F2E7F7] border border-[#E2CCE8] text-[#2F1534] text-xs font-semibold disabled:opacity-50"
            >
              Salvar rascunho
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d42273] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Salvando...' : 'Salvar conteúdo'}</span>
            </button>
          </div>
        </div>
      </div>
    </MacWindow>
  );
}
