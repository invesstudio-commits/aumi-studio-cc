import React, { useEffect, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  ArrowRight,
  KeyRound,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  Lock,
  ShieldCheck,
  Users,
  Sparkles,
  Check,
  FolderKanban,
  Palette,
  Calendar,
  Mail,
} from 'lucide-react';
import { api, setAuthToken, setClientPortalToken } from '../lib/api.ts';
import { signInWithGoogleForAumi } from '../lib/firebaseAuth.ts';
import { User } from '../types/aumi.ts';
import { AumiWordmark, AumiLogoMark, GlassFolderGraphic } from './AumiBrand.tsx';

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
  hasSharedCopyLink?: boolean;
  hasSharedBoardLink?: boolean;
  clientOnlyMode?: boolean;
  initialClientEmail?: string | null;
}

const LOGIN_PREFS_STORAGE_KEY = 'aumi_login_remember_prefs_v1';

const PARTNER_PROFILES = [
  {
    key: 'ingrid',
    name: 'Ingrid',
    role: 'Sócia · Direção Criativa',
    email: 'ingrid@aumistudio.com',
    initial: 'I',
    accentBg: 'from-[#EC2B82] to-[#EC97B7]',
    cardActive:
      'bg-gradient-to-br from-[#FDF2F6] via-white to-[#FCE7F3] border-[#EC2B82] ring-2 ring-[#EC2B82]/25 shadow-[0_14px_30px_-14px_rgba(236,43,130,0.42)]',
    cardIdle:
      'bg-white/75 hover:bg-white/95 border-white/90 hover:border-[#EC97B7]/80 shadow-[0_8px_20px_-12px_rgba(47,21,52,0.16)]',
    badgeClass: 'bg-[#FDF2F6] text-[#EC2B82] border-[#EC97B7]/45',
  },
  {
    key: 'mariana',
    name: 'Mariana',
    role: 'Sócia · Estratégia & Gestão',
    email: 'mariana@aumistudio.com',
    initial: 'M',
    accentBg: 'from-[#7A689C] to-[#BC9FE6]',
    cardActive:
      'bg-gradient-to-br from-[#F3ECF9] via-white to-[#EDE5FB] border-[#7A689C] ring-2 ring-[#7A689C]/25 shadow-[0_14px_30px_-14px_rgba(122,104,156,0.42)]',
    cardIdle:
      'bg-white/75 hover:bg-white/95 border-white/90 hover:border-[#BC9FE6]/80 shadow-[0_8px_20px_-12px_rgba(47,21,52,0.16)]',
    badgeClass: 'bg-[#F3ECF9] text-[#7A689C] border-[#BC9FE6]/50',
  },
] as const;

function GoogleLogoG() {
  return (
    <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function LoginScreen({
  onLoginSuccess,
  hasSharedCopyLink = false,
  hasSharedBoardLink = false,
  clientOnlyMode = false,
  initialClientEmail = null,
}: LoginScreenProps) {
  const [audience, setAudience] = useState<'team' | 'client'>(
    clientOnlyMode || hasSharedBoardLink || hasSharedCopyLink ? 'client' : 'team'
  );
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState(initialClientEmail || '');
  const [password, setPassword] = useState('');
  const [clientPin, setClientPin] = useState('');
  const [rememberAccess, setRememberAccess] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [generatedCodeNotice, setGeneratedCodeNotice] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Restore remembered email & audience preference on mount
  useEffect(() => {
    if (clientOnlyMode) {
      setAudience('client');
      if (initialClientEmail) setEmail(initialClientEmail);
      return;
    }
    try {
      const raw = window.localStorage.getItem(LOGIN_PREFS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { email?: string; audience?: 'team' | 'client'; remember?: boolean };
      if (parsed.remember) {
        setRememberAccess(true);
        if (parsed.email && !initialClientEmail) setEmail(parsed.email);
        if (parsed.audience && !hasSharedBoardLink && !hasSharedCopyLink) {
          setAudience(parsed.audience);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [hasSharedBoardLink, hasSharedCopyLink, clientOnlyMode, initialClientEmail]);

  function persistRememberChoice(targetEmail: string, targetAudience: 'team' | 'client', shouldRemember: boolean) {
    if (clientOnlyMode) return;
    try {
      if (shouldRemember && targetEmail.trim()) {
        window.localStorage.setItem(
          LOGIN_PREFS_STORAGE_KEY,
          JSON.stringify({ email: targetEmail.trim(), audience: targetAudience, remember: true })
        );
      } else {
        window.localStorage.removeItem(LOGIN_PREFS_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (audience === 'client') {
      const cleanPin = clientPin.replace(/\D/g, '').trim();
      if (!email.trim() || cleanPin.length < 4) {
        setError('Informe seu e-mail cadastrado e o PIN numérico de 4 a 6 dígitos.');
        return;
      }
      setLoading(true);
      try {
        const res = await api<{ token: string; user: User }>('/auth/client-pin-login', {
          method: 'POST',
          body: JSON.stringify({ email: email.trim(), pin: cleanPin }),
        });
        setClientPortalToken(res.token);
        onLoginSuccess(res.user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível acessar seu portal.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      setError('Preencha seu e-mail e senha para entrar.');
      return;
    }

    setLoading(true);
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      persistRememberChoice(email, audience, rememberAccess);
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setSuccessMsg('');
    setGoogleLoading(true);
    try {
      const googleRes = await signInWithGoogleForAumi();
      if (!googleRes.accessToken && !googleRes.idToken) {
        setError('Não foi possível obter a credencial do Google.');
        return;
      }
      const res = await api<{ token: string; user: User }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          access_token: googleRes.accessToken || undefined,
          id_token: googleRes.idToken || undefined,
        }),
      });
      if (res.user?.email) {
        persistRememberChoice(res.user.email, audience, rememberAccess);
      }
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao entrar com Google.';
      if (!message.includes('popup-closed-by-user')) {
        setError(message);
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!email.trim()) {
      setError('Informe o e-mail da sua conta.');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; message: string; verification_code?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      if (res.verification_code) {
        setGeneratedCodeNotice(res.verification_code);
      }
      setSuccessMsg(res.message);
      setMode('reset');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar recuperação.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!resetCode.trim() || !newPassword) {
      setError('Informe o código de verificação e a nova senha.');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          code: resetCode.trim(),
          new_password: newPassword,
        }),
      });
      setSuccessMsg(res.message);
      setPassword('');
      setResetCode('');
      setNewPassword('');
      setGeneratedCodeNotice('');
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao redefinir senha.');
    } finally {
      setLoading(false);
    }
  }

  function selectPartnerProfile(partnerEmail: string) {
    setAudience('team');
    setEmail(partnerEmail);
    setError('');
    setTimeout(() => passwordInputRef.current?.focus(), 40);
  }

  const normalizedEmail = email.trim().toLowerCase();
  const selectedPartner = PARTNER_PROFILES.find((p) => p.email === normalizedEmail) || null;

  return (
    <div className="min-h-screen aumi-login-backdrop relative overflow-hidden flex items-center justify-center p-3 sm:p-6">
      {/* Ambient floating color orbs matching Home identity */}
      <div
        className="pointer-events-none fixed -top-28 -left-24 w-[420px] h-[420px] rounded-full opacity-55 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(236,43,130,0.34) 0%, rgba(236,151,183,0.2) 55%, transparent 75%)' }}
      />
      <div
        className="pointer-events-none fixed -bottom-32 -right-24 w-[460px] h-[460px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(122,104,156,0.42) 0%, rgba(188,159,230,0.28) 55%, transparent 75%)' }}
      />
      <div
        className="pointer-events-none fixed bottom-12 left-1/3 w-[320px] h-[320px] rounded-full opacity-45 blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(218,217,148,0.45) 0%, rgba(225,117,76,0.2) 60%, transparent 80%)' }}
      />

      {/* Main macOS Liquid Glass Window */}
      <div className="relative z-10 w-full max-w-[1060px] aumi-finder-window rounded-[32px] overflow-hidden flex flex-col">
        {/* macOS Top Window Chrome Bar */}
        <div className="aumi-finder-chrome px-5 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="w-3 h-3 rounded-full bg-[#FF5F57] border border-black/10 shadow-xs" />
              <span className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-black/10 shadow-xs" />
              <span className="w-3 h-3 rounded-full bg-[#28C840] border border-black/10 shadow-xs" />
            </div>
            <div className="h-4 w-px bg-[#7A689C]/20 hidden sm:block" />
            <div className="flex items-center gap-2">
              <AumiLogoMark size={18} />
              <span className="text-xs font-bold text-[#2F1534]">Aumi Studio</span>
              <span className="hidden sm:inline text-xs text-[#7A689C]">
                {clientOnlyMode ? '· Portal Exclusivo do Cliente' : '· Acesso ao Sistema'}
              </span>
            </div>
          </div>

          {/* macOS Segmented Glass Control: Equipe Aumi / Cliente (hidden in exclusive client link mode) */}
          {clientOnlyMode ? (
            <span className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#EC2B82] to-[#E1754C] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0">
              <Users className="w-3.5 h-3.5 text-[#FCF6EC]" />
              <span>Portal do Cliente</span>
            </span>
          ) : (
            <div className="inline-flex p-1 rounded-2xl aumi-liquid-control">
              <button
                type="button"
                onClick={() => {
                  setAudience('team');
                  setError('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  audience === 'team'
                    ? 'bg-gradient-to-r from-[#2F1534] to-[#7A689C] text-white shadow-sm'
                    : 'text-[#2F1534]/70 hover:text-[#2F1534]'
                }`}
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${audience === 'team' ? 'text-[#DAD994]' : 'text-[#EC2B82]'}`} />
                <span>Equipe Aumi</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAudience('client');
                  setError('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  audience === 'client'
                    ? 'bg-gradient-to-r from-[#EC2B82] to-[#E1754C] text-white shadow-sm'
                    : 'text-[#2F1534]/70 hover:text-[#2F1534]'
                }`}
              >
                <Users className={`w-3.5 h-3.5 ${audience === 'client' ? 'text-[#FCF6EC]' : 'text-[#7A689C]'}`} />
                <span>Portal do Cliente</span>
              </button>
            </div>
          )}
        </div>

        {/* Window Split Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* LEFT STAGE — Aligned with DashboardHome's Purple/Plum/Pink/Lilac Hero Identity */}
          <div className="lg:col-span-5 bg-gradient-to-br from-[#7A689C] via-[#5C447E] to-[#2F1534] text-white p-6 sm:p-8 lg:p-9 flex flex-col justify-between relative overflow-hidden">
            {/* Specular soft glows */}
            <div
              className="absolute -top-20 -right-20 w-72 h-72 rounded-full pointer-events-none opacity-65"
              style={{ background: 'radial-gradient(circle, rgba(236,151,183,0.52) 0%, rgba(236,43,130,0.18) 55%, transparent 72%)' }}
            />
            <div
              className="absolute -bottom-24 -left-16 w-72 h-72 rounded-full pointer-events-none opacity-55"
              style={{ background: 'radial-gradient(circle, rgba(225,117,76,0.34) 0%, rgba(218,217,148,0.22) 55%, transparent 74%)' }}
            />

            <div className="relative z-10 flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/14 backdrop-blur-md border border-white/20">
                <AumiLogoMark size={20} />
                <span className="text-sm font-bold tracking-tight text-white">Aumi Studio</span>
              </div>
              <span className="px-3 py-1 rounded-full bg-white/15 border border-white/25 text-[11px] font-semibold text-[#FCF6EC] inline-flex items-center gap-1.5 backdrop-blur-md">
                <Sparkles className="w-3 h-3 text-[#DAD994]" />
                {audience === 'team' ? 'Área Interna' : 'Espaço do Cliente'}
              </span>
            </div>

            <div className="relative z-10 my-7 lg:my-9 space-y-4">
              <div className="flex items-center gap-4">
                <GlassFolderGraphic
                  color={audience === 'team' ? '#EC97B7' : '#BC9FE6'}
                  size={66}
                  initials={audience === 'team' ? 'AS' : 'CL'}
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#DAD994]">
                    {audience === 'team' ? 'Gestão Criativa Integrada' : 'Acompanhamento em Tempo Real'}
                  </p>
                  <h1
                    className="font-editorial text-2xl sm:text-[30px] leading-[1.08] text-white mt-1"
                    style={{ textWrap: 'balance' }}
                  >
                    {audience === 'team'
                      ? 'Seu estúdio criativo em um ambiente fluido.'
                      : 'Seu projeto, artes e entregas em um só lugar.'}
                  </h1>
                </div>
              </div>

              <p className="text-[13px] leading-relaxed text-white/80">
                {audience === 'team'
                  ? 'Conecte-se para gerenciar clientes, quadros Kanban, aprovações de artes, financeiro e sociedade com a identidade visual do estúdio.'
                  : 'Visualize o mural do projeto, aprove artes com facilidade, acompanhe etapas no Kanban e consulte seus documentos.'}
              </p>

              {/* Colorful Apple-style Feature Glass Tiles */}
              <div className="grid grid-cols-3 gap-2.5 pt-2">
                <div className="rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 p-3 space-y-2">
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#EC2B82] to-[#EC97B7] text-white flex items-center justify-center shadow-sm">
                    <FolderKanban className="w-4 h-4" />
                  </span>
                  <p className="text-[11px] font-bold text-white leading-tight">Portal & Kanban</p>
                </div>
                <div className="rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 p-3 space-y-2">
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E1754C] to-[#DAD994] text-[#2F1534] flex items-center justify-center shadow-sm">
                    <Palette className="w-4 h-4" />
                  </span>
                  <p className="text-[11px] font-bold text-white leading-tight">Aprovação de Artes</p>
                </div>
                <div className="rounded-2xl bg-white/12 backdrop-blur-md border border-white/20 p-3 space-y-2">
                  <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#BC9FE6] to-[#7A689C] text-white flex items-center justify-center shadow-sm">
                    <Calendar className="w-4 h-4" />
                  </span>
                  <p className="text-[11px] font-bold text-white leading-tight">Prazos & Mural</p>
                </div>
              </div>
            </div>

            <div className="relative z-10 pt-4 border-t border-white/15 flex items-center justify-between text-[11px] text-white/70">
              <span>Ingrid &amp; Mariana · Aumi Studio</span>
              <span className="px-2 py-0.5 rounded-lg bg-white/10 text-[#FCF6EC] font-semibold">
                {audience === 'team' ? 'Equipe' : 'Cliente'}
              </span>
            </div>
          </div>

          {/* RIGHT INTERACTION PANE — Glass Surface with Side-by-Side Profiles & Auth Form */}
          <div className="lg:col-span-7 p-6 sm:p-8 lg:p-9 bg-gradient-to-br from-[#FCF6EC]/70 via-white/82 to-[#FDF2F6]/75 backdrop-blur-xl flex items-center justify-center">
            <div className="w-full max-w-[470px] space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="lg:hidden mb-2">
                    <AumiWordmark />
                  </div>
                  <h2 className="font-editorial text-[28px] leading-tight text-[#2F1534]">
                    {mode === 'login' && (audience === 'team' ? 'Quem vai entrar agora?' : 'Acesse seu Portal')}
                    {mode === 'forgot' && 'Recuperar senha'}
                    {mode === 'reset' && 'Definir nova senha'}
                  </h2>
                  <p className="text-xs sm:text-[13px] text-[#232122]/65">
                    {mode === 'login' &&
                      (audience === 'team'
                        ? 'Selecione seu perfil abaixo ou entre com sua conta da equipe.'
                        : 'Digite seu e-mail e o PIN numérico de 4 a 6 dígitos enviado pelo estúdio.')}
                    {mode === 'forgot' && 'Informe o e-mail cadastrado para gerar seu código de verificação.'}
                    {mode === 'reset' && 'Digite o código de 6 dígitos recebido e escolha uma nova senha.'}
                  </p>
                </div>
              </div>

              {/* Shared link banners (preserved) */}
              {hasSharedCopyLink && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#F3ECF9]/90 border border-[#BC9FE6]/60 text-xs text-[#2F1534] shadow-xs">
                  <Lock className="w-4 h-4 text-[#7A689C] shrink-0 mt-0.5" />
                  <span>
                    Você recebeu um link privado de copy compartilhada. Entre com seu login para visualizar e aprovar com segurança.
                  </span>
                </div>
              )}

              {hasSharedBoardLink && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#FDF2F6]/90 border border-[#EC97B7]/65 text-xs text-[#2F1534] shadow-xs">
                  <Lock className="w-4 h-4 text-[#EC2B82] shrink-0 mt-0.5" />
                  <span>
                    Você recebeu um convite para acessar seu quadro de entregas no Aumi Studio. Informe seu e-mail e PIN de acesso para abrir o projeto.
                  </span>
                </div>
              )}

              {/* SIDE-BY-SIDE PARTNER PROFILES (Prominent, tactile macOS glass cards) */}
              {mode === 'login' && audience === 'team' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A689C]">
                      Perfis da equipe
                    </span>
                    <span className="text-[11px] text-[#232122]/55">
                      Senha inicial: <span className="font-mono font-semibold text-[#2F1534]">aumi2026</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {PARTNER_PROFILES.map((profile) => {
                      const isSelected = normalizedEmail === profile.email;
                      return (
                        <button
                          key={profile.key}
                          type="button"
                          onClick={() => selectPartnerProfile(profile.email)}
                          className={`group relative text-left p-3.5 rounded-2xl border transition-all duration-200 ${
                            isSelected ? profile.cardActive : profile.cardIdle
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${profile.accentBg} text-white font-extrabold text-base flex items-center justify-center shadow-sm border border-white/60 transition-transform group-hover:scale-105`}
                            >
                              {profile.initial}
                            </span>
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all ${
                                isSelected
                                  ? 'bg-[#2F1534] text-[#DAD994] border-[#2F1534] scale-100'
                                  : 'bg-white/80 text-transparent border-[#7A689C]/25'
                              }`}
                              aria-hidden="true"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          </div>

                          <div className="mt-3 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-extrabold text-[#2F1534] truncate">{profile.name}</p>
                              {isSelected && (
                                <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold ${profile.badgeClass}`}>
                                  Ativo
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-medium text-[#7A689C] truncate mt-0.5">{profile.role}</p>
                            <p className="text-[10.5px] text-[#232122]/55 truncate mt-1">{profile.email}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Error / Success Alerts */}
              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#FDF2F6] border border-[#EC2B82]/35 text-xs sm:text-sm text-[#A9195A] shadow-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-[#EC2B82]" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-[#F4F5E2] border border-[#C8C978]/60 text-xs sm:text-sm text-[#3E4113] shadow-xs">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[#6F731D]" />
                  <div className="space-y-1">
                    <p>{successMsg}</p>
                    {generatedCodeNotice && (
                      <p className="text-xs font-medium">
                        Código de verificação:{' '}
                        <span className="font-mono font-bold tracking-wider">{generatedCodeNotice}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* LOGIN FORM */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="rounded-2xl bg-white/75 border border-white/95 p-4 space-y-3.5 shadow-[0_10px_28px_-16px_rgba(47,21,52,0.16)]">
                    <div className="space-y-1.5">
                      <label htmlFor="login-email" className="block text-xs font-bold text-[#2F1534]">
                        E-mail de acesso
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-[#7A689C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder={audience === 'team' ? 'voce@aumistudio.com' : 'contato@suaempresa.com'}
                          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white/95 text-sm text-[#232122] placeholder:text-[#232122]/35 focus:outline-none focus:border-[#EC2B82] focus:ring-2 focus:ring-[#EC97B7]/35 transition-all"
                        />
                      </div>
                    </div>

                    {audience === 'client' ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="login-client-pin" className="block text-xs font-bold text-[#2F1534]">
                            PIN de acesso (4 a 6 números)
                          </label>
                          <span className="text-[11px] font-medium text-[#7A689C]">Enviado pelo estúdio</span>
                        </div>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-[#EC2B82] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="login-client-pin"
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={clientPin}
                            onChange={(e) => setClientPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="Ex: 482915"
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white/95 text-base font-mono font-bold tracking-[0.25em] text-[#2F1534] placeholder:text-[#232122]/30 placeholder:tracking-normal placeholder:font-sans placeholder:font-normal focus:outline-none focus:border-[#EC2B82] focus:ring-2 focus:ring-[#EC97B7]/35 transition-all"
                          />
                        </div>
                        <p className="text-[11px] text-[#7A689C]">
                          Você terá acesso exclusivo aos seus projetos, aprovações e arquivos no Aumi Studio.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label htmlFor="login-password" className="block text-xs font-bold text-[#2F1534]">
                            Senha
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setMode('forgot');
                              setError('');
                              setSuccessMsg('');
                            }}
                            className="text-xs font-semibold text-[#7A689C] hover:text-[#EC2B82] transition-colors"
                          >
                            Redefinir / Esqueci minha senha
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-[#EC2B82] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            ref={passwordInputRef}
                            id="login-password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={selectedPartner ? `Digite a senha de ${selectedPartner.name}` : 'Digite sua senha'}
                            className="w-full pl-10 pr-11 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white/95 text-sm text-[#232122] placeholder:text-[#232122]/35 focus:outline-none focus:border-[#EC2B82] focus:ring-2 focus:ring-[#EC97B7]/35 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Ocultar senha' : 'Visualizar senha'}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#7A689C] hover:text-[#2F1534] transition-colors"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Remember access option (partners only) */}
                    {audience === 'team' && (
                      <div className="flex items-center justify-between pt-0.5">
                        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={rememberAccess}
                            onChange={(e) => {
                              const next = e.target.checked;
                              setRememberAccess(next);
                              if (!next) {
                                persistRememberChoice('', audience, false);
                              }
                            }}
                            className="w-4 h-4 rounded border-[#7A689C]/40 accent-[#EC2B82] cursor-pointer"
                          />
                          <span className="text-xs font-medium text-[#2F1534]/80">
                            Lembrar meu perfil neste dispositivo
                          </span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Primary Liquid Glass Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || googleLoading}
                    className={`w-full py-3 px-5 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                      audience === 'client'
                        ? 'aumi-liquid-pink-pill hover:brightness-105'
                        : 'bg-gradient-to-r from-[#2F1534] via-[#5C447E] to-[#EC2B82] hover:brightness-110 shadow-[0_14px_28px_-12px_rgba(47,21,52,0.55)] border border-white/25'
                    }`}
                  >
                    <span>
                      {loading
                        ? 'Entrando...'
                        : audience === 'client'
                        ? 'Acessar meu Portal do Cliente'
                        : selectedPartner
                        ? `Entrar como ${selectedPartner.name}`
                        : 'Entrar no Aumi Studio'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {audience === 'team' && (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-[#7A689C]/15" />
                        <span className="text-[11px] font-semibold text-[#7A689C]">ou conecte com</span>
                        <div className="h-px flex-1 bg-[#7A689C]/15" />
                      </div>

                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading || googleLoading}
                        className="w-full h-11 px-4 rounded-2xl aumi-liquid-control hover:bg-white text-[#2F1534] text-sm font-semibold flex items-center justify-center gap-3 transition-all disabled:opacity-60"
                      >
                        <GoogleLogoG />
                        <span>{googleLoading ? 'Conectando ao Google...' : 'Continuar com Google'}</span>
                      </button>
                    </>
                  )}
                </form>
              )}

              {/* FORGOT PASSWORD FORM */}
              {mode === 'forgot' && (
                <form
                  onSubmit={handleForgot}
                  className="rounded-2xl bg-white/80 border border-white/95 p-5 space-y-4 shadow-[0_10px_28px_-16px_rgba(47,21,52,0.16)]"
                >
                  <div className="space-y-1.5">
                    <label htmlFor="forgot-email" className="block text-xs font-bold text-[#2F1534]">
                      E-mail cadastrado
                    </label>
                    <input
                      id="forgot-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ingrid@aumistudio.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82] focus:ring-2 focus:ring-[#EC97B7]/35"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-5 rounded-2xl bg-gradient-to-r from-[#2F1534] to-[#7A689C] hover:brightness-110 text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-60 shadow-sm"
                  >
                    <KeyRound className="w-4 h-4 text-[#DAD994]" />
                    <span>{loading ? 'Gerando código...' : 'Gerar código de recuperação'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setSuccessMsg('');
                    }}
                    className="w-full py-2 text-xs font-semibold text-[#7A689C] hover:text-[#2F1534] flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </form>
              )}

              {/* RESET PASSWORD FORM */}
              {mode === 'reset' && (
                <form
                  onSubmit={handleReset}
                  className="rounded-2xl bg-white/80 border border-white/95 p-5 space-y-4 shadow-[0_10px_28px_-16px_rgba(47,21,52,0.16)]"
                >
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#2F1534]">E-mail</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#2F1534]">Código de 6 dígitos</label>
                    <input
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="000000"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white text-sm font-mono tracking-widest text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-[#2F1534]">Nova senha (mín. 6 caracteres)</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Digite a nova senha"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#7A689C]/20 bg-white text-sm text-[#232122] focus:outline-none focus:border-[#EC2B82]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-5 rounded-2xl aumi-liquid-pink-pill text-white text-sm font-bold transition-all disabled:opacity-60"
                  >
                    {loading ? 'Salvando...' : 'Redefinir senha'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="w-full py-2 text-xs font-semibold text-[#7A689C] hover:text-[#2F1534]"
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
