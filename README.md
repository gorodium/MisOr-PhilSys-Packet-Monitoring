# PhilSys Packet Matrix Monitoring System

Internal monitoring and automation MVP for matching PhilSys packet rows from Google Sheets against Matrix tickets.

## Stack

- Next.js App Router and TypeScript
- PostgreSQL with Prisma ORM
- Google Sheets API adapter with demo fallback
- Matrix adapter boundary with demo and generic HTTP modes
- Server-side API routes for sync, automation, settings, and logs
- Compact CSS dashboard UI

## Setup

1. Install dependencies.

```bash
npm install
```

2. Copy `.env.example` to `.env` and set `DATABASE_URL`.

```bash
cp .env.example .env
```

3. Start PostgreSQL, or use the included local database container.

```bash
docker compose up -d postgres
```

4. Generate Prisma Client and create the database schema.

```bash
npm run prisma:generate
npm run db:migrate
```

5. Seed demo data.

```bash
npm run db:seed
```

6. Start the app.

```bash
npm run dev
```

Open `http://localhost:3000/dashboard`.

## Demo Mode

`DEMO_MODE=true` and `MATRIX_MODE=demo` let the app run without Google or Matrix credentials. Demo mode reads fixed packet rows, uses fixed Matrix tickets/replies, skips Google Sheet writeback, and keeps automatic ticket creation disabled unless an admin explicitly enables it in settings.

## Google Sheets Configuration

Set these values in `.env` or through the Settings page:

- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_SHEET_NAME`
- `GOOGLE_PACKET_COLUMN_NAME`
- `GOOGLE_ISSUE_CATEGORY_COLUMN_NAME`
- `GOOGLE_OUTPUT_FILED_STATUS_COLUMN`
- `GOOGLE_OUTPUT_TICKET_NUMBER_COLUMN`
- `GOOGLE_OUTPUT_REMARKS_COLUMN`
- `GOOGLE_OUTPUT_LAST_UPDATED_COLUMN`

Set these secrets only in `.env` for this MVP:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Writeback only targets the configured output columns. It does not overwrite the source packet column.

## Matrix Configuration

Use `MATRIX_MODE=demo` for local testing.

For a JSON API, set:

- `MATRIX_MODE=http`
- `MATRIX_BASE_URL`
- `MATRIX_API_KEY`
- `MATRIX_FETCH_TICKETS_PATH`
- `MATRIX_TICKET_DETAILS_PATH`
- `MATRIX_SEARCH_PATH`
- `MATRIX_CREATE_TICKET_PATH`
- `MATRIX_REPLIES_PATH`

Paths may include `{ticketId}` or `{packetCode}` placeholders. Because Matrix payload formats vary, the HTTP adapter accepts common field names such as `id`, `ticketId`, `ticketNumber`, `number`, `title`, `subject`, `body`, `description`, `status`, `createdAt`, and `updatedAt`.

`MATRIX_MODE=browser` is isolated as a replaceable adapter but intentionally not implemented in this MVP. Add browser automation there only if no official API is available.

## Security Notes

- Matrix and Google credentials are never sent to client components.
- Mutating API routes require the admin role.
- In production, leave `APP_DEFAULT_ROLE=viewer` and set `TRUSTED_AUTH_HEADER=true` behind a trusted reverse proxy or SSO layer.
- Store secrets in environment variables for this MVP. The `AppSetting` table is used for non-secret configuration unless encryption is added.
- Auto ticket creation defaults to disabled.

## Verification

```bash
npm run typecheck
npm run build
```

## Main Routes

- `/dashboard`
- `/automation`
- `/settings`
- `/logs`
- `/packets/[id]`

## API Routes

- `GET /api/packets`
- `GET /api/packets/:id`
- `POST /api/sync/google-sheet`
- `POST /api/sync/matrix`
- `POST /api/sync/full`
- `POST /api/automation/dry-run`
- `POST /api/automation/create-tickets`
- `POST /api/automation/run`
- `GET /api/logs`
- `GET /api/settings`
- `POST /api/settings`
