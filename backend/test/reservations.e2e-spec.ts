import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db, pool } from '../src/db';

describe('Reservations flow (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        tickets,
        payments,
        reservation_items,
        reservations,
        seats,
        sector_prices,
        sectors,
        sessions,
        events,
        outbox_events,
        idempotency_keys
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('creates an assigned-seat reservation with price snapshot and releases it on cancel', async () => {
    const server = app.getHttpServer();

    const event = await request(server)
      .post('/admin/events')
      .send({
        title: 'Reserva E2E',
        description: 'Evento criado pelo teste e2e',
      })
      .expect(201)
      .then((response) => response.body);

    const session = await request(server)
      .post(`/admin/events/${event.id}/sessions`)
      .send({
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        room: 'Sala Teste',
        seatingMode: 'ASSIGNED',
        maxTicketsPerUser: 4,
      })
      .expect(201)
      .then((response) => response.body);

    const sector = await request(server)
      .post(`/admin/sessions/${session.id}/sectors`)
      .send({
        name: 'Plateia',
        seatClass: 'STANDARD',
      })
      .expect(201)
      .then((response) => response.body);

    await request(server)
      .put(`/admin/sectors/${sector.id}/prices`)
      .send({
        prices: [
          { fareType: 'FULL', priceCents: 3000 },
          { fareType: 'HALF', priceCents: 1500 },
        ],
      })
      .expect(200);

    const generatedSeats = await request(server)
      .post(`/admin/sectors/${sector.id}/seats/generate`)
      .send({
        rows: ['A'],
        seatsPerRow: 2,
        startNumber: 1,
      })
      .expect(201)
      .then((response) => response.body);

    const reservation = await request(server)
      .post(`/sessions/${session.id}/reservations`)
      .send({
        userId: randomUUID(),
        items: [{ seatId: generatedSeats[0].id, fareType: 'FULL' }],
      })
      .expect(201)
      .then((response) => response.body);

    expect(reservation.status).toBe('HELD');
    expect(reservation.totalItems).toBe(1);
    expect(reservation.totalCents).toBe(3000);
    expect(reservation.expiresAt).toBeTruthy();
    expect(reservation.items[0].priceCents).toBe(3000);
    expect(reservation.items[0].status).toBe('HELD');

    const heldAvailability = await request(server)
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(heldAvailability.sectors[0].seats[0].status).toBe('HELD');

    const cancelled = await request(server)
      .post(`/reservations/${reservation.id}/cancel`)
      .send({})
      .expect(201)
      .then((response) => response.body);

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.items[0].status).toBe('RELEASED');

    const releasedAvailability = await request(server)
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(releasedAvailability.sectors[0].seats[0].status).toBe('AVAILABLE');
  });
});
