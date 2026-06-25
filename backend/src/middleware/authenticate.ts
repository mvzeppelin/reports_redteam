import { Request, Response, NextFunction } from 'express';
import { validateSession, Session } from '../services/sessionService';
import { config } from '../config';

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[config.session.cookieName];

  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const session = await validateSession(token);
  if (!session) {
    res.clearCookie(config.session.cookieName);
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
    return;
  }

  req.session = session;
  next();
}

declare global {
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}
