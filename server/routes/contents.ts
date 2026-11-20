import { Router } from 'express';
import { db, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner } from '../middleware.ts';
import { broadcastRealtime } from '../realtime.ts';

const router = Router();

// Strictly partner-only — external clients must NEVER access Conteúdos
router.use('/contents', requireAuth, requirePartner);

interface RawContentItem {
  id: string;
  title: string;
  body_html: string;
  column_id: string;
  folder_id: string | null;
  theme_id: string | null;
  card_color: string;
  card_icon: string;
  is_favorite: number;
  is_draft: number;
  sort_order: number;
  assignee_id: string | null;
  created_by_id: string;
  created_by_name: string;
  updated_by_id: string;
  updated_by_name: string;
  created_at: string;
  updated_at: string;
}

function hydrateItems(rows: RawContentItem[]) {
  const allItemTags = db
    .prepare('SELECT content_id, tag_id FROM content_item_tags')
    .all() as Array<{ content_id: string; tag_id: string }>;

  const tagMap = new Map<string, string[]>();
  for (const row of allItemTags) {
    const arr = tagMap.get(row.content_id) || [];
    arr.push(row.tag_id);
    tagMap.set(row.content_id, arr);
  }

  return rows.map((item) => ({
    ...item,
    is_favorite: Boolean(item.is_favorite),
    is_draft: Boolean(item.is_draft),
    tag_ids: tagMap.get(item.id) || [],
  }));
}

// GET /api/contents/workspace
router.get('/contents/workspace', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const columns = db
    .prepare('SELECT * FROM content_columns ORDER BY sort_order ASC, created_at ASC')
    .all();

  const folders = db
    .prepare(`
      SELECT f.*,
             (SELECT COUNT(*) FROM content_items i WHERE i.folder_id = f.id) as items_count
      FROM content_folders f
      ORDER BY f.sort_order ASC, f.created_at ASC
    `)
    .all();

  const themes = db
    .prepare(`
      SELECT t.*,
             (SELECT COUNT(*) FROM content_items i WHERE i.theme_id = t.id) as items_count
      FROM content_themes t
      ORDER BY t.sort_order ASC, t.created_at ASC
    `)
    .all();

  const tags = db
    .prepare(`
      SELECT tg.*,
             (SELECT COUNT(*) FROM content_item_tags cit WHERE cit.tag_id = tg.id) as items_count
      FROM content_tags tg
      ORDER BY tg.name ASC
    `)
    .all();

  const rawItems = db
    .prepare('SELECT * FROM content_items ORDER BY sort_order ASC, updated_at DESC')
    .all() as RawContentItem[];

  const items = hydrateItems(rawItems);

  const partners = db
    .prepare("SELECT id, name, partner_key, avatar_url, title FROM users WHERE role = 'partner' AND active = 1 ORDER BY name ASC")
    .all();

  const recentEdits = [...items]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.title,
      updated_by_id: item.updated_by_id,
      updated_by_name: item.updated_by_name,
      updated_at: item.updated_at,
    }));

  res.json({
    columns,
    folders,
    themes,
    tags,
    items,
    partners,
    recent_edits: recentEdits,
  });
});

// =====================================================================
// COLUMNS (KANBAN)
// =====================================================================
router.post('/contents/columns', (req: AuthRequest, res) => {
  const { title, color, icon } = req.body as { title?: string; color?: string; icon?: string };
  if (!title?.trim()) {
    res.status(400).json({ error: 'Informe o nome da coluna.' });
    return;
  }
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM content_columns').get() as { m: number }).m;
  const id = uid('ccol');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO content_columns (id, title, color, icon, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), color || '#EC2B82', icon || 'sparkles', maxOrder + 1, now);

  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id, summary: `Nova coluna: ${title.trim()}` });
  const column = db.prepare('SELECT * FROM content_columns WHERE id = ?').get(id);
  res.status(201).json({ column });
});

router.put('/contents/columns/reorder', (req: AuthRequest, res) => {
  const { column_ids } = req.body as { column_ids?: string[] };
  if (!Array.isArray(column_ids) || column_ids.length === 0) {
    res.status(400).json({ error: 'Lista de colunas inválida.' });
    return;
  }
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE content_columns SET sort_order = ? WHERE id = ?');
    column_ids.forEach((cid, idx) => upd.run(idx, cid));
  });
  tx();
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true });
});

router.put('/contents/columns/:id', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM content_columns WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }
  const { title, color, icon } = req.body as { title?: string; color?: string; icon?: string };
  db.prepare('UPDATE content_columns SET title = ?, color = ?, icon = ? WHERE id = ?').run(
    title?.trim() || existing.title,
    color || existing.color,
    icon || existing.icon,
    req.params.id
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const column = db.prepare('SELECT * FROM content_columns WHERE id = ?').get(req.params.id);
  res.json({ column });
});

router.delete('/contents/columns/:id', (req: AuthRequest, res) => {
  const allCols = db.prepare('SELECT id FROM content_columns ORDER BY sort_order ASC').all() as Array<{ id: string }>;
  if (allCols.length <= 1) {
    res.status(400).json({ error: 'Mantenha pelo menos uma coluna no quadro de conteúdos.' });
    return;
  }
  const fallback = allCols.find((c) => c.id !== req.params.id);
  if (!fallback) {
    res.status(404).json({ error: 'Coluna não encontrada.' });
    return;
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE content_items SET column_id = ? WHERE column_id = ?').run(fallback.id, req.params.id);
    db.prepare('DELETE FROM content_columns WHERE id = ?').run(req.params.id);
  });
  tx();
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true, moved_to_column_id: fallback.id });
});

// =====================================================================
// PASTAS (FOLDERS) — INDEPENDENT
// =====================================================================
router.post('/contents/folders', (req: AuthRequest, res) => {
  const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome da pasta.' });
    return;
  }
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM content_folders').get() as { m: number }).m;
  const id = uid('cfld');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO content_folders (id, name, icon, color, sort_order, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), icon || 'folder', color || '#EC2B82', maxOrder + 1, req.user!.id, now);

  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const folder = db.prepare('SELECT *, 0 as items_count FROM content_folders WHERE id = ?').get(id);
  res.status(201).json({ folder });
});

router.put('/contents/folders/:id', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM content_folders WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Pasta não encontrada.' });
    return;
  }
  const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };
  db.prepare('UPDATE content_folders SET name = ?, icon = ?, color = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    icon || existing.icon,
    color || existing.color,
    req.params.id
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const folder = db
    .prepare('SELECT f.*, (SELECT COUNT(*) FROM content_items i WHERE i.folder_id = f.id) as items_count FROM content_folders f WHERE f.id = ?')
    .get(req.params.id);
  res.json({ folder });
});

router.delete('/contents/folders/:id', (req: AuthRequest, res) => {
  db.prepare('UPDATE content_items SET folder_id = NULL WHERE folder_id = ?').run(req.params.id);
  db.prepare('DELETE FROM content_folders WHERE id = ?').run(req.params.id);
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true });
});

// =====================================================================
// TEMAS (PRIMARY THEMES) — INDEPENDENT FROM TAGS & FOLDERS
// =====================================================================
router.post('/contents/themes', (req: AuthRequest, res) => {
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome do tema.' });
    return;
  }
  const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM content_themes').get() as { m: number }).m;
  const id = uid('cthm');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO content_themes (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)').run(
    id,
    name.trim(),
    color || '#7A689C',
    maxOrder + 1,
    now
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const theme = db.prepare('SELECT *, 0 as items_count FROM content_themes WHERE id = ?').get(id);
  res.status(201).json({ theme });
});

router.put('/contents/themes/:id', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM content_themes WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Tema não encontrado.' });
    return;
  }
  const { name, color } = req.body as { name?: string; color?: string };
  db.prepare('UPDATE content_themes SET name = ?, color = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    color || existing.color,
    req.params.id
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const theme = db
    .prepare('SELECT t.*, (SELECT COUNT(*) FROM content_items i WHERE i.theme_id = t.id) as items_count FROM content_themes t WHERE t.id = ?')
    .get(req.params.id);
  res.json({ theme });
});

router.delete('/contents/themes/:id', (req: AuthRequest, res) => {
  db.prepare('UPDATE content_items SET theme_id = NULL WHERE theme_id = ?').run(req.params.id);
  db.prepare('DELETE FROM content_themes WHERE id = ?').run(req.params.id);
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true });
});

// =====================================================================
// ETIQUETAS (MULTI-TAGS) — INDEPENDENT FROM THEMES & FOLDERS
// =====================================================================
router.post('/contents/tags', (req: AuthRequest, res) => {
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'Informe o nome da etiqueta.' });
    return;
  }
  const id = uid('ctag');
  const now = new Date().toISOString();
  db.prepare('INSERT INTO content_tags (id, name, color, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    name.trim(),
    color || '#EC2B82',
    now
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const tag = db.prepare('SELECT *, 0 as items_count FROM content_tags WHERE id = ?').get(id);
  res.status(201).json({ tag });
});

router.put('/contents/tags/:id', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM content_tags WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Etiqueta não encontrada.' });
    return;
  }
  const { name, color } = req.body as { name?: string; color?: string };
  db.prepare('UPDATE content_tags SET name = ?, color = ? WHERE id = ?').run(
    name?.trim() || existing.name,
    color || existing.color,
    req.params.id
  );
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  const tag = db
    .prepare('SELECT tg.*, (SELECT COUNT(*) FROM content_item_tags cit WHERE cit.tag_id = tg.id) as items_count FROM content_tags tg WHERE tg.id = ?')
    .get(req.params.id);
  res.json({ tag });
});

router.delete('/contents/tags/:id', (req: AuthRequest, res) => {
  db.prepare('DELETE FROM content_item_tags WHERE tag_id = ?').run(req.params.id);
  db.prepare('DELETE FROM content_tags WHERE id = ?').run(req.params.id);
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true });
});

// =====================================================================
// CONTENT ITEMS (CARDS)
// =====================================================================
router.post('/contents/items', (req: AuthRequest, res) => {
  const user = req.user!;
  const {
    title,
    body_html,
    column_id,
    folder_id,
    theme_id,
    tag_ids,
    card_color,
    card_icon,
    is_favorite,
    is_draft,
    assignee_id,
  } = req.body as {
    title?: string;
    body_html?: string;
    column_id?: string;
    folder_id?: string | null;
    theme_id?: string | null;
    tag_ids?: string[];
    card_color?: string;
    card_icon?: string;
    is_favorite?: boolean;
    is_draft?: boolean;
    assignee_id?: string | null;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: 'Informe um título para o conteúdo.' });
    return;
  }

  let targetColumnId = column_id;
  if (!targetColumnId) {
    const firstCol = db.prepare('SELECT id FROM content_columns ORDER BY sort_order ASC LIMIT 1').get() as { id: string } | undefined;
    if (!firstCol) {
      res.status(400).json({ error: 'Crie ao menos uma coluna antes de adicionar conteúdos.' });
      return;
    }
    targetColumnId = firstCol.id;
  }

  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM content_items WHERE column_id = ?').get(targetColumnId) as { m: number }
  ).m;

  const id = uid('citm');
  const now = new Date().toISOString();
  const safeTags = Array.isArray(tag_ids) ? Array.from(new Set(tag_ids.filter(Boolean))) : [];

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO content_items (
        id, title, body_html, column_id, folder_id, theme_id, card_color, card_icon,
        is_favorite, is_draft, sort_order, assignee_id,
        created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      title.trim(),
      body_html || '',
      targetColumnId,
      folder_id || null,
      theme_id || null,
      card_color || '#FFFFFF',
      card_icon || 'sparkles',
      is_favorite ? 1 : 0,
      is_draft ? 1 : 0,
      maxOrder + 1,
      assignee_id || user.id,
      user.id,
      user.name,
      user.id,
      user.name,
      now,
      now
    );

    const insTag = db.prepare('INSERT OR IGNORE INTO content_item_tags (content_id, tag_id) VALUES (?, ?)');
    for (const tid of safeTags) {
      insTag.run(id, tid);
    }
  });
  tx();

  logActivity(user.id, user.name, 'create_content', 'content', id, `Criou conteúdo "${title.trim()}"`);
  broadcastRealtime({ type: 'contents_updated', actorId: user.id, summary: `Novo conteúdo: ${title.trim()}` });

  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as RawContentItem;
  res.status(201).json({ item: hydrateItems([row])[0] });
});

router.put('/contents/items/:id', (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as RawContentItem | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Conteúdo não encontrado.' });
    return;
  }

  const body = req.body as {
    title?: string;
    body_html?: string;
    column_id?: string;
    folder_id?: string | null;
    theme_id?: string | null;
    tag_ids?: string[];
    card_color?: string;
    card_icon?: string;
    is_favorite?: boolean;
    is_draft?: boolean;
    assignee_id?: string | null;
  };

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE content_items SET
        title = ?, body_html = ?, column_id = ?, folder_id = ?, theme_id = ?,
        card_color = ?, card_icon = ?, is_favorite = ?, is_draft = ?, assignee_id = ?,
        updated_by_id = ?, updated_by_name = ?, updated_at = ?
      WHERE id = ?
    `).run(
      body.title !== undefined ? body.title.trim() || existing.title : existing.title,
      body.body_html !== undefined ? body.body_html : existing.body_html,
      body.column_id !== undefined ? body.column_id : existing.column_id,
      body.folder_id !== undefined ? body.folder_id || null : existing.folder_id,
      body.theme_id !== undefined ? body.theme_id || null : existing.theme_id,
      body.card_color !== undefined ? body.card_color : existing.card_color,
      body.card_icon !== undefined ? body.card_icon : existing.card_icon,
      body.is_favorite !== undefined ? (body.is_favorite ? 1 : 0) : existing.is_favorite,
      body.is_draft !== undefined ? (body.is_draft ? 1 : 0) : existing.is_draft,
      body.assignee_id !== undefined ? body.assignee_id || null : existing.assignee_id,
      user.id,
      user.name,
      now,
      req.params.id
    );

    if (Array.isArray(body.tag_ids)) {
      db.prepare('DELETE FROM content_item_tags WHERE content_id = ?').run(req.params.id);
      const insTag = db.prepare('INSERT OR IGNORE INTO content_item_tags (content_id, tag_id) VALUES (?, ?)');
      for (const tid of Array.from(new Set(body.tag_ids.filter(Boolean)))) {
        insTag.run(req.params.id, tid);
      }
    }
  });
  tx();

  logActivity(user.id, user.name, 'update_content', 'content', req.params.id, `Atualizou conteúdo "${body.title?.trim() || existing.title}"`);
  broadcastRealtime({ type: 'contents_updated', actorId: user.id });

  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as RawContentItem;
  res.json({ item: hydrateItems([row])[0] });
});

router.patch('/contents/items/:id/move', (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as RawContentItem | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Conteúdo não encontrado.' });
    return;
  }

  const { column_id, sort_order, folder_id } = req.body as {
    column_id?: string;
    sort_order?: number;
    folder_id?: string | null;
  };

  const targetColId = column_id || existing.column_id;
  const targetFolderId = folder_id !== undefined ? folder_id || null : existing.folder_id;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE content_items
      SET column_id = ?, folder_id = ?, updated_by_id = ?, updated_by_name = ?, updated_at = ?
      WHERE id = ?
    `).run(targetColId, targetFolderId, user.id, user.name, now, req.params.id);

    const siblings = db
      .prepare('SELECT id FROM content_items WHERE column_id = ? AND id != ? ORDER BY sort_order ASC, updated_at DESC')
      .all(targetColId, req.params.id) as Array<{ id: string }>;

    const targetIndex =
      typeof sort_order === 'number' && Number.isFinite(sort_order)
        ? Math.max(0, Math.min(sort_order, siblings.length))
        : siblings.length;

    siblings.splice(targetIndex, 0, { id: req.params.id });

    const updSort = db.prepare('UPDATE content_items SET sort_order = ? WHERE id = ?');
    siblings.forEach((s, idx) => updSort.run(idx, s.id));
  });
  tx();

  broadcastRealtime({ type: 'contents_updated', actorId: user.id });
  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as RawContentItem;
  res.json({ item: hydrateItems([row])[0] });
});

router.patch('/contents/items/:id/favorite', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT id, is_favorite FROM content_items WHERE id = ?').get(req.params.id) as { id: string; is_favorite: number } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Conteúdo não encontrado.' });
    return;
  }
  const nextFav = existing.is_favorite ? 0 : 1;
  db.prepare('UPDATE content_items SET is_favorite = ? WHERE id = ?').run(nextFav, req.params.id);
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true, is_favorite: Boolean(nextFav) });
});

router.post('/contents/items/:id/duplicate', (req: AuthRequest, res) => {
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM content_items WHERE id = ?').get(req.params.id) as RawContentItem | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Conteúdo não encontrado.' });
    return;
  }
  const existingTags = db
    .prepare('SELECT tag_id FROM content_item_tags WHERE content_id = ?')
    .all(existing.id) as Array<{ tag_id: string }>;

  const newId = uid('citm');
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO content_items (
        id, title, body_html, column_id, folder_id, theme_id, card_color, card_icon,
        is_favorite, is_draft, sort_order, assignee_id,
        created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      `${existing.title} (cópia)`,
      existing.body_html,
      existing.column_id,
      existing.folder_id,
      existing.theme_id,
      existing.card_color,
      existing.card_icon,
      existing.is_draft,
      existing.sort_order + 1,
      existing.assignee_id,
      user.id,
      user.name,
      user.id,
      user.name,
      now,
      now
    );
    const insTag = db.prepare('INSERT OR IGNORE INTO content_item_tags (content_id, tag_id) VALUES (?, ?)');
    for (const t of existingTags) {
      insTag.run(newId, t.tag_id);
    }
  });
  tx();

  broadcastRealtime({ type: 'contents_updated', actorId: user.id });
  const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(newId) as RawContentItem;
  res.status(201).json({ item: hydrateItems([row])[0] });
});

router.delete('/contents/items/:id', (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT title FROM content_items WHERE id = ?').get(req.params.id) as { title: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Conteúdo não encontrado.' });
    return;
  }
  db.prepare('DELETE FROM content_items WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_content', 'content', req.params.id, `Excluiu conteúdo "${existing.title}"`);
  broadcastRealtime({ type: 'contents_updated', actorId: req.user!.id });
  res.json({ ok: true });
});

export default router;
