import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { BOARD_COVERS, createNotification, db, DEFAULT_PREFERENCES, emitStudioEvent, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner, requirePermission } from '../middleware.ts';
import { DbUser } from '../types.ts';

const router = Router();

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  try {
    return JSON.parse(String(raw ?? '')) as T;
  } catch {
    return fallback;
  }
}

function sanitizeContractInfoForClient(raw: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...raw };
  delete safe.internal_notes;
  const contractDoc = safe.contract_doc as Record<string, unknown> | undefined;
  if (contractDoc && contractDoc.client_visible === false) {
    delete safe.contract_doc;
  }
  const proposalDoc = safe.proposal_doc as Record<string, unknown> | undefined;
  if (proposalDoc && proposalDoc.client_visible === false) {
    delete safe.proposal_doc;
  }
  return safe;
}

function sanitizeBriefingInfoForClient(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.client_visible === false) {
    return { client_visible: false };
  }
  const safe = { ...raw };
  delete safe.internal_notes;
  return safe;
}

function appendCardHistory(
  existingJson: unknown,
  actorId: string,
  actorName: string,
  action: string,
  details: string
) {
  const list = safeJsonParse<Array<{ id: string; actor_id: string; actor_name: string; action: string; details: string; created_at: string }>>(existingJson, []);
  list.unshift({
    id: uid('chst'),
    actor_id: actorId,
    actor_name: actorName,
    action,
    details,
    created_at: new Date().toISOString(),
  });
  return JSON.stringify(list.slice(0, 40));
}

interface RawApprovalItem {
  id: string;
  type: 'image' | 'pdf' | 'link' | 'text' | 'document' | 'file';
  title: string;
  url?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  content?: string;
  notes?: string;
  status: 'pending' | 'approved' | 'changes_requested';
  feedback?: string;
  decided_by_name?: string;
  decided_at?: string;
  version_number: number;
  versions: Array<{
    version: number;
    title: string;
    url?: string;
    file_name?: string;
    mime_type?: string;
    content?: string;
    notes?: string;
    uploaded_by_id: string;
    uploaded_by_name: string;
    created_at: string;
  }>;
  comments: Array<{
    id: string;
    author_id: string;
    author_name: string;
    author_role: string;
    content: string;
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
}

function computeDeliveryStatus(items: RawApprovalItem[]): 'pending' | 'partially_approved' | 'changes_requested' | 'approved' {
  if (!items || items.length === 0) return 'pending';
  if (items.some((i) => i.status === 'changes_requested')) return 'changes_requested';
  const approvedCount = items.filter((i) => i.status === 'approved').length;
  if (approvedCount === items.length) return 'approved';
  if (approvedCount > 0) return 'partially_approved';
  return 'pending';
}

function formatApprovalDeliveryRow(row: Record<string, unknown>) {
  const items = safeJsonParse<RawApprovalItem[]>(row.items_json, []);
  return {
    id: String(row.id),
    board_id: String(row.board_id),
    card_id: row.card_id ? String(row.card_id) : null,
    card_title: row.card_title ? String(row.card_title) : null,
    card_service_name: row.card_service_name ? String(row.card_service_name) : null,
    title: String(row.title || ''),
    description: String(row.description || ''),
    status: computeDeliveryStatus(items),
    items,
    created_by: String(row.created_by || ''),
    created_by_name: String(row.created_by_name || ''),
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function getClientUserId(clientId: string | null | undefined): string | null {
  if (!clientId) return null;
  const row = db.prepare("SELECT id FROM users WHERE client_id = ? AND role = 'client' AND active = 1").get(clientId) as { id: string } | undefined;
  return row?.id || null;
}

function formatCardRecord(
  card: Record<string, unknown>,
  comments: Array<Record<string, unknown>> = [],
  attachments: Array<Record<string, unknown>> = [],
  isClient = false
) {
  const hiddenSections = safeJsonParse<Record<string, boolean>>(card.hidden_sections_json, {});
  const rawSubmitted = safeJsonParse<Record<string, unknown>>(card.submitted_content_json, {});
  const rawLinks = safeJsonParse<Array<{ id: string; url: string; description: string }>>(card.links_json, []);
  const rawChecklist = safeJsonParse<Array<Record<string, unknown>>>(card.checklist_json, []);
  const rawClientFields = safeJsonParse<Array<Record<string, unknown>>>(card.client_fields_json, []);
  const rawAdjustment = safeJsonParse<Record<string, unknown> | null>(card.adjustment_request_json, null);

  let safeSubmitted = rawSubmitted;
  let safeLinks = rawLinks;
  let safeRefsText = String(card.references_text || '');
  let safeExtraNotes = String(card.extra_notes || '');
  let safeChecklist = rawChecklist;
  let safeClientFields = rawClientFields;
  let safeComments = comments;
  let safeAttachments = attachments;

  if (isClient) {
    if (hiddenSections.observations) {
      safeSubmitted = { ...safeSubmitted, notes: '' };
    }
    if (hiddenSections.notes) {
      safeExtraNotes = '';
    }
    if (hiddenSections.references) {
      safeLinks = [];
      safeRefsText = '';
      safeSubmitted = { ...safeSubmitted, links: [] };
    }
    if (hiddenSections.attachments) {
      safeAttachments = [];
    }
    if (hiddenSections.checklist) {
      safeChecklist = [];
    }
    if (hiddenSections.comments) {
      safeComments = [];
    }
    if (hiddenSections.extra_info) {
      safeClientFields = [];
      safeSubmitted = { ...safeSubmitted, answers: {} };
    }
  }

  const base: Record<string, unknown> = {
    ...card,
    labels: safeJsonParse(card.labels_json, []),
    checklist: safeChecklist,
    client_fields: safeClientFields,
    submitted_content: safeSubmitted,
    links: safeLinks,
    references_text: safeRefsText,
    extra_notes: safeExtraNotes,
    hidden_sections: hiddenSections,
    adjustment_request: rawAdjustment,
    read_at: card.read_at || null,
    read_by_id: card.read_by_id || null,
    read_by_name: card.read_by_name || null,
    history: safeJsonParse(card.history_json, []),
    mini_updates: safeJsonParse(card.mini_updates_json, []),
    content_status: card.content_status || 'awaiting_content',
    content_feedback: card.content_feedback || '',
    client_visible: Boolean(card.client_visible),
    requires_approval: Boolean(card.requires_approval),
    comments: safeComments,
    attachments: safeAttachments,
  };
  if (isClient) {
    delete base.internal_notes;
    delete base.hidden_sections;
    delete base.hidden_sections_json;
  }
  return base;
}

router.get('/clients', requireAuth, requirePartner, (_req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY name ASC').all() as Array<Record<string, unknown>>;
  const clientUsers = db
    .prepare("SELECT id, email, client_id, active FROM users WHERE role = 'client'")
    .all() as Array<{ id: string; email: string; client_id: string; active: number }>;

  const boardStats = db
    .prepare(`
      SELECT b.client_id,
             COUNT(DISTINCT CASE WHEN b.status != 'archived' THEN b.id END) as boards_count,
             COUNT(DISTINCT CASE WHEN b.status = 'active' THEN b.id END) as active_boards_count,
             MAX(b.updated_at) as last_board_update,
             (
               SELECT COUNT(*)
               FROM cards c
               JOIN boards b2 ON b2.id = c.board_id
               JOIN board_columns col ON col.id = c.column_id
               WHERE b2.client_id = b.client_id AND b2.status = 'active' AND LOWER(col.title) NOT LIKE '%conclu%'
             ) as pending_demands_count
      FROM boards b
      GROUP BY b.client_id
    `)
    .all() as Array<{
    client_id: string;
    boards_count: number;
    active_boards_count: number;
    last_board_update: string | null;
    pending_demands_count: number;
  }>;

  const enriched = clients.map((c) => {
    const account = clientUsers.find((u) => u.client_id === c.id);
    const bs = boardStats.find((b) => b.client_id === c.id);
    return {
      ...c,
      portal_enabled: Boolean(c.portal_enabled),
      has_login: Boolean(account),
      login_email: account?.email || c.email,
      login_active: account ? Boolean(account.active) : false,
      boards_count: bs?.boards_count || 0,
      active_boards_count: bs?.active_boards_count || 0,
      pending_demands_count: bs?.pending_demands_count || 0,
      last_activity_at: bs?.last_board_update || c.updated_at,
      contracted_services: JSON.parse(String(c.contracted_services_json || '[]')),
    };
  });

  res.json({ clients: enriched });
});

router.get('/clients/:id/detail', requireAuth, requirePartner, (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }

  const account = db
    .prepare("SELECT id, email, active FROM users WHERE client_id = ? AND role = 'client'")
    .get(req.params.id) as { id: string; email: string; active: number } | undefined;

  const boards = db
    .prepare(`
      SELECT b.*,
             (SELECT COUNT(*) FROM cards c WHERE c.board_id = b.id) as total_cards,
             (SELECT COUNT(*) FROM cards c JOIN board_columns col ON col.id = c.column_id WHERE c.board_id = b.id AND LOWER(col.title) LIKE '%conclu%') as completed_cards,
             (SELECT COUNT(*) FROM cards c WHERE c.board_id = b.id AND c.approval_status = 'pending') as pending_approvals
      FROM boards b
      WHERE b.client_id = ?
      ORDER BY b.updated_at DESC
    `)
    .all(req.params.id) as Array<Record<string, unknown>>;

  const copies = db
    .prepare('SELECT * FROM copies WHERE client_id = ? ORDER BY updated_at DESC')
    .all(req.params.id) as Array<Record<string, unknown>>;

  const financeEntries = db
    .prepare('SELECT * FROM finance_entries WHERE client_id = ? ORDER BY entry_date DESC')
    .all(req.params.id);

  res.json({
    client: {
      ...client,
      portal_enabled: Boolean(client.portal_enabled),
      has_login: Boolean(account),
      login_email: account?.email || client.email,
      login_active: account ? Boolean(account.active) : false,
      contracted_services: JSON.parse(String(client.contracted_services_json || '[]')),
    },
    boards: boards.map((b) => ({
      ...b,
      labels: JSON.parse(String(b.labels_json || '[]')),
      selected_services: JSON.parse(String(b.selected_services_json || '[]')),
      shared_with_client: Boolean(b.shared_with_client),
    })),
    copies: copies.map((cp) => ({
      ...cp,
      attachments: JSON.parse(String(cp.attachments_json || '[]')),
      labels: JSON.parse(String(cp.labels_json || '[]')),
      checklist: JSON.parse(String(cp.checklist_json || '[]')),
      history: JSON.parse(String(cp.history_json || '[]')),
      shared_with_client: Boolean(cp.shared_with_client),
    })),
    finance_entries: financeEntries,
  });
});

router.post('/clients', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const user = req.user!;
  const {
    name,
    company,
    contact_name,
    email,
    phone,
    instagram,
    avatar_url,
    description,
    owner_partner,
    start_date,
    status,
    contracted_services,
    folder_color,
    folder_icon,
    folder_cover_url,
    notes,
    portal_welcome,
    portal_enabled,
    portal_password,
  } = req.body as {
    name?: string;
    company?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
    instagram?: string;
    avatar_url?: string | null;
    description?: string;
    owner_partner?: 'ingrid' | 'mariana';
    start_date?: string;
    status?: 'active' | 'paused' | 'archived';
    contracted_services?: unknown[];
    folder_color?: string;
    folder_icon?: string;
    folder_cover_url?: string | null;
    notes?: string;
    portal_welcome?: string;
    portal_enabled?: boolean;
    portal_password?: string;
  };

  if (!name?.trim() || !email?.trim()) {
    res.status(400).json({ error: 'Informe o nome e o e-mail do cliente.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const clientId = uid('cli');
  const now = new Date().toISOString();

  if (portal_password && portal_password.trim()) {
    const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    if (existingUser) {
      res.status(400).json({ error: 'Já existe uma conta de acesso cadastrada com este e-mail.' });
      return;
    }
  }

  const portalToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
  const rawPin = typeof req.body?.portal_pin === 'string' ? req.body.portal_pin.replace(/\D/g, '').trim() : '';
  const portalPin = rawPin.length >= 4 && rawPin.length <= 6 ? rawPin : String(100000 + crypto.randomInt(0, 900000));

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO clients (
        id, name, company, contact_name, email, phone, instagram, avatar_url, description,
        owner_partner, start_date, status, contracted_services_json,
        folder_color, folder_icon, folder_cover_url,
        notes, portal_welcome, portal_enabled, portal_token, portal_pin, created_by, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      clientId,
      name.trim(),
      company?.trim() || '',
      contact_name?.trim() || '',
      normalizedEmail,
      phone?.trim() || '',
      instagram?.trim() || '',
      avatar_url || null,
      description?.trim() || '',
      owner_partner === 'mariana' ? 'mariana' : 'ingrid',
      start_date || now.slice(0, 10),
      status || 'active',
      JSON.stringify(contracted_services || []),
      folder_color || (owner_partner === 'mariana' ? '#F3ECF9' : '#FDF2F6'),
      folder_icon || 'folder',
      folder_cover_url || null,
      notes?.trim() || '',
      portal_welcome?.trim() || `Olá, ${name.trim()}! Acompanhe tudo o que está acontecendo com seu projeto.`,
      portal_enabled !== false ? 1 : 0,
      portalToken,
      portalPin,
      user.id,
      now,
      now
    );

    if (portal_password && portal_password.trim().length >= 6) {
      const hash = bcrypt.hashSync(portal_password.trim(), 10);
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, partner_key, avatar_url, title, bio, permissions_json, preferences_json, client_id, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'client', NULL, ?, ?, '', '{}', ?, ?, 1, ?, ?)
      `).run(
        uid('usr'),
        name.trim(),
        normalizedEmail,
        hash,
        avatar_url || null,
        company?.trim() || 'Cliente Aumi Studio',
        JSON.stringify(DEFAULT_PREFERENCES),
        clientId,
        now,
        now
      );
    }
  });

  tx();
  logActivity(user.id, user.name, 'create_client', 'client', clientId, `Cadastrou cliente: ${name.trim()}`);
  const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as Record<string, unknown>;
  res.status(201).json({
    client: {
      ...created,
      portal_enabled: Boolean(created.portal_enabled),
      contracted_services: JSON.parse(String(created.contracted_services_json || '[]')),
    },
  });
});

router.put('/clients/:id', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE clients SET
      name = ?, company = ?, contact_name = ?, email = ?, phone = ?, instagram = ?,
      avatar_url = ?, description = ?, owner_partner = ?, start_date = ?, status = ?,
      contracted_services_json = ?, folder_color = ?, folder_icon = ?, folder_cover_url = ?,
      notes = ?, portal_welcome = ?, portal_enabled = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.name !== undefined ? String(body.name).trim() : existing.name,
    body.company !== undefined ? String(body.company).trim() : existing.company,
    body.contact_name !== undefined ? String(body.contact_name).trim() : existing.contact_name,
    body.email !== undefined ? String(body.email).trim().toLowerCase() : existing.email,
    body.phone !== undefined ? String(body.phone).trim() : existing.phone,
    body.instagram !== undefined ? String(body.instagram).trim() : existing.instagram,
    body.avatar_url !== undefined ? body.avatar_url : existing.avatar_url,
    body.description !== undefined ? String(body.description).trim() : existing.description,
    body.owner_partner !== undefined ? body.owner_partner : existing.owner_partner,
    body.start_date !== undefined ? body.start_date : existing.start_date,
    body.status !== undefined ? body.status : existing.status,
    body.contracted_services !== undefined ? JSON.stringify(body.contracted_services) : existing.contracted_services_json,
    body.folder_color !== undefined ? body.folder_color : existing.folder_color,
    body.folder_icon !== undefined ? body.folder_icon : existing.folder_icon,
    body.folder_cover_url !== undefined ? body.folder_cover_url : existing.folder_cover_url,
    body.notes !== undefined ? String(body.notes).trim() : existing.notes,
    body.portal_welcome !== undefined ? String(body.portal_welcome).trim() : existing.portal_welcome,
    body.portal_enabled !== undefined ? (body.portal_enabled ? 1 : 0) : existing.portal_enabled,
    now,
    req.params.id
  );

  if (body.portal_enabled !== undefined) {
    db.prepare("UPDATE users SET active = ? WHERE client_id = ? AND role = 'client'").run(body.portal_enabled ? 1 : 0, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  logActivity(req.user!.id, req.user!.name, 'update_client', 'client', req.params.id, `Atualizou cliente: ${updated.name}`);
  res.json({
    client: {
      ...updated,
      portal_enabled: Boolean(updated.portal_enabled),
      contracted_services: JSON.parse(String(updated.contracted_services_json || '[]')),
    },
  });
});

router.post('/clients/:id/regenerate-portal-link', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }
  const nextToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare('UPDATE clients SET portal_token = ?, updated_at = ? WHERE id = ?').run(nextToken, now, client.id);
  logActivity(req.user!.id, req.user!.name, 'regenerate_portal_link', 'client', client.id, `Gerou novo link exclusivo de portal para ${client.name}`);
  res.json({ ok: true, portal_token: nextToken });
});

router.post('/clients/:id/pin', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const client = db.prepare('SELECT id, name FROM clients WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }
  const { pin, regenerate } = req.body as { pin?: string; regenerate?: boolean };
  let nextPin = '';
  if (regenerate) {
    nextPin = String(100000 + crypto.randomInt(0, 900000));
  } else {
    const clean = (pin || '').replace(/\D/g, '').trim();
    if (clean.length < 4 || clean.length > 6) {
      res.status(400).json({ error: 'Informe um PIN numérico de 4 a 6 dígitos.' });
      return;
    }
    nextPin = clean;
  }
  const nextToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare('UPDATE clients SET portal_pin = ?, portal_token = ?, updated_at = ? WHERE id = ?').run(
    nextPin,
    nextToken,
    now,
    client.id
  );
  logActivity(req.user!.id, req.user!.name, 'update_client_pin', 'client', client.id, `Atualizou PIN do portal de ${client.name}`);
  res.json({ ok: true, portal_pin: nextPin, portal_token: nextToken });
});

router.post('/clients/:id/credentials', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente não encontrado.' });
    return;
  }

  const { email, password, active } = req.body as { email?: string; password?: string; active?: boolean };
  const targetEmail = (email || String(client.email)).trim().toLowerCase();

  const existingAccount = db
    .prepare("SELECT * FROM users WHERE client_id = ? AND role = 'client'")
    .get(req.params.id) as DbUser | undefined;

  const conflict = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
    .get(targetEmail, existingAccount?.id || '');
  if (conflict) {
    res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
    return;
  }

  const now = new Date().toISOString();
  if (existingAccount) {
    const nextHash = password && password.trim().length >= 6 ? bcrypt.hashSync(password.trim(), 10) : existingAccount.password_hash;
    db.prepare('UPDATE users SET email = ?, password_hash = ?, active = ?, updated_at = ? WHERE id = ?').run(
      targetEmail,
      nextHash,
      active !== undefined ? (active ? 1 : 0) : existingAccount.active,
      now,
      existingAccount.id
    );
  } else {
    if (!password || password.trim().length < 6) {
      res.status(400).json({ error: 'Defina uma senha inicial com pelo menos 6 caracteres para o acesso do cliente.' });
      return;
    }
    const hash = bcrypt.hashSync(password.trim(), 10);
    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, partner_key, avatar_url, title, bio, permissions_json, preferences_json, client_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'client', NULL, NULL, ?, '', '{}', ?, ?, ?, ?, ?)
    `).run(
      uid('usr'),
      String(client.name),
      targetEmail,
      hash,
      String(client.company || 'Cliente Aumi Studio'),
      JSON.stringify(DEFAULT_PREFERENCES),
      req.params.id,
      active !== false ? 1 : 0,
      now,
      now
    );
  }

  logActivity(req.user!.id, req.user!.name, 'client_credentials', 'client', req.params.id, `Configurou acesso externo para ${client.name}`);
  res.json({ ok: true, email: targetEmail });
});

router.get('/folders', requireAuth, requirePartner, (req, res) => {
  const owner = req.query.owner as string | undefined;
  const folders = owner
    ? db.prepare('SELECT * FROM folders WHERE portal_owner = ? ORDER BY sort_order ASC, created_at ASC').all(owner)
    : db.prepare('SELECT * FROM folders ORDER BY portal_owner ASC, sort_order ASC').all();
  res.json({ folders });
});

router.post('/folders', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { portal_owner, name, color, cover_url } = req.body as {
    portal_owner?: 'ingrid' | 'mariana';
    name?: string;
    color?: string;
    cover_url?: string;
  };
  if (!portal_owner || !name?.trim()) {
    res.status(400).json({ error: 'Informe a responsável e o nome da pasta.' });
    return;
  }

  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM folders WHERE portal_owner = ?').get(portal_owner) as { m: number }
  ).m;

  const id = uid('fld');
  db.prepare(`
    INSERT INTO folders (id, portal_owner, name, color, cover_url, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, portal_owner, name.trim(), color || '#F3ECF9', cover_url || BOARD_COVERS[0], maxOrder + 1, new Date().toISOString());

  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(id);
  logActivity(req.user!.id, req.user!.name, 'create_folder', 'folder', id, `Criou pasta "${name.trim()}" no portal de ${portal_owner}`);
  res.status(201).json({ folder });
});

router.put('/folders/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Pasta não encontrada.' });
    return;
  }
  const { name, color, cover_url, sort_order } = req.body as {
    name?: string;
    color?: string;
    cover_url?: string;
    sort_order?: number;
  };
  db.prepare('UPDATE folders SET name = ?, color = ?, cover_url = ?, sort_order = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    color !== undefined ? color : existing.color,
    cover_url !== undefined ? cover_url : existing.cover_url,
    sort_order !== undefined ? sort_order : existing.sort_order,
    req.params.id
  );
  const folder = db.prepare('SELECT * FROM folders WHERE id = ?').get(req.params.id);
  res.json({ folder });
});

router.delete('/folders/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  db.prepare('UPDATE boards SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/boards', requireAuth, requirePartner, (req, res) => {
  const portalOwner = req.query.portal_owner as string | undefined;
  const status = req.query.status as string | undefined;

  let query = `
    SELECT b.*, c.name as client_name, c.company as client_company,
      (SELECT COUNT(*) FROM cards WHERE board_id = b.id) as total_cards,
      (SELECT COUNT(*) FROM cards ca JOIN board_columns col ON col.id = ca.column_id WHERE ca.board_id = b.id AND LOWER(col.title) LIKE '%conclu%') as completed_cards,
      (SELECT COUNT(*) FROM cards ca WHERE ca.board_id = b.id AND ca.approval_status = 'pending') as pending_approvals
    FROM boards b
    JOIN clients c ON c.id = b.client_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (portalOwner) {
    query += ' AND b.portal_owner = ?';
    params.push(portalOwner);
  }
  if (status && status !== 'all') {
    query += ' AND b.status = ?';
    params.push(status);
  }
  query += ' ORDER BY b.updated_at DESC';

  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  const boards = rows.map((r) => ({
    ...r,
    labels: JSON.parse(String(r.labels_json || '[]')),
    selected_services: JSON.parse(String(r.selected_services_json || '[]')),
    shared_with_client: Boolean(r.shared_with_client),
  }));

  res.json({ boards });
});

router.get('/boards/resolve-link/:tokenOrId', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const param = req.params.tokenOrId;
  const board = db
    .prepare(`
      SELECT b.*, c.portal_enabled
      FROM boards b
      JOIN clients c ON c.id = b.client_id
      WHERE b.share_token = ? OR b.id = ?
    `)
    .get(param, param) as Record<string, unknown> | undefined;

  if (!board) {
    res.status(404).json({ error: 'Link de quadro não encontrado ou inválido.' });
    return;
  }

  if (user.role === 'client') {
    if (board.client_id !== user.client_id || !board.shared_with_client || !board.portal_enabled || board.status === 'draft') {
      res.status(403).json({ error: 'Você não tem permissão para acessar este quadro ou o compartilhamento foi revogado.' });
      return;
    }
    if (board.invite_status !== 'accepted') {
      const now = new Date().toISOString();
      db.prepare("UPDATE boards SET invite_status = 'accepted', invite_accepted_at = COALESCE(invite_accepted_at, ?) WHERE id = ?").run(now, board.id);
    }
  }

  res.json({
    board_id: board.id,
    portal_owner: board.portal_owner,
    client_id: board.client_id,
  });
});

router.get('/boards/:boardId/access', requireAuth, requirePartner, (req, res) => {
  const board = db
    .prepare(`
      SELECT b.id, b.title, b.client_id, b.shared_with_client, b.share_token, b.invite_status, b.invited_email, b.invite_sent_at, b.invite_accepted_at,
             c.name as client_name, c.email as client_email, c.phone as client_phone, c.portal_enabled, c.portal_token as client_portal_token, c.portal_pin as client_portal_pin
      FROM boards b
      JOIN clients c ON c.id = b.client_id
      WHERE b.id = ?
    `)
    .get(req.params.boardId) as Record<string, unknown> | undefined;

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  let clientPortalToken = board.client_portal_token ? String(board.client_portal_token) : '';
  if (!clientPortalToken) {
    clientPortalToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
    db.prepare('UPDATE clients SET portal_token = ?, updated_at = ? WHERE id = ?').run(
      clientPortalToken,
      new Date().toISOString(),
      board.client_id
    );
  }

  let clientPortalPin = board.client_portal_pin ? String(board.client_portal_pin) : '';
  if (!clientPortalPin) {
    clientPortalPin = String(100000 + crypto.randomInt(0, 900000));
    db.prepare('UPDATE clients SET portal_pin = ?, updated_at = ? WHERE id = ?').run(
      clientPortalPin,
      new Date().toISOString(),
      board.client_id
    );
  }

  const account = db
    .prepare("SELECT id, email, active FROM users WHERE client_id = ? AND role = 'client'")
    .get(board.client_id) as { id: string; email: string; active: number } | undefined;

  res.json({
    access: {
      board_id: board.id,
      board_title: board.title,
      client_id: board.client_id,
      client_name: board.client_name,
      client_email: board.invited_email || account?.email || board.client_email,
      client_phone: board.client_phone || '',
      client_portal_token: clientPortalToken,
      client_portal_pin: clientPortalPin,
      portal_enabled: Boolean(board.portal_enabled),
      shared_with_client: Boolean(board.shared_with_client),
      share_token: board.share_token,
      invite_status: board.invite_status || 'not_invited',
      invite_sent_at: board.invite_sent_at || null,
      invite_accepted_at: board.invite_accepted_at || null,
      has_login: Boolean(account),
      login_active: account ? Boolean(account.active) : false,
    },
  });
});

router.post('/boards/:boardId/invite', requireAuth, requirePermission('can_manage_clients'), (req: AuthRequest, res) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.boardId) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(board.client_id) as Record<string, unknown> | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente vinculado não encontrado.' });
    return;
  }

  const { action, email, password, shared_with_client } = req.body as {
    action?: 'invite' | 'revoke' | 'reactivate';
    email?: string;
    password?: string;
    shared_with_client?: boolean;
  };

  const now = new Date().toISOString();
  const targetEmail = (email || String(board.invited_email || client.email)).trim().toLowerCase();

  if (action === 'revoke') {
    db.prepare(`
      UPDATE boards SET shared_with_client = 0, invite_status = 'not_invited', updated_at = ? WHERE id = ?
    `).run(now, board.id);
    logActivity(req.user!.id, req.user!.name, 'revoke_board_invite', 'board', String(board.id), `Revogou acesso do cliente ao quadro "${board.title}"`);
    res.json({ ok: true, invite_status: 'not_invited', shared_with_client: false });
    return;
  }

  const existingAccount = db
    .prepare("SELECT * FROM users WHERE client_id = ? AND role = 'client'")
    .get(client.id) as DbUser | undefined;

  if (targetEmail) {
    const conflict = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
      .get(targetEmail, existingAccount?.id || '');
    if (conflict) {
      res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
      return;
    }

    if (existingAccount) {
      const nextHash = password && password.trim().length >= 6 ? bcrypt.hashSync(password.trim(), 10) : existingAccount.password_hash;
      db.prepare('UPDATE users SET email = ?, password_hash = ?, active = 1, updated_at = ? WHERE id = ?').run(
        targetEmail,
        nextHash,
        now,
        existingAccount.id
      );
    } else if (password && password.trim().length >= 6) {
      const hash = bcrypt.hashSync(password.trim(), 10);
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, partner_key, avatar_url, title, bio, permissions_json, preferences_json, client_id, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'client', NULL, NULL, ?, '', '{}', ?, ?, 1, ?, ?)
      `).run(
        uid('usr'),
        String(client.name),
        targetEmail,
        hash,
        String(client.company || 'Cliente Aumi Studio'),
        JSON.stringify(DEFAULT_PREFERENCES),
        client.id,
        now,
        now
      );
    } else if (!existingAccount) {
      const autoHash = bcrypt.hashSync(crypto.randomBytes(18).toString('hex'), 10);
      db.prepare(`
        INSERT INTO users (id, name, email, password_hash, role, partner_key, avatar_url, title, bio, permissions_json, preferences_json, client_id, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'client', NULL, NULL, ?, '', '{}', ?, ?, 1, ?, ?)
      `).run(
        uid('usr'),
        String(client.name),
        targetEmail,
        autoHash,
        String(client.company || 'Cliente Aumi Studio'),
        JSON.stringify(DEFAULT_PREFERENCES),
        client.id,
        now,
        now
      );
    }
  }

  const shareToken = board.share_token ? String(board.share_token) : `aumi-brd-${crypto.randomBytes(8).toString('hex')}`;
  const nextShared = shared_with_client !== false ? 1 : 0;
  const nextInviteStatus = action === 'reactivate' && board.invite_accepted_at ? 'accepted' : 'sent';

  db.prepare(`
    UPDATE boards SET
      shared_with_client = ?, visibility = CASE WHEN ? = 1 THEN 'shared' ELSE visibility END,
      share_token = ?, invited_email = ?, invite_status = ?, invite_sent_at = ?, updated_at = ?
    WHERE id = ?
  `).run(nextShared, nextShared, shareToken, targetEmail, nextInviteStatus, now, now, board.id);

  db.prepare("UPDATE clients SET portal_enabled = 1, email = COALESCE(NULLIF(?, ''), email), updated_at = ? WHERE id = ?").run(
    targetEmail,
    now,
    client.id
  );

  const clientUserId = getClientUserId(String(client.id));
  emitStudioEvent({
    actorId: req.user!.id,
    actorName: req.user!.name,
    eventType: 'board_invite',
    entityType: 'board',
    entityId: String(board.id),
    title: `Convite enviado: ${board.title}`,
    message: `${req.user!.name} enviou/ativou o acesso de ${client.name} ao quadro "${board.title}".`,
    boardId: String(board.id),
    clientId: String(client.id),
    visibility: 'shared',
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#F3ECF9',
  });

  logActivity(req.user!.id, req.user!.name, 'invite_board_client', 'board', String(board.id), `Configurou acesso do cliente para "${board.title}"`);
  res.json({ ok: true, share_token: shareToken, invite_status: nextInviteStatus, shared_with_client: Boolean(nextShared) });
});

router.get('/boards/:id', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const board = db
    .prepare(`
      SELECT b.*, c.name as client_name, c.company as client_company, c.email as client_email, c.portal_welcome as client_welcome
      FROM boards b
      JOIN clients c ON c.id = b.client_id
      WHERE b.id = ?
    `)
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (user.role === 'client') {
    if (board.client_id !== user.client_id || !board.shared_with_client || board.status === 'draft') {
      res.status(403).json({ error: 'Você não tem permissão para acessar este quadro.' });
      return;
    }
    if (board.invite_status === 'sent') {
      db.prepare("UPDATE boards SET invite_status = 'accepted', invite_accepted_at = COALESCE(invite_accepted_at, ?) WHERE id = ?").run(
        new Date().toISOString(),
        board.id
      );
    }
  }

  const asClient = user.role === 'client' || req.query.as_client === '1';

  let columns = db
    .prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC')
    .all(board.id) as Array<Record<string, unknown>>;

  if (asClient) {
    columns = columns.filter((col) => Boolean(col.client_visible) && !Boolean(col.archived));
  }

  const hiddenServices = new Set(
    (db.prepare('SELECT id FROM services WHERE visible_in_portal = 0').all() as Array<{ id: string }>).map((s) => s.id)
  );

  const colIds = new Set(columns.map((c) => c.id));
  let cards = db
    .prepare('SELECT * FROM cards WHERE board_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(board.id) as Array<Record<string, unknown>>;

  if (asClient) {
    cards = cards.filter(
      (c) =>
        Boolean(c.client_visible) &&
        colIds.has(c.column_id) &&
        (!c.service_id || !hiddenServices.has(String(c.service_id)))
    );
  }

  const commentsQuery = asClient
    ? 'SELECT * FROM card_comments WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?) AND is_internal = 0 ORDER BY created_at ASC'
    : 'SELECT * FROM card_comments WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?) ORDER BY created_at ASC';

  const attachmentsQuery = asClient
    ? 'SELECT * FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?) AND is_internal = 0 ORDER BY created_at DESC'
    : 'SELECT * FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE board_id = ?) ORDER BY created_at DESC';

  const comments = db.prepare(commentsQuery).all(board.id) as Array<Record<string, unknown>>;
  const attachments = db.prepare(attachmentsQuery).all(board.id) as Array<Record<string, unknown>>;

  const formattedCards = cards.map((card) =>
    formatCardRecord(
      card,
      comments.filter((cm) => cm.card_id === card.id),
      attachments.filter((at) => at.card_id === card.id),
      asClient
    )
  );

  const rawDriveLinks = safeJsonParse<Array<Record<string, unknown>>>(board.drive_links_json, []);
  const rawContractInfo = safeJsonParse<Record<string, unknown>>(board.contract_info_json, {});
  const rawBriefingInfo = safeJsonParse<Record<string, unknown>>(board.briefing_info_json, {});
  const rawProcessState = safeJsonParse<Record<string, boolean>>(board.process_state_json, {});

  const safeDriveLinks = asClient ? rawDriveLinks.filter((l) => !l.is_internal) : rawDriveLinks;
  const safeContractInfo = asClient ? sanitizeContractInfoForClient(rawContractInfo) : rawContractInfo;
  const safeBriefingInfo = asClient ? sanitizeBriefingInfoForClient(rawBriefingInfo) : rawBriefingInfo;

  const selectedServices = safeJsonParse<Array<{ service_id?: string }>>(board.selected_services_json, []);
  const selectedIds = selectedServices.map((s) => s.service_id).filter(Boolean) as string[];
  let servicesMeta: Array<Record<string, unknown>> = [];
  if (selectedIds.length > 0) {
    const placeholders = selectedIds.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT id, name, color, category, process_steps_json, visible_in_portal FROM services WHERE id IN (${placeholders})`)
      .all(...selectedIds) as Array<Record<string, unknown>>;
    servicesMeta = rows
      .filter((s) => !asClient || Boolean(s.visible_in_portal))
      .map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        category: s.category,
        visible_in_portal: Boolean(s.visible_in_portal),
        process_steps: safeJsonParse(s.process_steps_json, []),
      }));
  }

  const eventsQuery =
    asClient
      ? `SELECT e.*, cl.name as client_name, b.title as board_title
         FROM studio_events e
         LEFT JOIN clients cl ON cl.id = e.client_id
         LEFT JOIN boards b ON b.id = e.board_id
         WHERE (e.board_id = ? OR (e.board_id IS NULL AND e.client_id = ?)) AND e.type != 'internal'
         ORDER BY e.event_date ASC, e.event_time ASC`
      : `SELECT e.*, cl.name as client_name, b.title as board_title
         FROM studio_events e
         LEFT JOIN clients cl ON cl.id = e.client_id
         LEFT JOIN boards b ON b.id = e.board_id
         WHERE e.board_id = ? OR (e.board_id IS NULL AND e.client_id = ?)
         ORDER BY e.event_date ASC, e.event_time ASC`;
  const boardEvents = db.prepare(eventsQuery).all(board.id, board.client_id);

  const formattedBoard: Record<string, unknown> = {
    ...board,
    labels: safeJsonParse(board.labels_json, []),
    selected_services: selectedServices,
    drive_links: safeDriveLinks,
    contract_info: safeContractInfo,
    briefing_info: safeBriefingInfo,
    process_state: rawProcessState,
    shared_with_client: Boolean(board.shared_with_client),
  };
  if (asClient) {
    delete formattedBoard.initial_notes;
    delete formattedBoard.share_token;
    delete formattedBoard.invited_email;
    delete formattedBoard.total_value;
  }

  const rawDeliveries = db
    .prepare(`
      SELECT d.*, c.title as card_title, c.service_name as card_service_name
      FROM approval_deliveries d
      LEFT JOIN cards c ON c.id = d.card_id
      WHERE d.board_id = ?
      ORDER BY d.updated_at DESC, d.created_at DESC
    `)
    .all(board.id) as Array<Record<string, unknown>>;
  const approvalDeliveries = rawDeliveries.map(formatApprovalDeliveryRow);

  res.json({
    board: formattedBoard,
    columns: columns.map((c) => ({
      ...c,
      archived: Boolean(c.archived),
      client_visible: Boolean(c.client_visible),
    })),
    cards: formattedCards,
    events: boardEvents,
    services_meta: servicesMeta,
    approval_deliveries: approvalDeliveries,
  });
});

router.post('/boards', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    portal_owner?: 'ingrid' | 'mariana';
    folder_id?: string | null;
    client_id?: string;
    title?: string;
    description?: string;
    cover_url?: string;
    lead_user_id?: string;
    collaborator_user_id?: string | null;
    start_date?: string;
    deadline?: string;
    priority?: string;
    labels?: string[];
    status?: 'draft' | 'active';
    visibility?: 'internal' | 'shared';
    shared_with_client?: boolean;
    initial_notes?: string;
    selected_services?: Array<{
      service_id: string;
      service_name: string;
      package_id: string;
      package_name: string;
      price: number;
      deliverables: Array<{
        name: string;
        format: string;
        qty: number;
        deadline_days?: number;
        guidelines?: string;
        requires_approval?: boolean;
      }>;
    }>;
    add_default_checklist?: boolean;
    create_finance_entry?: boolean;
    finance_payment_method?: string;
    finance_due_date?: string;
  };

  if (!body.client_id || !body.title?.trim()) {
    res.status(400).json({ error: 'Selecione um cliente e informe o nome do quadro.' });
    return;
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(body.client_id) as Record<string, unknown> | undefined;
  if (!client) {
    res.status(404).json({ error: 'Cliente selecionado não encontrado.' });
    return;
  }

  const leadId = body.lead_user_id || user.id;
  const leadUser = db.prepare('SELECT partner_key, name FROM users WHERE id = ?').get(leadId) as { partner_key: string; name: string } | undefined;
  const portalOwner = body.portal_owner || (leadUser?.partner_key === 'mariana' ? 'mariana' : 'ingrid');

  const boardId = uid('brd');
  const shareToken = `aumi-brd-${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const selectedServices = body.selected_services || [];
  const totalValue = selectedServices.reduce((acc, s) => acc + (Number(s.price) || 0), 0);

  const defColRow = db.prepare("SELECT value_json FROM studio_settings WHERE key = 'default_columns'").get() as { value_json: string } | undefined;
  const defaultColumns: Array<{ title: string; color: string; client_visible: boolean; client_label?: string; client_description?: string }> = defColRow
    ? JSON.parse(defColRow.value_json)
    : [
        { title: 'Comece aqui', color: '#7A689C', client_visible: true, client_label: 'Comece aqui', client_description: 'Demandas iniciais e envio de informações pelo cliente.' },
        { title: 'Em produção', color: '#EC2B82', client_visible: true, client_label: 'Em produção', client_description: 'Demandas e materiais em criação pela equipe.' },
        { title: 'Aprovação', color: '#BC9FE6', client_visible: true, client_label: 'Aprovação', client_description: 'Entregas prontas aguardando análise ou retorno.' },
        { title: 'Concluídos', color: '#C8C978', client_visible: true, client_label: 'Concluídos', client_description: 'Demandas finalizadas e entregues.' },
      ];

  let generatedCardsCount = 0;
  const serviceRows = db.prepare('SELECT id, client_requirements_json, client_info_needed, visible_in_portal FROM services').all() as Array<{
    id: string;
    client_requirements_json: string;
    client_info_needed: string;
    visible_in_portal: number;
  }>;
  const delivRows = db.prepare('SELECT service_id, name, extra_fields_json FROM service_deliverables').all() as Array<{
    service_id: string;
    name: string;
    extra_fields_json: string;
  }>;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO boards (
        id, portal_owner, folder_id, client_id, title, description, cover_url,
        lead_user_id, collaborator_user_id, start_date, deadline, priority, labels_json,
        status, visibility, shared_with_client, share_token, invite_status, invited_email,
        selected_services_json, initial_notes, total_value, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_invited', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      boardId,
      portalOwner,
      body.folder_id || null,
      body.client_id,
      body.title!.trim(),
      body.description?.trim() || '',
      body.cover_url || BOARD_COVERS[0],
      leadId,
      body.collaborator_user_id || null,
      body.start_date || now.slice(0, 10),
      body.deadline || null,
      body.priority || 'normal',
      JSON.stringify(body.labels || []),
      body.status === 'draft' ? 'draft' : 'active',
      body.visibility === 'internal' ? 'internal' : 'shared',
      body.shared_with_client !== false && body.visibility !== 'internal' ? 1 : 0,
      shareToken,
      String(client.email || ''),
      JSON.stringify(selectedServices),
      body.initial_notes?.trim() || '',
      totalValue,
      user.id,
      now,
      now
    );

    const insertCol = db.prepare(`
      INSERT INTO board_columns (id, board_id, title, color, sort_order, archived, client_visible, client_label, client_description)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);

    let firstColumnId = '';
    defaultColumns.forEach((col, idx) => {
      const colId = uid('col');
      if (idx === 0) firstColumnId = colId;
      insertCol.run(
        colId,
        boardId,
        col.title,
        col.color || '#BC9FE6',
        idx,
        col.client_visible !== false ? 1 : 0,
        col.client_label === 'Enviar copy' ? 'Enviar conteúdo' : col.client_label || col.title,
        col.client_description || ''
      );
    });

    const insertCard = db.prepare(`
      INSERT INTO cards (
        id, board_id, column_id, title, description, service_id, service_name,
        package_id, package_name, format, lead_user_id, collaborator_user_id,
        due_date, publish_date, priority, labels_json, checklist_json,
        references_text, copy_text, internal_notes, client_visible,
        requires_approval, approval_status, approval_feedback,
        content_status, content_feedback, client_fields_json, submitted_content_json, history_json,
        sort_order, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, '', '', '', 1, ?, 'none', '', 'awaiting_content', '', ?, '{}', ?, ?, ?, ?, ?)
    `);

    let orderIdx = 0;
    for (const svc of selectedServices) {
      const svcMeta = serviceRows.find((r) => r.id === svc.service_id);
      // Only services configured to appear in the Portal do Cliente auto-generate demands
      if (svcMeta && svcMeta.visible_in_portal === 0) {
        continue;
      }
      const baseReqs = svcMeta ? safeJsonParse<Array<{ key: string; label: string; type: string; required?: boolean }>>(svcMeta.client_requirements_json, []) : [];

      for (const deliv of svc.deliverables || []) {
        const qty = Math.max(1, Number(deliv.qty) || 1);
        const matchedDeliv = delivRows.find((d) => d.service_id === svc.service_id && d.name === deliv.name);
        const delivExtra = matchedDeliv ? safeJsonParse<string[]>(matchedDeliv.extra_fields_json, []) : [];

        const mergedFields: Array<{ key: string; label: string; type: string; required?: boolean }> = [...baseReqs];
        for (const extraLabel of delivExtra) {
          if (extraLabel && !mergedFields.some((f) => f.label.toLowerCase() === extraLabel.toLowerCase())) {
            mergedFields.push({
              key: `fld_${extraLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
              label: extraLabel,
              type: 'text',
              required: false,
            });
          }
        }
        if (mergedFields.length === 0 && svcMeta?.client_info_needed) {
          mergedFields.push({
            key: 'briefing_info',
            label: svcMeta.client_info_needed,
            type: 'textarea',
            required: false,
          });
        }

        for (let i = 1; i <= qty; i++) {
          const cardTitle = qty > 1 ? `${deliv.name} #${String(i).padStart(2, '0')}` : deliv.name;
          let dueDate = body.deadline || null;
          if (!dueDate && deliv.deadline_days) {
            dueDate = new Date(Date.now() + Number(deliv.deadline_days) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          }
          const checklist = body.add_default_checklist
            ? [
                { id: uid('chk'), text: 'Receber briefing e materiais do cliente', done: false },
                { id: uid('chk'), text: 'Produzir arte / material', done: false },
                { id: uid('chk'), text: 'Revisão interna Aumi', done: false },
                { id: uid('chk'), text: 'Enviar para aprovação', done: false },
              ]
            : [];

          const initialHistory = appendCardHistory('[]', user.id, user.name, 'created', `Entrega gerada a partir de ${svc.service_name} (${svc.package_name})`);

          insertCard.run(
            uid('crd'),
            boardId,
            firstColumnId,
            cardTitle,
            deliv.guidelines || `Entrega referente ao pacote ${svc.package_name} (${svc.service_name}).`,
            svc.service_id,
            svc.service_name,
            svc.package_id,
            svc.package_name,
            deliv.format || 'Digital',
            leadId,
            body.collaborator_user_id || null,
            dueDate,
            body.priority || 'normal',
            JSON.stringify(body.labels || []),
            JSON.stringify(checklist),
            deliv.requires_approval !== false ? 1 : 0,
            JSON.stringify(mergedFields),
            initialHistory,
            orderIdx++,
            user.id,
            now,
            now
          );
          generatedCardsCount++;
        }
      }
    }

    if (body.create_finance_entry && totalValue > 0 && body.status !== 'draft') {
      db.prepare(`
        INSERT INTO finance_entries (
          id, type, description, amount, category, entry_date, due_date, status,
          client_id, service_id, board_id, payment_method, notes, created_by, created_at, updated_at
        ) VALUES (?, 'income', ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('fin'),
        `Projeto: ${body.title!.trim()} (${client.name})`,
        totalValue,
        'Serviços Criativos',
        now.slice(0, 10),
        body.finance_due_date || body.deadline || now.slice(0, 10),
        body.client_id,
        selectedServices[0]?.service_id || null,
        boardId,
        body.finance_payment_method || 'Pix',
        `Gerado automaticamente na criação do quadro (${selectedServices.map((s) => s.service_name).join(', ')}).`,
        user.id,
        now,
        now
      );
    }
  });

  tx();

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'board_created',
    entityType: 'board',
    entityId: boardId,
    title: `Novo projeto criado: ${body.title.trim()}`,
    message: `${user.name} criou o quadro "${body.title.trim()}" para ${client.name} com ${generatedCardsCount} entregas.`,
    boardId,
    clientId: String(client.id),
    visibility: 'shared',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: body.collaborator_user_id ? [body.collaborator_user_id] : [],
    linkTab: 'portal',
    linkEntityId: boardId,
    color: '#F3ECF9',
  });

  logActivity(
    user.id,
    user.name,
    'create_board',
    'board',
    boardId,
    `Criou quadro "${body.title.trim()}" com ${generatedCardsCount} entregas geradas`
  );

  const created = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
  res.status(201).json({ board: created, generated_cards: generatedCardsCount });
});

router.put('/boards/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE boards SET
      portal_owner = ?, folder_id = ?, title = ?, description = ?, cover_url = ?,
      lead_user_id = ?, collaborator_user_id = ?, deadline = ?, priority = ?,
      labels_json = ?, status = ?, visibility = ?, shared_with_client = ?,
      initial_notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.portal_owner !== undefined ? body.portal_owner : existing.portal_owner,
    body.folder_id !== undefined ? body.folder_id : existing.folder_id,
    body.title !== undefined ? String(body.title).trim() : existing.title,
    body.description !== undefined ? String(body.description) : existing.description,
    body.cover_url !== undefined ? body.cover_url : existing.cover_url,
    body.lead_user_id !== undefined ? body.lead_user_id : existing.lead_user_id,
    body.collaborator_user_id !== undefined ? body.collaborator_user_id : existing.collaborator_user_id,
    body.deadline !== undefined ? body.deadline : existing.deadline,
    body.priority !== undefined ? body.priority : existing.priority,
    body.labels !== undefined ? JSON.stringify(body.labels) : existing.labels_json,
    body.status !== undefined ? body.status : existing.status,
    body.visibility !== undefined ? body.visibility : existing.visibility,
    body.shared_with_client !== undefined ? (body.shared_with_client ? 1 : 0) : existing.shared_with_client,
    body.initial_notes !== undefined ? String(body.initial_notes) : existing.initial_notes,
    now,
    req.params.id
  );

  logActivity(req.user!.id, req.user!.name, 'update_board', 'board', req.params.id, `Atualizou quadro "${body.title || existing.title}"`);
  const updated = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id);
  res.json({ board: updated });
});

router.patch('/boards/:id/move-folder', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { folder_id, portal_owner } = req.body as { folder_id?: string | null; portal_owner?: 'ingrid' | 'mariana' };
  const existing = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  db.prepare('UPDATE boards SET folder_id = ?, portal_owner = ?, updated_at = ? WHERE id = ?').run(
    folder_id !== undefined ? folder_id : existing.folder_id,
    portal_owner || existing.portal_owner,
    new Date().toISOString(),
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/boards/:id', requireAuth, requirePermission('can_delete_boards'), (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT title FROM boards WHERE id = ?').get(req.params.id) as { title: string } | undefined;
  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_board', 'board', req.params.id, `Excluiu quadro "${existing?.title || req.params.id}"`);
  res.json({ ok: true });
});

router.put('/boards/:id/workspace-meta', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }
  const { drive_links, contract_info, briefing_info, process_state } = req.body as {
    drive_links?: unknown[];
    contract_info?: Record<string, unknown>;
    briefing_info?: Record<string, unknown>;
    process_state?: Record<string, boolean>;
  };
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE boards SET
      drive_links_json = ?, contract_info_json = ?, briefing_info_json = ?, process_state_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    drive_links !== undefined ? JSON.stringify(drive_links) : existing.drive_links_json,
    contract_info !== undefined ? JSON.stringify(contract_info) : existing.contract_info_json,
    briefing_info !== undefined ? JSON.stringify(briefing_info) : existing.briefing_info_json || '{}',
    process_state !== undefined ? JSON.stringify(process_state) : existing.process_state_json,
    now,
    req.params.id
  );
  res.json({ ok: true });
});

router.post('/boards/:boardId/columns', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { title, color, cover_url, client_visible, client_label, client_description } = req.body as {
    title?: string;
    color?: string;
    cover_url?: string | null;
    client_visible?: boolean;
    client_label?: string;
    client_description?: string;
  };
  if (!title?.trim()) {
    res.status(400).json({ error: 'Informe o nome da coluna.' });
    return;
  }
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM board_columns WHERE board_id = ?').get(req.params.boardId) as { m: number }
  ).m;

  const colId = uid('col');
  db.prepare(`
    INSERT INTO board_columns (id, board_id, title, color, cover_url, sort_order, archived, client_visible, client_label, client_description)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `).run(
    colId,
    req.params.boardId,
    title.trim(),
    color || '#BC9FE6',
    cover_url || null,
    maxOrder + 1,
    client_visible !== false ? 1 : 0,
    client_label?.trim() || title.trim(),
    client_description?.trim() || ''
  );

  const column = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(colId);
  res.status(201).json({ column });
});

router.put('/columns/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }
  const { title, color, cover_url, archived, client_visible, client_label, client_description, sort_order } = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE board_columns SET
      title = ?, color = ?, cover_url = ?, archived = ?, client_visible = ?, client_label = ?, client_description = ?, sort_order = ?
    WHERE id = ?
  `).run(
    title !== undefined ? String(title).trim() : existing.title,
    color !== undefined ? String(color) : existing.color,
    cover_url !== undefined ? (cover_url ? String(cover_url) : null) : existing.cover_url,
    archived !== undefined ? (archived ? 1 : 0) : existing.archived,
    client_visible !== undefined ? (client_visible ? 1 : 0) : existing.client_visible,
    client_label !== undefined ? String(client_label).trim() : existing.client_label,
    client_description !== undefined ? String(client_description).trim() : existing.client_description,
    sort_order !== undefined ? Number(sort_order) : existing.sort_order,
    req.params.id
  );
  const column = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id);
  res.json({ column });
});

router.put('/boards/:boardId/columns/reorder', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { column_ids } = req.body as { column_ids: string[] };
  if (!Array.isArray(column_ids)) {
    res.status(400).json({ error: 'Ordem inválida.' });
    return;
  }
  const stmt = db.prepare('UPDATE board_columns SET sort_order = ? WHERE id = ? AND board_id = ?');
  const tx = db.transaction(() => {
    column_ids.forEach((id, idx) => stmt.run(idx, id, req.params.boardId));
  });
  tx();
  res.json({ ok: true });
});

router.delete('/columns/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(req.params.id) as { id: string; board_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }
  const siblings = db
    .prepare('SELECT id FROM board_columns WHERE board_id = ? AND id != ? ORDER BY sort_order ASC')
    .all(existing.board_id, existing.id) as Array<{ id: string }>;
  if (siblings.length === 0) {
    res.status(400).json({ error: 'O quadro precisa ter pelo menos uma coluna ativa.' });
    return;
  }
  const fallbackColId = siblings[0].id;
  db.transaction(() => {
    db.prepare('UPDATE cards SET column_id = ? WHERE column_id = ?').run(fallbackColId, existing.id);
    db.prepare('DELETE FROM board_columns WHERE id = ?').run(existing.id);
  })();
  res.json({ ok: true, fallback_column_id: fallbackColId });
});

router.post('/boards/:boardId/cards', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as Record<string, unknown>;
  if (!String(body.title || '').trim() || !body.column_id) {
    res.status(400).json({ error: 'Informe o título e a coluna da entrega.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.boardId) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (user.role === 'client') {
    if (board.client_id !== user.client_id || !board.shared_with_client) {
      res.status(403).json({ error: 'Sem permissão para criar demanda neste projeto.' });
      return;
    }
  }

  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM cards WHERE column_id = ?').get(body.column_id) as { m: number }
  ).m;

  const cardId = uid('crd');
  const now = new Date().toISOString();
  const isClientCreator = user.role === 'client';

  db.prepare(`
    INSERT INTO cards (
      id, board_id, column_id, title, description, service_id, service_name,
      package_id, package_name, format, lead_user_id, collaborator_user_id,
      due_date, publish_date, priority, labels_json, checklist_json,
      references_text, copy_text, internal_notes, extra_notes, links_json, hidden_sections_json,
      client_visible, requires_approval, approval_status, approval_feedback,
      content_status, content_feedback, client_fields_json, submitted_content_json, history_json,
      sort_order, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, '', ?, '', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cardId,
    req.params.boardId,
    body.column_id,
    String(body.title).trim(),
    String(body.description || ''),
    body.service_id || null,
    String(body.service_name || ''),
    body.package_id || null,
    String(body.package_name || ''),
    String(body.format || ''),
    isClientCreator ? board.lead_user_id : body.lead_user_id || user.id,
    isClientCreator ? null : body.collaborator_user_id || null,
    body.due_date || null,
    body.publish_date || null,
    String(body.priority || 'normal'),
    JSON.stringify(body.labels || []),
    JSON.stringify(body.checklist || []),
    String(body.references_text || ''),
    String(body.copy_text || ''),
    isClientCreator ? '' : String(body.internal_notes || ''),
    String(body.extra_notes || ''),
    JSON.stringify(body.links || []),
    isClientCreator ? 1 : body.client_visible !== false ? 1 : 0,
    body.requires_approval !== false ? 1 : 0,
    body.approval_status || 'none',
    isClientCreator ? 'submitted' : String(body.content_status || 'awaiting_content'),
    JSON.stringify(body.client_fields || []),
    JSON.stringify(body.submitted_content || {}),
    appendCardHistory('[]', user.id, user.name, 'created', `Demanda criada por ${user.name}`),
    maxOrder + 1,
    user.id,
    now,
    now
  );

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, req.params.boardId);
  if (isClientCreator) {
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'client_content',
      entityType: 'card',
      entityId: cardId,
      title: `Nova demanda do cliente: ${String(body.title).trim()}`,
      message: `${user.name} adicionou a demanda "${String(body.title).trim()}" em ${board.title}.`,
      boardId: String(board.id),
      clientId: String(board.client_id),
      cardId,
      visibility: 'shared',
      postToStudioMural: false,
      postToBoardMural: true,
      notifyUserIds: [String(board.lead_user_id), String(board.collaborator_user_id || '')],
      linkTab: 'portal',
      linkEntityId: String(board.id),
      color: '#FDF2F6',
    });
  } else {
    const isClientVis = body.client_visible !== false;
    const clientUserId = isClientVis ? getClientUserId(String(board.client_id)) : null;
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'card_created',
      entityType: 'card',
      entityId: cardId,
      title: `Nova demanda adicionada: ${String(body.title).trim()}`,
      message: `${user.name} adicionou a demanda "${String(body.title).trim()}" no quadro ${board.title}.`,
      boardId: String(board.id),
      clientId: String(board.client_id),
      cardId,
      visibility: isClientVis ? 'shared' : 'internal',
      postToStudioMural: false,
      postToBoardMural: true,
      notifyUserIds: clientUserId ? [clientUserId] : [],
      linkTab: 'portal',
      linkEntityId: String(board.id),
      color: '#F3ECF9',
    });
  }
  logActivity(user.id, user.name, 'create_card', 'card', cardId, `Criou entrega: ${String(body.title).trim()}`);

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as Record<string, unknown>;
  res.status(201).json({
    card: formatCardRecord(card, [], [], isClientCreator),
  });
});

router.put('/cards/:id', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  if (user.role === 'client') {
    const board = db.prepare('SELECT id, title, client_id, shared_with_client, lead_user_id, collaborator_user_id FROM boards WHERE id = ?').get(existing.board_id) as {
      id: string;
      title: string;
      client_id: string;
      shared_with_client: number;
      lead_user_id: string;
      collaborator_user_id: string | null;
    };
    if (board.client_id !== user.client_id || !board.shared_with_client || !existing.client_visible) {
      res.status(403).json({ error: 'Sem permissão para editar este item.' });
      return;
    }

    const hiddenSections = safeJsonParse<Record<string, boolean>>(existing.hidden_sections_json, {});
    const existingSubmitted = safeJsonParse<Record<string, unknown>>(existing.submitted_content_json, {});
    const incomingSubmitted = (body.submitted_content as Record<string, unknown> | undefined) || existingSubmitted;

    const mergedSubmitted = {
      ...existingSubmitted,
      ...incomingSubmitted,
      notes: hiddenSections.observations ? existingSubmitted.notes : incomingSubmitted.notes ?? existingSubmitted.notes,
      answers: hiddenSections.extra_info ? existingSubmitted.answers : incomingSubmitted.answers ?? existingSubmitted.answers,
      submitted_at: now,
      submitted_by: user.name,
    };

    const nextHistory = appendCardHistory(
      existing.history_json,
      user.id,
      user.name,
      'content_submitted',
      `Material/informações atualizadas por ${user.name}`
    );

    db.prepare(`
      UPDATE cards SET
        title = ?, description = ?, priority = ?, checklist_json = ?,
        references_text = ?, extra_notes = ?, links_json = ?,
        submitted_content_json = ?, content_status = 'submitted',
        history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.title !== undefined && String(body.title).trim() ? String(body.title).trim() : existing.title,
      body.description !== undefined ? String(body.description) : existing.description,
      body.priority !== undefined ? String(body.priority) : existing.priority,
      hiddenSections.checklist || body.checklist === undefined ? existing.checklist_json : JSON.stringify(body.checklist),
      hiddenSections.references || body.references_text === undefined ? existing.references_text : String(body.references_text),
      hiddenSections.notes || body.extra_notes === undefined ? existing.extra_notes : String(body.extra_notes),
      hiddenSections.references || body.links === undefined ? existing.links_json : JSON.stringify(body.links),
      JSON.stringify(mergedSubmitted),
      nextHistory,
      now,
      req.params.id
    );

    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

    if (body.notify_team !== false) {
      emitStudioEvent({
        actorId: user.id,
        actorName: user.name,
        eventType: 'client_content',
        entityType: 'card',
        entityId: String(existing.id),
        title: `Conteúdo enviado: ${body.title || existing.title}`,
        message: `${user.name} enviou informações em "${body.title || existing.title}" (${board.title}).`,
        boardId: board.id,
        clientId: board.client_id,
        cardId: String(existing.id),
        visibility: 'shared',
        postToStudioMural: false,
        postToBoardMural: true,
        notifyUserIds: [board.lead_user_id, board.collaborator_user_id || ''],
        linkTab: 'portal',
        linkEntityId: board.id,
        color: '#FDF2F6',
      });
    }

    const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    const cmts = db.prepare('SELECT * FROM card_comments WHERE card_id = ? AND is_internal = 0 ORDER BY created_at ASC').all(req.params.id) as Array<Record<string, unknown>>;
    const atts = db.prepare('SELECT * FROM card_attachments WHERE card_id = ? AND is_internal = 0 ORDER BY created_at DESC').all(req.params.id) as Array<Record<string, unknown>>;
    res.json({ card: formatCardRecord(updated, cmts, atts, true) });
    return;
  }

  db.prepare(`
    UPDATE cards SET
      column_id = ?, title = ?, description = ?, service_id = ?, service_name = ?,
      package_id = ?, package_name = ?, format = ?, lead_user_id = ?, collaborator_user_id = ?,
      due_date = ?, publish_date = ?, priority = ?, labels_json = ?, checklist_json = ?,
      references_text = ?, copy_text = ?, internal_notes = ?, extra_notes = ?, links_json = ?,
      hidden_sections_json = ?, client_visible = ?, requires_approval = ?, approval_status = ?,
      client_fields_json = ?, submitted_content_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.column_id !== undefined ? body.column_id : existing.column_id,
    body.title !== undefined ? String(body.title).trim() : existing.title,
    body.description !== undefined ? String(body.description) : existing.description,
    body.service_id !== undefined ? body.service_id : existing.service_id,
    body.service_name !== undefined ? String(body.service_name) : existing.service_name,
    body.package_id !== undefined ? body.package_id : existing.package_id,
    body.package_name !== undefined ? String(body.package_name) : existing.package_name,
    body.format !== undefined ? String(body.format) : existing.format,
    body.lead_user_id !== undefined ? body.lead_user_id : existing.lead_user_id,
    body.collaborator_user_id !== undefined ? body.collaborator_user_id : existing.collaborator_user_id,
    body.due_date !== undefined ? body.due_date : existing.due_date,
    body.publish_date !== undefined ? body.publish_date : existing.publish_date,
    body.priority !== undefined ? body.priority : existing.priority,
    body.labels !== undefined ? JSON.stringify(body.labels) : existing.labels_json,
    body.checklist !== undefined ? JSON.stringify(body.checklist) : existing.checklist_json,
    body.references_text !== undefined ? String(body.references_text) : existing.references_text,
    body.copy_text !== undefined ? String(body.copy_text) : existing.copy_text,
    body.internal_notes !== undefined ? String(body.internal_notes) : existing.internal_notes,
    body.extra_notes !== undefined ? String(body.extra_notes) : existing.extra_notes,
    body.links !== undefined ? JSON.stringify(body.links) : existing.links_json,
    body.hidden_sections !== undefined ? JSON.stringify(body.hidden_sections) : existing.hidden_sections_json,
    body.client_visible !== undefined ? (body.client_visible ? 1 : 0) : existing.client_visible,
    body.requires_approval !== undefined ? (body.requires_approval ? 1 : 0) : existing.requires_approval,
    body.approval_status !== undefined ? body.approval_status : existing.approval_status,
    body.client_fields !== undefined ? JSON.stringify(body.client_fields) : existing.client_fields_json,
    body.submitted_content !== undefined ? JSON.stringify(body.submitted_content) : existing.submitted_content_json,
    now,
    req.params.id
  );

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);
  logActivity(user.id, user.name, 'update_card', 'card', req.params.id, `Atualizou entrega: ${body.title || existing.title}`);

  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  const boardRow = db.prepare('SELECT id, title, client_id FROM boards WHERE id = ?').get(existing.board_id) as { id: string; title: string; client_id: string } | undefined;
  if (boardRow) {
    const isSharedUpdate = Boolean(updated.client_visible);
    const clientUserId = isSharedUpdate ? getClientUserId(boardRow.client_id) : null;
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'card_updated',
      entityType: 'card',
      entityId: String(existing.id),
      title: `Demanda atualizada: ${String(updated.title)}`,
      message: `${user.name} atualizou informações da demanda "${String(updated.title)}" em ${boardRow.title}.`,
      boardId: boardRow.id,
      clientId: boardRow.client_id,
      cardId: String(existing.id),
      visibility: isSharedUpdate ? 'shared' : 'internal',
      postToStudioMural: false,
      postToBoardMural: true,
      notifyUserIds: clientUserId ? [clientUserId] : [],
      linkTab: 'portal',
      linkEntityId: boardRow.id,
      color: '#F3ECF9',
    });
  }

  res.json({
    card: formatCardRecord(updated, [], [], false),
  });
});

router.post('/cards/:id/mark-read', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { read } = (req.body || {}) as { read?: boolean };
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(existing.board_id) as Record<string, unknown>;
  const now = new Date().toISOString();

  if (read === false) {
    const submitted = safeJsonParse<Record<string, unknown>>(existing.submitted_content_json, {});
    const hasSubmitted = Boolean(submitted.submitted_at || String(submitted.text || '').trim() || String(submitted.notes || '').trim());
    const revertedStatus =
      existing.content_status === 'content_approved' && hasSubmitted
        ? 'submitted'
        : String(existing.content_status || 'awaiting_content');

    const nextHistory = appendCardHistory(
      existing.history_json,
      user.id,
      user.name,
      'unmarked_read',
      `Visualização desmarcada por ${user.name}`
    );

    db.prepare(`
      UPDATE cards SET
        read_at = NULL, read_by_id = NULL, read_by_name = NULL,
        content_status = ?, history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(revertedStatus, nextHistory, now, existing.id);
    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

    logActivity(user.id, user.name, 'unmark_card_read', 'card', String(existing.id), `Desmarcou visualização de "${existing.title}"`);
    res.json({ ok: true, read_at: null, read_by_id: null, read_by_name: null, content_status: revertedStatus });
    return;
  }

  const nextHistory = appendCardHistory(
    existing.history_json,
    user.id,
    user.name,
    'marked_read',
    `Material marcado como visto por ${user.name}`
  );

  db.prepare(`
    UPDATE cards SET
      read_at = ?, read_by_id = ?, read_by_name = ?,
      content_status = CASE WHEN content_status = 'submitted' THEN 'content_approved' ELSE content_status END,
      history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(now, user.id, user.name, nextHistory, now, existing.id);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'card_read',
    entityType: 'card',
    entityId: String(existing.id),
    title: `Material visualizado: ${existing.title}`,
    message: `${user.name} visualizou e confirmou o recebimento dos materiais de "${existing.title}".`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(existing.id),
    visibility: 'shared',
    postToStudioMural: false,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#F4F5E2',
  });

  logActivity(user.id, user.name, 'mark_card_read', 'card', String(existing.id), `Marcou como visto: "${existing.title}"`);
  res.json({ ok: true, read_at: now, read_by_id: user.id, read_by_name: user.name });
});

router.post('/cards/:id/mini-updates', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { label, option_id, bg, text } = (req.body || {}) as {
    label?: string;
    option_id?: string | null;
    bg?: string;
    text?: string;
  };
  const cleanLabel = String(label || '').trim();
  if (!cleanLabel) {
    res.status(400).json({ error: 'Informe o texto da atualização.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(existing.board_id) as Record<string, unknown>;
  const now = new Date().toISOString();

  const currentUpdates = safeJsonParse<
    Array<{
      id: string;
      option_id?: string | null;
      label: string;
      bg: string;
      text: string;
      author_id: string;
      author_name: string;
      created_at: string;
    }>
  >(existing.mini_updates_json, []);

  const newRecord = {
    id: uid('cmu'),
    option_id: option_id || null,
    label: cleanLabel,
    bg: String(bg || '#F3ECF9').trim(),
    text: String(text || '#2F1534').trim(),
    author_id: user.id,
    author_name: user.name,
    created_at: now,
  };

  const nextUpdates = [newRecord, ...currentUpdates].slice(0, 80);
  const nextHistory = appendCardHistory(
    existing.history_json,
    user.id,
    user.name,
    'mini_update',
    `Atualização enviada ao cliente: ${cleanLabel}`
  );

  db.prepare(`
    UPDATE cards SET
      mini_updates_json = ?,
      history_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(nextUpdates), nextHistory, now, existing.id);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'card_mini_update',
    entityType: 'card',
    entityId: String(existing.id),
    title: `Atualização: ${existing.title}`,
    message: `${cleanLabel} — registrado por ${user.name}.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(existing.id),
    visibility: 'shared',
    postToStudioMural: false,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: newRecord.bg,
  });

  logActivity(user.id, user.name, 'card_mini_update', 'card', String(existing.id), `Mini atualização em "${existing.title}": ${cleanLabel}`);
  res.status(201).json({
    ok: true,
    update: newRecord,
    mini_updates: nextUpdates,
    history: safeJsonParse(nextHistory, []),
  });
});

router.delete('/cards/:id/mini-updates/:updateId', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }

  const currentUpdates = safeJsonParse<
    Array<{
      id: string;
      option_id?: string | null;
      label: string;
      bg: string;
      text: string;
      author_id: string;
      author_name: string;
      created_at: string;
    }>
  >(existing.mini_updates_json, []);

  const target = currentUpdates.find((u) => u.id === req.params.updateId);
  const nextUpdates = currentUpdates.filter((u) => u.id !== req.params.updateId);
  const now = new Date().toISOString();

  const nextHistory = target
    ? appendCardHistory(existing.history_json, user.id, user.name, 'mini_update_removed', `Atualização removida: ${target.label}`)
    : String(existing.history_json || '[]');

  db.prepare(`
    UPDATE cards SET
      mini_updates_json = ?,
      history_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(nextUpdates), nextHistory, now, existing.id);

  res.json({ ok: true, mini_updates: nextUpdates, history: safeJsonParse(nextHistory, []) });
});

router.patch('/cards/:id/checklist', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { checklist } = (req.body || {}) as { checklist?: Array<{ id: string; text: string; done: boolean }> };
  if (!Array.isArray(checklist)) {
    res.status(400).json({ error: 'Checklist inválida.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }

  if (user.role === 'client') {
    const board = db
      .prepare('SELECT client_id, shared_with_client FROM boards WHERE id = ?')
      .get(existing.board_id) as { client_id: string; shared_with_client: number } | undefined;
    const hidden = safeJsonParse<Record<string, boolean>>(existing.hidden_sections_json, {});
    if (!board || board.client_id !== user.client_id || !board.shared_with_client || !existing.client_visible || hidden.checklist) {
      res.status(403).json({ error: 'Sem permissão para atualizar a checklist desta demanda.' });
      return;
    }
  }

  const normalized = checklist.map((item) => ({
    id: String(item.id || uid('chk')),
    text: String(item.text || '').trim(),
    done: Boolean(item.done),
  })).filter((i) => i.text.length > 0);

  const now = new Date().toISOString();
  db.prepare('UPDATE cards SET checklist_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(normalized),
    now,
    existing.id
  );
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  res.json({ ok: true, checklist: normalized });
});

router.post('/cards/:id/complete', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(existing.board_id) as Record<string, unknown>;
  const columns = db.prepare('SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(existing.board_id) as Array<{ id: string; title: string }>;
  const doneCol = columns.find((c) => c.title.toLowerCase().includes('conclu')) || columns[columns.length - 1];
  const nextColId = doneCol ? doneCol.id : String(existing.column_id);
  const now = new Date().toISOString();

  const nextHistory = appendCardHistory(
    existing.history_json,
    user.id,
    user.name,
    'completed',
    `Demanda concluída por ${user.name}`
  );

  db.prepare(`
    UPDATE cards SET
      column_id = ?, approval_status = 'approved', history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(nextColId, nextHistory, now, existing.id);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'card_completed',
    entityType: 'card',
    entityId: String(existing.id),
    title: `Demanda concluída: ${existing.title}`,
    message: `${user.name} concluiu a entrega "${existing.title}" em ${board.title}.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(existing.id),
    visibility: 'shared',
    postToStudioMural: false,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#F4F5E2',
  });

  logActivity(user.id, user.name, 'complete_card', 'card', String(existing.id), `Concluiu demanda "${existing.title}"`);
  res.json({ ok: true, column_id: nextColId });
});

router.post('/cards/:id/request-adjustment', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { adjustment_type, message, label_name, attachments } = req.body as {
    adjustment_type?: string;
    message?: string;
    label_name?: string;
    attachments?: Array<{ filename: string; original_name: string; mime_type: string; size_bytes: number; file_url: string }>;
  };

  if (!adjustment_type?.trim() || !message?.trim()) {
    res.status(400).json({ error: 'Selecione o tipo de ajuste e descreva a orientação para o cliente.' });
    return;
  }

  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Demanda não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(existing.board_id) as Record<string, unknown>;
  const now = new Date().toISOString();

  const currentLabels = safeJsonParse<string[]>(existing.labels_json, []);
  const targetLabel = label_name?.trim() || 'Fazer alterações';
  const nextLabels = currentLabels.includes(targetLabel) ? currentLabels : [...currentLabels, targetLabel];

  const adjPayload = {
    type: adjustment_type.trim(),
    message: message.trim(),
    requested_by_id: user.id,
    requested_by_name: user.name,
    requested_at: now,
    attachments: Array.isArray(attachments) ? attachments : [],
    resolved: false,
  };

  const nextHistory = appendCardHistory(
    existing.history_json,
    user.id,
    user.name,
    'adjustment_requested',
    `Ajuste solicitado (${adjustment_type.trim()}) por ${user.name}: ${message.trim()}`
  );

  db.prepare(`
    UPDATE cards SET
      adjustment_request_json = ?, labels_json = ?, content_status = 'complement_requested',
      content_feedback = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(adjPayload), JSON.stringify(nextLabels), message.trim(), nextHistory, now, existing.id);

  if (Array.isArray(attachments) && attachments.length > 0) {
    const insertAtt = db.prepare(`
      INSERT INTO card_attachments (id, card_id, filename, original_name, mime_type, size_bytes, file_url, is_internal, uploaded_by, uploaded_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    for (const att of attachments) {
      insertAtt.run(uid('att'), existing.id, att.filename || att.original_name, att.original_name, att.mime_type || 'application/octet-stream', att.size_bytes || 0, att.file_url, user.id, user.name, now);
    }
  }

  db.prepare(`
    INSERT INTO card_comments (id, card_id, author_id, author_name, author_role, content, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(uid('cmt'), existing.id, user.id, user.name, user.role, `[${adjustment_type.trim()}] ${message.trim()}`, now);

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'adjustment_requested',
    entityType: 'card',
    entityId: String(existing.id),
    title: `Ajuste solicitado (${adjustment_type.trim()}): ${existing.title}`,
    message: `${user.name} solicitou ajuste em "${existing.title}": ${message.trim()}`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(existing.id),
    visibility: 'shared',
    priority: 'high',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#FDF0E8',
  });

  logActivity(user.id, user.name, 'request_adjustment', 'card', String(existing.id), `Solicitou ajuste (${adjustment_type.trim()}) em "${existing.title}"`);
  res.json({ ok: true, adjustment_request: adjPayload, labels: nextLabels });
});

router.patch('/cards/:id/visibility', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }
  const { client_visible, hidden_sections } = req.body as {
    client_visible?: boolean;
    hidden_sections?: Record<string, boolean>;
  };
  const currentHidden = safeJsonParse<Record<string, boolean>>(existing.hidden_sections_json, {});
  const nextHidden = hidden_sections ? { ...currentHidden, ...hidden_sections } : currentHidden;
  const nextVisible = client_visible !== undefined ? (client_visible ? 1 : 0) : existing.client_visible;

  db.prepare('UPDATE cards SET client_visible = ?, hidden_sections_json = ?, updated_at = ? WHERE id = ?').run(
    nextVisible,
    JSON.stringify(nextHidden),
    new Date().toISOString(),
    existing.id
  );
  res.json({ ok: true, client_visible: Boolean(nextVisible), hidden_sections: nextHidden });
});

router.get('/labels', requireAuth, (_req, res) => {
  const row = db.prepare("SELECT value_json FROM studio_settings WHERE key = 'labels'").get() as { value_json: string } | undefined;
  res.json({ labels: row ? safeJsonParse(row.value_json, []) : [] });
});

router.put('/labels', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { labels } = req.body as { labels: Array<{ id: string; name: string; color: string; text: string; description?: string }> };
  if (!Array.isArray(labels)) {
    res.status(400).json({ error: 'Lista de etiquetas inválida.' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
    VALUES ('labels', ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  `).run(JSON.stringify(labels), req.user!.id, now);
  res.json({ ok: true, labels });
});

router.patch('/cards/:id/move', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const { column_id, sort_order } = req.body as { column_id: string; sort_order?: number };
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const targetCol = db.prepare('SELECT * FROM board_columns WHERE id = ?').get(column_id) as { id: string; title: string } | undefined;
  if (!targetCol) {
    res.status(404).json({ error: 'Coluna de destino não encontrada.' });
    return;
  }

  const prevCol = db.prepare('SELECT title FROM board_columns WHERE id = ?').get(existing.column_id) as { title: string } | undefined;
  const boardRow = db.prepare('SELECT id, title, client_id FROM boards WHERE id = ?').get(existing.board_id) as { id: string; title: string; client_id: string } | undefined;

  const now = new Date().toISOString();
  let nextApprovalStatus = existing.approval_status;
  if (targetCol.title.toLowerCase().includes('aprova') && existing.requires_approval) {
    nextApprovalStatus = 'pending';
  }

  const nextHistory = appendCardHistory(
    existing.history_json,
    req.user!.id,
    req.user!.name,
    'moved',
    `Movido${prevCol ? ` de "${prevCol.title}"` : ''} para "${targetCol.title}" por ${req.user!.name}`
  );

  db.prepare('UPDATE cards SET column_id = ?, sort_order = ?, approval_status = ?, history_json = ?, updated_at = ? WHERE id = ?').run(
    column_id,
    sort_order ?? existing.sort_order,
    nextApprovalStatus,
    nextHistory,
    now,
    req.params.id
  );
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, existing.board_id);

  if (boardRow && String(existing.column_id) !== String(column_id)) {
    const isVis = Boolean(existing.client_visible);
    const clientUserId = isVis ? getClientUserId(boardRow.client_id) : null;
    const isDoneMove = targetCol.title.toLowerCase().includes('conclu');
    const isAltMove = targetCol.title.toLowerCase().includes('altera') || targetCol.title.toLowerCase().includes('ajuste');
    emitStudioEvent({
      actorId: req.user!.id,
      actorName: req.user!.name,
      eventType: isDoneMove ? 'card_completed' : 'card_moved',
      entityType: 'card',
      entityId: String(existing.id),
      title: `Status atualizado: ${existing.title}`,
      message: `${req.user!.name} moveu "${existing.title}"${prevCol ? ` de "${prevCol.title}"` : ''} para "${targetCol.title}".`,
      boardId: boardRow.id,
      clientId: boardRow.client_id,
      cardId: String(existing.id),
      visibility: isVis ? 'shared' : 'internal',
      postToStudioMural: false,
      postToBoardMural: true,
      notifyUserIds: clientUserId ? [clientUserId] : [],
      linkTab: 'portal',
      linkEntityId: boardRow.id,
      color: isDoneMove ? '#F4F5E2' : isAltMove ? '#FDF0E8' : '#F3ECF9',
    });
  }

  logActivity(
    req.user!.id,
    req.user!.name,
    'move_card',
    'card',
    req.params.id,
    `Moveu "${existing.title}" para "${targetCol.title}"`
  );

  res.json({ ok: true, approval_status: nextApprovalStatus });
});

router.delete('/cards/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT title FROM cards WHERE id = ?').get(req.params.id) as { title: string } | undefined;
  db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_card', 'card', req.params.id, `Removeu entrega "${existing?.title || ''}"`);
  res.json({ ok: true });
});

router.post('/cards/:id/comments', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { content, is_internal } = req.body as { content?: string; is_internal?: boolean };
  if (!content?.trim()) {
    res.status(400).json({ error: 'Escreva um comentário antes de enviar.' });
    return;
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const board = db.prepare('SELECT id, title, client_id, shared_with_client, lead_user_id, collaborator_user_id FROM boards WHERE id = ?').get(card.board_id) as {
    id: string;
    title: string;
    client_id: string;
    shared_with_client: number;
    lead_user_id: string;
    collaborator_user_id: string | null;
  };

  if (user.role === 'client') {
    if (board.client_id !== user.client_id || !board.shared_with_client || !card.client_visible) {
      res.status(403).json({ error: 'Sem permissão para comentar.' });
      return;
    }
  }

  const commentId = uid('cmt');
  const now = new Date().toISOString();
  const internalFlag = user.role === 'partner' && is_internal ? 1 : 0;

  db.prepare(`
    INSERT INTO card_comments (id, card_id, author_id, author_name, author_role, content, is_internal, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(commentId, req.params.id, user.id, user.name, user.role, content.trim(), internalFlag, now);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(board.client_id);
  const notifyIds =
    user.role === 'client'
      ? [board.lead_user_id, board.collaborator_user_id || '']
      : !internalFlag && clientUserId
      ? [clientUserId]
      : [];

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'card_comment',
    entityType: 'comment',
    entityId: commentId,
    title: `Novo comentário em ${card.title}`,
    message: `${user.name} comentou em "${card.title}": "${content.trim().slice(0, 180)}"`,
    boardId: board.id,
    clientId: board.client_id,
    cardId: String(card.id),
    visibility: internalFlag ? 'internal' : 'shared',
    postToStudioMural: false,
    postToBoardMural: true,
    notifyUserIds: notifyIds,
    linkTab: 'portal',
    linkEntityId: board.id,
    color: user.role === 'client' ? '#FDF2F6' : '#F3ECF9',
  });

  logActivity(user.id, user.name, 'comment_card', 'card', req.params.id, `Comentou em "${card.title}"`);
  const comment = db.prepare('SELECT * FROM card_comments WHERE id = ?').get(commentId);
  res.status(201).json({ comment });
});

router.post('/cards/:id/attachments', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { filename, original_name, mime_type, size_bytes, file_url, is_internal } = req.body as {
    filename: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    file_url: string;
    is_internal?: boolean;
  };

  if (!file_url || !original_name) {
    res.status(400).json({ error: 'Dados do anexo incompletos.' });
    return;
  }

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Cartão não encontrado.' });
    return;
  }

  const board = db.prepare('SELECT id, title, client_id, lead_user_id, collaborator_user_id FROM boards WHERE id = ?').get(card.board_id) as {
    id: string;
    title: string;
    client_id: string;
    lead_user_id: string;
    collaborator_user_id: string | null;
  } | undefined;

  const attId = uid('att');
  const now = new Date().toISOString();
  const internalFlag = user.role === 'partner' && is_internal ? 1 : 0;

  db.prepare(`
    INSERT INTO card_attachments (id, card_id, filename, original_name, mime_type, size_bytes, file_url, is_internal, uploaded_by, uploaded_by_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(attId, req.params.id, filename || original_name, original_name, mime_type || 'application/octet-stream', size_bytes || 0, file_url, internalFlag, user.id, user.name, now);

  if (board) {
    db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);
    const clientUserId = getClientUserId(board.client_id);
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'card_attachment',
      entityType: 'card',
      entityId: String(card.id),
      title: `Novo arquivo em ${card.title}`,
      message: `${user.name} anexou "${original_name}" na demanda "${card.title}".`,
      boardId: board.id,
      clientId: board.client_id,
      cardId: String(card.id),
      visibility: internalFlag ? 'internal' : 'shared',
      postToStudioMural: false,
      postToBoardMural: true,
      notifyUserIds:
        user.role === 'client'
          ? [board.lead_user_id, board.collaborator_user_id || '']
          : !internalFlag && clientUserId
          ? [clientUserId]
          : [],
      linkTab: 'portal',
      linkEntityId: board.id,
      color: '#FCF6EC',
    });
  }

  logActivity(user.id, user.name, 'attach_file', 'card', req.params.id, `Anexou "${original_name}" em "${card.title}"`);
  const attachment = db.prepare('SELECT * FROM card_attachments WHERE id = ?').get(attId);
  res.status(201).json({ attachment });
});

router.delete('/attachments/:id', requireAuth, requirePartner, (req, res) => {
  db.prepare('DELETE FROM card_attachments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/cards/:id/submit-content', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Entrega não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client || !card.client_visible)) {
    res.status(403).json({ error: 'Sem permissão para enviar conteúdo nesta entrega.' });
    return;
  }

  const { text, links, answers, notes, attachments } = req.body as {
    text?: string;
    links?: string[];
    answers?: Record<string, string>;
    notes?: string;
    attachments?: Array<{ filename: string; original_name: string; mime_type: string; size_bytes: number; file_url: string }>;
  };

  const hasAnswers = answers && Object.values(answers).some((v) => String(v || '').trim().length > 0);
  const hasLinks = Array.isArray(links) && links.some((l) => String(l || '').trim().length > 0);
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  if (!text?.trim() && !notes?.trim() && !hasAnswers && !hasLinks && !hasAttachments) {
    res.status(400).json({ error: 'Informe o conteúdo, links, respostas ou anexe pelo menos um material.' });
    return;
  }

  const now = new Date().toISOString();
  const payload = {
    text: text?.trim() || '',
    links: (links || []).map((l) => String(l).trim()).filter(Boolean),
    answers: answers || {},
    notes: notes?.trim() || '',
    submitted_at: now,
    submitted_by: user.name,
  };

  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(board.id) as Array<{ id: string; title: string }>;
  const currentCol = columns.find((c) => c.id === card.column_id);
  const todoCol = columns.find((c) => c.title.toLowerCase().includes('fazer')) || columns[1] || columns[0];
  const nextColumnId =
    currentCol && currentCol.title.toLowerCase().includes('aguardando conte') && todoCol
      ? todoCol.id
      : String(card.column_id);

  const actionLabel = card.content_status === 'complement_requested' ? 'Complementação enviada' : 'Conteúdo enviado';
  const nextHistory = appendCardHistory(
    card.history_json,
    user.id,
    user.name,
    'content_submitted',
    `${actionLabel} por ${user.name}`
  );

  const refsCombined = [payload.links.join('\n'), payload.notes].filter(Boolean).join('\n\n') || String(card.references_text || '');

  db.prepare(`
    UPDATE cards SET
      submitted_content_json = ?, references_text = ?, content_status = 'submitted',
      content_feedback = '', column_id = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(payload), refsCombined, nextColumnId, nextHistory, now, card.id);

  if (Array.isArray(attachments) && attachments.length > 0) {
    const insertAtt = db.prepare(`
      INSERT INTO card_attachments (id, card_id, filename, original_name, mime_type, size_bytes, file_url, is_internal, uploaded_by, uploaded_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    for (const att of attachments) {
      insertAtt.run(uid('att'), card.id, att.filename || att.original_name, att.original_name, att.mime_type || 'application/octet-stream', att.size_bytes || 0, att.file_url, user.id, user.name, now);
    }
  }

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'client_content',
    entityType: 'card',
    entityId: String(card.id),
    title: `${actionLabel}: ${card.title}`,
    message: `${user.name} enviou informações e materiais em "${card.title}" (${board.title}).`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(card.id),
    visibility: 'shared',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: [String(board.lead_user_id), String(board.collaborator_user_id || '')],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#FDF2F6',
  });

  logActivity(user.id, user.name, 'submit_content', 'card', String(card.id), `${actionLabel} em "${card.title}"`);

  const updated = db.prepare('SELECT * FROM cards WHERE id = ?').get(card.id) as Record<string, unknown>;
  const cmts = db.prepare('SELECT * FROM card_comments WHERE card_id = ? AND is_internal = 0 ORDER BY created_at ASC').all(card.id) as Array<Record<string, unknown>>;
  const atts = db.prepare('SELECT * FROM card_attachments WHERE card_id = ? AND is_internal = 0 ORDER BY created_at DESC').all(card.id) as Array<Record<string, unknown>>;
  res.json({ ok: true, card: formatCardRecord(updated, cmts, atts, user.role === 'client') });
});

router.post('/cards/:id/review-content', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const { action, feedback } = req.body as { action: 'approve_receipt' | 'request_complement'; feedback?: string };
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Entrega não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id) as Record<string, unknown>;
  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(card.board_id) as Array<{ id: string; title: string }>;
  const now = new Date().toISOString();

  if (action === 'request_complement') {
    const awaitingCol = columns.find((c) => c.title.toLowerCase().includes('aguardando conte')) || columns[0];
    const nextColId = awaitingCol ? awaitingCol.id : String(card.column_id);
    const nextHistory = appendCardHistory(
      card.history_json,
      user.id,
      user.name,
      'complement_requested',
      `Complementação solicitada por ${user.name}${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
    );

    db.prepare(`
      UPDATE cards SET content_status = 'complement_requested', content_feedback = ?, column_id = ?, history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(feedback?.trim() || '', nextColId, nextHistory, now, card.id);

    if (feedback?.trim()) {
      db.prepare(`
        INSERT INTO card_comments (id, card_id, author_id, author_name, author_role, content, is_internal, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(uid('cmt'), card.id, user.id, user.name, user.role, `[Complementação solicitada] ${feedback.trim()}`, now);
    }

    const clientUserId = getClientUserId(String(board.client_id));
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'complement_requested',
      entityType: 'card',
      entityId: String(card.id),
      title: `Complementação solicitada: ${card.title}`,
      message: `${user.name} solicitou informações adicionais em "${card.title}"${feedback?.trim() ? `: ${feedback.trim()}` : '.'}`,
      boardId: String(board.id),
      clientId: String(board.client_id),
      cardId: String(card.id),
      visibility: 'shared',
      priority: 'high',
      postToStudioMural: true,
      postToBoardMural: true,
      notifyUserIds: clientUserId ? [clientUserId] : [],
      linkTab: 'portal',
      linkEntityId: String(board.id),
      color: '#FDF0E8',
    });

    logActivity(user.id, user.name, 'request_complement', 'card', String(card.id), `Solicitou complementação em "${card.title}"`);
    res.json({ ok: true, content_status: 'complement_requested', column_id: nextColId });
    return;
  }

  // approve_receipt -> moves to Em produção
  const prodCol = columns.find((c) => c.title.toLowerCase().includes('produ')) || columns[2] || columns[0];
  const nextColId = prodCol ? prodCol.id : String(card.column_id);
  const nextHistory = appendCardHistory(
    card.history_json,
    user.id,
    user.name,
    'content_approved',
    `Recebimento aprovado por ${user.name} — movido para produção`
  );

  db.prepare(`
    UPDATE cards SET content_status = 'content_approved', content_feedback = '', column_id = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(nextColId, nextHistory, now, card.id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'content_approved',
    entityType: 'card',
    entityId: String(card.id),
    title: `Conteúdo recebido e em produção: ${card.title}`,
    message: `${user.name} validou os materiais de "${card.title}" e iniciou a produção.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(card.id),
    visibility: 'shared',
    postToStudioMural: false,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#F3ECF9',
  });

  logActivity(user.id, user.name, 'approve_content_receipt', 'card', String(card.id), `Validou recebimento e iniciou produção de "${card.title}"`);
  res.json({ ok: true, content_status: 'content_approved', column_id: nextColId });
});

router.post('/cards/:id/send-for-approval', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Entrega não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id) as Record<string, unknown>;
  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(card.board_id) as Array<{ id: string; title: string }>;
  const approvalCol = columns.find((c) => c.title.toLowerCase().includes('aprova')) || columns[4] || columns[0];
  const nextColId = approvalCol ? approvalCol.id : String(card.column_id);
  const now = new Date().toISOString();

  const nextHistory = appendCardHistory(
    card.history_json,
    user.id,
    user.name,
    'sent_for_approval',
    `Material enviado para aprovação do cliente por ${user.name}`
  );

  db.prepare(`
    UPDATE cards SET requires_approval = 1, approval_status = 'pending', column_id = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(nextColId, nextHistory, now, card.id);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'sent_for_approval',
    entityType: 'card',
    entityId: String(card.id),
    title: `Pronto para aprovação: ${card.title}`,
    message: `${user.name} enviou "${card.title}" para sua aprovação final.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(card.id),
    visibility: 'shared',
    priority: 'high',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#FDF2F6',
  });

  logActivity(user.id, user.name, 'send_for_approval', 'card', String(card.id), `Enviou "${card.title}" para aprovação do cliente`);
  res.json({ ok: true, approval_status: 'pending', column_id: nextColId });
});

router.post('/cards/:id/approval', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { decision, feedback } = req.body as { decision: 'approved' | 'changes_requested'; feedback?: string };
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!card) {
    res.status(404).json({ error: 'Entrega não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(card.board_id) as Record<string, unknown>;
  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client)) {
    res.status(403).json({ error: 'Sem permissão para aprovar este item.' });
    return;
  }

  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ?').all(card.board_id) as Array<{ id: string; title: string }>;
  let nextColumnId = String(card.column_id);

  if (decision === 'approved') {
    const doneCol = columns.find((c) => c.title.toLowerCase().includes('conclu'));
    if (doneCol) nextColumnId = doneCol.id;
  } else {
    const prodCol = columns.find((c) => c.title.toLowerCase().includes('produ'));
    if (prodCol) nextColumnId = prodCol.id;
  }

  const now = new Date().toISOString();
  const nextHistory = appendCardHistory(
    card.history_json,
    user.id,
    user.name,
    decision === 'approved' ? 'approved' : 'changes_requested',
    decision === 'approved'
      ? `Arte aprovada por ${user.name}${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
      : `Ajustes solicitados por ${user.name}${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
  );

  db.prepare(`
    UPDATE cards SET approval_status = ?, approval_feedback = ?, column_id = ?, history_json = ?, updated_at = ?
    WHERE id = ?
  `).run(decision, feedback?.trim() || '', nextColumnId, nextHistory, now, req.params.id);
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  if (feedback?.trim()) {
    db.prepare(`
      INSERT INTO card_comments (id, card_id, author_id, author_name, author_role, content, is_internal, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      uid('cmt'),
      req.params.id,
      user.id,
      user.name,
      user.role,
      decision === 'approved' ? `[Aprovado] ${feedback.trim()}` : `[Solicitação de ajuste] ${feedback.trim()}`,
      now
    );
  }

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: decision === 'approved' ? 'card_approved' : 'card_changes',
    entityType: 'card',
    entityId: String(card.id),
    title: decision === 'approved' ? `Entrega aprovada: ${card.title}` : `Ajuste solicitado: ${card.title}`,
    message: `${user.name} ${decision === 'approved' ? 'aprovou a entrega' : 'solicitou ajustes em'} "${card.title}" (${board.title})${feedback?.trim() ? `: ${feedback.trim()}` : '.'}`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: String(card.id),
    visibility: 'shared',
    priority: decision === 'changes_requested' ? 'high' : 'normal',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: [String(board.lead_user_id), String(board.collaborator_user_id || '')],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: decision === 'approved' ? '#F4F5E2' : '#FDF2F6',
  });

  logActivity(
    user.id,
    user.name,
    decision === 'approved' ? 'approve_card' : 'request_changes',
    'card',
    req.params.id,
    `${decision === 'approved' ? 'Aprovou' : 'Solicitou ajuste em'} "${card.title}"`
  );

  res.json({ ok: true, approval_status: decision, column_id: nextColumnId });
});

router.post('/client-portal/submit-content', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { board_id, card_id, title, text, copy_text, notes, links, answers, priority, attachments } = req.body as {
    board_id: string;
    card_id?: string;
    title?: string;
    text?: string;
    copy_text?: string;
    notes?: string;
    links?: string[];
    answers?: Record<string, string>;
    priority?: string;
    attachments?: Array<{ filename: string; original_name: string; mime_type: string; size_bytes: number; file_url: string }>;
  };

  const mainText = (text ?? copy_text ?? '').trim();

  if (!board_id || (!card_id && !title?.trim())) {
    res.status(400).json({ error: 'Selecione a entrega ou informe o assunto do conteúdo.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(board_id) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client)) {
    res.status(403).json({ error: 'Sem permissão para enviar conteúdo para este projeto.' });
    return;
  }

  const columns = db.prepare('SELECT * FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(board_id) as Array<{ id: string; title: string }>;
  const todoCol = columns.find((c) => c.title.toLowerCase().includes('fazer')) || columns[1] || columns[0];
  const now = new Date().toISOString();

  const submittedPayload = {
    text: mainText,
    links: (links || []).map((l) => String(l).trim()).filter(Boolean),
    answers: answers || {},
    notes: notes?.trim() || '',
    submitted_at: now,
    submitted_by: user.name,
  };

  let targetCardId = card_id;
  let targetTitle = title?.trim() || 'Conteúdo do cliente';
  if (card_id) {
    const existingCard = db.prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(card_id, board_id) as Record<string, unknown> | undefined;
    if (!existingCard) {
      res.status(404).json({ error: 'Entrega vinculada não encontrada neste quadro.' });
      return;
    }
    targetTitle = String(existingCard.title);
    const nextHistory = appendCardHistory(existingCard.history_json, user.id, user.name, 'content_submitted', `Conteúdo enviado por ${user.name}`);
    db.prepare(`
      UPDATE cards SET
        submitted_content_json = ?, references_text = ?, content_status = 'submitted',
        content_feedback = '', column_id = ?, history_json = ?, updated_at = ?
      WHERE id = ? AND board_id = ?
    `).run(
      JSON.stringify(submittedPayload),
      notes?.trim() || String(existingCard.references_text || ''),
      todoCol?.id || columns[0]?.id,
      nextHistory,
      now,
      card_id,
      board_id
    );
  } else {
    targetCardId = uid('crd');
    const initHistory = appendCardHistory('[]', user.id, user.name, 'content_submitted', `Demanda com conteúdo enviado por ${user.name}`);
    db.prepare(`
      INSERT INTO cards (
        id, board_id, column_id, title, description, service_name, package_name, format,
        lead_user_id, priority, labels_json, checklist_json, references_text, copy_text,
        internal_notes, client_visible, requires_approval, approval_status, approval_feedback,
        content_status, content_feedback, client_fields_json, submitted_content_json, history_json,
        sort_order, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'Conteúdo e briefing enviados pelo cliente via portal.', '', '', 'Material do Cliente', ?, ?, '[]', '[]', ?, '', '', 1, 1, 'none', '', 'submitted', '', '[]', ?, ?, 0, ?, ?, ?)
    `).run(
      targetCardId,
      board_id,
      todoCol?.id || columns[0]?.id,
      targetTitle,
      board.lead_user_id,
      priority || 'normal',
      notes?.trim() || '',
      JSON.stringify(submittedPayload),
      initHistory,
      user.id,
      now,
      now
    );
  }

  if (Array.isArray(attachments)) {
    const insertAtt = db.prepare(`
      INSERT INTO card_attachments (id, card_id, filename, original_name, mime_type, size_bytes, file_url, is_internal, uploaded_by, uploaded_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `);
    for (const att of attachments) {
      insertAtt.run(uid('att'), targetCardId, att.filename, att.original_name, att.mime_type, att.size_bytes, att.file_url, user.id, user.name, now);
    }
  }

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'client_content',
    entityType: 'card',
    entityId: targetCardId!,
    title: `Conteúdo enviado: ${targetTitle}`,
    message: `${user.name} enviou briefing e materiais para "${targetTitle}" no projeto "${board.title}".`,
    boardId: board_id,
    clientId: String(board.client_id),
    cardId: targetCardId!,
    visibility: 'shared',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: [String(board.lead_user_id), String(board.collaborator_user_id || '')],
    linkTab: 'portal',
    linkEntityId: board_id,
    color: '#FDF2F6',
  });

  logActivity(user.id, user.name, 'submit_content', 'card', targetCardId!, `Enviou conteúdo "${targetTitle}" no portal`);
  res.status(201).json({ ok: true, card_id: targetCardId });
});

router.get('/client-portal/overview', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  if (user.role === 'client' && req.query.client_id && String(req.query.client_id) !== user.client_id) {
    res.status(403).json({ error: 'Você só tem permissão para acessar o seu próprio Portal do Cliente.' });
    return;
  }
  const targetClientId = user.role === 'client' ? user.client_id : (req.query.client_id as string);

  if (!targetClientId) {
    res.status(400).json({ error: 'Cliente não especificado.' });
    return;
  }

  const client = db
    .prepare('SELECT id, name, company, contact_name, email, avatar_url, owner_partner, portal_welcome, portal_enabled FROM clients WHERE id = ?')
    .get(targetClientId) as Record<string, unknown> | undefined;
  if (!client) {
    res.status(404).json({ error: 'Portal do cliente não encontrado.' });
    return;
  }

  if (user.role === 'client' && !client.portal_enabled) {
    res.status(403).json({ error: 'Seu acesso ao portal externo foi desativado pelo estúdio.' });
    return;
  }

  const boards = db
    .prepare(`
      SELECT id, title, description, cover_url, lead_user_id, start_date, deadline, priority, status, labels_json,
             selected_services_json, drive_links_json, contract_info_json, briefing_info_json, process_state_json, invite_status, created_at, updated_at
      FROM boards
      WHERE client_id = ? AND shared_with_client = 1 AND status != 'draft'
      ORDER BY updated_at DESC
    `)
    .all(targetClientId) as Array<Record<string, unknown>>;

  const hiddenServices = new Set(
    (db.prepare('SELECT id FROM services WHERE visible_in_portal = 0').all() as Array<{ id: string }>).map((s) => s.id)
  );

  const boardIds = boards.map((b) => String(b.id));
  let columns: Array<Record<string, unknown>> = [];
  let cards: Array<Record<string, unknown>> = [];
  let comments: Array<Record<string, unknown>> = [];
  let attachments: Array<Record<string, unknown>> = [];
  let boardMural: Array<Record<string, unknown>> = [];
  let events: Array<Record<string, unknown>> = [];

  if (boardIds.length > 0) {
    const placeholders = boardIds.map(() => '?').join(',');
    columns = db
      .prepare(`SELECT * FROM board_columns WHERE board_id IN (${placeholders}) AND client_visible = 1 AND archived = 0 ORDER BY sort_order ASC`)
      .all(...boardIds) as Array<Record<string, unknown>>;

    const visibleColIds = new Set(columns.map((c) => String(c.id)));

    const rawCards = db
      .prepare(`
        SELECT id, board_id, column_id, title, description, service_id, service_name, package_name, format,
               lead_user_id, due_date, publish_date, priority, labels_json, checklist_json,
               references_text, copy_text, extra_notes, links_json, hidden_sections_json,
               adjustment_request_json, read_at, read_by_id, read_by_name,
               client_visible, requires_approval, approval_status, approval_feedback,
               content_status, content_feedback, client_fields_json, submitted_content_json, history_json,
               sort_order, created_at, updated_at
        FROM cards
        WHERE board_id IN (${placeholders}) AND client_visible = 1
        ORDER BY sort_order ASC, created_at ASC
      `)
      .all(...boardIds) as Array<Record<string, unknown>>;

    cards = rawCards.filter(
      (c) =>
        visibleColIds.has(String(c.column_id)) &&
        (!c.service_id || !hiddenServices.has(String(c.service_id)))
    );

    if (cards.length > 0) {
      const cardPlaceholders = cards.map(() => '?').join(',');
      const cardIds = cards.map((c) => String(c.id));
      comments = db
        .prepare(`SELECT * FROM card_comments WHERE card_id IN (${cardPlaceholders}) AND is_internal = 0 ORDER BY created_at ASC`)
        .all(...cardIds) as Array<Record<string, unknown>>;
      attachments = db
        .prepare(`SELECT * FROM card_attachments WHERE card_id IN (${cardPlaceholders}) AND is_internal = 0 ORDER BY created_at DESC`)
        .all(...cardIds) as Array<Record<string, unknown>>;
    }

    boardMural = (
      db
        .prepare(`SELECT id, scope, board_id, client_id, title, content, author_name, color, pinned, is_auto, event_type, entity_type, entity_id, card_id, priority, read_by_json, created_at FROM mural_posts WHERE scope = 'board' AND board_id IN (${placeholders}) AND visibility != 'internal' ORDER BY pinned DESC, created_at DESC LIMIT 80`)
        .all(...boardIds) as Array<Record<string, unknown>>
    ).map((p) => ({
      ...p,
      read_by: safeJsonParse<string[]>(p.read_by_json, []),
    }));

    events = db
      .prepare(`SELECT e.*, b.title as board_title FROM studio_events e LEFT JOIN boards b ON b.id = e.board_id WHERE (e.board_id IN (${placeholders}) OR (e.board_id IS NULL AND e.client_id = ?)) AND e.type != 'internal' ORDER BY e.event_date ASC, e.event_time ASC`)
      .all(...boardIds, targetClientId) as Array<Record<string, unknown>>;
  }

  let approvalDeliveries: Array<ReturnType<typeof formatApprovalDeliveryRow>> = [];
  if (boardIds.length > 0) {
    const placeholders = boardIds.map(() => '?').join(',');
    const rawDelivs = db
      .prepare(`
        SELECT d.*, c.title as card_title, c.service_name as card_service_name
        FROM approval_deliveries d
        LEFT JOIN cards c ON c.id = d.card_id
        WHERE d.board_id IN (${placeholders})
        ORDER BY d.updated_at DESC, d.created_at DESC
      `)
      .all(...boardIds) as Array<Record<string, unknown>>;
    approvalDeliveries = rawDelivs.map(formatApprovalDeliveryRow);
  }

  const allSvcRows = db
    .prepare('SELECT id, name, color, category, process_steps_json, visible_in_portal FROM services WHERE visible_in_portal = 1')
    .all() as Array<Record<string, unknown>>;
  const servicesMeta = allSvcRows.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    category: s.category,
    visible_in_portal: true,
    process_steps: safeJsonParse(s.process_steps_json, []),
  }));

  const mural = (
    db
      .prepare("SELECT id, title, content, author_name, color, pinned, read_by_json, created_at FROM mural_posts WHERE scope = 'client' AND (client_id IS NULL OR client_id = ?) AND visibility != 'internal' ORDER BY pinned DESC, created_at DESC")
      .all(targetClientId) as Array<Record<string, unknown>>
  ).map((p) => ({
    ...p,
    read_by: safeJsonParse<string[]>(p.read_by_json, []),
  }));

  const partners = db.prepare("SELECT id, name, partner_key, avatar_url, title FROM users WHERE role = 'partner'").all();

  const portalDefaultsRow = db.prepare("SELECT value_json FROM studio_settings WHERE key = 'portal_defaults'").get() as { value_json: string } | undefined;
  const portalDefaults = portalDefaultsRow ? JSON.parse(portalDefaultsRow.value_json) : {};

  const labelsRow = db.prepare("SELECT value_json FROM studio_settings WHERE key = 'labels'").get() as { value_json: string } | undefined;
  const labelsList = labelsRow ? safeJsonParse(labelsRow.value_json, []) : [];

  res.json({
    client: { ...client, portal_enabled: Boolean(client.portal_enabled) },
    boards: boards.map((b) => {
      const rawDrive = safeJsonParse<Array<Record<string, unknown>>>(b.drive_links_json, []);
      const rawContract = safeJsonParse<Record<string, unknown>>(b.contract_info_json, {});
      const rawBriefing = safeJsonParse<Record<string, unknown>>(b.briefing_info_json, {});
      return {
        ...b,
        labels: safeJsonParse(b.labels_json, []),
        selected_services: safeJsonParse(b.selected_services_json, []),
        drive_links: rawDrive.filter((l) => !l.is_internal),
        contract_info: sanitizeContractInfoForClient(rawContract),
        briefing_info: sanitizeBriefingInfoForClient(rawBriefing),
        process_state: safeJsonParse(b.process_state_json, {}),
        shared_with_client: true,
      };
    }),
    columns: columns.map((c) => ({
      ...c,
      archived: Boolean(c.archived),
      client_visible: Boolean(c.client_visible),
    })),
    cards: cards.map((c) =>
      formatCardRecord(
        c,
        comments.filter((cm) => cm.card_id === c.id),
        attachments.filter((at) => at.card_id === c.id),
        true
      )
    ),
    mural,
    board_mural: boardMural,
    approval_deliveries: approvalDeliveries,
    events,
    services_meta: servicesMeta,
    labels: labelsList,
    partners,
    portal_defaults: portalDefaults,
  });
});

// =====================================================================
// MULTI-MATERIAL APPROVAL DELIVERIES (IMAGES, PDFS, LINKS, TEXTS, DOCS)
// =====================================================================

router.get('/boards/:boardId/approvals', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const board = db.prepare('SELECT id, client_id, shared_with_client FROM boards WHERE id = ?').get(req.params.boardId) as {
    id: string;
    client_id: string;
    shared_with_client: number;
  } | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }
  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client)) {
    res.status(403).json({ error: 'Sem permissão para visualizar aprovações deste quadro.' });
    return;
  }

  const rows = db
    .prepare(`
      SELECT d.*, c.title as card_title, c.service_name as card_service_name
      FROM approval_deliveries d
      LEFT JOIN cards c ON c.id = d.card_id
      WHERE d.board_id = ?
      ORDER BY d.updated_at DESC, d.created_at DESC
    `)
    .all(board.id) as Array<Record<string, unknown>>;

  res.json({ deliveries: rows.map(formatApprovalDeliveryRow) });
});

router.post('/boards/:boardId/approvals', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(req.params.boardId) as Record<string, unknown> | undefined;
  if (!board) {
    res.status(404).json({ error: 'Quadro não encontrado.' });
    return;
  }

  const { title, description, card_id, items } = req.body as {
    title?: string;
    description?: string;
    card_id?: string | null;
    items?: Array<{
      type?: 'image' | 'pdf' | 'link' | 'text' | 'document' | 'file';
      title?: string;
      url?: string;
      file_name?: string;
      mime_type?: string;
      size_bytes?: number;
      content?: string;
      notes?: string;
    }>;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: 'Defina o nome da entrega de aprovação.' });
    return;
  }
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Adicione pelo menos um material antes de enviar ao cliente.' });
    return;
  }

  const now = new Date().toISOString();
  const deliveryId = uid('apv');

  const normalizedItems: RawApprovalItem[] = items.map((item, idx) => {
    const itemTitle = item.title?.trim() || item.file_name || `Material #${idx + 1}`;
    const type = item.type || 'file';
    return {
      id: uid('mat'),
      type,
      title: itemTitle,
      url: item.url || '',
      file_name: item.file_name || '',
      mime_type: item.mime_type || '',
      size_bytes: item.size_bytes || 0,
      content: item.content || '',
      notes: item.notes || '',
      status: 'pending',
      feedback: '',
      version_number: 1,
      versions: [
        {
          version: 1,
          title: itemTitle,
          url: item.url || '',
          file_name: item.file_name || '',
          mime_type: item.mime_type || '',
          content: item.content || '',
          notes: item.notes || '',
          uploaded_by_id: user.id,
          uploaded_by_name: user.name,
          created_at: now,
        },
      ],
      comments: [],
      created_at: now,
      updated_at: now,
    };
  });

  db.prepare(`
    INSERT INTO approval_deliveries (
      id, board_id, card_id, title, description, status, items_json,
      created_by, created_by_name, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
  `).run(
    deliveryId,
    board.id,
    card_id || null,
    title.trim(),
    description?.trim() || '',
    JSON.stringify(normalizedItems),
    user.id,
    user.name,
    now,
    now
  );

  // Move linked card to Aprovação column and mark approval_status = 'pending'
  if (card_id) {
    const linkedCard = db.prepare('SELECT * FROM cards WHERE id = ? AND board_id = ?').get(card_id, board.id) as Record<string, unknown> | undefined;
    if (linkedCard) {
      const cols = db.prepare('SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC').all(board.id) as Array<{ id: string; title: string }>;
      const approvalCol = cols.find((c) => c.title.toLowerCase().includes('aprova'));
      const nextColId = approvalCol ? approvalCol.id : String(linkedCard.column_id);
      const nextHistory = appendCardHistory(
        linkedCard.history_json,
        user.id,
        user.name,
        'sent_for_approval',
        `Entrega "${title.trim()}" enviada para aprovação com ${normalizedItems.length} material(is) por ${user.name}`
      );
      db.prepare(`
        UPDATE cards SET column_id = ?, approval_status = 'pending', requires_approval = 1, history_json = ?, updated_at = ?
        WHERE id = ?
      `).run(nextColId, nextHistory, now, card_id);
    }
  }

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'approval_delivery_created',
    entityType: 'approval_delivery',
    entityId: deliveryId,
    title: `Nova aprovação enviada: ${title.trim()}`,
    message: `${user.name} enviou "${title.trim()}" com ${normalizedItems.length} ${normalizedItems.length === 1 ? 'material' : 'materiais'} para sua aprovação.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: card_id || null,
    visibility: 'shared',
    priority: 'high',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#FDF2F6',
  });

  logActivity(user.id, user.name, 'create_approval_delivery', 'approval_delivery', deliveryId, `Enviou aprovação "${title.trim()}"`);

  const created = db
    .prepare(`
      SELECT d.*, c.title as card_title, c.service_name as card_service_name
      FROM approval_deliveries d
      LEFT JOIN cards c ON c.id = d.card_id
      WHERE d.id = ?
    `)
    .get(deliveryId) as Record<string, unknown>;

  res.status(201).json({ delivery: formatApprovalDeliveryRow(created) });
});

router.post('/approvals/:id/items', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const row = db.prepare('SELECT * FROM approval_deliveries WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Entrega de aprovação não encontrada.' });
    return;
  }

  const { items } = req.body as {
    items?: Array<{
      type?: 'image' | 'pdf' | 'link' | 'text' | 'document' | 'file';
      title?: string;
      url?: string;
      file_name?: string;
      mime_type?: string;
      size_bytes?: number;
      content?: string;
      notes?: string;
    }>;
  };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'Informe ao menos um material para adicionar.' });
    return;
  }

  const now = new Date().toISOString();
  const existingItems = safeJsonParse<RawApprovalItem[]>(row.items_json, []);
  const added: RawApprovalItem[] = items.map((item, idx) => {
    const itemTitle = item.title?.trim() || item.file_name || `Material #${existingItems.length + idx + 1}`;
    return {
      id: uid('mat'),
      type: item.type || 'file',
      title: itemTitle,
      url: item.url || '',
      file_name: item.file_name || '',
      mime_type: item.mime_type || '',
      size_bytes: item.size_bytes || 0,
      content: item.content || '',
      notes: item.notes || '',
      status: 'pending',
      feedback: '',
      version_number: 1,
      versions: [
        {
          version: 1,
          title: itemTitle,
          url: item.url || '',
          file_name: item.file_name || '',
          mime_type: item.mime_type || '',
          content: item.content || '',
          notes: item.notes || '',
          uploaded_by_id: user.id,
          uploaded_by_name: user.name,
          created_at: now,
        },
      ],
      comments: [],
      created_at: now,
      updated_at: now,
    };
  });

  const nextItems = [...existingItems, ...added];
  const nextStatus = computeDeliveryStatus(nextItems);
  db.prepare('UPDATE approval_deliveries SET items_json = ?, status = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(nextItems),
    nextStatus,
    now,
    row.id
  );
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, row.board_id);

  const board = db.prepare('SELECT id, client_id FROM boards WHERE id = ?').get(row.board_id) as { id: string; client_id: string } | undefined;
  if (board) {
    const clientUserId = getClientUserId(board.client_id);
    emitStudioEvent({
      actorId: user.id,
      actorName: user.name,
      eventType: 'approval_delivery_updated',
      entityType: 'approval_delivery',
      entityId: String(row.id),
      title: `Novos materiais em ${row.title}`,
      message: `${user.name} adicionou ${added.length} novo(s) material(is) na entrega "${row.title}".`,
      boardId: board.id,
      clientId: board.client_id,
      cardId: row.card_id ? String(row.card_id) : null,
      visibility: 'shared',
      postToBoardMural: true,
      notifyUserIds: clientUserId ? [clientUserId] : [],
      linkTab: 'portal',
      linkEntityId: board.id,
      color: '#FDF2F6',
    });
  }

  const updated = db
    .prepare(`SELECT d.*, c.title as card_title, c.service_name as card_service_name FROM approval_deliveries d LEFT JOIN cards c ON c.id = d.card_id WHERE d.id = ?`)
    .get(row.id) as Record<string, unknown>;
  res.json({ delivery: formatApprovalDeliveryRow(updated) });
});

router.post('/approvals/:id/items/:itemId/decision', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { decision, feedback } = req.body as { decision: 'approved' | 'changes_requested'; feedback?: string };
  if (decision !== 'approved' && decision !== 'changes_requested') {
    res.status(400).json({ error: 'Decisão inválida.' });
    return;
  }

  const row = db.prepare('SELECT * FROM approval_deliveries WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Entrega de aprovação não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(row.board_id) as Record<string, unknown>;
  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client)) {
    res.status(403).json({ error: 'Sem permissão para aprovar este material.' });
    return;
  }

  const items = safeJsonParse<RawApprovalItem[]>(row.items_json, []);
  const target = items.find((i) => i.id === req.params.itemId);
  if (!target) {
    res.status(404).json({ error: 'Material não encontrado nesta entrega.' });
    return;
  }

  const now = new Date().toISOString();
  target.status = decision;
  target.feedback = feedback?.trim() || '';
  target.decided_by_name = user.name;
  target.decided_at = now;
  target.updated_at = now;

  if (feedback?.trim()) {
    target.comments = [
      ...(target.comments || []),
      {
        id: uid('acmt'),
        author_id: user.id,
        author_name: user.name,
        author_role: user.role,
        content: decision === 'approved' ? `[Aprovado] ${feedback.trim()}` : `[Alteração solicitada] ${feedback.trim()}`,
        created_at: now,
      },
    ];
  }

  const nextStatus = computeDeliveryStatus(items);
  db.prepare('UPDATE approval_deliveries SET items_json = ?, status = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(items),
    nextStatus,
    now,
    row.id
  );

  // Sync linked Kanban card status & column
  if (row.card_id) {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(row.card_id) as Record<string, unknown> | undefined;
    if (card) {
      const cols = db.prepare('SELECT id, title FROM board_columns WHERE board_id = ?').all(board.id) as Array<{ id: string; title: string }>;
      let nextColId = String(card.column_id);
      let nextCardApproval = String(card.approval_status || 'pending');
      if (nextStatus === 'approved') {
        const doneCol = cols.find((c) => c.title.toLowerCase().includes('conclu'));
        if (doneCol) nextColId = doneCol.id;
        nextCardApproval = 'approved';
      } else if (nextStatus === 'changes_requested') {
        const prodCol = cols.find((c) => c.title.toLowerCase().includes('produ'));
        if (prodCol) nextColId = prodCol.id;
        nextCardApproval = 'changes_requested';
      } else {
        nextCardApproval = 'pending';
      }
      const nextHistory = appendCardHistory(
        card.history_json,
        user.id,
        user.name,
        decision === 'approved' ? 'approval_item_approved' : 'approval_item_changes',
        `${user.name} ${decision === 'approved' ? 'aprovou' : 'solicitou alteração em'} "${target.title}" (${row.title})${feedback?.trim() ? `: ${feedback.trim()}` : ''}`
      );
      db.prepare('UPDATE cards SET column_id = ?, approval_status = ?, approval_feedback = ?, history_json = ?, updated_at = ? WHERE id = ?').run(
        nextColId,
        nextCardApproval,
        feedback?.trim() || String(card.approval_feedback || ''),
        nextHistory,
        now,
        card.id
      );
    }
  }

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(String(board.client_id));
  const notifyIds =
    user.role === 'client'
      ? [String(board.lead_user_id), String(board.collaborator_user_id || '')]
      : clientUserId
      ? [clientUserId]
      : [];

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: decision === 'approved' ? 'approval_item_approved' : 'approval_item_changes',
    entityType: 'approval_delivery',
    entityId: String(row.id),
    title:
      decision === 'approved'
        ? `Material aprovado: ${target.title}`
        : `Alteração solicitada: ${target.title}`,
    message: `${user.name} ${decision === 'approved' ? 'aprovou o item' : 'solicitou alteração no item'} "${target.title}" na entrega "${row.title}"${feedback?.trim() ? `: ${feedback.trim()}` : '.'}`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: row.card_id ? String(row.card_id) : null,
    visibility: 'shared',
    priority: decision === 'changes_requested' ? 'high' : 'normal',
    postToStudioMural: true,
    postToBoardMural: true,
    notifyUserIds: notifyIds,
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: decision === 'approved' ? '#F4F5E2' : '#FDF0E8',
  });

  logActivity(
    user.id,
    user.name,
    decision === 'approved' ? 'approve_material' : 'request_material_changes',
    'approval_delivery',
    String(row.id),
    `${decision === 'approved' ? 'Aprovou' : 'Solicitou alteração em'} "${target.title}" (${row.title})`
  );

  const updated = db
    .prepare(`SELECT d.*, c.title as card_title, c.service_name as card_service_name FROM approval_deliveries d LEFT JOIN cards c ON c.id = d.card_id WHERE d.id = ?`)
    .get(row.id) as Record<string, unknown>;
  res.json({ delivery: formatApprovalDeliveryRow(updated) });
});

router.post('/approvals/:id/items/:itemId/comments', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { content } = req.body as { content?: string };
  if (!content?.trim()) {
    res.status(400).json({ error: 'Escreva um comentário antes de enviar.' });
    return;
  }

  const row = db.prepare('SELECT * FROM approval_deliveries WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Entrega de aprovação não encontrada.' });
    return;
  }

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(row.board_id) as Record<string, unknown>;
  if (user.role === 'client' && (board.client_id !== user.client_id || !board.shared_with_client)) {
    res.status(403).json({ error: 'Sem permissão para comentar neste material.' });
    return;
  }

  const items = safeJsonParse<RawApprovalItem[]>(row.items_json, []);
  const target = items.find((i) => i.id === req.params.itemId);
  if (!target) {
    res.status(404).json({ error: 'Material não encontrado.' });
    return;
  }

  const now = new Date().toISOString();
  target.comments = [
    ...(target.comments || []),
    {
      id: uid('acmt'),
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      content: content.trim(),
      created_at: now,
    },
  ];
  target.updated_at = now;

  db.prepare('UPDATE approval_deliveries SET items_json = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(items),
    now,
    row.id
  );
  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(String(board.client_id));
  const notifyIds =
    user.role === 'client'
      ? [String(board.lead_user_id), String(board.collaborator_user_id || '')]
      : clientUserId
      ? [clientUserId]
      : [];

  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'approval_item_comment',
    entityType: 'approval_delivery',
    entityId: String(row.id),
    title: `Comentário na aprovação: ${target.title}`,
    message: `${user.name} comentou no material "${target.title}" (${row.title}): "${content.trim().slice(0, 180)}"`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: row.card_id ? String(row.card_id) : null,
    visibility: 'shared',
    postToBoardMural: true,
    notifyUserIds: notifyIds,
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: user.role === 'client' ? '#FDF2F6' : '#F3ECF9',
  });

  const updated = db
    .prepare(`SELECT d.*, c.title as card_title, c.service_name as card_service_name FROM approval_deliveries d LEFT JOIN cards c ON c.id = d.card_id WHERE d.id = ?`)
    .get(row.id) as Record<string, unknown>;
  res.json({ delivery: formatApprovalDeliveryRow(updated) });
});

router.post('/approvals/:id/items/:itemId/version', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const user = req.user!;
  const row = db.prepare('SELECT * FROM approval_deliveries WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ error: 'Entrega de aprovação não encontrada.' });
    return;
  }

  const items = safeJsonParse<RawApprovalItem[]>(row.items_json, []);
  const target = items.find((i) => i.id === req.params.itemId);
  if (!target) {
    res.status(404).json({ error: 'Material não encontrado.' });
    return;
  }

  const { title, url, file_name, mime_type, size_bytes, content, notes } = req.body as {
    title?: string;
    url?: string;
    file_name?: string;
    mime_type?: string;
    size_bytes?: number;
    content?: string;
    notes?: string;
  };

  const now = new Date().toISOString();
  const nextVersionNum = (target.version_number || 1) + 1;

  // Ensure existing version is preserved in versions[]
  if (!Array.isArray(target.versions) || target.versions.length === 0) {
    target.versions = [
      {
        version: target.version_number || 1,
        title: target.title,
        url: target.url || '',
        file_name: target.file_name || '',
        mime_type: target.mime_type || '',
        content: target.content || '',
        notes: target.notes || '',
        uploaded_by_id: String(row.created_by),
        uploaded_by_name: String(row.created_by_name),
        created_at: target.created_at || now,
      },
    ];
  }

  const nextTitle = title?.trim() || target.title;
  const nextUrl = url !== undefined ? url : target.url;
  const nextFileName = file_name !== undefined ? file_name : target.file_name;
  const nextMime = mime_type !== undefined ? mime_type : target.mime_type;
  const nextContent = content !== undefined ? content : target.content;
  const nextNotes = notes !== undefined ? notes : '';

  target.versions.push({
    version: nextVersionNum,
    title: nextTitle,
    url: nextUrl,
    file_name: nextFileName,
    mime_type: nextMime,
    content: nextContent,
    notes: nextNotes,
    uploaded_by_id: user.id,
    uploaded_by_name: user.name,
    created_at: now,
  });

  target.version_number = nextVersionNum;
  target.title = nextTitle;
  target.url = nextUrl;
  target.file_name = nextFileName;
  target.mime_type = nextMime;
  if (size_bytes !== undefined) target.size_bytes = size_bytes;
  target.content = nextContent;
  target.notes = nextNotes;
  target.status = 'pending';
  target.updated_at = now;

  target.comments = [
    ...(target.comments || []),
    {
      id: uid('acmt'),
      author_id: user.id,
      author_name: user.name,
      author_role: user.role,
      content: `[Nova versão v${nextVersionNum} enviada]${nextNotes ? ` ${nextNotes}` : ' Material atualizado e reenviado para aprovação.'}`,
      created_at: now,
    },
  ];

  const nextStatus = computeDeliveryStatus(items);
  db.prepare('UPDATE approval_deliveries SET items_json = ?, status = ?, updated_at = ? WHERE id = ?').run(
    JSON.stringify(items),
    nextStatus,
    now,
    row.id
  );

  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(row.board_id) as Record<string, unknown>;
  // Return linked Kanban card to Aprovação column
  if (row.card_id) {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(row.card_id) as Record<string, unknown> | undefined;
    if (card) {
      const cols = db.prepare('SELECT id, title FROM board_columns WHERE board_id = ?').all(board.id) as Array<{ id: string; title: string }>;
      const approvalCol = cols.find((c) => c.title.toLowerCase().includes('aprova'));
      const nextColId = approvalCol ? approvalCol.id : String(card.column_id);
      const nextHistory = appendCardHistory(
        card.history_json,
        user.id,
        user.name,
        'approval_new_version',
        `${user.name} enviou a versão v${nextVersionNum} de "${target.title}" para aprovação`
      );
      db.prepare(`
        UPDATE cards SET column_id = ?, approval_status = 'pending', history_json = ?, updated_at = ?
        WHERE id = ?
      `).run(nextColId, nextHistory, now, card.id);
    }
  }

  db.prepare('UPDATE boards SET updated_at = ? WHERE id = ?').run(now, board.id);

  const clientUserId = getClientUserId(String(board.client_id));
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'approval_item_version',
    entityType: 'approval_delivery',
    entityId: String(row.id),
    title: `Nova versão v${nextVersionNum} enviada: ${target.title}`,
    message: `${user.name} enviou a versão v${nextVersionNum} de "${target.title}" na entrega "${row.title}" para nova aprovação.`,
    boardId: String(board.id),
    clientId: String(board.client_id),
    cardId: row.card_id ? String(row.card_id) : null,
    visibility: 'shared',
    priority: 'high',
    postToBoardMural: true,
    notifyUserIds: clientUserId ? [clientUserId] : [],
    linkTab: 'portal',
    linkEntityId: String(board.id),
    color: '#F3ECF9',
  });

  const updated = db
    .prepare(`SELECT d.*, c.title as card_title, c.service_name as card_service_name FROM approval_deliveries d LEFT JOIN cards c ON c.id = d.card_id WHERE d.id = ?`)
    .get(row.id) as Record<string, unknown>;
  res.json({ delivery: formatApprovalDeliveryRow(updated) });
});

router.delete('/approvals/:id', requireAuth, requirePartner, (req: AuthRequest, res) => {
  const row = db.prepare('SELECT id, title FROM approval_deliveries WHERE id = ?').get(req.params.id) as { id: string; title: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Entrega não encontrada.' });
    return;
  }
  db.prepare('DELETE FROM approval_deliveries WHERE id = ?').run(row.id);
  logActivity(req.user!.id, req.user!.name, 'delete_approval_delivery', 'approval_delivery', row.id, `Removeu entrega "${row.title}"`);
  res.json({ ok: true });
});

export default router;
