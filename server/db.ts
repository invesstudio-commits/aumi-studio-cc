import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PartnerPermissions, UserPreferences } from './types.ts';
import { broadcastRealtime } from './realtime.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'aumi_studio.db');
export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const DEFAULT_PARTNER_PERMISSIONS: PartnerPermissions = {
  can_manage_services: true,
  can_manage_finance: true,
  can_manage_society: true,
  can_manage_settings: true,
  can_manage_clients: true,
  can_delete_boards: true,
  can_edit_other_portal: true,
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  accent_color: '#EC2B82',
  compact_sidebar: false,
  notify_deadlines: true,
  notify_board_updates: true,
  notify_comments: true,
  notify_approvals: true,
  notify_mural: true,
  sound_enabled: true,
  sound_confirm_enabled: true,
  sound_notification_enabled: true,
};

export const BOARD_COVERS = [
  '/src/assets/images/cover_blush_editorial_1795010794755.jpg',
  '/src/assets/images/cover_lilac_studio_1795010796172.jpg',
  '/src/assets/images/cover_terracotta_warm_1795010795567.jpg',
  '/src/assets/images/cover_olive_minimal_1795010797074.jpg',
];

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('partner', 'client')),
      partner_key TEXT CHECK(partner_key IN ('ingrid', 'mariana') OR partner_key IS NULL),
      avatar_url TEXT,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      preferences_json TEXT NOT NULL DEFAULT '{}',
      client_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      instagram TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      portal_welcome TEXT NOT NULL DEFAULT '',
      portal_enabled INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Design',
      icon TEXT NOT NULL DEFAULT 'sparkles',
      color TEXT NOT NULL DEFAULT '#EC2B82',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      included_items_json TEXT NOT NULL DEFAULT '[]',
      process_steps_json TEXT NOT NULL DEFAULT '[]',
      client_info_needed TEXT NOT NULL DEFAULT '',
      default_deadline_days INTEGER NOT NULL DEFAULT 15,
      internal_notes TEXT NOT NULL DEFAULT '',
      requires_approval INTEGER NOT NULL DEFAULT 1,
      visible_in_portal INTEGER NOT NULL DEFAULT 1,
      expected_client_actions TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_deliverables (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT 'Digital',
      default_qty INTEGER NOT NULL DEFAULT 1,
      deadline_days INTEGER NOT NULL DEFAULT 7,
      guidelines TEXT NOT NULL DEFAULT '',
      requires_approval INTEGER NOT NULL DEFAULT 1,
      extra_fields_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_packages (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_pix REAL NOT NULL DEFAULT 0,
      price_card REAL NOT NULL DEFAULT 0,
      deadline_days INTEGER NOT NULL DEFAULT 15,
      conditions TEXT NOT NULL DEFAULT '',
      is_featured INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      deliverables_config_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      portal_owner TEXT NOT NULL CHECK(portal_owner IN ('ingrid', 'mariana')),
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#F3ECF9',
      cover_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      portal_owner TEXT NOT NULL CHECK(portal_owner IN ('ingrid', 'mariana')),
      folder_id TEXT,
      client_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT,
      lead_user_id TEXT NOT NULL,
      collaborator_user_id TEXT,
      start_date TEXT,
      deadline TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      labels_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
      visibility TEXT NOT NULL DEFAULT 'shared' CHECK(visibility IN ('internal', 'shared')),
      shared_with_client INTEGER NOT NULL DEFAULT 1,
      selected_services_json TEXT NOT NULL DEFAULT '[]',
      initial_notes TEXT NOT NULL DEFAULT '',
      total_value REAL NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS board_columns (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#BC9FE6',
      sort_order INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      client_visible INTEGER NOT NULL DEFAULT 1,
      client_label TEXT,
      client_description TEXT,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      column_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      service_id TEXT,
      service_name TEXT NOT NULL DEFAULT '',
      package_id TEXT,
      package_name TEXT NOT NULL DEFAULT '',
      format TEXT NOT NULL DEFAULT '',
      lead_user_id TEXT,
      collaborator_user_id TEXT,
      due_date TEXT,
      publish_date TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      labels_json TEXT NOT NULL DEFAULT '[]',
      checklist_json TEXT NOT NULL DEFAULT '[]',
      references_text TEXT NOT NULL DEFAULT '',
      copy_text TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      client_visible INTEGER NOT NULL DEFAULT 1,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      approval_status TEXT NOT NULL DEFAULT 'none' CHECK(approval_status IN ('none', 'pending', 'approved', 'changes_requested')),
      approval_feedback TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
      FOREIGN KEY (column_id) REFERENCES board_columns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_attachments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      file_url TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 0,
      uploaded_by TEXT NOT NULL,
      uploaded_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS card_comments (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL,
      content TEXT NOT NULL,
      is_internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mural_posts (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL CHECK(scope IN ('studio', 'ingrid', 'mariana', 'client', 'board')),
      board_id TEXT,
      client_id TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#FCF6EC',
      visibility TEXT NOT NULL DEFAULT 'shared',
      is_auto INTEGER NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL DEFAULT 'manual',
      entity_type TEXT,
      entity_id TEXT,
      card_id TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS studio_notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Geral',
      color TEXT NOT NULL DEFAULT '#FCF6EC',
      pinned INTEGER NOT NULL DEFAULT 0,
      client_id TEXT,
      board_id TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'overdue', 'cancelled')),
      client_id TEXT,
      service_id TEXT,
      board_id TEXT,
      payment_method TEXT NOT NULL DEFAULT 'Pix',
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS society_config (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      partner_key TEXT NOT NULL CHECK(partner_key IN ('ingrid', 'mariana')),
      equity_percent REAL NOT NULL DEFAULT 50,
      default_revenue_split REAL NOT NULL DEFAULT 50,
      default_expense_split REAL NOT NULL DEFAULT 50,
      responsibilities_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS society_entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('revenue_share', 'expense_share', 'withdrawal', 'investment', 'agreement')),
      partner_user_id TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      split_percent REAL,
      origin_type TEXT NOT NULL DEFAULT 'manual',
      finance_entry_id TEXT,
      board_id TEXT,
      entry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('pending', 'confirmed')),
      notes TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (partner_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      target_user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_tab TEXT,
      link_entity_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS studio_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS copies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      author_user_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('baixa', 'normal', 'alta', 'urgente')),
      labels_json TEXT NOT NULL DEFAULT '[]',
      checklist_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'internal_sent', 'not_shared', 'shared', 'awaiting_approval', 'approved', 'changes_requested')),
      client_id TEXT,
      board_id TEXT,
      card_id TEXT,
      shared_with_client INTEGER NOT NULL DEFAULT 0,
      share_token TEXT UNIQUE,
      shared_at TEXT,
      approved_at TEXT,
      approved_by TEXT,
      client_feedback TEXT NOT NULL DEFAULT '',
      history_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS studio_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL DEFAULT '10:00',
      type TEXT NOT NULL DEFAULT 'meeting',
      client_id TEXT,
      board_id TEXT,
      owner_partner TEXT NOT NULL DEFAULT 'studio',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_deliveries (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      card_id TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      items_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE
    );
  `);

  runSafeMigrations();
  seedInitialSystemData();
}

function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runSafeMigrations() {
  ensureColumn('users', 'last_seen_at', 'TEXT');
  ensureColumn('clients', 'contact_name', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('clients', 'avatar_url', 'TEXT');
  ensureColumn('clients', 'description', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('clients', 'owner_partner', "TEXT NOT NULL DEFAULT 'ingrid'");
  ensureColumn('clients', 'start_date', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('clients', 'status', "TEXT NOT NULL DEFAULT 'active'");
  ensureColumn('clients', 'contracted_services_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('clients', 'folder_color', "TEXT NOT NULL DEFAULT '#FDF2F6'");
  ensureColumn('clients', 'folder_icon', "TEXT NOT NULL DEFAULT 'folder'");
  ensureColumn('clients', 'folder_cover_url', 'TEXT');

  // Migrate mural_posts CHECK constraint to include 'board' scope cleanly without losing data
  const muralTableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mural_posts'")
    .get() as { sql?: string } | undefined;
  if (muralTableSql?.sql && !muralTableSql.sql.includes("'board'")) {
    const migrateMural = db.transaction(() => {
      db.exec(`
        CREATE TABLE mural_posts_new (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK(scope IN ('studio', 'ingrid', 'mariana', 'client', 'board')),
          board_id TEXT,
          client_id TEXT,
          author_id TEXT NOT NULL,
          author_name TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          color TEXT NOT NULL DEFAULT '#FCF6EC',
          visibility TEXT NOT NULL DEFAULT 'shared',
          is_auto INTEGER NOT NULL DEFAULT 0,
          event_type TEXT NOT NULL DEFAULT 'manual',
          entity_type TEXT,
          entity_id TEXT,
          card_id TEXT,
          priority TEXT NOT NULL DEFAULT 'normal',
          created_at TEXT NOT NULL
        );
        INSERT INTO mural_posts_new (
          id, scope, board_id, client_id, author_id, author_name, title, content, pinned, color, created_at
        )
        SELECT id, scope, board_id, client_id, author_id, author_name, title, content, pinned, color, created_at
        FROM mural_posts;
        DROP TABLE mural_posts;
        ALTER TABLE mural_posts_new RENAME TO mural_posts;
      `);
    });
    migrateMural();
  } else {
    ensureColumn('mural_posts', 'visibility', "TEXT NOT NULL DEFAULT 'shared'");
    ensureColumn('mural_posts', 'is_auto', 'INTEGER NOT NULL DEFAULT 0');
    ensureColumn('mural_posts', 'event_type', "TEXT NOT NULL DEFAULT 'manual'");
    ensureColumn('mural_posts', 'entity_type', 'TEXT');
    ensureColumn('mural_posts', 'entity_id', 'TEXT');
    ensureColumn('mural_posts', 'card_id', 'TEXT');
    ensureColumn('mural_posts', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
  }
  ensureColumn('mural_posts', 'read_by_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('mural_posts', 'attachments_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('mural_posts', 'links_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('mural_posts', 'mentions_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('mural_posts', 'likes_json', "TEXT NOT NULL DEFAULT '[]'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS mural_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL REFERENCES mural_posts(id) ON DELETE CASCADE,
      parent_comment_id TEXT,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL DEFAULT 'partner',
      content TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'shared',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      links_json TEXT NOT NULL DEFAULT '[]',
      mentions_json TEXT NOT NULL DEFAULT '[]',
      reactions_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mural_comments_post_id ON mural_comments(post_id);

    CREATE TABLE IF NOT EXISTS studio_demands (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      assignee_id TEXT NOT NULL,
      assignee_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente', 'em_andamento', 'aguardando', 'concluida')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'alta', 'urgente')),
      due_date TEXT,
      board_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_studio_demands_status ON studio_demands(status);

    CREATE TABLE IF NOT EXISTS studio_demand_replies (
      id TEXT PRIMARY KEY,
      demand_id TEXT NOT NULL REFERENCES studio_demands(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_studio_demand_replies_demand_id ON studio_demand_replies(demand_id);

    CREATE TABLE IF NOT EXISTS studio_chat_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_studio_chat_messages_created_at ON studio_chat_messages(created_at DESC);

    CREATE TABLE IF NOT EXISTS studio_postits (
      owner_key TEXT PRIMARY KEY CHECK(owner_key IN ('ingrid', 'mariana')),
      owner_user_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      bg_color TEXT NOT NULL DEFAULT '#FCF6EC',
      text_html TEXT NOT NULL DEFAULT '',
      strokes_json TEXT NOT NULL DEFAULT '[]',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
  `);

  // Board invite, share token & status tracking
  ensureColumn('boards', 'share_token', 'TEXT');
  ensureColumn('boards', 'invite_status', "TEXT NOT NULL DEFAULT 'not_invited'");
  ensureColumn('boards', 'invited_email', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('boards', 'invite_sent_at', 'TEXT');
  ensureColumn('boards', 'invite_accepted_at', 'TEXT');

  const boardsWithoutToken = db
    .prepare("SELECT id FROM boards WHERE share_token IS NULL OR share_token = ''")
    .all() as Array<{ id: string }>;
  if (boardsWithoutToken.length > 0) {
    const updateBoardToken = db.prepare('UPDATE boards SET share_token = ? WHERE id = ?');
    for (const b of boardsWithoutToken) {
      updateBoardToken.run(`aumi-brd-${crypto.randomBytes(8).toString('hex')}`, b.id);
    }
  }

  // Card content workflow, structured client briefing fields & history
  ensureColumn('cards', 'content_status', "TEXT NOT NULL DEFAULT 'awaiting_content'");
  ensureColumn('cards', 'content_feedback', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('cards', 'client_fields_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('cards', 'submitted_content_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('cards', 'history_json', "TEXT NOT NULL DEFAULT '[]'");

  // Copy versioning
  ensureColumn('copies', 'version_number', 'INTEGER NOT NULL DEFAULT 1');

  // Service structured client requirements
  ensureColumn('services', 'client_requirements_json', "TEXT NOT NULL DEFAULT '[]'");

  // Portal do Cliente v2 restructuring: column cover, card read tracking, visibility per section, adjustment requests, links, board drive & contract
  ensureColumn('board_columns', 'cover_url', 'TEXT');
  ensureColumn('cards', 'read_at', 'TEXT');
  ensureColumn('cards', 'read_by_id', 'TEXT');
  ensureColumn('cards', 'read_by_name', 'TEXT');
  ensureColumn('cards', 'hidden_sections_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('cards', 'adjustment_request_json', 'TEXT');
  ensureColumn('cards', 'links_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('cards', 'extra_notes', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('cards', 'mini_updates_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('boards', 'drive_links_json', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('boards', 'contract_info_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('boards', 'briefing_info_json', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('boards', 'process_state_json', "TEXT NOT NULL DEFAULT '{}'");

  // Individual direct-access portal token & 6-digit PIN per client
  ensureColumn('clients', 'portal_token', 'TEXT');
  ensureColumn('clients', 'portal_pin', 'TEXT');
  const clientsWithoutPortalToken = db
    .prepare("SELECT id FROM clients WHERE portal_token IS NULL OR portal_token = ''")
    .all() as Array<{ id: string }>;
  if (clientsWithoutPortalToken.length > 0) {
    const updClientToken = db.prepare('UPDATE clients SET portal_token = ? WHERE id = ?');
    for (const c of clientsWithoutPortalToken) {
      updClientToken.run(`aumi-cli-${crypto.randomBytes(12).toString('hex')}`, c.id);
    }
  }

  const clientsWithoutPortalPin = db
    .prepare("SELECT id FROM clients WHERE portal_pin IS NULL OR portal_pin = ''")
    .all() as Array<{ id: string }>;
  if (clientsWithoutPortalPin.length > 0) {
    const updClientPin = db.prepare('UPDATE clients SET portal_pin = ? WHERE id = ?');
    for (const c of clientsWithoutPortalPin) {
      const randomPin = String(100000 + crypto.randomInt(0, 900000));
      updClientPin.run(randomPin, c.id);
    }
  }

  // =====================================================================
  // ABA CONTEÚDOS — INDEPENDENT EDITORIAL WORKSPACE TABLES
  // =====================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_columns (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#EC2B82',
      icon TEXT NOT NULL DEFAULT 'sparkles',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'folder',
      color TEXT NOT NULL DEFAULT '#EC2B82',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#7A689C',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#EC2B82',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body_html TEXT NOT NULL DEFAULT '',
      column_id TEXT NOT NULL REFERENCES content_columns(id) ON DELETE CASCADE,
      folder_id TEXT REFERENCES content_folders(id) ON DELETE SET NULL,
      theme_id TEXT REFERENCES content_themes(id) ON DELETE SET NULL,
      card_color TEXT NOT NULL DEFAULT '#FFFFFF',
      card_icon TEXT NOT NULL DEFAULT 'sparkles',
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_draft INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      assignee_id TEXT,
      created_by_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      updated_by_id TEXT NOT NULL,
      updated_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_items_column ON content_items(column_id);
    CREATE INDEX IF NOT EXISTS idx_content_items_folder ON content_items(folder_id);
    CREATE INDEX IF NOT EXISTS idx_content_items_theme ON content_items(theme_id);

    CREATE TABLE IF NOT EXISTS content_item_tags (
      content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES content_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (content_id, tag_id)
    );
  `);

  const nowContents = new Date().toISOString();

  // Seed initial 5 Kanban columns for Conteúdos if empty
  const existingContentCols = (db.prepare('SELECT COUNT(*) as c FROM content_columns').get() as { c: number }).c;
  if (existingContentCols === 0) {
    const seedCols = [
      { id: 'ccol_ideias', title: 'Ideias', color: '#F58A66', icon: 'lightbulb', sort_order: 0 },
      { id: 'ccol_producao', title: 'Em produção', color: '#7A689C', icon: 'clapperboard', sort_order: 1 },
      { id: 'ccol_revisao', title: 'Em revisão', color: '#E1754C', icon: 'eye', sort_order: 2 },
      { id: 'ccol_aprovados', title: 'Aprovados', color: '#9E9F4A', icon: 'check-circle', sort_order: 3 },
      { id: 'ccol_finalizados', title: 'Finalizados', color: '#EC2B82', icon: 'sparkles', sort_order: 4 },
    ];
    const insCol = db.prepare('INSERT INTO content_columns (id, title, color, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const c of seedCols) {
      insCol.run(c.id, c.title, c.color, c.icon, c.sort_order, nowContents);
    }
  }

  // Seed initial folders if empty
  const existingContentFolders = (db.prepare('SELECT COUNT(*) as c FROM content_folders').get() as { c: number }).c;
  if (existingContentFolders === 0) {
    const seedFolders = [
      { id: 'cfld_reels', name: 'Reels & Vídeos', icon: 'video', color: '#7A689C', sort_order: 0 },
      { id: 'cfld_carrosseis', name: 'Carrosséis', icon: 'layers', color: '#EC2B82', sort_order: 1 },
      { id: 'cfld_posts', name: 'Posts Estáticos', icon: 'file-text', color: '#F58A66', sort_order: 2 },
      { id: 'cfld_campanhas', name: 'Campanhas', icon: 'megaphone', color: '#9E9F4A', sort_order: 3 },
      { id: 'cfld_portfolio', name: 'Portfólio', icon: 'briefcase', color: '#BC9FE6', sort_order: 4 },
      { id: 'cfld_ideias', name: 'Banco de Ideias', icon: 'lightbulb', color: '#EC97B7', sort_order: 5 },
    ];
    const insFld = db.prepare('INSERT INTO content_folders (id, name, icon, color, sort_order, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const f of seedFolders) {
      insFld.run(f.id, f.name, f.icon, f.color, f.sort_order, 'system', nowContents);
    }
  }

  // Seed initial Themes (Temas principais) if empty
  const existingContentThemes = (db.prepare('SELECT COUNT(*) as c FROM content_themes').get() as { c: number }).c;
  if (existingContentThemes === 0) {
    const seedThemes = [
      { id: 'cthm_portfolio', name: 'Portfólio', color: '#7A689C', sort_order: 0 },
      { id: 'cthm_pessoal', name: 'Pessoal', color: '#EC2B82', sort_order: 1 },
      { id: 'cthm_vendas', name: 'Vendas', color: '#E1754C', sort_order: 2 },
      { id: 'cthm_marketing', name: 'Marketing', color: '#F58A66', sort_order: 3 },
      { id: 'cthm_design', name: 'Design', color: '#BC9FE6', sort_order: 4 },
      { id: 'cthm_repertorio', name: 'Repertório', color: '#9E9F4A', sort_order: 5 },
    ];
    const insThm = db.prepare('INSERT INTO content_themes (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)');
    for (const t of seedThemes) {
      insThm.run(t.id, t.name, t.color, t.sort_order, nowContents);
    }
  }

  // Seed initial Tags (Etiquetas complementares) if empty
  const existingContentTags = (db.prepare('SELECT COUNT(*) as c FROM content_tags').get() as { c: number }).c;
  if (existingContentTags === 0) {
    const seedTags = [
      { id: 'ctag_urgente', name: 'Urgente', color: '#EC2B82' },
      { id: 'ctag_revisar', name: 'Revisar', color: '#E1754C' },
      { id: 'ctag_referencia', name: 'Referência', color: '#7A689C' },
      { id: 'ctag_cliente_novo', name: 'Cliente novo', color: '#BC9FE6' },
      { id: 'ctag_aprovacao', name: 'Precisa de aprovação', color: '#F58A66' },
      { id: 'ctag_publicar', name: 'Publicar esta semana', color: '#9E9F4A' },
    ];
    const insTag = db.prepare('INSERT INTO content_tags (id, name, color, created_at) VALUES (?, ?, ?, ?)');
    for (const tg of seedTags) {
      insTag.run(tg.id, tg.name, tg.color, nowContents);
    }
  }

  // Seed a few starter editorial cards once (tracked via studio_settings flag so deleting them stays deleted)
  const seededContentsFlag = db
    .prepare("SELECT key FROM studio_settings WHERE key = 'contents_seeded_v1'")
    .get();
  if (!seededContentsFlag) {
    const partnerRows = db
      .prepare("SELECT id, name, partner_key FROM users WHERE role = 'partner'")
      .all() as Array<{ id: string; name: string; partner_key: string }>;
    const ingridUser = partnerRows.find((p) => p.partner_key === 'ingrid') || partnerRows[0];
    const marianaUser = partnerRows.find((p) => p.partner_key === 'mariana') || partnerRows[0];

    if (ingridUser && marianaUser) {
      const starterItems = [
        {
          id: 'citm_seed_1',
          title: 'Repertório de tipografias e combinações editoriais',
          body_html: '<h2>Curadoria de fontes Aumi</h2><p>Separar combinações com serifadas delicadas e sans geométricas para os próximos projetos de identidade visual.</p><ul><li>Editorial minimalista</li><li>Elegante contemporâneo</li><li>Orgânico artesanal</li></ul>',
          column_id: 'ccol_ideias',
          folder_id: 'cfld_ideias',
          theme_id: 'cthm_repertorio',
          card_color: '#FFFFFF',
          card_icon: 'palette',
          is_favorite: 1,
          sort_order: 0,
          assignee_id: ingridUser.id,
          author: ingridUser,
          tags: ['ctag_referencia'],
        },
        {
          id: 'citm_seed_2',
          title: 'Reels: rotina criativa e bastidores do estúdio',
          body_html: '<p><strong>Gancho (0-3s):</strong> Um dia produzindo identidade visual e social media no Aumi Studio.</p><p>Gravar takes naturais com café, moodboard e tela do projeto finalizado.</p>',
          column_id: 'ccol_ideias',
          folder_id: 'cfld_reels',
          theme_id: 'cthm_pessoal',
          card_color: '#FCE4F0',
          card_icon: 'video',
          is_favorite: 1,
          sort_order: 1,
          assignee_id: marianaUser.id,
          author: marianaUser,
          tags: ['ctag_publicar'],
        },
        {
          id: 'citm_seed_3',
          title: 'Carrossel: por que estratégia vem antes do design',
          body_html: '<p><strong>Slide 1:</strong> Design bonito sem posicionamento não converte.</p><p><strong>Slides 2-6:</strong> Explicar os pilares de clareza visual, narrativa e consistência de marca.</p>',
          column_id: 'ccol_producao',
          folder_id: 'cfld_carrosseis',
          theme_id: 'cthm_marketing',
          card_color: '#E4D4FA',
          card_icon: 'layers',
          is_favorite: 0,
          sort_order: 0,
          assignee_id: ingridUser.id,
          author: ingridUser,
          tags: ['ctag_urgente', 'ctag_publicar'],
        },
        {
          id: 'citm_seed_4',
          title: 'Post: apresentação de novo case de portfólio',
          body_html: '<p>Mostrar antes e depois da identidade visual com foco na transformação de percepção de valor da marca.</p>',
          column_id: 'ccol_revisao',
          folder_id: 'cfld_portfolio',
          theme_id: 'cthm_portfolio',
          card_color: '#FCF6EC',
          card_icon: 'sparkles',
          is_favorite: 0,
          sort_order: 0,
          assignee_id: marianaUser.id,
          author: marianaUser,
          tags: ['ctag_revisar', 'ctag_aprovacao'],
        },
        {
          id: 'citm_seed_5',
          title: 'Campanha: abertura de vagas do mês',
          body_html: '<p>Sequência de 3 stories + post estático destacando os pacotes de gestão e identidade visual disponíveis.</p>',
          column_id: 'ccol_aprovados',
          folder_id: 'cfld_campanhas',
          theme_id: 'cthm_vendas',
          card_color: '#DAD994',
          card_icon: 'megaphone',
          is_favorite: 0,
          sort_order: 0,
          assignee_id: ingridUser.id,
          author: ingridUser,
          tags: ['ctag_cliente_novo'],
        },
      ];

      const insItem = db.prepare(`
        INSERT OR IGNORE INTO content_items (
          id, title, body_html, column_id, folder_id, theme_id, card_color, card_icon,
          is_favorite, is_draft, sort_order, assignee_id,
          created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insItemTag = db.prepare('INSERT OR IGNORE INTO content_item_tags (content_id, tag_id) VALUES (?, ?)');

      for (const item of starterItems) {
        insItem.run(
          item.id,
          item.title,
          item.body_html,
          item.column_id,
          item.folder_id,
          item.theme_id,
          item.card_color,
          item.card_icon,
          item.is_favorite,
          item.sort_order,
          item.assignee_id,
          item.author.id,
          item.author.name,
          item.author.id,
          item.author.name,
          nowContents,
          nowContents
        );
        for (const tid of item.tags) {
          insItemTag.run(item.id, tid);
        }
      }
    }

    db.prepare('INSERT OR REPLACE INTO studio_settings (key, value_json, updated_at) VALUES (?, ?, ?)').run(
      'contents_seeded_v1',
      JSON.stringify({ seeded: true }),
      nowContents
    );
  }

  // Migrate default_columns to the 4 standard columns (Comece aqui, Em produção, Aprovação, Concluídos) without "Alteração"
  const defaultColsSetting = db
    .prepare("SELECT value_json FROM studio_settings WHERE key = 'default_columns'")
    .get() as { value_json: string } | undefined;
  if (defaultColsSetting) {
    try {
      const cols = JSON.parse(defaultColsSetting.value_json) as Array<{
        title: string;
        color: string;
        client_visible: boolean;
        client_label?: string;
        client_description?: string;
      }>;
      const isLegacySeven =
        cols.length === 7 &&
        cols.some((c) => c.title === 'Aguardando conteúdo') &&
        cols.some((c) => c.title === 'Revisão interna');
      if (isLegacySeven) {
        const nextCols = [
          { title: 'Comece aqui', color: '#7A689C', client_visible: true, client_label: 'Comece aqui', client_description: 'Demandas iniciais e envio de informações pelo cliente.' },
          { title: 'Em produção', color: '#EC2B82', client_visible: true, client_label: 'Em produção', client_description: 'Demandas e materiais em criação pela equipe.' },
          { title: 'Aprovação', color: '#BC9FE6', client_visible: true, client_label: 'Aprovação', client_description: 'Entregas prontas aguardando análise ou retorno.' },
          { title: 'Concluídos', color: '#C8C978', client_visible: true, client_label: 'Concluídos', client_description: 'Demandas finalizadas e entregues.' },
        ];
        db.prepare("UPDATE studio_settings SET value_json = ?, updated_at = ? WHERE key = 'default_columns'").run(
          JSON.stringify(nextCols),
          new Date().toISOString()
        );
      } else {
        const filtered = cols
          .filter((c) => !c.title.toLowerCase().includes('altera'))
          .map((c) =>
            c.title.toLowerCase().includes('conclu') && c.color === '#22C55E'
              ? { ...c, color: '#C8C978' }
              : c
          );
        if (JSON.stringify(filtered) !== JSON.stringify(cols)) {
          db.prepare("UPDATE studio_settings SET value_json = ?, updated_at = ? WHERE key = 'default_columns'").run(
            JSON.stringify(filtered),
            new Date().toISOString()
          );
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }

  // Safely remove any "Alteração" column from existing boards (moving its cards to "Aprovação" or "Em produção") and align "Concluídos" to palette green
  const allBoards = db.prepare('SELECT id FROM boards').all() as Array<{ id: string }>;
  for (const b of allBoards) {
    const bCols = db
      .prepare('SELECT id, title, color, sort_order FROM board_columns WHERE board_id = ? ORDER BY sort_order ASC')
      .all(b.id) as Array<{ id: string; title: string; color: string; sort_order: number }>;
    if (bCols.length === 0) continue;

    const alteracaoCols = bCols.filter((c) => c.title.toLowerCase().includes('altera'));
    const remainingCols = bCols.filter((c) => !c.title.toLowerCase().includes('altera'));

    if (alteracaoCols.length > 0 && remainingCols.length > 0) {
      const fallbackCol =
        remainingCols.find((c) => c.title.toLowerCase().includes('aprova')) ||
        remainingCols.find((c) => c.title.toLowerCase().includes('produ')) ||
        remainingCols[0];

      const txRemove = db.transaction(() => {
        const moveCards = db.prepare('UPDATE cards SET column_id = ? WHERE column_id = ?');
        const deleteCol = db.prepare('DELETE FROM board_columns WHERE id = ?');
        for (const ac of alteracaoCols) {
          moveCards.run(fallbackCol.id, ac.id);
          deleteCol.run(ac.id);
        }
        const updOrder = db.prepare('UPDATE board_columns SET sort_order = ? WHERE id = ?');
        remainingCols.forEach((col, idx) => updOrder.run(idx, col.id));
      });
      txRemove();
    }

    for (const col of remainingCols) {
      if (col.title.toLowerCase().includes('conclu') && col.color === '#22C55E') {
        db.prepare('UPDATE board_columns SET color = ? WHERE id = ?').run('#C8C978', col.id);
      }
    }
  }

  // Sanitize any raw technical filenames or legacy English tokens in existing notifications, mural, activity logs & approvals
  const cleanLegacyText = (val: string) =>
    val
      .replace(/Aumi_Studio_-_Portal_do_Cliente__macOS_Finder___Kanban_/gi, 'Portal do Cliente — Kanban')
      .replace(/_portal_cliente_macos_finder_/gi, 'Portal do Cliente')
      .replace(/Acesso ao sistema \(partner\)/g, 'Acesso ao sistema (sócia)')
      .replace(/Acesso ao sistema \(client\)/g, 'Acesso ao sistema (cliente)')
      .replace(/Material recebido e lido:/g, 'Material visualizado:')
      .replace(/Marcou como lido:/g, 'Marcou como visto:');

  const txCleanTexts = db.transaction(() => {
    const notifs = db.prepare('SELECT id, title, message FROM notifications').all() as Array<{ id: string; title: string; message: string }>;
    const updNotif = db.prepare('UPDATE notifications SET title = ?, message = ? WHERE id = ?');
    for (const n of notifs) {
      const nt = cleanLegacyText(n.title);
      const nm = cleanLegacyText(n.message);
      if (nt !== n.title || nm !== n.message) updNotif.run(nt, nm, n.id);
    }

    const murals = db.prepare('SELECT id, title, content FROM mural_posts').all() as Array<{ id: string; title: string; content: string }>;
    const updMural = db.prepare('UPDATE mural_posts SET title = ?, content = ? WHERE id = ?');
    for (const m of murals) {
      const mt = cleanLegacyText(m.title);
      const mc = cleanLegacyText(m.content);
      if (mt !== m.title || mc !== m.content) updMural.run(mt, mc, m.id);
    }

    const acts = db.prepare('SELECT id, details FROM activity_logs').all() as Array<{ id: string; details: string }>;
    const updAct = db.prepare('UPDATE activity_logs SET details = ? WHERE id = ?');
    for (const a of acts) {
      const ad = cleanLegacyText(a.details);
      if (ad !== a.details) updAct.run(ad, a.id);
    }

    const deliveries = db.prepare('SELECT id, items_json FROM approval_deliveries').all() as Array<{ id: string; items_json: string }>;
    const updDel = db.prepare('UPDATE approval_deliveries SET items_json = ? WHERE id = ?');
    for (const d of deliveries) {
      const cleaned = cleanLegacyText(d.items_json);
      if (cleaned !== d.items_json) updDel.run(cleaned, d.id);
    }
  });
  txCleanTexts();

  // Ensure essential custom labels exist in studio_settings.labels
  const labelsRow = db
    .prepare("SELECT value_json FROM studio_settings WHERE key = 'labels'")
    .get() as { value_json: string } | undefined;
  if (labelsRow) {
    try {
      const existingLabels = JSON.parse(labelsRow.value_json) as Array<{ id: string; name: string; color: string; text: string }>;
      const requiredDefaults = [
        { id: 'lbl-aguardando-copy', name: 'Aguardando copy', color: '#FDF2F6', text: '#EC2B82' },
        { id: 'lbl-em-producao', name: 'Em produção', color: '#F3ECF9', text: '#7A689C' },
        { id: 'lbl-em-andamento', name: 'Em andamento', color: '#EDE9FE', text: '#6D28D9' },
        { id: 'lbl-fazer-alteracoes', name: 'Fazer alterações', color: '#FDF0E8', text: '#E1754C' },
      ];
      let added = false;
      const merged = [...existingLabels];
      for (const def of requiredDefaults) {
        if (!merged.some((l) => l.name.toLowerCase() === def.name.toLowerCase())) {
          merged.unshift(def);
          added = true;
        }
      }
      if (added) {
        db.prepare("UPDATE studio_settings SET value_json = ?, updated_at = ? WHERE key = 'labels'").run(
          JSON.stringify(merged),
          new Date().toISOString()
        );
      }
    } catch {
      // ignore
    }
  }

  // Ensure DM Sans is used as principal & heading font if typography was still on old Fraunces/Bricolage defaults
  const typoRow = db
    .prepare("SELECT value_json FROM studio_settings WHERE key = 'typography'")
    .get() as { value_json: string } | undefined;
  if (typoRow) {
    try {
      const parsed = JSON.parse(typoRow.value_json) as Record<string, unknown>;
      if (parsed.display_font === 'Bricolage Grotesque' || parsed.editorial_font === 'Fraunces') {
        parsed.primary_font = 'DM Sans';
        parsed.display_font = 'DM Sans';
        parsed.editorial_font = 'DM Sans';
        db.prepare("UPDATE studio_settings SET value_json = ?, updated_at = ? WHERE key = 'typography'").run(
          JSON.stringify(parsed),
          new Date().toISOString()
        );
      }
    } catch {
      // ignore
    }
  }

  // Ensure default 12 card mini-update options exist in studio_settings without overwriting customizations
  const hasMiniUpdates = db
    .prepare("SELECT key FROM studio_settings WHERE key = 'card_mini_updates'")
    .get();
  if (!hasMiniUpdates) {
    db.prepare(`
      INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
      VALUES ('card_mini_updates', ?, 'system', ?)
    `).run(JSON.stringify(getDefaultCardMiniUpdates()), new Date().toISOString());
  }

  // Ensure the 2 shared partner post-its exist (Ingrid & Mariana)
  try {
    const nowIso = new Date().toISOString();
    const partners = db
      .prepare("SELECT id, name, partner_key FROM users WHERE role = 'partner' AND partner_key IN ('ingrid', 'mariana')")
      .all() as Array<{ id: string; name: string; partner_key: 'ingrid' | 'mariana' }>;
    const insertPostIt = db.prepare(`
      INSERT OR IGNORE INTO studio_postits (owner_key, owner_user_id, owner_name, bg_color, text_html, strokes_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)
    `);
    for (const p of partners) {
      const defaultBg = p.partner_key === 'ingrid' ? '#FFFFFF' : '#F1E8FC';
      const defaultHtml =
        p.partner_key === 'ingrid'
          ? '<p><strong>Prioridades da semana</strong></p><ul><li>Revisar aprovações pendentes no Portal do Cliente</li><li>Alinhar entregas e calendário de publicações</li></ul>'
          : '<p><strong>Anotações &amp; ideias</strong></p><ul><li>Conferir atualizações dos projetos ativos</li><li>Anotar recados rápidos e referências visuais</li></ul>';
      insertPostIt.run(p.partner_key, p.id, p.name, defaultBg, defaultHtml, p.name, nowIso);
    }
    db.prepare(
      "UPDATE studio_postits SET bg_color = '#FFFFFF' WHERE owner_key = 'ingrid' AND LOWER(bg_color) IN ('#fdebf3', '#fcf6ec')"
    ).run();
  } catch (err) {
    console.error('Post-its seed migration warning:', err);
  }

  // Hydrate Notification Center once from real Portal do Cliente & system updates so both partners have real cards
  try {
    const hydrated = db
      .prepare("SELECT key FROM studio_settings WHERE key = 'mural_notif_center_hydrated_v1'")
      .get();
    if (!hydrated) {
      const nowIso = new Date().toISOString();
      const partners = db
        .prepare("SELECT id FROM users WHERE role = 'partner'")
        .all() as Array<{ id: string }>;
      const recentBoardPosts = db
        .prepare(`
          SELECT mp.id, mp.title, mp.content, mp.board_id, mp.event_type, mp.created_at,
                 b.title as board_title, c.name as client_name
          FROM mural_posts mp
          LEFT JOIN boards b ON b.id = mp.board_id
          LEFT JOIN clients c ON c.id = COALESCE(mp.client_id, b.client_id)
          WHERE mp.scope = 'board'
          ORDER BY mp.created_at DESC
          LIMIT 8
        `)
        .all() as Array<{
          id: string;
          title: string;
          content: string;
          board_id: string | null;
          event_type: string;
          created_at: string;
          board_title: string | null;
          client_name: string | null;
        }>;

      const recentActivities = db
        .prepare(`
          SELECT id, actor_name, action, entity_type, entity_id, details, created_at
          FROM activity_logs
          WHERE action NOT IN ('update_profile', 'login')
          ORDER BY created_at DESC
          LIMIT 8
        `)
        .all() as Array<{
          id: string;
          actor_name: string;
          action: string;
          entity_type: string;
          entity_id: string;
          details: string;
          created_at: string;
        }>;

      const insertNtf = db.prepare(`
        INSERT INTO notifications (id, target_user_id, type, title, message, link_tab, link_entity_id, is_read, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);

      for (const p of partners) {
        const countRow = db
          .prepare('SELECT COUNT(*) as c FROM notifications WHERE target_user_id = ?')
          .get(p.id) as { c: number };
        if (countRow.c < 3) {
          for (const bp of recentBoardPosts.slice(0, 5)) {
            const plain = String(bp.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            insertNtf.run(
              uid('ntf'),
              p.id,
              bp.event_type || 'portal_update',
              bp.title || `Atualização no portal${bp.client_name ? ` · ${bp.client_name}` : ''}`,
              plain.slice(0, 180) || 'Nova movimentação registrada no Portal do Cliente.',
              'portal',
              bp.board_id || bp.id,
              bp.created_at
            );
          }
          for (const act of recentActivities.slice(0, 4)) {
            const tab =
              act.entity_type === 'finance'
                ? 'financeiro'
                : act.entity_type === 'client'
                ? 'clientes'
                : act.entity_type === 'service'
                ? 'servicos'
                : act.entity_type === 'card' || act.entity_type === 'board'
                ? 'portal'
                : 'inicio';
            insertNtf.run(
              uid('ntf'),
              p.id,
              act.action || 'system_activity',
              `${act.actor_name} · atualização no estúdio`,
              String(act.details || '').slice(0, 180),
              tab,
              act.entity_id || null,
              act.created_at
            );
          }
        }
      }

      db.prepare(`
        INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
        VALUES ('mural_notif_center_hydrated_v1', ?, 'system', ?)
      `).run(JSON.stringify({ hydrated: true }), nowIso);
    }
  } catch (err) {
    console.error('Notification hydration migration warning:', err);
  }
}

export function getDefaultCardMiniUpdates() {
  return [
    { id: 'mu-visualizado', label: 'Conteúdo visualizado', bg: '#EAEBBD', text: '#3D4011', border: '#C8C978' },
    { id: 'mu-aprovado', label: 'Conteúdo aprovado', bg: '#DAD994', text: '#2F1534', border: '#BDBF6A' },
    { id: 'mu-recusado', label: 'Conteúdo recusado', bg: '#FDF0E8', text: '#C2410C', border: '#F5B89B' },
    { id: 'mu-precisa-revisao', label: 'Conteúdo precisa de revisão', bg: '#FDF0E8', text: '#E1754C', border: '#F2A98A' },
    { id: 'mu-revisado', label: 'Conteúdo revisado', bg: '#F3ECF9', text: '#7A689C', border: '#BC9FE6' },
    { id: 'mu-referencias', label: 'Referências analisadas', bg: '#F3ECF9', text: '#6D28D9', border: '#C7B0EB' },
    { id: 'mu-material-recebido', label: 'Material recebido', bg: '#FCF6EC', text: '#2F1534', border: '#E8D7B8' },
    { id: 'mu-aprovacao-enviada', label: 'Aprovação enviada', bg: '#FDF2F6', text: '#EC2B82', border: '#F4A6C5' },
    { id: 'mu-aguardando-aprovacao', label: 'Aguardando aprovação', bg: '#FDF2F6', text: '#BE185D', border: '#EC97B7' },
    { id: 'mu-salvando-arquivos', label: 'Salvando arquivos', bg: '#FCF6EC', text: '#6E7B48', border: '#D7D89E' },
    { id: 'mu-arquivos-drive', label: 'Arquivos disponíveis no Drive', bg: '#EAEBBD', text: '#2F1534', border: '#C8C978' },
    { id: 'mu-aguardando-retorno', label: 'Aguardando retorno do cliente', bg: '#F4F1F8', text: '#2F1534', border: '#BC9FE6' },
  ];
}

export const DEFAULT_CARD_MINI_UPDATES = getDefaultCardMiniUpdates();

function seedInitialSystemData() {
  const now = new Date().toISOString();
  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

  if (userCount === 0) {
    const ingridId = 'user-ingrid';
    const marianaId = 'user-mariana';
    const defaultHash = bcrypt.hashSync('aumi2026', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, partner_key, avatar_url, title, bio, permissions_json, preferences_json, client_id, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'partner', ?, NULL, ?, ?, ?, ?, NULL, 1, ?, ?)
    `);

    insertUser.run(
      ingridId,
      'Ingrid',
      'ingrid@aumistudio.com',
      defaultHash,
      'ingrid',
      'Sócia & Diretora Criativa',
      'Direção criativa, identidade visual e experiência de marca.',
      JSON.stringify(DEFAULT_PARTNER_PERMISSIONS),
      JSON.stringify({ ...DEFAULT_PREFERENCES, accent_color: '#EC2B82' }),
      now,
      now
    );

    insertUser.run(
      marianaId,
      'Mariana',
      'mariana@aumistudio.com',
      defaultHash,
      'mariana',
      'Sócia & Diretora de Operações',
      'Estratégia digital, gestão de projetos e relacionamento com clientes.',
      JSON.stringify(DEFAULT_PARTNER_PERMISSIONS),
      JSON.stringify({ ...DEFAULT_PREFERENCES, accent_color: '#7A689C' }),
      now,
      now
    );

    const insertSociety = db.prepare(`
      INSERT INTO society_config (id, user_id, partner_key, equity_percent, default_revenue_split, default_expense_split, responsibilities_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSociety.run(
      'soc-ingrid',
      ingridId,
      'ingrid',
      50,
      50,
      50,
      JSON.stringify(['Direção Criativa', 'Identidade Visual', 'Aprovação Estética', 'Direção de Arte']),
      now
    );

    insertSociety.run(
      'soc-mariana',
      marianaId,
      'mariana',
      50,
      50,
      50,
      JSON.stringify(['Gestão Operacional', 'Atendimento ao Cliente', 'Planejamento de Conteúdo', 'Controle Financeiro']),
      now
    );
  }

  const folderCount = (db.prepare('SELECT COUNT(*) as c FROM folders').get() as { c: number }).c;
  if (folderCount === 0) {
    const insertFolder = db.prepare(`
      INSERT INTO folders (id, portal_owner, name, color, cover_url, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultFolders = [
      { id: 'fld-ingrid-1', owner: 'ingrid', name: 'Em Produção', color: '#FDF2F6', cover: BOARD_COVERS[0], order: 0 },
      { id: 'fld-ingrid-2', owner: 'ingrid', name: 'Planejamento & Briefing', color: '#F3ECF9', cover: BOARD_COVERS[1], order: 1 },
      { id: 'fld-ingrid-3', owner: 'ingrid', name: 'Finalizados', color: '#FCF6EC', cover: BOARD_COVERS[3], order: 2 },
      { id: 'fld-mariana-1', owner: 'mariana', name: 'Em Produção', color: '#F3ECF9', cover: BOARD_COVERS[1], order: 0 },
      { id: 'fld-mariana-2', owner: 'mariana', name: 'Planejamento & Briefing', color: '#FDF0E8', cover: BOARD_COVERS[2], order: 1 },
      { id: 'fld-mariana-3', owner: 'mariana', name: 'Finalizados', color: '#FCF6EC', cover: BOARD_COVERS[3], order: 2 },
    ];

    for (const f of defaultFolders) {
      insertFolder.run(f.id, f.owner, f.name, f.color, f.cover, f.order, now);
    }
  }

  const settingCount = (db.prepare('SELECT COUNT(*) as c FROM studio_settings').get() as { c: number }).c;
  if (settingCount === 0) {
    const insertSetting = db.prepare(`
      INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    insertSetting.run(
      'default_columns',
      JSON.stringify([
        { title: 'Comece aqui', color: '#7A689C', client_visible: true, client_label: 'Comece aqui', client_description: 'Demandas iniciais e envio de informações pelo cliente.' },
        { title: 'Em produção', color: '#EC2B82', client_visible: true, client_label: 'Em produção', client_description: 'Demandas e materiais em criação pela equipe.' },
        { title: 'Aprovação', color: '#BC9FE6', client_visible: true, client_label: 'Aprovação', client_description: 'Entregas prontas aguardando análise ou retorno.' },
        { title: 'Concluídos', color: '#C8C978', client_visible: true, client_label: 'Concluídos', client_description: 'Demandas finalizadas e entregues.' },
      ]),
      'system',
      now
    );

    insertSetting.run(
      'labels',
      JSON.stringify([
        { id: 'lbl-aguardando-copy', name: 'Aguardando copy', color: '#FDF2F6', text: '#EC2B82' },
        { id: 'lbl-em-producao', name: 'Em produção', color: '#F3ECF9', text: '#7A689C' },
        { id: 'lbl-em-andamento', name: 'Em andamento', color: '#EDE9FE', text: '#6D28D9' },
        { id: 'lbl-fazer-alteracoes', name: 'Fazer alterações', color: '#FDF0E8', text: '#E1754C' },
        { id: 'lbl-mensal', name: 'Mensal', color: '#FDF2F6', text: '#EC2B82' },
        { id: 'lbl-campanha', name: 'Campanha', color: '#F3ECF9', text: '#7A689C' },
        { id: 'lbl-identidade', name: 'Identidade', color: '#FDF0E8', text: '#E1754C' },
      ]),
      'system',
      now
    );

    insertSetting.run(
      'priorities',
      JSON.stringify([
        { key: 'baixa', label: 'Baixa', description: 'Pode aguardar.', color: '#6E7B48' },
        { key: 'normal', label: 'Normal', description: 'Segue a ordem de produção.', color: '#EC2B82' },
        { key: 'alta', label: 'Alta', description: 'Precisa de atenção prioritária.', color: '#E1754C' },
        { key: 'urgente', label: 'Urgente', description: 'Máxima prioridade.', color: '#B91C1C' },
      ]),
      'system',
      now
    );

    insertSetting.run(
      'board_statuses',
      JSON.stringify([
        { key: 'draft', label: 'Rascunho' },
        { key: 'active', label: 'Em andamento' },
        { key: 'completed', label: 'Concluído' },
        { key: 'archived', label: 'Arquivado' },
      ]),
      'system',
      now
    );

    insertSetting.run(
      'portal_defaults',
      JSON.stringify({
        welcome_message: 'Acompanhe todas as entregas, envie materiais e aprove seus conteúdos em um só lugar.',
        allow_client_comments: true,
        allow_client_uploads: true,
        allow_client_approvals: true,
        show_mural_to_clients: true,
      }),
      'system',
      now
    );

    insertSetting.run(
      'appearance',
      JSON.stringify({
        primary_accent: '#EC2B82',
        secondary_accent: '#7A689C',
        warm_accent: '#E1754C',
        compact_density: false,
      }),
      'system',
      now
    );

    insertSetting.run(
      'notifications_global',
      JSON.stringify({
        deadline_warning_days: 3,
        notify_on_client_upload: true,
        notify_on_approval: true,
        notify_on_card_move: true,
      }),
      'system',
      now
    );
  }

  // Ensure centralized typography & theme_tokens exist without overwriting user edits
  const hasTypo = db.prepare("SELECT key FROM studio_settings WHERE key = 'typography'").get();
  if (!hasTypo) {
    db.prepare(`
      INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
      VALUES ('typography', ?, 'system', ?)
    `).run(
      JSON.stringify({
        font_css_url: '',
        primary_font: 'DM Sans',
        display_font: 'DM Sans',
        editorial_font: 'DM Sans',
        base_scale: 'normal',
        letter_spacing: '-0.02em',
      }),
      now
    );
  }

  const hasTokens = db.prepare("SELECT key FROM studio_settings WHERE key = 'theme_tokens'").get();
  if (!hasTokens) {
    db.prepare(`
      INSERT INTO studio_settings (key, value_json, updated_by, updated_at)
      VALUES ('theme_tokens', ?, 'system', ?)
    `).run(
      JSON.stringify({
        purple_accent: '#7A689C',
        pink_accent: '#EC2B82',
        orange_accent: '#E1754C',
        neon_accent: '#C8C978',
        glass_blur: 22,
        wallpaper_tone: 'studio-aura',
        icon_style: 'macos-glass',
      }),
      now
    );
  }

  const svcCount = (db.prepare('SELECT COUNT(*) as c FROM services').get() as { c: number }).c;
  if (svcCount === 0) {
    const insertService = db.prepare(`
      INSERT INTO services (id, name, description, category, icon, color, status, included_items_json, process_steps_json, client_info_needed, default_deadline_days, internal_notes, requires_approval, visible_in_portal, expected_client_actions, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 1, 1, ?, 'user-ingrid', ?, ?)
    `);

    const insertDeliv = db.prepare(`
      INSERT INTO service_deliverables (id, service_id, name, description, format, default_qty, deadline_days, guidelines, requires_approval, extra_fields_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)
    `);

    const insertPkg = db.prepare(`
      INSERT INTO service_packages (id, service_id, name, description, price_pix, price_card, deadline_days, conditions, is_featured, status, deliverables_config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `);

    const svc1 = 'svc-design-posts';
    insertService.run(
      svc1,
      'Design de Posts',
      'Criação de artes para redes sociais com identidade visual, consistência e estratégia.',
      'Redes Sociais',
      'layout',
      '#EC2B82',
      JSON.stringify(['Posts estáticos e carrosséis', 'Stories estratégicos', 'Alinhamento visual de feed', 'Arquivos prontos para publicação']),
      JSON.stringify([
        { id: 'st-1', title: 'Recebimento de briefing e copys', description: 'Cliente envia textos e referências.', active: true },
        { id: 'st-2', title: 'Desenvolvimento criativo', description: 'Criação dos layouts respeitando a identidade.', active: true },
        { id: 'st-3', title: 'Revisão interna Aumi', description: 'Conferência tipográfica e ortográfica.', active: true },
        { id: 'st-4', title: 'Aprovação do cliente', description: 'Envio no portal para aprovação ou ajustes.', active: true },
      ]),
      'Copys aprovadas, paleta da marca, logotipo em vetor e fotos do acervo.',
      15,
      'Validar proporções 4:5 para feed e 9:16 para stories antes de liberar para o cliente.',
      'Enviar copys, anexar fotos e aprovar as artes no portal.',
      now,
      now
    );

    const d1 = 'del-dp-post';
    const d2 = 'del-dp-carrossel';
    const d3 = 'del-dp-stories';
    insertDeliv.run(d1, svc1, 'Design de Post Estático', 'Arte única para feed Instagram/LinkedIn', 'Feed 1080x1350px', 8, 7, 'Seguir guia tipográfico do cliente e manter respiro lateral.', 1, 0);
    insertDeliv.run(d2, svc1, 'Carrossel Estratégico', 'Sequência de até 8 lâminas narrativas', 'Carrossel até 8p', 2, 10, 'Garantir continuidade visual entre lâminas e CTA final.', 1, 1);
    insertDeliv.run(d3, svc1, 'Sequência de Stories', 'Adaptação ou criação nativa para stories', 'Story 1080x1920px', 10, 7, 'Respeitar zona segura superior e inferior para interface.', 1, 2);

    insertPkg.run(
      'pkg-dp-essencial',
      svc1,
      'Essencial',
      'Ideal para manter sua presença online constante.',
      390,
      420,
      15,
      'Pagamento 50% na entrada e 50% na entrega.',
      0,
      JSON.stringify([
        { deliverable_id: d1, name: 'Design de Post Estático', format: 'Feed 1080x1350px', qty: 8, deadline_days: 10, guidelines: 'Seguir guia tipográfico do cliente.', requires_approval: true },
        { deliverable_id: d2, name: 'Carrossel Estratégico', format: 'Carrossel até 8p', qty: 2, deadline_days: 12, guidelines: 'Até 8 lâminas por carrossel.', requires_approval: true },
        { deliverable_id: d3, name: 'Sequência de Stories', format: 'Story 1080x1920px', qty: 10, deadline_days: 15, guidelines: 'Stories de apoio aos posts.', requires_approval: true },
      ]),
      now,
      now
    );

    insertPkg.run(
      'pkg-dp-pro',
      svc1,
      'Pro',
      'Mais conteúdo, ritmo editorial e estratégia de marca.',
      590,
      640,
      20,
      'Inclui 2 rodadas de ajustes por peça.',
      1,
      JSON.stringify([
        { deliverable_id: d1, name: 'Design de Post Estático', format: 'Feed 1080x1350px', qty: 12, deadline_days: 12, guidelines: 'Variação entre peças institucionais e educativas.', requires_approval: true },
        { deliverable_id: d2, name: 'Carrossel Estratégico', format: 'Carrossel até 8p', qty: 4, deadline_days: 16, guidelines: 'Carrosséis aprofundados de autoridade.', requires_approval: true },
        { deliverable_id: d3, name: 'Sequência de Stories', format: 'Story 1080x1920px', qty: 20, deadline_days: 20, guidelines: 'Combos semanais de stories.', requires_approval: true },
      ]),
      now,
      now
    );

    insertPkg.run(
      'pkg-dp-premium',
      svc1,
      'Premium',
      'Tudo o que sua marca precisa para presença mensal completa.',
      890,
      950,
      25,
      'Prioridade na fila de produção e suporte direto.',
      0,
      JSON.stringify([
        { deliverable_id: d1, name: 'Design de Post Estático', format: 'Feed 1080x1350px', qty: 20, deadline_days: 15, guidelines: 'Cobertura completa do calendário mensal.', requires_approval: true },
        { deliverable_id: d2, name: 'Carrossel Estratégico', format: 'Carrossel até 10p', qty: 6, deadline_days: 20, guidelines: 'Narrativa editorial de até 10 páginas.', requires_approval: true },
        { deliverable_id: d3, name: 'Sequência de Stories', format: 'Story 1080x1920px', qty: 30, deadline_days: 25, guidelines: 'Stories diários para engajamento.', requires_approval: true },
      ]),
      now,
      now
    );

    const svc2 = 'svc-identidade-visual';
    insertService.run(
      svc2,
      'Identidade Visual',
      'Criação de identidade visual completa, autêntica e estratégica para sua marca.',
      'Branding',
      'palette',
      '#7A689C',
      JSON.stringify(['Logotipo principal e variações', 'Paleta de cores estratégica', 'Sistema tipográfico', 'Aplicações de marca e manual']),
      JSON.stringify([
        { id: 'iv-1', title: 'Briefing', description: 'Entenda as necessidades e essência da marca.', active: true },
        { id: 'iv-2', title: 'Pesquisa e referências', description: 'Explore território visual e universo estético.', active: true },
        { id: 'iv-3', title: 'Desenvolvimento de conceitos', description: 'Criação das propostas visuais.', active: true },
        { id: 'iv-4', title: 'Apresentação', description: 'Apresente os conceitos ao cliente.', active: true },
        { id: 'iv-5', title: 'Ajustes', description: 'Refine os detalhes da identidade.', active: true },
        { id: 'iv-6', title: 'Finalização de arquivos', description: 'Exporte em SVG, PDF, PNG e versões.', active: true },
        { id: 'iv-7', title: 'Entrega final', description: 'Envie os arquivos completos e manual.', active: true },
      ]),
      'Questionário de briefing preenchido, referências visuais e histórico do negócio.',
      25,
      'Apresentar sempre com mockups reais de aplicação.',
      'Responder questionário de briefing, enviar referências e aprovar conceito.',
      now,
      now
    );

    const d4 = 'del-iv-briefing';
    const d5 = 'del-iv-conceito';
    const d6 = 'del-iv-manual';
    insertDeliv.run(d4, svc2, 'Moodboard & Território Visual', 'Painel semântico e direção estética inicial', 'PDF Apresentação', 1, 7, 'Validar universo visual antes de desenhar o símbolo.', 1, 0);
    insertDeliv.run(d5, svc2, 'Sistema de Logotipo & Paleta', 'Logo principal, reduções, paleta cromática e tipografia', 'Vetor + Apresentação', 1, 15, 'Incluir versões positiva, negativa e monocromática.', 1, 1);
    insertDeliv.run(d6, svc2, 'Manual da Marca & Papelaria', 'Guia de uso completo + arquivos editáveis', 'PDF + Pasta Zip', 1, 25, 'Organizar pastas por formato RGB e CMYK.', 1, 2);

    insertPkg.run(
      'pkg-iv-completo',
      svc2,
      'Identidade Visual Completa',
      'Desenvolvimento integral de marca com logotipo, paleta, tipografia e manual.',
      1800,
      1950,
      25,
      'Parcelamento em até 3x sem juros ou 50/50 no Pix.',
      1,
      JSON.stringify([
        { deliverable_id: d4, name: 'Moodboard & Território Visual', format: 'PDF Apresentação', qty: 1, deadline_days: 7, guidelines: 'Direção criativa e referências.', requires_approval: true },
        { deliverable_id: d5, name: 'Sistema de Logotipo & Paleta', format: 'Vetor + Apresentação', qty: 1, deadline_days: 15, guidelines: 'Apresentação completa do conceito.', requires_approval: true },
        { deliverable_id: d6, name: 'Manual da Marca & Papelaria', format: 'PDF + Pasta Zip', qty: 1, deadline_days: 25, guidelines: 'Entrega final organizada.', requires_approval: true },
      ]),
      now,
      now
    );
  }

  // Ensure the 4 initial editable service models exist idempotently
  const insertSvc = db.prepare(`
    INSERT INTO services (id, name, description, category, icon, color, status, included_items_json, process_steps_json, client_info_needed, default_deadline_days, internal_notes, requires_approval, visible_in_portal, expected_client_actions, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 1, 1, ?, 'user-ingrid', ?, ?)
  `);
  const insertDel = db.prepare(`
    INSERT INTO service_deliverables (id, service_id, name, description, format, default_qty, deadline_days, guidelines, requires_approval, extra_fields_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPk = db.prepare(`
    INSERT INTO service_packages (id, service_id, name, description, price_pix, price_card, deadline_days, conditions, is_featured, status, deliverables_config_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `);

  const hasAlinhamento = db.prepare("SELECT id FROM services WHERE id = 'svc-alinhamento-visual'").get();
  if (!hasAlinhamento) {
    const svc3 = 'svc-alinhamento-visual';
    insertSvc.run(
      svc3,
      'Alinhamento Visual',
      'Organização estética do feed, harmonização cromática, referências visuais e coerência editorial.',
      'Redes Sociais',
      'grid',
      '#E1754C',
      JSON.stringify(['Curadoria de estética de feed', 'Grade estratégica de publicações', 'Guia rápido de harmonia visual', 'Diretrizes de fotos e capas']),
      JSON.stringify([
        { id: 'av-1', title: 'Diagnóstico do perfil atual', description: 'Análise de harmonia, destaques e bio.', active: true },
        { id: 'av-2', title: 'Organização da grade', description: 'Montagem visual da sequência de publicações.', active: true },
        { id: 'av-3', title: 'Validação e entrega', description: 'Aprovação do guia e grade no portal.', active: true },
      ]),
      'Acesso ao perfil, paleta atual, referências desejadas e acervo de imagens.',
      10,
      'Garantir ritmo visual entre respiros, tipografia e fotografia.',
      'Enviar referências e fotos para composição do feed.',
      now,
      now
    );

    const da1 = 'del-av-grade';
    const da2 = 'del-av-capas';
    insertDel.run(da1, svc3, 'Planejamento de Grade do Feed', 'Simulação visual com sequência harmônica de publicações', 'Grade 9 a 15 posts', 1, 5, 'Equilibrar respiros e chamadas tipográficas.', 1, JSON.stringify(['Quantidade de publicações no feed', 'Links de referência estética']), 0);
    insertDel.run(da2, svc3, 'Capas & Destaques Harmonizados', 'Capas para reels e ícones/capas de destaques', 'PNG / Feed 1080x1350px', 6, 8, 'Seguir paleta oficial do perfil.', 1, '[]', 1);

    insertPk.run(
      'pkg-av-essencial',
      svc3,
      'Alinhamento Essencial (9 posts)',
      'Organização de grade para 9 publicações + ajustes de destaques.',
      340,
      370,
      10,
      'Pagamento único via Pix ou cartão.',
      0,
      JSON.stringify([
        { deliverable_id: da1, name: 'Planejamento de Grade do Feed', format: 'Grade 9 posts', qty: 1, deadline_days: 5, guidelines: 'Organização de 9 publicações.', requires_approval: true },
        { deliverable_id: da2, name: 'Capas & Destaques Harmonizados', format: 'PNG 1080x1350px', qty: 6, deadline_days: 8, guidelines: 'Capas alinhadas à paleta.', requires_approval: true },
      ]),
      now,
      now
    );

    insertPk.run(
      'pkg-av-completo',
      svc3,
      'Alinhamento Completo (15 posts)',
      'Estruturação completa de 15 publicações, capas, destaques e manual de feed.',
      520,
      560,
      14,
      'Inclui 1 rodada de ajuste na grade simulada.',
      1,
      JSON.stringify([
        { deliverable_id: da1, name: 'Planejamento de Grade do Feed', format: 'Grade 15 posts', qty: 1, deadline_days: 7, guidelines: 'Organização estratégica de 15 posts.', requires_approval: true },
        { deliverable_id: da2, name: 'Capas & Destaques Harmonizados', format: 'PNG 1080x1350px', qty: 10, deadline_days: 12, guidelines: 'Capas para reels e destaques.', requires_approval: true },
      ]),
      now,
      now
    );
  }

  const hasPersonalizado = db.prepare("SELECT id FROM services WHERE id = 'svc-personalizado'").get();
  if (!hasPersonalizado) {
    const svc4 = 'svc-personalizado';
    insertSvc.run(
      svc4,
      'Serviço Personalizado',
      'Modelo flexível para projetos sob medida com entregáveis, formatos, campos extras, etapas e prazos customizados.',
      'Sob Medida',
      'sliders',
      '#BC9FE6',
      JSON.stringify(['Escopo configurado sob demanda', 'Campos personalizados de briefing', 'Prazos e entregáveis livres', 'Acompanhamento completo no portal']),
      JSON.stringify([
        { id: 'sp-1', title: 'Alinhamento de escopo', description: 'Definição de formatos, quantidades e prazos.', active: true },
        { id: 'sp-2', title: 'Produção criativa', description: 'Execução das entregas personalizadas.', active: true },
        { id: 'sp-3', title: 'Apresentação e aprovação', description: 'Validação pelo cliente no portal.', active: true },
      ]),
      'Escopo aprovado, materiais de apoio e referências do projeto.',
      15,
      'Personalizar entregáveis e campos extras conforme contrato fechado.',
      'Acompanhar prazos e aprovar entregas no portal.',
      now,
      now
    );

    const dp1 = 'del-sp-custom';
    insertDel.run(dp1, svc4, 'Entrega Sob Medida', 'Item personalizável conforme necessidade do projeto', 'Formato Customizado', 1, 10, 'Definir especificações técnicas no cartão.', 1, JSON.stringify(['Objetivo do material', 'Formato / Dimensões', 'Observações técnicas']), 0);

    insertPk.run(
      'pkg-sp-medida',
      svc4,
      'Escopo Sob Medida',
      'Pacote base editável para demandas especiais do estúdio.',
      650,
      700,
      15,
      'Valores e entregas ajustáveis na criação do quadro.',
      0,
      JSON.stringify([
        { deliverable_id: dp1, name: 'Entrega Sob Medida', format: 'Formato Customizado', qty: 1, deadline_days: 10, guidelines: 'Escopo personalizado do estúdio.', requires_approval: true },
      ]),
      now,
      now
    );
  }
}

export function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function logActivity(actorId: string, actorName: string, action: string, entityType: string, entityId: string, details = '') {
  try {
    db.prepare(`
      INSERT INTO activity_logs (id, actor_id, actor_name, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uid('act'), actorId, actorName, action, entityType, entityId, details, new Date().toISOString());
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

export function createNotification(
  targetUserId: string,
  type: string,
  title: string,
  message: string,
  linkTab?: string,
  linkEntityId?: string
) {
  try {
    db.prepare(`
      INSERT INTO notifications (id, target_user_id, type, title, message, link_tab, link_entity_id, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(uid('ntf'), targetUserId, type, title, message, linkTab ?? null, linkEntityId ?? null, new Date().toISOString());
    broadcastRealtime({
      type: 'notification_created',
      targetUserIds: [targetUserId],
      summary: title,
    });
  } catch (err) {
    console.error('Notification error:', err);
  }
}

export interface StudioEventPayload {
  actorId: string;
  actorName: string;
  eventType: string;
  entityType: string;
  entityId: string;
  title: string;
  message: string;
  boardId?: string | null;
  clientId?: string | null;
  cardId?: string | null;
  visibility?: 'shared' | 'internal';
  priority?: 'normal' | 'high';
  postToStudioMural?: boolean;
  postToBoardMural?: boolean;
  notifyUserIds?: string[];
  linkTab?: string;
  linkEntityId?: string;
  color?: string;
}

export function emitStudioEvent(payload: StudioEventPayload) {
  const now = new Date().toISOString();
  const color = payload.color || '#F3ECF9';
  const priority = payload.priority || 'normal';

  try {
    if (payload.postToStudioMural) {
      db.prepare(`
        INSERT INTO mural_posts (
          id, scope, board_id, client_id, author_id, author_name, title, content,
          pinned, color, visibility, is_auto, event_type, entity_type, entity_id, card_id, priority, created_at
        ) VALUES (?, 'studio', ?, ?, ?, ?, ?, ?, 0, ?, 'internal', 1, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('mrl'),
        payload.boardId ?? null,
        payload.clientId ?? null,
        payload.actorId,
        payload.actorName,
        payload.title,
        payload.message,
        color,
        payload.eventType,
        payload.entityType,
        payload.entityId,
        payload.cardId ?? null,
        priority,
        now
      );
    }

    if (payload.postToBoardMural && payload.boardId) {
      db.prepare(`
        INSERT INTO mural_posts (
          id, scope, board_id, client_id, author_id, author_name, title, content,
          pinned, color, visibility, is_auto, event_type, entity_type, entity_id, card_id, priority, created_at
        ) VALUES (?, 'board', ?, ?, ?, ?, ?, ?, 0, ?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        uid('mrl'),
        payload.boardId,
        payload.clientId ?? null,
        payload.actorId,
        payload.actorName,
        payload.title,
        payload.message,
        color,
        payload.visibility || 'shared',
        payload.eventType,
        payload.entityType,
        payload.entityId,
        payload.cardId ?? null,
        priority,
        now
      );
    }

    if (Array.isArray(payload.notifyUserIds) && payload.notifyUserIds.length > 0) {
      const uniqueTargets = Array.from(new Set(payload.notifyUserIds.filter((id) => Boolean(id) && id !== payload.actorId)));
      for (const targetId of uniqueTargets) {
        createNotification(
          targetId,
          payload.eventType,
          payload.title,
          payload.message,
          payload.linkTab || 'portal',
          payload.linkEntityId || payload.boardId || payload.entityId
        );
      }
    }
    if (payload.postToStudioMural || payload.postToBoardMural) {
      broadcastRealtime({
        type: payload.postToBoardMural ? 'portal_activity' : 'mural_updated',
        actorId: payload.actorId,
        scope: payload.postToBoardMural ? 'board' : 'studio',
        boardId: payload.boardId ?? null,
        summary: payload.title,
      });
    }
  } catch (err) {
    console.error('emitStudioEvent error:', err);
  }
}
