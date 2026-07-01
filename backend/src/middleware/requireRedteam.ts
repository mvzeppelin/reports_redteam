import { Request, Response, NextFunction } from 'express';

export function requireRedteam(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.role === 'report') {
    res.status(403).json({ error: 'Acesso restrito a usuários redteam ou administradores' });
    return;
  }
  next();
}
