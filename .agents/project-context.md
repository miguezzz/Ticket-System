# Contexto compartilhado

## Produto

Sistema de venda de ingressos para dois modos de evento:

- Cinema ou evento com assento marcado (`ASSIGNED`): cada assento e uma entidade.
- Show grande ou admissao geral (`GENERAL`): vende vagas por setor/capacidade.

O sistema precisa lidar com alta concorrencia, selecao temporaria de assentos, reserva persistida com TTL, pagamento atrasado, emissao assincrona de ingressos e reconciliacao.

## Stack atual

- Backend: NestJS, TypeScript.
- Banco: PostgreSQL com Drizzle ORM.
- Auth: Supabase Auth; `user_id` referencia `auth.users(id)`, sem tabela local `users`.
- Redis: locks efemeros e contadores auxiliares.
- BullMQ: expiracao de reservas, workers e filas futuras.

## Decisoes fechadas

- Selecao de assento antes do carrinho vive apenas no Redis, com lock TTL de 30s.
- Reserva real nasce apenas no `add_to_cart`, em estado `HELD`.
- Reserva persistida expira em 7 minutos.
- Expiracao da reserva e job BullMQ.
- Uma reserva pode conter N itens.
- Criacao da reserva deve ser atomica: pega todos os assentos/vagas ou nenhum.
- Uma reserva ativa por usuario por sessao/evento, considerando `HELD` e `PAYMENT_PENDING`.
- Pagamento recusado volta a reserva para `HELD` e nao reinicia o TTL.
- Pagamento aprovado apos expiracao entra no fluxo de reconciliacao.
- Ingresso so e emitido apos pagamento confirmado e sempre de forma assincrona.
- Provedor de pagamento sera mockado inicialmente, atras de interface.

## Maquinas de estado

Reserva:

- `HELD`
- `PAYMENT_PENDING`
- `CONFIRMED`
- `EXPIRED`
- `CANCELLED`
- `FAILED`

Pagamento:

- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`

Ingresso:

- `PENDING_ISSUE`
- `ISSUED`
- `FAILED`
- `CANCELLED`

## Invariantes importantes

- O banco e a fonte final para venda/ocupacao.
- Redis pode acelerar lock, hold efemero e contagem, mas nao substitui constraint no banco.
- Para assento marcado, um `seat_id` nao pode ter duas ocupacoes ativas.
- Para admissao geral, capacidade precisa ser garantida por operacao atomica de contagem/reserva.
- Webhooks precisam ser idempotentes.
- O webhook nao emite ingresso diretamente; ele registra o pagamento e agenda/outboxa trabalho.
- Fluxos que cruzam pagamento, expiracao e venda precisam usar compare-and-set ou transacao.

## Proximas etapas

A etapa 3 esta implementada e em revisao. A proxima etapa planejada e:

4. Eventos e assentos

Depois entram Redis, atomicidade, BullMQ, checkout, webhook, outbox, emissao, reconciler, retries, observabilidade, testes, painel/admin e documentacao.
