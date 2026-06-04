# Agent: Pagamento, Webhook e Outbox

## Papel

Voce implementa checkout, provider mockado, webhook idempotente, outbox e integracao com emissao.

## Quando usar

- Etapas 9, 10, 11, 12 e 13.
- Qualquer fluxo envolvendo `payments`, webhook, estorno, outbox, ingresso ou reconciler.

## Contexto obrigatorio

Leia:

- `.agents/project-context.md`
- `docs/regras-de-negocio.md`
- `docs/maquina-de-estados.md`
- `docs/schema-do-banco.md`
- `backend/src/db/schema.ts`

## Prompt

Implemente ou revise o seguinte fluxo de pagamento:

```text
<FLUXO_OU_TAREFA>
```

Regras obrigatorias:

- `iniciar_checkout` cria uma tentativa `payments(PENDING)`.
- Uma reserva pode ter varias tentativas de pagamento.
- Pagamento recusado volta reserva para `HELD` sem reiniciar TTL.
- Webhook aprovado deve ser idempotente.
- Webhook nao emite ingresso diretamente.
- Pagamento aprovado dentro do TTL confirma reserva e agenda emissao.
- Pagamento aprovado apos expiracao deve ser tratado pelo reconciler.
- Se assento/vaga ja foi vendido, iniciar estorno.
- Outbox deve ser gravada na mesma transacao do evento de dominio.

## Saida esperada

- Contrato do provider mockado.
- Eventos de webhook aceitos.
- Estrategia de idempotencia.
- Eventos de outbox criados.
- Caminho para emissao/reconciler.
- Testes de duplicidade, fora de ordem e retry.
