import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db, DEFAULT_PREFERENCES, logActivity, uid } from '../db.ts';
import { AuthRequest, requireAuth, sanitizeUser, signClientLinkToken, signToken } from '../middleware.ts';
import { DbUser } from '../types.ts';

const router = Router();

// Direct external client portal authentication via unique client portal_token or board share_token
router.post('/client-link', (req, res) => {
  const { portal_token, board_token } = req.body as {
    portal_token?: string;
    board_token?: string;
  };

  const cleanPortal = typeof portal_token === 'string' ? portal_token.trim() : '';
  const cleanBoard = typeof board_token === 'string' ? board_token.trim() : '';

  if (!cleanPortal && !cleanBoard) {
    res.status(400).json({ error: 'Link de acesso do cliente não informado.' });
    return;
  }

  let clientRow:
    | {
        id: string;
        name: string;
        company: string;
        email: string;
        avatar_url: string | null;
        portal_enabled: number;
        portal_token: string | null;
        status: string;
      }
    | undefined;
  let resolvedBoardId: string | null = null;

  if (cleanPortal) {
    clientRow = db
      .prepare('SELECT id, name, company, email, avatar_url, portal_enabled, portal_token, status FROM clients WHERE portal_token = ?')
      .get(cleanPortal) as typeof clientRow;
  } else if (cleanBoard) {
    const boardRow = db
      .prepare('SELECT id, client_id, shared_with_client, status, invite_status, invite_accepted_at FROM boards WHERE share_token = ?')
      .get(cleanBoard) as
      | {
          id: string;
          client_id: string;
          shared_with_client: number;
          status: string;
          invite_status: string;
          invite_accepted_at: string | null;
        }
      | undefined;

    if (!boardRow || !boardRow.shared_with_client || boardRow.status === 'draft') {
      res.status(403).json({ error: 'Este link de quadro não está ativo ou foi revogado pelo estúdio.' });
      return;
    }

    resolvedBoardId = boardRow.id;
    clientRow = db
      .prepare('SELECT id, name, company, email, avatar_url, portal_enabled, portal_token, status FROM clients WHERE id = ?')
      .get(boardRow.client_id) as typeof clientRow;

    if (clientRow && boardRow.invite_status !== 'accepted') {
      const nowAcc = new Date().toISOString();
      db.prepare(
        "UPDATE boards SET invite_status = 'accepted', invite_accepted_at = COALESCE(invite_accepted_at, ?) WHERE id = ?"
      ).run(nowAcc, boardRow.id);
    }
  }

  if (!clientRow) {
    res.status(404).json({ error: 'Link do Portal do Cliente inválido ou expirado.' });
    return;
  }

  if (!clientRow.portal_enabled || clientRow.status === 'archived') {
    res.status(403).json({ error: 'O acesso externo a este Portal do Cliente está desativado no momento.' });
    return;
  }

  const now = new Date().toISOString();
  let effectivePortalToken = clientRow.portal_token;
  if (!effectivePortalToken) {
    effectivePortalToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
    db.prepare('UPDATE clients SET portal_token = ?, updated_at = ? WHERE id = ?').run(effectivePortalToken, now, clientRow.id);
  }

  // Ensure a strictly role='client' user record exists for this client so comments/approvals/uploads work cleanly
  let userRow = db
    .prepare("SELECT * FROM users WHERE client_id = ? AND role = 'client'")
    .get(clientRow.id) as DbUser | undefined;

  if (!userRow) {
    const baseEmail = (clientRow.email || `${clientRow.id}@portal.aumistudio.local`).trim().toLowerCase();
    const emailConflict = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(baseEmail);
    const safeEmail = emailConflict ? `${clientRow.id}.${crypto.randomBytes(3).toString('hex')}@portal.aumistudio.local` : baseEmail;
    const randomHash = bcrypt.hashSync(crypto.randomBytes(18).toString('hex'), 10);
    const newUserId = uid('usr');
    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, role, partner_key, avatar_url, title, bio,
        permissions_json, preferences_json, client_id, active, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'client', NULL, ?, ?, '', '{}', ?, ?, 1, ?, ?, ?)
    `).run(
      newUserId,
      clientRow.name,
      safeEmail,
      randomHash,
      clientRow.avatar_url || null,
      clientRow.company || 'Cliente Aumi Studio',
      JSON.stringify(DEFAULT_PREFERENCES),
      clientRow.id,
      now,
      now,
      now
    );
    userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId) as DbUser;
  } else {
    db.prepare('UPDATE users SET active = 1, last_seen_at = ? WHERE id = ?').run(now, userRow.id);
    userRow = { ...userRow, active: 1 };
  }

  const token = signClientLinkToken(userRow.id, clientRow.id, effectivePortalToken);
  const safeUser = sanitizeUser(userRow);

  logActivity(
    safeUser.id,
    safeUser.name,
    'client_portal_link_access',
    'client',
    clientRow.id,
    `Acessou o Portal do Cliente diretamente via link exclusivo`
  );

  res.json({
    token,
    user: safeUser,
    board_id: resolvedBoardId,
  });
});

// Simple, isolated External Client Login using Email + numeric PIN (4 to 6 digits)
router.post('/client-pin-login', (req, res) => {
  const { email, pin } = req.body as { email?: string; pin?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();
  const cleanPin = (pin || '').replace(/\D/g, '').trim();

  if (!normalizedEmail || !cleanPin) {
    res.status(400).json({ error: 'Informe seu e-mail cadastrado e o PIN numérico de acesso.' });
    return;
  }

  if (cleanPin.length < 4 || cleanPin.length > 6) {
    res.status(400).json({ error: 'O PIN de acesso deve conter entre 4 e 6 números.' });
    return;
  }

  // Match client either by clients.email or by linked client user email
  let clientRow = db
    .prepare(
      'SELECT id, name, company, email, avatar_url, portal_enabled, portal_token, portal_pin, status FROM clients WHERE LOWER(email) = ?'
    )
    .get(normalizedEmail) as
    | {
        id: string;
        name: string;
        company: string;
        email: string;
        avatar_url: string | null;
        portal_enabled: number;
        portal_token: string | null;
        portal_pin: string | null;
        status: string;
      }
    | undefined;

  if (!clientRow) {
    const linkedClientUser = db
      .prepare("SELECT client_id FROM users WHERE LOWER(email) = ? AND role = 'client' AND client_id IS NOT NULL")
      .get(normalizedEmail) as { client_id: string } | undefined;
    if (linkedClientUser?.client_id) {
      clientRow = db
        .prepare(
          'SELECT id, name, company, email, avatar_url, portal_enabled, portal_token, portal_pin, status FROM clients WHERE id = ?'
        )
        .get(linkedClientUser.client_id) as typeof clientRow;
    }
  }

  if (!clientRow) {
    res.status(401).json({ error: 'E-mail não encontrado no Portal do Cliente. Confirme o e-mail com o Aumi Studio.' });
    return;
  }

  if (!clientRow.portal_enabled || clientRow.status === 'archived') {
    res.status(403).json({ error: 'Seu acesso ao Portal do Cliente está desativado no momento.' });
    return;
  }

  const storedPin = (clientRow.portal_pin || '').replace(/\D/g, '').trim();
  if (!storedPin || storedPin !== cleanPin) {
    res.status(401).json({ error: 'PIN incorreto. Confira o código enviado pelo Aumi Studio e tente novamente.' });
    return;
  }

  const now = new Date().toISOString();
  let effectivePortalToken = clientRow.portal_token;
  if (!effectivePortalToken) {
    effectivePortalToken = `aumi-cli-${crypto.randomBytes(12).toString('hex')}`;
    db.prepare('UPDATE clients SET portal_token = ?, updated_at = ? WHERE id = ?').run(
      effectivePortalToken,
      now,
      clientRow.id
    );
  }

  let userRow = db
    .prepare("SELECT * FROM users WHERE client_id = ? AND role = 'client'")
    .get(clientRow.id) as DbUser | undefined;

  if (!userRow) {
    const conflict = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    const safeEmail = conflict
      ? `${clientRow.id}.${crypto.randomBytes(3).toString('hex')}@portal.aumistudio.local`
      : normalizedEmail;
    const randomHash = bcrypt.hashSync(crypto.randomBytes(18).toString('hex'), 10);
    const newUserId = uid('usr');
    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, role, partner_key, avatar_url, title, bio,
        permissions_json, preferences_json, client_id, active, last_seen_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'client', NULL, ?, ?, '', '{}', ?, ?, 1, ?, ?, ?)
    `).run(
      newUserId,
      clientRow.name,
      safeEmail,
      randomHash,
      clientRow.avatar_url || null,
      clientRow.company || 'Cliente Aumi Studio',
      JSON.stringify(DEFAULT_PREFERENCES),
      clientRow.id,
      now,
      now,
      now
    );
    userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(newUserId) as DbUser;
  } else {
    db.prepare('UPDATE users SET active = 1, last_seen_at = ? WHERE id = ?').run(now, userRow.id);
    userRow = { ...userRow, active: 1 };
  }

  const token = signClientLinkToken(userRow.id, clientRow.id, effectivePortalToken);
  const safeUser = sanitizeUser(userRow);

  logActivity(
    safeUser.id,
    safeUser.name,
    'client_pin_login',
    'client',
    clientRow.id,
    `Acessou o Portal do Cliente via E-mail + PIN`
  );

  res.json({ token, user: safeUser });
});

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
