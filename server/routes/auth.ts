import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, sanitizeUser, signToken } from '../middleware.ts';
import { DbUser } from '../types.ts';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Informe seu e-mail e senha para entrar.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail) as DbUser | undefined;

  if (!userRow) {
    res.status(401).json({ error: 'Nenhuma conta encontrada com este e-mail.' });
    return;
  }

  if (!userRow.active) {
    res.status(403).json({ error: 'Esta conta está desativada. Contate a administração do estúdio.' });
    return;
  }

  const valid = bcrypt.compareSync(password, userRow.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Senha incorreta. Tente novamente ou recupere sua senha.' });
    return;
  }

  const nowIso = new Date().toISOString();
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso, userRow.id);

  const token = signToken(userRow.id);
  const safeUser = sanitizeUser(userRow);

  res.cookie('aumi_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });

  logActivity(
    safeUser.id,
    safeUser.name,
    'login',
    'user',
    safeUser.id,
    `Acesso ao sistema (${safeUser.role === 'partner' ? 'sócia' : 'cliente'})`
  );
  res.json({ token, user: safeUser });
});

router.post('/google', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
    const { access_token, id_token } = req.body as { access_token?: string; id_token?: string };
    const effectiveAccessToken = access_token || bearerToken;

    if (!effectiveAccessToken && !id_token) {
      res.status(400).json({ error: 'Token Google não informado.' });
      return;
    }

    let verifiedEmail = '';
    let emailVerified = false;
    let googlePicture: string | undefined;

    if (effectiveAccessToken) {
      const gRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${effectiveAccessToken}` },
      });
      if (!gRes.ok) {
        res.status(401).json({ error: 'Não foi possível validar o token Google.' });
        return;
      }
      const gData = (await gRes.json()) as { email?: string; email_verified?: boolean; picture?: string };
      verifiedEmail = (gData.email || '').trim().toLowerCase();
      emailVerified = Boolean(gData.email_verified);
      googlePicture = gData.picture;
    } else if (id_token) {
      const tRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`);
      if (!tRes.ok) {
        res.status(401).json({ error: 'Token Google inválido ou expirado.' });
        return;
      }
      const tData = (await tRes.json()) as { email?: string; email_verified?: string | boolean; picture?: string };
      verifiedEmail = (tData.email || '').trim().toLowerCase();
      emailVerified = tData.email_verified === true || tData.email_verified === 'true';
      googlePicture = tData.picture;
    }

    if (!verifiedEmail || !emailVerified) {
      res.status(401).json({ error: 'E-mail Google não verificado.' });
      return;
    }

    const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(verifiedEmail) as DbUser | undefined;
    if (!userRow) {
      res.status(403).json({
        error: `Nenhuma conta do Aumi Studio encontrada para ${verifiedEmail}. Utilize o e-mail cadastrado na equipe ou atualize seu e-mail em Configurações.`,
      });
      return;
    }

    if (!userRow.active) {
      res.status(403).json({ error: 'Esta conta está desativada. Contate a administração do estúdio.' });
      return;
    }

    const nowIso = new Date().toISOString();
    if (!userRow.avatar_url && googlePicture) {
      db.prepare('UPDATE users SET last_seen_at = ?, avatar_url = ? WHERE id = ?').run(nowIso, googlePicture, userRow.id);
      userRow.avatar_url = googlePicture;
    } else {
      db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(nowIso, userRow.id);
    }

    const token = signToken(userRow.id);
    const safeUser = sanitizeUser(userRow);

    res.cookie('aumi_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    logActivity(safeUser.id, safeUser.name, 'login_google', 'user', safeUser.id, `Acesso via Google (${safeUser.role})`);
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error('[auth/google] error:', err);
    res.status(500).json({ error: 'Erro ao autenticar com o Google.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('aumi_token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req: AuthRequest, res) => {
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(new Date().toISOString(), req.user!.id);
  res.json({ user: req.user });
});

router.post('/forgot-password', (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'Informe o e-mail cadastrado.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? AND active = 1').get(normalizedEmail) as DbUser | undefined;

  if (!userRow) {
    res.status(404).json({ error: 'Não encontramos uma conta ativa com este e-mail.' });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(userRow.id);
  db.prepare(`
    INSERT INTO password_resets (id, user_id, code, expires_at, used, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(uid('rst'), userRow.id, code, expiresAt, now.toISOString());

  logActivity(userRow.id, userRow.name, 'password_reset_request', 'user', userRow.id, 'Solicitou código de recuperação');

  res.json({
    ok: true,
    message: 'Código de verificação gerado com validade de 30 minutos.',
    verification_code: code,
  });
});

router.post('/reset-password', (req, res) => {
  const { email, code, new_password } = req.body as {
    email?: string;
    code?: string;
    new_password?: string;
  };

  if (!email || !code || !new_password) {
    res.status(400).json({ error: 'Preencha e-mail, código de verificação e nova senha.' });
    return;
  }

  if (new_password.length < 6) {
    res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(email.trim().toLowerCase()) as DbUser | undefined;
  if (!userRow) {
    res.status(404).json({ error: 'Conta não encontrada.' });
    return;
  }

  const resetRow = db
    .prepare('SELECT * FROM password_resets WHERE user_id = ? AND code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1')
    .get(userRow.id, code.trim()) as { id: string; expires_at: string } | undefined;

  if (!resetRow) {
    res.status(400).json({ error: 'Código de verificação inválido.' });
    return;
  }

  if (new Date(resetRow.expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'Este código expirou. Solicite um novo código.' });
    return;
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, userRow.id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(resetRow.id);

  logActivity(userRow.id, userRow.name, 'password_reset', 'user', userRow.id, 'Redefiniu a senha via código de recuperação');
  res.json({ ok: true, message: 'Senha redefinida com sucesso. Você já pode entrar.' });
});

router.put('/profile', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { name, email, title, bio, avatar_url, preferences } = req.body as {
    name?: string;
    email?: string;
    title?: string;
    bio?: string;
    avatar_url?: string | null;
    preferences?: Record<string, unknown>;
  };

  if (email && email.trim().toLowerCase() !== user.email.toLowerCase()) {
    const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(email.trim().toLowerCase(), user.id);
    if (existing) {
      res.status(400).json({ error: 'Este e-mail já está em uso por outra conta.' });
      return;
    }
  }

  const nextPrefs = preferences ? { ...user.preferences, ...preferences } : user.preferences;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET name = ?, email = ?, title = ?, bio = ?, avatar_url = ?, preferences_json = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name?.trim() || user.name,
    email?.trim().toLowerCase() || user.email,
    title !== undefined ? title.trim() : user.title,
    bio !== undefined ? bio.trim() : user.bio,
    avatar_url !== undefined ? avatar_url : user.avatar_url,
    JSON.stringify(nextPrefs),
    now,
    user.id
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  logActivity(user.id, updated.name, 'update_profile', 'user', user.id, 'Atualizou informações do perfil');
  res.json({ user: sanitizeUser(updated) });
});

router.put('/password', requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  const { current_password, new_password } = req.body as { current_password?: string; new_password?: string };

  if (!current_password || !new_password) {
    res.status(400).json({ error: 'Informe a senha atual e a nova senha.' });
    return;
  }

  if (new_password.length < 6) {
    res.status(400).json({ error: 'A nova senha deve ter no mínimo 6 caracteres.' });
    return;
  }

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as DbUser;
  if (!bcrypt.compareSync(current_password, userRow.password_hash)) {
    res.status(400).json({ error: 'A senha atual informada está incorreta.' });
    return;
  }

  const nextHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(nextHash, new Date().toISOString(), user.id);

  logActivity(user.id, user.name, 'change_password', 'user', user.id, 'Alterou a senha da conta');
  res.json({ ok: true, message: 'Senha atualizada com sucesso.' });
});

export default router;
