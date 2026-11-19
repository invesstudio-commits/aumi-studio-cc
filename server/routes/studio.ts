import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { db, DEFAULT_CARD_MINI_UPDATES, logActivity, uid, uploadsDir } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner, requirePermission, sanitizeUser } from '../middleware.ts';
import { addRealtimeClient, broadcastRealtime, removeRealtimeClient } from '../realtime.ts';
import { DbUser, PartnerPermissions } from '../types.ts';

const router = Router();

function safeParseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getUserMetaMap(): Map<string, { avatar_url: string | null; partner_key: string | null; role: string }> {
  const rows = db
    .prepare('SELECT id, avatar_url, partner_key, role FROM users')
    .all() as Array<{ id: string; avatar_url: string | null; partner_key: string | null; role: string }>;
  const map = new Map<string, { avatar_url: string | null; partner_key: string | null; role: string }>();
  for (const r of rows) {
    map.set(r.id, { avatar_url: r.avatar_url, partner_key: r.partner_key, role: r.role });
  }
  return map;
}

function formatMuralCommentsForPost(
  postId: string,
  isClientView: boolean,
  userMap?: Map<string, { avatar_url: string | null; partner_key: string | null; role: string }>
) {
  const users = userMap || getUserMetaMap();
  const rows = (
    isClientView
      ? db
          .prepare("SELECT * FROM mural_comments WHERE post_id = ? AND visibility != 'internal' ORDER BY created_at ASC")
          .all(postId)
      : db.prepare('SELECT * FROM mural_comments WHERE post_id = ? ORDER BY created_at ASC').all(postId)
  ) as Array<Record<string, unknown>>;

  return rows.map((c) => {
    const meta = users.get(String(c.author_id || ''));
    return {
      id: String(c.id),
      post_id: String(c.post_id),
      parent_comment_id: c.parent_comment_id ? String(c.parent_comment_id) : null,
      author_id: String(c.author_id),
      author_name: String(c.author_name),
      author_role: String(c.author_role || meta?.role || 'partner'),
      author_avatar: meta?.avatar_url || null,
      author_partner_key: meta?.partner_key || null,
      content: String(c.content || ''),
      visibility: c.visibility === 'internal' ? 'internal' : 'shared',
      attachments: safeParseJson<Array<Record<string, unknown>>>(c.attachments_json, []),
      links: safeParseJson<Array<Record<string, unknown>>>(c.links_json, []),
      mentions: safeParseJson<Array<Record<string, unknown>>>(c.mentions_json, []),
      reactions: safeParseJson<Array<Record<string, unknown>>>(c.reactions_json, []),
      created_at: String(c.created_at),
    };
  });
}

function formatMuralPost(
  row: Record<string, unknown>,
  options?: { isClientView?: boolean; userMap?: Map<string, { avatar_url: string | null; partner_key: string | null; role: string }> }
) {
  const isClientView = Boolean(options?.isClientView);
  const users = options?.userMap || getUserMetaMap();
  const readBy = safeParseJson<unknown[]>(row.read_by_json, []).map(String);
  const likes = safeParseJson<unknown[]>(row.likes_json, []).map(String);
  const attachments = safeParseJson<Array<Record<string, unknown>>>(row.attachments_json, []);
  const links = safeParseJson<Array<Record<string, unknown>>>(row.links_json, []);
  const mentions = safeParseJson<Array<Record<string, unknown>>>(row.mentions_json, []);
  const authorMeta = users.get(String(row.author_id || ''));
  const comments = formatMuralCommentsForPost(String(row.id), isClientView, users);

  return {
    ...row,
    author_avatar: authorMeta?.avatar_url || null,
    author_partner_key: authorMeta?.partner_key || null,
    author_role: authorMeta?.role || 'partner',
    read_by: readBy,
    likes,
    likes_count: likes.length,
    attachments,
    links,
    mentions,
    comments,
    comments_count: comments.length,
  };
}

function notifyUsers(
  userIds: string[],
  type: string,
  title: string,
  message: string,
  linkTab: string | null,
  linkEntityId: string | null
) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return;
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO notifications (id, target_user_id, type, title, message, link_tab, link_entity_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  for (const targetId of uniqueIds) {
    stmt.run(uid('ntf'), targetId, type, title, message, linkTab, linkEntityId, now);
  }
  broadcastRealtime({
    type: 'notification_created',
    targetUserIds: uniqueIds,
    summary: title,
  });
}

function getEnrichedNotificationsForUser(userId: string, limit = 60) {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE target_user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as Array<Record<string, unknown>>;

  const boardLookupStmt = db.prepare(`
    SELECT b.id, b.title, b.portal_owner, c.name as client_name
    FROM boards b
    LEFT JOIN clients c ON c.id = b.client_id
    WHERE b.id = ?
  `);
  const cardBoardLookupStmt = db.prepare(`
    SELECT b.id, b.title, b.portal_owner, c.name as client_name
    FROM cards cd
    JOIN boards b ON b.id = cd.board_id
    LEFT JOIN clients c ON c.id = b.client_id
    WHERE cd.id = ?
  `);

  return rows.map((row) => {
    const typeStr = String(row.type || '').toLowerCase();
    const linkTab = row.link_tab ? String(row.link_tab) : null;
    const linkId = row.link_entity_id ? String(row.link_entity_id) : null;
    let boardMeta: { id: string; title: string; portal_owner: string; client_name: string | null } | undefined;
    if (
      linkId &&
      (linkTab === 'portal' ||
        typeStr.includes('approval') ||
        typeStr.includes('card') ||
        typeStr.includes('portal') ||
        typeStr.includes('content'))
    ) {
      boardMeta = boardLookupStmt.get(linkId) as typeof boardMeta;
      if (!boardMeta) {
        boardMeta = cardBoardLookupStmt.get(linkId) as typeof boardMeta;
      }
    }

    let category: 'portal' | 'sistema' | 'socias' = 'sistema';
    if (
      typeStr.includes('partner_chat') ||
      typeStr.includes('postit') ||
      typeStr.includes('studio_demand') ||
      (typeStr.includes('mural') && linkTab !== 'portal' && !boardMeta)
    ) {
      category = 'socias';
    } else if (
      linkTab === 'portal' ||
      Boolean(boardMeta) ||
      typeStr.includes('portal') ||
      typeStr.includes('approval') ||
      typeStr.includes('client') ||
      typeStr.includes('card_mini_update') ||
      typeStr.includes('content_submitted')
    ) {
      category = 'portal';
    }

    let originLabel = 'Sistema · Aumi Studio';
    if (typeStr.includes('partner_chat')) {
      originLabel = 'Chat Interno · Sócias';
    } else if (typeStr.includes('postit')) {
      originLabel = 'Post-its Compartilhados';
    } else if (typeStr.includes('studio_demand')) {
      originLabel = 'Demandas · Sócias';
    } else if (category === 'portal') {
      const targetName = boardMeta?.client_name || boardMeta?.title;
      originLabel = targetName ? `Portal do Cliente · ${targetName}` : 'Portal do Cliente';
    } else if (linkTab === 'financeiro' || typeStr.includes('finance')) {
      originLabel = 'Sistema · Financeiro';
    } else if (linkTab === 'clientes') {
      originLabel = 'Sistema · Clientes';
    } else if (linkTab === 'servicos') {
      originLabel = 'Sistema · Serviços';
    } else if (linkTab === 'sociedade') {
      originLabel = 'Sistema · Sociedade';
    } else if (typeStr.includes('event') || typeStr.includes('deadline')) {
      originLabel = 'Sistema · Compromissos';
    } else if (typeStr.includes('mural')) {
      originLabel = 'Interação · Sócias';
    }

    return {
      ...row,
      board_id: boardMeta?.id || null,
      board_title: boardMeta?.title || null,
      portal_owner: boardMeta?.portal_owner || null,
      client_name: boardMeta?.client_name || null,
      category,
      origin_label: originLabel,
    };
  });
}

function getFormattedChatMessages(
  userMap?: Map<string, { avatar_url: string | null; partner_key: string | null; role: string }>,
  limit = 100
) {
  const users = userMap || getUserMetaMap();
  const rows = db
    .prepare('SELECT * FROM studio_chat_messages ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;

  return rows.reverse().map((r) => {
    const meta = users.get(String(r.sender_id || ''));
    return {
      id: String(r.id),
      sender_id: String(r.sender_id),
      sender_name: String(r.sender_name),
      sender_avatar: meta?.avatar_url || null,
      sender_partner_key: (meta?.partner_key as 'ingrid' | 'mariana' | null) || null,
      content: String(r.content || ''),
      created_at: String(r.created_at),
    };
  });
}

function getFormattedPostIts(
  userMap?: Map<string, { avatar_url: string | null; partner_key: string | null; role: string }>
) {
  const users = userMap || getUserMetaMap();
  const rows = db
    .prepare("SELECT * FROM studio_postits ORDER BY CASE owner_key WHEN 'ingrid' THEN 0 ELSE 1 END ASC")
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const meta = users.get(String(r.owner_user_id || ''));
    let strokes: unknown[] = [];
    try {
      const parsed = JSON.parse(String(r.strokes_json || '[]'));
      if (Array.isArray(parsed)) strokes = parsed;
    } catch {
      strokes = [];
    }
    return {
      owner_key: String(r.owner_key) as 'ingrid' | 'mariana',
      owner_user_id: String(r.owner_user_id),
      owner_name: String(r.owner_name),
      owner_avatar: meta?.avatar_url || null,
      bg_color: String(r.bg_color || '#FCF6EC'),
      text_html: String(r.text_html || ''),
      strokes,
      updated_by: String(r.updated_by || r.owner_name || ''),
      updated_at: String(r.updated_at),
    };
  });
}

function formatStudioDemand(
  row: Record<string, unknown>,
  userMap?: Map<string, { avatar_url: string | null; partner_key: string | null; role: string }>
) {
  const users = userMap || getUserMetaMap();
  const senderMeta = users.get(String(row.sender_id || ''));
  const assigneeMeta = users.get(String(row.assignee_id || ''));
  const repliesRows = db
    .prepare('SELECT * FROM studio_demand_replies WHERE demand_id = ? ORDER BY created_at ASC')
    .all(String(row.id)) as Array<Record<string, unknown>>;

  const replies = repliesRows.map((r) => {
    const meta = users.get(String(r.author_id || ''));
    return {
      id: String(r.id),
      demand_id: String(r.demand_id),
      author_id: String(r.author_id),
      author_name: String(r.author_name),
      author_avatar: meta?.avatar_url || null,
      author_partner_key: meta?.partner_key || null,
      content: String(r.content || ''),
      created_at: String(r.created_at),
    };
  });

  return {
    id: String(row.id),
    title: String(row.title || ''),
    description: String(row.description || ''),
    sender_id: String(row.sender_id),
    sender_name: String(row.sender_name),
    sender_avatar: senderMeta?.avatar_url || null,
    sender_partner_key: senderMeta?.partner_key || null,
    assignee_id: String(row.assignee_id),
    assignee_name: String(row.assignee_name),
    assignee_avatar: assigneeMeta?.avatar_url || null,
    assignee_partner_key: assigneeMeta?.partner_key || null,
    status: String(row.status || 'pendente'),
    priority: String(row.priority || 'normal'),
    due_date: row.due_date ? String(row.due_date) : null,
    board_id: row.board_id ? String(row.board_id) : null,
    board_title: row.board_title ? String(row.board_title) : null,
    portal_owner: row.portal_owner ? String(row.portal_owner) : null,
    replies,
    replies_count: replies.length,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function canUserAccessMuralPost(user: NonNullable<AuthRequest['user']>, post: Record<string, unknown>): boolean {
  if (user.role === 'partner') return true;
  if (post.visibility === 'internal') return false;
  if (post.scope === 'board' && post.board_id) {
    const board = db
      .prepare('SELECT client_id, shared_with_client FROM boards WHERE id = ?')
      .get(post.board_id) as { client_id: string; shared_with_client: number } | undefined;
    return Boolean(board && board.client_id === user.client_id && board.shared_with_client);
  }
  if (post.scope === 'client') {
    return !post.client_id || post.client_id === user.client_id;
  }
  return false;
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post('/upload', requireAuth, upload.single('file'), (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }

  res.json({
    filename: req.file.filename,
    original_name: req.file.originalname,
    mime_type: req.file.mimetype,
    size_bytes: req.file.size,
    file_url: `/uploads/${req.file.filename}`,
  });
});

router.get('/dashboard', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const boardsInProgressList = db
    .prepare(`
      SELECT b.id, b.title, b.portal_owner, b.deadline, b.status, c.name as client_name,
             (SELECT COUNT(*) FROM cards ca WHERE ca.board_id = b.id) as total_cards,
             (SELECT COUNT(*) FROM cards ca JOIN board_columns col ON col.id = ca.column_id WHERE ca.board_id = b.id AND LOWER(col.title) LIKE '%conclu%') as completed_cards
      FROM boards b
      JOIN clients c ON c.id = b.client_id
      WHERE b.status = 'active'
      ORDER BY b.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const approvalCardsList = db
    .prepare(`
      SELECT c.id, c.title, c.board_id, c.due_date, c.priority, c.approval_status, b.title as board_title, b.portal_owner, cl.name as client_name, col.title as column_title
      FROM cards c
      JOIN boards b ON b.id = c.board_id
      JOIN clients cl ON cl.id = b.client_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE b.status = 'active'
        AND (c.approval_status = 'pending' OR LOWER(col.title) LIKE '%aprova%')
      ORDER BY c.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const boardsAwaitingApproval = new Set(approvalCardsList.map((r) => String(r.board_id))).size;

  const todayStr = new Date().toISOString().slice(0, 10);
  const next7DaysStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const upcomingDeadlinesList = db
    .prepare(`
      SELECT c.id, c.title, c.due_date, c.priority, c.board_id, b.title as board_title, b.portal_owner, cl.name as client_name, col.title as column_title, c.lead_user_id
      FROM cards c
      JOIN boards b ON b.id = c.board_id
      JOIN clients cl ON cl.id = b.client_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE b.status = 'active'
        AND LOWER(col.title) NOT LIKE '%conclu%'
        AND c.due_date IS NOT NULL
        AND c.due_date != ''
        AND c.due_date <= ?
      ORDER BY c.due_date ASC
    `)
    .all(next7DaysStr) as Array<Record<string, unknown>>;

  const upcomingDeliverables = upcomingDeadlinesList.slice(0, 8);

  const pendingTasksList = db
    .prepare(`
      SELECT c.id, c.title, c.due_date, c.priority, c.board_id, c.content_status, b.title as board_title, b.portal_owner, cl.name as client_name, col.title as column_title
      FROM cards c
      JOIN boards b ON b.id = c.board_id
      JOIN clients cl ON cl.id = b.client_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE b.status = 'active' AND LOWER(col.title) NOT LIKE '%conclu%'
      ORDER BY CASE WHEN c.due_date IS NULL OR c.due_date = '' THEN 1 ELSE 0 END, c.due_date ASC, c.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const activeClientsList = db
    .prepare(`
      SELECT DISTINCT cl.id, cl.name, cl.company, cl.owner_partner, cl.status,
             (SELECT COUNT(*) FROM boards b2 WHERE b2.client_id = cl.id AND b2.status = 'active') as active_boards_count
      FROM clients cl
      JOIN boards b ON b.client_id = cl.id
      WHERE b.status IN ('active', 'draft')
      ORDER BY cl.name ASC
    `)
    .all() as Array<Record<string, unknown>>;

  const totalClientsCount = (db.prepare('SELECT COUNT(*) as c FROM clients').get() as { c: number }).c;

  const monthStart = new Date().toISOString().slice(0, 7) + '-01';
  const paidIncome = (
    db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'income' AND status = 'paid'").get() as { s: number }
  ).s;
  const paidExpense = (
    db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'expense' AND status = 'paid'").get() as { s: number }
  ).s;
  const pendingReceivable = (
    db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'income' AND status IN ('pending', 'overdue')").get() as { s: number }
  ).s;
  const monthIncome = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'income' AND status = 'paid' AND entry_date >= ?")
      .get(monthStart) as { s: number }
  ).s;

  const upcomingReceivables = db
    .prepare(`
      SELECT f.id, f.description, f.amount, f.due_date, f.status, c.name as client_name
      FROM finance_entries f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.type = 'income' AND f.status IN ('pending', 'overdue')
      ORDER BY COALESCE(f.due_date, f.entry_date) ASC
      LIMIT 5
    `)
    .all();

  const upcomingPayables = db
    .prepare(`
      SELECT f.id, f.description, f.amount, f.due_date, f.status, c.name as client_name
      FROM finance_entries f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.type = 'expense' AND f.status IN ('pending', 'overdue')
      ORDER BY COALESCE(f.due_date, f.entry_date) ASC
      LIMIT 5
    `)
    .all();

  const recentActivities = db
    .prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 12')
    .all();

  const studioUserMap = getUserMetaMap();
  const muralPosts = (
    db
      .prepare("SELECT * FROM mural_posts WHERE scope = 'studio' ORDER BY pinned DESC, created_at DESC LIMIT 30")
      .all() as Array<Record<string, unknown>>
  ).map((row) => formatMuralPost(row, { isClientView: false, userMap: studioUserMap }));

  const unreadNotifications = (
    db.prepare('SELECT COUNT(*) as c FROM notifications WHERE target_user_id = ? AND is_read = 0').get(user.id) as { c: number }
  ).c;

  const boardsCompletedList = db
    .prepare(`
      SELECT b.id, b.title, b.portal_owner, b.deadline, b.status, c.name as client_name, b.updated_at
      FROM boards b
      JOIN clients c ON c.id = b.client_id
      WHERE b.status = 'completed'
      ORDER BY b.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const partnerBoardsSummary = {
    ingrid: (db.prepare("SELECT COUNT(*) as c FROM boards WHERE portal_owner = 'ingrid' AND status != 'archived'").get() as { c: number }).c,
    mariana: (db.prepare("SELECT COUNT(*) as c FROM boards WHERE portal_owner = 'mariana' AND status != 'archived'").get() as { c: number }).c,
  };

  const partnerRows = db
    .prepare("SELECT id, name, partner_key, avatar_url, title, last_seen_at FROM users WHERE role = 'partner' ORDER BY partner_key ASC")
    .all() as Array<{ id: string; name: string; partner_key: string; avatar_url: string | null; title: string; last_seen_at: string | null }>;

  const nowMs = Date.now();
  const partnerStatus = partnerRows.map((p) => {
    const activeBoards = (
      db.prepare("SELECT COUNT(*) as c FROM boards WHERE portal_owner = ? AND status = 'active'").get(p.partner_key) as { c: number }
    ).c;
    const pendingCards = (
      db
        .prepare(`
          SELECT COUNT(*) as c
          FROM cards c
          JOIN boards b ON b.id = c.board_id
          JOIN board_columns col ON col.id = c.column_id
          WHERE b.status = 'active' AND (c.lead_user_id = ? OR c.collaborator_user_id = ?) AND LOWER(col.title) NOT LIKE '%conclu%'
        `)
        .get(p.id, p.id) as { c: number }
    ).c;
    const clientsCount = (
      db.prepare("SELECT COUNT(*) as c FROM clients WHERE owner_partner = ? AND status != 'archived'").get(p.partner_key) as { c: number }
    ).c;
    const lastSeenMs = p.last_seen_at ? new Date(p.last_seen_at).getTime() : 0;
    const isOnline = lastSeenMs > 0 && nowMs - lastSeenMs < 2 * 60 * 1000;
    return {
      ...p,
      is_online: isOnline,
      active_boards: activeBoards,
      pending_cards: pendingCards,
      clients_count: clientsCount,
    };
  });

  const upcomingEvents = db
    .prepare(`
      SELECT e.*, cl.name as client_name, b.title as board_title
      FROM studio_events e
      LEFT JOIN clients cl ON cl.id = e.client_id
      LEFT JOIN boards b ON b.id = e.board_id
      ORDER BY e.event_date ASC, e.event_time ASC
      LIMIT 60
    `)
    .all();

  const calendarDeadlines = db
    .prepare(`
      SELECT c.id, c.title, c.due_date, c.priority, c.board_id, b.title as board_title, b.portal_owner, cl.name as client_name, col.title as column_title
      FROM cards c
      JOIN boards b ON b.id = c.board_id
      JOIN clients cl ON cl.id = b.client_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE b.status = 'active'
        AND LOWER(col.title) NOT LIKE '%conclu%'
        AND c.due_date IS NOT NULL
        AND c.due_date != ''
      ORDER BY c.due_date ASC
      LIMIT 80
    `)
    .all();

  res.json({
    metrics: {
      boards_in_progress: boardsInProgressList.length,
      boards_awaiting_approval: boardsAwaitingApproval,
      boards_completed: boardsCompletedList.length,
      upcoming_deadlines_count: upcomingDeadlinesList.length,
      pending_tasks: pendingTasksList.length,
      active_clients: activeClientsList.length,
      total_clients: totalClientsCount,
      today: todayStr,
    },
    drilldowns: {
      boards_in_progress: boardsInProgressList,
      approval_cards: approvalCardsList,
      boards_completed: boardsCompletedList,
      upcoming_deadlines: upcomingDeadlinesList,
      pending_tasks: pendingTasksList.slice(0, 60),
      active_clients: activeClientsList,
    },
    finance_summary: {
      balance: paidIncome - paidExpense,
      month_income: monthIncome,
      pending_receivable: pendingReceivable,
      total_expense: paidExpense,
      upcoming_receivables: upcomingReceivables,
      upcoming_payables: upcomingPayables,
    },
    upcoming_deliverables: upcomingDeliverables,
    upcoming_events: upcomingEvents,
    calendar_deadlines: calendarDeadlines,
    recent_activities: recentActivities,
    mural_posts: muralPosts,
    unread_notifications: unreadNotifications,
    partner_boards_summary: partnerBoardsSummary,
    partner_status: partnerStatus,
  });
});

router.get('/mural', requireAuth, (req: AuthRequest, res) => {
  const scope = (req.query.scope as string) || 'studio';
  const clientId = req.query.client_id as string | undefined;
  const boardId = req.query.board_id as string | undefined;
  const userMap = getUserMetaMap();

  if (req.user!.role === 'client') {
    if (scope === 'board' && boardId) {
      const board = db
        .prepare('SELECT id, client_id, shared_with_client FROM boards WHERE id = ?')
        .get(boardId) as { id: string; client_id: string; shared_with_client: number } | undefined;
      if (!board || board.client_id !== req.user!.client_id || !board.shared_with_client) {
        res.status(403).json({ error: 'Sem permissão para acessar o mural deste quadro.' });
        return;
      }
      const posts = (
        db
          .prepare("SELECT * FROM mural_posts WHERE scope = 'board' AND board_id = ? AND visibility != 'internal' ORDER BY pinned DESC, created_at DESC")
          .all(boardId) as Array<Record<string, unknown>>
      ).map((r) => formatMuralPost(r, { isClientView: true, userMap }));
      res.json({ posts });
      return;
    }

    const posts = (
      db
        .prepare("SELECT * FROM mural_posts WHERE scope = 'client' AND (client_id IS NULL OR client_id = ?) AND visibility != 'internal' ORDER BY pinned DESC, created_at DESC")
        .all(req.user!.client_id) as Array<Record<string, unknown>>
    ).map((r) => formatMuralPost(r, { isClientView: true, userMap }));
    res.json({ posts });
    return;
  }

  if (scope === 'board' && boardId) {
    const asClient = req.query.as_client === '1';
    const sql = asClient
      ? "SELECT * FROM mural_posts WHERE scope = 'board' AND board_id = ? AND visibility != 'internal' ORDER BY pinned DESC, created_at DESC"
      : "SELECT * FROM mural_posts WHERE scope = 'board' AND board_id = ? ORDER BY pinned DESC, created_at DESC";
    const posts = (db.prepare(sql).all(boardId) as Array<Record<string, unknown>>).map((r) =>
      formatMuralPost(r, { isClientView: asClient, userMap })
    );
    res.json({ posts });
    return;
  }

  if (scope === 'client' && clientId) {
    const posts = (
      db
        .prepare("SELECT * FROM mural_posts WHERE scope = 'client' AND (client_id IS NULL OR client_id = ?) ORDER BY pinned DESC, created_at DESC")
        .all(clientId) as Array<Record<string, unknown>>
    ).map((r) => formatMuralPost(r, { isClientView: false, userMap }));
    res.json({ posts });
    return;
  }

  const posts = (
    db
      .prepare('SELECT * FROM mural_posts WHERE scope = ? ORDER BY pinned DESC, created_at DESC')
      .all(scope) as Array<Record<string, unknown>>
  ).map((r) => formatMuralPost(r, { isClientView: false, userMap }));
  res.json({ posts });
});

router.post('/mural', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const {
    scope,
    board_id,
    client_id,
    title,
    content,
    pinned,
    color,
    visibility,
    priority,
    attachments,
    links,
    mentions,
  } = req.body as {
    scope?: string;
    board_id?: string;
    client_id?: string;
    title?: string;
    content?: string;
    pinned?: boolean;
    color?: string;
    visibility?: 'shared' | 'internal';
    priority?: 'normal' | 'high';
    attachments?: Array<Record<string, unknown>>;
    links?: Array<Record<string, unknown>>;
    mentions?: Array<{ user_id: string; name: string }>;
  };

  const targetScope = scope || 'studio';
  const cleanContent = String(content || '').trim();
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const safeLinks = Array.isArray(links) ? links : [];
  const safeMentions = Array.isArray(mentions) ? mentions : [];

  if (!cleanContent && safeAttachments.length === 0 && safeLinks.length === 0) {
    res.status(400).json({ error: 'Escreva uma mensagem ou adicione um anexo/link para publicar.' });
    return;
  }

  if (user.role === 'client') {
    if (targetScope !== 'board' || !board_id) {
      res.status(403).json({ error: 'Sem permissão para publicar neste mural.' });
      return;
    }
    const board = db
      .prepare('SELECT id, client_id, shared_with_client FROM boards WHERE id = ?')
      .get(board_id) as { id: string; client_id: string; shared_with_client: number } | undefined;
    if (!board || board.client_id !== user.client_id || !board.shared_with_client) {
      res.status(403).json({ error: 'Sem permissão para publicar neste projeto.' });
      return;
    }
  } else if (targetScope === 'board' && !board_id) {
    res.status(400).json({ error: 'Informe o quadro para publicar no mural contextual.' });
    return;
  }

  const resolvedVisibility = user.role === 'client' ? 'shared' : visibility === 'internal' ? 'internal' : 'shared';
  const resolvedTitle = String(title || '').trim();
  const resolvedPinned = user.role === 'client' ? 0 : pinned ? 1 : 0;
  const resolvedPriority = user.role === 'client' ? 'normal' : priority === 'high' ? 'high' : 'normal';

  let resolvedClientId = client_id || null;
  if (targetScope === 'board' && board_id && !resolvedClientId) {
    const brd = db.prepare('SELECT client_id FROM boards WHERE id = ?').get(board_id) as { client_id: string } | undefined;
    if (brd?.client_id) resolvedClientId = brd.client_id;
  }

  const id = uid('mrl');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO mural_posts (
      id, scope, board_id, client_id, author_id, author_name, title, content,
      pinned, color, visibility, is_auto, event_type, priority, read_by_json,
      attachments_json, links_json, mentions_json, likes_json, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual', ?, ?, ?, ?, ?, '[]', ?)
  `).run(
    id,
    targetScope,
    board_id || null,
    resolvedClientId,
    user.id,
    user.name,
    resolvedTitle,
    cleanContent,
    resolvedPinned,
    color || '#FFFFFF',
    resolvedVisibility,
    resolvedPriority,
    JSON.stringify([user.id]),
    JSON.stringify(safeAttachments),
    JSON.stringify(safeLinks),
    JSON.stringify(safeMentions),
    now
  );

  // Notifications respecting public/internal visibility
  const notifyIds: string[] = [];
  const partnerRows = db.prepare("SELECT id FROM users WHERE role = 'partner' AND active = 1").all() as Array<{ id: string }>;
  for (const p of partnerRows) {
    if (p.id !== user.id) notifyIds.push(p.id);
  }
  if (resolvedVisibility === 'shared' && resolvedClientId) {
    const clientUser = db
      .prepare("SELECT id FROM users WHERE role = 'client' AND client_id = ? AND active = 1")
      .get(resolvedClientId) as { id: string } | undefined;
    if (clientUser && clientUser.id !== user.id) {
      notifyIds.push(clientUser.id);
    }
  }
  for (const m of safeMentions) {
    if (m.user_id && m.user_id !== user.id) {
      if (resolvedVisibility === 'internal') {
        const isPartnerMention = partnerRows.some((p) => p.id === m.user_id);
        if (isPartnerMention) notifyIds.push(m.user_id);
      } else {
        notifyIds.push(m.user_id);
      }
    }
  }

  const plainSnippet = cleanContent.replace(/<[^>]+>/g, '').slice(0, 120) || 'Nova atualização com anexo';
  notifyUsers(
    notifyIds,
    'mural_post',
    resolvedVisibility === 'internal' ? `Nota interna de ${user.name}` : `Nova atualização no mural · ${user.name}`,
    resolvedTitle ? `${resolvedTitle}: ${plainSnippet}` : plainSnippet,
    targetScope === 'board' ? 'portal' : 'inicio',
    board_id || id
  );

  const post = formatMuralPost(db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(id) as Record<string, unknown>, {
    isClientView: user.role === 'client',
  });
  logActivity(
    user.id,
    user.name,
    'create_mural_post',
    'mural',
    id,
    `Publicou no mural (${targetScope}): ${resolvedTitle || plainSnippet.slice(0, 60)}`
  );
  broadcastRealtime({
    type: targetScope === 'board' ? 'portal_activity' : 'mural_updated',
    actorId: user.id,
    scope: targetScope,
    boardId: board_id || null,
    summary: resolvedTitle || plainSnippet.slice(0, 80),
  });
  res.status(201).json({ post });
});

router.post('/mural/:id/mark-read', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { read } = req.body as { read?: boolean };
  const row = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Aviso do mural não encontrado.' });
    return;
  }

  if (user.role === 'client') {
    if (row.visibility === 'internal') {
      res.status(403).json({ error: 'Sem permissão.' });
      return;
    }
    if (row.scope === 'board' && row.board_id) {
      const board = db
        .prepare('SELECT client_id, shared_with_client FROM boards WHERE id = ?')
        .get(row.board_id) as { client_id: string; shared_with_client: number } | undefined;
      if (!board || board.client_id !== user.client_id || !board.shared_with_client) {
        res.status(403).json({ error: 'Sem permissão.' });
        return;
      }
    }
  }

  let readBy: string[] = [];
  if (typeof row.read_by_json === 'string') {
    try {
      const parsed = JSON.parse(row.read_by_json);
      if (Array.isArray(parsed)) readBy = parsed.map(String);
    } catch {
      readBy = [];
    }
  }

  const shouldMarkRead = read !== false;
  const nextReadBy = shouldMarkRead
    ? Array.from(new Set([...readBy, user.id]))
    : readBy.filter((id) => id !== user.id);

  db.prepare('UPDATE mural_posts SET read_by_json = ? WHERE id = ?').run(JSON.stringify(nextReadBy), req.params.id);
  res.json({ ok: true, read_by: nextReadBy });
});

router.post('/mural/mark-all-read', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { board_id, scope } = req.body as { board_id?: string; scope?: string };
  let rows: Array<Record<string, unknown>> = [];

  if (board_id) {
    if (user.role === 'client') {
      const board = db
        .prepare('SELECT client_id, shared_with_client FROM boards WHERE id = ?')
        .get(board_id) as { client_id: string; shared_with_client: number } | undefined;
      if (!board || board.client_id !== user.client_id || !board.shared_with_client) {
        res.status(403).json({ error: 'Sem permissão.' });
        return;
      }
      rows = db
        .prepare("SELECT id, read_by_json FROM mural_posts WHERE scope = 'board' AND board_id = ? AND visibility != 'internal'")
        .all(board_id) as Array<Record<string, unknown>>;
    } else {
      rows = db
        .prepare("SELECT id, read_by_json FROM mural_posts WHERE scope = 'board' AND board_id = ?")
        .all(board_id) as Array<Record<string, unknown>>;
    }
  } else if (scope) {
    rows = db
      .prepare('SELECT id, read_by_json FROM mural_posts WHERE scope = ?')
      .all(scope) as Array<Record<string, unknown>>;
  }

  const upd = db.prepare('UPDATE mural_posts SET read_by_json = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const r of rows) {
      let arr: string[] = [];
      try {
        const p = JSON.parse(String(r.read_by_json || '[]'));
        if (Array.isArray(p)) arr = p.map(String);
      } catch {
        arr = [];
      }
      if (!arr.includes(user.id)) {
        upd.run(JSON.stringify([...arr, user.id]), r.id);
      }
    }
  });
  tx();
  res.json({ ok: true });
});

router.patch('/mural/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { pinned, title, content, color, priority } = req.body as {
    pinned?: boolean;
    title?: string;
    content?: string;
    color?: string;
    priority?: 'normal' | 'high';
  };
  const existing = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Aviso não encontrado.' });
    return;
  }
  db.prepare('UPDATE mural_posts SET pinned = ?, title = ?, content = ?, color = ?, priority = ? WHERE id = ?').run(
    pinned !== undefined ? (pinned ? 1 : 0) : existing.pinned,
    title !== undefined ? title.trim() : existing.title,
    content !== undefined ? content.trim() : existing.content,
    color || existing.color,
    priority === 'high' || priority === 'normal' ? priority : existing.priority,
    req.params.id
  );
  const post = formatMuralPost(db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown>);
  broadcastRealtime({
    type: 'mural_updated',
    actorId: req.user!.id,
    scope: String(existing.scope || 'studio'),
    boardId: existing.board_id ? String(existing.board_id) : null,
  });
  res.json({ post });
});

router.post('/mural/:id/like', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const row = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }
  if (!canUserAccessMuralPost(user, row)) {
    res.status(403).json({ error: 'Sem permissão para interagir com esta publicação.' });
    return;
  }

  const currentLikes = safeParseJson<unknown[]>(row.likes_json, []).map(String);
  const alreadyLiked = currentLikes.includes(user.id);
  const nextLikes = alreadyLiked
    ? currentLikes.filter((uidItem) => uidItem !== user.id)
    : [...currentLikes, user.id];

  db.prepare('UPDATE mural_posts SET likes_json = ? WHERE id = ?').run(JSON.stringify(nextLikes), req.params.id);
  broadcastRealtime({
    type: 'mural_updated',
    actorId: user.id,
    scope: String(row.scope || 'studio'),
    boardId: row.board_id ? String(row.board_id) : null,
  });
  res.json({ ok: true, liked: !alreadyLiked, likes: nextLikes, likes_count: nextLikes.length });
});

router.post('/mural/:id/comments', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const post = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!post) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }
  if (!canUserAccessMuralPost(user, post)) {
    res.status(403).json({ error: 'Sem permissão para comentar nesta publicação.' });
    return;
  }

  const { content, parent_comment_id, visibility, attachments, links, mentions } = req.body as {
    content?: string;
    parent_comment_id?: string | null;
    visibility?: 'shared' | 'internal';
    attachments?: Array<Record<string, unknown>>;
    links?: Array<Record<string, unknown>>;
    mentions?: Array<{ user_id: string; name: string }>;
  };

  const cleanContent = String(content || '').trim();
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const safeLinks = Array.isArray(links) ? links : [];
  const safeMentions = Array.isArray(mentions) ? mentions : [];

  if (!cleanContent && safeAttachments.length === 0 && safeLinks.length === 0) {
    res.status(400).json({ error: 'Escreva um comentário ou adicione um anexo/link.' });
    return;
  }

  let parentComment: Record<string, unknown> | undefined;
  if (parent_comment_id) {
    parentComment = db
      .prepare('SELECT * FROM mural_comments WHERE id = ? AND post_id = ?')
      .get(parent_comment_id, post.id) as Record<string, unknown> | undefined;
    if (!parentComment) {
      res.status(404).json({ error: 'Comentário original não encontrado nesta publicação.' });
      return;
    }
    if (user.role === 'client' && parentComment.visibility === 'internal') {
      res.status(403).json({ error: 'Sem permissão para responder a este comentário.' });
      return;
    }
  }

  const resolvedVisibility =
    user.role === 'client'
      ? 'shared'
      : post.visibility === 'internal' || parentComment?.visibility === 'internal' || visibility === 'internal'
      ? 'internal'
      : 'shared';

  const commentId = uid('mcm');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO mural_comments (
      id, post_id, parent_comment_id, author_id, author_name, author_role,
      content, visibility, attachments_json, links_json, mentions_json, reactions_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
  `).run(
    commentId,
    String(post.id),
    parentComment ? String(parentComment.id) : null,
    user.id,
    user.name,
    user.role,
    cleanContent,
    resolvedVisibility,
    JSON.stringify(safeAttachments),
    JSON.stringify(safeLinks),
    JSON.stringify(safeMentions),
    now
  );

  // Notify authorized participants
  const partnerRows = db.prepare("SELECT id FROM users WHERE role = 'partner' AND active = 1").all() as Array<{ id: string }>;
  const notifyIds: string[] = [];
  for (const p of partnerRows) {
    if (p.id !== user.id) notifyIds.push(p.id);
  }
  if (resolvedVisibility === 'shared') {
    if (post.author_id && String(post.author_id) !== user.id) {
      notifyIds.push(String(post.author_id));
    }
    if (parentComment?.author_id && String(parentComment.author_id) !== user.id) {
      notifyIds.push(String(parentComment.author_id));
    }
    if (post.client_id) {
      const clientUser = db
        .prepare("SELECT id FROM users WHERE role = 'client' AND client_id = ? AND active = 1")
        .get(post.client_id) as { id: string } | undefined;
      if (clientUser && clientUser.id !== user.id) {
        notifyIds.push(clientUser.id);
      }
    }
    for (const m of safeMentions) {
      if (m.user_id && m.user_id !== user.id) notifyIds.push(m.user_id);
    }
  } else {
    for (const m of safeMentions) {
      if (m.user_id && m.user_id !== user.id && partnerRows.some((p) => p.id === m.user_id)) {
        notifyIds.push(m.user_id);
      }
    }
  }

  const plainSnippet = cleanContent.replace(/<[^>]+>/g, '').slice(0, 110) || 'Novo anexo no comentário';
  notifyUsers(
    notifyIds,
    'mural_comment',
    parentComment ? `${user.name} respondeu no mural` : `${user.name} comentou no mural`,
    plainSnippet,
    post.scope === 'board' ? 'portal' : 'inicio',
    String(post.board_id || post.id)
  );

  const comments = formatMuralCommentsForPost(String(post.id), user.role === 'client');
  const created = comments.find((c) => c.id === commentId);
  broadcastRealtime({
    type: post.scope === 'board' ? 'portal_activity' : 'mural_updated',
    actorId: user.id,
    scope: String(post.scope || 'studio'),
    boardId: post.board_id ? String(post.board_id) : null,
  });
  res.status(201).json({ ok: true, comment: created, comments });
});

router.post('/mural/:id/comments/:commentId/react', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { emoji } = (req.body || {}) as { emoji?: string };
  const cleanEmoji = String(emoji || '').trim();
  if (!cleanEmoji) {
    res.status(400).json({ error: 'Emoji inválido.' });
    return;
  }

  const post = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!post || !canUserAccessMuralPost(user, post)) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const comment = db
    .prepare('SELECT * FROM mural_comments WHERE id = ? AND post_id = ?')
    .get(req.params.commentId, req.params.id) as Record<string, unknown> | undefined;
  if (!comment) {
    res.status(404).json({ error: 'Comentário não encontrado.' });
    return;
  }
  if (user.role === 'client' && comment.visibility === 'internal') {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }

  const current = safeParseJson<Array<{ emoji: string; user_id: string; user_name: string; created_at: string }>>(
    comment.reactions_json,
    []
  );
  const existsIdx = current.findIndex((r) => r.emoji === cleanEmoji && r.user_id === user.id);
  const next =
    existsIdx >= 0
      ? current.filter((_, idx) => idx !== existsIdx)
      : [...current, { emoji: cleanEmoji, user_id: user.id, user_name: user.name, created_at: new Date().toISOString() }];

  db.prepare('UPDATE mural_comments SET reactions_json = ? WHERE id = ?').run(JSON.stringify(next), comment.id);
  res.json({ ok: true, reactions: next });
});

router.delete('/mural/:id/comments/:commentId', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const comment = db
    .prepare('SELECT * FROM mural_comments WHERE id = ? AND post_id = ?')
    .get(req.params.commentId, req.params.id) as Record<string, unknown> | undefined;
  if (!comment) {
    res.status(404).json({ error: 'Comentário não encontrado.' });
    return;
  }
  if (user.role === 'client' && String(comment.author_id) !== user.id) {
    res.status(403).json({ error: 'Você só pode excluir seus próprios comentários.' });
    return;
  }
  db.prepare('DELETE FROM mural_comments WHERE id = ? OR parent_comment_id = ?').run(comment.id, comment.id);
  res.json({ ok: true });
});

router.delete('/mural/:id', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM mural_posts WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Publicação não encontrada.' });
    return;
  }
  if (user.role === 'client') {
    if (String(existing.author_id) !== user.id || existing.visibility === 'internal') {
      res.status(403).json({ error: 'Você só pode excluir suas próprias publicações.' });
      return;
    }
  }
  db.prepare('DELETE FROM mural_comments WHERE post_id = ?').run(req.params.id);
  db.prepare('DELETE FROM mural_posts WHERE id = ?').run(req.params.id);
  broadcastRealtime({
    type: 'mural_updated',
    actorId: user.id,
    scope: String(existing.scope || 'studio'),
    boardId: existing.board_id ? String(existing.board_id) : null,
  });
  res.json({ ok: true });
});

// ==================== REAL-TIME SSE STREAM ====================
router.get('/realtime/stream', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const clientId = uid('sse');
  addRealtimeClient(clientId, user.id, user.role, res);
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, userId: user.id })}\n\n`);

  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAlive);
      removeRealtimeClient(clientId);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeRealtimeClient(clientId);
  });
});

// ==================== HOME MURAL SYNC + SHARED PARTNER DEMANDS ====================
router.get('/home-mural/sync', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const userMap = getUserMetaMap();

  const posts = (
    db
      .prepare("SELECT * FROM mural_posts WHERE scope = 'studio' ORDER BY pinned DESC, created_at DESC")
      .all() as Array<Record<string, unknown>>
  ).map((row) => formatMuralPost(row, { isClientView: false, userMap }));

  const demandRows = db
    .prepare(`
      SELECT d.*, b.title as board_title, b.portal_owner
      FROM studio_demands d
      LEFT JOIN boards b ON b.id = d.board_id
      ORDER BY
        CASE d.status WHEN 'concluida' THEN 1 ELSE 0 END ASC,
        CASE d.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END ASC,
        d.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;
  const demands = demandRows.map((r) => formatStudioDemand(r, userMap));

  const notifications = getEnrichedNotificationsForUser(user.id, 60);

  const portalUpdates = db
    .prepare(`
      SELECT mp.id, mp.title, mp.content, mp.author_name, mp.board_id, mp.created_at, mp.event_type,
             b.title as board_title, b.portal_owner, c.name as client_name
      FROM mural_posts mp
      LEFT JOIN boards b ON b.id = mp.board_id
      LEFT JOIN clients c ON c.id = COALESCE(mp.client_id, b.client_id)
      WHERE mp.scope = 'board'
      ORDER BY mp.created_at DESC
      LIMIT 12
    `)
    .all() as Array<Record<string, unknown>>;

  const chatMessages = getFormattedChatMessages(userMap, 100);
  const postits = getFormattedPostIts(userMap);

  res.json({
    posts,
    demands,
    notifications,
    portal_updates: portalUpdates,
    chat_messages: chatMessages,
    postits,
  });
});

// ==================== STUDIO INTERNAL CHAT (INGRID & MARIANA) ====================
router.get('/studio-chat', requireAuth, requirePartner, (_req, res) => {
  res.json({ messages: getFormattedChatMessages(undefined, 120) });
});

router.post('/studio-chat', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const content = String((req.body as { content?: string })?.content || '').trim();
  if (!content) {
    res.status(400).json({ error: 'Digite uma mensagem para enviar.' });
    return;
  }

  const id = uid('cht');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_chat_messages (id, sender_id, sender_name, content, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, user.id, user.name, content.slice(0, 2000), now);

  const otherPartners = db
    .prepare("SELECT id FROM users WHERE role = 'partner' AND id != ?")
    .all(user.id) as Array<{ id: string }>;

  notifyUsers(
    otherPartners.map((p) => p.id),
    'partner_chat',
    `Mensagem de ${user.name}`,
    content.slice(0, 140),
    'inicio',
    'mural-chat'
  );

  broadcastRealtime({
    type: 'chat_message_created',
    actorId: user.id,
    summary: content.slice(0, 80),
  });

  const userMap = getUserMetaMap();
  const meta = userMap.get(user.id);
  res.status(201).json({
    message: {
      id,
      sender_id: user.id,
      sender_name: user.name,
      sender_avatar: meta?.avatar_url || null,
      sender_partner_key: (meta?.partner_key as 'ingrid' | 'mariana' | null) || null,
      content: content.slice(0, 2000),
      created_at: now,
    },
  });
});

router.delete('/studio-chat/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db
    .prepare('SELECT id, sender_id FROM studio_chat_messages WHERE id = ?')
    .get(req.params.id) as { id: string; sender_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Mensagem não encontrada.' });
    return;
  }
  if (existing.sender_id !== user.id) {
    res.status(403).json({ error: 'Você só pode excluir suas próprias mensagens.' });
    return;
  }
  db.prepare('DELETE FROM studio_chat_messages WHERE id = ?').run(req.params.id);
  broadcastRealtime({
    type: 'chat_message_deleted',
    actorId: user.id,
  });
  res.json({ ok: true });
});

// ==================== SHARED PARTNER POST-ITS (INGRID & MARIANA) ====================
const lastPostItNotifyByPartner = new Map<string, number>();

router.get('/studio-postits', requireAuth, requirePartner, (_req, res) => {
  res.json({ postits: getFormattedPostIts() });
});

router.put('/studio-postits/:ownerKey', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const ownerKey = req.params.ownerKey;
  if (ownerKey !== 'ingrid' && ownerKey !== 'mariana') {
    res.status(400).json({ error: 'Post-it inválido.' });
    return;
  }
  if (user.partner_key !== ownerKey) {
    res.status(403).json({ error: 'Cada integrante pode editar apenas o seu próprio post-it.' });
    return;
  }

  const body = req.body as {
    bg_color?: string;
    text_html?: string;
    strokes?: unknown[];
  };

  const existing = db
    .prepare('SELECT * FROM studio_postits WHERE owner_key = ?')
    .get(ownerKey) as Record<string, unknown> | undefined;

  const allowedColors = ['#FCF6EC', '#FDEBF3', '#F3EBFC', '#FDF0E6', '#F1F6E4', '#FEF7D6'];
  const nextBg =
    typeof body.bg_color === 'string' && allowedColors.includes(body.bg_color)
      ? body.bg_color
      : String(existing?.bg_color || '#FCF6EC');
  const nextHtml =
    typeof body.text_html === 'string'
      ? body.text_html.slice(0, 24000)
      : String(existing?.text_html || '');
  const nextStrokes = Array.isArray(body.strokes)
    ? JSON.stringify(body.strokes.slice(0, 600))
    : String(existing?.strokes_json || '[]');
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(`
      UPDATE studio_postits
      SET bg_color = ?, text_html = ?, strokes_json = ?, updated_by = ?, updated_at = ?
      WHERE owner_key = ?
    `).run(nextBg, nextHtml, nextStrokes, user.name, now, ownerKey);
  } else {
    db.prepare(`
      INSERT INTO studio_postits (owner_key, owner_user_id, owner_name, bg_color, text_html, strokes_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerKey, user.id, user.name, nextBg, nextHtml, nextStrokes, user.name, now);
  }

  broadcastRealtime({
    type: 'postit_updated',
    actorId: user.id,
    scope: ownerKey,
  });

  // Notify partner at most once every 10 minutes so autosave stays pleasant
  const lastNotif = lastPostItNotifyByPartner.get(ownerKey) || 0;
  if (Date.now() - lastNotif > 10 * 60 * 1000) {
    lastPostItNotifyByPartner.set(ownerKey, Date.now());
    const otherPartners = db
      .prepare("SELECT id FROM users WHERE role = 'partner' AND id != ?")
      .all(user.id) as Array<{ id: string }>;
    const plain = nextHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    notifyUsers(
      otherPartners.map((p) => p.id),
      'postit_updated',
      `${user.name} atualizou seu post-it`,
      plain ? plain.slice(0, 120) : 'Novo recado ou desenho salvo no mural compartilhado.',
      'inicio',
      `postit-${ownerKey}`
    );
  }

  const all = getFormattedPostIts();
  const updated = all.find((p) => p.owner_key === ownerKey);
  res.json({ postit: updated });
});

router.get('/studio-demands', requireAuth, requirePartner, (_req, res) => {
  const userMap = getUserMetaMap();
  const rows = db
    .prepare(`
      SELECT d.*, b.title as board_title, b.portal_owner
      FROM studio_demands d
      LEFT JOIN boards b ON b.id = d.board_id
      ORDER BY
        CASE d.status WHEN 'concluida' THEN 1 ELSE 0 END ASC,
        CASE d.priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 ELSE 2 END ASC,
        d.updated_at DESC
    `)
    .all() as Array<Record<string, unknown>>;
  res.json({ demands: rows.map((r) => formatStudioDemand(r, userMap)) });
});

router.post('/studio-demands', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { title, description, assignee_id, priority, due_date, board_id } = req.body as {
    title?: string;
    description?: string;
    assignee_id?: string;
    priority?: 'normal' | 'alta' | 'urgente';
    due_date?: string | null;
    board_id?: string | null;
  };

  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    res.status(400).json({ error: 'Informe o título da demanda.' });
    return;
  }

  let assigneeRow = assignee_id
    ? (db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'partner'").get(assignee_id) as
        | { id: string; name: string }
        | undefined)
    : undefined;
  if (!assigneeRow) {
    assigneeRow = db
      .prepare("SELECT id, name FROM users WHERE role = 'partner' AND id != ? LIMIT 1")
      .get(user.id) as { id: string; name: string } | undefined;
  }
  const resolvedAssigneeId = assigneeRow?.id || user.id;
  const resolvedAssigneeName = assigneeRow?.name || user.name;
  const resolvedPriority = priority === 'urgente' || priority === 'alta' ? priority : 'normal';
  const id = uid('sdm');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO studio_demands (
      id, title, description, sender_id, sender_name, assignee_id, assignee_name,
      status, priority, due_date, board_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?, ?, ?, ?)
  `).run(
    id,
    cleanTitle,
    String(description || '').trim(),
    user.id,
    user.name,
    resolvedAssigneeId,
    resolvedAssigneeName,
    resolvedPriority,
    due_date || null,
    board_id || null,
    now,
    now
  );

  if (resolvedAssigneeId !== user.id) {
    notifyUsers(
      [resolvedAssigneeId],
      'studio_demand',
      `Nova demanda de ${user.name}`,
      cleanTitle,
      'inicio',
      id
    );
  }

  const row = db
    .prepare(`
      SELECT d.*, b.title as board_title, b.portal_owner
      FROM studio_demands d
      LEFT JOIN boards b ON b.id = d.board_id
      WHERE d.id = ?
    `)
    .get(id) as Record<string, unknown>;
  const demand = formatStudioDemand(row);
  logActivity(user.id, user.name, 'create_studio_demand', 'studio_demand', id, `Criou demanda interna: ${cleanTitle}`);
  broadcastRealtime({
    type: 'demand_updated',
    actorId: user.id,
    summary: cleanTitle,
  });
  res.status(201).json({ demand });
});

router.patch('/studio-demands/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM studio_demands WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }

  const { title, description, status, priority, assignee_id, due_date } = req.body as {
    title?: string;
    description?: string;
    status?: 'pendente' | 'em_andamento' | 'aguardando' | 'concluida';
    priority?: 'normal' | 'alta' | 'urgente';
    assignee_id?: string;
    due_date?: string | null;
  };

  let nextAssigneeId = String(existing.assignee_id);
  let nextAssigneeName = String(existing.assignee_name);
  if (assignee_id && assignee_id !== nextAssigneeId) {
    const found = db.prepare("SELECT id, name FROM users WHERE id = ? AND role = 'partner'").get(assignee_id) as
      | { id: string; name: string }
      | undefined;
    if (found) {
      nextAssigneeId = found.id;
      nextAssigneeName = found.name;
    }
  }

  const allowedStatuses = new Set(['pendente', 'em_andamento', 'aguardando', 'concluida']);
  const nextStatus = status && allowedStatuses.has(status) ? status : String(existing.status);
  const nextPriority = priority === 'urgente' || priority === 'alta' || priority === 'normal' ? priority : String(existing.priority);
  const nextTitle = title !== undefined && title.trim() ? title.trim() : String(existing.title);
  const nextDesc = description !== undefined ? description.trim() : String(existing.description || '');
  const nextDue = due_date !== undefined ? due_date || null : existing.due_date;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE studio_demands
    SET title = ?, description = ?, status = ?, priority = ?, assignee_id = ?, assignee_name = ?, due_date = ?, updated_at = ?
    WHERE id = ?
  `).run(nextTitle, nextDesc, nextStatus, nextPriority, nextAssigneeId, nextAssigneeName, nextDue, now, req.params.id);

  if (status && status !== existing.status) {
    const otherPartnerIds = (
      db.prepare("SELECT id FROM users WHERE role = 'partner' AND id != ? AND active = 1").all(user.id) as Array<{ id: string }>
    ).map((p) => p.id);
    const statusLabels: Record<string, string> = {
      pendente: 'Pendente',
      em_andamento: 'Em andamento',
      aguardando: 'Aguardando retorno',
      concluida: 'Concluída',
    };
    notifyUsers(
      otherPartnerIds,
      'studio_demand_status',
      `${user.name} atualizou demanda para ${statusLabels[nextStatus] || nextStatus}`,
      nextTitle,
      'inicio',
      req.params.id
    );
  }

  const updated = db
    .prepare(`
      SELECT d.*, b.title as board_title, b.portal_owner
      FROM studio_demands d
      LEFT JOIN boards b ON b.id = d.board_id
      WHERE d.id = ?
    `)
    .get(req.params.id) as Record<string, unknown>;
  broadcastRealtime({
    type: 'demand_updated',
    actorId: user.id,
    summary: nextTitle,
  });
  res.json({ demand: formatStudioDemand(updated) });
});

router.post('/studio-demands/:id/replies', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM studio_demands WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }

  const { content } = req.body as { content?: string };
  const clean = String(content || '').trim();
  if (!clean) {
    res.status(400).json({ error: 'Escreva uma resposta para enviar.' });
    return;
  }

  const replyId = uid('sdr');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_demand_replies (id, demand_id, author_id, author_name, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(replyId, req.params.id, user.id, user.name, clean, now);
  db.prepare('UPDATE studio_demands SET updated_at = ? WHERE id = ?').run(now, req.params.id);

  const otherPartnerIds = (
    db.prepare("SELECT id FROM users WHERE role = 'partner' AND id != ? AND active = 1").all(user.id) as Array<{ id: string }>
  ).map((p) => p.id);
  notifyUsers(
    otherPartnerIds,
    'studio_demand_reply',
    `${user.name} respondeu na demanda`,
    `${String(existing.title)}: ${clean.slice(0, 100)}`,
    'inicio',
    req.params.id
  );

  const updated = db
    .prepare(`
      SELECT d.*, b.title as board_title, b.portal_owner
      FROM studio_demands d
      LEFT JOIN boards b ON b.id = d.board_id
      WHERE d.id = ?
    `)
    .get(req.params.id) as Record<string, unknown>;
  broadcastRealtime({
    type: 'demand_updated',
    actorId: user.id,
    summary: String(existing.title),
  });
  res.status(201).json({ demand: formatStudioDemand(updated) });
});

router.delete('/studio-demands/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM studio_demand_replies WHERE demand_id = ?').run(req.params.id);
  db.prepare('DELETE FROM studio_demands WHERE id = ?').run(req.params.id);
  broadcastRealtime({
    type: 'demand_updated',
    actorId: req.user!.id,
  });
  res.json({ ok: true });
});

// Real-time Team Presence Heartbeat & Status
router.post('/presence/heartbeat', requireAuth, (req: AuthRequest, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, req.user!.id);
  res.json({ ok: true, server_time: now });
});

router.get('/presence', requireAuth, requirePartner, (_req, res) => {
  const rows = db
    .prepare("SELECT id, name, partner_key, avatar_url, title, last_seen_at FROM users WHERE role = 'partner' ORDER BY partner_key ASC")
    .all() as Array<{ id: string; name: string; partner_key: string; avatar_url: string | null; title: string; last_seen_at: string | null }>;

  const nowMs = Date.now();
  const team = rows.map((r) => {
    const lastSeenMs = r.last_seen_at ? new Date(r.last_seen_at).getTime() : 0;
    const isOnline = lastSeenMs > 0 && nowMs - lastSeenMs < 2 * 60 * 1000;
    return {
      ...r,
      is_online: isOnline,
    };
  });
  res.json({ team, server_time: new Date().toISOString() });
});

// Global Spotlight Search across Clients, Boards, Services, Copies, Cards
router.get('/search', requireAuth, requirePartner, (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q) {
    res.json({ clients: [], boards: [], services: [], copies: [], cards: [] });
    return;
  }
  const like = `%${q}%`;
  const clients = db
    .prepare('SELECT id, name, company, owner_partner, status FROM clients WHERE LOWER(name) LIKE ? OR LOWER(company) LIKE ? OR LOWER(email) LIKE ? LIMIT 6')
    .all(like, like, like);
  const boards = db
    .prepare('SELECT b.id, b.title, b.portal_owner, b.client_id, cl.name as client_name FROM boards b LEFT JOIN clients cl ON cl.id = b.client_id WHERE LOWER(b.title) LIKE ? OR LOWER(cl.name) LIKE ? LIMIT 6')
    .all(like, like);
  const services = db
    .prepare('SELECT id, name, category, color FROM services WHERE LOWER(name) LIKE ? OR LOWER(description) LIKE ? LIMIT 5')
    .all(like, like);
  const copies = db
    .prepare('SELECT id, title, status, client_id, board_id FROM copies WHERE LOWER(title) LIKE ? OR LOWER(content) LIKE ? LIMIT 5')
    .all(like, like);
  const cards = db
    .prepare('SELECT c.id, c.title, c.board_id, b.title as board_title FROM cards c JOIN boards b ON b.id = c.board_id WHERE LOWER(c.title) LIKE ? LIMIT 6')
    .all(like);

  res.json({ clients, boards, services, copies, cards });
});

// Studio Calendar & Commitments
router.get('/events', requireAuth, requirePartner, (req, res) => {
  const from = (req.query.from as string) || '';
  const events = from
    ? db
        .prepare(`
          SELECT e.*, cl.name as client_name, b.title as board_title
          FROM studio_events e
          LEFT JOIN clients cl ON cl.id = e.client_id
          LEFT JOIN boards b ON b.id = e.board_id
          WHERE e.event_date >= ?
          ORDER BY e.event_date ASC, e.event_time ASC
        `)
        .all(from)
    : db
        .prepare(`
          SELECT e.*, cl.name as client_name, b.title as board_title
          FROM studio_events e
          LEFT JOIN clients cl ON cl.id = e.client_id
          LEFT JOIN boards b ON b.id = e.board_id
          ORDER BY e.event_date ASC, e.event_time ASC
          LIMIT 100
        `)
        .all();
  res.json({ events });
});

router.post('/events', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { title, description, event_date, event_time, type, client_id, board_id, owner_partner } = req.body as Record<string, string>;
  if (!title?.trim() || !event_date) {
    res.status(400).json({ error: 'Informe o título e a data do compromisso.' });
    return;
  }
  const id = uid('evt');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_events (id, title, description, event_date, event_time, type, client_id, board_id, owner_partner, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title.trim(),
    description?.trim() || '',
    event_date,
    event_time || '10:00',
    type || 'meeting',
    client_id || null,
    board_id || null,
    owner_partner || 'studio',
    user.id,
    now
  );
  const event = db
    .prepare(`
      SELECT e.*, cl.name as client_name, b.title as board_title
      FROM studio_events e
      LEFT JOIN clients cl ON cl.id = e.client_id
      LEFT JOIN boards b ON b.id = e.board_id
      WHERE e.id = ?
    `)
    .get(id);
  logActivity(user.id, user.name, 'create_event', 'event', id, `Agendou: ${title.trim()} (${event_date})`);
  res.status(201).json({ event });
});

router.delete('/events/:id', requireAuth, requirePartner, (req, res) => {
  db.prepare('DELETE FROM studio_events WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Quick Studio Notes (auto-save, pin, categories, client/board links)
router.get('/notes', requireAuth, requirePartner, (req, res) => {
  const category = req.query.category as string | undefined;
  let query = `
    SELECT n.*, cl.name as client_name, b.title as board_title
    FROM studio_notes n
    LEFT JOIN clients cl ON cl.id = n.client_id
    LEFT JOIN boards b ON b.id = n.board_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (category && category !== 'Todas') {
    query += ' AND n.category = ?';
    params.push(category);
  }
  query += ' ORDER BY n.pinned DESC, n.updated_at DESC';
  const notes = db.prepare(query).all(...params);
  res.json({ notes });
});

router.post('/notes', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { title, content, category, color, pinned, client_id, board_id } = req.body as {
    title?: string;
    content?: string;
    category?: string;
    color?: string;
    pinned?: boolean;
    client_id?: string | null;
    board_id?: string | null;
  };

  const id = uid('not');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_notes (
      id, title, content, category, color, pinned, client_id, board_id, author_id, author_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title?.trim() || 'Nova anotação',
    content || '',
    category?.trim() || 'Geral',
    color || '#FCF6EC',
    pinned ? 1 : 0,
    client_id || null,
    board_id || null,
    user.id,
    user.name,
    now,
    now
  );

  const note = db
    .prepare(`
      SELECT n.*, cl.name as client_name, b.title as board_title
      FROM studio_notes n
      LEFT JOIN clients cl ON cl.id = n.client_id
      LEFT JOIN boards b ON b.id = n.board_id
      WHERE n.id = ?
    `)
    .get(id);
  res.status(201).json({ note });
});

router.put('/notes/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM studio_notes WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Anotação não encontrada.' });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE studio_notes SET
      title = ?, content = ?, category = ?, color = ?, pinned = ?, client_id = ?, board_id = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.title !== undefined ? String(body.title) : existing.title,
    body.content !== undefined ? String(body.content) : existing.content,
    body.category !== undefined ? String(body.category) : existing.category,
    body.color !== undefined ? String(body.color) : existing.color,
    body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned,
    body.client_id !== undefined ? body.client_id || null : existing.client_id,
    body.board_id !== undefined ? body.board_id || null : existing.board_id,
    now,
    req.params.id
  );
  const note = db
    .prepare(`
      SELECT n.*, cl.name as client_name, b.title as board_title
      FROM studio_notes n
      LEFT JOIN clients cl ON cl.id = n.client_id
      LEFT JOIN boards b ON b.id = n.board_id
      WHERE n.id = ?
    `)
    .get(req.params.id);
  res.json({ note });
});

router.delete('/notes/:id', requireAuth, requirePartner, (req, res) => {
  db.prepare('DELETE FROM studio_notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/notifications', requireAuth, (req: AuthRequest, res) => {
  const list = getEnrichedNotificationsForUser(req.user!.id, 60);
  res.json({ notifications: list });
});

router.patch('/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
  const isRead = (req.body as { is_read?: boolean } | undefined)?.is_read;
  const nextVal = isRead === false ? 0 : 1;
  db.prepare('UPDATE notifications SET is_read = ? WHERE id = ? AND target_user_id = ?').run(nextVal, req.params.id, req.user!.id);
  res.json({ ok: true, is_read: nextVal });
});

router.post('/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE target_user_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

router.delete('/notifications/clear/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE target_user_id = ? AND is_read = 1').run(req.user!.id);
  broadcastRealtime({
    type: 'notification_deleted',
    targetUserIds: [req.user!.id],
  });
  res.json({ ok: true });
});

router.delete('/notifications/:id', requireAuth, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND target_user_id = ?').run(req.params.id, req.user!.id);
  broadcastRealtime({
    type: 'notification_deleted',
    targetUserIds: [req.user!.id],
  });
  res.json({ ok: true });
});

router.get('/partners', requireAuth, requirePartner, (_req, res) => {
  const rows = db.prepare("SELECT * FROM users WHERE role = 'partner' ORDER BY partner_key ASC").all() as DbUser[];
  res.json({ partners: rows.map(sanitizeUser) });
});

router.put('/partners/:id/permissions', requireAuth, requirePermission('can_manage_settings'), (req: AuthRequest, res) => {
  const { permissions, title, active } = req.body as {
    permissions?: Partial<PartnerPermissions>;
    title?: string;
    active?: boolean;
  };
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'partner'").get(req.params.id) as DbUser | undefined;
  if (!target) {
    res.status(404).json({ error: 'Sócia não encontrada.' });
    return;
  }

  const currentSafe = sanitizeUser(target);
  const nextPerms = permissions ? { ...currentSafe.permissions, ...permissions } : currentSafe.permissions;
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET permissions_json = ?, title = ?, active = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(nextPerms),
    title !== undefined ? title.trim() : target.title,
    active !== undefined ? (active ? 1 : 0) : target.active,
    now,
    target.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(target.id) as DbUser;
  logActivity(req.user!.id, req.user!.name, 'update_permissions', 'user', target.id, `Atualizou permissões de ${target.name}`);
  res.json({ partner: sanitizeUser(updated) });
});

router.get('/settings', requireAuth, (req: AuthRequest, res) => {
  const rows = db.prepare('SELECT * FROM studio_settings').all() as Array<{ key: string; value_json: string; updated_at: string }>;
  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      settings[r.key] = JSON.parse(r.value_json);
    } catch {
      settings[r.key] = r.value_json;
    }
  }
  if (!Array.isArray(settings.card_mini_updates)) {
    settings.card_mini_updates = DEFAULT_CARD_MINI_UPDATES;
  }
  if (req.user!.role === 'client') {
    res.json({
      settings: {
        portal_defaults: settings.portal_defaults || {},
        appearance: settings.appearance || {},
        typography: settings.typography || {},
        theme_tokens: settings.theme_tokens || {},
        priorities: settings.priorities || [],
        labels: settings.labels || [],
        card_mini_updates: settings.card_mini_updates || DEFAULT_CARD_MINI_UPDATES,
      },
    });
    return;
  }
  res.json({ settings });
});

router.get('/card-mini-updates', requireAuth, (_req, res) => {
  const row = db
    .prepare("SELECT value_json FROM studio_settings WHERE key = 'card_mini_updates'")
    .get() as { value_json: string } | undefined;
  let options = DEFAULT_CARD_MINI_UPDATES;
  if (row) {
    try {
      const parsed = JSON.parse(row.value_json);
      if (Array.isArray(parsed)) options = parsed;
    } catch {
      options = DEFAULT_CARD_MINI_UPDATES;
    }
  }
  res.json({ options });
});

router.put('/card-mini-updates', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { options } = req.body as {
    options?: Array<{ id?: string; label: string; bg?: string; text?: string; border?: string }>;
  };
  if (!Array.isArray(options)) {
    res.status(400).json({ error: 'Lista de mini atualizações inválida.' });
    return;
  }

  const sanitized = options
    .map((opt) => ({
      id: opt.id && String(opt.id).trim() ? String(opt.id).trim() : uid('mu'),
      label: String(opt.label || '').trim(),
      bg: String(opt.bg || '#F3ECF9').trim(),
      text: String(opt.text || '#2F1534').trim(),
      border: String(opt.border || '#BC9FE6').trim(),
    }))
    .filter((opt) => opt.label.length > 0);

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
    VALUES ('card_mini_updates', ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(JSON.stringify(sanitized), req.user!.id, now);

  logActivity(
    req.user!.id,
    req.user!.name,
    'update_settings',
    'settings',
    'card_mini_updates',
    `Atualizou opções de mini atualizações dos cards (${sanitized.length} opções)`
  );
  res.json({ ok: true, options: sanitized });
});

router.put('/settings/:key', requireAuth, requirePermission('can_manage_settings'), (req: AuthRequest, res) => {
  const key = req.params.key;
  const { value } = req.body as { value: unknown };
  if (value === undefined) {
    res.status(400).json({ error: 'Valor da configuração ausente.' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value), req.user!.id, now);

  logActivity(req.user!.id, req.user!.name, 'update_settings', 'settings', key, `Atualizou configuração: ${key}`);
  res.json({ ok: true, key, value });
});

router.get('/activity', requireAuth, requirePartner, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit);
  res.json({ logs });
});

router.get('/system/export', requireAuth, requirePermission('can_manage_settings'), (_req, res) => {
  const exportData = {
    exported_at: new Date().toISOString(),
    clients: db.prepare('SELECT * FROM clients').all(),
    services: db.prepare('SELECT * FROM services').all(),
    service_deliverables: db.prepare('SELECT * FROM service_deliverables').all(),
    service_packages: db.prepare('SELECT * FROM service_packages').all(),
    folders: db.prepare('SELECT * FROM folders').all(),
    boards: db.prepare('SELECT * FROM boards').all(),
    board_columns: db.prepare('SELECT * FROM board_columns').all(),
    cards: db.prepare('SELECT * FROM cards').all(),
    finance_entries: db.prepare('SELECT * FROM finance_entries').all(),
    society_config: db.prepare('SELECT * FROM society_config').all(),
    society_entries: db.prepare('SELECT * FROM society_entries').all(),
    studio_settings: db.prepare('SELECT * FROM studio_settings').all(),
  };
  res.json(exportData);
});

export default router;
