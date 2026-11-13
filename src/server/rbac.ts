import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type { AgeGroup, Difficulty, ProfilePublic, UserRole } from '../shared/types';

export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  password_hash: string;
  role: UserRole;
  age_group: AgeGroup;
  avatar_id: string;
  total_questions_seen: number;
  total_correct: number;
  xp: number;
  achievements_json: string;
  categories_played_json: string;
  difficulties_played_json: string;
  created_at: string;
}

export interface AuthedRequest extends Request {
  user?: ProfilePublic;
}

export function toPublicProfile(row: ProfileRow): ProfilePublic {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    ageGroup: row.age_group,
    avatarId: row.avatar_id,
    totalQuestionsSeen: row.total_questions_seen,
    totalCorrect: row.total_correct,
    xp: row.xp,
    achievements: JSON.parse(row.achievements_json || '[]'),
    categoriesPlayed: JSON.parse(row.categories_played_json || '{}'),
    difficultiesPlayed: JSON.parse(
      row.difficulties_played_json || '{"easy":0,"medium":0,"hard":0}'
    ) as Record<Difficulty, number>,
    createdAt: row.created_at,
  };
}

export function issueAuthToken(db: Database.Database, profileId: string): string {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO auth_tokens (token, profile_id, expires_at) VALUES (?, ?, ?)`
  ).run(token, profileId, expiresAt);
  return token;
}

export function resolveUserFromToken(db: Database.Database, rawToken?: string): ProfilePublic | null {
  if (!rawToken) return null;
  const token = rawToken.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const row = db
    .prepare(
      `SELECT p.* FROM auth_tokens t
       JOIN profiles p ON p.id = t.profile_id
       WHERE t.token = ? AND t.expires_at > datetime('now')`
    )
    .get(token) as ProfileRow | undefined;

  return row ? toPublicProfile(row) : null;
}

export function attachOptionalAuth(db: Database.Database) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization || (req.query.token as string | undefined);
    const user = resolveUserFromToken(db, header);
    if (user) {
      req.user = user;
    }
    next();
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول للمتابعة' });
    return;
  }
  next();
}

export function requireRole(allowed: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'مطلوب تسجيل الدخول للوصول إلى هذه الصلاحية' });
      return;
    }
    if (!allowed.includes(req.user.role)) {
      res.status(403).json({ error: 'ليس لديك صلاحية تنفيذ هذا الإجراء' });
      return;
    }
    next();
  };
}
