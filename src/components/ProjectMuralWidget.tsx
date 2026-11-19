import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AtSign,
  Bold,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Folder,
  Heart,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  Lock,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Paperclip,
  Pin,
  Reply,
  Send,
  Smile,
  Strikethrough,
  Trash2,
  Underline,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { api, formatRelativeTime, sanitizeFileDisplayName, uploadFile } from '../lib/api.ts';
import {
  MuralAttachment,
  MuralComment,
  MuralLink,
  MuralMention,
  MuralPost,
  MuralReaction,
  User,
} from '../types/aumi.ts';

interface ParticipantOption {
  id: string;
  name: string;
  role: 'partner' | 'client';
  partner_key?: 'ingrid' | 'mariana' | null;
  avatar_url?: string | null;
}

interface ProjectMuralWidgetProps {
  boardId: string;
  clientId?: string | null;
  user: User;
  isClient: boolean;
  posts: MuralPost[];
  participants: ParticipantOption[];
  compact?: boolean;
  onPostsChange: (updater: (prev: MuralPost[]) => MuralPost[]) => void;
  onRefresh: () => Promise<void> | void;
  onOpenLinkedItem?: (post: MuralPost) => void;
  onOpenFullMural?: () => void;
  headerRightExtra?: React.ReactNode;
}

type MuralTab = 'mural' | 'conversas' | 'atividades' | 'arquivos';

const QUICK_EMOJIS = ['💜', '🩷', '✨', '🎉', '👏', '🙏', '🔥', '✅', '😍', '📌', '💡', '🫶'];
const REACTION_EMOJIS = ['❤️', '💜', '👏', '✨'];

function formatDateTimeShortBR(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} às ${hh}:${min}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getAvatarColors(authorName: string, partnerKey?: string | null, role?: string): string {
  const lower = (authorName || '').toLowerCase();
  if (partnerKey === 'ingrid' || lower.includes('ingrid')) {
    return 'bg-[#EC2B82] text-white';
  }
  if (partnerKey === 'mariana' || lower.includes('mariana')) {
    return 'bg-[#7A689C] text-white';
  }
  if (role === 'client') {
    return 'bg-[#E1754C] text-white';
  }
  return 'bg-[#9F87C9] text-white';
}

function getInitials(name: string): string {
  const clean = (name || 'AU').trim();
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function AuthorAvatar({
  name,
  avatarUrl,
  partnerKey,
  role,
  size = 'md',
}: {
  name: string;
  avatarUrl?: string | null;
  partnerKey?: string | null;
  role?: string;
  size?: 'sm' | 'md';
}) {
  const cls = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs';
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${cls} rounded-full object-cover shrink-0 border border-[#E6D9F5]`}
      />
    );
  }
  return (
    <div
      className={`${cls} rounded-full ${getAvatarColors(name, partnerKey, role)} font-extrabold flex items-center justify-center shrink-0`}
    >
      {getInitials(name)}
    </div>
  );
}

/**
 * Safe inline rich-text renderer supporting:
 * **bold**, *italic*, __underline__, ~~strike~~, - bullet lists, clickable URLs, and @mentions.
 */
function renderInlineTokens(line: string, keyPrefix: string): React.ReactNode[] {
  const pattern =
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|https?:\/\/[^\s<]+|@[A-Za-zÀ-ÿ0-9._-]+)/g;
  const parts = line.split(pattern);
  return parts.map((part, i) => {
    if (!part) return null;
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-bold text-[#2F1534]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('__') && part.endsWith('__') && part.length > 4) {
      return (
        <span key={key} className="underline decoration-[#EC2B82]/60 underline-offset-2">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
      return (
        <span key={key} className="line-through text-[#232122]/55">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (/^https?:\/\//i.test(part)) {
      return (
        <a
          key={key}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[#EC2B82] underline decoration-[#EC2B82]/45 hover:decoration-[#EC2B82] break-all font-medium"
        >
          {part}
        </a>
      );
    }
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span
          key={key}
          className="px-1.5 py-0.5 rounded-md bg-[#F3ECF9] text-[#7A689C] font-bold text-[0.95em]"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

function RichMuralContent({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  const flushList = (idx: number) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${idx}`} className="list-disc pl-5 space-y-0.5 my-1">
        {listBuffer.map((item, li) => (
          <li key={`li-${idx}-${li}`}>{renderInlineTokens(item, `li-${idx}-${li}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (/^[-•]\s+/.test(trimmed)) {
      listBuffer.push(trimmed.replace(/^[-•]\s+/, ''));
    } else {
      flushList(idx);
      if (trimmed.length === 0) {
        blocks.push(<div key={`br-${idx}`} className="h-1.5" />);
      } else {
        blocks.push(
          <p key={`p-${idx}`} className="leading-relaxed break-words">
            {renderInlineTokens(rawLine, `p-${idx}`)}
          </p>
        );
      }
    }
  });
  flushList(lines.length);

  return <div className="text-[13px] text-[#2F1534]/90 space-y-0.5">{blocks}</div>;
}

function AttachmentsAndLinksBlock({
  attachments,
  links,
  compact = false,
}: {
  attachments?: MuralAttachment[];
  links?: MuralLink[];
  compact?: boolean;
}) {
  const safeAtts = attachments || [];
  const safeLinks = links || [];
  if (safeAtts.length === 0 && safeLinks.length === 0) return null;

  return (
    <div className="space-y-2 mt-2.5" onClick={(e) => e.stopPropagation()}>
      {safeAtts.map((att, idx) => {
        const isImage = (att.mime_type || '').startsWith('image/');
        const cleanName = sanitizeFileDisplayName(att.original_name || att.filename);
        if (isImage) {
          return (
            <a
              key={`${att.filename}-${idx}`}
              href={att.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-xl overflow-hidden border border-[#E6D9F5] bg-[#FAF7FC] hover:border-[#EC2B82]/50 transition-colors"
            >
              <img
                src={att.file_url}
                alt={cleanName}
                className={`w-full object-cover ${compact ? 'max-h-36' : 'max-h-56'}`}
              />
              <div className="px-3 py-1.5 flex items-center justify-between gap-2 text-[11px] bg-[#F5EFFC] text-[#2F1534]">
                <span className="truncate font-semibold">{cleanName}</span>
                {att.size_bytes ? (
                  <span className="text-[10px] text-[#7A689C] shrink-0">{formatBytes(att.size_bytes)}</span>
                ) : null}
              </div>
            </a>
          );
        }
        return (
          <a
            key={`${att.filename}-${idx}`}
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={cleanName}
            className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#F3ECF9] hover:bg-[#ECE1F7] border border-[#E2D4F4] transition-colors"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-8 h-8 rounded-lg bg-white text-[#7A689C] border border-[#E2D4F4] flex items-center justify-center shrink-0">
                <Paperclip className="w-3.5 h-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#2F1534] truncate">{cleanName}</p>
                <p className="text-[10.5px] text-[#7A689C]">{formatBytes(att.size_bytes) || 'Documento'}</p>
              </div>
            </div>
            <Download className="w-3.5 h-3.5 text-[#7A689C] shrink-0" />
          </a>
        );
      })}

      {safeLinks.map((lnk) => (
        <a
          key={lnk.id || lnk.url}
          href={lnk.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#FAF7FC] hover:bg-[#F3ECF9] border border-[#E5D7F4] transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-lg bg-white text-[#7A689C] border border-[#E5D7F4] flex items-center justify-center shrink-0">
              <Link2 className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#2F1534] truncate">
                {lnk.title?.trim() || getHostname(lnk.url)}
              </p>
              <p className="text-[10.5px] text-[#7A689C] truncate">{getHostname(lnk.url)}</p>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#7A689C] shrink-0" />
        </a>
      ))}
    </div>
  );
}

function SparkleStarsDecoration() {
  return (
    <div className="hidden sm:flex items-center gap-2 text-[#9B7AC7] pointer-events-none select-none shrink-0">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
      </svg>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#EC2B82" aria-hidden="true" className="mt-3 opacity-80">
        <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
      </svg>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#7A689C" aria-hidden="true">
        <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
      </svg>
    </div>
  );
}

export function ProjectMuralWidget({
  boardId,
  clientId,
  user,
  isClient,
  posts,
  participants,
  compact = false,
  onPostsChange,
  onRefresh,
  onOpenLinkedItem,
  onOpenFullMural,
  headerRightExtra,
}: ProjectMuralWidgetProps) {
  const [activeTab, setActiveTab] = useState<MuralTab>('mural');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const [confirmDeletePostId, setConfirmDeletePostId] = useState<string | null>(null);
  const [confirmDeleteCommentId, setConfirmDeleteCommentId] = useState<string | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);

  // Preserve feed scroll position cleanly
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTopRef = useRef<number>(0);

  // Right column — Post Composer state
  const postTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const postFileInputRef = useRef<HTMLInputElement | null>(null);
  const [postContent, setPostContent] = useState('');
  const [postVisibility, setPostVisibility] = useState<'shared' | 'internal'>('shared');
  const [postAttachments, setPostAttachments] = useState<MuralAttachment[]>([]);
  const [postLinks, setPostLinks] = useState<MuralLink[]>([]);
  const [postMentions, setPostMentions] = useState<MuralMention[]>([]);
  const [postEmojiOpen, setPostEmojiOpen] = useState(false);
  const [postMentionOpen, setPostMentionOpen] = useState(false);
  const [postLinkOpen, setPostLinkOpen] = useState(false);
  const [postLinkUrl, setPostLinkUrl] = useState('');
  const [postLinkTitle, setPostLinkTitle] = useState('');
  const [uploadingPostFile, setUploadingPostFile] = useState(false);
  const [submittingPost, setSubmittingPost] = useState(false);

  // Detail View — Comment & Reply Composer state
  const commentTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);
  const [replyTarget, setReplyTarget] = useState<MuralComment | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'shared' | 'internal'>('shared');
  const [commentAttachments, setCommentAttachments] = useState<MuralAttachment[]>([]);
  const [commentLinks, setCommentLinks] = useState<MuralLink[]>([]);
  const [commentMentions, setCommentMentions] = useState<MuralMention[]>([]);
  const [commentEmojiOpen, setCommentEmojiOpen] = useState(false);
  const [commentMentionOpen, setCommentMentionOpen] = useState(false);
  const [commentLinkOpen, setCommentLinkOpen] = useState(false);
  const [commentLinkUrl, setCommentLinkUrl] = useState('');
  const [commentLinkTitle, setCommentLinkTitle] = useState('');
  const [uploadingCommentFile, setUploadingCommentFile] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [reactionPickerCommentId, setReactionPickerCommentId] = useState<string | null>(null);

  // Safely filter out any internal posts if viewing as client
  const visiblePosts = useMemo(() => {
    return posts.filter((p) => (!isClient ? true : p.visibility !== 'internal'));
  }, [posts, isClient]);

  const unreadCount = useMemo(
    () => visiblePosts.filter((p) => !(p.read_by || []).includes(user.id)).length,
    [visiblePosts, user.id]
  );

  const tabPosts = useMemo(() => {
    if (activeTab === 'conversas') {
      return visiblePosts.filter((p) => !p.is_auto || (p.comments && p.comments.length > 0));
    }
    if (activeTab === 'atividades') {
      return visiblePosts.filter((p) => Boolean(p.is_auto));
    }
    if (activeTab === 'arquivos') {
      return visiblePosts.filter(
        (p) =>
          (p.attachments && p.attachments.length > 0) ||
          (p.links && p.links.length > 0) ||
          (p.comments || []).some((c) => c.attachments?.length > 0 || c.links?.length > 0)
      );
    }
    return visiblePosts;
  }, [visiblePosts, activeTab]);

  const selectedPost = useMemo(
    () => visiblePosts.find((p) => p.id === selectedPostId) || null,
    [visiblePosts, selectedPostId]
  );

  useEffect(() => {
    if (selectedPost && selectedPost.visibility === 'internal') {
      setCommentVisibility('internal');
    } else if (replyTarget && replyTarget.visibility === 'internal') {
      setCommentVisibility('internal');
    }
  }, [selectedPost, replyTarget]);

  function openPostDetail(post: MuralPost, focusComposer = false) {
    if (feedScrollRef.current) {
      savedScrollTopRef.current = feedScrollRef.current.scrollTop;
    }
    setSelectedPostId(post.id);
    setReplyTarget(null);
    setCommentContent('');
    setCommentAttachments([]);
    setCommentLinks([]);
    setCommentMentions([]);
    setCommentVisibility(post.visibility === 'internal' ? 'internal' : 'shared');
    setOpenMenuPostId(null);

    // Mark post as read quietly if unread
    if (!(post.read_by || []).includes(user.id)) {
      api<{ ok: boolean; read_by: string[] }>(`/mural/${post.id}/mark-read`, {
        method: 'POST',
        body: JSON.stringify({ read: true }),
      })
        .then((res) => {
          onPostsChange((prev) =>
            prev.map((item) => (item.id === post.id ? { ...item, read_by: res.read_by } : item))
          );
        })
        .catch(() => {});
    }

    if (focusComposer) {
      window.setTimeout(() => {
        commentTextareaRef.current?.focus();
      }, 60);
    }
  }

  function closePostDetail() {
    setSelectedPostId(null);
    setReplyTarget(null);
    setReactionPickerCommentId(null);
    window.requestAnimationFrame(() => {
      if (feedScrollRef.current) {
        feedScrollRef.current.scrollTop = savedScrollTopRef.current;
      }
    });
  }

  function applyFormatting(
    ref: React.RefObject<HTMLTextAreaElement | null>,
    currentValue: string,
    setValue: (v: string) => void,
    type: 'bold' | 'italic' | 'underline' | 'strike' | 'list'
  ) {
    const el = ref.current;
    if (!el) {
      if (type === 'list') setValue(currentValue ? `${currentValue}\n- ` : '- ');
      return;
    }
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const selected = currentValue.slice(start, end);

    let replacement = '';
    let cursorOffset = 0;

    if (type === 'list') {
      if (selected) {
        replacement = selected
          .split('\n')
          .map((l) => (l.trim().startsWith('- ') ? l : `- ${l}`))
          .join('\n');
        cursorOffset = replacement.length;
      } else {
        const prefix = start > 0 && currentValue[start - 1] !== '\n' ? '\n- ' : '- ';
        replacement = prefix;
        cursorOffset = prefix.length;
      }
    } else {
      const wrapMap = {
        bold: '**',
        italic: '*',
        underline: '__',
        strike: '~~',
      };
      const marker = wrapMap[type];
      const inner = selected || 'texto';
      replacement = `${marker}${inner}${marker}`;
      cursorOffset = selected ? replacement.length : marker.length + inner.length;
    }

    const next = currentValue.slice(0, start) + replacement + currentValue.slice(end);
    setValue(next);
    window.requestAnimationFrame(() => {
      el.focus();
      if (!selected && type !== 'list') {
        const markerLen = type === 'italic' ? 1 : 2;
        el.setSelectionRange(start + markerLen, start + cursorOffset);
      } else {
        el.setSelectionRange(start + cursorOffset, start + cursorOffset);
      }
    });
  }

  function insertAtCursor(
    ref: React.RefObject<HTMLTextAreaElement | null>,
    currentValue: string,
    setValue: (v: string) => void,
    snippet: string
  ) {
    const el = ref.current;
    const start = el?.selectionStart ?? currentValue.length;
    const end = el?.selectionEnd ?? currentValue.length;
    const next = currentValue.slice(0, start) + snippet + currentValue.slice(end);
    setValue(next);
    window.requestAnimationFrame(() => {
      el?.focus();
      const pos = start + snippet.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  async function handleUploadFile(
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'post' | 'comment'
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (target === 'post') setUploadingPostFile(true);
    else setUploadingCommentFile(true);
    try {
      const uploaded = await uploadFile(file);
      if (target === 'post') {
        setPostAttachments((prev) => [...prev, uploaded]);
      } else {
        setCommentAttachments((prev) => [...prev, uploaded]);
      }
    } finally {
      if (target === 'post') setUploadingPostFile(false);
      else setUploadingCommentFile(false);
      e.target.value = '';
    }
  }

  function handleAddLink(target: 'post' | 'comment') {
    const rawUrl = target === 'post' ? postLinkUrl : commentLinkUrl;
    const rawTitle = target === 'post' ? postLinkTitle : commentLinkTitle;
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;
    const linkItem: MuralLink = {
      id: `lnk-${Date.now()}`,
      url: normalized,
      title: rawTitle.trim() || getHostname(normalized),
    };
    if (target === 'post') {
      setPostLinks((prev) => [...prev, linkItem]);
      setPostLinkUrl('');
      setPostLinkTitle('');
      setPostLinkOpen(false);
    } else {
      setCommentLinks((prev) => [...prev, linkItem]);
      setCommentLinkUrl('');
      setCommentLinkTitle('');
      setCommentLinkOpen(false);
    }
  }

  function handleAddMention(p: ParticipantOption, target: 'post' | 'comment') {
    const token = `@${p.name.split(' ')[0]} `;
    if (target === 'post') {
      insertAtCursor(postTextareaRef, postContent, setPostContent, token);
      setPostMentions((prev) =>
        prev.some((m) => m.user_id === p.id) ? prev : [...prev, { user_id: p.id, name: p.name }]
      );
      setPostMentionOpen(false);
    } else {
      insertAtCursor(commentTextareaRef, commentContent, setCommentContent, token);
      setCommentMentions((prev) =>
        prev.some((m) => m.user_id === p.id) ? prev : [...prev, { user_id: p.id, name: p.name }]
      );
      setCommentMentionOpen(false);
    }
  }

  async function handlePublishPost(e: React.FormEvent) {
    e.preventDefault();
    if (!postContent.trim() && postAttachments.length === 0 && postLinks.length === 0) return;
    setSubmittingPost(true);
    try {
      const res = await api<{ post: MuralPost }>('/mural', {
        method: 'POST',
        body: JSON.stringify({
          scope: 'board',
          board_id: boardId,
          client_id: clientId || undefined,
          title: '',
          content: postContent.trim(),
          visibility: isClient ? 'shared' : postVisibility,
          attachments: postAttachments,
          links: postLinks,
          mentions: postMentions,
          color: '#FFFFFF',
        }),
      });
      onPostsChange((prev) => [res.post, ...prev]);
      setPostContent('');
      setPostAttachments([]);
      setPostLinks([]);
      setPostMentions([]);
      setPostEmojiOpen(false);
      setPostMentionOpen(false);
      setPostLinkOpen(false);
      if (feedScrollRef.current) {
        feedScrollRef.current.scrollTop = 0;
      }
      await onRefresh();
    } finally {
      setSubmittingPost(false);
    }
  }

  async function handleToggleLike(post: MuralPost) {
    if (likingPostId === post.id) return;
    setLikingPostId(post.id);
    try {
      const res = await api<{ ok: boolean; liked: boolean; likes: string[]; likes_count: number }>(
        `/mural/${post.id}/like`,
        { method: 'POST' }
      );
      onPostsChange((prev) =>
        prev.map((item) =>
          item.id === post.id
            ? { ...item, likes: res.likes, likes_count: res.likes_count }
            : item
        )
      );
    } finally {
      setLikingPostId(null);
    }
  }

  async function handleTogglePin(post: MuralPost) {
    if (isClient) return;
    const res = await api<{ post: MuralPost }>(`/mural/${post.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned: !post.pinned }),
    });
    onPostsChange((prev) =>
      prev.map((item) => (item.id === post.id ? { ...item, pinned: res.post.pinned } : item))
    );
    setOpenMenuPostId(null);
    await onRefresh();
  }

  async function handleDeletePostConfirmed(postId: string) {
    await api(`/mural/${postId}`, { method: 'DELETE' });
    onPostsChange((prev) => prev.filter((item) => item.id !== postId));
    if (selectedPostId === postId) {
      setSelectedPostId(null);
    }
    setConfirmDeletePostId(null);
    setOpenMenuPostId(null);
    await onRefresh();
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPost) return;
    if (!commentContent.trim() && commentAttachments.length === 0 && commentLinks.length === 0) return;

    setSubmittingComment(true);
    try {
      const res = await api<{ ok: boolean; comment: MuralComment; comments: MuralComment[] }>(
        `/mural/${selectedPost.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: commentContent.trim(),
            parent_comment_id: replyTarget?.id || null,
            visibility: isClient ? 'shared' : commentVisibility,
            attachments: commentAttachments,
            links: commentLinks,
            mentions: commentMentions,
          }),
        }
      );
      onPostsChange((prev) =>
        prev.map((item) =>
          item.id === selectedPost.id
            ? { ...item, comments: res.comments, comments_count: res.comments.length }
            : item
        )
      );
      setCommentContent('');
      setCommentAttachments([]);
      setCommentLinks([]);
      setCommentMentions([]);
      setReplyTarget(null);
      setCommentEmojiOpen(false);
      setCommentMentionOpen(false);
      setCommentLinkOpen(false);
    } finally {
      setSubmittingComment(false);
    }
  }

  async function handleToggleCommentReaction(postId: string, commentId: string, emoji: string) {
    const res = await api<{ ok: boolean; reactions: MuralReaction[] }>(
      `/mural/${postId}/comments/${commentId}/react`,
      {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }
    );
    onPostsChange((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              comments: (p.comments || []).map((c) =>
                c.id === commentId ? { ...c, reactions: res.reactions } : c
              ),
            }
          : p
      )
    );
    setReactionPickerCommentId(null);
  }

  async function handleDeleteCommentConfirmed(postId: string, commentId: string) {
    await api(`/mural/${postId}/comments/${commentId}`, { method: 'DELETE' });
    onPostsChange((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        const remaining = (p.comments || []).filter(
          (c) => c.id !== commentId && c.parent_comment_id !== commentId
        );
        return { ...p, comments: remaining, comments_count: remaining.length };
      })
    );
    setConfirmDeleteCommentId(null);
  }

  function canDeletePost(post: MuralPost): boolean {
    if (!isClient) return true;
    return post.author_id === user.id && post.visibility !== 'internal';
  }

  function canDeleteComment(comment: MuralComment): boolean {
    if (!isClient) return true;
    return comment.author_id === user.id && comment.visibility !== 'internal';
  }

  const availableMentionParticipants = useMemo(() => {
    const allowed = participants.filter((p) =>
      !isClient && postVisibility === 'internal' ? p.role === 'partner' : true
    );
    return allowed;
  }, [participants, isClient, postVisibility]);

  const commentMentionParticipants = useMemo(() => {
    const isInternalScope =
      !isClient &&
      (commentVisibility === 'internal' ||
        selectedPost?.visibility === 'internal' ||
        replyTarget?.visibility === 'internal');
    return participants.filter((p) => (isInternalScope ? p.role === 'partner' : true));
  }, [participants, isClient, commentVisibility, selectedPost, replyTarget]);

  // Group comments into root comments + nested replies strictly for the selected post
  const commentTree = useMemo(() => {
    if (!selectedPost) return [];
    const list = (selectedPost.comments || []).filter((c) =>
      isClient ? c.visibility !== 'internal' : true
    );
    const byId = new Map<string, MuralComment>();
    list.forEach((c) => byId.set(c.id, c));

    const roots: Array<{ comment: MuralComment; replies: MuralComment[] }> = [];
    const repliesMap = new Map<string, MuralComment[]>();

    for (const c of list) {
      if (c.parent_comment_id && byId.has(c.parent_comment_id)) {
        // Attach to root ancestor so multi-level replies stay neatly nested under their parent thread
        let ancestorId = c.parent_comment_id;
        let guard = 0;
        while (byId.get(ancestorId)?.parent_comment_id && guard < 10) {
          ancestorId = byId.get(ancestorId)!.parent_comment_id!;
          guard++;
        }
        const arr = repliesMap.get(ancestorId) || [];
        arr.push(c);
        repliesMap.set(ancestorId, arr);
      } else {
        roots.push({ comment: c, replies: [] });
      }
    }

    return roots.map((r) => ({
      comment: r.comment,
      replies: repliesMap.get(r.comment.id) || [],
    }));
  }, [selectedPost, isClient]);

  function renderReactionChips(postId: string, comment: MuralComment) {
    const grouped = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const r of comment.reactions || []) {
      const existing = grouped.get(r.emoji) || { count: 0, mine: false, names: [] };
      existing.count += 1;
      if (r.user_id === user.id) existing.mine = true;
      existing.names.push(`${r.user_name} (${formatDateTimeShortBR(r.created_at)})`);
      grouped.set(r.emoji, existing);
    }
    if (grouped.size === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {Array.from(grouped.entries()).map(([emoji, info]) => (
          <button
            key={emoji}
            type="button"
            title={info.names.join(', ')}
            onClick={() => handleToggleCommentReaction(postId, comment.id, emoji)}
            className={`px-2 py-0.5 rounded-full text-[11px] font-bold inline-flex items-center gap-1 border transition-colors ${
              info.mine
                ? 'bg-[#FDF2F6] border-[#EC97B7] text-[#EC2B82]'
                : 'bg-[#FAF7FC] border-[#E5D7F4] text-[#2F1534] hover:border-[#BC9FE6]'
            }`}
          >
            <span>{emoji}</span>
            <span className="tabular-nums text-[10px]">{info.count}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderSingleComment(comment: MuralComment, isReply = false) {
    const isConfirmingDelete = confirmDeleteCommentId === comment.id;
    return (
      <div
        key={comment.id}
        className={`${
          isReply ? 'ml-7 pl-3 border-l-2 border-[#E4D5F6]' : ''
        } py-2.5 space-y-1.5`}
      >
        <div className="flex items-start gap-2.5">
          <AuthorAvatar
            name={comment.author_name}
            avatarUrl={comment.author_avatar}
            partnerKey={comment.author_partner_key}
            role={comment.author_role}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="text-xs font-extrabold text-[#2F1534]">{comment.author_name}</span>
                {comment.author_role === 'client' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#FDF0E8] text-[#C2410C] text-[9.5px] font-bold">
                    Cliente
                  </span>
                )}
                {!isClient && comment.visibility === 'internal' && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#2F1534] text-white text-[9.5px] font-bold inline-flex items-center gap-0.5">
                    <Lock className="w-2.5 h-2.5" /> Nota interna
                  </span>
                )}
                <span className="text-[10.5px] text-[#7A689C] tabular-nums">
                  {formatRelativeTime(comment.created_at)} · {formatDateTimeShortBR(comment.created_at)}
                </span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0 relative">
                <button
                  type="button"
                  onClick={() =>
                    setReactionPickerCommentId((cur) => (cur === comment.id ? null : comment.id))
                  }
                  title="Reagir ao comentário"
                  className="p-1 rounded-lg text-[#7A689C] hover:text-[#EC2B82] hover:bg-[#F3ECF9] transition-colors"
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(comment);
                    if (comment.visibility === 'internal' && !isClient) {
                      setCommentVisibility('internal');
                    }
                    commentTextareaRef.current?.focus();
                  }}
                  title="Responder a este comentário"
                  className="p-1 rounded-lg text-[#7A689C] hover:text-[#EC2B82] hover:bg-[#F3ECF9] transition-colors"
                >
                  <Reply className="w-3.5 h-3.5" />
                </button>
                {canDeleteComment(comment) && (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCommentId(comment.id)}
                    title="Excluir comentário"
                    className="p-1 rounded-lg text-[#7A689C]/75 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}

                {reactionPickerCommentId === comment.id && selectedPost && (
                  <div className="absolute right-0 top-7 z-20 flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-[#E2D2F5] shadow-md">
                    {REACTION_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleToggleCommentReaction(selectedPost.id, comment.id, em)}
                        className="w-6 h-6 rounded-full hover:bg-[#FDF2F6] flex items-center justify-center text-sm transition-transform hover:scale-110"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-0.5">
              <RichMuralContent text={comment.content} />
            </div>

            <AttachmentsAndLinksBlock
              attachments={comment.attachments}
              links={comment.links}
              compact
            />

            {selectedPost && renderReactionChips(selectedPost.id, comment)}

            {isConfirmingDelete && selectedPost && (
              <div className="mt-2 p-2 rounded-xl bg-[#FDF2F6] border border-[#EC97B7] flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-[#2F1534]">Excluir este comentário?</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteCommentId(null)}
                    className="px-2 py-1 rounded-lg bg-white text-[#7A689C] font-semibold border border-[#E5D7F4]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCommentConfirmed(selectedPost.id, comment.id)}
                    className="px-2.5 py-1 rounded-lg bg-[#EC2B82] text-white font-bold"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] bg-white border border-[#E4D5F5] shadow-[0_14px_34px_-18px_rgba(47,21,52,0.2)] overflow-hidden">
      {/* macOS Mini-App Header Bar — Solid Lilac, Pink/Yellow/Green Dots, Tabs & Sparkle Stars */}
      <div className="bg-[#EFE6FA] border-b border-[#E1D1F4] px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Decorative macOS Dots: Pink, Yellow, Green */}
          <div className="flex items-center gap-1.5 shrink-0" aria-hidden="true">
            <span className="w-3 h-3 rounded-full bg-[#EC2B82]" />
            <span className="w-3 h-3 rounded-full bg-[#F2C94C]" />
            <span className="w-3 h-3 rounded-full bg-[#8DC655]" />
          </div>

          <span className="w-9 h-9 rounded-xl bg-[#7A689C] text-white flex items-center justify-center shrink-0">
            <MessageSquareText className="w-4 h-4" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] sm:text-base font-extrabold text-[#2F1534] tracking-tight truncate">
                Mural do Projeto
              </h2>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#EC2B82] text-white text-[10px] font-bold tabular-nums shrink-0">
                  {unreadCount} {unreadCount === 1 ? 'nova' : 'novas'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#6B588C] truncate">
              Atualizações, conversas e anexos do seu projeto em um só lugar ♡
            </p>
          </div>
        </div>

        {/* Navigation Tabs inside Mural Mini-App */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#E6DAF6] border border-[#D8C6F0]">
            {(
              [
                { id: 'mural', label: 'Mural', icon: MessageSquareText },
                { id: 'conversas', label: 'Conversas', icon: Users },
                { id: 'atividades', label: 'Atividades', icon: Zap },
                { id: 'arquivos', label: 'Arquivos', icon: Folder },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors ${
                    active
                      ? 'bg-white text-[#2F1534] shadow-2xs border border-[#DFCFEF]'
                      : 'text-[#5C497E] hover:text-[#2F1534]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#EC2B82]' : 'text-[#7A689C]'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <SparkleStarsDecoration />

          {onOpenFullMural && (
            <button
              type="button"
              onClick={onOpenFullMural}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#FAF7FC] border border-[#DCCBF2] text-[11px] font-bold text-[#7A689C] hover:text-[#EC2B82] inline-flex items-center gap-1 transition-colors"
            >
              <span>Expandir</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          {headerRightExtra}
        </div>
      </div>

      {/* TWO-COLUMN BODY: Left = Independently Scrollable Feed (2-3 visible) | Right = Chat Editor + Dedicated Post Detail Sub-Window */}
      <div className="bg-[#FAF7FC] p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN — Atualizações e Histórico */}
        <div
          className={`lg:col-span-6 ${
            selectedPost ? 'hidden lg:block' : 'block'
          }`}
        >
          <div
            ref={feedScrollRef}
            className={`${
              compact ? 'h-[470px]' : 'h-[560px]'
            } overflow-y-auto pr-2 space-y-3 scroll-smooth`}
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#BC9FE6 #EFE6FA',
            }}
          >
            {tabPosts.length === 0 ? (
              <div className="h-full rounded-2xl bg-white border border-[#E6D9F5] p-8 flex flex-col items-center justify-center text-center space-y-2">
                <span className="w-11 h-11 rounded-2xl bg-[#F3ECF9] text-[#7A689C] flex items-center justify-center">
                  <MessageSquareText className="w-5 h-5" />
                </span>
                <p className="text-sm font-bold text-[#2F1534]">
                  {activeTab === 'arquivos'
                    ? 'Nenhum anexo ou link publicado ainda'
                    : activeTab === 'atividades'
                    ? 'Nenhuma atividade automática registrada ainda'
                    : 'Nenhuma atualização nesta aba'}
                </p>
                <p className="text-xs text-[#7A689C] max-w-xs">
                  Use o campo ao lado para publicar novidades, arquivos, links e alinhamentos do projeto.
                </p>
              </div>
            ) : (
              tabPosts.map((post) => {
                const likes = post.likes || [];
                const likesCount = post.likes_count ?? likes.length;
                const isLiked = likes.includes(user.id);
                const commentsCount = post.comments_count ?? (post.comments?.length || 0);
                const isSelected = selectedPostId === post.id;
                const isUnread = !(post.read_by || []).includes(user.id);
                const isConfirmingDelete = confirmDeletePostId === post.id;

                return (
                  <article
                    key={post.id}
                    onClick={() => openPostDetail(post, false)}
                    className={`rounded-2xl bg-white border transition-colors cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'border-[#EC2B82] ring-2 ring-[#EC2B82]/15'
                        : isUnread
                        ? 'border-[#EC97B7] hover:border-[#EC2B82]'
                        : 'border-[#E6D9F5] hover:border-[#BC9FE6]'
                    }`}
                  >
                    <div className="p-4 space-y-2.5">
                      {/* Post Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <AuthorAvatar
                            name={post.author_name}
                            avatarUrl={post.author_avatar}
                            partnerKey={post.author_partner_key}
                            role={post.author_role}
                          />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13px] font-extrabold text-[#2F1534] truncate">
                                {post.author_name}
                              </span>
                              {Boolean(post.pinned) && (
                                <Pin className="w-3 h-3 text-[#EC2B82] shrink-0" />
                              )}
                              {!isClient && post.visibility === 'internal' && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[#2F1534] text-white text-[9.5px] font-bold inline-flex items-center gap-0.5">
                                  <Lock className="w-2.5 h-2.5" /> Nota interna
                                </span>
                              )}
                              {Boolean(post.is_auto) && (
                                <span className="px-1.5 py-0.5 rounded-md bg-[#F3ECF9] text-[#7A689C] text-[9.5px] font-bold">
                                  Atividade
                                </span>
                              )}
                              {isUnread && (
                                <span className="w-2 h-2 rounded-full bg-[#EC2B82] shrink-0" title="Nova atualização" />
                              )}
                            </div>
                            <p className="text-[11px] text-[#7A689C] tabular-nums">
                              {formatRelativeTime(post.created_at)} · {formatDateTimeShortBR(post.created_at)}
                            </p>
                          </div>
                        </div>

                        {/* Three-dots Menu */}
                        <div
                          className="relative shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuPostId((cur) => (cur === post.id ? null : post.id))
                            }
                            className="p-1.5 rounded-xl text-[#7A689C] hover:text-[#2F1534] hover:bg-[#F3ECF9] transition-colors"
                            title="Opções da publicação"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          {openMenuPostId === post.id && (
                            <div className="absolute right-0 top-8 w-44 rounded-2xl bg-white border border-[#E2D2F5] shadow-lg py-1.5 z-20 text-xs">
                              <button
                                type="button"
                                onClick={() => openPostDetail(post, false)}
                                className="w-full px-3 py-2 text-left text-[#2F1534] hover:bg-[#FAF7FC] font-semibold flex items-center gap-2"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-[#7A689C]" />
                                <span>Abrir publicação</span>
                              </button>
                              {!isClient && (
                                <button
                                  type="button"
                                  onClick={() => handleTogglePin(post)}
                                  className="w-full px-3 py-2 text-left text-[#2F1534] hover:bg-[#FAF7FC] font-semibold flex items-center gap-2"
                                >
                                  <Pin className="w-3.5 h-3.5 text-[#EC2B82]" />
                                  <span>{post.pinned ? 'Desafixar' : 'Fixar no topo'}</span>
                                </button>
                              )}
                              {onOpenLinkedItem && (post.card_id || post.entity_type === 'approval_delivery') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuPostId(null);
                                    onOpenLinkedItem(post);
                                  }}
                                  className="w-full px-3 py-2 text-left text-[#2F1534] hover:bg-[#FAF7FC] font-semibold flex items-center gap-2"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 text-[#7A689C]" />
                                  <span>Ir ao item vinculado</span>
                                </button>
                              )}
                              {canDeletePost(post) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuPostId(null);
                                    setConfirmDeletePostId(post.id);
                                  }}
                                  className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 font-semibold flex items-center gap-2 border-t border-[#F0E6FA] mt-1 pt-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Excluir publicação</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline Delete Confirmation */}
                      {isConfirmingDelete && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="p-2.5 rounded-xl bg-[#FDF2F6] border border-[#EC97B7] flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-bold text-[#2F1534]">
                            Confirmar exclusão desta publicação?
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePostId(null)}
                              className="px-2.5 py-1 rounded-lg bg-white text-[#7A689C] font-semibold border border-[#E5D7F4]"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePostConfirmed(post.id)}
                              className="px-3 py-1 rounded-lg bg-[#EC2B82] text-white font-bold"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Post Title (when present, e.g., legacy or auto posts) + Body */}
                      <div className="space-y-1">
                        {post.title?.trim() && (
                          <h3 className="text-[13.5px] font-extrabold text-[#2F1534] leading-snug">
                            {post.title}
                          </h3>
                        )}
                        <RichMuralContent text={post.content} />
                      </div>

                      {/* Attachments & Clickable Links */}
                      <AttachmentsAndLinksBlock
                        attachments={post.attachments}
                        links={post.links}
                        compact
                      />
                    </div>

                    {/* Footer Action Strip: Like Heart + Counter | Enviar comentário */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="px-4 py-2.5 bg-[#FAF5FD] border-t border-[#EFE5F8] flex items-center gap-4 text-xs"
                    >
                      <button
                        type="button"
                        disabled={likingPostId === post.id}
                        onClick={() => handleToggleLike(post)}
                        className={`inline-flex items-center gap-1.5 font-bold transition-colors ${
                          isLiked
                            ? 'text-[#EC2B82]'
                            : 'text-[#6B588C] hover:text-[#EC2B82]'
                        }`}
                      >
                        <Heart
                          className={`w-4 h-4 transition-transform ${
                            isLiked ? 'fill-[#EC2B82] text-[#EC2B82] scale-105' : 'text-[#EC2B82]'
                          }`}
                        />
                        <span className="tabular-nums">
                          {likesCount === 1
                            ? '1 curtida'
                            : `${likesCount} curtidas`}
                        </span>
                      </button>

                      <span className="h-3.5 w-px bg-[#DFCFEF]" aria-hidden="true" />

                      <button
                        type="button"
                        onClick={() => openPostDetail(post, true)}
                        className="inline-flex items-center gap-1.5 font-bold text-[#5C497E] hover:text-[#EC2B82] transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#7A689C]" />
                        <span>
                          {commentsCount > 0
                            ? `${commentsCount} ${commentsCount === 1 ? 'comentário' : 'comentários'}`
                            : 'Enviar comentário'}
                        </span>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — Criação de Atualizações + Dedicated Post Detail Sub-Window */}
        <div className="lg:col-span-6 space-y-4">
          {/* Post Composer (always accessible on desktop; hidden on mobile only while viewing a post detail) */}
          <form
            onSubmit={handlePublishPost}
            className={`${
              selectedPost ? 'hidden lg:block' : 'block'
            } rounded-2xl bg-white border border-[#E5D7F4] p-4 space-y-3`}
          >
            {/* Visibility Toggle (Team: Mensagem para o cliente vs Nota interna) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!isClient ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPostVisibility('shared')}
                    className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold inline-flex items-center gap-1.5 border transition-colors ${
                      postVisibility === 'shared'
                        ? 'bg-[#7A689C] text-white border-[#7A689C]'
                        : 'bg-[#FAF7FC] text-[#6B588C] border-[#E2D2F5] hover:border-[#BC9FE6]'
                    }`}
                  >
                    <Send className="w-3 h-3" />
                    <span>Mensagem para o cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostVisibility('internal')}
                    className={`px-3 py-1.5 rounded-full text-[11.5px] font-bold inline-flex items-center gap-1.5 border transition-colors ${
                      postVisibility === 'internal'
                        ? 'bg-[#2F1534] text-white border-[#2F1534]'
                        : 'bg-[#FAF7FC] text-[#6B588C] border-[#E2D2F5] hover:border-[#BC9FE6]'
                    }`}
                  >
                    <Lock className="w-3 h-3" />
                    <span>Nota interna</span>
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[#F3ECF9] text-[#7A689C] text-[11px] font-bold inline-flex items-center gap-1.5">
                  <Send className="w-3 h-3" />
                  <span>Enviar atualização para a equipe</span>
                </span>
              )}

              {!isClient && postVisibility === 'internal' && (
                <span className="text-[10.5px] font-semibold text-[#7A689C]">
                  Visível somente para a equipe
                </span>
              )}
            </div>

            {/* Editor Textarea */}
            <textarea
              ref={postTextareaRef}
              rows={selectedPost ? 3 : 5}
              value={postContent}
              onChange={(e) => setPostContent(e.target.value)}
              placeholder={
                !isClient && postVisibility === 'internal'
                  ? 'Escreva uma nota interna para a equipe...'
                  : 'Escreva sua mensagem aqui...'
              }
              className="w-full rounded-xl bg-[#FAF7FC] border border-[#E6D9F5] focus:border-[#EC2B82] focus:bg-white px-3.5 py-2.5 text-[13px] text-[#2F1534] placeholder:text-[#7A689C]/70 focus:outline-none resize-none transition-colors"
            />

            {/* Pending Attachments & Links preview */}
            {(postAttachments.length > 0 || postLinks.length > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {postAttachments.map((att, idx) => (
                  <span
                    key={`${att.filename}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#F3ECF9] border border-[#DFCFEF] text-[11px] font-semibold text-[#2F1534]"
                  >
                    {(att.mime_type || '').startsWith('image/') ? (
                      <ImageIcon className="w-3 h-3 text-[#EC2B82]" />
                    ) : (
                      <FileText className="w-3 h-3 text-[#7A689C]" />
                    )}
                    <span className="max-w-[160px] truncate">
                      {sanitizeFileDisplayName(att.original_name)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPostAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-[#7A689C] hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {postLinks.map((lnk) => (
                  <span
                    key={lnk.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#FDF2F6] border border-[#F3C0D5] text-[11px] font-semibold text-[#EC2B82]"
                  >
                    <Link2 className="w-3 h-3" />
                    <span className="max-w-[160px] truncate">{lnk.title || lnk.url}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPostLinks((prev) => prev.filter((item) => item.id !== lnk.id))
                      }
                      className="text-[#EC2B82]/70 hover:text-red-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Inline Popovers for Link / Emoji / Mention */}
            {postLinkOpen && (
              <div className="p-3 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={postLinkTitle}
                    onChange={(e) => setPostLinkTitle(e.target.value)}
                    placeholder="Título do link (opcional)"
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2D2F5] text-xs focus:outline-none focus:border-[#EC2B82]"
                  />
                  <input
                    type="text"
                    value={postLinkUrl}
                    onChange={(e) => setPostLinkUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddLink('post');
                      }
                    }}
                    placeholder="https://..."
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-[#E2D2F5] text-xs focus:outline-none focus:border-[#EC2B82]"
                  />
                </div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPostLinkOpen(false)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#7A689C]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAddLink('post')}
                    className="px-3 py-1 rounded-lg bg-[#7A689C] text-white text-[11px] font-bold"
                  >
                    Inserir link
                  </button>
                </div>
              </div>
            )}

            {postEmojiOpen && (
              <div className="p-2 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] flex flex-wrap gap-1">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      insertAtCursor(postTextareaRef, postContent, setPostContent, em);
                      setPostEmojiOpen(false);
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-white flex items-center justify-center text-base"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}

            {postMentionOpen && (
              <div className="p-2 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] flex flex-wrap gap-1.5">
                {availableMentionParticipants.length === 0 ? (
                  <span className="text-[11px] text-[#7A689C] px-2 py-1">
                    Nenhum participante disponível
                  </span>
                ) : (
                  availableMentionParticipants.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddMention(p, 'post')}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#F3ECF9] border border-[#E2D2F5] text-[11px] font-bold text-[#2F1534] inline-flex items-center gap-1.5"
                    >
                      <span className="text-[#EC2B82]">@</span>
                      <span>{p.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Chat-style Formatting Toolbar + Solid Pink Send Button */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#F0E6FA]">
              <div className="flex flex-wrap items-center gap-0.5 text-[#5C497E]">
                <button
                  type="button"
                  onClick={() => applyFormatting(postTextareaRef, postContent, setPostContent, 'bold')}
                  title="Negrito"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting(postTextareaRef, postContent, setPostContent, 'italic')}
                  title="Itálico"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyFormatting(postTextareaRef, postContent, setPostContent, 'underline')
                  }
                  title="Sublinhado"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applyFormatting(postTextareaRef, postContent, setPostContent, 'strike')
                  }
                  title="Tachado"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => applyFormatting(postTextareaRef, postContent, setPostContent, 'list')}
                  title="Lista"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#2F1534]"
                >
                  <List className="w-3.5 h-3.5" />
                </button>

                <span className="h-4 w-px bg-[#E5D7F4] mx-1" aria-hidden="true" />

                <button
                  type="button"
                  onClick={() => {
                    setPostEmojiOpen((v) => !v);
                    setPostMentionOpen(false);
                    setPostLinkOpen(false);
                  }}
                  title="Adicionar emoji"
                  className={`p-1.5 rounded-lg hover:bg-[#F3ECF9] ${
                    postEmojiOpen ? 'bg-[#F3ECF9] text-[#EC2B82]' : ''
                  }`}
                >
                  <Smile className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={uploadingPostFile}
                  onClick={() => postFileInputRef.current?.click()}
                  title="Anexar imagem ou documento"
                  className="p-1.5 rounded-lg hover:bg-[#F3ECF9] hover:text-[#EC2B82] disabled:opacity-50"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={postFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleUploadFile(e, 'post')}
                />
                <button
                  type="button"
                  onClick={() => {
                    setPostLinkOpen((v) => !v);
                    setPostEmojiOpen(false);
                    setPostMentionOpen(false);
                  }}
                  title="Inserir link clicável"
                  className={`p-1.5 rounded-lg hover:bg-[#F3ECF9] ${
                    postLinkOpen ? 'bg-[#F3ECF9] text-[#EC2B82]' : ''
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPostMentionOpen((v) => !v);
                    setPostEmojiOpen(false);
                    setPostLinkOpen(false);
                  }}
                  title="Mencionar participante"
                  className={`p-1.5 rounded-lg hover:bg-[#F3ECF9] ${
                    postMentionOpen ? 'bg-[#F3ECF9] text-[#EC2B82]' : ''
                  }`}
                >
                  <AtSign className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="submit"
                disabled={
                  submittingPost ||
                  uploadingPostFile ||
                  (!postContent.trim() && postAttachments.length === 0 && postLinks.length === 0)
                }
                className="px-4 py-2 rounded-full bg-[#EC2B82] hover:bg-[#D62273] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {uploadingPostFile
                    ? 'Anexando...'
                    : submittingPost
                    ? 'Enviando...'
                    : 'Enviar'}
                </span>
              </button>
            </div>
          </form>

          {/* DEDICATED INDIVIDUAL PUBLICATION VIEW — macOS Sub-Window ("Atualização") */}
          {selectedPost && (
            <div className="rounded-2xl bg-white border border-[#DECFF2] shadow-[0_14px_32px_-16px_rgba(47,21,52,0.22)] overflow-hidden">
              {/* Sub-window Header */}
              <div className="px-4 py-2.5 bg-[#F4ECFC] border-b border-[#E5D7F4] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EC2B82]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F2C94C]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8DC655]" />
                  </div>
                  <span className="text-xs font-extrabold text-[#2F1534]">Atualização</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={closePostDetail}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF7FC] border border-[#E2D2F5] text-[11px] font-bold text-[#7A689C] hover:text-[#2F1534] inline-flex items-center gap-1 transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    <span>Voltar ao mural</span>
                  </button>
                  <button
                    type="button"
                    onClick={closePostDetail}
                    title="Fechar visualização"
                    className="p-1 rounded-lg text-[#7A689C] hover:text-[#2F1534] hover:bg-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Original Publication Full View */}
              <div className="p-4 space-y-3 border-b border-[#EFE5F8]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <AuthorAvatar
                      name={selectedPost.author_name}
                      avatarUrl={selectedPost.author_avatar}
                      partnerKey={selectedPost.author_partner_key}
                      role={selectedPost.author_role}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13.5px] font-extrabold text-[#2F1534]">
                          {selectedPost.author_name}
                        </span>
                        {!isClient && selectedPost.visibility === 'internal' && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#2F1534] text-white text-[9.5px] font-bold inline-flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Nota interna
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#7A689C] tabular-nums">
                        {formatRelativeTime(selectedPost.created_at)} ·{' '}
                        {formatDateTimeShortBR(selectedPost.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Like Counter Pill */}
                  <button
                    type="button"
                    disabled={likingPostId === selectedPost.id}
                    onClick={() => handleToggleLike(selectedPost)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 transition-colors shrink-0 ${
                      (selectedPost.likes || []).includes(user.id)
                        ? 'bg-[#FDF2F6] border-[#EC97B7] text-[#EC2B82]'
                        : 'bg-[#FAF7FC] border-[#E5D7F4] text-[#6B588C] hover:border-[#EC97B7] hover:text-[#EC2B82]'
                    }`}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${
                        (selectedPost.likes || []).includes(user.id)
                          ? 'fill-[#EC2B82] text-[#EC2B82]'
                          : 'text-[#EC2B82]'
                      }`}
                    />
                    <span className="tabular-nums">
                      {(selectedPost.likes_count ?? (selectedPost.likes || []).length) === 1
                        ? '1 curtida'
                        : `${selectedPost.likes_count ?? (selectedPost.likes || []).length} curtidas`}
                    </span>
                  </button>
                </div>

                {selectedPost.title?.trim() && (
                  <h3 className="text-sm font-extrabold text-[#2F1534]">{selectedPost.title}</h3>
                )}
                <RichMuralContent text={selectedPost.content} />
                <AttachmentsAndLinksBlock
                  attachments={selectedPost.attachments}
                  links={selectedPost.links}
                />
              </div>

              {/* Comments & Nested Replies List */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-[#2F1534]">
                    Comentários ({selectedPost.comments?.length || 0})
                  </h4>
                </div>

                <div
                  className="max-h-[240px] overflow-y-auto pr-1 divide-y divide-[#F3ECFA]"
                  style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#BC9FE6 #EFE6FA',
                  }}
                >
                  {commentTree.length === 0 ? (
                    <p className="text-xs text-[#7A689C] py-5 text-center bg-[#FAF7FC] rounded-xl border border-[#EFE5F8]">
                      Nenhum comentário ainda. Escreva a primeira resposta abaixo.
                    </p>
                  ) : (
                    commentTree.map(({ comment, replies }) => (
                      <div key={comment.id}>
                        {renderSingleComment(comment, false)}
                        {replies.map((rep) => renderSingleComment(rep, true))}
                      </div>
                    ))
                  )}
                </div>

                {/* Comment / Reply Composer */}
                <form
                  onSubmit={handleSubmitComment}
                  className="pt-2.5 border-t border-[#EFE5F8] space-y-2"
                >
                  {replyTarget && (
                    <div className="px-3 py-1.5 rounded-xl bg-[#F3ECF9] border border-[#DFCFEF] flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#2F1534] font-semibold truncate">
                        Respondendo a <strong>{replyTarget.author_name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setReplyTarget(null)}
                        className="text-[#7A689C] hover:text-[#EC2B82]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {!isClient && selectedPost.visibility !== 'internal' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={replyTarget?.visibility === 'internal'}
                        onClick={() => setCommentVisibility('shared')}
                        className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold border transition-colors ${
                          commentVisibility === 'shared'
                            ? 'bg-[#7A689C] text-white border-[#7A689C]'
                            : 'bg-[#FAF7FC] text-[#6B588C] border-[#E2D2F5]'
                        } disabled:opacity-45`}
                      >
                        Público
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommentVisibility('internal')}
                        className={`px-2.5 py-1 rounded-full text-[10.5px] font-bold inline-flex items-center gap-1 border transition-colors ${
                          commentVisibility === 'internal'
                            ? 'bg-[#2F1534] text-white border-[#2F1534]'
                            : 'bg-[#FAF7FC] text-[#6B588C] border-[#E2D2F5]'
                        }`}
                      >
                        <Lock className="w-2.5 h-2.5" />
                        <span>Nota interna</span>
                      </button>
                    </div>
                  )}

                  {(commentAttachments.length > 0 || commentLinks.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {commentAttachments.map((att, idx) => (
                        <span
                          key={`${att.filename}-${idx}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#F3ECF9] text-[10.5px] font-semibold text-[#2F1534]"
                        >
                          <Paperclip className="w-2.5 h-2.5 text-[#7A689C]" />
                          <span className="max-w-[140px] truncate">
                            {sanitizeFileDisplayName(att.original_name)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCommentAttachments((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-[#7A689C] hover:text-red-500"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                      {commentLinks.map((lnk) => (
                        <span
                          key={lnk.id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FDF2F6] text-[10.5px] font-semibold text-[#EC2B82]"
                        >
                          <Link2 className="w-2.5 h-2.5" />
                          <span className="max-w-[140px] truncate">{lnk.title || lnk.url}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setCommentLinks((prev) => prev.filter((item) => item.id !== lnk.id))
                            }
                            className="text-[#EC2B82]/70 hover:text-red-600"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {commentLinkOpen && (
                    <div className="p-2.5 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={commentLinkTitle}
                          onChange={(e) => setCommentLinkTitle(e.target.value)}
                          placeholder="Título do link"
                          className="px-2 py-1 rounded-lg bg-white border border-[#E2D2F5] text-xs"
                        />
                        <input
                          type="text"
                          value={commentLinkUrl}
                          onChange={(e) => setCommentLinkUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddLink('comment');
                            }
                          }}
                          placeholder="https://..."
                          className="px-2 py-1 rounded-lg bg-white border border-[#E2D2F5] text-xs"
                        />
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCommentLinkOpen(false)}
                          className="px-2 py-0.5 text-[11px] text-[#7A689C]"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddLink('comment')}
                          className="px-2.5 py-0.5 rounded-lg bg-[#7A689C] text-white text-[11px] font-bold"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}

                  {commentEmojiOpen && (
                    <div className="p-1.5 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] flex flex-wrap gap-1">
                      {QUICK_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => {
                            insertAtCursor(commentTextareaRef, commentContent, setCommentContent, em);
                            setCommentEmojiOpen(false);
                          }}
                          className="w-6 h-6 rounded-md hover:bg-white flex items-center justify-center text-sm"
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  )}

                  {commentMentionOpen && (
                    <div className="p-1.5 rounded-xl bg-[#FAF7FC] border border-[#E2D2F5] flex flex-wrap gap-1">
                      {commentMentionParticipants.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleAddMention(p, 'comment')}
                          className="px-2 py-0.5 rounded-md bg-white hover:bg-[#F3ECF9] border border-[#E2D2F5] text-[11px] font-bold text-[#2F1534]"
                        >
                          @{p.name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <div className="flex-1 rounded-xl bg-[#FAF7FC] border border-[#E5D7F4] focus-within:border-[#EC2B82] focus-within:bg-white p-2 space-y-1.5">
                      <textarea
                        ref={commentTextareaRef}
                        rows={2}
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSubmitComment(e);
                          }
                        }}
                        placeholder={
                          replyTarget
                            ? `Responder a ${replyTarget.author_name}...`
                            : 'Escreva uma resposta...'
                        }
                        className="w-full bg-transparent text-xs text-[#2F1534] placeholder:text-[#7A689C]/70 focus:outline-none resize-none"
                      />
                      <div className="flex items-center gap-0.5 text-[#6B588C] pt-1 border-t border-[#EFE5F8]">
                        <button
                          type="button"
                          onClick={() =>
                            applyFormatting(
                              commentTextareaRef,
                              commentContent,
                              setCommentContent,
                              'bold'
                            )
                          }
                          title="Negrito"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <Bold className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyFormatting(
                              commentTextareaRef,
                              commentContent,
                              setCommentContent,
                              'italic'
                            )
                          }
                          title="Itálico"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <Italic className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            applyFormatting(
                              commentTextareaRef,
                              commentContent,
                              setCommentContent,
                              'list'
                            )
                          }
                          title="Lista"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <List className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCommentEmojiOpen((v) => !v);
                            setCommentLinkOpen(false);
                            setCommentMentionOpen(false);
                          }}
                          title="Emoji"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <Smile className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={uploadingCommentFile}
                          onClick={() => commentFileInputRef.current?.click()}
                          title="Anexar arquivo ou imagem"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <Paperclip className="w-3 h-3" />
                        </button>
                        <input
                          ref={commentFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={(e) => handleUploadFile(e, 'comment')}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCommentLinkOpen((v) => !v);
                            setCommentEmojiOpen(false);
                            setCommentMentionOpen(false);
                          }}
                          title="Inserir link"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <Link2 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCommentMentionOpen((v) => !v);
                            setCommentEmojiOpen(false);
                            setCommentLinkOpen(false);
                          }}
                          title="Mencionar participante"
                          className="p-1 rounded hover:bg-[#F3ECF9]"
                        >
                          <AtSign className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={
                        submittingComment ||
                        uploadingCommentFile ||
                        (!commentContent.trim() &&
                          commentAttachments.length === 0 &&
                          commentLinks.length === 0)
                      }
                      title="Enviar resposta"
                      className="w-10 h-10 rounded-xl bg-[#EC2B82] hover:bg-[#D52172] text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-50"
                    >
                      {submittingComment ? (
                        <Check className="w-4 h-4 animate-pulse" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
