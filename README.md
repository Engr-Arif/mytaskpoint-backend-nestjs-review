# MyTaskPoint Backend

[![CI](https://github.com/Engr-Arif/mytaskpoint-backend-nestjs-review/actions/workflows/ci.yml/badge.svg)](https://github.com/Engr-Arif/mytaskpoint-backend-nestjs-review/actions)

A NestJS backend for task management using Prisma, Postgres and Redis.

## Features

- REST API built with NestJS
- PostgreSQL via Prisma (schema + migrations included)
- Redis for caching/rate-limiting
- Authentication with JWT
- Tests with Jest

## Quickstart (development)

Prerequisites:

- Node.js 18+ and npm
- Docker & Docker Compose (recommended for local DB + Redis)

1. Install dependencies

```bash
npm ci
```

2. Copy env example

```bash
cp env.example .env
# Edit .env to set DATABASE_URL and other secrets
```

3. Start local Postgres + Redis (recommended)

```bash
docker compose up -d
```

4. Run Prisma migrations and seed (if any)

```bash
npx prisma migrate dev --name init
node prisma/seed.ts
```

5. Start dev server

```bash
npm run start:dev
```

## Running tests

- Unit tests

```bash
npm run test
```

- E2E tests (requires Postgres + Redis running as above)

```bash
npm run test:e2e
```

## Linting and type checks

```bash
npm run lint:ci
npm run typecheck:strict
```

## Docker Compose (local dev)

See `docker-compose.yml` for a ready-to-run Postgres and Redis configuration. Use it to run migrations and tests locally.

## CI

This repo includes a GitHub Actions workflow to run lint/typecheck/tests on push and PRs.

E2E tests: A separate GitHub Actions workflow (`.github/workflows/e2e.yml`) runs end-to-end tests using service containers (Postgres + Redis). The workflow runs on push/PRs to `main`/`master` and can also be triggered manually via workflow_dispatch.

To run e2e locally, start Postgres and Redis via Docker Compose (see `docker-compose.yml`), run migrations and seed, then run `npm run test:e2e`.

## Notes for reviewers

- No secrets are committed. Use `.env` to configure runtime secrets.
- See `prisma/migrations` for database change history.

Environment variables of note:

- `ALLOWED_ORIGINS` (comma-separated): the list of allowed CORS origins for non-development environments. Example: `https://app.example.com,https://admin.example.com`.
- `CI_ALLOW_EMPTY_ALLOWED_ORIGINS` (boolean): when set to `true`, CI will not fail if `ALLOWED_ORIGINS` is empty. Use only to intentionally bypass the CI safety check.

## Next steps / optional

- Add API docs (Swagger) or a Postman collection for example requests.
- Add a `make` or npm script to run all local setup steps.

## Project setup

$ npm install

## Compile and run the project

# development

$ npm run start

# watch mode

$ npm run start:dev

# production mode

$ npm run start:prod

## Run tests

# unit tests

$ npm run test

# e2e tests

$ npm run test:e2e

# test coverage

$ npm run test:cov

## Sharing with recruiters / reviewers

When sharing this repository link, include a short message with the branch you want reviewed and any specific areas to focus on (e.g., auth, task allocation, performance). Reviewers can quickly verify the project locally with these steps:

1. Clone the repo and checkout the branch you want reviewed.

```bash
git clone <repo-url>
cd mytaskpoint-backend-nestjs-review
git checkout <branch-name>
```

2. Install dependencies and prepare environment

```bash
npm ci
cp env.example .env
# Edit .env to set secure JWT secrets and DATABASE_URL (for local Docker use the defaults in env.example)
```

3. Start Postgres and Redis

```bash
docker compose up -d
```

4. Run migrations and start the app

```bash
npx prisma migrate dev --name init
npm run start:dev
```

5. Useful checks for reviewers

- `docker compose ps` — ensure Postgres and Redis are Up
- `npm run lint:ci` — linting
- `npm run typecheck:strict` — type checking
- `npm run test` — run unit tests

If you want, I can also add a short Postman collection or Swagger docs to make API review easier.
