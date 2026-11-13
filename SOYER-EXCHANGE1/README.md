# SOYER EXCHANGE — Telegram Mini App

React + TypeScript frontend, FastAPI backend, aiogram 3 bot, SQLite database.

## Реализовано
- Telegram Mini App с тёмно-зелёным адаптивным интерфейсом.
- Серверная проверка Telegram initData (HMAC).
- Калькулятор USDT → UAH и UAH → USDT.
- Минимум 10 USDT для направления USDT → UAH.
- Заявки с уникальными номерами и историей.
- Админ API: смена статуса, курсы, акции.
- Telegram-уведомления администратору о новой заявке и пользователю о смене статуса.
- SQLite: users, orders, exchange_rates, promotions, referrals, settings.
- Бот `/start` с кнопкой открытия Mini App.

Важно: приложение принимает запросы для ручного подтверждения менеджером. Оно не принимает средства, не хранит криптовалюту и не выполняет автоматические переводы.

## Локальный запуск — Windows PowerShell

### Backend
```powershell
cd .\backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```
Заполните `backend/.env`: BOT_TOKEN, ADMIN_IDS, WEBAPP_URL (публичный HTTPS URL Mini App), CORS_ORIGINS.
```powershell
uvicorn app.api:app --reload --host 0.0.0.0 --port 8000
```
В другом окне:
```powershell
cd .\backend
.\.venv\Scripts\Activate.ps1
python bot.py
```

### Frontend
```powershell
cd .\frontend
Copy-Item .env.example .env
npm install
```
В `frontend/.env` укажите `VITE_API_URL` и `VITE_ADMIN_IDS`.
```powershell
npm run dev
```
Для авторизованной работы откройте приложение из Telegram, не напрямую в браузере.

## Render
### Backend Web Service
Root Directory: `backend`
Build: `pip install -r requirements.txt`
Start: `uvicorn app.api:app --host 0.0.0.0 --port $PORT`
Добавьте Persistent Disk с mount path `/var/data`, затем переменные:
- `DATABASE_PATH=/var/data/soyer.sqlite3`
- `BOT_TOKEN` (секрет)
- `ADMIN_IDS=123456789,987654321`
- `WEBAPP_URL=https://ВАШ-FRONTEND.onrender.com`
- `CORS_ORIGINS=https://ВАШ-FRONTEND.onrender.com`

### Frontend Static Site
Root Directory: `frontend`
Build: `npm install && npm run build`
Publish directory: `dist`
Environment:
- `VITE_API_URL=https://ВАШ-BACKEND.onrender.com`
- `VITE_ADMIN_IDS=123456789,987654321`

После деплоя задайте точный HTTPS frontend URL в backend `WEBAPP_URL` и `CORS_ORIGINS`, перезапустите backend и запустите бота.

## Безопасность
- Не публикуйте токен; если он раскрывался, отзовите его через BotFather.
- Не добавляйте `.env` в Git.
- Для сохранения SQLite на Render необходим Persistent Disk.
- Не запрашивайте seed phrase, private key, пароль или коды подтверждения.
- Перед запуском финансового сервиса получите юридическую и комплаенс-проверку.
