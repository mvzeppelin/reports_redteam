import { Request, Response, NextFunction } from 'express';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.isAdmin) {
    res.status(403).json({ error: 'Acesso restrito a administradores' });
    return;
  }
  next();
}
