# SOYER EXCHANGE — Telegram Mini App

React + TypeScript frontend, FastAPI backend, aiogram 3 Telegram webhook, SQLite or Supabase PostgreSQL.

## Production architecture

The Telegram bot runs inside the FastAPI service using a webhook. Do not run a second polling process: polling and webhook delivery conflict. Running python bot.py now starts the same webhook-enabled FastAPI application.

## Render configuration

The repository has an extra top-level folder. Use these exact paths:

### Backend Web Service
- Root Directory: SOYER-EXCHANGE1/backend
- Build Command: pip install -r requirements.txt
- Start Command: uvicorn app.api:app --host 0.0.0.0 --port $PORT

Required Environment Variables:
- BOT_TOKEN — current Telegram bot token (keep secret)
- ADMIN_IDS — comma-separated numeric Telegram user IDs
- WEBAPP_URL — exact public HTTPS URL of the frontend
- PUBLIC_BACKEND_URL — exact public HTTPS URL of this backend
- WEBHOOK_SECRET — optional Telegram webhook secret (1–256 chars, letters/numbers/_/-)
- DATABASE_URL — Supabase PostgreSQL connection string; use SSL (sslmode=require)
- CORS_ORIGINS — exact frontend origin, without a trailing slash

### Frontend Static Site
- Root Directory: SOYER-EXCHANGE1/frontend
- Build Command: npm install && npm run build
- Publish Directory: dist
- VITE_API_URL — exact public HTTPS backend URL
- VITE_ADMIN_IDS — comma-separated numeric Telegram user IDs

After changing environment variables, save and redeploy the backend. On startup it initializes the database and registers /telegram/webhook with Telegram.

## Database

When DATABASE_URL is set, the backend uses Supabase PostgreSQL. Otherwise it falls back to SQLite. Render Free's ephemeral filesystem is not suitable for persistent SQLite storage; use PostgreSQL for durable orders and exchange rates.

## Local development

From SOYER-EXCHANGE1/backend:

    py -3.11 -m venv .venv
    .venv\\Scripts\\Activate.ps1
    pip install -r requirements.txt
    uvicorn app.api:app --reload --host 0.0.0.0 --port 8000

For the frontend, from SOYER-EXCHANGE1/frontend:

    npm install
    npm run dev

Open the Mini App from Telegram so Telegram WebApp initData is available.

## Security

- If a bot token, database password, or webhook secret was exposed, rotate it immediately and update Render.
- Never commit .env files or credentials.
- Never request seed phrases, private keys, passwords, or confirmation codes.
- The app creates exchange requests for manual processing; it does not custody funds or perform automatic transfers.
