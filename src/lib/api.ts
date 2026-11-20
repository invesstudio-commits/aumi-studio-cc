const TOKEN_KEY = 'aumi_studio_session_token';

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    cache: 'no-store',
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error || `Erro na requisição (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<{
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  file_url: string;
}> {
  const form = new FormData();
  form.append('file', file);
  return api('/upload', { method: 'POST', body: form });
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

export function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatShortDateBR(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
}

export function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return formatShortDateBR(isoStr);
}

export const BOARD_COVER_PRESETS = [
  { label: 'Linho Blush', url: '/src/assets/images/cover_blush_editorial_1795010794755.jpg' },
  { label: 'Estúdio Lilás', url: '/src/assets/images/cover_lilac_studio_1795010796172.jpg' },
  { label: 'Terracota', url: '/src/assets/images/cover_terracotta_warm_1795010795567.jpg' },
  { label: 'Oliva & Pedra', url: '/src/assets/images/cover_olive_minimal_1795010797074.jpg' },
];

export const FOLDER_COLOR_PRESETS = [
  { label: 'Rosa Vidro', hex: '#EC97B7', tint: 'rgba(236, 151, 183, 0.34)' },
  { label: 'Lilás Aura', hex: '#BC9FE6', tint: 'rgba(188, 159, 230, 0.34)' },
  { label: 'Roxo Estúdio', hex: '#7A689C', tint: 'rgba(122, 104, 156, 0.30)' },
  { label: 'Pink Editorial', hex: '#EC2B82', tint: 'rgba(236, 43, 130, 0.26)' },
  { label: 'Laranja Terracota', hex: '#E1754C', tint: 'rgba(225, 117, 76, 0.28)' },
  { label: 'Cru Quente', hex: '#EBDCCB', tint: 'rgba(252, 246, 236, 0.72)' },
];

export async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeFileDisplayName(fileName: string): string {
  const withoutExt = (fileName || '').replace(/\.[^.]+$/, '');
  const cleaned = withoutExt
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*-\s*/g, ' — ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fileName || 'Material';
}

export function formatCopyStatusPT(status?: string | null): string {
  switch (status) {
    case 'draft':
      return 'Rascunho';
    case 'internal_sent':
      return 'Enviada internamente';
    case 'not_shared':
      return 'Não compartilhada';
    case 'shared':
      return 'Compartilhada';
    case 'awaiting_approval':
      return 'Aguardando aprovação';
    case 'approved':
      return 'Aprovada';
    case 'changes_requested':
      return 'Ajustes solicitados';
    default:
      return status || 'Em andamento';
  }
}

export function formatActivityActionPT(action?: string | null): string {
  switch (action) {
    case 'login':
      return 'Acesso ao sistema';
    case 'create_client':
      return 'Cadastrou um novo cliente';
    case 'update_client':
      return 'Atualizou dados de um cliente';
    case 'create_board':
      return 'Criou um novo quadro';
    case 'update_board':
      return 'Atualizou um quadro';
    case 'delete_board':
      return 'Excluiu um quadro';
    case 'create_card':
      return 'Criou uma nova entrega';
    case 'update_card':
      return 'Atualizou uma entrega';
    case 'move_card':
      return 'Moveu uma entrega de etapa';
    case 'delete_card':
      return 'Excluiu uma entrega';
    case 'mark_card_read':
      return 'Marcou uma entrega como vista';
    case 'unmark_card_read':
      return 'Desmarcou a visualização de uma entrega';
    case 'card_mini_update':
      return 'Enviou uma atualização ao cliente';
    case 'attach_file':
      return 'Anexou um arquivo';
    case 'send_for_approval':
      return 'Enviou material para aprovação';
    case 'approve_card':
    case 'approve_material':
      return 'Aprovou um material';
    case 'request_changes':
    case 'request_adjustment':
    case 'request_material_changes':
      return 'Solicitou ajuste em um material';
    case 'create_approval_delivery':
      return 'Criou uma nova entrega de aprovação';
    case 'add_comment':
      return 'Adicionou um comentário';
    default:
      return 'Atualização registrada no estúdio';
  }
}
