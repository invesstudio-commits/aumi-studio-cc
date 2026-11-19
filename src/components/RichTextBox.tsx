import React, { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Smile,
  Check,
  X,
} from 'lucide-react';

export function sanitizeRichHtml(raw: string): string {
  if (!raw) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return raw.replace(/<[^>]+>/g, '');
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');
  const blocked = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']);
  doc.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (blocked.has(tag)) {
      el.remove();
      return;
    }
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'href') {
        const val = attr.value.trim().toLowerCase();
        if (val && !val.startsWith('http://') && !val.startsWith('https://') && !val.startsWith('mailto:')) {
          el.removeAttribute(attr.name);
        } else {
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        }
      }
    });
  });
  return doc.body.innerHTML;
}

const QUICK_EMOJIS = ['✨', '💜', '🩷', '✅', '📌', '🎨', '📸', '📝', '🚀', '💬', '📅', '⚠️'];

interface RichTextBoxProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeightClass?: string;
}

export function RichTextBox({
  value,
  onChange,
  placeholder = 'Escreva aqui...',
  readOnly = false,
  minHeightClass = 'min-h-[120px]',
}: RichTextBoxProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [textSize, setTextSize] = useState<'sm' | 'base' | 'lg'>('sm');

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value]);

  function exec(cmd: string, val?: string) {
    if (readOnly) return;
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }

  function handleInsertLink(e: React.FormEvent) {
    e.preventDefault();
    const clean = linkUrl.trim();
    if (!clean) {
      setLinkOpen(false);
      return;
    }
    const normalized = clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
    exec('createLink', normalized);
    setLinkUrl('');
    setLinkOpen(false);
  }

  if (readOnly) {
    return (
      <div
        className={`rounded-xl border border-black/[0.08] bg-[#FCF9FE]/60 px-3.5 py-2.5 text-sm text-[#232122] aumi-copy-prose ${minHeightClass}`}
        dangerouslySetInnerHTML={{
          __html: value ? sanitizeRichHtml(value) : `<span class="text-[#232122]/40">${placeholder}</span>`,
        }}
      />
    );
  }

  return (
    <div className="rounded-xl border border-black/[0.11] bg-white overflow-visible focus-within:border-[#EC2B82] transition-colors">
      {/* Toolbar matching Reference Image 1 */}
      <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 border-b border-black/[0.07] bg-[#FAF7FC]/80 rounded-t-xl">
        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={() => exec('bold')}
            title="Negrito"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('italic')}
            title="Itálico"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('underline')}
            title="Sublinhado"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('strikeThrough')}
            title="Tachado"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-black/10 mx-1" />

          <button
            type="button"
            onClick={() => exec('formatBlock', 'H1')}
            title="Título 1"
            className="px-1.5 h-7 rounded-lg hover:bg-black/[0.06] text-[11px] font-bold text-[#2F1534]"
          >
            H1
          </button>
          <button
            type="button"
            onClick={() => exec('formatBlock', 'H2')}
            title="Título 2"
            className="px-1.5 h-7 rounded-lg hover:bg-black/[0.06] text-[11px] font-bold text-[#2F1534]"
          >
            H2
          </button>
          <button
            type="button"
            onClick={() => exec('insertUnorderedList')}
            title="Lista"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => exec('insertOrderedList')}
            title="Lista numerada"
            className="w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center text-[#2F1534]"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>

          <span className="h-4 w-px bg-black/10 mx-1" />

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setLinkOpen((v) => !v);
                setEmojiOpen(false);
              }}
              title="Inserir link"
              className={`w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center ${
                linkOpen ? 'bg-[#FDF2F6] text-[#EC2B82]' : 'text-[#2F1534]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
            </button>
            {linkOpen && (
              <form
                onSubmit={handleInsertLink}
                className="absolute left-0 top-8 z-30 w-64 p-2 rounded-xl bg-white border border-black/12 shadow-lg flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-2 py-1 rounded-lg border border-black/12 text-xs focus:outline-none focus:border-[#EC2B82]"
                />
                <button
                  type="submit"
                  className="w-6 h-6 rounded-lg bg-[#EC2B82] text-white flex items-center justify-center shrink-0"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setLinkOpen(false)}
                  className="w-6 h-6 rounded-lg hover:bg-black/5 text-[#232122]/60 flex items-center justify-center shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </form>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setEmojiOpen((v) => !v);
                setLinkOpen(false);
              }}
              title="Inserir emoji"
              className={`w-7 h-7 rounded-lg hover:bg-black/[0.06] flex items-center justify-center ${
                emojiOpen ? 'bg-[#F3ECF9] text-[#7A689C]' : 'text-[#2F1534]'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
            </button>
            {emojiOpen && (
              <div className="absolute left-0 top-8 z-30 p-2 rounded-xl bg-white border border-black/12 shadow-lg grid grid-cols-6 gap-1 w-48">
                {QUICK_EMOJIS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => {
                      exec('insertText', em);
                      setEmojiOpen(false);
                    }}
                    className="w-7 h-7 rounded-lg hover:bg-[#F3ECF9] flex items-center justify-center text-sm"
                  >
                    {em}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setTextSize((prev) => (prev === 'sm' ? 'base' : prev === 'base' ? 'lg' : 'sm'))}
          title="Alternar tamanho de leitura"
          className="px-2 h-7 rounded-lg hover:bg-black/[0.06] text-xs font-semibold text-[#7A689C]"
        >
          Aa
        </button>
      </div>

      {/* Editable Content Area */}
      <div className="relative">
        {!value && (
          <div className="pointer-events-none absolute left-3.5 top-2.5 text-sm text-[#232122]/35">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={() => {
            if (editorRef.current) {
              const html = editorRef.current.innerHTML;
              onChange(html === '<br>' ? '' : html);
            }
          }}
          className={`px-3.5 py-2.5 focus:outline-none aumi-copy-prose ${minHeightClass} ${
            textSize === 'lg' ? 'text-base' : textSize === 'base' ? 'text-[15px]' : 'text-sm'
          } text-[#232122]`}
        />
      </div>
    </div>
  );
}
