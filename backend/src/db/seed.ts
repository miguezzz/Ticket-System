import 'dotenv/config';
import { db, pool } from './index';
import { events, sectorPrices, sessions, sectors, seats } from './schema';

/**
 * Seed mínimo: 1 evento com 2 sessões —
 *  - cinema (ASSIGNED): setores STANDARD/PREMIUM com poltronas
 *  - show (GENERAL): setores com capacidade, sem poltronas
 */
async function main() {
  const [event] = await db
    .insert(events)
    .values({ title: 'Evento de Demonstração', description: 'Seed inicial' })
    .returning();

  // --- Sessão de cinema (assentos marcados) ---
  const [cinema] = await db
    .insert(sessions)
    .values({
      eventId: event.id,
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      room: 'Sala 1',
      seatingMode: 'ASSIGNED',
      maxTicketsPerUser: 6,
    })
    .returning();

  const [plateia, premium] = await db
    .insert(sectors)
    .values([
      {
        sessionId: cinema.id,
        name: 'Plateia',
        seatClass: 'STANDARD',
      },
      {
        sessionId: cinema.id,
        name: 'Camarote',
        seatClass: 'PREMIUM',
      },
    ])
    .returning();

  await db.insert(sectorPrices).values([
    {
      sectorId: plateia.id,
      fareType: 'FULL',
      priceCents: 3000,
    },
    {
      sectorId: plateia.id,
      fareType: 'HALF',
      priceCents: 1500,
    },
    {
      sectorId: premium.id,
      fareType: 'FULL',
      priceCents: 6000,
    },
    {
      sectorId: premium.id,
      fareType: 'HALF',
      priceCents: 3000,
    },
  ]);

  const seatRows: (typeof seats.$inferInsert)[] = [];
  for (const [sector, rows] of [
    [plateia, ['A', 'B', 'C']] as const,
    [premium, ['D']] as const,
  ]) {
    for (const row of rows) {
      for (let n = 1; n <= 8; n++) {
        seatRows.push({
          sessionId: cinema.id,
          sectorId: sector.id,
          label: `${row}${n}`,
          rowLabel: row,
          seatNumber: n,
        });
      }
    }
  }
  await db.insert(seats).values(seatRows);

  // --- Sessão de show (admissão geral por setor) ---
  const [show] = await db
    .insert(sessions)
    .values({
      eventId: event.id,
      startsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      room: 'Arena',
      seatingMode: 'GENERAL',
      maxTicketsPerUser: 4,
    })
    .returning();

  const [pista, pistaPremium] = await db
    .insert(sectors)
    .values([
      {
        sessionId: show.id,
        name: 'Pista',
        seatClass: 'STANDARD',
        capacity: 5000,
      },
      {
        sessionId: show.id,
        name: 'Pista Premium',
        seatClass: 'PREMIUM',
        capacity: 500,
      },
    ])
    .returning();

  await db.insert(sectorPrices).values([
    {
      sectorId: pista.id,
      fareType: 'FULL',
      priceCents: 8000,
    },
    {
      sectorId: pista.id,
      fareType: 'HALF',
      priceCents: 4000,
    },
    {
      sectorId: pistaPremium.id,
      fareType: 'FULL',
      priceCents: 16000,
    },
    {
      sectorId: pistaPremium.id,
      fareType: 'HALF',
      priceCents: 8000,
    },
  ]);

  // eslint-disable-next-line no-console
  console.log(
    `✓ seed ok — evento ${event.id}\n  cinema=${cinema.id} (${seatRows.length} poltronas)\n  show=${show.id} (geral)`,
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('✗ falha no seed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
