import React, { useEffect, useState } from 'react';
import { ArrowLeft, LogOut, Sparkles } from 'lucide-react';
import { api } from '../lib/api.ts';
import {
  Board,
  BoardColumn,
  Card,
  Client,
  MuralPost,
  User,
} from '../types/aumi.ts';
import { AumiWordmark } from './AumiBrand.tsx';
import { ProjectPortalShell } from './ProjectPortalShell.tsx';
import { StudioLabelItem } from './LabelsManagerModal.tsx';

interface ClientExternalPortalProps {
  user: User;
  previewClientId?: string | null;
  initialCopyToken?: string | null;
  initialBoardId?: string | null;
  onClearCopyToken?: () => void;
  onClearBoardToken?: () => void;
  onExitPreview?: () => void;
  onLogout: () => void;
}

interface PortalOverviewData {
  client: Client;
  boards: Board[];
  columns: BoardColumn[];
  cards: Card[];
  mural: MuralPost[];
  board_mural?: MuralPost[];
  labels?: StudioLabelItem[];
  partners: Array<{
    id: string;
    name: string;
    partner_key: string;
    avatar_url: string | null;
    title: string;
  }>;
  portal_defaults: {
    welcome_message?: string;
    allow_client_comments?: boolean;
    allow_client_uploads?: boolean;
    allow_client_approvals?: boolean;
    show_mural_to_clients?: boolean;
  };
}

export function ClientExternalPortal({
  user,
  previewClientId,
  initialBoardId,
  onClearBoardToken,
  onExitPreview,
  onLogout,
}: ClientExternalPortalProps) {
  const [data, setData] = useState<PortalOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  async function loadOverview() {
    try {
      const q = previewClientId ? `?client_id=${encodeURIComponent(previewClientId)}` : '';
      const res = await api<PortalOverviewData>(`/client-portal/overview${q}`);
      setData(res);
      if (res.boards.length > 0) {
        setSelectedBoardId((prev) => {
          if (initialBoardId && res.boards.some((b) => b.id === initialBoardId)) return initialBoardId;
          if (prev && res.boards.some((b) => b.id === prev)) return prev;
          return res.boards[0].id;
        });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewClientId]);

  useEffect(() => {
    if (initialBoardId && data?.boards.some((b) => b.id === initialBoardId)) {
      setSelectedBoardId(initialBoardId);
      onClearBoardToken?.();
    }
  }, [initialBoardId, data?.boards, onClearBoardToken]);

  if (loading || !data) {
    return (
      <div className="min-h-screen aumi-wallpaper p-6 flex items-center justify-center">
        <div className="rounded-2xl bg-white/90 border border-[#BC9FE6]/35 px-6 py-4 text-sm font-semibold text-[#2F1534] shadow-sm">
          Carregando seu portal no Aumi Studio...
        </div>
      </div>
    );
  }

  const activeBoardId =
    selectedBoardId && data.boards.some((b) => b.id === selectedBoardId)
      ? selectedBoardId
      : data.boards[0]?.id || '';

  if (!activeBoardId || data.boards.length === 0) {
    return (
      <div className="min-h-screen aumi-wallpaper p-4 sm:p-6 flex flex-col">
        {onExitPreview && (
          <div className="mb-4 rounded-2xl bg-[#2F1534] text-white px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
            <span>
              Pré-visualizando o Portal do Cliente de <strong>{data.client.name}</strong>
            </span>
            <button
              type="button"
              onClick={onExitPreview}
              className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 font-semibold inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao estúdio
            </button>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center">
          <div className="max-w-lg w-full rounded-[28px] bg-white/95 border border-[#BC9FE6]/35 p-8 text-center space-y-4 shadow-xl">
            <div className="flex justify-center">
              <AumiWordmark />
            </div>
            <div className="w-12 h-12 rounded-2xl bg-[#FDF2F6] text-[#EC2B82] flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-[#2F1534]">Olá, {data.client.name}!</h1>
            <p className="text-sm text-[#232122]/65">
              Nenhum projeto compartilhado com você ainda. Assim que a equipe liberar um projeto, todo o painel aparecerá aqui.
            </p>
            {!onExitPreview && (
              <button
                type="button"
                onClick={onLogout}
                className="px-4 py-2 rounded-xl bg-[#FAF7FC] border border-black/10 text-xs font-bold text-[#2F1534] inline-flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5 text-[#EC2B82]" />
                Sair da conta
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full aumi-wallpaper p-2.5 sm:p-4 flex flex-col justify-center">
      <ProjectPortalShell
        boardId={activeBoardId}
        availableBoards={data.boards}
        user={user}
        partners={data.partners as unknown as User[]}
        mode="client"
        portalDefaults={data.portal_defaults}
        onSwitchBoard={(nextBoardId) => {
          setSelectedBoardId(nextBoardId);
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }}
        onExitPreview={onExitPreview}
        onLogout={onLogout}
        onDataChanged={() => loadOverview()}
      />
    </div>
  );
}
