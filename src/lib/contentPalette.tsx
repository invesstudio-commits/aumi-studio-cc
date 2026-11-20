import React from 'react';
import {
  Sparkles,
  PenTool,
  FileText,
  Video,
  Camera,
  Heart,
  Star,
  Flame,
  Lightbulb,
  Megaphone,
  Palette,
  Layers,
  Bookmark,
  BookOpen,
  Calendar,
  CheckSquare,
  Target,
  Compass,
  Music,
  Wand2,
  Briefcase,
  Folder,
  Clapperboard,
  Eye,
  CheckCircle2,
  MessageSquare,
  Gift,
  Sun,
} from 'lucide-react';

export interface SolidCardSwatch {
  id: string;
  label: string;
  hex: string;
  darkText: boolean;
  borderHex: string;
}

export const CONTENT_CARD_COLORS: SolidCardSwatch[] = [
  { id: 'branco', label: 'Branco', hex: '#FFFFFF', darkText: true, borderHex: '#EFE2EC' },
  { id: 'rosa-claro', label: 'Rosa-claro', hex: '#FCE4F0', darkText: true, borderHex: '#F3C5DC' },
  { id: 'rosa-pink', label: 'Rosa pink', hex: '#EC2B82', darkText: false, borderHex: '#D81F73' },
  { id: 'coral', label: 'Coral', hex: '#F58A66', darkText: true, borderHex: '#E67652' },
  { id: 'lilas', label: 'Lilás', hex: '#E4D4FA', darkText: true, borderHex: '#CFAFEF' },
  { id: 'roxo', label: 'Roxo', hex: '#7A689C', darkText: false, borderHex: '#665489' },
  { id: 'verde-oliva', label: 'Verde-oliva', hex: '#DAD994', darkText: true, borderHex: '#C2C17A' },
  { id: 'creme', label: 'Creme', hex: '#FCF6EC', darkText: true, borderHex: '#EADCC6' },
];

export const CONTENT_TAXONOMY_COLORS = [
  { label: 'Rosa pink', hex: '#EC2B82' },
  { label: 'Rosa suave', hex: '#EC97B7' },
  { label: 'Roxo Aumi', hex: '#7A689C' },
  { label: 'Lilás', hex: '#BC9FE6' },
  { label: 'Coral', hex: '#F58A66' },
  { label: 'Terracota', hex: '#E1754C' },
  { label: 'Verde-oliva', hex: '#9E9F4A' },
  { label: 'Ameixa', hex: '#2F1534' },
];

export function isDarkHex(hex?: string | null): boolean {
  if (!hex) return false;
  const clean = hex.trim().toLowerCase();
  const preset = CONTENT_CARD_COLORS.find((c) => c.hex.toLowerCase() === clean);
  if (preset) return !preset.darkText;
  const raw = clean.replace('#', '');
  if (raw.length !== 6) return false;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 145;
}

export const CONTENT_ICON_OPTIONS: Array<{
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'sparkles', label: 'Brilho', icon: Sparkles },
  { key: 'pen-tool', label: 'Criação', icon: PenTool },
  { key: 'file-text', label: 'Texto', icon: FileText },
  { key: 'video', label: 'Reels', icon: Video },
  { key: 'clapperboard', label: 'Produção', icon: Clapperboard },
  { key: 'camera', label: 'Foto', icon: Camera },
  { key: 'layers', label: 'Carrossel', icon: Layers },
  { key: 'palette', label: 'Design', icon: Palette },
  { key: 'lightbulb', label: 'Ideia', icon: Lightbulb },
  { key: 'megaphone', label: 'Campanha', icon: Megaphone },
  { key: 'heart', label: 'Favorito', icon: Heart },
  { key: 'star', label: 'Destaque', icon: Star },
  { key: 'flame', label: 'Em alta', icon: Flame },
  { key: 'bookmark', label: 'Referência', icon: Bookmark },
  { key: 'book-open', label: 'Guia', icon: BookOpen },
  { key: 'calendar', label: 'Pauta', icon: Calendar },
  { key: 'check-square', label: 'Checklist', icon: CheckSquare },
  { key: 'check-circle', label: 'Aprovado', icon: CheckCircle2 },
  { key: 'eye', label: 'Revisão', icon: Eye },
  { key: 'target', label: 'Meta', icon: Target },
  { key: 'compass', label: 'Estratégia', icon: Compass },
  { key: 'music', label: 'Áudio', icon: Music },
  { key: 'wand', label: 'Criativo', icon: Wand2 },
  { key: 'briefcase', label: 'Portfólio', icon: Briefcase },
  { key: 'folder', label: 'Pasta', icon: Folder },
  { key: 'message', label: 'Legenda', icon: MessageSquare },
  { key: 'gift', label: 'Lançamento', icon: Gift },
  { key: 'sun', label: 'Lifestyle', icon: Sun },
];

export function renderContentIcon(key: string | undefined | null, className = 'w-4 h-4') {
  const found = CONTENT_ICON_OPTIONS.find((opt) => opt.key === key) || CONTENT_ICON_OPTIONS[0];
  const IconComp = found.icon;
  return <IconComp className={className} />;
}
