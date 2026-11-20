import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db, DEFAULT_PARTNER_PERMISSIONS, DEFAULT_PREFERENCES } from './db.ts';
import { DbUser, PartnerPermissions, SafeUser } from './types.ts';

const JWT_SECRET = process.env.AUMI_JWT_SECRET || 'aumi-studio-internal-session-secret-2026';

export interface AuthRequest extends Request {
  user?: SafeUser;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '14d' });
}

export function signClientLinkToken(userId: string, clientId: string, portalToken: string): string {
  return jwt.sign(
    { sub: userId, scope: 'client_portal', client_id: clientId, ptk: portalToken },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function sanitizeUser(row: DbUser): SafeUser {
  let perms: PartnerPermissions = { ...DEFAULT_PARTNER_PERMISSIONS };
  try {
    perms = { ...DEFAULT_PARTNER_PERMISSIONS, ...JSON.parse(row.permissions_json || '{}') };
  } catch {
    // ignore
  }
  let prefs = { ...DEFAULT_PREFERENCES };
  try {
    prefs = { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences_json || '{}') };
  } catch {
    // ignore
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    partner_key: row.partner_key,
    avatar_url: row.avatar_url,
    title: row.title,
    bio: row.bio,
    permissions: perms,
    preferences: prefs,
    client_id: row.client_id,
    active: Boolean(row.active),
  };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies && req.cookies.aumi_token) {
    token = req.cookies.aumi_token;
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Sessão não autenticada. Faça login para continuar.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      scope?: string;
      client_id?: string;
      ptk?: string;
    };
    const userRow = db.prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(payload.sub) as DbUser | undefined;
    if (!userRow) {
      res.status(401).json({ error: 'Usuária ou conta inativa.' });
      return;
    }

    // Strict client portal isolation & live link-revocation check
    if (payload.scope === 'client_portal' || userRow.role === 'client') {
      if (userRow.role !== 'client' || !userRow.client_id) {
        res.status(403).json({ error: 'Acesso inválido ao portal do cliente.' });
        return;
      }
      if (payload.client_id && payload.client_id !== userRow.client_id) {
        res.status(403).json({ error: 'Este link não corresponde à conta autenticada.' });
        return;
      }
      const clientRow = db
        .prepare('SELECT id, portal_enabled, portal_token, status FROM clients WHERE id = ?')
        .get(userRow.client_id) as
        | { id: string; portal_enabled: number; portal_token: string | null; status: string }
        | undefined;

      if (!clientRow || !clientRow.portal_enabled || clientRow.status === 'archived') {
        res.status(403).json({ error: 'O acesso a este Portal do Cliente foi desativado pelo estúdio.' });
        return;
      }
      if (payload.ptk && clientRow.portal_token && payload.ptk !== clientRow.portal_token) {
        res.status(401).json({ error: 'Este link de acesso foi atualizado. Solicite o novo link ao estúdio.' });
        return;
      }
    }

    req.user = sanitizeUser(userRow);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou inválida. Entre novamente.' });
  }
}

export function requirePartner(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'partner') {
    res.status(403).json({ error: 'Acesso restrito às sócias do estúdio.' });
    return;
  }
  next();
}

export function requirePermission(permKey: keyof PartnerPermissions) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'partner') {
      res.status(403).json({ error: 'Acesso restrito.' });
      return;
    }
    if (!req.user.permissions[permKey]) {
      res.status(403).json({ error: 'Sua conta não possui permissão para executar esta ação.' });
      return;
    }
    next();
  };
}
