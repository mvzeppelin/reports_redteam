import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { reportsRouter } from './routes/reports';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: false,
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reports', reportsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[unhandled error]', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(config.port, () => {
  console.log(`Backend rodando na porta ${config.port}`);
});
