import { Router } from 'express';
import { db, emitStudioEvent, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, requirePartner, requirePermission } from '../middleware.ts';

const router = Router();

router.get('/finance/entries', requireAuth, requirePartner, (req, res) => {
  const { type, status, category, client_id, responsible, from, to } = req.query as Record<string, string>;

  let query = `
    SELECT f.*, c.name as client_name, s.name as service_name, b.title as board_title, u.name as created_by_name
    FROM finance_entries f
    LEFT JOIN clients c ON c.id = f.client_id
    LEFT JOIN services s ON s.id = f.service_id
    LEFT JOIN boards b ON b.id = f.board_id
    LEFT JOIN users u ON u.id = f.created_by
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (type && type !== 'all') {
    query += ' AND f.type = ?';
    params.push(type);
  }
  if (status && status !== 'all') {
    query += ' AND f.status = ?';
    params.push(status);
  }
  if (category && category !== 'all') {
    query += ' AND f.category = ?';
    params.push(category);
  }
  if (client_id && client_id !== 'all') {
    query += ' AND f.client_id = ?';
    params.push(client_id);
  }
  if (responsible && responsible !== 'all') {
    query += ' AND (f.created_by = ? OR b.lead_user_id = ? OR c.owner_partner = (SELECT partner_key FROM users WHERE id = ?))';
    params.push(responsible, responsible, responsible);
  }
  if (from) {
    query += ' AND f.entry_date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND f.entry_date <= ?';
    params.push(to);
  }

  query += ' ORDER BY f.entry_date DESC, f.created_at DESC';
  const entries = db.prepare(query).all(...params);
  res.json({ entries });
});

router.get('/finance/summary', requireAuth, requirePartner, (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  let dateClause = '';
  const params: unknown[] = [];
  if (from) {
    dateClause += ' AND entry_date >= ?';
    params.push(from);
  }
  if (to) {
    dateClause += ' AND entry_date <= ?';
    params.push(to);
  }

  const paidIncome = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'income' AND status = 'paid' ${dateClause}`).get(...params) as { s: number }
  ).s;
  const paidExpense = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'expense' AND status = 'paid' ${dateClause}`).get(...params) as { s: number }
  ).s;
  const pendingReceivable = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'income' AND status IN ('pending', 'overdue') ${dateClause}`).get(...params) as { s: number }
  ).s;
  const pendingPayable = (
    db.prepare(`SELECT COALESCE(SUM(amount), 0) as s FROM finance_entries WHERE type = 'expense' AND status IN ('pending', 'overdue') ${dateClause}`).get(...params) as { s: number }
  ).s;

  const byClient = db
    .prepare(`
      SELECT c.id, c.name, COALESCE(SUM(f.amount), 0) as total
      FROM finance_entries f
      JOIN clients c ON c.id = f.client_id
      WHERE f.type = 'income' AND f.status != 'cancelled' ${dateClause.replace(/entry_date/g, 'f.entry_date')}
      GROUP BY c.id, c.name
      ORDER BY total DESC
      LIMIT 8
    `)
    .all(...params);

  const byService = db
    .prepare(`
      SELECT COALESCE(s.name, f.category) as name, COALESCE(SUM(f.amount), 0) as total
      FROM finance_entries f
      LEFT JOIN services s ON s.id = f.service_id
      WHERE f.type = 'income' AND f.status != 'cancelled' ${dateClause.replace(/entry_date/g, 'f.entry_date')}
      GROUP BY COALESCE(s.name, f.category)
      ORDER BY total DESC
      LIMIT 8
    `)
    .all(...params);

  const byCategory = db
    .prepare(`
      SELECT category, type, COALESCE(SUM(amount), 0) as total
      FROM finance_entries
      WHERE status != 'cancelled' ${dateClause}
      GROUP BY category, type
      ORDER BY total DESC
    `)
    .all(...params);

  const monthlySeries = db
    .prepare(`
      SELECT substr(entry_date, 1, 7) as month,
             COALESCE(SUM(CASE WHEN type = 'income' AND status != 'cancelled' THEN amount ELSE 0 END), 0) as income,
             COALESCE(SUM(CASE WHEN type = 'expense' AND status != 'cancelled' THEN amount ELSE 0 END), 0) as expense
      FROM finance_entries
      WHERE entry_date IS NOT NULL AND entry_date != ''
      GROUP BY substr(entry_date, 1, 7)
      ORDER BY month DESC
      LIMIT 6
    `)
    .all()
    .reverse();

  const upcomingReceivables = db
    .prepare(`
      SELECT f.id, f.description, f.amount, f.due_date, f.entry_date, f.status, c.name as client_name
      FROM finance_entries f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.type = 'income' AND f.status IN ('pending', 'overdue')
      ORDER BY COALESCE(f.due_date, f.entry_date) ASC
      LIMIT 6
    `)
    .all();

  const upcomingPayables = db
    .prepare(`
      SELECT f.id, f.description, f.amount, f.due_date, f.entry_date, f.status, c.name as client_name
      FROM finance_entries f
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE f.type = 'expense' AND f.status IN ('pending', 'overdue')
      ORDER BY COALESCE(f.due_date, f.entry_date) ASC
      LIMIT 6
    `)
    .all();

  res.json({
    summary: {
      balance: paidIncome - paidExpense,
      total_income: paidIncome,
      total_expense: paidExpense,
      pending_receivable: pendingReceivable,
      pending_payable: pendingPayable,
      period_result: paidIncome - paidExpense,
    },
    by_client: byClient,
    by_service: byService,
    by_category: byCategory,
    monthly_series: monthlySeries,
    upcoming_receivables: upcomingReceivables,
    upcoming_payables: upcomingPayables,
  });
});

router.post('/finance/entries', requireAuth, requirePermission('can_manage_finance'), (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    type: 'income' | 'expense';
    description: string;
    amount: number;
    category: string;
    entry_date: string;
    due_date?: string;
    status?: 'pending' | 'paid' | 'overdue' | 'cancelled';
    client_id?: string | null;
    service_id?: string | null;
    board_id?: string | null;
    payment_method?: string;
    notes?: string;
    split_society?: boolean;
  };

  if (!body.description?.trim() || !body.amount || Number(body.amount) <= 0) {
    res.status(400).json({ error: 'Informe descrição e valor válido para o lançamento.' });
    return;
  }

  const id = uid('fin');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO finance_entries (
        id, type, description, amount, category, entry_date, due_date, status,
        client_id, service_id, board_id, payment_method, notes, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      body.type === 'expense' ? 'expense' : 'income',
      body.description.trim(),
      Number(body.amount),
      body.category?.trim() || (body.type === 'expense' ? 'Operacional' : 'Serviços Criativos'),
      body.entry_date || now.slice(0, 10),
      body.due_date || null,
      body.status || 'pending',
      body.client_id || null,
      body.service_id || null,
      body.board_id || null,
      body.payment_method || 'Pix',
      body.notes?.trim() || '',
      user.id,
      now,
      now
    );

    if (body.split_society) {
      const configs = db.prepare('SELECT * FROM society_config').all() as Array<{
        user_id: string;
        default_revenue_split: number;
        default_expense_split: number;
      }>;
      const insertSoc = db.prepare(`
        INSERT INTO society_entries (
          id, type, partner_user_id, description, amount, split_percent, origin_type,
          finance_entry_id, board_id, entry_date, status, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'finance_link', ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cfg of configs) {
        const pct = body.type === 'expense' ? cfg.default_expense_split : cfg.default_revenue_split;
        const shareAmount = Math.round(((Number(body.amount) * pct) / 100) * 100) / 100;
        insertSoc.run(
          uid('sce'),
          body.type === 'expense' ? 'expense_share' : 'revenue_share',
          cfg.user_id,
          `${body.description.trim()} (${pct}%)`,
          shareAmount,
          pct,
          id,
          body.board_id || null,
          body.entry_date || now.slice(0, 10),
          body.status === 'paid' ? 'confirmed' : 'pending',
          `Vinculado ao lançamento financeiro ${id}`,
          user.id,
          now
        );
      }
    }
  });

  tx();
  logActivity(user.id, user.name, 'create_finance_entry', 'finance', id, `Registrou ${body.type === 'expense' ? 'despesa' : 'entrada'}: ${body.description.trim()}`);
  emitStudioEvent({
    actorId: user.id,
    actorName: user.name,
    eventType: 'finance_entry',
    entityType: 'finance',
    entityId: id,
    title: `${body.type === 'expense' ? 'Nova despesa' : 'Nova entrada'}: ${body.description.trim()}`,
    message: `${user.name} registrou R$ ${Number(body.amount).toFixed(2).replace('.', ',')} (${body.status === 'paid' ? 'Pago' : 'Pendente'}).`,
    boardId: body.board_id || null,
    clientId: body.client_id || null,
    postToStudioMural: true,
    color: body.type === 'expense' ? '#FDF0E8' : '#F4F5E2',
  });
  const entry = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(id);
  res.status(201).json({ entry });
});

router.put('/finance/entries/:id', requireAuth, requirePermission('can_manage_finance'), (req: AuthRequest, res) => {
  const existing = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Lançamento não encontrado.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE finance_entries SET
      type = ?, description = ?, amount = ?, category = ?, entry_date = ?, due_date = ?,
      status = ?, client_id = ?, service_id = ?, board_id = ?, payment_method = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    body.type !== undefined ? body.type : existing.type,
    body.description !== undefined ? String(body.description).trim() : existing.description,
    body.amount !== undefined ? Number(body.amount) : existing.amount,
    body.category !== undefined ? String(body.category).trim() : existing.category,
    body.entry_date !== undefined ? body.entry_date : existing.entry_date,
    body.due_date !== undefined ? body.due_date : existing.due_date,
    body.status !== undefined ? body.status : existing.status,
    body.client_id !== undefined ? body.client_id : existing.client_id,
    body.service_id !== undefined ? body.service_id : existing.service_id,
    body.board_id !== undefined ? body.board_id : existing.board_id,
    body.payment_method !== undefined ? body.payment_method : existing.payment_method,
    body.notes !== undefined ? String(body.notes) : existing.notes,
    now,
    req.params.id
  );

  if (body.status === 'paid' && existing.status !== 'paid') {
    db.prepare("UPDATE society_entries SET status = 'confirmed' WHERE finance_entry_id = ?").run(req.params.id);
    emitStudioEvent({
      actorId: req.user!.id,
      actorName: req.user!.name,
      eventType: 'finance_paid',
      entityType: 'finance',
      entityId: req.params.id,
      title: `${existing.type === 'expense' ? 'Pagamento realizado' : 'Recebimento confirmado'}: ${body.description || existing.description}`,
      message: `${req.user!.name} marcou como pago o valor de R$ ${Number(body.amount ?? existing.amount).toFixed(2).replace('.', ',')}.`,
      boardId: existing.board_id ? String(existing.board_id) : null,
      clientId: existing.client_id ? String(existing.client_id) : null,
      postToStudioMural: true,
      color: '#F4F5E2',
    });
  }

  logActivity(req.user!.id, req.user!.name, 'update_finance_entry', 'finance', req.params.id, `Atualizou lançamento: ${body.description || existing.description}`);
  const updated = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id);
  res.json({ entry: updated });
});

router.delete('/finance/entries/:id', requireAuth, requirePermission('can_manage_finance'), (req: AuthRequest, res) => {
  db.prepare('DELETE FROM society_entries WHERE finance_entry_id = ?').run(req.params.id);
  db.prepare('DELETE FROM finance_entries WHERE id = ?').run(req.params.id);
  logActivity(req.user!.id, req.user!.name, 'delete_finance_entry', 'finance', req.params.id, 'Excluiu lançamento financeiro');
  res.json({ ok: true });
});

router.get('/society/overview', requireAuth, requirePartner, (req, res) => {
  const { partner_id, from, to, type } = req.query as Record<string, string>;

  const configs = db
    .prepare(`
      SELECT sc.*, u.name, u.email, u.title, u.avatar_url
      FROM society_config sc
      JOIN users u ON u.id = sc.user_id
      ORDER BY sc.partner_key ASC
    `)
    .all() as Array<Record<string, unknown>>;

  let query = `
    SELECT se.*, u.name as partner_name, u.partner_key, f.description as finance_description, f.status as finance_status
    FROM society_entries se
    JOIN users u ON u.id = se.partner_user_id
    LEFT JOIN finance_entries f ON f.id = se.finance_entry_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (partner_id && partner_id !== 'all') {
    query += ' AND se.partner_user_id = ?';
    params.push(partner_id);
  }
  if (type && type !== 'all') {
    query += ' AND se.type = ?';
    params.push(type);
  }
  if (from) {
    query += ' AND se.entry_date >= ?';
    params.push(from);
  }
  if (to) {
    query += ' AND se.entry_date <= ?';
    params.push(to);
  }

  query += ' ORDER BY se.entry_date DESC, se.created_at DESC';
  const entries = db.prepare(query).all(...params) as Array<Record<string, unknown>>;

  const partnerTotals: Record<string, { revenue_share: number; expense_share: number; withdrawals: number; investments: number; net_balance: number }> = {};
  for (const cfg of configs) {
    const pid = String(cfg.user_id);
    const pEntries = entries.filter((e) => e.partner_user_id === pid);
    const rev = pEntries.filter((e) => e.type === 'revenue_share').reduce((a, b) => a + Number(b.amount || 0), 0);
    const exp = pEntries.filter((e) => e.type === 'expense_share').reduce((a, b) => a + Number(b.amount || 0), 0);
    const wdr = pEntries.filter((e) => e.type === 'withdrawal').reduce((a, b) => a + Number(b.amount || 0), 0);
    const inv = pEntries.filter((e) => e.type === 'investment').reduce((a, b) => a + Number(b.amount || 0), 0);
    partnerTotals[pid] = {
      revenue_share: rev,
      expense_share: exp,
      withdrawals: wdr,
      investments: inv,
      net_balance: rev + inv - exp - wdr,
    };
  }

  res.json({
    configs: configs.map((c) => {
      const uidStr = String(c.user_id);
      const pKey = String(c.partner_key);
      const clientsCount = (
        db.prepare("SELECT COUNT(*) as c FROM clients WHERE owner_partner = ? AND status != 'archived'").get(pKey) as { c: number }
      ).c;
      const activeBoardsCount = (
        db.prepare("SELECT COUNT(*) as c FROM boards WHERE (portal_owner = ? OR lead_user_id = ? OR collaborator_user_id = ?) AND status = 'active'").get(pKey, uidStr, uidStr) as { c: number }
      ).c;
      const pendingCardsCount = (
        db
          .prepare(`
            SELECT COUNT(*) as c
            FROM cards ca
            JOIN boards b ON b.id = ca.board_id
            JOIN board_columns col ON col.id = ca.column_id
            WHERE b.status = 'active' AND (ca.lead_user_id = ? OR ca.collaborator_user_id = ?) AND LOWER(col.title) NOT LIKE '%conclu%'
          `)
          .get(uidStr, uidStr) as { c: number }
      ).c;
      const completedCardsCount = (
        db
          .prepare(`
            SELECT COUNT(*) as c
            FROM cards ca
            JOIN board_columns col ON col.id = ca.column_id
            WHERE (ca.lead_user_id = ? OR ca.collaborator_user_id = ?) AND LOWER(col.title) LIKE '%conclu%'
          `)
          .get(uidStr, uidStr) as { c: number }
      ).c;
      return {
        ...c,
        responsibilities: JSON.parse(String(c.responsibilities_json || '[]')),
        totals: partnerTotals[uidStr] || { revenue_share: 0, expense_share: 0, withdrawals: 0, investments: 0, net_balance: 0 },
        operational: {
          clients_count: clientsCount,
          active_boards_count: activeBoardsCount,
          pending_cards_count: pendingCardsCount,
          completed_cards_count: completedCardsCount,
        },
      };
    }),
    entries,
  });
});

router.put('/society/config/:partnerKey', requireAuth, requirePermission('can_manage_society'), (req: AuthRequest, res) => {
  const { equity_percent, default_revenue_split, default_expense_split, responsibilities } = req.body as {
    equity_percent?: number;
    default_revenue_split?: number;
    default_expense_split?: number;
    responsibilities?: string[];
  };

  const existing = db.prepare('SELECT * FROM society_config WHERE partner_key = ?').get(req.params.partnerKey) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Configuração de sócia não encontrada.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE society_config SET
      equity_percent = ?, default_revenue_split = ?, default_expense_split = ?, responsibilities_json = ?, updated_at = ?
    WHERE partner_key = ?
  `).run(
    equity_percent !== undefined ? Number(equity_percent) : existing.equity_percent,
    default_revenue_split !== undefined ? Number(default_revenue_split) : existing.default_revenue_split,
    default_expense_split !== undefined ? Number(default_expense_split) : existing.default_expense_split,
    responsibilities !== undefined ? JSON.stringify(responsibilities) : existing.responsibilities_json,
    now,
    req.params.partnerKey
  );

  logActivity(req.user!.id, req.user!.name, 'update_society_config', 'society', req.params.partnerKey, `Atualizou participação/divisão de ${req.params.partnerKey}`);
  res.json({ ok: true });
});

router.post('/society/entries', requireAuth, requirePermission('can_manage_society'), (req: AuthRequest, res) => {
  const user = req.user!;
  const body = req.body as {
    type: 'revenue_share' | 'expense_share' | 'withdrawal' | 'investment' | 'agreement';
    partner_user_id: string;
    description: string;
    amount?: number;
    split_percent?: number | null;
    finance_entry_id?: string | null;
    board_id?: string | null;
    entry_date?: string;
    status?: 'pending' | 'confirmed';
    notes?: string;
  };

  if (!body.partner_user_id || !body.description?.trim()) {
    res.status(400).json({ error: 'Selecione a sócia e informe a descrição do registro.' });
    return;
  }

  const id = uid('sce');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO society_entries (
      id, type, partner_user_id, description, amount, split_percent, origin_type,
      finance_entry_id, board_id, entry_date, status, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.type,
    body.partner_user_id,
    body.description.trim(),
    Number(body.amount) || 0,
    body.split_percent ?? null,
    body.finance_entry_id ? 'finance_link' : 'manual',
    body.finance_entry_id || null,
    body.board_id || null,
    body.entry_date || now.slice(0, 10),
    body.status === 'pending' ? 'pending' : 'confirmed',
    body.notes?.trim() || '',
    user.id,
    now
  );

  logActivity(user.id, user.name, 'create_society_entry', 'society', id, `Registrou movimentação societária: ${body.description.trim()}`);
  const entry = db.prepare('SELECT * FROM society_entries WHERE id = ?').get(id);
  res.status(201).json({ entry });
});

router.delete('/society/entries/:id', requireAuth, requirePermission('can_manage_society'), (req: AuthRequest, res) => {
  db.prepare('DELETE FROM society_entries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
