import { Router } from 'express';
import crypto from 'crypto';
import { createNotification, db, emitStudioEvent, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner } from '../middleware.ts';

const router = Router();

function formatCopy(row: Record<string, unknown>) {
  return {
    ...row,
    attachments: JSON.parse(String(row.attachments_json || '[]')),
    labels: JSON.parse(String(row.labels_json || '[]')),
    checklist: JSON.parse(String(row.checklist_json || '[]')),
    history: JSON.parse(String(row.history_json || '[]')),
    version_number: Number(row.version_number || 1),
    shared_with_client: Boolean(row.shared_with_client),
  };
}

function appendHistory(
  existingJson: unknown,
  actorId: string,
  actorName: string,
  action: string,
  details: string
) {
  let list: Array<{ id: string; actor_id: string; actor_name: string; action: string; details: string; created_at: string }> = [];
  try {
    list = JSON.parse(String(existingJson || '[]'));
  } catch {
    list = [];
  }
  list.unshift({
    id: uid('hst'),
    actor_id: actorId,
    actor_name: actorName,
    action,
    details,
    created_at: new Date().toISOString(),
  });
  return JSON.stringify(list.slice(0, 40));
}

// List copies (partners)
router.get('/', requireAuth, requirePartner, (req, res) => {
  const { client_id, board_id, status } = req.query as Record<string, string>;
  let query = `
    SELECT cp.*, cl.name as client_name, b.title as board_title
    FROM copies cp
    LEFT JOIN clients cl ON cl.id = cp.client_id
    LEFT JOIN boards b ON b.id = cp.board_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (client_id && client_id !== 'all') {
    query += ' AND cp.client_id = ?';
    params.push(client_id);
  }
  if (board_id && board_id !== 'all') {
    query += ' AND cp.board_id = ?';
    params.push(board_id);
  }
  if (status && status !== 'all') {
    query += ' AND cp.status = ?';
    params.push(status);
  }

  query += ' ORDER BY cp.updated_at DESC';
  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  res.json({ copies: rows.map(formatCopy) });
});

// Create copy (draft or saved)
router.post('/', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    title?: string;
    content?: string;
    notes?: string;
    attachments?: unknown[];
    author_user_id?: string;
    priority?: 'baixa' | 'normal' | 'alta' | 'urgente';
    labels?: string[];
    checklist?: unknown[];
    client_id?: string | null;
    board_id?: string | null;
    card_id?: string | null;
    status?: 'draft' | 'internal_sent' | 'not_shared';
  };

  if (!body.title?.trim() || !body.content?.trim()) {
    res.status(400).json({ error: 'Informe o título e o texto principal da copy.' });
    return;
  }

  let authorId = user.id;
  let authorName = user.name;
  if (body.author_user_id) {
    const authorRow = db.prepare('SELECT id, name FROM users WHERE id = ?').get(body.author_user_id) as { id: string; name: string } | undefined;
    if (authorRow) {
      authorId = authorRow.id;
      authorName = authorRow.name;
    }
  }

  const id = uid('cpy');
  const now = new Date().toISOString();
  const initialStatus = body.status || 'draft';
  const history = appendHistory('[]', user.id, user.name, 'created', `Copy criada (${initialStatus === 'draft' ? 'rascunho' : 'salva'})`);

  db.prepare(`
    INSERT INTO copies (
      id, title, content, notes, attachments_json, author_user_id, author_name,
      priority, labels_json, checklist_json, status, client_id, board_id, card_id,
      shared_with_client, share_token, history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)
  `).run(
    id,
    body.title.trim(),
    body.content,
    body.notes?.trim() || '',
    JSON.stringify(body.attachments || []),
    authorId,
    authorName,
    body.priority || 'normal',
    JSON.stringify(body.labels || []),
    JSON.stringify(body.checklist || []),
    initialStatus,
    body.client_id || null,
    body.board_id || null,
    body.card_id || null,
    history,
    now,
    now
  );

  const created = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(id) as Record<string, unknown>;
  logActivity(user.id, user.name, 'create_copy', 'copy', id, `Criou copy: ${body.title.trim()}`);
  res.status(201).json({ copy: formatCopy(created) });
});

// Update copy content without altering existing share_token
router.put('/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM copies WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Copy não encontrada.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();
  let authorId = String(existing.author_user_id);
  let authorName = String(existing.author_name);

  if (body.author_user_id && body.author_user_id !== existing.author_user_id) {
    const u = db.prepare('SELECT id, name FROM users WHERE id = ?').get(String(body.author_user_id)) as { id: string; name: string } | undefined;
    if (u) {
      authorId = u.id;
      authorName = u.name;
    }
  }

  const nextVersion = Number(existing.version_number || 1) + 1;
  const history = appendHistory(
    existing.history_json,
    user.id,
    user.name,
    'updated',
    `Conteúdo da copy atualizado (v${nextVersion})`
  );

  db.prepare(`
    UPDATE copies SET
      title = ?, content = ?, notes = ?, attachments_json = ?, author_user_id = ?, author_name = ?,
      priority = ?, labels_json = ?, checklist_json = ?, client_id = ?, board_id = ?, version_number = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.title !== undefined ? String(body.title).trim() : existing.title,
    body.content !== undefined ? String(body.content) : existing.content,
    body.notes !== undefined ? String(body.notes) : existing.notes,
    body.attachments !== undefined ? JSON.stringify(body.attachments) : existing.attachments_json,
    authorId,
    authorName,
    body.priority !== undefined ? String(body.priority) : existing.priority,
    body.labels !== undefined ? JSON.stringify(body.labels) : existing.labels_json,
    body.checklist !== undefined ? JSON.stringify(body.checklist) : existing.checklist_json,
    body.client_id !== undefined ? body.client_id : existing.client_id,
    body.board_id !== undefined ? body.board_id : existing.board_id,
    nextVersion,
    history,
    now,
    req.params.id
  );

  // Sync updated copy text to linked card if present
  if (existing.card_id && body.content !== undefined) {
    db.prepare('UPDATE cards SET copy_text = ?, title = ?, updated_at = ? WHERE id = ?').run(
      String(body.content),
      body.title !== undefined ? String(body.title).trim() : String(existing.title),
      now,
      existing.card_id
    );
  }

  const updated = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(req.params.id) as Record<string, unknown>;
  logActivity(user.id, user.name, 'update_copy', 'copy', req.params.id, `Editou copy "${updated.title}"`);
  res.json({ copy: formatCopy(updated) });
});

// Duplicate copy
router.post('/:id/duplicate', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const src = db.prepare('SELECT * FROM copies WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!src) {
    res.status(404).json({ error: 'Copy não encontrada.' });
    return;
  }

  const id = uid('cpy');
  const now = new Date().toISOString();
  const history = appendHistory('[]', user.id, user.name, 'duplicated', `Duplicada a partir de "${src.title}"`);

  db.prepare(`
    INSERT INTO copies (
      id, title, content, notes, attachments_json, author_user_id, author_name,
      priority, labels_json, checklist_json, status, client_id, board_id, card_id,
      shared_with_client, share_token, history_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, 0, NULL, ?, ?, ?)
  `).run(
    id,
    `${src.title} (Cópia)`,
    src.content,
    src.notes,
    src.attachments_json,
    user.id,
    user.name,
    src.priority,
    src.labels_json,
    src.checklist_json,
    src.client_id,
    src.board_id,
    history,
    now,
    now
  );

  const created = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(id) as Record<string, unknown>;
  res.status(201).json({ copy: formatCopy(created) });
});

// Delete copy
router.delete('/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  db.prepare('DELETE FROM copies WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_copy', 'copy', req.params.id, 'Excluiu copy');
  res.json({ ok: true });
});

// Send copy to internal production flow WITHOUT exposing to client
router.post('/:id/send-internal', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM copies WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Copy não encontrada.' });
    return;
  }

  const { board_id, client_id, column_id } = req.body as {
    board_id?: string;
    client_id?: string;
    column_id?: string;
  };

  const targetBoardId = board_id || (existing.board_id ? String(existing.board_id) : '');
  if (!targetBoardId) {
    res.status(400).json({ error: 'Selecione um projeto/quadro para enviar a copy para produção.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(targetBoardId) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro selecionado não encontrado.' });
    return;
  }

  const cols = db.prepare('SELECT * FROM board_columns WHERE board_id = ? AND archived = 0 ORDER BY sort_order ASC').all(targetBoardId) as Array<{ id: string; title: string }>;
  const targetCol = column_id
    ? cols.find((c) => c.id === column_id)
    : cols.find((c) => c.title.toLowerCase().includes('fazer')) || cols[0];

  const now = new Date().toISOString();
  let cardId = existing.card_id ? String(existing.card_id) : '';

  if (!cardId && targetCol) {
    cardId = uid('crd');
    db.prepare(`
      INSERT INTO cards (
        id, board_id, column_id, title, description, service_name, package_name, format,
        lead_user_id, priority, labels_json, checklist_json, references_text, copy_text,
        internal_notes, client_visible, requires_approval, approval_status, approval_feedback,
        sort_order, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Copy enviada para fluxo interno de produção.', '', '', 'Copy', ?, ?, ?, ?, '', ?, ?, ?, 1, 'none', '', 0, ?, ?, ?)
    `).run(
      cardId,
      targetBoardId,
      targetCol.id,
      existing.title,
      existing.author_user_id,
      existing.priority,
      existing.labels_json,
      existing.checklist_json,
      existing.content,
      existing.notes,
      existing.shared_with_client ? 1 : 0,
      user.id,
      now,
      now
    );

    const attachments = JSON.parse(String(existing.attachments_json || '[]')) as Array<{
      filename: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      file_url: string;
    }>;
    const insertAtt = db.prepare(`
      INSERT INTO card_attachments (id, card_id, filename, original_name, mime_type, size_bytes, file_url, is_internal, uploaded_by, uploaded_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const att of attachments) {
      insertAtt.run(uid('att'), cardId, att.filename, att.original_name, att.mime_type, att.size_bytes, att.file_url, existing.shared_with_client ? 0 : 1, user.id, user.name, now);
    }
  } else if (cardId) {
    db.prepare('UPDATE cards SET copy_text = ?, title = ?, updated_at = ? WHERE id = ?').run(
      existing.content,
      existing.title,
      now,
      cardId
    );
  }

  const nextStatus = existing.shared_with_client ? existing.status : 'not_shared';
  const history = appendHistory(
    existing.history_json,
    user.id,
    user.name,
    'internal_sent',
    `Enviada para produção no quadro "${board.title}" (não compartilhada externamente)`
  );

  db.prepare(`
    UPDATE copies SET
      client_id = ?, board_id = ?, card_id = ?, status = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    client_id || board.client_id,
    targetBoardId,
    cardId || null,
    nextStatus,
    history,
    now,
    req.params.id
  );

  const updated = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(req.params.id) as Record<string, unknown>;
  logActivity(user.id, user.name, 'send_copy_internal', 'copy', req.params.id, `Enviou copy "${existing.title}" para produção`);
  res.json({ copy: formatCopy(updated) });
});

// Share or revoke sharing with Client Portal + generate persistent link
router.post('/:id/share', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM copies WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Copy não encontrada.' });
    return;
  }

  const { shared_with_client, client_id, board_id, require_approval } = req.body as {
    shared_with_client: boolean;
    client_id?: string;
    board_id?: string;
    require_approval?: boolean;
  };

  const targetClientId = client_id || (existing.client_id ? String(existing.client_id) : '');
  const targetBoardId = board_id || (existing.board_id ? String(existing.board_id) : '');

  if (shared_with_client && !targetClientId) {
    res.status(400).json({ error: 'Selecione um cliente antes de liberar no Portal do Cliente.' });
    return;
  }

  const now = new Date().toISOString();
  const shareToken = existing.share_token ? String(existing.share_token) : `aumi-${crypto.randomBytes(12).toString('hex')}`;
  const nextStatus = shared_with_client
    ? require_approval
      ? 'awaiting_approval'
      : 'shared'
    : 'not_shared';

  const history = appendHistory(
    existing.history_json,
    user.id,
    user.name,
    shared_with_client ? 'shared' : 'unshared',
    shared_with_client
      ? `Compartilhamento liberado no Portal do Cliente (${require_approval ? 'aguardando aprovação' : 'somente visualização'})`
      : 'Compartilhamento externo desativado'
  );

  db.prepare(`
    UPDATE copies SET
      client_id = ?, board_id = ?, shared_with_client = ?, share_token = ?,
      status = ?, shared_at = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    targetClientId || null,
    targetBoardId || null,
    shared_with_client ? 1 : 0,
    shareToken,
    nextStatus,
    shared_with_client ? existing.shared_at || now : existing.shared_at,
    history,
    now,
    req.params.id
  );

  if (existing.card_id) {
    db.prepare('UPDATE cards SET client_visible = ?, approval_status = ?, updated_at = ? WHERE id = ?').run(
      shared_with_client ? 1 : 0,
      shared_with_client && require_approval ? 'pending' : 'none',
      now,
      existing.card_id
    );
  }

  if (shared_with_client && targetClientId) {
    const clientUser = db.prepare("SELECT id FROM users WHERE client_id = ? AND role = 'client' AND active = 1").get(targetClientId) as { id: string } | undefined;
    if (clientUser) {
      createNotification(
        clientUser.id,
        'copy_shared',
        'Nova copy compartilhada',
        `"${existing.title}" foi liberada para sua visualização no Portal do Cliente.`,
        'portal',
        req.params.id
      );
    }
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'copy_shared',
      entityType: 'copy',
      entityId: req.params.id,
      title: `Copy compartilhada: ${existing.title}`,
      message: `${user.name} liberou a copy "${existing.title}" (v${existing.version_number || 1}) no Portal do Cliente.`,
      boardId: targetBoardId || null,
      clientId: targetClientId,
      cardId: existing.card_id ? String(existing.card_id) : null,
      visibility: 'shared',
      postToStudioMural: true,
      postToBoardMural: Boolean(targetBoardId),
      color: '#F3ECF9',
    });
  }

  const updated = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(req.params.id) as Record<string, unknown>;
  logActivity(
    user.id,
    user.name,
    shared_with_client ? 'share_copy' : 'unshare_copy',
    'copy',
    req.params.id,
    `${shared_with_client ? 'Liberou' : 'Desativou'} compartilhamento da copy "${existing.title}"`
  );
  res.json({ copy: formatCopy(updated) });
});

// Authenticated lookup via secure share link token
router.get('/shared/:token', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const row = db
    .prepare(`
      SELECT cp.*, cl.name as client_name, b.title as board_title
      FROM copies cp
      LEFT JOIN clients cl ON cl.id = cp.client_id
      LEFT JOIN boards b ON b.id = cp.board_id
      WHERE cp.share_token = ?
    `)
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!row || !row.shared_with_client) {
    res.status(404).json({ error: 'Este link de copy não está ativo ou foi revogado.' });
    return;
  }

  if (user.role === 'client' && row.client_id !== user.client_id) {
    res.status(403).json({ error: 'Você não tem permissão para visualizar esta copy.' });
    return;
  }

  // Strip internal notes for clients
  const formatted = formatCopy(row);
  if (user.role === 'client') {
    delete (formatted as Record<string, unknown>).notes;
  }
  res.json({ copy: formatted });
});

// Client approves or requests changes on shared copy
router.post('/:id/client-decision', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { decision, feedback } = req.body as { decision: 'approved' | 'changes_requested'; feedback?: string };
  const existing = db.prepare('SELECT * FROM copies WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;

  if (!existing || !existing.shared_with_client) {
    res.status(404).json({ error: 'Copy compartilhada não encontrada.' });
    return;
  }

  if (user.role === 'client' && existing.client_id !== user.client_id) {
    res.status(403).json({ error: 'Sem permissão para avaliar esta copy.' });
    return;
  }

  const now = new Date().toISOString();
  const nextStatus = decision === 'approved' ? 'approved' : 'changes_requested';
  const history = appendHistory(
    existing.history_json,
    user.id,
    user.name,
    decision === 'approved' ? 'approved' : 'changes_requested',
    decision === 'approved'
      ? `Copy aprovada por ${user.name}${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
      : `Alterações solicitadas por ${user.name}${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
  );

  db.prepare(`
    UPDATE copies SET
      status = ?, approved_at = ?, approved_by = ?, client_feedback = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    nextStatus,
    decision === 'approved' ? now : existing.approved_at,
    decision === 'approved' ? user.name : existing.approved_by,
    feedback?.trim() || '',
    history,
    now,
    req.params.id
  );

  if (existing.card_id) {
    db.prepare('UPDATE cards SET approval_status = ?, approval_feedback = ?, updated_at = ? WHERE id = ?').run(
      decision,
      feedback?.trim() || '',
      now,
      existing.card_id
    );
  }

  createNotification(
    String(existing.author_user_id),
    decision === 'approved' ? 'copy_approved' : 'copy_changes',
    decision === 'approved' ? `Copy aprovada por ${user.name}` : `Alteração solicitada por ${user.name}`,
    `Copy "${existing.title}"${feedback?.trim() ? `: ${feedback.trim()}` : '.'}`,
    'portal',
    req.params.id
  );

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: decision === 'approved' ? 'copy_approved' : 'copy_changes',
    entityType: 'copy',
    entityId: req.params.id,
    title: decision === 'approved' ? `Copy aprovada: ${existing.title}` : `Ajuste de copy solicitado: ${existing.title}`,
    message: `${user.name} ${decision === 'approved' ? 'aprovou' : 'solicitou alterações na'} copy "${existing.title}"${feedback?.trim() ? `: ${feedback.trim()}` : '.'}`,
    boardId: existing.board_id ? String(existing.board_id) : null,
    clientId: existing.client_id ? String(existing.client_id) : null,
    cardId: existing.card_id ? String(existing.card_id) : null,
    visibility: 'shared',
    priority: decision === 'changes_requested' ? 'high' : 'normal',
    postToStudioMural: true,
    postToBoardMural: Boolean(existing.board_id),
    color: decision === 'approved' ? '#F4F5E2' : '#FDF2F6',
  });

  logActivity(
    user.id,
    user.name,
    decision === 'approved' ? 'approve_copy' : 'request_copy_changes',
    'copy',
    req.params.id,
    `${decision === 'approved' ? 'Aprovou' : 'Solicitou alterações em'} "${existing.title}"`
  );

  const updated = db
    .prepare('SELECT cp.*, cl.name as client_name, b.title as board_title FROM copies cp LEFT JOIN clients cl ON cl.id = cp.client_id LEFT JOIN boards b ON b.id = cp.board_id WHERE cp.id = ?')
    .get(req.params.id) as Record<string, unknown>;
  res.json({ copy: formatCopy(updated) });
});

export default router;
