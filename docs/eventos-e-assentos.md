# Etapa 4 - Eventos e Assentos

> Status: **implementada**.
> Base: [schema-do-banco.md](./schema-do-banco.md).
> Proxima: Etapa 5 (reserva temporaria no banco).

Esta etapa cria o catalogo de eventos/sessoes e o fluxo manual de administracao
para montar setores, precos e assentos.

---

## Decisoes de design

- `events` continua sendo a atracao/cartaz; `sessions` representa data, horario,
  sala/local simples e modo de assento.
- Por ora, `sessions.room` e suficiente. Nao criamos `venues` ou `rooms`.
- Cinema usa `ASSIGNED`; show/admissao geral usa `GENERAL`.
- Mesmo no cinema, usamos setores. A sala/setor pode ser `STANDARD` ou `PREMIUM`;
  o assento nao tem classe propria.
- No modo `GENERAL`, cada setor tem sua propria `capacity`.
- Precos sao explicitos em `sector_prices`, um por setor/tarifa.
- `seat_class` continua separado de `fare_type`:
  - `seat_class`: `STANDARD`, `PREMIUM`
  - `fare_type`: `FULL`, `HALF`
- Assentos sao gerados por formato simples: `rows`, `seatsPerRow`, `startNumber`.
- Depois que um setor/sessao tiver ocupacao ativa ou vendida, edicoes destrutivas
  ficam bloqueadas.
- Auth/permissao de admin fica para etapa futura; os endpoints ja estao separados
  em `/admin`.

---

## Endpoints publicos

### `GET /events`

Lista eventos do catalogo.

### `GET /events/:eventId`

Retorna evento com sessoes resumidas.

### `GET /sessions/:sessionId`

Retorna sessao com setores e precos.

### `GET /sessions/:sessionId/availability`

Retorna disponibilidade da sessao.

No modo `ASSIGNED`, retorna todos os assentos por setor com status publico:

- `AVAILABLE`
- `SELECTED` (quando o Redis hold pertence ao `selectionId` informado)
- `UNAVAILABLE`

Qualquer `reservation_item` com status diferente de `RELEASED` ou Redis hold de
outro `selectionId` torna o assento `UNAVAILABLE`.

No modo `GENERAL`, retorna contadores por setor:

- `capacity`
- `selectedCount`
- `unavailableCount`
- `availableCount`

---

## Endpoints admin/manuais

### Eventos

- `POST /admin/events`
- `PATCH /admin/events/:eventId`

### Sessoes

- `POST /admin/events/:eventId/sessions`
- `PATCH /admin/sessions/:sessionId`

### Setores

- `POST /admin/sessions/:sessionId/sectors`
- `PATCH /admin/sectors/:sectorId`

### Precos

- `PUT /admin/sectors/:sectorId/prices`

Body:

```json
{
  "prices": [
    { "fareType": "FULL", "priceCents": 3000 },
    { "fareType": "HALF", "priceCents": 1500 }
  ]
}
```

### Geracao de assentos

- `POST /admin/sectors/:sectorId/seats/generate`

Body:

```json
{
  "rows": ["A", "B", "C"],
  "seatsPerRow": 12,
  "startNumber": 1
}
```

Gera `A1..A12`, `B1..B12`, `C1..C12`.

---

## Arquivos implementados

- `backend/src/main.ts`
- `backend/src/app.module.ts`
- `backend/src/events/events.module.ts`
- `backend/src/events/events.controller.ts`
- `backend/src/events/admin-events.controller.ts`
- `backend/src/events/events.service.ts`
- `backend/src/db/schema.ts`
- `backend/src/db/seed.ts`
- `backend/drizzle/0000_init.sql`

---

## Pendencias para etapas futuras

- Auth/permissao real nos endpoints `/admin`.
- Reserva temporaria persistida com TTL.
- BullMQ para expiracao automatica de reservas persistidas.
- Disponibilidade em tempo real via WebSocket, se desejado.

---

## Como testar com Docker

Subir Postgres e backend:

```bash
docker compose up --build backend
```

Rodar seed opcional:

```bash
docker compose run --rm backend-seed
```

Endpoints uteis:

- `GET http://localhost:3000/health`
- `GET http://localhost:3000/events`

O backend roda migrations automaticamente no start quando `RUN_MIGRATIONS=true`.

### Usar Supabase em vez do Postgres local

Crie um `.env` na raiz a partir de `.env.example` e preencha
`DATABASE_URL` com a connection string do Supabase.

Subir backend apontando para Supabase:

```bash
docker compose --profile supabase up --build backend-supabase
```

Rodar seed no Supabase:

```bash
docker compose --profile seed-supabase run --rm backend-seed-supabase
```

O modo Supabase fica no proprio `docker-compose.yml`: ele nao sobe Postgres local
para o `backend-supabase` e usa a `DATABASE_URL` da raiz. Chame o servico
explicitamente para evitar subir tambem o backend local.
