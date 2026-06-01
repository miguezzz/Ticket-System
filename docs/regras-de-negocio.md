# Etapa 1 — Regras de Negócio

> Status: **fechada e aprovada** · Base para a Etapa 2 (máquina de estados).
> Itens marcados com ⏳ ainda precisam de decisão antes da etapa indicada.

Documento de decisões do novo backend. Cada decisão indica em quais etapas
seguintes ela vai impactar.

---

## 1. Ciclo de vida da reserva (dois tempos distintos)

A reserva tem **duas fases separadas**, cada uma com seu próprio mecanismo de
concorrência e expiração:

### Fase A — Seleção de assento (efêmera)
- Enquanto o usuário **escolhe** o(s) assento(s), a concorrência é tratada por
  um **lock no Redis com TTL de 30s**.
- Esse lock **não é** uma reserva: serve só para evitar que dois usuários
  cliquem no mesmo assento ao mesmo tempo durante a escolha.

### Fase B — Reserva / carrinho (persistida)
- A **reserva de verdade só é criada ao "adicionar ao carrinho"**.
- A partir daí, a reserva tem **TTL de 7 minutos** para concluir o pagamento.
- A **expiração da reserva é responsabilidade do BullMQ** (job agendado que
  remove reservas expiradas e libera os assentos).

→ *Impacta:* Redis/hold (Etapa 6), atomicidade (Etapa 7), BullMQ/expiração
(Etapa 8). A máquina de estados (Etapa 2) precisa distinguir "selecionando"
de "reservado no carrinho".

---

## 2. Escolha de assento — dois tipos de evento

| Tipo de evento | Assento | Modelo |
|---|---|---|
| **Cinema** | Assento marcado (específico) | mapa de assentos |
| **Show grande** | Admissão geral | só contador de capacidade |

A máquina de estados é a **mesma** para os dois; muda apenas a unidade
(assento específico vs. vaga de capacidade).

→ *Impacta:* Schema (Etapa 3) — `seat` como entidade no cinema, contador de
capacidade no show geral. Eventos/assentos (Etapa 4).

---

## 3. Múltiplos assentos

- Uma reserva pode conter **N assentos** (compra em grupo).
- A unidade de reserva é o **carrinho com N assentos**, não 1 assento.

→ *Impacta:* Atomicidade (Etapa 7) — **ou pega todos os assentos, ou nenhum**.
Schema (Etapa 3) — relação reserva → vários assentos.

---

## 4. Pagamento x TTL

- O pagamento **precisa ser aprovado dentro do TTL de 7 min**.
- TTL expirou → reserva **cancelada** e assentos **liberados** (via BullMQ).

→ *Impacta:* corrida entre expiração (Etapa 8) e aprovação (Etapas 9–10).

---

## 5. Pagamento aprovado **depois** da reserva expirar

Caso clássico de reconciliação. Regra:

- Assento **ainda livre** → reemite / confirma a venda normalmente.
- Assento **já vendido** para outro → **estorno automático**.

→ *Impacta:* É a regra-chave da máquina de estados (Etapa 2) — exige estados
do tipo `EXPIRADA_PAGA` / `ESTORNO_PENDENTE`. Webhook idempotente (Etapa 10)
e Reconciler (Etapa 13) existem para tratar isso.

---

## 6. Reservas ativas por usuário

- **Uma reserva ativa por usuário por evento.**
- Para criar outra reserva, o cliente precisa **finalizar a anterior**
  (cancelando ou completando).

→ *Impacta:* restrição de unicidade no schema (Etapa 3) + validação na entrada
do hold/carrinho.

---

## 7. Emissão do ingresso

- Emitido **somente após pagamento confirmado**.
- Emissão é **assíncrona** (nunca dentro do webhook).

→ *Impacta:* Outbox (Etapa 11) + fila de emissão (Etapa 12). O webhook apenas
registra o fato do pagamento; a emissão acontece depois, de forma desacoplada.

---

## 8. Provedor de pagamento

- **Mockado por enquanto.**
- O contrato (criação de cobrança + webhook de confirmação) deve ficar atrás de
  uma interface, para trocar por provedor real depois sem mexer no domínio.

→ *Impacta:* Checkout (Etapa 9), Webhook idempotente (Etapa 10).

---

## 9. Preços / categorias de assento

Três categorias:
- **Inteira**
- **Meia**
- **Premium**

→ *Impacta:* Schema (Etapa 3) — categoria/preço por assento ou por setor.

---

## 10. Fila virtual (waiting room)

- A fila virtual é acionada **por gatilho de volume de acessos**.
- ⏳ **A definir antes da Etapa 8:** qual a métrica e o limiar do gatilho
  (ex.: nº de sessões ativas simultâneas, RPS no endpoint de reserva,
  taxa de conflito de assentos, etc.).

→ *Impacta:* BullMQ/fila (Etapa 8).

---

## 11. Cancelamento / reembolso

- Permitido **somente até 2h antes do evento**.
- Após esse limite, sem reembolso.

→ *Impacta:* máquina de estados (Etapa 2) — transição de cancelamento
condicionada ao horário do evento.

---

## Pendências em aberto

- ⏳ **Gatilho da fila virtual** (item 10) — definir métrica + limiar antes da Etapa 8.

---

## Histórico

- Etapa 1 fechada conforme respostas do cliente. Próxima: **Etapa 2 — Máquina de estados.**
