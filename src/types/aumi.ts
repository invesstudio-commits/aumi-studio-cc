export type UserRole = 'partner' | 'client';
export type PartnerKey = 'ingrid' | 'mariana';

export interface PartnerPermissions {
  can_manage_services: boolean;
  can_manage_finance: boolean;
  can_manage_society: boolean;
  can_manage_settings: boolean;
  can_manage_clients: boolean;
  can_delete_boards: boolean;
  can_edit_other_portal: boolean;
}

export type HomeWidgetId =
  | 'welcome'
  | 'clock'
  | 'shortcuts'
  | 'kpis'
  | 'communication'
  | 'calendar'
  | 'partners'
  | 'finance'
  | 'activities';

export type WidgetDensity = 'compacto' | 'padrao' | 'expandido';
export type WidgetSurfaceStyle = 'solid' | 'gradient' | 'liquid';
export type WidgetColSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;

export interface HomeWidgetConfig {
  id: HomeWidgetId;
  visible: boolean;
  colSpan: WidgetColSpan;
  density: WidgetDensity;
  surface: WidgetSurfaceStyle;
  primaryColor: string;
  secondaryColor: string;
  accentBar: boolean;
  accentBarColor: string;
  useDefaultStyle?: boolean;
}

export interface HomeLayoutConfig {
  version: number;
  widgets: HomeWidgetConfig[];
  autoSave?: boolean;
}

export interface UserPreferences {
  accent_color: string;
  compact_sidebar: boolean;
  notify_deadlines: boolean;
  notify_board_updates: boolean;
  notify_comments: boolean;
  notify_approvals: boolean;
  notify_mural: boolean;
  sound_enabled?: boolean;
  sound_confirm_enabled?: boolean;
  sound_notification_enabled?: boolean;
  home_layout?: HomeLayoutConfig;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  partner_key: PartnerKey | null;
  avatar_url: string | null;
  title: string;
  bio: string;
  permissions: PartnerPermissions;
  preferences: UserPreferences;
  client_id: string | null;
  active: boolean;
  last_seen_at?: string | null;
}

export interface Client {
  id: string;
  name: string;
  company: string;
  contact_name?: string;
  email: string;
  phone: string;
  instagram: string;
  avatar_url?: string | null;
  description?: string;
  owner_partner?: PartnerKey;
  start_date?: string;
  status?: 'active' | 'paused' | 'archived';
  contracted_services?: Array<{
    service_id?: string;
    service_name: string;
    package_name?: string;
    notes?: string;
  }>;
  folder_color?: string;
  folder_icon?: string;
  folder_cover_url?: string | null;
  notes: string;
  portal_welcome: string;
  portal_enabled: boolean;
  has_login?: boolean;
  login_email?: string;
  login_active?: boolean;
  boards_count?: number;
  active_boards_count?: number;
  pending_demands_count?: number;
  last_activity_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface ServiceDeliverable {
  id?: string;
  service_id?: string;
  name: string;
  description: string;
  format: string;
  default_qty: number;
  deadline_days: number;
  guidelines: string;
  requires_approval: boolean;
  extra_fields?: string[];
}

export interface PackageDeliverableConfig {
  deliverable_id?: string;
  name: string;
  format: string;
  qty: number;
  deadline_days: number;
  guidelines: string;
  requires_approval: boolean;
}

export interface ServicePackage {
  id: string;
  service_id: string;
  name: string;
  description: string;
  price_pix: number;
  price_card: number;
  deadline_days: number;
  conditions: string;
  is_featured: boolean;
  status: 'active' | 'archived';
  deliverables_config: PackageDeliverableConfig[];
}

export interface ProcessStep {
  id: string;
  title: string;
  description: string;
  active: boolean;
}

export interface ServiceRequirementField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'link' | 'file';
  required?: boolean;
  placeholder?: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  status: 'active' | 'archived';
  included_items: string[];
  process_steps: ProcessStep[];
  client_info_needed: string;
  client_requirements?: ServiceRequirementField[];
  default_deadline_days: number;
  internal_notes: string;
  requires_approval: boolean;
  visible_in_portal: boolean;
  expected_client_actions: string;
  deliverables: ServiceDeliverable[];
  packages: ServicePackage[];
  boards_count?: number;
  active_deliverables_count?: number;
  pending_demands_count?: number;
}

export interface Folder {
  id: string;
  portal_owner: PartnerKey;
  name: string;
  color: string;
  cover_url: string | null;
  sort_order: number;
}

export interface SelectedBoardService {
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
}

export interface BoardDriveLink {
  id: string;
  title: string;
  url: string;
  description?: string;
  is_internal?: boolean;
  created_at?: string;
}

export interface BoardDocumentItem {
  title?: string;
  file_url?: string;
  file_name?: string;
  mime_type?: string;
  validity?: string;
  notes?: string;
  client_visible?: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface BoardBriefingInfo {
  title?: string;
  description?: string;
  file_url?: string;
  file_name?: string;
  mime_type?: string;
  notes?: string;
  internal_notes?: string;
  client_visible?: boolean;
  updated_at?: string;
  updated_by?: string;
}

export interface BoardContractInfo {
  document_url?: string;
  document_title?: string;
  validity?: string;
  summary?: string;
  deliverables_notes?: string;
  internal_notes?: string;
  contract_doc?: BoardDocumentItem;
  proposal_doc?: BoardDocumentItem;
}

export interface Board {
  id: string;
  portal_owner: PartnerKey;
  folder_id: string | null;
  client_id: string;
  client_name?: string;
  client_company?: string;
  client_email?: string;
  title: string;
  description: string;
  cover_url: string | null;
  lead_user_id: string;
  collaborator_user_id: string | null;
  start_date: string | null;
  deadline: string | null;
  priority: string;
  labels: string[];
  status: 'draft' | 'active' | 'completed' | 'archived';
  visibility: 'internal' | 'shared';
  shared_with_client: boolean;
  share_token?: string | null;
  invite_status?: 'not_invited' | 'sent' | 'accepted';
  invited_email?: string;
  invite_sent_at?: string | null;
  invite_accepted_at?: string | null;
  selected_services: SelectedBoardService[];
  initial_notes?: string;
  drive_links?: BoardDriveLink[];
  contract_info?: BoardContractInfo;
  briefing_info?: BoardBriefingInfo;
  process_state?: Record<string, boolean>;
  total_value: number;
  total_cards?: number;
  completed_cards?: number;
  pending_approvals?: number;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  title: string;
  color: string;
  cover_url?: string | null;
  sort_order: number;
  archived: boolean;
  client_visible: boolean;
  client_label: string;
  client_description: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CardAttachment {
  id: string;
  card_id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  file_url: string;
  is_internal: number;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

export interface CardComment {
  id: string;
  card_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  content: string;
  is_internal: number;
  created_at: string;
}

export interface CardClientField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'link' | 'file';
  required?: boolean;
}

export interface CardSubmittedContent {
  text?: string;
  links?: string[];
  answers?: Record<string, string>;
  notes?: string;
  submitted_at?: string;
  submitted_by?: string;
}

export interface CardReferenceLink {
  id: string;
  url: string;
  description: string;
}

export interface CardHiddenSections {
  observations?: boolean;
  notes?: boolean;
  references?: boolean;
  attachments?: boolean;
  checklist?: boolean;
  comments?: boolean;
  extra_info?: boolean;
}

export type AdjustmentType =
  | 'Alteração'
  | 'Melhorar texto'
  | 'Corrigir informações'
  | 'Solicitar novas informações'
  | 'Solicitar novos materiais'
  | 'Outro ajuste';

export interface CardAdjustmentRequest {
  type: AdjustmentType | string;
  message: string;
  requested_by_id: string;
  requested_by_name: string;
  requested_at: string;
  attachments?: Array<{
    filename: string;
    original_name: string;
    mime_type: string;
    size_bytes: number;
    file_url: string;
  }>;
  resolved?: boolean;
}

export interface CardHistoryItem {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface CardMiniUpdateOption {
  id: string;
  label: string;
  bg: string;
  text: string;
  border?: string;
}

export interface CardMiniUpdateRecord {
  id: string;
  option_id?: string | null;
  label: string;
  bg: string;
  text: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

export interface Card {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string;
  service_id: string | null;
  service_name: string;
  package_id: string | null;
  package_name: string;
  format: string;
  lead_user_id: string | null;
  collaborator_user_id: string | null;
  due_date: string | null;
  publish_date: string | null;
  priority: 'baixa' | 'normal' | 'alta' | 'urgente';
  labels: string[];
  checklist: ChecklistItem[];
  references_text: string;
  copy_text: string;
  internal_notes?: string;
  extra_notes?: string;
  links?: CardReferenceLink[];
  hidden_sections?: CardHiddenSections;
  adjustment_request?: CardAdjustmentRequest | null;
  read_at?: string | null;
  read_by_id?: string | null;
  read_by_name?: string | null;
  client_visible: boolean;
  requires_approval: boolean;
  approval_status: 'none' | 'pending' | 'approved' | 'changes_requested';
  approval_feedback: string;
  content_status?: 'awaiting_content' | 'submitted' | 'complement_requested' | 'content_approved';
  content_feedback?: string;
  client_fields?: CardClientField[];
  submitted_content?: CardSubmittedContent;
  history?: CardHistoryItem[];
  mini_updates?: CardMiniUpdateRecord[];
  sort_order: number;
  comments: CardComment[];
  attachments: CardAttachment[];
  created_at: string;
  updated_at: string;
}

export interface CopyAttachment {
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  file_url: string;
}

export interface CopyHistoryEntry {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  details: string;
  created_at: string;
}

export type CopyStatus =
  | 'draft'
  | 'not_shared'
  | 'shared'
  | 'awaiting_approval'
  | 'approved'
  | 'changes_requested';

export interface CopyItem {
  id: string;
  title: string;
  content: string;
  notes?: string;
  attachments: CopyAttachment[];
  author_user_id: string;
  author_name: string;
  priority: 'baixa' | 'normal' | 'alta' | 'urgente';
  labels: string[];
  checklist: ChecklistItem[];
  status: CopyStatus;
  client_id: string | null;
  client_name?: string | null;
  board_id: string | null;
  board_title?: string | null;
  card_id: string | null;
  shared_with_client: boolean;
  share_token: string | null;
  shared_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  client_feedback: string;
  version_number?: number;
  history: CopyHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export type ApprovalMaterialType = 'image' | 'pdf' | 'link' | 'text' | 'document' | 'file';
export type ApprovalItemStatus = 'pending' | 'approved' | 'changes_requested';
export type ApprovalDeliveryStatus = 'pending' | 'partially_approved' | 'changes_requested' | 'approved';

export interface ApprovalItemVersion {
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
}

export interface ApprovalItemComment {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  content: string;
  created_at: string;
}

export interface ApprovalMaterialItem {
  id: string;
  type: ApprovalMaterialType;
  title: string;
  url?: string;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  content?: string;
  notes?: string;
  status: ApprovalItemStatus;
  feedback?: string;
  decided_by_name?: string;
  decided_at?: string;
  version_number: number;
  versions: ApprovalItemVersion[];
  comments: ApprovalItemComment[];
  created_at: string;
  updated_at: string;
}

export interface ApprovalDelivery {
  id: string;
  board_id: string;
  card_id: string | null;
  card_title?: string | null;
  card_service_name?: string | null;
  title: string;
  description: string;
  status: ApprovalDeliveryStatus;
  items: ApprovalMaterialItem[];
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface MuralAttachment {
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  file_url: string;
}

export interface MuralLink {
  id: string;
  url: string;
  title?: string;
}

export interface MuralMention {
  user_id: string;
  name: string;
}

export interface MuralReaction {
  emoji: string;
  user_id: string;
  user_name: string;
  created_at: string;
}

export interface MuralComment {
  id: string;
  post_id: string;
  parent_comment_id: string | null;
  author_id: string;
  author_name: string;
  author_role: 'partner' | 'client' | string;
  author_avatar?: string | null;
  author_partner_key?: PartnerKey | null;
  content: string;
  visibility: 'shared' | 'internal';
  attachments: MuralAttachment[];
  links: MuralLink[];
  mentions: MuralMention[];
  reactions: MuralReaction[];
  created_at: string;
}

export interface MuralPost {
  id: string;
  scope: 'studio' | 'ingrid' | 'mariana' | 'client' | 'board';
  board_id: string | null;
  client_id: string | null;
  author_id: string;
  author_name: string;
  author_avatar?: string | null;
  author_partner_key?: PartnerKey | null;
  author_role?: 'partner' | 'client' | string;
  title: string;
  content: string;
  pinned: number;
  color: string;
  visibility?: 'shared' | 'internal';
  is_auto?: number;
  event_type?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  card_id?: string | null;
  priority?: 'normal' | 'high';
  read_by?: string[];
  attachments?: MuralAttachment[];
  links?: MuralLink[];
  mentions?: MuralMention[];
  likes?: string[];
  likes_count?: number;
  comments?: MuralComment[];
  comments_count?: number;
  created_at: string;
}

export interface StudioNote {
  id: string;
  title: string;
  content: string;
  category: string;
  color: string;
  pinned: number;
  client_id: string | null;
  board_id: string | null;
  client_name?: string | null;
  board_title?: string | null;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}

export interface StudioEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  type: 'meeting' | 'deadline' | 'delivery' | 'finance' | 'internal';
  client_id: string | null;
  client_name?: string | null;
  board_id: string | null;
  board_title?: string | null;
  owner_partner: string;
  created_by: string;
  created_at: string;
}

export interface PartnerStatusItem {
  id: string;
  name: string;
  partner_key: PartnerKey;
  avatar_url: string | null;
  title: string;
  last_seen_at: string | null;
  is_online: boolean;
  active_boards: number;
  pending_cards: number;
  clients_count: number;
}

export interface FinanceEntry {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  category: string;
  entry_date: string;
  due_date: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  client_id: string | null;
  client_name?: string | null;
  service_id: string | null;
  service_name?: string | null;
  board_id: string | null;
  board_title?: string | null;
  payment_method: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface FinanceMonthlyPoint {
  month: string;
  income: number;
  expense: number;
}

export interface SocietyConfig {
  id: string;
  user_id: string;
  partner_key: PartnerKey;
  name: string;
  email: string;
  title: string;
  avatar_url: string | null;
  equity_percent: number;
  default_revenue_split: number;
  default_expense_split: number;
  responsibilities: string[];
  totals: {
    revenue_share: number;
    expense_share: number;
    withdrawals: number;
    investments: number;
    net_balance: number;
  };
  operational?: {
    clients_count: number;
    active_boards_count: number;
    pending_cards_count: number;
    completed_cards_count: number;
  };
}

export interface SocietyEntry {
  id: string;
  type: 'revenue_share' | 'expense_share' | 'withdrawal' | 'investment' | 'agreement';
  partner_user_id: string;
  partner_name: string;
  partner_key: PartnerKey;
  description: string;
  amount: number;
  split_percent: number | null;
  origin_type: string;
  finance_entry_id: string | null;
  finance_description?: string | null;
  finance_status?: string | null;
  board_id: string | null;
  entry_date: string;
  status: 'pending' | 'confirmed';
  notes: string;
  created_at: string;
}

export type StudioDemandStatus = 'pendente' | 'em_andamento' | 'aguardando' | 'concluida';

export interface StudioDemandReply {
  id: string;
  demand_id: string;
  author_id: string;
  author_name: string;
  author_avatar?: string | null;
  author_partner_key?: PartnerKey | null;
  content: string;
  created_at: string;
}

export interface StudioDemand {
  id: string;
  title: string;
  description: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string | null;
  sender_partner_key?: PartnerKey | null;
  assignee_id: string;
  assignee_name: string;
  assignee_avatar?: string | null;
  assignee_partner_key?: PartnerKey | null;
  status: StudioDemandStatus;
  priority: 'normal' | 'alta' | 'urgente';
  due_date?: string | null;
  board_id?: string | null;
  board_title?: string | null;
  portal_owner?: PartnerKey | null;
  replies: StudioDemandReply[];
  replies_count: number;
  created_at: string;
  updated_at: string;
}

export type NotificationCategory = 'portal' | 'sistema' | 'socias';

export interface NotificationItem {
  id: string;
  target_user_id: string;
  type: string;
  title: string;
  message: string;
  link_tab: string | null;
  link_entity_id: string | null;
  is_read: number;
  created_at: string;
  board_id?: string | null;
  board_title?: string | null;
  client_name?: string | null;
  portal_owner?: PartnerKey | null;
  category?: NotificationCategory;
  origin_label?: string;
}

export interface StudioChatMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string | null;
  sender_partner_key?: PartnerKey | null;
  content: string;
  created_at: string;
}

export interface PostItStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  size: number;
  points: Array<[number, number]>;
}

export interface StudioPostIt {
  owner_key: PartnerKey;
  owner_user_id: string;
  owner_name: string;
  owner_avatar?: string | null;
  bg_color: string;
  text_html: string;
  strokes: PostItStroke[];
  updated_by: string;
  updated_at: string;
}

export interface ActivityLog {
  id: string;
  actor_id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}

export interface TypographyConfig {
  font_css_url: string;
  primary_font: string;
  display_font: string;
  editorial_font: string;
  base_scale: number;
  letter_spacing: string;
}

export interface ThemeTokensConfig {
  glass_blur: number;
  dock_position: 'bottom' | 'compact';
  wallpaper_tint: 'aura_purple' | 'blush_silk' | 'ecru_warm';
}

export interface StudioSettings {
  default_columns: Array<{
    title: string;
    color: string;
    client_visible: boolean;
    client_label?: string;
    client_description?: string;
  }>;
  labels: Array<{ id: string; name: string; color: string; text: string }>;
  priorities: Array<{ key: string; label: string; description: string; color: string }>;
  board_statuses: Array<{ key: string; label: string }>;
  portal_defaults: {
    welcome_message: string;
    allow_client_comments: boolean;
    allow_client_uploads: boolean;
    allow_client_approvals: boolean;
    show_mural_to_clients: boolean;
  };
  appearance: {
    primary_accent: string;
    secondary_accent: string;
    warm_accent: string;
    compact_density: boolean;
  };
  typography?: TypographyConfig;
  theme_tokens?: ThemeTokensConfig;
  card_mini_updates?: CardMiniUpdateOption[];
  notifications_global: {
    deadline_warning_days: number;
    notify_on_client_upload: boolean;
    notify_on_approval: boolean;
    notify_on_card_move: boolean;
  };
}

export interface SearchResults {
  clients: Array<{ id: string; name: string; company: string; owner_partner: PartnerKey; status: string }>;
  boards: Array<{ id: string; title: string; portal_owner: PartnerKey; client_id: string; client_name: string }>;
  services: Array<{ id: string; name: string; category: string; color: string }>;
  copies: Array<{ id: string; title: string; status: CopyStatus; client_id: string | null; board_id: string | null }>;
  cards: Array<{ id: string; title: string; board_id: string; board_title: string }>;
}

export type MainTab =
  | 'inicio'
  | 'portal'
  | 'servicos'
  | 'clientes'
  | 'financeiro'
  | 'sociedade'
  | 'configuracoes';
