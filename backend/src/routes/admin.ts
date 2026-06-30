import { Router } from 'express';
import { pool } from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/requireAdmin';
import { logEvent } from '../services/auditService';

const router = Router();
router.use(authenticate, requireAdmin);

// ─── Usuários ────────────────────────────────────────────────────────────────

router.get('/users', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.is_active, u.is_admin, u.created_at,
            (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
     FROM users u
     ORDER BY u.created_at DESC`,
  );
  res.json(rows);
});

router.post('/users', async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'E-mail inválido' });
    return;
  }
  const normalized = email.trim().toLowerCase();
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email) VALUES ($1) RETURNING id, email, is_active, is_admin, created_at`,
      [normalized],
    );
    await logEvent('ADMIN_USER_CREATED', req.ip ?? null, req.session!.email, {
      targetEmail: normalized,
      targetId: rows[0].id,
    });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'E-mail já cadastrado' });
      return;
    }
    throw err;
  }
});

router.patch('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }

  const { is_active, is_admin } = req.body;
  if (is_active === undefined && is_admin === undefined) {
    res.status(400).json({ error: 'Nenhum campo para atualizar' });
    return;
  }

  // Impede admin de revogar o próprio acesso
  if (id === req.session!.userId && is_admin === false) {
    res.status(400).json({ error: 'Você não pode revogar seu próprio acesso de administrador' });
    return;
  }
  if (id === req.session!.userId && is_active === false) {
    res.status(400).json({ error: 'Você não pode desativar sua própria conta' });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  if (is_admin !== undefined)  { fields.push(`is_admin = $${idx++}`);  values.push(is_admin);  }
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, is_active, is_admin, created_at`,
    values,
  );
  if (rows.length === 0) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  await logEvent('ADMIN_USER_UPDATED', req.ip ?? null, req.session!.email, {
    targetEmail: rows[0].email,
    targetId: id,
    changes: { is_active, is_admin },
  });
  res.json(rows[0]);
});

router.delete('/users/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }

  if (id === req.session!.userId) {
    res.status(400).json({ error: 'Você não pode excluir sua própria conta' });
    return;
  }

  const { rows, rowCount } = await pool.query(
    `DELETE FROM users WHERE id = $1 RETURNING email`,
    [id],
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
  await logEvent('ADMIN_USER_DELETED', req.ip ?? null, req.session!.email, {
    targetEmail: rows[0].email,
    targetId: id,
  });
  res.status(204).send();
});

// ─── Sessões ─────────────────────────────────────────────────────────────────

router.get('/sessions', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, u.email, s.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.invalidated_at IS NULL AND s.expires_at > NOW()
     ORDER BY s.created_at DESC`,
  );
  res.json(rows);
});

router.delete('/sessions/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }

  const { rows, rowCount } = await pool.query(
    `UPDATE sessions SET invalidated_at = NOW()
     WHERE id = $1 AND invalidated_at IS NULL AND expires_at > NOW()
     RETURNING (SELECT email FROM users WHERE id = sessions.user_id) AS target_email`,
    [id],
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Sessão não encontrada ou já inativa' }); return; }
  await logEvent('ADMIN_SESSION_INVALIDATED', req.ip ?? null, req.session!.email, {
    sessionId: id,
    targetEmail: rows[0].target_email,
  });
  res.status(204).send();
});

// ─── Auditoria ────────────────────────────────────────────────────────────────

router.get('/audit', async (req, res) => {
  const { event_type, email, ip } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (event_type) { conditions.push(`event_type = $${idx++}`); values.push(event_type); }
  if (email)      { conditions.push(`email ILIKE $${idx++}`);  values.push(`%${email}%`); }
  if (ip)         { conditions.push(`ip_address = $${idx++}`); values.push(ip); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, event_type, ip_address, email, details, created_at
       FROM audit_logs ${where}
       ORDER BY created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM audit_logs ${where}`, values),
  ]);

  res.json({ data: rows, total: countRows[0].total, page, limit });
});

export { router as adminRouter };
