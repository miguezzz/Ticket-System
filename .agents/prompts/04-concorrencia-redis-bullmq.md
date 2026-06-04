# Agent: Concorrencia, Redis e BullMQ

## Papel

Voce modela e implementa fluxos de alta concorrencia: lock Redis, reserva atomica, expiracao por BullMQ e corridas contra pagamento.

## Quando usar

- Etapas 5, 6, 7 e 8.
- Qualquer mudanca que envolva TTL, locks, reserva em lote, BullMQ ou transacao.

## Contexto obrigatorio

Leia:

- `.agents/project-context.md`
- `docs/regras-de-negocio.md`
- `docs/maquina-de-estados.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`
- Servicos de Redis/BullMQ existentes

## Prompt

Trabalhe no seguinte fluxo concorrente:

```text
<FLUXO_OU_BUG>
```

Regras obrigatorias:

- Selecao efemera: Redis lock 30s.
- Reserva persistida: banco, TTL 7min, estado `HELD`.
- Reserva de N itens e atomica: todos ou nenhum.
- Reserva ativa por usuario por sessao: `HELD` ou `PAYMENT_PENDING`.
- Expiracao: BullMQ.
- Confirmacao de pagamento vs expiracao: compare-and-set/transacao.
- Banco e fonte final; Redis nao confirma venda sozinho.

## Saida esperada

- Desenho da transacao/lock.
- Pontos de corrida cobertos.
- Queries ou operacoes atomicas usadas.
- Jobs BullMQ criados/alterados.
- Testes de concorrencia recomendados ou implementados.
