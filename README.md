# LoadLink Pakistan — Backend

Node.js + Express + PostgreSQL (via Prisma) REST API for the LoadLink Pakistan
truck & load marketplace.

## Stack
- Express.js
- PostgreSQL + Prisma ORM
- JWT authentication, bcrypt password hashing
- Multer for CNIC / license / vehicle document uploads
- Helmet, CORS, express-rate-limit for security

## Setup

```bash
npm install
cp .env.example .env
# edit DATABASE_URL, JWT_SECRET, and other required settings
npx prisma generate
npm run prisma:push
npm run seed               # optional demo data for development only
npm start
```

The API starts on `http://localhost:5000` (or `PORT` from `.env`).
Health check: `GET http://localhost:5000/api/health`.

## Demo accounts (from `npm run seed`)
| Role              | Mobile        | Password    |
|-------------------|---------------|-------------|
| Admin             | 03000000000   | Demo1234!   |
| Customer          | 03001111111   | Demo1234!   |
| Driver (verified) | 03002222222   | Demo1234!   |
| Driver (pending)  | 03003333333   | Demo1234!   |

These are demo accounts only — clearly not real users.

## Project layout

The repository uses a flat Node.js/Express structure:

```
server.js
index.js
auth.controller.js
auth.routes.js
auth.rateLimit.js
auth.js
payment.controller.js
payment.routes.js
trip.controller.js
vehicle.controller.js
transporter.controller.js
document.controller.js
document.routes.js
upload.js
notification.service.js
audit.js
schema.prisma
scripts/
```

Prisma schema is in `schema.prisma`; runtime configuration is in `env.js`.

## API response shape

Success:
```json
{ "success": true, "message": "...", "data": {} }
```
Error:
```json
{ "success": false, "message": "...", "errors": [] }
```

## Notes
- Passwords are hashed with bcrypt; the JWT secret and DB credentials live only in `.env` (never committed).
- Booking accept/reject and trip status transitions run inside Prisma transactions to prevent two drivers accepting the same load.
- Fare estimates are configurable (`BASE_FARE`, `PER_KM_RATE` in `.env`) and are never presented as a guaranteed final price.
- Uploaded identity, vehicle, and delivery documents are private and are served only through authenticated `/api/documents/:filename`.
- Document storage is configurable with `UPLOADS_DIR`. Local development falls back to `./uploads`; production on Render should use a persistent disk mount.
- JWT sessions are stored in an HttpOnly `ll_auth` cookie; the frontend does not store the JWT in localStorage.
- Authentication endpoints have dedicated IP + identifier rate limits in addition to the global API limiter.
- Payment webhooks require the configured HMAC signature (legacy secret header remains accepted for compatibility) and duplicate webhook deliveries are handled idempotently.
- Payment amounts for trip payments are validated against the booking's agreed fare.


## Production features added

The application now includes:
- password reset tokens with optional Resend/Twilio delivery
- in-app notifications plus optional Web Push/SMS/WhatsApp delivery
- payment records, admin payment confirmation, webhook handling, and platform commission fields
- Easypaisa/JazzCash hosted-checkout configuration hooks (merchant credentials/checkout URL required)
- live trip SSE endpoint and automatic browser geolocation updates for drivers
- driver booking accept/reject workflow and agreed fare/commission tracking
- admin dashboard APIs for payments, audit logs, document expiry, and transporter verification
- driver/vehicle document expiry tracking
- Render runtime public URL wiring and production environment placeholders

### Render production checklist

1. Set `NODE_ENV=production`.
2. Set a long random `JWT_SECRET` and `PAYMENT_WEBHOOK_SECRET`.
3. Set `DATABASE_URL` to the production PostgreSQL database.
4. Set `FRONTEND_URL` to the exact production frontend origin (avoid `*`).
5. Add a Render persistent disk and set `UPLOADS_DIR` to its mount path, for example `/var/data/loadlink-uploads`.
6. Configure `PUBLIC_APP_URL` to the public HTTPS app URL.
7. Configure email/SMS and payment-provider credentials only when needed.
8. Keep `ADMIN_BOOTSTRAP_ENABLED=false` after initial admin setup unless a controlled bootstrap is required.
9. Do not run `npm run seed` against production.

### Production secrets/integrations

Set the relevant variables in Render Environment. Do not commit secrets. Optional integrations remain disabled until their provider credentials are configured. See .env.example.

For Easypaisa and JazzCash, obtain merchant credentials/checkout details from the provider and configure the corresponding checkout settings before accepting real payments.
