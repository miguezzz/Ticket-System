# Etapa 6 - Redis para Hold/TTL

> Status: **implementada**.
> Base: [regras-de-negocio.md](./regras-de-negocio.md),
> [eventos-e-assentos.md](./eventos-e-assentos.md) e
> [reserva-temporaria-no-banco.md](./reserva-temporaria-no-banco.md).
> Complemento: [concorrencia-atomica.md](./concorrencia-atomica.md).

Esta etapa implementa a selecao efemera antes do carrinho usando Redis.

---

## Decisoes aplicadas

- Auth nao entra nesta etapa.
- O backend gera um `selectionId`.
- TTL da selecao no Redis: **60 segundos**.
- Redis nao altera estado do banco.
- Banco continua refletindo apenas reserva persistida (`reservation_items`).
- Clicar em um assento livre cria hold Redis.
- Clicar no mesmo assento enquanto o hold ainda pertence ao mesmo `selectionId`
  remove a selecao; nao renova TTL.
- Se o hold expirou, um novo clique tenta selecionar de novo.
- Se outro usuario pegou antes, o assento fica indisponivel.
- `add_to_cart` exige que os itens estejam selecionados no Redis pelo mesmo
  `selectionId`.
- Ao criar reserva persistida com sucesso, o backend remove os holds Redis.

---

## Endpoints

### Criar selecao

```http
POST /sessions/:sessionId/selections
```

Resposta:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000",
  "expiresInSeconds": 60
}
```

### Selecionar/remover assento

```http
POST /sessions/:sessionId/seats/:seatId/hold
```

Body:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000"
}
```

Respostas possiveis:

```json
{ "status": "SELECTED", "selected": true, "expiresInSeconds": 60 }
```

```json
{ "status": "RELEASED", "selected": false }
```

### Remover assento explicitamente

```http
DELETE /sessions/:sessionId/seats/:seatId/hold
```

Body:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000"
}
```

### Selecionar admissao geral por setor

```http
POST /sessions/:sessionId/sectors/:sectorId/hold
```

Body:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000",
  "quantity": 2
}
```

---

## Disponibilidade publica

`GET /sessions/:sessionId/availability` nao expoe detalhes internos como `LOCKED`
ou `HELD`.

Para assentos marcados:

- sem reserva persistida e sem Redis hold: `AVAILABLE`
- Redis hold do proprio `selectionId`: `SELECTED`
- Redis hold de outro `selectionId`: `UNAVAILABLE`
- reserva persistida no banco (`HELD` ou `SOLD`): `UNAVAILABLE`

Para ver `SELECTED`, envie:

```http
GET /sessions/:sessionId/availability?selectionId=...
```

No modo `GENERAL`, a resposta por setor usa:

- `capacity`
- `selectedCount`
- `unavailableCount`
- `availableCount`

---

## Add to cart

`POST /sessions/:sessionId/reservations` agora exige `selectionId`.

Sessao `ASSIGNED`:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000",
  "userId": "11111111-1111-4111-8111-111111111111",
  "items": [
    { "seatId": "22222222-2222-4222-8222-222222222222", "fareType": "FULL" }
  ]
}
```

Sessao `GENERAL`:

```json
{
  "selectionId": "00000000-0000-4000-8000-000000000000",
  "userId": "11111111-1111-4111-8111-111111111111",
  "items": [
    { "sectorId": "33333333-3333-4333-8333-333333333333", "fareType": "FULL", "quantity": 2 }
  ]
}
```

Se a selecao no Redis expirou ou pertence a outro `selectionId`, o backend retorna
conflito e nao cria reserva persistida.

---

## Chaves Redis

Assento marcado:

```text
hold:seat:{sessionId}:{seatId} = {selectionId}
TTL 60s
```

Admissao geral:

```text
hold:general:{sessionId}:{sectorId}:{selectionId} = {quantity}
TTL 60s
```

---

## Arquivos implementados

- `backend/src/holds/holds.module.ts`
- `backend/src/holds/holds.controller.ts`
- `backend/src/holds/holds.service.ts`
- `backend/src/holds/redis.service.ts`
- `backend/src/events/events.service.ts`
- `backend/src/events/events.controller.ts`
- `backend/src/reservations/reservations.service.ts`
- `docker-compose.yml`
- `docker-compose.supabase.yml`
- `backend/test/reservations.e2e-spec.ts`

---

## Testes

Suite:

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
```

Cobertura atualizada:

- cria `selectionId`;
- seleciona assento no Redis;
- disponibilidade mostra `SELECTED` para o dono;
- disponibilidade mostra `UNAVAILABLE` para outros usuarios;
- `add_to_cart` exige `selectionId`;
- reserva persistida remove hold Redis e deixa assento `UNAVAILABLE`;
- cancelamento libera item persistido e assento volta para `AVAILABLE`;
- conflitos no banco limpam holds Redis do request;
- capacidade `GENERAL` e serializada na Etapa 7.

---

## Pendencias para etapas futuras

- BullMQ para expirar reservas persistidas automaticamente.
- WebSocket/push de disponibilidade em tempo real, se desejado.
- Auth real para associar selecao/usuario sem `selectionId` manual no frontend.
