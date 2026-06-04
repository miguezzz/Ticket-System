# Etapa 5 - Reserva Temporaria no Banco

> Status: **implementada**.
> Base: [regras-de-negocio.md](./regras-de-negocio.md),
> [maquina-de-estados.md](./maquina-de-estados.md),
> [schema-do-banco.md](./schema-do-banco.md) e
> [eventos-e-assentos.md](./eventos-e-assentos.md).
> Proxima: Etapa 6 (Redis para hold/TTL).

Esta etapa cria a reserva persistida no banco. A reserva nasce no `add_to_cart`,
em estado `HELD`, com `expires_at` de 7 minutos.

---

## Decisoes aplicadas

- A selecao efemera ainda nao existe aqui; Redis entra na Etapa 6.
- A reserva real nasce em `POST /sessions/:sessionId/reservations`.
- O cliente envia `userId` no body enquanto auth real nao existe.
- Uma reserva ativa por usuario/sessao e garantida por validacao + indice parcial.
- Itens ficam em `reservation_items` com status `HELD`.
- O preco e lido de `sector_prices` e congelado em `reservation_items.price_cents`.
- Cancelamento manual libera itens (`RELEASED`) e muda a reserva para `CANCELLED`.
- Expiracao vencida pode ser rodada manualmente por endpoint admin; BullMQ usara a
  mesma logica na Etapa 8.

---

## Criar reserva

### `POST /sessions/:sessionId/reservations`

Cria uma reserva `HELD` com TTL de 7 minutos.

### Sessao `ASSIGNED`

Body:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000",
  "items": [
    { "seatId": "11111111-1111-4111-8111-111111111111", "fareType": "FULL" },
    { "seatId": "22222222-2222-4222-8222-222222222222", "fareType": "HALF" }
  ]
}
```

Regras:

- Todos os `seatId` precisam pertencer a sessao.
- Nao pode repetir assento no mesmo request.
- Qualquer `reservation_item.status <> RELEASED` torna o assento indisponivel.
- Cada item recebe o setor do assento e o preco correspondente de `sector_prices`.

### Sessao `GENERAL`

Body:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000",
  "items": [
    { "sectorId": "33333333-3333-4333-8333-333333333333", "fareType": "FULL", "quantity": 2 }
  ]
}
```

Regras:

- `sectorId` precisa pertencer a sessao.
- `quantity` default e `1`.
- A capacidade do setor e checada por contagem de itens ativos.
- A garantia forte contra corrida de capacidade sera reforcada na Etapa 7.

---

## Consultar reserva

### `GET /reservations/:reservationId`

Retorna a reserva com itens, `totalItems` e `totalCents`.

---

## Cancelar reserva

### `POST /reservations/:reservationId/cancel`

Body opcional:

```json
{
  "userId": "00000000-0000-4000-8000-000000000000"
}
```

Se `userId` for informado, precisa bater com a reserva. O cancelamento so vale para
reservas ativas (`HELD` ou `PAYMENT_PENDING`).

Efeitos:

- `reservations.status = CANCELLED`
- `reservations.expires_at = null`
- `reservation_items.status = RELEASED`

---

## Expirar reservas vencidas

### `POST /admin/reservations/expire-due`

Processa reservas `HELD` ou `PAYMENT_PENDING` com `expires_at <= now()`.

Efeitos:

- `reservations.status = EXPIRED`
- `reservations.expires_at = null`
- `reservation_items.status = RELEASED`

Esse endpoint e administrativo/temporario. Na Etapa 8, o BullMQ deve chamar essa
rotina automaticamente.

---

## Arquivos implementados

- `backend/src/reservations/reservations.module.ts`
- `backend/src/reservations/reservations.controller.ts`
- `backend/src/reservations/reservations.service.ts`
- `backend/src/app.module.ts`
- `backend/test/reservations.e2e-spec.ts`

---

## Testes

Suite:

```bash
docker compose --profile test run --rm backend-test
```

Cobertura inicial:

- cria evento, sessao, setor, precos e assentos;
- cria reserva `HELD`;
- valida snapshot de preco em `reservation_items`;
- confirma assento `HELD` na disponibilidade;
- cancela reserva;
- confirma item `RELEASED` e assento `AVAILABLE`.

---

## Pendencias para etapas futuras

- Auth real para substituir `userId` no body.
- Redis lock de 30s antes do `add_to_cart`.
- Concorrencia atomica reforcada para admissao geral.
- BullMQ para expirar reservas automaticamente.
- Checkout para transicionar `HELD` para `PAYMENT_PENDING`.
