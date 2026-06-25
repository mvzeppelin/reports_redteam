import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.db.connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[pg pool error]', err);
});
