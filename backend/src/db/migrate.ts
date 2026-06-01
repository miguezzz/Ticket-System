import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definido');
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('✓ migrations aplicadas');
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('✗ falha ao migrar:', err);
    process.exit(1);
  });
