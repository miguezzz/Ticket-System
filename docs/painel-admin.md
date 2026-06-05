# Etapa 17 - Painel/Admin

> Status: **backlog**.
> Este documento registra requisitos ja decididos para quando chegarmos na etapa
> de painel/admin.

---

## Reservas em aberto

Criar uma tela operacional para visualizar reservas em aberto separadas por status.

### Layout

- Reservas devem aparecer em formato de cards.
- Cards devem ser agrupados por status, por exemplo:
  - `HELD`
  - `PAYMENT_PENDING`
  - futuramente outros status operacionais, se fizer sentido.
- Cada card deve ter uma barra fina na parte superior.

### Barra de expiracao

A barra superior do card deve mostrar visualmente quanto tempo falta para a reserva
expirar.

Regra visual desejada:

- reserva recem-criada: barra cheia ou quase cheia;
- conforme `expires_at` se aproxima: barra diminui;
- reserva perto de expirar: barra deve indicar urgencia visual.

Dados necessarios:

- `reservations.expires_at`
- TTL total da reserva, atualmente 7 minutos
- horario atual do cliente ou do servidor

### Informacoes no card

Campos candidatos para o card:

- ID curto da reserva
- status
- usuario (`user_id`, ate auth real existir)
- sessao/evento
- quantidade de itens
- total em centavos/reais
- tempo restante ate expiracao
- assentos ou setor, quando aplicavel

### Observacoes

- A tela deve ser operacional, densa e facil de escanear.
- Nao implementar antes das etapas de Redis, expiracao por BullMQ e checkout, salvo
  se for explicitamente antecipada.
- Quando esta etapa for implementada, criar testes automatizados e nao remover
  testes existentes.
