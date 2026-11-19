import React, { useState } from 'react';
import { Tag, Plus, Trash2, Check } from 'lucide-react';
import { api } from '../lib/api.ts';
import { MacWindow } from './MacWindow.tsx';

export interface StudioLabelItem {
  id: string;
  name: string;
  color: string;
  text: string;
  description?: string;
}

const LABEL_COLOR_PRESETS = [
  { name: 'Rosa', bg: '#FDF2F6', text: '#EC2B82' },
  { name: 'Lilás', bg: '#F3ECF9', text: '#7A689C' },
  { name: 'Roxo', bg: '#EDE9FE', text: '#6D28D9' },
  { name: 'Laranja', bg: '#FDF0E8', text: '#E1754C' },
  { name: 'Verde', bg: '#ECFDF5', text: '#15803D' },
  { name: 'Cru', bg: '#FCF6EC', text: '#6B4F2A' },
  { name: 'Preto', bg: '#2F1534', text: '#FFFFFF' },
];

interface LabelsManagerModalProps {
  open: boolean;
  labels: StudioLabelItem[];
  onClose: () => void;
  onSaved: (updated: StudioLabelItem[]) => void;
}

export function LabelsManagerModal({ open, labels, onClose, onSaved }: LabelsManagerModalProps) {
  const [items, setItems] = useState<StudioLabelItem[]>(labels);
  const [newName, setNewName] = useState('');
  const [newPresetIdx, setNewPresetIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  function handleAdd() {
    if (!newName.trim()) return;
    const preset = LABEL_COLOR_PRESETS[newPresetIdx] || LABEL_COLOR_PRESETS[0];
    setItems((prev) => [
      ...prev,
      {
        id: `lbl-${Date.now().toString(36)}`,
        name: newName.trim(),
        color: preset.bg,
        text: preset.text,
      },
    ]);
    setNewName('');
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      await api('/labels', {
        method: 'PUT',
        body: JSON.stringify({ labels: items }),
      });
      onSaved(items);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      title="Gerenciar Etiquetas Personalizadas"
      subtitle="Crie, edite ou remova etiquetas aplicadas aos cartões independentemente das colunas."
      icon={<Tag className="w-4 h-4 text-[#EC2B82]" />}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-black/10 text-xs font-semibold text-[#232122]/75 hover:bg-black/[0.03]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{saving ? 'Salvando...' : 'Salvar etiquetas'}</span>
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        <div className="p-3.5 rounded-2xl bg-[#FAF6FD] border border-[#BC9FE6]/30 space-y-2.5">
          <p className="text-xs font-semibold text-[#2F1534]">Nova etiqueta</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
              placeholder="Ex: Aguardando briefing..."
              className="flex-1 px-3 py-2 rounded-xl border border-black/12 bg-white text-xs focus:outline-none focus:border-[#EC2B82]"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="px-3.5 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {LABEL_COLOR_PRESETS.map((p, idx) => (
              <button
                key={p.name}
                type="button"
                onClick={() => setNewPresetIdx(idx)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  newPresetIdx === idx ? 'ring-2 ring-[#EC2B82]' : 'opacity-75 hover:opacity-100'
                }`}
                style={{ backgroundColor: p.bg, color: p.text }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((lbl, idx) => (
            <div
              key={lbl.id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-black/[0.07]"
            >
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: lbl.text === '#FFFFFF' ? lbl.color : lbl.text }}
                />
                <input
                  type="text"
                  value={lbl.name}
                  onChange={(e) =>
                    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, name: e.target.value } : it)))
                  }
                  className="flex-1 text-xs font-semibold text-[#232122] bg-transparent focus:outline-none focus:underline"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={LABEL_COLOR_PRESETS.findIndex((p) => p.bg === lbl.color && p.text === lbl.text)}
                  onChange={(e) => {
                    const p = LABEL_COLOR_PRESETS[Number(e.target.value)];
                    if (!p) return;
                    setItems((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, color: p.bg, text: p.text } : it))
                    );
                  }}
                  className="text-[11px] px-2 py-1 rounded-lg border border-black/10 bg-[#FAF7FC]"
                >
                  {LABEL_COLOR_PRESETS.map((p, pIdx) => (
                    <option key={p.name} value={pIdx}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 rounded-lg text-[#232122]/40 hover:text-red-600 hover:bg-red-50"
                  title="Remover etiqueta"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </MacWindow>
  );
}
