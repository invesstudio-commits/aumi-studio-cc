import React, { useEffect, useState } from 'react';
import {
  User as UserIcon,
  Shield,
  Palette,
  Type as TypeIcon,
  Globe,
  Columns,
  Bell,
  Plug,
  Database,
  Save,
  Download,
  Upload,
  Check,
  Plus,
  Search,
  RotateCcw,
  Sparkles,
  Link2,
  FolderLock,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';
import { api, formatActivityActionPT, formatRelativeTime, uploadFile } from '../lib/api.ts';
import { applyStudioTheme } from '../lib/theme.ts';
import {
  extractSoundPrefs,
  playConfirmClick,
  playNotificationPop,
  setActiveUserSoundPrefs,
} from '../lib/sounds.ts';
import {
  ActivityLog,
  PartnerPermissions,
  StudioSettings,
  ThemeTokensConfig,
  TypographyConfig,
  User,
} from '../types/aumi.ts';
import { PartnerAvatar } from './AumiBrand.tsx';

interface SettingsViewProps {
  user: User;
  onUserUpdated: (user: User) => void;
  onSettingsUpdated?: (settings: StudioSettings) => void;
}

type SettingsCategory =
  | 'perfil'
  | 'permissoes'
  | 'aparencia'
  | 'tipografia'
  | 'portal'
  | 'quadros'
  | 'notificacoes'
  | 'integracoes'
  | 'sistema';

const CATEGORIES: Array<{
  id: SettingsCategory;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}> = [
  { id: 'perfil', label: 'Perfil e conta', group: 'Conta', icon: UserIcon, tint: 'bg-[#7A689C] text-white' },
  { id: 'permissoes', label: 'Usuárias e permissões', group: 'Conta', icon: Shield, tint: 'bg-[#2F1534] text-white' },
  { id: 'aparencia', label: 'Aparência visual', group: 'Visual', icon: Palette, tint: 'bg-[#EC2B82] text-white' },
  { id: 'tipografia', label: 'Tipografia', group: 'Visual', icon: TypeIcon, tint: 'bg-[#E1754C] text-white' },
  { id: 'portal', label: 'Portal do Cliente', group: 'Estúdio', icon: Globe, tint: 'bg-[#BC9FE6] text-[#2F1534]' },
  { id: 'quadros', label: 'Estúdio & Quadros', group: 'Estúdio', icon: Columns, tint: 'bg-[#EC97B7] text-[#2F1534]' },
  { id: 'notificacoes', label: 'Sons e notificações', group: 'Estúdio', icon: Volume2, tint: 'bg-[#5B8A3C] text-white' },
  { id: 'integracoes', label: 'Integrações', group: 'Sistema', icon: Plug, tint: 'bg-[#7A689C] text-white' },
  { id: 'sistema', label: 'Dados e sistema', group: 'Sistema', icon: Database, tint: 'bg-[#232122] text-white' },
];

const PERMISSION_LABELS: Array<{ key: keyof PartnerPermissions; label: string }> = [
  { key: 'can_manage_services', label: 'Gerenciar serviços e pacotes' },
  { key: 'can_manage_clients', label: 'Cadastrar clientes e acessos externos' },
  { key: 'can_manage_finance', label: 'Acessar e editar o Financeiro' },
  { key: 'can_manage_society', label: 'Acessar e editar a Sociedade' },
  { key: 'can_delete_boards', label: 'Excluir quadros permanentemente' },
  { key: 'can_edit_other_portal', label: 'Editar quadros e pastas no portal da outra sócia' },
  { key: 'can_manage_settings', label: 'Alterar configurações globais do sistema' },
];

const DEFAULT_TYPOGRAPHY: TypographyConfig = {
  font_css_url: '',
  primary_font: '',
  display_font: '',
  editorial_font: '',
  base_scale: 1,
  letter_spacing: '-0.015em',
};

const DEFAULT_THEME_TOKENS: ThemeTokensConfig = {
  glass_blur: 22,
  dock_position: 'bottom',
  wallpaper_tint: 'aura_purple',
};

function IosSwitch({
  checked,
  disabled,
  tone = 'pink',
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  tone?: 'pink' | 'green' | 'orange';
  onChange: (next: boolean) => void;
}) {
  const activeBg =
    tone === 'green'
      ? 'bg-[#34C759]'
      : tone === 'orange'
      ? 'bg-[#E1754C]'
      : 'bg-[#EC2B82]';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[28px] w-[50px] shrink-0 items-center rounded-full p-[2px] transition-colors duration-200 ${
        checked ? activeBg : 'bg-[#2F1534]/18'
      } ${disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-[24px] w-[24px] transform rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.22)] transition-transform duration-200 ${
          checked ? 'translate-x-[22px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function SettingsView({ user, onUserUpdated, onSettingsUpdated }: SettingsViewProps) {
  const [activeCat, setActiveCat] = useState<SettingsCategory>('perfil');
  const [catQuery, setCatQuery] = useState('');
  const [partners, setPartners] = useState<User[]>([]);
  const [settings, setSettings] = useState<StudioSettings | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Profile state
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profileTitle, setProfileTitle] = useState(user.title);
  const [profileBio, setProfileBio] = useState(user.bio);
  const [profileAvatar, setProfileAvatar] = useState(user.avatar_url || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // New label / column state
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#FDF2F6');
  const [newLabelText, setNewLabelText] = useState('#EC2B82');
  const [newColName, setNewColName] = useState('');

  async function loadAll() {
    const [pRes, stRes, actRes] = await Promise.all([
      api<{ partners: User[] }>('/partners'),
      api<{ settings: StudioSettings }>('/settings'),
      api<{ logs: ActivityLog[] }>('/activity?limit=40'),
    ]);
    setPartners(pRes.partners);
    setSettings(stRes.settings);
    setLogs(actRes.logs);
    applyStudioTheme(stRes.settings);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function showSaved(msg = 'Configurações salvas e aplicadas.') {
    setFeedback(msg);
    setErrorMsg('');
    setTimeout(() => setFeedback(''), 3500);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await api<{ user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileName.trim(),
          email: profileEmail.trim(),
          title: profileTitle.trim(),
          bio: profileBio.trim(),
          avatar_url: profileAvatar || null,
        }),
      });
      onUserUpdated(res.user);
      await loadAll();
      showSaved('Perfil atualizado com sucesso.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao atualizar perfil.');
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const up = await uploadFile(file);
    setProfileAvatar(up.file_url);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      showSaved('Senha alterada com sucesso.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    }
  }

  async function handleTogglePermission(partner: User, key: keyof PartnerPermissions) {
    const updatedPerms = { ...partner.permissions, [key]: !partner.permissions[key] };
    const res = await api<{ partner: User }>(`/partners/${partner.id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: updatedPerms }),
    });
    setPartners((prev) => prev.map((p) => (p.id === partner.id ? res.partner : p)));
    if (res.partner.id === user.id) {
      onUserUpdated(res.partner);
    }
    showSaved(`Permissões de ${partner.name} atualizadas.`);
  }

  async function saveSettingKey<K extends keyof StudioSettings>(key: K, value: StudioSettings[K], msg?: string) {
    try {
      await api(`/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      setSettings((prev) => {
        if (!prev) return prev;
        const next = { ...prev, [key]: value };
        applyStudioTheme(next);
        onSettingsUpdated?.(next);
        return next;
      });
      showSaved(msg);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar configuração.');
    }
  }

  async function handleAccentSelect(color: string) {
    const res = await api<{ user: User }>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ preferences: { accent_color: color } }),
    });
    onUserUpdated(res.user);
    if (settings) {
      await saveSettingKey('appearance', { ...settings.appearance, primary_accent: color });
    }
  }

  const [savingSoundPref, setSavingSoundPref] = useState(false);
  const soundPrefs = extractSoundPrefs(user.preferences);

  async function handleUpdateSoundPref(patch: Partial<User['preferences']>) {
    setSavingSoundPref(true);
    setErrorMsg('');
    try {
      const nextLocal = { ...user.preferences, ...patch };
      setActiveUserSoundPrefs(nextLocal);
      const res = await api<{ user: User }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ preferences: patch }),
      });
      setActiveUserSoundPrefs(res.user.preferences);
      onUserUpdated(res.user);
      showSaved(`Preferências de som de ${res.user.name} salvas.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao salvar preferências de som.');
    } finally {
      setSavingSoundPref(false);
    }
  }

  async function handleDownloadBackup() {
    const data = await api('/system/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aumi-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canManageSettings = user.permissions.can_manage_settings;
  const typo = settings?.typography || DEFAULT_TYPOGRAPHY;
  const themeTokens = settings?.theme_tokens || DEFAULT_THEME_TOKENS;

  const filteredCategories = CATEGORIES.filter((c) =>
    !catQuery.trim() ? true : c.label.toLowerCase().includes(catQuery.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="aumi-glass-strong rounded-[28px] p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#7A689C]">
            Ajustes do Sistema
          </span>
          <h1 className="font-editorial text-3xl text-[#2F1534]">Configurações</h1>
          <p className="text-sm text-[#232122]/65 mt-0.5">
            Conta, permissões das sócias, aparência visual, tipografia centralizada e portal.
          </p>
        </div>

        {feedback && (
          <div className="px-4 py-2.5 rounded-2xl bg-[#F4F5E2] border border-[#C8C978] text-xs font-semibold text-[#3E4113] flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>{feedback}</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-[#FDF2F6] border border-[#EC2B82]/35 text-xs font-semibold text-[#A9195A]">
          {errorMsg}
        </div>
      )}

      {/* macOS System Settings Split-Pane Shell */}
      <div className="aumi-glass-strong rounded-[28px] overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
        {/* Translucent Left Sidebar */}
        <aside className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-[#2F1534]/[0.08] bg-white/45 p-4 space-y-4">
          {/* Active Partner Card */}
          <button
            type="button"
            onClick={() => setActiveCat('perfil')}
            className="w-full p-3 rounded-2xl bg-white/75 border border-white/80 flex items-center gap-3 text-left hover:bg-white transition-colors"
          >
            <PartnerAvatar name={user.name} partnerKey={user.partner_key} avatarUrl={user.avatar_url} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#2F1534] truncate">{user.name}</p>
              <p className="text-[11px] text-[#7A689C] truncate">{user.title || 'Sócia Aumi Studio'}</p>
            </div>
          </button>

          {/* Search inside Settings */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#232122]/45 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={catQuery}
              onChange={(e) => setCatQuery(e.target.value)}
              placeholder="Buscar ajustes..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white/75 border border-[#2F1534]/10 text-xs focus:outline-none focus:border-[#7A689C]"
            />
          </div>

          <nav className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {filteredCategories.map((cat) => {
              const Icon = cat.icon;
              const active = activeCat === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCat(cat.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-[#2F1534] text-white shadow-xs'
                      : 'text-[#232122]/80 hover:bg-white/70'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${cat.tint}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Solid Readable Detail Pane */}
        <div className="lg:col-span-8 xl:col-span-9 bg-white/92 p-5 sm:p-8 space-y-6">
          {activeCat === 'perfil' && (
            <div className="space-y-8">
              <form onSubmit={handleSaveProfile} className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-[#2F1534]">Perfil e conta</h2>
                  <p className="text-xs text-[#232122]/60">Atualize seus dados públicos no estúdio e foto de exibição.</p>
                </div>

                <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#FCF6EC]/60 border border-[#2F1534]/[0.06]">
                  <PartnerAvatar name={profileName} partnerKey={user.partner_key} avatarUrl={profileAvatar} size="lg" />
                  <label className="px-4 py-2 rounded-xl bg-white border border-black/12 hover:border-[#EC2B82] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-[#EC2B82]" />
                    <span>Alterar foto</span>
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#232122]/75">Nome</label>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#232122]/75">E-mail</label>
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#232122]/75">Cargo / Papel no estúdio</label>
                  <input
                    type="text"
                    value={profileTitle}
                    onChange={(e) => setProfileTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-[#232122]/75">Bio / Especialidade</label>
                  <textarea
                    rows={2}
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                  />
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar perfil
                </button>
              </form>

              <form onSubmit={handleChangePassword} className="pt-6 border-t border-black/[0.06] space-y-4 max-w-md">
                <h3 className="text-sm font-semibold text-[#2F1534]">Alteração de senha</h3>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#232122]/75">Senha atual</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-[#232122]/75">Nova senha (mín. 6 caracteres)</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-black/12 text-sm bg-white"
                  />
                </div>
                <button type="submit" className="px-4 py-2.5 rounded-xl bg-[#EC2B82] text-white text-xs font-semibold">
                  Atualizar senha
                </button>
              </form>
            </div>
          )}

          {activeCat === 'permissoes' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Usuárias e permissões</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Controle individualmente o que Ingrid e Mariana podem acessar e gerenciar no sistema.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {partners.map((partner) => (
                  <div
                    key={partner.id}
                    className="p-5 rounded-2xl border border-[#2F1534]/[0.08] bg-[#FCF6EC]/45 space-y-4"
                  >
                    <div className="flex items-center gap-3">
                      <PartnerAvatar
                        name={partner.name}
                        partnerKey={partner.partner_key}
                        avatarUrl={partner.avatar_url}
                        size="md"
                      />
                      <div>
                        <p className="text-sm font-semibold text-[#2F1534]">{partner.name}</p>
                        <p className="text-xs text-[#232122]/55">{partner.email}</p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-black/[0.06]">
                      {PERMISSION_LABELS.map((perm) => (
                        <div key={perm.key} className="flex items-center justify-between gap-3 text-xs text-[#232122]/85">
                          <span>{perm.label}</span>
                          <IosSwitch
                            disabled={!canManageSettings}
                            checked={Boolean(partner.permissions[perm.key])}
                            onChange={() => handleTogglePermission(partner, perm.key)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeCat === 'aparencia' && settings && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Aparência visual</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Personalize a paleta prioritária, o papel de parede e a intensidade do efeito translúcido.
                </p>
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-[#2F1534]">Cor de destaque prioritária</label>
                <div className="flex flex-wrap gap-3">
                  {[
                    { hex: '#7A689C', name: 'Roxo Estúdio' },
                    { hex: '#EC2B82', name: 'Rosa Aumi' },
                    { hex: '#E1754C', name: 'Laranja Terracota' },
                    { hex: '#2F1534', name: 'Plum Profundo' },
                  ].map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => handleAccentSelect(c.hex)}
                      className={`px-4 py-2.5 rounded-2xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                        (settings.appearance?.primary_accent || user.preferences?.accent_color) === c.hex
                          ? 'border-[#2F1534] bg-[#F3ECF9]'
                          : 'border-black/10 bg-white hover:border-[#7A689C]'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full" style={{ backgroundColor: c.hex }} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-[#2F1534]">Fundo da tela</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'aura_purple' as const,
                      label: 'Aura Roxa & Lilás',
                      preview: 'from-[#BC9FE6]/65 via-[#F5EFF9] to-[#EC97B7]/45',
                    },
                    {
                      id: 'blush_silk' as const,
                      label: 'Seda Blush',
                      preview: 'from-[#EC97B7]/60 via-[#FDF3F7] to-[#BC9FE6]/40',
                    },
                    {
                      id: 'ecru_warm' as const,
                      label: 'Cru & Terracota',
                      preview: 'from-[#FCF6EC] via-[#FDF0E8] to-[#BC9FE6]/35',
                    },
                  ].map((wp) => {
                    const active = themeTokens.wallpaper_tint === wp.id;
                    return (
                      <button
                        key={wp.id}
                        type="button"
                        disabled={!canManageSettings}
                        onClick={() =>
                          saveSettingKey('theme_tokens', { ...themeTokens, wallpaper_tint: wp.id }, 'Papel de parede atualizado.')
                        }
                        className={`p-3 rounded-2xl border text-left space-y-2 transition-all ${
                          active ? 'border-[#EC2B82] bg-[#FDF2F6]/50' : 'border-black/10 bg-white'
                        }`}
                      >
                        <div className={`h-14 rounded-xl bg-gradient-to-br ${wp.preview} border border-black/5`} />
                        <p className="text-xs font-semibold text-[#2F1534]">{wp.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#FCF6EC]/65 border border-[#2F1534]/[0.06] space-y-3 max-w-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2F1534]">Intensidade do efeito translúcido</span>
                  <span className="tabular-nums font-semibold text-[#7A689C]">{themeTokens.glass_blur}px</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={36}
                  step={2}
                  value={themeTokens.glass_blur}
                  disabled={!canManageSettings}
                  onChange={(e) => {
                    const nextTokens = { ...themeTokens, glass_blur: Number(e.target.value) };
                    setSettings({ ...settings, theme_tokens: nextTokens });
                    applyStudioTheme({ ...settings, theme_tokens: nextTokens });
                  }}
                  onMouseUp={() => saveSettingKey('theme_tokens', themeTokens)}
                  onTouchEnd={() => saveSettingKey('theme_tokens', themeTokens)}
                  className="w-full accent-[#7A689C]"
                />
              </div>

              <div className="flex items-center justify-between max-w-lg p-4 rounded-2xl bg-[#FCF6EC]/65 border border-[#2F1534]/[0.06] text-xs">
                <span className="font-medium text-[#2F1534]">Modo compacto nos cartões do sistema</span>
                <IosSwitch
                  disabled={!canManageSettings}
                  checked={Boolean(settings.appearance?.compact_density)}
                  onChange={(val) =>
                    saveSettingKey('appearance', { ...settings.appearance, compact_density: val })
                  }
                />
              </div>
            </div>
          )}

          {activeCat === 'tipografia' && settings && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#2F1534]">Tipografia Centralizada</h2>
                  <p className="text-xs text-[#232122]/60 mt-0.5">
                    Cole um link de fonte externa (Google Fonts ou similar) e defina as famílias sem precisar alterar código.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canManageSettings}
                  onClick={() => saveSettingKey('typography', DEFAULT_TYPOGRAPHY, 'Tipografia restaurada para o padrão do sistema.')}
                  className="px-3.5 py-2 rounded-xl border border-black/12 text-xs font-semibold text-[#232122]/75 hover:bg-black/[0.03] inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar padrão
                </button>
              </div>

              <div className="space-y-4 max-w-2xl">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#2F1534]">
                    Link da fonte principal (URL)
                  </label>
                  <input
                    type="url"
                    value={typo.font_css_url}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        typography: { ...typo, font_css_url: e.target.value },
                      })
                    }
                    placeholder="https://fonts.googleapis.com/css2?family=..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                  />
                  <p className="text-[11px] text-[#232122]/55">
                    O link será aplicado automaticamente em todas as telas do sistema.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#2F1534]">Fonte principal (Textos)</label>
                    <input
                      type="text"
                      value={typo.primary_font}
                      onChange={(e) =>
                        setSettings({ ...settings, typography: { ...typo, primary_font: e.target.value } })
                      }
                      placeholder="Ex: Nome da Fonte"
                      className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#2F1534]">Fonte de destaque (Títulos)</label>
                    <input
                      type="text"
                      value={typo.display_font}
                      onChange={(e) =>
                        setSettings({ ...settings, typography: { ...typo, display_font: e.target.value } })
                      }
                      placeholder="Opcional"
                      className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#2F1534]">Fonte Editorial (Destaques)</label>
                    <input
                      type="text"
                      value={typo.editorial_font}
                      onChange={(e) =>
                        setSettings({ ...settings, typography: { ...typo, editorial_font: e.target.value } })
                      }
                      placeholder="Opcional"
                      className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-[#FCF6EC]/65 border border-[#2F1534]/[0.06] space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#2F1534]">Escala base do texto</span>
                      <span className="tabular-nums text-[#7A689C] font-semibold">
                        {Math.round((typo.base_scale || 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.9}
                      max={1.12}
                      step={0.02}
                      value={typo.base_scale || 1}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          typography: { ...typo, base_scale: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-[#EC2B82]"
                    />
                  </div>

                  <div className="p-4 rounded-2xl bg-[#FCF6EC]/65 border border-[#2F1534]/[0.06] space-y-2">
                    <label className="text-xs font-semibold text-[#2F1534]">Espaçamento entre letras</label>
                    <select
                      value={typo.letter_spacing || '-0.015em'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          typography: { ...typo, letter_spacing: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                    >
                      <option value="-0.025em">Compacto (-0.025em)</option>
                      <option value="-0.015em">Equilibrado (-0.015em)</option>
                      <option value="-0.005em">Natural (-0.005em)</option>
                      <option value="0em">Aberto (0em)</option>
                    </select>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-[#F3ECF9]/80 to-[#FDF2F6]/80 border border-[#BC9FE6]/35 space-y-2">
                  <span className="text-[11px] font-semibold text-[#7A689C] inline-flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> Pré-visualização ao vivo
                  </span>
                  <p className="font-editorial text-2xl text-[#2F1534]">
                    Aumi Studio · Gestão Criativa &amp; Editorial
                  </p>
                  <p className="text-sm text-[#232122]/75">
                    Textos funcionais, botões e indicadores seguem automaticamente a escala e a fonte centralizada configuradas aqui.
                  </p>
                </div>

                {canManageSettings && (
                  <button
                    type="button"
                    onClick={() => saveSettingKey('typography', typo, 'Tipografia salva e aplicada em todo o sistema.')}
                    className="px-5 py-2.5 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Aplicar tipografia no sistema
                  </button>
                )}
              </div>
            </div>
          )}

          {activeCat === 'portal' && settings && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Configurações do Portal do Cliente</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Defina regras globais de compartilhamento, envio de arquivos, comentários e aprovações externas.
                </p>
              </div>

              <div className="space-y-1.5 max-w-2xl">
                <label className="text-xs font-semibold text-[#232122]/75">Mensagem padrão de boas-vindas</label>
                <textarea
                  rows={2}
                  value={settings.portal_defaults.welcome_message}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      portal_defaults: { ...settings.portal_defaults, welcome_message: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-black/12 text-sm bg-white"
                />
              </div>

              <div className="space-y-2.5 max-w-xl">
                {[
                  { key: 'allow_client_comments', label: 'Permitir comentários dos clientes nas entregas' },
                  { key: 'allow_client_uploads', label: 'Permitir envio de arquivos e referências pelos clientes' },
                  { key: 'allow_client_approvals', label: 'Habilitar botões de Aprovar / Solicitar ajustes' },
                  { key: 'show_mural_to_clients', label: 'Exibir mural de avisos no portal externo' },
                ].map((opt) => (
                  <div
                    key={opt.key}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#FCF6EC]/60 border border-[#2F1534]/[0.06] text-xs"
                  >
                    <span className="font-medium text-[#2F1534]">{opt.label}</span>
                    <IosSwitch
                      disabled={!canManageSettings}
                      checked={Boolean(settings.portal_defaults[opt.key as keyof StudioSettings['portal_defaults']])}
                      onChange={(checked) =>
                        setSettings({
                          ...settings,
                          portal_defaults: {
                            ...settings.portal_defaults,
                            [opt.key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => saveSettingKey('portal_defaults', settings.portal_defaults)}
                  className="px-5 py-2.5 rounded-xl bg-[#2F1534] text-white text-xs font-semibold"
                >
                  Salvar regras do portal
                </button>
              )}
            </div>
          )}

          {activeCat === 'quadros' && settings && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Colunas padrão e etiquetas dos quadros</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Novos quadros criados no Portal do Cliente herdam automaticamente esta estrutura.
                </p>
              </div>

              {/* Colunas padrão */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-[#2F1534]">Colunas padrão de produção</h3>
                <div className="space-y-2">
                  {settings.default_columns.map((col, idx) => (
                    <div
                      key={idx}
                      className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-[#FCF6EC]/55 border border-black/[0.06]"
                    >
                      <input
                        type="text"
                        value={col.title}
                        onChange={(e) => {
                          const next = [...settings.default_columns];
                          next[idx] = { ...col, title: e.target.value };
                          setSettings({ ...settings, default_columns: next });
                        }}
                        className="flex-1 min-w-[160px] px-3 py-1.5 rounded-xl border border-black/10 bg-white text-xs font-medium"
                      />
                      <div className="inline-flex items-center gap-2 text-[11px] text-[#232122]/75">
                        <span>Visível ao cliente</span>
                        <IosSwitch
                          checked={col.client_visible}
                          onChange={(val) => {
                            const next = [...settings.default_columns];
                            next[idx] = { ...col, client_visible: val };
                            setSettings({ ...settings, default_columns: next });
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            default_columns: settings.default_columns.filter((_, i) => i !== idx),
                          })
                        }
                        className="text-xs text-red-600/75 px-2 font-medium"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    placeholder="Nova coluna padrão..."
                    className="flex-1 px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newColName.trim()) return;
                      setSettings({
                        ...settings,
                        default_columns: [
                          ...settings.default_columns,
                          {
                            title: newColName.trim(),
                            color: '#BC9FE6',
                            client_visible: true,
                            client_label: newColName.trim(),
                          },
                        ],
                      });
                      setNewColName('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-black/[0.06] text-xs font-semibold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                </div>

                {canManageSettings && (
                  <button
                    type="button"
                    onClick={() => saveSettingKey('default_columns', settings.default_columns)}
                    className="px-4 py-2 rounded-xl bg-[#2F1534] text-white text-xs font-semibold"
                  >
                    Salvar colunas padrão
                  </button>
                )}
              </div>

              {/* Etiquetas */}
              <div className="space-y-3 pt-4 border-t border-black/[0.06]">
                <h3 className="text-xs font-semibold text-[#2F1534]">Etiquetas disponíveis</h3>
                <div className="flex flex-wrap gap-2">
                  {settings.labels.map((lbl) => (
                    <span
                      key={lbl.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-2 border border-black/10"
                      style={{ backgroundColor: lbl.color, color: lbl.text }}
                    >
                      {lbl.name}
                      <button
                        type="button"
                        onClick={() =>
                          setSettings({
                            ...settings,
                            labels: settings.labels.filter((l) => l.id !== lbl.id),
                          })
                        }
                        className="opacity-60 hover:opacity-100"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="Nome da etiqueta..."
                    className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  />
                  <select
                    value={newLabelColor}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewLabelColor(val);
                      setNewLabelText(val === '#232122' ? '#FFFFFF' : '#232122');
                    }}
                    className="px-3 py-2 rounded-xl border border-black/12 text-xs bg-white"
                  >
                    <option value="#FDF2F6">Rosa Blush</option>
                    <option value="#F3ECF9">Lilás</option>
                    <option value="#FDF0E8">Laranja Suave</option>
                    <option value="#F4F5E2">Oliva</option>
                    <option value="#232122">Preto</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newLabelName.trim()) return;
                      const updated = [
                        ...settings.labels,
                        { id: `lbl-${Date.now()}`, name: newLabelName.trim(), color: newLabelColor, text: newLabelText },
                      ];
                      setSettings({ ...settings, labels: updated });
                      setNewLabelName('');
                      if (canManageSettings) saveSettingKey('labels', updated);
                    }}
                    className="px-4 py-2 rounded-xl bg-[#EC2B82] text-white text-xs font-semibold"
                  >
                    Criar etiqueta
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeCat === 'notificacoes' && settings && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Sons e notificações</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Controle os efeitos sonoros individuais da sua conta e os alertas do Portal do Cliente.
                </p>
              </div>

              {/* Individual Partner Sound Identity Card (iPhone Settings style) */}
              <div className="max-w-xl rounded-3xl bg-white border border-[#DCC8F4] overflow-hidden shadow-[0_10px_26px_-18px_rgba(47,21,52,0.22)]">
                <div className="px-4 py-3.5 bg-[#EFE5FA] border-b border-[#DCC8F4] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-[#5B8A3C] text-white flex items-center justify-center shrink-0">
                      {soundPrefs.sound_enabled ? (
                        <Volume2 className="w-4 h-4" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#2F1534] truncate">
                        Identidade Sonora · {user.name}
                      </p>
                      <p className="text-[11px] text-[#7A689C]">
                        Preferências salvas individualmente para sua conta
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                      soundPrefs.sound_enabled
                        ? 'bg-[#EAF4DF] text-[#3F6321] border border-[#C8DDAA]'
                        : 'bg-[#FDF0E8] text-[#C6572E] border border-[#F3C8B2]'
                    }`}
                  >
                    {savingSoundPref
                      ? 'Salvando...'
                      : soundPrefs.sound_enabled
                      ? 'Sons ativos'
                      : 'Silenciado'}
                  </span>
                </div>

                <div className="divide-y divide-[#EFE5FA]">
                  {/* Master Mute Toggle (Desativar todos os sons) */}
                  <div className="px-4 py-3.5 flex items-center justify-between gap-4 bg-[#FAF6FE]/60">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-[#2F1534]">Desativar todos os sons</p>
                      <p className="text-[11px] text-[#7A689C] mt-0.5">
                        Silencia imediatamente todos os cliques e alertas sonoros no seu login.
                      </p>
                    </div>
                    <IosSwitch
                      tone="orange"
                      checked={!soundPrefs.sound_enabled}
                      disabled={savingSoundPref}
                      onChange={(muteAll) => handleUpdateSoundPref({ sound_enabled: !muteAll })}
                    />
                  </div>

                  {/* Individual Toggle 1: Confirm Click */}
                  <div
                    className={`px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-opacity ${
                      !soundPrefs.sound_enabled ? 'opacity-55' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#2F1534]">
                        Som de envio e confirmação
                      </p>
                      <p className="text-[11px] text-[#7A689C] mt-0.5">
                        Click curto e suave ao publicar no mural, responder ou concluir uma ação.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => playConfirmClick(user.preferences, true)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#EAF4DF] hover:bg-[#DCECC9] border border-[#C8DDAA] text-[#3F6321] text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Prévia</span>
                      </button>
                      <IosSwitch
                        tone="green"
                        checked={soundPrefs.sound_enabled && soundPrefs.sound_confirm_enabled}
                        disabled={savingSoundPref || !soundPrefs.sound_enabled}
                        onChange={(checked) => {
                          handleUpdateSoundPref({ sound_confirm_enabled: checked });
                          if (checked) {
                            playConfirmClick({ ...user.preferences, sound_enabled: true, sound_confirm_enabled: true });
                          }
                        }}
                      />
                    </div>
                  </div>

                  {/* Individual Toggle 2: Notification Pop */}
                  <div
                    className={`px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 transition-opacity ${
                      !soundPrefs.sound_enabled ? 'opacity-55' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#2F1534]">
                        Som de nova notificação
                      </p>
                      <p className="text-[11px] text-[#7A689C] mt-0.5">
                        Pop delicado ao receber novidades do Portal do Cliente, recados ou demandas.
                      </p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => playNotificationPop(user.preferences, true)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#FDF0E8] hover:bg-[#FBE2D3] border border-[#F3C8B2] text-[#C6572E] text-[11px] font-bold inline-flex items-center gap-1 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Prévia</span>
                      </button>
                      <IosSwitch
                        tone="green"
                        checked={soundPrefs.sound_enabled && soundPrefs.sound_notification_enabled}
                        disabled={savingSoundPref || !soundPrefs.sound_enabled}
                        onChange={(checked) => {
                          handleUpdateSoundPref({ sound_notification_enabled: checked });
                          if (checked) {
                            playNotificationPop({ ...user.preferences, sound_enabled: true, sound_notification_enabled: true });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Existing Global Notification Rules */}
              <div className="max-w-xl space-y-3 pt-2 border-t border-black/[0.06]">
                <div>
                  <h3 className="text-sm font-semibold text-[#2F1534]">Alertas automáticos do estúdio</h3>
                  <p className="text-[11px] text-[#232122]/60">
                    Eventos do Portal do Cliente que disparam notificações no mural e na barra superior.
                  </p>
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FCF6EC]/60 border border-[#2F1534]/[0.06] text-xs">
                  <span className="font-medium text-[#2F1534]">Alertar entregas com vencimento em até (dias)</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={settings.notifications_global.deadline_warning_days}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        notifications_global: {
                          ...settings.notifications_global,
                          deadline_warning_days: Number(e.target.value),
                        },
                      })
                    }
                    className="w-16 px-2 py-1 rounded-lg border border-black/12 bg-white text-center tabular-nums"
                  />
                </div>

                {[
                  { key: 'notify_on_client_upload', label: 'Quando cliente enviar novo conteúdo ou arquivo' },
                  { key: 'notify_on_approval', label: 'Quando cliente aprovar ou solicitar ajustes' },
                  { key: 'notify_on_card_move', label: 'Movimentações e atualizações nos quadros' },
                ].map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#FCF6EC]/60 border border-[#2F1534]/[0.06] text-xs"
                  >
                    <span className="font-medium text-[#2F1534]">{item.label}</span>
                    <IosSwitch
                      tone="green"
                      checked={Boolean(
                        settings.notifications_global[item.key as keyof StudioSettings['notifications_global']]
                      )}
                      onChange={(checked) =>
                        setSettings({
                          ...settings,
                          notifications_global: {
                            ...settings.notifications_global,
                            [item.key]: checked,
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>

              {canManageSettings && (
                <button
                  type="button"
                  onClick={() => {
                    saveSettingKey('notifications_global', settings.notifications_global);
                    playConfirmClick(user.preferences);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#2F1534] text-white text-xs font-semibold"
                >
                  Salvar alertas do estúdio
                </button>
              )}
            </div>
          )}

          {activeCat === 'integracoes' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-[#2F1534]">Integrações &amp; Fluxos Conectados</h2>
                <p className="text-xs text-[#232122]/60 mt-0.5">
                  Recursos nativos integrados ao ambiente do Aumi Studio.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-[#2F1534]/[0.08] bg-[#FCF6EC]/50 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#2F1534]">
                    <Link2 className="w-4 h-4 text-[#EC2B82]" />
                    <h3 className="text-sm font-semibold">Links Seguros de Copy</h3>
                  </div>
                  <p className="text-xs text-[#232122]/70 leading-relaxed">
                    Cada copy gerada no estúdio possui um link exclusivo de acesso com verificação de conta autenticada e ocultação automática de anotações internas.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-[#2F1534]/[0.08] bg-[#F3ECF9]/45 space-y-2">
                  <div className="flex items-center gap-2.5 text-[#2F1534]">
                    <FolderLock className="w-4 h-4 text-[#7A689C]" />
                    <h3 className="text-sm font-semibold">Portal Externo Isolado</h3>
                  </div>
                  <p className="text-xs text-[#232122]/70 leading-relaxed">
                    Contas de clientes acessam somente seus próprios quadros, copies compartilhadas e avisos públicos, mantendo o Financeiro e a Sociedade 100% restritos às sócias.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-[#2F1534]/[0.08] bg-white space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2.5 text-[#2F1534]">
                    <Database className="w-4 h-4 text-[#E1754C]" />
                    <h3 className="text-sm font-semibold">Integração Automática Serviços → Quadros → Financeiro → Sociedade</h3>
                  </div>
                  <p className="text-xs text-[#232122]/70 leading-relaxed">
                    Ao criar um quadro com pacote de serviço, os entregáveis geram cartões no Kanban, o lançamento financeiro pode ser criado automaticamente e os pagamentos confirmados alimentam a divisão societária de Ingrid e Mariana.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeCat === 'sistema' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#2F1534]">Dados e sistema</h2>
                  <p className="text-xs text-[#232122]/60 mt-0.5">
                    Backup completo do banco de dados e registro de auditoria das ações no estúdio.
                  </p>
                </div>

                {canManageSettings && (
                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="px-4 py-2.5 rounded-xl bg-[#2F1534] hover:bg-[#232122] text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar backup JSON</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[#2F1534]">Histórico recente de auditoria</h3>
                <div className="rounded-2xl border border-black/[0.08] divide-y divide-black/[0.05] max-h-96 overflow-y-auto bg-white">
                  {logs.map((log) => (
                    <div key={log.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <span className="font-semibold text-[#2F1534]">{log.actor_name}</span>{' '}
                        <span className="text-[#232122]/75">{log.details || formatActivityActionPT(log.action)}</span>
                      </div>
                      <span className="text-[11px] text-[#232122]/45 shrink-0">{formatRelativeTime(log.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
