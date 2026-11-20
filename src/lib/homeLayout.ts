import React from 'react';
import {
  HomeLayoutConfig,
  HomeWidgetConfig,
  HomeWidgetId,
  WidgetColSpan,
} from '../types/aumi.ts';

export const HOME_LAYOUT_VERSION = 3;

export interface HomeWidgetMeta {
  id: HomeWidgetId;
  label: string;
  description: string;
  minColSpan: WidgetColSpan;
  defaultColSpan: WidgetColSpan;
}

export const HOME_WIDGET_REGISTRY: Record<HomeWidgetId, HomeWidgetMeta> = {
  welcome: {
    id: 'welcome',
    label: 'Boas-vindas',
    description: 'Saudação personalizada, data atual e panorama do estúdio.',
    minColSpan: 4,
    defaultColSpan: 5,
  },
  clock: {
    id: 'clock',
    label: 'Horário Local',
    description: 'Relógio em tempo real com dia da semana e data.',
    minColSpan: 3,
    defaultColSpan: 4,
  },
  shortcuts: {
    id: 'shortcuts',
    label: 'Atalhos Rápidos',
    description: 'Acesso direto ao Portal, Novo Cliente, Financeiro e Serviços.',
    minColSpan: 3,
    defaultColSpan: 3,
  },
  partners: {
    id: 'partners',
    label: 'Sócias & Portais',
    description: 'Presença real de Ingrid e Mariana e resumo dos portais.',
    minColSpan: 3,
    defaultColSpan: 4,
  },
  kpis: {
    id: 'kpis',
    label: 'Indicadores & Andamento',
    description: 'Os 6 indicadores principais clicáveis com detalhamento completo.',
    minColSpan: 6,
    defaultColSpan: 12,
  },
  communication: {
    id: 'communication',
    label: 'Central de Notificações',
    description: 'Acompanhamento de atividades do Portal do Cliente, sistema e avisos.',
    minColSpan: 6,
    defaultColSpan: 7,
  },
  calendar: {
    id: 'calendar',
    label: 'Compromissos & Calendário',
    description: 'Agenda Dia/Semana/Mês, compromissos e entregas dos próximos 7 dias.',
    minColSpan: 5,
    defaultColSpan: 7,
  },
  finance: {
    id: 'finance',
    label: 'Resumo Financeiro',
    description: 'Saldo em caixa, entradas do mês, a receber e despesas pagas.',
    minColSpan: 4,
    defaultColSpan: 5,
  },
  activities: {
    id: 'activities',
    label: 'Atividades Recentes',
    description: 'Histórico contínuo das últimas movimentações do estúdio.',
    minColSpan: 4,
    defaultColSpan: 5,
  },
};

export const ALLOWED_COL_SPANS: WidgetColSpan[] = [3, 4, 5, 6, 7, 8, 9, 12];

export const AUMI_PALETTE_SWATCHES: Array<{ hex: string; name: string }> = [
  { hex: '#FFFFFF', name: 'Branco Puro' },
  { hex: '#F6F6E4', name: 'Verde Paleta Clarinho' },
  { hex: '#DAD994', name: 'Verde Oliva Aumi' },
  { hex: '#C8C978', name: 'Verde Lima Aumi' },
  { hex: '#5D601E', name: 'Verde Oliva Profundo' },
  { hex: '#F3ECF9', name: 'Lilás Clarinho' },
  { hex: '#BC9FE6', name: 'Lilás Aumi' },
  { hex: '#7A689C', name: 'Roxo Aumi' },
  { hex: '#2F1534', name: 'Ameixa Profundo' },
  { hex: '#FDEBF3', name: 'Rosa Blush' },
  { hex: '#EC97B7', name: 'Rosa Suave Aumi' },
  { hex: '#EC2B82', name: 'Rosa Vibrante' },
  { hex: '#FDF0E8', name: 'Pêssego Suave' },
  { hex: '#E1754C', name: 'Laranja Aumi' },
  { hex: '#FCF6EC', name: 'Creme Aumi' },
];

export const AUMI_GRADIENT_PRESETS: Array<{
  name: string;
  primary: string;
  secondary: string;
}> = [
  { name: 'Aura Ameixa', primary: '#7A689C', secondary: '#2F1534' },
  { name: 'Rosa Liquid', primary: '#EC2B82', secondary: '#EC97B7' },
  { name: 'Oliva & Creme', primary: '#DAD994', secondary: '#FCF6EC' },
  { name: 'Verde Paleta', primary: '#C8C978', secondary: '#EFEFD4' },
  { name: 'Lavanda & Blush', primary: '#F3ECF9', secondary: '#FDEBF3' },
  { name: 'Rosa & Lilás', primary: '#EC2B82', secondary: '#7A689C' },
  { name: 'Pêssego & Creme', primary: '#FDF0E8', secondary: '#FCF6EC' },
  { name: 'Brisa Lilás', primary: '#FFFFFF', secondary: '#EFE6FB' },
];

export const AUMI_DECORATIVE_BAR_COLORS: Array<{ hex: string; name: string }> = [
  { hex: '#C8C978', name: 'Verde Paleta' },
  { hex: '#DAD994', name: 'Oliva Claro' },
  { hex: '#7A689C', name: 'Roxo' },
  { hex: '#EC2B82', name: 'Rosa' },
  { hex: '#E1754C', name: 'Laranja' },
  { hex: '#BC9FE6', name: 'Lilás' },
];

export function getDefaultHomeLayout(): HomeLayoutConfig {
  return {
    version: HOME_LAYOUT_VERSION,
    autoSave: false,
    widgets: [
      {
        id: 'welcome',
        visible: true,
        colSpan: 5,
        density: 'expandido',
        surface: 'gradient',
        primaryColor: '#7A689C',
        secondaryColor: '#2F1534',
        accentBar: true,
        accentBarColor: '#C8C978',
        useDefaultStyle: true,
      },
      {
        id: 'clock',
        visible: true,
        colSpan: 4,
        density: 'padrao',
        surface: 'liquid',
        primaryColor: '#EC2B82',
        secondaryColor: '#EC97B7',
        accentBar: true,
        accentBarColor: '#FFFFFF',
        useDefaultStyle: true,
      },
      {
        id: 'shortcuts',
        visible: true,
        colSpan: 3,
        density: 'expandido',
        surface: 'gradient',
        primaryColor: '#F3ECF9',
        secondaryColor: '#E9DCFA',
        accentBar: true,
        accentBarColor: '#EC2B82',
        useDefaultStyle: true,
      },
      {
        id: 'partners',
        visible: true,
        colSpan: 4,
        density: 'compacto',
        surface: 'solid',
        primaryColor: '#FFFFFF',
        secondaryColor: '#F3ECF9',
        accentBar: true,
        accentBarColor: '#7A689C',
        useDefaultStyle: true,
      },
      {
        id: 'kpis',
        visible: true,
        colSpan: 12,
        density: 'padrao',
        surface: 'liquid',
        primaryColor: '#FFFFFF',
        secondaryColor: '#F3ECF9',
        accentBar: true,
        accentBarColor: '#C8C978',
        useDefaultStyle: true,
      },
      {
        id: 'communication',
        visible: true,
        colSpan: 7,
        density: 'padrao',
        surface: 'solid',
        primaryColor: '#F6F6E4',
        secondaryColor: '#EFEFD4',
        accentBar: true,
        accentBarColor: '#C8C978',
        useDefaultStyle: true,
      },
      {
        id: 'calendar',
        visible: true,
        colSpan: 7,
        density: 'padrao',
        surface: 'liquid',
        primaryColor: '#FFFFFF',
        secondaryColor: '#FDF0E8',
        accentBar: true,
        accentBarColor: '#E1754C',
        useDefaultStyle: true,
      },
      {
        id: 'finance',
        visible: true,
        colSpan: 5,
        density: 'padrao',
        surface: 'liquid',
        primaryColor: '#FFFFFF',
        secondaryColor: '#F6F6E4',
        accentBar: true,
        accentBarColor: '#C8C978',
        useDefaultStyle: true,
      },
      {
        id: 'activities',
        visible: true,
        colSpan: 5,
        density: 'padrao',
        surface: 'liquid',
        primaryColor: '#FFFFFF',
        secondaryColor: '#F3ECF9',
        accentBar: true,
        accentBarColor: '#BC9FE6',
        useDefaultStyle: true,
      },
    ],
  };
}

export function mergeWithDefaultHomeLayout(
  saved?: Partial<HomeLayoutConfig> | null
): HomeLayoutConfig {
  const def = getDefaultHomeLayout();
  if (
    !saved ||
    saved.version !== HOME_LAYOUT_VERSION ||
    !Array.isArray(saved.widgets) ||
    saved.widgets.length === 0
  ) {
    return def;
  }

  const defMap = new Map(def.widgets.map((w) => [w.id, w]));
  const seen = new Set<HomeWidgetId>();
  const merged: HomeWidgetConfig[] = [];

  for (const w of saved.widgets) {
    if (!w || !defMap.has(w.id) || seen.has(w.id)) continue;
    seen.add(w.id);
    const base = defMap.get(w.id)!;
    const colSpan = ALLOWED_COL_SPANS.includes(w.colSpan) ? w.colSpan : base.colSpan;
    merged.push({
      ...base,
      ...w,
      colSpan,
    });
  }

  for (const base of def.widgets) {
    if (!seen.has(base.id)) {
      merged.push(base);
    }
  }

  return {
    version: HOME_LAYOUT_VERSION,
    autoSave: Boolean(saved.autoSave),
    widgets: merged,
  };
}

export function getColSpanClass(colSpan: WidgetColSpan): string {
  switch (colSpan) {
    case 3:
      return 'md:col-span-3 lg:col-span-3';
    case 4:
      return 'md:col-span-3 lg:col-span-4';
    case 5:
      return 'md:col-span-6 lg:col-span-5';
    case 6:
      return 'md:col-span-6 lg:col-span-6';
    case 7:
      return 'md:col-span-6 lg:col-span-7';
    case 8:
      return 'md:col-span-6 lg:col-span-8';
    case 9:
      return 'md:col-span-6 lg:col-span-9';
    case 12:
    default:
      return 'md:col-span-6 lg:col-span-12';
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return Number.isNaN(r) ? null : { r, g, b };
  }
  return null;
}

export function isColorDark(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.54;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(255,255,255,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function computeCustomWidgetSurface(cfg: HomeWidgetConfig): {
  style: React.CSSProperties;
  isDarkText: boolean;
  extraClass: string;
} {
  const p = cfg.primaryColor || '#FFFFFF';
  const s = cfg.secondaryColor || '#F3ECF9';

  if (cfg.surface === 'solid') {
    const darkBg = isColorDark(p);
    return {
      style: {
        backgroundColor: p,
        borderColor: darkBg ? 'rgba(255,255,255,0.18)' : hexToRgba(p === '#FFFFFF' ? '#7A689C' : p, 0.32),
      },
      isDarkText: !darkBg,
      extraClass: 'shadow-[0_14px_34px_-18px_rgba(47,21,52,0.22)]',
    };
  }

  if (cfg.surface === 'gradient') {
    const avgDark = (() => {
      const a = hexToRgb(p);
      const b = hexToRgb(s);
      if (!a || !b) return isColorDark(p);
      const lumA = (0.299 * a.r + 0.587 * a.g + 0.114 * a.b) / 255;
      const lumB = (0.299 * b.r + 0.587 * b.g + 0.114 * b.b) / 255;
      return (lumA + lumB) / 2 < 0.52;
    })();
    return {
      style: {
        backgroundImage: `linear-gradient(135deg, ${p} 0%, ${s} 100%)`,
        borderColor: avgDark ? 'rgba(255,255,255,0.22)' : 'rgba(122,104,156,0.22)',
      },
      isDarkText: !avgDark,
      extraClass: 'shadow-[0_18px_40px_-18px_rgba(47,21,52,0.28)]',
    };
  }

  // Liquid organic effect
  const darkLiquid = isColorDark(p) && isColorDark(s);
  return {
    style: {
      backgroundImage: `
        radial-gradient(circle at 12% 14%, ${hexToRgba(p, darkLiquid ? 0.82 : 0.72)} 0%, transparent 58%),
        radial-gradient(circle at 88% 82%, ${hexToRgba(s, darkLiquid ? 0.76 : 0.65)} 0%, transparent 62%),
        linear-gradient(145deg, ${hexToRgba(p, darkLiquid ? 0.78 : 0.68)} 0%, ${hexToRgba(s, darkLiquid ? 0.7 : 0.56)} 100%)
      `,
      backdropFilter: 'blur(26px) saturate(185%)',
      WebkitBackdropFilter: 'blur(26px) saturate(185%)',
      borderColor: darkLiquid ? 'rgba(255,255,255,0.26)' : 'rgba(255,255,255,0.84)',
      boxShadow:
        'inset 0 1.5px 1px rgba(255,255,255,0.88), inset 0 -1px 1px rgba(47,21,52,0.06), 0 20px 44px -18px rgba(47,21,52,0.22)',
    },
    isDarkText: !darkLiquid,
    extraClass: '',
  };
}
