import { Router } from 'express';
import { db, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner, requirePermission } from '../middleware.ts';

const router = Router();

function getFullServices(statusFilter?: string) {
  let query = 'SELECT * FROM services';
  const params: unknown[] = [];
  if (statusFilter && statusFilter !== 'all') {
    query += ' WHERE status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY created_at DESC';

  const services = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  const allDeliverables = db.prepare('SELECT * FROM service_deliverables ORDER BY sort_order ASC').all() as Array<Record<string, unknown>>;
  const allPackages = db.prepare('SELECT * FROM service_packages ORDER BY price_pix ASC').all() as Array<Record<string, unknown>>;
  const allBoards = db.prepare("SELECT id, selected_services_json, status FROM boards WHERE status != 'archived'").all() as Array<{
    id: string;
    selected_services_json: string;
    status: string;
  }>;
  const activeCards = db
    .prepare(`
      SELECT c.service_id, c.board_id, LOWER(col.title) as col_title
      FROM cards c
      JOIN boards b ON b.id = c.board_id
      JOIN board_columns col ON col.id = c.column_id
      WHERE b.status IN ('active', 'draft')
    `)
    .all() as Array<{ service_id: string | null; board_id: string; col_title: string }>;

  return services.map((s) => {
    const svcId = String(s.id);
    const matchingBoards = allBoards.filter((b) => {
      try {
        const selected = JSON.parse(String(b.selected_services_json || '[]')) as Array<{ service_id?: string }>;
        return selected.some((item) => item.service_id === svcId);
      } catch {
        return false;
      }
    });
    const cardsForService = activeCards.filter((c) => c.service_id === svcId);
    const boardSet = new Set<string>([
      ...matchingBoards.map((b) => b.id),
      ...cardsForService.map((c) => c.board_id),
    ]);
    const pendingCards = cardsForService.filter((c) => !c.col_title.includes('conclu')).length;

    return {
      ...s,
      included_items: JSON.parse(String(s.included_items_json || '[]')),
      process_steps: JSON.parse(String(s.process_steps_json || '[]')),
      client_requirements: JSON.parse(String(s.client_requirements_json || '[]')),
      requires_approval: Boolean(s.requires_approval),
      visible_in_portal: Boolean(s.visible_in_portal),
      boards_count: boardSet.size,
      active_deliverables_count: cardsForService.length,
      pending_demands_count: pendingCards,
      deliverables: allDeliverables
        .filter((d) => d.service_id === s.id)
        .map((d) => ({
          ...d,
          requires_approval: Boolean(d.requires_approval),
          extra_fields: JSON.parse(String(d.extra_fields_json || '[]')),
        })),
      packages: allPackages
        .filter((p) => p.service_id === s.id)
        .map((p) => ({
          ...p,
          is_featured: Boolean(p.is_featured),
          deliverables_config: JSON.parse(String(p.deliverables_config_json || '[]')),
        })),
    };
  });
}

router.get('/', requireAuth, requirePartner, (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ services: getFullServices(status) });
});

router.post('/', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    name?: string;
    description?: string;
    category?: string;
    icon?: string;
    color?: string;
    status?: 'active' | 'archived';
    included_items?: string[];
    process_steps?: Array<{ id?: string; title: string; description: string; active: boolean }>;
    client_info_needed?: string;
    client_requirements?: Array<{ key: string; label: string; type: string; required?: boolean; placeholder?: string }>;
    default_deadline_days?: number;
    internal_notes?: string;
    requires_approval?: boolean;
    visible_in_portal?: boolean;
    expected_client_actions?: string;
    deliverables?: Array<{
      id?: string;
      name: string;
      description?: string;
      format?: string;
      default_qty?: number;
      deadline_days?: number;
      guidelines?: string;
      requires_approval?: boolean;
      extra_fields?: string[];
    }>;
    packages?: Array<{
      name: string;
      description?: string;
      price_pix?: number;
      price_card?: number;
      deadline_days?: number;
      conditions?: string;
      is_featured?: boolean;
      deliverables_config?: Array<Record<string, unknown>>;
    }>;
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Informe o nome do serviço.' });
    return;
  }

  const svcId = uid('svc');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO services (
        id, name, description, category, icon, color, status,
        included_items_json, process_steps_json, client_info_needed, client_requirements_json,
        default_deadline_days, internal_notes, requires_approval,
        visible_in_portal, expected_client_actions, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      svcId,
      body.name!.trim(),
      body.description?.trim() || '',
      body.category?.trim() || 'Design',
      body.icon || 'sparkles',
      body.color || '#EC2B82',
      body.status === 'archived' ? 'archived' : 'active',
      JSON.stringify(body.included_items || []),
      JSON.stringify((body.process_steps || []).map((st, idx) => ({ ...st, id: st.id || `st-${idx + 1}` }))),
      body.client_info_needed?.trim() || '',
      JSON.stringify(body.client_requirements || []),
      Number(body.default_deadline_days) || 15,
      body.internal_notes?.trim() || '',
      body.requires_approval !== false ? 1 : 0,
      body.visible_in_portal !== false ? 1 : 0,
      body.expected_client_actions?.trim() || '',
      user.id,
      now,
      now
    );

    const createdDeliverables: Array<{ id: string; name: string; format: string; default_qty: number; deadline_days: number; guidelines: string; requires_approval: boolean }> = [];
    if (Array.isArray(body.deliverables)) {
      const insertDel = db.prepare(`
        INSERT INTO service_deliverables (id, service_id, name, description, format, default_qty, deadline_days, guidelines, requires_approval, extra_fields_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      body.deliverables.forEach((d, idx) => {
        if (!d.name?.trim()) return;
        const delId = uid('del');
        insertDel.run(
          delId,
          svcId,
          d.name.trim(),
          d.description?.trim() || '',
          d.format?.trim() || 'Digital',
          Math.max(1, Number(d.default_qty) || 1),
          Math.max(1, Number(d.deadline_days) || 7),
          d.guidelines?.trim() || '',
          d.requires_approval !== false ? 1 : 0,
          JSON.stringify(d.extra_fields || []),
          idx
        );
        createdDeliverables.push({
          id: delId,
          name: d.name.trim(),
          format: d.format?.trim() || 'Digital',
          default_qty: Math.max(1, Number(d.default_qty) || 1),
          deadline_days: Math.max(1, Number(d.deadline_days) || 7),
          guidelines: d.guidelines?.trim() || '',
          requires_approval: d.requires_approval !== false,
        });
      });
    }

    if (Array.isArray(body.packages)) {
      const insertPkg = db.prepare(`
        INSERT INTO service_packages (id, service_id, name, description, price_pix, price_card, deadline_days, conditions, is_featured, status, deliverables_config_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `);
      for (const p of body.packages) {
        if (!p.name?.trim()) continue;
        const config =
          p.deliverables_config && p.deliverables_config.length > 0
            ? p.deliverables_config
            : createdDeliverables.map((d) => ({
                deliverable_id: d.id,
                name: d.name,
                format: d.format,
                qty: d.default_qty,
                deadline_days: d.deadline_days,
                guidelines: d.guidelines,
                requires_approval: d.requires_approval,
              }));
        insertPkg.run(
          uid('pkg'),
          svcId,
          p.name.trim(),
          p.description?.trim() || '',
          Number(p.price_pix) || 0,
          Number(p.price_card) || Number(p.price_pix) || 0,
          Number(p.deadline_days) || Number(body.default_deadline_days) || 15,
          p.conditions?.trim() || '',
          p.is_featured ? 1 : 0,
          JSON.stringify(config),
          now,
          now
        );
      }
    }
  });

  tx();
  logActivity(user.id, user.name, 'create_service', 'service', svcId, `Cadastrou serviço: ${body.name.trim()}`);
  const created = getFullServices().find((s) => (s as Record<string, unknown>).id === svcId);
  res.status(201).json({ service: created });
});

router.put('/:id', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const user = req.user!;
  const svcId = req.params.id;
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(svcId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Serviço não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE services SET
        name = ?, description = ?, category = ?, icon = ?, color = ?, status = ?,
        included_items_json = ?, process_steps_json = ?, client_info_needed = ?, client_requirements_json = ?,
        default_deadline_days = ?, internal_notes = ?, requires_approval = ?,
        visible_in_portal = ?, expected_client_actions = ?, updated_at = ?
      WHERE id = ?
    `).run(
      (body.name as string)?.trim() || existing.name,
      body.description !== undefined ? String(body.description).trim() : existing.description,
      body.category !== undefined ? String(body.category).trim() : existing.category,
      body.icon !== undefined ? String(body.icon) : existing.icon,
      body.color !== undefined ? String(body.color) : existing.color,
      body.status === 'archived' || body.status === 'active' ? body.status : existing.status,
      body.included_items !== undefined ? JSON.stringify(body.included_items) : existing.included_items_json,
      body.process_steps !== undefined ? JSON.stringify(body.process_steps) : existing.process_steps_json,
      body.client_info_needed !== undefined ? String(body.client_info_needed) : existing.client_info_needed,
      body.client_requirements !== undefined ? JSON.stringify(body.client_requirements) : existing.client_requirements_json,
      body.default_deadline_days !== undefined ? Number(body.default_deadline_days) : existing.default_deadline_days,
      body.internal_notes !== undefined ? String(body.internal_notes) : existing.internal_notes,
      body.requires_approval !== undefined ? (body.requires_approval ? 1 : 0) : existing.requires_approval,
      body.visible_in_portal !== undefined ? (body.visible_in_portal ? 1 : 0) : existing.visible_in_portal,
      body.expected_client_actions !== undefined ? String(body.expected_client_actions) : existing.expected_client_actions,
      now,
      svcId
    );

    if (Array.isArray(body.deliverables)) {
      db.prepare('DELETE FROM service_deliverables WHERE service_id = ?').run(svcId);
      const insertDel = db.prepare(`
        INSERT INTO service_deliverables (id, service_id, name, description, format, default_qty, deadline_days, guidelines, requires_approval, extra_fields_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      (body.deliverables as Array<Record<string, unknown>>).forEach((d, idx) => {
        if (!String(d.name || '').trim()) return;
        insertDel.run(
          d.id && String(d.id).startsWith('del-') ? String(d.id) : uid('del'),
          svcId,
          String(d.name).trim(),
          String(d.description || '').trim(),
          String(d.format || 'Digital').trim(),
          Math.max(1, Number(d.default_qty) || 1),
          Math.max(1, Number(d.deadline_days) || 7),
          String(d.guidelines || '').trim(),
          d.requires_approval !== false ? 1 : 0,
          JSON.stringify(d.extra_fields || []),
          idx
        );
      });
    }
  });

  tx();
  logActivity(user.id, user.name, 'update_service', 'service', svcId, `Atualizou serviço: ${(body.name as string) || existing.name}`);
  const updated = getFullServices().find((s) => (s as Record<string, unknown>).id === svcId);
  res.json({ service: updated });
});

router.patch('/:id/status', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const { status } = req.body as { status: 'active' | 'archived' };
  db.prepare('UPDATE services SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_service', 'service', req.params.id, 'Excluiu serviço');
  res.json({ ok: true });
});

router.post('/:id/packages', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const svcId = req.params.id;
  const body = req.body as {
    name?: string;
    description?: string;
    price_pix?: number;
    price_card?: number;
    deadline_days?: number;
    conditions?: string;
    is_featured?: boolean;
    deliverables_config?: Array<Record<string, unknown>>;
  };

  if (!body.name?.trim()) {
    res.status(400).json({ error: 'Informe o nome do pacote.' });
    return;
  }

  const pkgId = uid('pkg');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO service_packages (id, service_id, name, description, price_pix, price_card, deadline_days, conditions, is_featured, status, deliverables_config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(
    pkgId,
    svcId,
    body.name.trim(),
    body.description?.trim() || '',
    Number(body.price_pix) || 0,
    Number(body.price_card) || Number(body.price_pix) || 0,
    Number(body.deadline_days) || 15,
    body.conditions?.trim() || '',
    body.is_featured ? 1 : 0,
    JSON.stringify(body.deliverables_config || []),
    now,
    now
  );

  logActivity(req.user!.id, req.user!.name, 'create_package', 'package', pkgId, `Criou pacote: ${body.name.trim()}`);
  const service = getFullServices().find((s) => (s as Record<string, unknown>).id === svcId);
  res.status(201).json({ service });
});

router.put('/packages/:pkgId', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const pkg = db.prepare('SELECT * FROM service_packages WHERE id = ?').get(req.params.pkgId) as Record<string, unknown> | undefined;
  if (!pkg) {
    res.status(404).json({ error: 'Pacote não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE service_packages SET
      name = ?, description = ?, price_pix = ?, price_card = ?,
      deadline_days = ?, conditions = ?, is_featured = ?, status = ?,
      deliverables_config_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.name !== undefined ? String(body.name).trim() : pkg.name,
    body.description !== undefined ? String(body.description).trim() : pkg.description,
    body.price_pix !== undefined ? Number(body.price_pix) : pkg.price_pix,
    body.price_card !== undefined ? Number(body.price_card) : pkg.price_card,
    body.deadline_days !== undefined ? Number(body.deadline_days) : pkg.deadline_days,
    body.conditions !== undefined ? String(body.conditions).trim() : pkg.conditions,
    body.is_featured !== undefined ? (body.is_featured ? 1 : 0) : pkg.is_featured,
    body.status === 'archived' || body.status === 'active' ? body.status : pkg.status,
    body.deliverables_config !== undefined ? JSON.stringify(body.deliverables_config) : pkg.deliverables_config_json,
    now,
    req.params.pkgId
  );

  const service = getFullServices().find((s) => (s as Record<string, unknown>).id === pkg.service_id);
  res.json({ service });
});

router.post('/packages/:pkgId/duplicate', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const pkg = db.prepare('SELECT * FROM service_packages WHERE id = ?').get(req.params.pkgId) as Record<string, unknown> | undefined;
  if (!pkg) {
    res.status(404).json({ error: 'Pacote não encontrado.' });
    return;
  }

  const newId = uid('pkg');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO service_packages (id, service_id, name, description, price_pix, price_card, deadline_days, conditions, is_featured, status, deliverables_config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
  `).run(
    newId,
    pkg.service_id,
    `${pkg.name} (Cópia)`,
    pkg.description,
    pkg.price_pix,
    pkg.price_card,
    pkg.deadline_days,
    pkg.conditions,
    pkg.deliverables_config_json,
    now,
    now
  );

  const service = getFullServices().find((s) => (s as Record<string, unknown>).id === pkg.service_id);
  res.status(201).json({ service });
});

router.delete('/packages/:pkgId', requireAuth, requirePermission('can_manage_services'), (req: AuthRequest, res) => {
  const pkg = db.prepare('SELECT service_id FROM service_packages WHERE id = ?').get(req.params.pkgId) as { service_id: string } | undefined;
  db.prepare('DELETE FROM service_packages WHERE id = ?').run(req.params.pkgId);
  const service = pkg ? getFullServices().find((s) => (s as Record<string, unknown>).id === pkg.service_id) : null;
  res.json({ ok: true, service });
});

export default router;
