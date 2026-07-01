import { Router, Request, Response } from 'express';
import path from 'path';
import fsp from 'fs/promises';
import os from 'os';
import multer from 'multer';
import mime from 'mime-types';
import { pool } from '../db/pool';
import { authenticate } from '../middleware/authenticate';
import { requireRedteam } from '../middleware/requireRedteam';
import { reportUploadRateLimiter } from '../middleware/rateLimiter';
import { extractReport, deleteReportFiles, REPORTS_DIR } from '../services/reportService';
import { logEvent } from '../services/auditService';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, _file, cb) => cb(null, `report-upload-${Date.now()}.zip`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const okMime = file.mimetype === 'application/zip' || file.mimetype === 'application/x-zip-compressed';
    const okExt  = path.extname(file.originalname).toLowerCase() === '.zip';
    if (okMime || okExt) { cb(null, true); }
    else { cb(new Error('Apenas arquivos .zip são aceitos.')); }
  },
});

// Promisifica o multer para que erros de fileFilter e LIMIT_FILE_SIZE
// sejam capturados pelo handler da rota e retornem 400 (não 500).
function runUpload(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ─── GET /api/reports ─────────────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.name, r.is_active, r.file_count, r.size_bytes, r.created_at,
            u.email AS uploaded_by_email
     FROM reports r
     LEFT JOIN users u ON u.id = r.uploaded_by
     ORDER BY r.created_at DESC`,
  );
  res.json(rows);
});

// ─── POST /api/reports ────────────────────────────────────────────────────────
router.post('/', requireRedteam, reportUploadRateLimiter, async (req: Request, res: Response) => {
  // Multer tratado aqui para devolver 400 em vez de 500 em erros de validação.
  try {
    await runUpload(req, res);
  } catch (err: any) {
    const isFileSizeError = err.code === 'LIMIT_FILE_SIZE';
    const msg = isFileSizeError ? 'Arquivo muito grande. Limite: 50 MB.' : (err.message ?? 'Arquivo inválido.');
    await logEvent('REPORT_UPLOAD_FAILED', req.ip ?? null, req.session!.email, {
      name: (req.body as { name?: string })?.name ?? null,
      error: msg,
    });
    res.status(400).json({ error: msg });
    return;
  }

  const zipPath = req.file?.path;
  let reportId: string | undefined;

  try {
    const { name } = req.body as { name?: string };
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'O campo "name" é obrigatório.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    // Reservar ID e criar diretório de destino
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO reports (name, uploaded_by) VALUES ($1, $2) RETURNING id`,
      [name.trim(), req.session!.userId],
    );
    reportId = rows[0].id;

    const destDir = path.join(REPORTS_DIR, reportId);
    const { fileCount, sizeBytes } = await extractReport(zipPath!, destDir);

    await pool.query(
      `UPDATE reports SET file_count = $1, size_bytes = $2 WHERE id = $3`,
      [fileCount, sizeBytes, reportId],
    );

    const { rows: final } = await pool.query(
      `SELECT r.id, r.name, r.is_active, r.file_count, r.size_bytes, r.created_at,
              u.email AS uploaded_by_email
       FROM reports r LEFT JOIN users u ON u.id = r.uploaded_by WHERE r.id = $1`,
      [reportId],
    );
    await logEvent('REPORT_UPLOADED', req.ip ?? null, req.session!.email, {
      reportId,
      name: name.trim(),
      fileCount,
      sizeBytes,
    });
    res.status(201).json(final[0]);
  } catch (err: any) {
    // Limpar registro do banco se a extração falhou
    if (reportId) {
      await pool.query('DELETE FROM reports WHERE id = $1', [reportId]).catch(() => {});
      await deleteReportFiles(reportId).catch(() => {});
    }
    const msg = err.message ?? 'Erro ao processar o arquivo.';
    await logEvent('REPORT_UPLOAD_FAILED', req.ip ?? null, req.session!.email, {
      name: (req.body as { name?: string })?.name ?? null,
      error: msg,
    });
    res.status(400).json({ error: msg });
  } finally {
    if (zipPath) fsp.unlink(zipPath).catch(() => {});
  }
});

// ─── PATCH /api/reports/:id ───────────────────────────────────────────────────
router.patch('/:id', requireRedteam, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const { is_active, name } = req.body as { is_active?: boolean; name?: string };

  if (is_active === undefined && name === undefined) {
    res.status(400).json({ error: 'Nenhum campo para atualizar.' });
    return;
  }
  if (is_active !== undefined && typeof is_active !== 'boolean') {
    res.status(400).json({ error: 'Campo "is_active" deve ser boolean.' });
    return;
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Nome inválido.' });
      return;
    }
    if (name.trim().length > 255) {
      res.status(400).json({ error: 'Nome muito longo (máximo 255 caracteres).' });
      return;
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;
  if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
  if (name !== undefined)      { fields.push(`name = $${idx++}`);      values.push(name.trim()); }
  values.push(id);

  const { rows, rowCount } = await pool.query(
    `UPDATE reports SET ${fields.join(', ')} WHERE id = $${idx}
     RETURNING id, name, is_active, file_count, size_bytes, created_at`,
    values,
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Relatório não encontrado.' }); return; }

  if (is_active !== undefined) {
    await logEvent('REPORT_TOGGLED', req.ip ?? null, req.session!.email, {
      reportId: id, name: rows[0].name, is_active,
    });
  }
  if (name !== undefined) {
    await logEvent('REPORT_RENAMED', req.ip ?? null, req.session!.email, {
      reportId: id, newName: rows[0].name,
    });
  }

  res.json(rows[0]);
});

// ─── DELETE /api/reports/:id ──────────────────────────────────────────────────
router.delete('/:id', requireRedteam, async (req: Request, res: Response) => {
  const { id } = req.params;
  // Validar formato UUID para evitar path traversal no id
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const { rows, rowCount } = await pool.query(
    'DELETE FROM reports WHERE id = $1 RETURNING name',
    [id],
  );
  if (rowCount === 0) { res.status(404).json({ error: 'Relatório não encontrado.' }); return; }
  await deleteReportFiles(id).catch(() => {});
  await logEvent('REPORT_DELETED', req.ip ?? null, req.session!.email, {
    reportId: id,
    name: rows[0].name,
  });
  res.status(204).send();
});

// ─── GET /api/reports/:id/view/* ──────────────────────────────────────────────
router.get('/:id/view', async (req: Request, res: Response) => {
  res.redirect(301, `/api/reports/${req.params.id}/view/index.html`);
});

router.get('/:id/view/*', async (req: Request, res: Response) => {
  const { id } = req.params;

  // Validar UUID
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const { rows } = await pool.query<{ is_active: boolean }>(
    'SELECT is_active FROM reports WHERE id = $1',
    [id],
  );
  if (rows.length === 0) { res.status(404).send('Relatório não encontrado.'); return; }
  if (!rows[0].is_active) { res.status(403).send('Este relatório está desativado.'); return; }

  // Extrair segmentos do path após /view/
  const rawSegments: string = (req.params as Record<string, string>)['0'] ?? 'index.html';
  const segments = rawSegments.split('/').filter(Boolean);

  const reportBase = path.resolve(REPORTS_DIR, id);
  const filePath   = path.resolve(reportBase, ...segments);

  // Anti path traversal: garantir que o arquivo está dentro do diretório do relatório
  if (!filePath.startsWith(reportBase + path.sep) && filePath !== reportBase) {
    res.status(403).send('Acesso negado.');
    return;
  }

  try {
    await fsp.access(filePath);
  } catch {
    res.status(404).send('Arquivo não encontrado.');
    return;
  }

  const mimeType = mime.lookup(filePath) || 'application/octet-stream';
  res.setHeader('Content-Type', mimeType);
  // Permite inline scripts/eval (necessário para relatórios gerados por IA com gráficos) e assets de qualquer origem,
  // mas bloqueia fetch/XHR/WebSocket e submissão de forms — impede que JS malicioso no relatório
  // chame /api/* usando a sessão do usuário autenticado (XSS de mesmo domínio).
  res.setHeader(
    'Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'none'; form-action 'none';",
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.sendFile(filePath);
});

export { router as reportsRouter };
