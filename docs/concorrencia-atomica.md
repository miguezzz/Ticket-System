# Etapa 7 - Concorrencia Atomica

> Status: **implementada para `add_to_cart`**.
> Base: [reserva-temporaria-no-banco.md](./reserva-temporaria-no-banco.md) e
> [redis-hold-ttl.md](./redis-hold-ttl.md).
> Proxima: Etapa 8 (BullMQ para expiracao).

Esta etapa reforca a criacao da reserva persistida para que o carrinho seja
atomico: ou todos os itens entram na reserva, ou nenhum entra.

---

## Escopo fechado nesta etapa

- Foco em `POST /sessions/:sessionId/reservations`.
- Auth real continua fora desta fase.
- O cliente ainda precisa enviar `selectionId` e `userId`.
- Redis continua sendo selecao efemera, nao fonte final de venda.
- O banco continua sendo a garantia final contra venda duplicada.
- Em conflito detectado depois da validacao Redis, os holds Redis do request sao
  limpos para nao deixar selecao presa.

Checkout, pagamento, webhook e confirmacao de venda entram nas etapas seguintes.

---

## Fluxo atomico do add to cart

1. Backend valida sessao, `userId`, `selectionId` e itens.
2. Backend confirma que os holds Redis pertencem ao `selectionId`.
3. Dentro de transacao:
   - expira reservas vencidas da mesma sessao;
   - bloqueia segunda reserva ativa do mesmo usuario/sessao;
   - valida limite de ingressos por usuario;
   - valida assentos ou capacidade;
   - cria `reservations`;
   - cria todos os `reservation_items`.
4. Se a transacao confirma, os holds Redis usados sao removidos.
5. Se a transacao falha por conflito de ocupacao/capacidade/reserva ativa, os
   holds Redis usados tambem sao removidos.

---

## Sessao ASSIGNED

Para assento marcado, a protecao forte fica no banco:

- `reservation_items_seat_active_uq` impede dois itens ativos para o mesmo
  `seat_id`;
- a aplicacao tambem consulta ocupacao ativa antes de inserir para retornar erro
  amigavel;
- caso duas requisicoes passem pela leitura ao mesmo tempo, a constraint parcial
  ainda derruba uma delas com `23505`;
- `23505` vira `409 Conflict`.

Isso evita reservar metade de um carrinho multi-assento: se um item conflitar, a
transacao inteira volta.

---

## Sessao GENERAL

Para admissao geral, a capacidade e garantida serializando a contagem por setor:

```sql
select id
from sectors
where id = $sectorId
for update;
```

A trava e feita dentro da mesma transacao que conta os itens ativos e insere os
novos `reservation_items`.

Importante: isso nao trava o banco inteiro. O PostgreSQL trava as linhas de
`sectors` envolvidas no request. Outras sessoes, setores e consultas normais
continuam andando.

---

## Expiracao oportunista

Antes de validar capacidade e criar a nova reserva, o backend libera reservas
ativas vencidas da mesma sessao:

- `reservations.status` muda para `EXPIRED`;
- `reservations.expires_at` vira `null`;
- `reservation_items.status` muda para `RELEASED`.

Isso reduz falso negativo de disponibilidade enquanto a Etapa 8 ainda nao tem
BullMQ processando expiracao automaticamente.

---

## Redis apos conflito

Se o Redis confirmou ownership, mas o banco recusou a reserva por conflito, o
backend remove os holds do request:

- `ASSIGNED`: remove os holds dos assentos solicitados.
- `GENERAL`: remove os holds dos setores solicitados para aquele `selectionId`.

Assim o frontend nao continua vendo `SELECTED` para uma selecao que ja falhou no
banco.

---

## Testes

Suite:

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
```

Cobertura atual:

- cria reserva com assento marcado, snapshot de preco e cancelamento;
- impede duas selecoes Redis para o mesmo assento;
- faz rollback de reserva multi-assento quando um item conflita no banco;
- serializa capacidade `GENERAL` com `FOR UPDATE` no setor;
- impede duas reservas ativas do mesmo usuario na mesma sessao;
- limpa hold Redis quando a reserva falha por conflito.

Ultimo resultado registrado:

```text
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
```

---

## Pendencias para etapas futuras

- BullMQ para expirar reservas persistidas automaticamente.
- Checkout e transicao para `PAYMENT_PENDING`.
- Confirmacao de venda e emissao de ingressos.
- Concorrencia envolvendo pagamento, expiracao e webhook.
