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

export interface UserPreferences {
  accent_color: string;
  compact_sidebar: boolean;
  notify_deadlines: boolean;
  notify_board_updates: boolean;
  notify_comments: boolean;
  notify_approvals: boolean;
  notify_mural: boolean;
  sound_enabled: boolean;
  sound_confirm_enabled: boolean;
  sound_notification_enabled: boolean;
}

export interface DbUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  partner_key: PartnerKey | null;
  avatar_url: string | null;
  title: string;
  bio: string;
  permissions_json: string;
  preferences_json: string;
  client_id: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
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
}
