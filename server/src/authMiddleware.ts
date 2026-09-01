import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyToken, AuthError } from './auth.js';

const { JsonWebTokenError } = jwt;

// Written for use once existing endpoints are migrated to be per-user (see the project plan) —
// not yet applied to any route. Adding it here now so the shape is settled and reviewable
// alongside the register/login/me endpoints that already need it.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  try {
    req.userId = verifyToken(token);
    next();
  } catch (err) {
    if (err instanceof AuthError || err instanceof JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    throw err;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
