import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Droplets,
  Eye,
  EyeOff,
  LayoutGrid,
  Palette,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ALLOWED_COL_SPANS,
  AUMI_DECORATIVE_BAR_COLORS,
  AUMI_GRADIENT_PRESETS,
  AUMI_PALETTE_SWATCHES,
  HOME_WIDGET_REGISTRY,
} from '../lib/homeLayout.ts';
import {
  HomeLayoutConfig,
  HomeWidgetConfig,
  HomeWidgetId,
  WidgetColSpan,
  WidgetDensity,
  WidgetSurfaceStyle,
} from '../types/aumi.ts';

interface HomeLayoutEditorPanelProps {
  open: boolean;
  draft: HomeLayoutConfig;
  selectedWidgetId: HomeWidgetId;
  hasUnsavedChanges: boolean;
  saving: boolean;
  canManageFinance: boolean;
  onSelectWidget: (id: HomeWidgetId) => void;
  onUpdateWidget: (id: HomeWidgetId, patch: Partial<HomeWidgetConfig>) => void;
  onMoveWidget: (id: HomeWidgetId, direction: -1 | 1) => void;
  onToggleAutoSave: (next: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  onRestoreDefault: () => void;
  onClose: () => void;
}

const COL_LABELS: Record<WidgetColSpan, string> = {
  3: '25%',
  4: '33%',
  5: '42%',
  6: '50%',
  7: '58%',
  8: '67%',
  9: '75%',
  12: '100%',
};

export function HomeLayoutEditorPanel({
  open,
  draft,
  selectedWidgetId,
  hasUnsavedChanges,
  saving,
  canManageFinance,
  onSelectWidget,
  onUpdateWidget,
  onMoveWidget,
  onToggleAutoSave,
  onSave,
  onDiscard,
  onRestoreDefault,
  onClose,
}: HomeLayoutEditorPanelProps) {
  const [panelTab, setPanelTab] = useState<'style' | 'widgets'>('style');

  if (!open) return null;

  const availableWidgets = draft.widgets.filter(
    (w) => w.id !== 'finance' || canManageFinance
  );
  const selectedWidget =
    availableWidgets.find((w) => w.id === selectedWidgetId) || availableWidgets[0];
  const selectedMeta = selectedWidget ? HOME_WIDGET_REGISTRY[selectedWidget.id] : null;

  return (
    <aside
      aria-label="Personalizar aba inicial"
      className="fixed top-20 right-4 bottom-24 w-[356px] max-w-[calc(100vw-2rem)] z-50 rounded-[26px] bg-white/95 backdrop-blur-2xl border border-[#D8C5F2] shadow-[0_28px_70px_-18px_rgba(47,21,52,0.34)] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 bg-gradient-to-r from-[#F6F6E4] via-white to-[#F3ECF9] border-b border-[#2F1534]/[0.08] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-[#C8C978] text-[#2F1534] flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#2F1534] leading-tight truncate">
              Personalizar Início
            </h3>
            <p className="text-[11px] text-[#5D601E] truncate">
              {hasUnsavedChanges ? 'Prévia ao vivo · alterações pendentes' : 'Layout salvo'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fechar editor"
          className="w-8 h-8 rounded-xl hover:bg-black/5 text-[#2F1534]/70 flex items-center justify-center shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switch Tabs: Estilo do Widget | Widgets & Ordem */}
      <div className="px-4 pt-3 pb-2 border-b border-[#2F1534]/[0.06] space-y-2.5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-[#F6F6E4] border border-[#DAD994]">
          <button
            type="button"
            onClick={() => setPanelTab('style')}
            className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              panelTab === 'style'
                ? 'bg-[#C8C978] text-[#2F1534] shadow-xs'
                : 'text-[#5D601E] hover:text-[#2F1534]'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Estilo &amp; Layout</span>
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('widgets')}
            className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
              panelTab === 'widgets'
                ? 'bg-[#7A689C] text-white shadow-xs'
                : 'text-[#5A487A] hover:text-[#2F1534]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Widgets ({availableWidgets.filter((w) => w.visible).length}/{availableWidgets.length})</span>
          </button>
        </div>

        {/* Auto-save toggle */}
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11.5px] font-medium text-[#2F1534]/75">
            Salvar automaticamente
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(draft.autoSave)}
            onClick={() => onToggleAutoSave(!draft.autoSave)}
            className={`relative inline-flex h-5.5 w-10 items-center rounded-full transition-colors ${
              draft.autoSave ? 'bg-[#C8C978]' : 'bg-[#2F1534]/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
                draft.autoSave ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
        {panelTab === 'style' && selectedWidget && selectedMeta && (
          <>
            {/* Widget Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#7A689C]">
                Widget selecionado (ou clique no painel)
              </label>
              <select
                value={selectedWidget.id}
                onChange={(e) => onSelectWidget(e.target.value as HomeWidgetId)}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6FD] border border-[#DFCEF6] text-xs font-semibold text-[#2F1534] focus:outline-none focus:border-[#7A689C]"
              >
                {availableWidgets.map((w) => (
                  <option key={w.id} value={w.id}>
                    {HOME_WIDGET_REGISTRY[w.id].label} {w.visible ? '' : '(oculto)'}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#2F1534]/60 leading-snug">
                {selectedMeta.description}
              </p>
            </div>

            {/* 3 Layout Models: Compacto | Padrão | Expandido */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-[#7A689C]">Modelo de layout</p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'compacto', label: 'Compacto', sub: 'Resumido' },
                    { id: 'padrao', label: 'Padrão', sub: 'Equilibrado' },
                    { id: 'expandido', label: 'Expandido', sub: 'Detalhado' },
                  ] as Array<{ id: WidgetDensity; label: string; sub: string }>
                ).map((m) => {
                  const active = selectedWidget.density === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateWidget(selectedWidget.id, { density: m.id })}
                      className={`p-2 rounded-xl border text-center transition-all ${
                        active
                          ? 'bg-[#7A689C] text-white border-[#675689] shadow-xs'
                          : 'bg-white text-[#2F1534] border-[#E5D7F4] hover:border-[#7A689C]'
                      }`}
                    >
                      <p className="text-[11.5px] font-bold leading-tight">{m.label}</p>
                      <p
                        className={`text-[10px] mt-0.5 ${
                          active ? 'text-white/80' : 'text-[#7A689C]'
                        }`}
                      >
                        {m.sub}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Width / Resize control */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-[#7A689C]">Largura no painel</p>
                <span className="text-[11px] font-bold text-[#2F1534] tabular-nums">
                  {COL_LABELS[selectedWidget.colSpan]} ({selectedWidget.colSpan}/12)
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ALLOWED_COL_SPANS.filter((s) => s >= selectedMeta.minColSpan).map((span) => {
                  const active = selectedWidget.colSpan === span;
                  return (
                    <button
                      key={span}
                      type="button"
                      onClick={() => onUpdateWidget(selectedWidget.id, { colSpan: span })}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-semibold tabular-nums transition-colors ${
                        active
                          ? 'bg-[#C8C978] text-[#2F1534] border-[#B4B561]'
                          : 'bg-white text-[#2F1534]/80 border-[#DAD994] hover:border-[#C8C978]'
                      }`}
                    >
                      {COL_LABELS[span]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Visual Appearance Mode */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[#7A689C]">Aparência &amp; Efeito</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateWidget(selectedWidget.id, { useDefaultStyle: true })
                  }
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                    selectedWidget.useDefaultStyle
                      ? 'bg-[#2F1534] text-white border-[#2F1534]'
                      : 'bg-white text-[#2F1534] border-[#E5D7F4] hover:border-[#7A689C]'
                  }`}
                >
                  Original Aumi
                </button>
                {(
                  [
                    { id: 'solid', label: 'Cor sólida' },
                    { id: 'gradient', label: 'Degradê' },
                    { id: 'liquid', label: 'Efeito Liquid' },
                  ] as Array<{ id: WidgetSurfaceStyle; label: string }>
                ).map((mode) => {
                  const active =
                    !selectedWidget.useDefaultStyle && selectedWidget.surface === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        onUpdateWidget(selectedWidget.id, {
                          useDefaultStyle: false,
                          surface: mode.id,
                        })
                      }
                      className={`py-2 px-2.5 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${
                        active
                          ? 'bg-[#7A689C] text-white border-[#675689]'
                          : 'bg-white text-[#2F1534] border-[#E5D7F4] hover:border-[#7A689C]'
                      }`}
                    >
                      {mode.id === 'liquid' && <Droplets className="w-3.5 h-3.5" />}
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Palette Swatches + Manual Color Pickers */}
            <div className="space-y-2.5 p-3 rounded-2xl bg-[#FAF7FC] border border-[#E6D9F5]">
              {selectedWidget.surface === 'gradient' && !selectedWidget.useDefaultStyle && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-[#7A689C]">
                    Degradês Aumi Studio
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {AUMI_GRADIENT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, {
                            useDefaultStyle: false,
                            surface: 'gradient',
                            primaryColor: preset.primary,
                            secondaryColor: preset.secondary,
                          })
                        }
                        className="flex items-center gap-2 p-1.5 rounded-xl bg-white border border-black/[0.07] hover:border-[#7A689C] text-left"
                      >
                        <span
                          className="w-5 h-5 rounded-lg shrink-0 border border-black/10"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${preset.primary}, ${preset.secondary})`,
                          }}
                        />
                        <span className="text-[10.5px] font-semibold text-[#2F1534] truncate">
                          {preset.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-[#7A689C]">
                  Paleta Aumi Studio (cor principal)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {AUMI_PALETTE_SWATCHES.map((sw) => {
                    const active =
                      !selectedWidget.useDefaultStyle &&
                      selectedWidget.primaryColor.toLowerCase() === sw.hex.toLowerCase();
                    return (
                      <button
                        key={sw.hex}
                        type="button"
                        title={sw.name}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, {
                            useDefaultStyle: false,
                            primaryColor: sw.hex,
                          })
                        }
                        style={{ backgroundColor: sw.hex }}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          active
                            ? 'border-[#2F1534] ring-2 ring-[#7A689C]/40 scale-110'
                            : 'border-black/15 hover:scale-110'
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Manual Color Inputs */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-black/10 cursor-pointer">
                  <span className="text-[11px] font-semibold text-[#2F1534]">Cor 1</span>
                  <input
                    type="color"
                    value={selectedWidget.primaryColor}
                    onChange={(e) =>
                      onUpdateWidget(selectedWidget.id, {
                        useDefaultStyle: false,
                        primaryColor: e.target.value,
                      })
                    }
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>

                <label className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-black/10 cursor-pointer">
                  <span className="text-[11px] font-semibold text-[#2F1534]">Cor 2</span>
                  <input
                    type="color"
                    value={selectedWidget.secondaryColor}
                    onChange={(e) =>
                      onUpdateWidget(selectedWidget.id, {
                        useDefaultStyle: false,
                        surface:
                          selectedWidget.surface === 'solid'
                            ? 'gradient'
                            : selectedWidget.surface,
                        secondaryColor: e.target.value,
                      })
                    }
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </label>
              </div>
            </div>

            {/* Decorative Colored Accent Bar */}
            <div className="p-3 rounded-2xl bg-[#F6F6E4] border border-[#DAD994] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#2F1534]">
                  Barra decorativa colorida
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={selectedWidget.accentBar}
                  onClick={() =>
                    onUpdateWidget(selectedWidget.id, {
                      accentBar: !selectedWidget.accentBar,
                    })
                  }
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    selectedWidget.accentBar ? 'bg-[#C8C978]' : 'bg-[#2F1534]/20'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      selectedWidget.accentBar ? 'translate-x-4.5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {selectedWidget.accentBar && (
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {AUMI_DECORATIVE_BAR_COLORS.map((bc) => (
                      <button
                        key={bc.hex}
                        type="button"
                        title={bc.name}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, { accentBarColor: bc.hex })
                        }
                        style={{ backgroundColor: bc.hex }}
                        className={`w-5 h-5 rounded-full border transition-transform ${
                          selectedWidget.accentBarColor.toLowerCase() === bc.hex.toLowerCase()
                            ? 'border-[#2F1534] scale-115'
                            : 'border-white shadow-xs hover:scale-110'
                        }`}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    title="Cor manual da barra"
                    value={selectedWidget.accentBarColor}
                    onChange={(e) =>
                      onUpdateWidget(selectedWidget.id, { accentBarColor: e.target.value })
                    }
                    className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {panelTab === 'widgets' && (
          <div className="space-y-2">
            <p className="text-[11.5px] text-[#7A689C] leading-snug">
              Adicione, oculte ou altere a ordem dos widgets. Você também pode arrastar e soltar
              diretamente na tela.
            </p>
            {availableWidgets.map((w, idx) => {
              const meta = HOME_WIDGET_REGISTRY[w.id];
              const isSelected = w.id === selectedWidgetId;
              return (
                <div
                  key={w.id}
                  className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-[#F6F6E4] border-[#C8C978]'
                      : w.visible
                      ? 'bg-white border-[#E5D7F4]'
                      : 'bg-[#FAF7FC]/60 border-dashed border-[#D5C6EA] opacity-75'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWidget(w.id);
                      setPanelTab('style');
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: w.accentBarColor }}
                      />
                      <p className="text-xs font-bold text-[#2F1534] truncate">{meta.label}</p>
                    </div>
                    <p className="text-[10.5px] text-[#7A689C] mt-0.5 tabular-nums">
                      {w.density} · {COL_LABELS[w.colSpan]}
                    </p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      title="Mover para cima"
                      onClick={() => onMoveWidget(w.id, -1)}
                      className="w-7 h-7 rounded-lg hover:bg-black/5 disabled:opacity-30 text-[#2F1534] flex items-center justify-center"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === availableWidgets.length - 1}
                      title="Mover para baixo"
                      onClick={() => onMoveWidget(w.id, 1)}
                      className="w-7 h-7 rounded-lg hover:bg-black/5 disabled:opacity-30 text-[#2F1534] flex items-center justify-center"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={w.visible ? 'Ocultar widget' : 'Adicionar ao painel'}
                      onClick={() => onUpdateWidget(w.id, { visible: !w.visible })}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        w.visible
                          ? 'bg-[#EFEFD4] text-[#5D601E] hover:bg-[#DAD994]'
                          : 'bg-[#F3ECF9] text-[#7A689C] hover:bg-[#7A689C] hover:text-white'
                      }`}
                    >
                      {w.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Actions: Restore Original | Discard Preview | Save */}
      <div className="px-4 py-3 bg-[#FAF7FC] border-t border-[#2F1534]/[0.08] space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 py-2 px-3 rounded-xl bg-[#C8C978] hover:bg-[#B8B963] disabled:opacity-60 text-[#2F1534] text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors"
          >
            {saving ? (
              <span>Salvando...</span>
            ) : hasUnsavedChanges ? (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Salvar layout</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Concluir</span>
              </>
            )}
          </button>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={onDiscard}
              className="py-2 px-3 rounded-xl bg-white hover:bg-red-50 text-[#2F1534] hover:text-red-600 border border-black/10 text-xs font-semibold transition-colors"
            >
              Descartar
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onRestoreDefault}
          className="w-full py-1.5 px-3 rounded-xl text-[11.5px] font-semibold text-[#7A689C] hover:text-[#2F1534] hover:bg-white inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Restaurar layout original</span>
        </button>
      </div>
    </aside>
  );
}
