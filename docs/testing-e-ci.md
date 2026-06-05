# Testes e CI

> Regra global: nenhuma etapa avanca sem testes automatizados criados/atualizados,
> suite completa executada e todos os testes passando. Testes existentes nunca
> devem ser deletados.

## Backend

O backend usa Jest + Supertest para testes e2e da API contra PostgreSQL.

Para validacoes exploratorias via HTTP/SQL, use tambem
[manual-testes.md](./manual-testes.md).

Comando local via Docker Compose:

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
```

Esse comando:

1. sobe o Postgres local;
2. reconstrui o stage `test` do Dockerfile para copiar codigo/testes atuais;
3. roda `npm ci` dentro do build;
4. executa `npm run test:ci`;
5. aplica migrations antes dos testes;
6. roda a suite e2e.

Sem o `build`, o `run` pode reaproveitar uma imagem antiga e executar uma suite
desatualizada.

## Scripts

Dentro de `backend`:

```bash
npm run test:e2e
npm run test:ci
```

- `test:e2e`: aplica migrations e roda Jest/Supertest.
- `test:ci`: roda build e depois `test:e2e`.

## Pipeline

Um CI/CD pode usar o mesmo contrato do Docker Compose:

```bash
docker compose --profile test build backend-test
docker compose --profile test run --rm backend-test
docker compose build backend
```

Ainda nao foi escolhido um provedor de CI/CD. Quando isso for decidido, registrar
o workflow especifico aqui.
