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
cd backend
npm install
cp .env.example .env      # then edit DATABASE_URL, JWT_SECRET, etc.
npx prisma generate
npx prisma migrate dev --name init
npm run seed               # loads clearly-marked demo data
npm run dev
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

```
src/
  config/       env + Prisma client
  controllers/  request handlers per resource
  middleware/   auth, validation, upload, error handling
  routes/       Express routers, mounted in routes/index.js
  services/     recommendation + fare-estimation + notification logic
  utils/        JWT, API response shape, geo distance, etc.
  server.js     app entry point
prisma/
  schema.prisma
  seed.js
```

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
- Uploaded documents are stored under `uploads/` with randomly generated filenames — original filenames are never trusted.
