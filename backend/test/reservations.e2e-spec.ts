import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { db, pool } from '../src/db';
import { HoldsService } from '../src/holds/holds.service';

describe('Reservations flow (e2e)', () => {
  let app: INestApplication;
  let holdsService: HoldsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    holdsService = app.get(HoldsService);
  });

  beforeEach(async () => {
    await holdsService.flushAllForTests();
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

  async function createAssignedSession(seatsPerRow = 3) {
    const server = app.getHttpServer();

    const event = await request(server)
      .post('/admin/events')
      .send({ title: 'Assigned E2E', description: 'Evento assigned' })
      .expect(201)
      .then((response) => response.body);

    const session = await request(server)
      .post(`/admin/events/${event.id}/sessions`)
      .send({
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        room: 'Sala Assigned',
        seatingMode: 'ASSIGNED',
        maxTicketsPerUser: 4,
      })
      .expect(201)
      .then((response) => response.body);

    const sector = await request(server)
      .post(`/admin/sessions/${session.id}/sectors`)
      .send({ name: 'Plateia', seatClass: 'STANDARD' })
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

    const seats = await request(server)
      .post(`/admin/sectors/${sector.id}/seats/generate`)
      .send({ rows: ['A'], seatsPerRow, startNumber: 1 })
      .expect(201)
      .then((response) => response.body);

    return { event, session, sector, seats };
  }

  async function createGeneralSession(capacity = 4) {
    const server = app.getHttpServer();

    const event = await request(server)
      .post('/admin/events')
      .send({ title: 'General E2E', description: 'Evento general' })
      .expect(201)
      .then((response) => response.body);

    const session = await request(server)
      .post(`/admin/events/${event.id}/sessions`)
      .send({
        startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        room: 'Arena',
        seatingMode: 'GENERAL',
        maxTicketsPerUser: 4,
      })
      .expect(201)
      .then((response) => response.body);

    const sector = await request(server)
      .post(`/admin/sessions/${session.id}/sectors`)
      .send({ name: 'Pista', seatClass: 'STANDARD', capacity })
      .expect(201)
      .then((response) => response.body);

    await request(server)
      .put(`/admin/sectors/${sector.id}/prices`)
      .send({
        prices: [
          { fareType: 'FULL', priceCents: 8000 },
          { fareType: 'HALF', priceCents: 4000 },
        ],
      })
      .expect(200);

    return { event, session, sector };
  }

  async function createSelection(sessionId: string) {
    return request(app.getHttpServer())
      .post(`/sessions/${sessionId}/selections`)
      .expect(201)
      .then((response) => response.body.selectionId as string);
  }

  async function holdSeat(sessionId: string, seatId: string, selectionId: string) {
    return request(app.getHttpServer())
      .post(`/sessions/${sessionId}/seats/${seatId}/hold`)
      .send({ selectionId })
      .expect(201);
  }

  function createAssignedReservation(
    sessionId: string,
    selectionId: string,
    userId: string,
    seatIds: string[],
  ) {
    return request(app.getHttpServer())
      .post(`/sessions/${sessionId}/reservations`)
      .send({
        selectionId,
        userId,
        items: seatIds.map((seatId) => ({ seatId, fareType: 'FULL' })),
      });
  }

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

    const selection = await request(server)
      .post(`/sessions/${session.id}/selections`)
      .expect(201)
      .then((response) => response.body);

    await request(server)
      .post(`/sessions/${session.id}/seats/${generatedSeats[0].id}/hold`)
      .send({ selectionId: selection.selectionId })
      .expect(201)
      .expect(({ body }) => {
        expect(body.status).toBe('SELECTED');
        expect(body.expiresInSeconds).toBe(60);
      });

    const selectedAvailability = await request(server)
      .get(`/sessions/${session.id}/availability?selectionId=${selection.selectionId}`)
      .expect(200)
      .then((response) => response.body);

    expect(selectedAvailability.sectors[0].seats[0].status).toBe('SELECTED');

    const publicAvailability = await request(server)
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(publicAvailability.sectors[0].seats[0].status).toBe('UNAVAILABLE');

    const reservation = await request(server)
      .post(`/sessions/${session.id}/reservations`)
      .send({
        selectionId: selection.selectionId,
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

    expect(heldAvailability.sectors[0].seats[0].status).toBe('UNAVAILABLE');

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

  it('allows only one selection for the same seat at a time', async () => {
    const { session, seats } = await createAssignedSession(1);
    const firstSelectionId = await createSelection(session.id);
    const secondSelectionId = await createSelection(session.id);

    await holdSeat(session.id, seats[0].id, firstSelectionId);

    await request(app.getHttpServer())
      .post(`/sessions/${session.id}/seats/${seats[0].id}/hold`)
      .send({ selectionId: secondSelectionId })
      .expect(409);
  });

  it('rolls back a multi-seat reservation when one item conflicts in the database', async () => {
    const { session, sector, seats } = await createAssignedSession(2);
    const selectionId = await createSelection(session.id);
    const blockerReservationId = randomUUID();

    await holdSeat(session.id, seats[0].id, selectionId);
    await holdSeat(session.id, seats[1].id, selectionId);

    await db.execute(sql`
      insert into reservations (id, session_id, user_id, status, expires_at)
      values (
        ${blockerReservationId},
        ${session.id},
        ${randomUUID()},
        'HELD'::reservation_status,
        now() + interval '7 minutes'
      )
    `);
    await db.execute(sql`
      insert into reservation_items (
        reservation_id,
        sector_id,
        seat_id,
        fare_type,
        price_cents,
        status
      )
      values (
        ${blockerReservationId},
        ${sector.id},
        ${seats[1].id},
        'FULL'::fare_type,
        3000,
        'HELD'::reservation_item_status
      )
    `);

    await createAssignedReservation(session.id, selectionId, randomUUID(), [
      seats[0].id,
      seats[1].id,
    ]).expect(409);

    const availability = await request(app.getHttpServer())
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(availability.sectors[0].seats[0].status).toBe('AVAILABLE');
    expect(availability.sectors[0].seats[1].status).toBe('UNAVAILABLE');
  });

  it('serializes general admission capacity with a sector row lock', async () => {
    const { session, sector } = await createGeneralSession(4);
    const firstSelectionId = await createSelection(session.id);
    const secondSelectionId = await createSelection(session.id);

    await request(app.getHttpServer())
      .post(`/sessions/${session.id}/sectors/${sector.id}/hold`)
      .send({ selectionId: firstSelectionId, quantity: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/sessions/${session.id}/sectors/${sector.id}/hold`)
      .send({ selectionId: secondSelectionId, quantity: 2 })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/sectors/${sector.id}`)
      .send({ capacity: 2 })
      .expect(200);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/sessions/${session.id}/reservations`)
        .send({
          selectionId: firstSelectionId,
          userId: randomUUID(),
          items: [{ sectorId: sector.id, fareType: 'FULL', quantity: 2 }],
        }),
      request(app.getHttpServer())
        .post(`/sessions/${session.id}/reservations`)
        .send({
          selectionId: secondSelectionId,
          userId: randomUUID(),
          items: [{ sectorId: sector.id, fareType: 'FULL', quantity: 2 }],
        }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const availability = await request(app.getHttpServer())
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(availability.sectors[0].capacity).toBe(2);
    expect(availability.sectors[0].unavailableCount).toBe(2);
    expect(availability.sectors[0].availableCount).toBe(0);
  });

  it('prevents a user from creating two active reservations in the same session', async () => {
    const { session, seats } = await createAssignedSession(2);
    const userId = randomUUID();
    const firstSelectionId = await createSelection(session.id);
    const secondSelectionId = await createSelection(session.id);

    await holdSeat(session.id, seats[0].id, firstSelectionId);
    await createAssignedReservation(session.id, firstSelectionId, userId, [
      seats[0].id,
    ]).expect(201);

    await holdSeat(session.id, seats[1].id, secondSelectionId);
    await createAssignedReservation(session.id, secondSelectionId, userId, [
      seats[1].id,
    ]).expect(409);

    const availability = await request(app.getHttpServer())
      .get(`/sessions/${session.id}/availability`)
      .expect(200)
      .then((response) => response.body);

    expect(availability.sectors[0].seats[0].status).toBe('UNAVAILABLE');
    expect(availability.sectors[0].seats[1].status).toBe('AVAILABLE');
  });
});
