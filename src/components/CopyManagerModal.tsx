import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Link2,
  Upload,
  Plus,
  Trash2,
  Send,
  Share2,
  Copy,
  Check,
  FileText,
  Sparkles,
  History,
  ExternalLink,
  CopyPlus,
  Edit3,
  Globe,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import { api, copyTextSafe, formatRelativeTime, stripHtmlTags, uploadFile } from '../lib/api.ts';
import { Board, ChecklistItem, Client, CopyAttachment, CopyItem, CopyStatus, StudioSettings, User } from '../types/aumi.ts';
import { MacWindow } from './MacWindow.tsx';
import { PartnerAvatar } from './AumiBrand.tsx';

function makeLocalId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const COPY_STATUS_META: Record<CopyStatus, { label: string; bg: string; text: string }> = {
  draft: { label: 'Rascunho', bg: '#F4F4F5', text: '#52525B' },
  not_shared: { label: 'Não compartilhada', bg: '#F3ECF9', text: '#7A689C' },
  shared: { label: 'Compartilhada', bg: '#FDF2F6', text: '#EC2B82' },
  awaiting_approval: { label: 'Aguardando aprovação', bg: '#FDF0E8', text: '#E1754C' },
  approved: { label: 'Aprovada', bg: '#F4F5E2', text: '#3E4113' },
  changes_requested: { label: 'Alterações solicitadas', bg: '#FEE2E2', text: '#991B1B' },
};

const PRIORITY_OPTIONS: Array<{
  key: 'baixa' | 'normal' | 'alta' | 'urgente';
  label: string;
  desc: string;
  dot: string;
}> = [
  { key: 'baixa', label: 'Baixa', desc: 'Pode aguardar.', dot: '#34C759' },
  { key: 'normal', label: 'Normal', desc: 'Segue a ordem de produção.', dot: '#EC2B82' },
  { key: 'alta', label: 'Alta', desc: 'Precisa de atenção prioritária.', dot: '#E1754C' },
  { key: 'urgente', label: 'Urgente', desc: 'Máxima prioridade.', dot: '#EF4444' },
];

interface CopyManagerModalProps {
  open: boolean;
  onClose: () => void;
  user: User;
  partners: User[];
  clients: Client[];
  boards: Board[];
  initialClientId?: string | null;
  initialBoardId?: string | null;
  initialCopy?: CopyItem | null;
  startInComposer?: boolean;
  settings?: StudioSettings | null;
  onSaved?: () => void;
}

export function CopyManagerModal({
  open,
  onClose,
  user,
  partners,
  clients,
  boards,
  initialClientId,
  initialBoardId,
  initialCopy,
  startInComposer = false,
  settings,
  onSaved,
}: CopyManagerModalProps) {
  const [mode, setMode] = useState<'list' | 'composer'>(startInComposer || initialCopy ? 'composer' : 'list');
  const [copies, setCopies] = useState<CopyItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Composer state
  const [editingCopy, setEditingCopy] = useState<CopyItem | null>(initialCopy || null);
  const [title, setTitle] = useState('');
  const [contentHtml, setContentHtml] = useState('');
  const [notes, setNotes] = useState('');
  const [authorUserId, setAuthorUserId] = useState(user.id);
  const [priority, setPriority] = useState<'baixa' | 'normal' | 'alta' | 'urgente'>('normal');
  const [labels, setLabels] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckText, setNewCheckText] = useState('');
  const [attachments, setAttachments] = useState<CopyAttachment[]>([]);
  const [clientId, setClientId] = useState<string>(initialClientId || '');
  const [boardId, setBoardId] = useState<string>(initialBoardId || '');
  const [requireClientApproval, setRequireClientApproval] = useState(true);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableLabels = settings?.labels || [
    { id: 'lbl-copy', name: 'Copywriting', color: '#FDF2F6', text: '#EC2B82' },
    { id: 'lbl-urgente', name: 'Carrossel', color: '#F3ECF9', text: '#7A689C' },
    { id: 'lbl-reels', name: 'Reels / Roteiro', color: '#FDF0E8', text: '#E1754C' },
    { id: 'lbl-campanha', name: 'Campanha', color: '#F4F5E2', text: '#5D601E' },
  ];

  async function loadCopies() {
    setLoadingList(true);
    try {
      const qs = new URLSearchParams();
      if (initialClientId) qs.set('client_id', initialClientId);
      if (initialBoardId) qs.set('board_id', initialBoardId);
      const res = await api<{ copies: CopyItem[] }>(`/copies?${qs.toString()}`);
      setCopies(res.copies || []);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao carregar copies.' });
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    loadCopies();
    if (initialCopy) {
      hydrateComposer(initialCopy);
      setMode('composer');
    } else if (startInComposer) {
      resetComposer();
      setMode('composer');
    } else {
      setMode('list');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialClientId, initialBoardId, initialCopy?.id]);

  function resetComposer() {
    setEditingCopy(null);
    setTitle('');
    setContentHtml('');
    setNotes('');
    setAuthorUserId(user.id);
    setPriority('normal');
    setLabels([]);
    setChecklist([]);
    setAttachments([]);
    setClientId(initialClientId || '');
    setBoardId(initialBoardId || '');
    setRequireClientApproval(true);
    setIsDirty(false);
    setFeedback(null);
    setShowHistory(false);
    if (editorRef.current) editorRef.current.innerHTML = '';
  }

  function hydrateComposer(cp: CopyItem) {
    setEditingCopy(cp);
    setTitle(cp.title);
    setContentHtml(cp.content);
    setNotes(cp.notes || '');
    setAuthorUserId(cp.author_user_id || user.id);
    setPriority(cp.priority || 'normal');
    setLabels(cp.labels || []);
    setChecklist(cp.checklist || []);
    setAttachments(cp.attachments || []);
    setClientId(cp.client_id || initialClientId || '');
    setBoardId(cp.board_id || initialBoardId || '');
    setIsDirty(false);
    setFeedback(null);
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = cp.content || '';
      }
    }, 0);
  }

  function execFormat(cmd: string, val?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, val);
    setContentHtml(editorRef.current.innerHTML);
    setIsDirty(true);
  }

  function insertLink() {
    const url = window.prompt('Cole o endereço (URL) do link:', 'https://');
    if (url && url.trim()) {
      execFormat('createLink', url.trim());
    }
  }

  async function handleFilesUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setFeedback(null);
    try {
      const uploaded: CopyAttachment[] = [];
      for (const f of Array.from(files)) {
        const res = await uploadFile(f);
        uploaded.push(res);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
      setIsDirty(true);
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao enviar anexo.' });
    } finally {
      setUploading(false);
    }
  }

  function toggleLabel(lblName: string) {
    setLabels((prev) => (prev.includes(lblName) ? prev.filter((l) => l !== lblName) : [...prev, lblName]));
    setIsDirty(true);
  }

  function addChecklistItem() {
    if (!newCheckText.trim()) return;
    setChecklist((prev) => [...prev, { id: makeLocalId('chk'), text: newCheckText.trim(), done: false }]);
    setNewCheckText('');
    setIsDirty(true);
  }

  async function saveDraftOrUpdate(): Promise<CopyItem | null> {
    const currentHtml = editorRef.current ? editorRef.current.innerHTML : contentHtml;
    const plain = stripHtmlTags(currentHtml);
    if (!title.trim() || !plain) {
      setFeedback({ type: 'err', msg: 'Preencha o título e o texto principal da copy.' });
      return null;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        title: title.trim(),
        content: currentHtml,
        notes: notes.trim(),
        attachments,
        author_user_id: authorUserId,
        priority,
        labels,
        checklist,
        client_id: clientId || null,
        board_id: boardId || null,
      };
      let saved: CopyItem;
      if (editingCopy) {
        const res = await api<{ copy: CopyItem }>(`/copies/${editingCopy.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        saved = res.copy;
      } else {
        const res = await api<{ copy: CopyItem }>('/copies', {
          method: 'POST',
          body: JSON.stringify({ ...payload, status: 'draft' }),
        });
        saved = res.copy;
      }
      setEditingCopy(saved);
      setIsDirty(false);
      await loadCopies();
      onSaved?.();
      return saved;
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao salvar copy.' });
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOnly() {
    const saved = await saveDraftOrUpdate();
    if (saved) {
      setFeedback({ type: 'ok', msg: 'Copy salva com sucesso!' });
    }
  }

  async function handleSendInternal() {
    const saved = await saveDraftOrUpdate();
    if (!saved) return;
    if (!boardId) {
      setFeedback({ type: 'err', msg: 'Selecione um projeto/quadro para enviar para a produção interna.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ copy: CopyItem }>(`/copies/${saved.id}/send-internal`, {
        method: 'POST',
        body: JSON.stringify({ board_id: boardId, client_id: clientId || undefined }),
      });
      setEditingCopy(res.copy);
      setFeedback({ type: 'ok', msg: 'Copy enviada para a produção interna do quadro (não exposta ao cliente).' });
      await loadCopies();
      onSaved?.();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao enviar para produção.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleShare(enable: boolean) {
    const saved = await saveDraftOrUpdate();
    if (!saved) return;
    if (enable && !clientId) {
      setFeedback({ type: 'err', msg: 'Selecione o cliente antes de compartilhar no Portal do Cliente.' });
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ copy: CopyItem }>(`/copies/${saved.id}/share`, {
        method: 'POST',
        body: JSON.stringify({
          shared_with_client: enable,
          client_id: clientId || undefined,
          board_id: boardId || undefined,
          require_approval: requireClientApproval,
        }),
      });
      setEditingCopy(res.copy);
      setFeedback({
        type: 'ok',
        msg: enable
          ? 'Compartilhamento liberado no Portal do Cliente! Link autenticado pronto para envio.'
          : 'Compartilhamento com o cliente desativado.',
      });
      await loadCopies();
      onSaved?.();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao atualizar compartilhamento.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate(cp: CopyItem) {
    try {
      const res = await api<{ copy: CopyItem }>(`/copies/${cp.id}/duplicate`, { method: 'POST' });
      await loadCopies();
      hydrateComposer(res.copy);
      setMode('composer');
      setFeedback({ type: 'ok', msg: 'Copy duplicada como novo rascunho.' });
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao duplicar.' });
    }
  }

  async function handleDelete(cp: CopyItem) {
    try {
      await api(`/copies/${cp.id}`, { method: 'DELETE' });
      if (editingCopy?.id === cp.id) {
        resetComposer();
        setMode('list');
      }
      await loadCopies();
      onSaved?.();
    } catch (err) {
      setFeedback({ type: 'err', msg: err instanceof Error ? err.message : 'Erro ao excluir.' });
    }
  }

  function buildShareUrl(token: string) {
    return `${window.location.origin}/?copy=${token}`;
  }

  async function handleCopyShareLink(cp: CopyItem) {
    if (!cp.share_token) return;
    const ok = await copyTextSafe(buildShareUrl(cp.share_token));
    if (ok) {
      setCopiedLinkId(cp.id);
      setTimeout(() => setCopiedLinkId(null), 2200);
    }
  }

  const filteredBoards = clientId ? boards.filter((b) => b.client_id === clientId) : boards;
  const selectedAuthor = partners.find((p) => p.id === authorUserId) || user;

  return (
    <MacWindow
      open={open}
      onClose={onClose}
      isDirty={mode === 'composer' && isDirty}
      maxWidthClass="max-w-5xl"
      title={mode === 'composer' ? (editingCopy ? `Editar Copy: ${editingCopy.title}` : 'Nova Copy') : 'Envio & Biblioteca de Copies'}
      subtitle={
        mode === 'composer'
          ? 'Compartilhe aqui todas as informações sobre o conteúdo, envie para produção ou libere no Portal do Cliente.'
          : 'Crie, edite, envie para produção interna ou compartilhe copies com aprovação autenticada do cliente.'
      }
      icon={<FileText className="w-4 h-4 text-[#EC2B82]" />}
      headerExtra={
        <div className="flex items-center gap-2">
          {mode === 'composer' ? (
            <button
              type="button"
              onClick={() => setMode('list')}
              className="px-3 py-1.5 rounded-xl bg-white/80 border border-black/10 text-xs font-medium text-[#2F1534] hover:bg-white inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Todas as copies ({copies.length})</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                resetComposer();
                setMode('composer');
              }}
              className="px-3.5 py-1.5 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-medium inline-flex items-center gap-1.5 shadow-xs whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova copy</span>
            </button>
          )}
        </div>
      }
    >
      <div className="p-4 sm:p-6 space-y-5 bg-gradient-to-b from-[#FDF8FC]/60 to-white min-h-[500px]">
        {feedback && (
          <div
            className={`px-4 py-3 rounded-2xl text-xs font-medium flex items-center justify-between gap-2 ${
              feedback.type === 'ok'
                ? 'bg-[#F4F5E2] border border-[#C8C978]/60 text-[#3E4113]'
                : 'bg-[#FDF2F6] border border-[#EC2B82]/30 text-[#A9195A]'
            }`}
          >
            <span>{feedback.msg}</span>
            <button type="button" onClick={() => setFeedback(null)} className="text-[11px] underline">
              Fechar
            </button>
          </div>
        )}

        {mode === 'list' && (
          <div className="space-y-4">
            {loadingList ? (
              <div className="py-12 text-center text-sm text-[#232122]/55">Carregando copies...</div>
            ) : copies.length === 0 ? (
              <div className="aumi-surface-solid rounded-3xl p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center mx-auto">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="text-base font-semibold text-[#2F1534]">Nenhuma copy cadastrada ainda</h3>
                <p className="text-xs text-[#232122]/60 max-w-md mx-auto">
                  Crie sua primeira copy estruturada, anexe referências, envie para a produção interna ou libere com link autenticado para aprovação do cliente.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetComposer();
                    setMode('composer');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#2F1534] text-white text-xs font-medium inline-flex items-center gap-1.5 hover:bg-[#232122]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar primeira copy</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {copies.map((cp) => {
                  const st = COPY_STATUS_META[cp.status] || COPY_STATUS_META.draft;
                  return (
                    <div
                      key={cp.id}
                      className="aumi-surface-solid rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-[#EC97B7]/60 transition-colors"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-[#2F1534] truncate">{cp.title}</h4>
                            <p className="text-[11px] text-[#232122]/55 truncate">
                              {cp.client_name || 'Sem cliente'} {cp.board_title ? `· ${cp.board_title}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2 py-0.5 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[10px] font-semibold tabular-nums">
                              v{cp.version_number || 1}
                            </span>
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                              style={{ backgroundColor: st.bg, color: st.text }}
                            >
                              {st.label}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-[#232122]/70 line-clamp-3 leading-relaxed">
                          {stripHtmlTags(cp.content)}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-black/[0.06] flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[11px] text-[#232122]/50">
                          Por {cp.author_name} · {formatRelativeTime(cp.updated_at)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {cp.shared_with_client && cp.share_token && (
                            <button
                              type="button"
                              onClick={() => handleCopyShareLink(cp)}
                              className="px-2.5 py-1 rounded-lg bg-[#FDF2F6] text-[#EC2B82] text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[#FCE7F1]"
                              title="Copiar link autenticado"
                            >
                              {copiedLinkId === cp.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedLinkId === cp.id ? 'Copiado' : 'Link'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleDuplicate(cp)}
                            title="Duplicar"
                            className="p-1.5 rounded-lg border border-black/8 hover:bg-black/5 text-[#232122]/65"
                          >
                            <CopyPlus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              hydrateComposer(cp);
                              setMode('composer');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#2F1534] text-white text-[11px] font-medium inline-flex items-center gap-1 hover:bg-[#232122]"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Abrir</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cp)}
                            title="Excluir copy"
                            className="p-1.5 rounded-lg border border-black/8 hover:bg-red-50 text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === 'composer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Title, Rich Copy Editor, Notes, Attachments */}
            <div className="lg:col-span-7 xl:col-span-8 space-y-4">
              <div className="aumi-surface-solid rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#2F1534]">
                    Título da copy <span className="text-[#EC2B82]">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Ex: Carrossel institucional"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 bg-white text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82] focus:ring-2 focus:ring-[#EC2B82]/15"
                  />
                </div>

                {/* Rich Copy Editor */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#2F1534]">
                    Descrição / Copy <span className="text-[#EC2B82]">*</span>
                  </label>
                  <div className="rounded-xl border border-black/12 bg-white overflow-hidden focus-within:border-[#EC2B82] focus-within:ring-2 focus-within:ring-[#EC2B82]/15">
                    <div className="px-2.5 py-2 bg-[#F8F5FB] border-b border-black/[0.07] flex items-center gap-1 flex-wrap">
                      <button type="button" onClick={() => execFormat('bold')} title="Negrito" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('italic')} title="Itálico" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('underline')} title="Sublinhado" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('strikeThrough')} title="Tachado" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-px h-4 bg-black/10 mx-1" />
                      <button type="button" onClick={() => execFormat('formatBlock', 'H1')} title="Título 1" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Heading1 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('formatBlock', 'H2')} title="Título 2" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Heading2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('insertUnorderedList')} title="Lista" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <List className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={() => execFormat('insertOrderedList')} title="Lista numerada" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" onClick={insertLink} title="Inserir link" className="p-1.5 rounded-lg hover:bg-white text-[#232122]">
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={(e) => {
                        setContentHtml(e.currentTarget.innerHTML);
                        setIsDirty(true);
                      }}
                      data-placeholder="Escreva sua copy aqui..."
                      className="min-h-[190px] max-h-[340px] overflow-y-auto p-3.5 text-sm text-[#232122] leading-relaxed focus:outline-none aumi-copy-prose empty:before:content-[attr(data-placeholder)] empty:before:text-[#232122]/35"
                    />
                  </div>
                </div>

                {/* Observações internas / adicionais */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#2F1534]">Observações internas (opcional)</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Adicione orientações internas para design, tom de voz ou briefing..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 bg-white text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                  />
                </div>

                {/* Referências e anexos */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#2F1534]">Referências e anexos</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesUpload(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full py-5 px-4 rounded-2xl border border-dashed border-[#7A689C]/35 bg-[#F8F5FB]/60 hover:bg-[#F3ECF9]/60 transition-colors flex flex-col items-center justify-center gap-1.5 text-center"
                  >
                    <Upload className="w-5 h-5 text-[#7A689C]" />
                    <span className="text-xs font-semibold text-[#2F1534]">
                      {uploading ? 'Enviando arquivos...' : 'Adicionar arquivos'}
                    </span>
                    <span className="text-[11px] text-[#232122]/55">Imagens, PDF, referências ou outros arquivos</span>
                  </button>

                  {attachments.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {attachments.map((att, idx) => (
                        <div
                          key={`${att.filename}-${idx}`}
                          className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-black/10 bg-white text-xs"
                        >
                          <a
                            href={att.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate font-medium text-[#2F1534] hover:text-[#EC2B82] flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{att.original_name}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setAttachments((prev) => prev.filter((_, i) => i !== idx));
                              setIsDirty(true);
                            }}
                            className="text-red-500 hover:text-red-600 p-1 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Author, Priority, Labels, Checklist, Client Sharing & Actions */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4">
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-4">
                {/* Responsável pela criação */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#2F1534]">Responsável pela criação</label>
                  <div className="flex items-center gap-2">
                    <PartnerAvatar name={selectedAuthor.name} partnerKey={selectedAuthor.partner_key} avatarUrl={selectedAuthor.avatar_url} size="sm" />
                    <select
                      value={authorUserId}
                      onChange={(e) => {
                        setAuthorUserId(e.target.value);
                        setIsDirty(true);
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-black/12 bg-white text-xs font-medium text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                    >
                      {partners.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.title})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Prioridade do conteúdo */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#2F1534]">
                    Prioridade do conteúdo <span className="text-[#EC2B82]">*</span>
                  </label>
                  <div className="space-y-1.5">
                    {PRIORITY_OPTIONS.map((opt) => {
                      const active = priority === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setPriority(opt.key);
                            setIsDirty(true);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl border transition-all flex items-center gap-2.5 ${
                            active
                              ? 'bg-[#FDF2F6] border-[#EC2B82]/50 shadow-xs'
                              : 'bg-white border-black/8 hover:border-black/20'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0"
                            style={{ borderColor: opt.dot }}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: opt.dot }} />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#2F1534] leading-tight">{opt.label}</p>
                            <p className="text-[11px] text-[#232122]/55 leading-tight">{opt.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Etiquetas */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#2F1534]">Etiquetas</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableLabels.map((lbl) => {
                      const selected = labels.includes(lbl.name);
                      return (
                        <button
                          key={lbl.id}
                          type="button"
                          onClick={() => toggleLabel(lbl.name)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                            selected ? 'ring-2 ring-[#2F1534]/20 border-[#2F1534]/30' : 'border-black/8 opacity-75 hover:opacity-100'
                          }`}
                          style={{ backgroundColor: lbl.color, color: lbl.text }}
                        >
                          {selected ? '✓ ' : ''}
                          {lbl.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Checklist */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#2F1534]">Checklist</label>
                  {checklist.length > 0 && (
                    <div className="space-y-1.5">
                      {checklist.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => {
                              setChecklist((prev) => prev.map((c) => (c.id === item.id ? { ...c, done: !c.done } : c)));
                              setIsDirty(true);
                            }}
                            className="accent-[#EC2B82]"
                          />
                          <span className={`flex-1 ${item.done ? 'line-through text-[#232122]/40' : 'text-[#232122]'}`}>
                            {item.text}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setChecklist((prev) => prev.filter((c) => c.id !== item.id));
                              setIsDirty(true);
                            }}
                            className="text-[#232122]/40 hover:text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newCheckText}
                      onChange={(e) => setNewCheckText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addChecklistItem();
                        }
                      }}
                      placeholder="Novo item..."
                      className="flex-1 px-2.5 py-1.5 rounded-xl border border-black/12 bg-white text-xs focus:outline-none focus:border-[#EC2B82]"
                    />
                    <button
                      type="button"
                      onClick={addChecklistItem}
                      className="px-2.5 py-1.5 rounded-xl bg-[#F3ECF9] text-[#2F1534] text-xs font-medium hover:bg-[#E7D8F5] whitespace-nowrap"
                    >
                      + Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {/* Vínculo & Compartilhamento Independente */}
              <div className="aumi-surface-solid rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#2F1534]">Projeto &amp; Compartilhamento</span>
                  {editingCopy && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[10px] font-semibold tabular-nums">
                        v{editingCopy.version_number || 1}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: COPY_STATUS_META[editingCopy.status]?.bg || '#F4F4F5',
                          color: COPY_STATUS_META[editingCopy.status]?.text || '#232122',
                        }}
                      >
                        {COPY_STATUS_META[editingCopy.status]?.label || editingCopy.status}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setBoardId('');
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                  >
                    <option value="">Selecionar cliente...</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ''}
                      </option>
                    ))}
                  </select>

                  <select
                    value={boardId}
                    onChange={(e) => {
                      setBoardId(e.target.value);
                      setIsDirty(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-black/12 bg-white text-xs text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                  >
                    <option value="">Selecionar quadro/projeto...</option>
                    {filteredBoards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-[11px] text-[#232122]/75 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={requireClientApproval}
                    onChange={(e) => setRequireClientApproval(e.target.checked)}
                    className="accent-[#EC2B82]"
                  />
                  <span>Solicitar aprovação do cliente ao compartilhar</span>
                </label>

                {editingCopy?.shared_with_client && editingCopy.share_token && (
                  <div className="p-2.5 rounded-xl bg-[#FDF2F6] border border-[#EC97B7]/40 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#EC2B82]">
                      <span className="inline-flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        Link autenticado ativo
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyShareLink(editingCopy)}
                        className="px-2 py-0.5 rounded-lg bg-white text-[#2F1534] border border-[#EC97B7]/50 inline-flex items-center gap-1 hover:bg-[#FCF6EC]"
                      >
                        {copiedLinkId === editingCopy.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedLinkId === editingCopy.id ? 'Copiado!' : 'Copiar link'}</span>
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-[#232122]/65 break-all">
                      {buildShareUrl(editingCopy.share_token)}
                    </p>
                  </div>
                )}

                {editingCopy?.client_feedback && (
                  <div className="p-2.5 rounded-xl bg-[#FCF6EC] border border-[#E1754C]/30 text-[11px] text-[#2F1534]">
                    <span className="font-semibold">Retorno do cliente:</span> {editingCopy.client_feedback}
                  </div>
                )}

                {/* Action buttons — Internal Production vs Client Portal Share are independent */}
                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveOnly}
                    className="w-full py-2 px-3.5 rounded-xl border border-black/12 bg-white hover:bg-black/5 text-xs font-semibold text-[#2F1534] transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : editingCopy ? 'Salvar alterações' : 'Salvar rascunho'}
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSendInternal}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar para produção interna</span>
                  </button>

                  {editingCopy?.shared_with_client ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleToggleShare(false)}
                      className="w-full py-2 px-3.5 rounded-xl border border-[#EC2B82]/35 bg-[#FDF2F6] hover:bg-[#FCE7F1] text-[#A9195A] text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Revogar compartilhamento externo</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleToggleShare(true)}
                      className="w-full py-2.5 px-3.5 rounded-xl bg-[#EC2B82] hover:bg-[#d11f6f] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-50"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Compartilhar no Portal do Cliente</span>
                    </button>
                  )}
                </div>

                {editingCopy && editingCopy.history?.length > 0 && (
                  <div className="pt-2 border-t border-black/[0.06]">
                    <button
                      type="button"
                      onClick={() => setShowHistory((v) => !v)}
                      className="text-[11px] font-medium text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1"
                    >
                      <History className="w-3 h-3" />
                      <span>{showHistory ? 'Ocultar histórico' : `Histórico de alterações (${editingCopy.history.length})`}</span>
                    </button>
                    {showHistory && (
                      <div className="mt-2 space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {editingCopy.history.map((h) => (
                          <div key={h.id} className="text-[10px] text-[#232122]/70 border-l-2 border-[#BC9FE6] pl-2">
                            <span className="font-semibold text-[#2F1534]">{h.actor_name}:</span> {h.details}{' '}
                            <span className="text-[#232122]/45">({formatRelativeTime(h.created_at)})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </MacWindow>
  );
}
