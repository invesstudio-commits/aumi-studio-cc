import React, { useEffect, useState } from 'react';
import { Check, Columns, Folder, Pencil, Plus, Sparkles, Tag, Trash2 } from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  CONTENT_ICON_OPTIONS,
  CONTENT_TAXONOMY_COLORS,
  renderContentIcon,
} from '../lib/contentPalette.tsx';
import { ContentColumn, ContentFolder, ContentTag, ContentTheme } from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';

// =====================================================================
// 1. FOLDER CREATE / EDIT MODAL
// =====================================================================
interface FolderModalProps {
  open: boolean;
  onClose: () => void;
  folder: ContentFolder | null;
  onSaved: () => Promise<void>;
}

export function ContentFolderModal({ open, onClose, folder, onSaved }: FolderModalProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#EC2B82');
  const [icon, setIcon] = useState('folder');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (folder) {
      setName(folder.name);
      setColor(folder.color || '#EC2B82');
      setIcon(folder.icon || 'folder');
    } else {
      setName('');
      setColor('#EC2B82');
      setIcon('folder');
    }
  }, [open, folder]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome da pasta.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (folder) {
        await api(`/contents/folders/${folder.id}`, {
          method: 'PUT',
          body: JSON.stringify({ name: name.trim(), color, icon }),
        });
      } else {
        await api('/contents/folders', {
          method: 'POST',
          body: JSON.stringify({ name: name.trim(), color, icon }),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pasta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!folder) return;
    setSaving(true);
    try {
      await api(`/contents/folders/${folder.id}`, { method: 'DELETE' });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir pasta.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={folder ? 'Editar pasta' : 'Nova pasta'}
      subtitle="Organize conteúdos por formato, campanha ou frente"
      icon={<Folder className="w-4 h-4 text-[#EC2B82]" />}
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Nome da pasta *</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Reels & Vídeos"
            className="w-full px-3.5 py-2 rounded-xl border border-black/12 bg-white text-sm focus:outline-none focus:border-[#EC2B82]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Cor da pasta</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TAXONOMY_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                style={{ backgroundColor: c.hex }}
                title={c.label}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-transform ${
                  color.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-offset-2 ring-[#2F1534] scale-105' : ''
                }`}
              >
                {color.toLowerCase() === c.hex.toLowerCase() && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Ícone</label>
          <div className="grid grid-cols-7 gap-1.5">
            {CONTENT_ICON_OPTIONS.slice(0, 21).map((opt) => {
              const active = icon === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  title={opt.label}
                  onClick={() => setIcon(opt.key)}
                  style={active ? { backgroundColor: color, borderColor: color } : undefined}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                    active ? 'text-white shadow-xs' : 'bg-[#FAF7FC] border-black/[0.06] text-[#2F1534]/70 hover:bg-white'
                  }`}
                >
                  {renderContentIcon(opt.key, 'w-4 h-4')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between gap-2">
          {folder ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleDelete}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir pasta</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-[#2F1534]/60">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d42273] text-white text-xs font-bold disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar pasta'}
            </button>
          </div>
        </div>
      </form>
    </MacWindow>
  );
}

// =====================================================================
// 2. COLUMN CREATE / EDIT MODAL
// =====================================================================
interface ColumnModalProps {
  open: boolean;
  onClose: () => void;
  column: ContentColumn | null;
  canDelete: boolean;
  onSaved: () => Promise<void>;
}

export function ContentColumnModal({ open, onClose, column, canDelete, onSaved }: ColumnModalProps) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('#EC2B82');
  const [icon, setIcon] = useState('sparkles');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (column) {
      setTitle(column.title);
      setColor(column.color || '#EC2B82');
      setIcon(column.icon || 'sparkles');
    } else {
      setTitle('');
      setColor('#7A689C');
      setIcon('sparkles');
    }
  }, [open, column]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Informe o nome da coluna.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (column) {
        await api(`/contents/columns/${column.id}`, {
          method: 'PUT',
          body: JSON.stringify({ title: title.trim(), color, icon }),
        });
      } else {
        await api('/contents/columns', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), color, icon }),
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar coluna.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!column) return;
    setSaving(true);
    try {
      await api(`/contents/columns/${column.id}`, { method: 'DELETE' });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir coluna.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-md"
      title={column ? 'Editar coluna' : 'Nova coluna'}
      subtitle="Personalize as etapas do quadro Kanban de Conteúdos"
      icon={<Columns className="w-4 h-4 text-[#7A689C]" />}
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Nome da coluna *</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Agendados"
            className="w-full px-3.5 py-2 rounded-xl border border-black/12 bg-white text-sm focus:outline-none focus:border-[#EC2B82]"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Cor de destaque</label>
          <div className="flex flex-wrap gap-2">
            {CONTENT_TAXONOMY_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                style={{ backgroundColor: c.hex }}
                title={c.label}
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  color.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-offset-2 ring-[#2F1534]' : ''
                }`}
              >
                {color.toLowerCase() === c.hex.toLowerCase() && <Check className="w-3.5 h-3.5 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#2F1534]">Ícone da coluna</label>
          <div className="grid grid-cols-7 gap-1.5">
            {CONTENT_ICON_OPTIONS.slice(0, 14).map((opt) => {
              const active = icon === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setIcon(opt.key)}
                  style={active ? { backgroundColor: color, borderColor: color } : undefined}
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                    active ? 'text-white' : 'bg-[#FAF7FC] border-black/[0.06] text-[#2F1534]/70'
                  }`}
                >
                  {renderContentIcon(opt.key, 'w-4 h-4')}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-3 border-t border-black/[0.06] flex items-center justify-between gap-2">
          {column && canDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleDelete}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir coluna</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-xs text-[#2F1534]/60">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d42273] text-white text-xs font-bold disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar coluna'}
            </button>
          </div>
        </div>
      </form>
    </MacWindow>
  );
}

// =====================================================================
// 3. INDEPENDENT TAXONOMY MANAGER MODAL (TEMAS OR ETIQUETAS)
// =====================================================================
interface TaxonomyManagerModalProps {
  open: boolean;
  mode: 'themes' | 'tags';
  onClose: () => void;
  themes: ContentTheme[];
  tags: ContentTag[];
  onSaved: () => Promise<void>;
}

export function ContentTaxonomyManagerModal({
  open,
  mode,
  onClose,
  themes,
  tags,
  onSaved,
}: TaxonomyManagerModalProps) {
  const isThemes = mode === 'themes';
  const items = isThemes ? themes : tags;
  const endpoint = isThemes ? '/contents/themes' : '/contents/tags';

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(isThemes ? '#7A689C' : '#EC2B82');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#7A689C');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setNewName('');
    setNewColor(isThemes ? '#7A689C' : '#EC2B82');
    setEditingId(null);
    setError('');
  }, [open, isThemes]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      setNewName('');
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await api(`${endpoint}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editName.trim(), color: editColor }),
      });
      setEditingId(null);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setSaving(true);
    setError('');
    try {
      await api(`${endpoint}/${id}`, { method: 'DELETE' });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title={isThemes ? 'Gerenciar Temas' : 'Gerenciar Etiquetas'}
      subtitle={
        isThemes
          ? 'Temas representam a categoria principal de cada conteúdo (ex: Portfólio, Vendas, Marketing).'
          : 'Etiquetas são marcadores complementares de múltipla escolha (ex: Urgente, Revisar).'
      }
      icon={
        isThemes ? (
          <Sparkles className="w-4 h-4 text-[#7A689C]" />
        ) : (
          <Tag className="w-4 h-4 text-[#EC2B82]" />
        )
      }
    >
      <div className="p-5 space-y-4">
        {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

        {/* Add form */}
        <form onSubmit={handleCreate} className="rounded-2xl bg-[#FAF6FB] border border-[#EBD8EE] p-3.5 space-y-2.5">
          <p className="text-xs font-bold text-[#2F1534]">
            {isThemes ? 'Criar novo tema principal' : 'Criar nova etiqueta'}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={isThemes ? 'Nome do tema...' : 'Nome da etiqueta...'}
              className="flex-1 px-3 py-2 rounded-xl border border-black/10 bg-white text-xs focus:outline-none focus:border-[#EC2B82]"
            />
            <button
              type="submit"
              disabled={saving || !newName.trim()}
              className="px-3.5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d42273] text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_TAXONOMY_COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setNewColor(c.hex)}
                style={{ backgroundColor: c.hex }}
                title={c.label}
                className={`w-6 h-6 rounded-md flex items-center justify-center ${
                  newColor.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-offset-1 ring-[#2F1534]' : ''
                }`}
              >
                {newColor.toLowerCase() === c.hex.toLowerCase() && <Check className="w-3 h-3 text-white" />}
              </button>
            ))}
          </div>
        </form>

        {/* Existing list */}
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {items.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-xl bg-white border border-black/[0.08] flex flex-col gap-2"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdate(entry.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#EC2B82]/50 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleUpdate(entry.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#EC2B82] text-white text-xs font-bold"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1.5 text-xs text-[#2F1534]/60"
                      >
                        Cancelar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTENT_TAXONOMY_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() => setEditColor(c.hex)}
                          style={{ backgroundColor: c.hex }}
                          className={`w-5 h-5 rounded-md flex items-center justify-center ${
                            editColor.toLowerCase() === c.hex.toLowerCase() ? 'ring-2 ring-offset-1 ring-[#2F1534]' : ''
                          }`}
                        >
                          {editColor.toLowerCase() === c.hex.toLowerCase() && <Check className="w-3 h-3 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-xs font-semibold text-[#2F1534] truncate">{entry.name}</span>
                      <span className="text-[10px] font-medium text-[#2F1534]/45 tabular-nums">
                        ({entry.items_count || 0})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(entry.id);
                          setEditName(entry.name);
                          setEditColor(entry.color);
                        }}
                        className="p-1.5 rounded-lg text-[#7A689C] hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                        title="Renomear ou alterar cor"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDelete(entry.id)}
                        className="p-1.5 rounded-lg text-[#7A689C] hover:bg-red-50 hover:text-red-600"
                        title="Excluir"
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

        <div className="pt-2 border-t border-black/[0.06] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-bold"
          >
            Concluir
          </button>
        </div>
      </div>
    </MacWindow>
  );
}
