# Etapa 2 — Máquina de Estados

> Status: **proposta (revisada), aguardando aval.**
> Base: [regras-de-negocio.md](./regras-de-negocio.md). Próxima: Etapa 3 (schema).
> Sem diagramas — só texto e tabelas (o diagrama geral vem depois, a pedido).

A modelagem usa **três máquinas de estado independentes** que se compõem:

- **Reserva** — o carrinho / ciclo de compra
- **Pagamento** — uma tentativa de cobrança
- **Ingresso** — a emissão do bilhete

Separar é melhor que uma máquina monolítica: cada uma tem dono e gatilhos
próprios, e os casos difíceis (pagamento atrasado, estorno) viram **combinações**
de estados entre máquinas, não estados especiais dentro da Reserva.

Fontes de sinal: **usuário** (UI), **webhook** de pagamento (mockado),
**BullMQ** (TTL, Etapa 8), **reconciler** (Etapa 13), **worker de emissão** (Etapa 12).

---

## Máquina 1 — Reserva

Estados: `HELD` · `PAYMENT_PENDING` · `CONFIRMED` · `EXPIRED` · `CANCELLED` · `FAILED`

Fase efêmera anterior — `SELECTING` — vive **só no Redis** (lock 30s), sem linha no
banco. A Reserva nasce em `HELD` no `add_to_cart`. Se o lock de 30s expira antes do
add-to-cart, nada é persistido.

Fluxo principal (texto): `SELECTING → HELD → PAYMENT_PENDING → CONFIRMED`.
Saídas: de `HELD`/`PAYMENT_PENDING` para `EXPIRED` (TTL) ou `CANCELLED` (usuário);
de `CONFIRMED` para `CANCELLED` (cancelamento pré-evento); `EXPIRED → CONFIRMED`
(reconciler, pagamento atrasado); qualquer estado → `FAILED` (erro irrecuperável).

| # | Evento | De → Para | Ator | Guarda | Efeitos | Atômico |
|---|---|---|---|---|---|---|
| 1 | `add_to_cart` | (∅) → HELD | usuário | sem reserva ativa no evento (regra 6); **teto da sessão** não excedido (Q1); N assentos travados no Redis por este usuário | cria reserva + N itens; arma job TTL 7min | **sim** — N ou nada |
| 2 | `iniciar_checkout` | HELD → PAYMENT_PENDING | usuário | — | cria `Pagamento(PENDING)`; trava carrinho (sem trocar assento) | sim |
| 3 | `pagamento_aprovado` | PAYMENT_PENDING → CONFIRMED | webhook | estado == PAYMENT_PENDING **e** não expirado | assentos → `vendido`; cancela TTL; cria `Ingresso(PENDING_ISSUE)` | **sim** — corre c/ #5 |
| 4 | `pagamento_recusado` | PAYMENT_PENDING → HELD | webhook | — | `Pagamento → FAILED`; **não** mexe no TTL (Q2) | sim |
| 5 | `ttl_expirado` | HELD / PAYMENT_PENDING → EXPIRED | BullMQ | TTL atingido | libera assentos | **sim** — corre c/ #3 |
| 6 | `cancelar` | HELD / PAYMENT_PENDING → CANCELLED | usuário | — | libera assentos; cancela TTL; anula pagamento pendente | sim |
| 7 | `reconciliar_ok` | EXPIRED → CONFIRMED | reconciler | `Pagamento == PAID` **e** assentos ainda livres → readquire | assentos → `vendido`; cria `Ingresso(PENDING_ISSUE)` | **sim** |
| 8 | `cancelar_pago` | CONFIRMED → CANCELLED | usuário | `agora < início_evento − 2h` (regra 11) | `Pagamento → REFUNDED`; libera assentos; `Ingresso → CANCELLED` | sim |
| 9 | `falha_irrecuperável` | (qualquer) → FAILED | sistema | dead-letter / erro não recuperável | alerta ops | — |

**Reserva ativa (regra 6)** = `{ HELD, PAYMENT_PENDING }`. `CONFIRMED` já é compra
concluída (libera o usuário p/ nova reserva, respeitando o teto). Vira índice único
parcial em (usuário, sessão) no schema.

---

## Máquina 2 — Pagamento

Estados: `PENDING` · `PAID` · `FAILED` · `REFUNDED`

Fluxo (texto): `PENDING → PAID` (aprovado) ou `PENDING → FAILED` (recusado);
`PAID → REFUNDED` (estorno). `FAILED` e `REFUNDED` são finais.

| Evento | De → Para | Ator | Observação |
|---|---|---|---|
| `iniciar_checkout` | (∅) → PENDING | usuário | uma Reserva pode ter **várias tentativas** (cada recusa = um Pagamento FAILED) |
| `webhook_aprovado` | PENDING → PAID | webhook | idempotente por id de evento (Etapa 10) |
| `webhook_recusado` | PENDING → FAILED | webhook | não cancela a Reserva (Q2) |
| `estorno` | PAID → REFUNDED | reconciler / usuário | cancelamento pré-evento (regra 11) ou assento já vendido no reconcile (regra 5) |

> ⚠️ Como o provedor está **mockado**, o estorno é síncrono → `REFUNDED` direto.
> Com provedor real e estorno assíncrono, talvez seja preciso um `REFUND_PENDING`.
> Marcado para reavaliar na Etapa 9.

---

## Máquina 3 — Ingresso

Estados: `PENDING_ISSUE` · `ISSUED` · `FAILED` · `CANCELLED`

Fluxo (texto): `PENDING_ISSUE → ISSUED` (emitido) ou `→ FAILED` (falha após retries,
com `FAILED → PENDING_ISSUE` no retry). De `PENDING_ISSUE` **ou** `ISSUED` pode ir a
`CANCELLED` quando a Reserva é cancelada/estornada.

| Evento | De → Para | Ator |
|---|---|---|
| `reserva_confirmada` | (∅) → PENDING_ISSUE | sistema (na transição #3 / #7 da Reserva) |
| `emitido` | PENDING_ISSUE → ISSUED | worker de emissão |
| `falha_emissao` | PENDING_ISSUE → FAILED | worker (após retries — Etapa 14) |
| `retry` | FAILED → PENDING_ISSUE | job de reprocesso |
| `cancelar_ingresso` | PENDING_ISSUE / ISSUED → CANCELLED | sistema (em `cancelar_pago` da Reserva, regra 11) |

> Com o estado próprio `CANCELLED`, a invalidação é explícita: um ingresso já emitido
> deixa de ser válido ao virar `CANCELLED`, sem depender de "ler o estado da Reserva".

---

## Cenários compostos (as regras difíceis viram combinações)

| Cenário | Reserva | Pagamento | Ingresso |
|---|---|---|---|
| **Caminho feliz** | HELD → PAYMENT_PENDING → CONFIRMED | PENDING → PAID | PENDING_ISSUE → ISSUED |
| **Expira sem pagar** | HELD/PAYMENT_PENDING → EXPIRED | (PENDING) | — |
| **Recusa + retry** (Q2) | PAYMENT_PENDING → HELD → PAYMENT_PENDING | FAILED, depois novo PENDING → PAID | … |
| **Pagamento atrasado, assento livre** (regra 5) | EXPIRED → CONFIRMED | PAID | PENDING_ISSUE → ISSUED |
| **Pagamento atrasado, assento vendido** (regra 5) | EXPIRED (fica) | PAID → REFUNDED | — |
| **Cancelamento pré-evento** (regra 11) | CONFIRMED → CANCELLED | PAID → REFUNDED | ISSUED → CANCELLED |

O **reconciler** (Etapa 13) é quem procura a combinação `Reserva=EXPIRED + Pagamento=PAID`
e decide entre reconfirmar (#7) ou estornar.

---

## Pontos de corrida (detalhados na Etapa 7)

- **#3 vs #5** (aprovação × expiração): compare-and-set no estado
  (`UPDATE ... WHERE estado='PAYMENT_PENDING'`). Quem perde cai no fluxo de pagamento
  atrasado.
- **#7** (reconciler readquirindo assento): reaquisição atômica contra novas vendas.

---

## Questões da Etapa 2 — RESPONDIDAS

- ✅ **Q1 — teto de ingressos:** definido no **cadastro da sessão** (campo da Sessão).
  Validação no `add_to_cart` conta ingressos `ISSUED` + reservas ativas do usuário.
- ✅ **Q2 — pagamento recusado:** **não expira automaticamente**; volta a `HELD` e
  permite novo checkout até o TTL.
- ✅ **Q3 — estado de checkout:** existe, nomeado `PAYMENT_PENDING` (vs `HELD`).

---

## Histórico

- Etapa 2 revisada para 3 máquinas (Reserva/Pagamento/Ingresso) conforme modelagem do
  cliente; 3 perguntas respondidas; Ingresso ganhou estado `CANCELLED`. Docs sem
  diagramas (mermaid) a pedido — diagrama geral virá depois. Aguardando aval para a
  Etapa 3 (schema).
