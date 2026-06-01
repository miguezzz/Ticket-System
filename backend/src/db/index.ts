import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  // Não derruba a app aqui; quem importar o `db` que falhe ao conectar.
  // eslint-disable-next-line no-console
  console.warn('[db] DATABASE_URL não definido — conexões irão falhar.');
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from './schema';
export type DB = typeof db;
