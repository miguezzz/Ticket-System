# Plano - Validacao Rigida com Zod

## Objetivo

Revisar as tipagens e validacoes do backend para que a entrada HTTP seja rigida,
previsivel e separada das regras de negocio.

Esta etapa vem antes de seguir com BullMQ porque os proximos fluxos vao aumentar
o numero de contratos de API, jobs, payloads e eventos internos.

## Decisoes ja aprovadas pelo usuario

- Usar Zod para validacao runtime.
- Nao inflar os arquivos atuais com interfaces/DTOs grandes.
- Separar schemas, tipos e validadores por pastas.
- Conversar sobre ambiguidades antes de implementar.
- Manter testes automatizados; nenhum teste deve ser deletado.

## Problema atual

- Controllers recebem `string` cru em `@Param()` e `unknown` em `@Body()`.
- Services fazem parsing e validacao manual com helpers locais.
- Campos extras no body passam silenciosamente.
- Params e query params nao estao padronizados.
- Tipos de contrato HTTP nao ficam centralizados.
- Services misturam validacao de entrada com regra de negocio.

## Direcao proposta

Separar tres camadas:

1. Entrada HTTP
   - valida `params`, `query` e `body`;
   - rejeita campos desconhecidos;
   - rejeita tipos errados;
   - transforma erro de Zod em `400 Bad Request` padronizado.

2. Comandos internos tipados
   - services deixam de receber `unknown`;
   - services recebem objetos ja parseados por Zod.

3. Regras de negocio
   - continuam nas services;
   - exemplos: setor ocupado nao pode ser editado, capacity obrigatoria em
     sessao `GENERAL`, hold Redis precisa pertencer ao `selectionId`.

## Estrutura de pastas proposta

```text
backend/src/common/validation/
  zod-validation.pipe.ts
  zod-error.ts
  schemas.ts

backend/src/events/schemas/
  events.schemas.ts
  admin-events.schemas.ts
  availability.schemas.ts

backend/src/holds/schemas/
  holds.schemas.ts

backend/src/reservations/schemas/
  reservations.schemas.ts
```

Observacoes:

- `common/validation` deve conter apenas infraestrutura reaproveitavel.
- Cada modulo deve possuir seus schemas perto do controller/service do proprio
  modulo.
- Tipos devem ser inferidos com `z.infer<typeof schema>`, evitando interfaces
  manuais duplicadas.
- Enums locais devem nascer de arrays `as const` ou de schemas Zod exportados.

## Padrao de schema

Preferir schemas `.strict()` para body e query:

```ts
const createEventBodySchema = z
  .object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

type CreateEventBody = z.infer<typeof createEventBodySchema>;
```

Para params:

```ts
const uuidParamSchema = z.string().uuid();
```

## Decisoes recomendadas, ainda pendentes

Confirmar antes de implementar:

- Rejeitar qualquer campo extra em todos os bodies? Recomendacao: sim.
- Rejeitar numeros enviados como string? Exemplo: `"quantity": "2"`.
  Recomendacao: sim.
- Permitir string vazia em campos opcionais como `description` e `room`,
  convertendo para `null`, ou rejeitar? Hoje o sistema converte para `null`.
- Padronizar resposta de erro como lista de campos? Exemplo:

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "items.0.seatId", "message": "Invalid UUID" }
  ]
}
```

## Ordem de migracao proposta

1. Instalar Zod e criar infraestrutura comum de validacao.
2. Migrar `events` e endpoints admin de eventos/sessoes/setores/precos/assentos.
3. Migrar `holds`.
4. Migrar `reservations`.
5. Remover helpers manuais duplicados quando deixarem de ser usados.
6. Documentar o padrao em `docs`.

## Testes obrigatorios nesta etapa

Adicionar testes negativos sem deletar os existentes:

- UUID invalido em `params`.
- Body com campo extra.
- Enum invalido.
- Numero enviado como string.
- Array vazio onde nao pode.
- Body ausente.
- Query `selectionId` invalida.
- Payload `ASSIGNED` com campo de `GENERAL` e vice-versa.

## Criterio de pronto

- Controllers validam entrada com Zod antes de chamar services.
- Services nao recebem mais `unknown` nos fluxos migrados.
- Campos extras sao tratados conforme decisao do usuario.
- Erros de validacao sao consistentes.
- Testes existentes e novos passam via Docker:

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
```
