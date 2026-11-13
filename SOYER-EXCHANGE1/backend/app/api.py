
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart, Command
from aiogram.types import (
    Message,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
    Update,
)

from . import db
from .auth import current_user, admin
from .config import (
    BOT_TOKEN,
    CORS_ORIGINS,
    WEBAPP_URL,
    ADMIN_IDS,
    PUBLIC_BACKEND_URL,
    WEBHOOK_SECRET,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("soyer")

bot = None
dp = None


def is_admin(user_id):
    try:
        return int(user_id) in ADMIN_IDS
    except (TypeError, ValueError):
        return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global bot, dp

    db.init()

    if BOT_TOKEN:
        if not PUBLIC_BACKEND_URL.startswith("https://"):
            logger.error("PUBLIC_BACKEND_URL must use HTTPS")
        else:
            bot = Bot(BOT_TOKEN)
            dp = Dispatcher()

            @dp.message(CommandStart())
            async def start(message: Message):
                logger.info("Received /start from Telegram user %s", message.from_user.id if message.from_user else "unknown")
                if not WEBAPP_URL.startswith("https://"):
                    await message.answer(
                        "SOYER EXCHANGE тимчасово налаштовується."
                    )
                    return

                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[[
                        InlineKeyboardButton(
                            text="💱 Відкрити SOYER EXCHANGE",
                            web_app=WebAppInfo(url=WEBAPP_URL)
                        )
                    ]]
                )

                await message.answer(
                    "👋 Ласкаво просимо до SOYER EXCHANGE!\n\n"
                    "💱 Обмін USDT та UAH\n"
                    "📋 Створення заявок\n"
                    "🤝 Підтримка менеджера",
                    reply_markup=keyboard
                )

            @dp.message(Command("help"))
            async def help_command(message: Message):
                await message.answer(
                    "SOYER EXCHANGE\n\n"
                    "/start — відкрити застосунок\n"
                    "/help — допомога\n"
                    "/admin — панель адміністратора"
                )

            @dp.message(Command("admin"))
            async def admin_command(message: Message):
                if not message.from_user:
                    return

                if not is_admin(message.from_user.id):
                    await message.answer(
                        "⛔ У вас немає доступу до панелі адміністратора."
                    )
                    return

                if not WEBAPP_URL.startswith("https://"):
                    await message.answer(
                        "⚠️ Mini App ще не налаштовано."
                    )
                    return

                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[[
                        InlineKeyboardButton(
                            text="👑 Відкрити панель адміністратора",
                            web_app=WebAppInfo(url=f"{WEBAPP_URL}{'&' if '?' in WEBAPP_URL else '?'}view=admin")
                        )
                    ]]
                )

                await message.answer(
                    "👑 АДМІНІСТРАТОР SOYER EXCHANGE\n\n"
                    "✅ Доступ адміністратора підтверджено.",
                    reply_markup=keyboard
                )

            webhook_url = (
                f"{PUBLIC_BACKEND_URL.rstrip('/')}/telegram/webhook"
            )

            await bot.set_webhook(
                url=webhook_url,
                secret_token=WEBHOOK_SECRET or None,
                drop_pending_updates=False
            )

            logger.info("Telegram webhook registered: %s", webhook_url)

    else:
        logger.warning("BOT_TOKEN is not configured")

    try:
        yield
    finally:
        if bot:
            await bot.session.close()
            bot = None
            dp = None


app = FastAPI(
    title="SOYER EXCHANGE API",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================
# TELEGRAM WEBHOOK
# =========================

@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    if not bot or not dp:
        raise HTTPException(503, "Telegram bot is not configured")

    if (
        WEBHOOK_SECRET
        and request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token"
        ) != WEBHOOK_SECRET
    ):
        raise HTTPException(403, "Invalid webhook secret")

    try:
        data = await request.json()

        update = Update.model_validate(
            data,
            context={"bot": bot}
        )

        await dp.feed_update(bot, update)

    except Exception:
        logger.exception("Webhook processing failed")
        raise HTTPException(500, "Webhook processing failed")

    return {"ok": True}


# =========================
# HEALTH
# =========================

@app.get("/")
def root():
    return {
        "service": "SOYER EXCHANGE",
        "status": "online",
        "version": "2.0.0"
    }


@app.get("/health")
def health():
    return {"ok": True}


# =========================
# USER PROFILE
# =========================

@app.get("/api/me")
def me(u=Depends(current_user)):
    db.save_user(u)

    return {
        "id": u["id"],
        "name": u.get("first_name", ""),
        "username": u.get("username", ""),
        "is_admin": is_admin(u["id"])
    }


# =========================
# EXCHANGE RATES
# =========================

@app.get("/api/rates")
def get_rates(u=Depends(current_user)):
    return db.rates()


# =========================
# CREATE ORDER
# =========================

class OrderIn(BaseModel):
    direction: str
    amount: float = Field(gt=0, le=10000000)
    contact: str = Field(default="", max_length=120)


@app.post("/api/orders")
async def create_order(
    x: OrderIn,
    u=Depends(current_user)
):
    db.save_user(u)

    r = db.rates()

    if x.direction == "USDT_TO_UAH":

        if x.amount < 10:
            raise HTTPException(
                400,
                "Минимум 10 USDT"
            )

        rate = r["usdt_uah"]
        received = round(x.amount * rate, 2)
        label = "USDT → UAH"

    elif x.direction == "UAH_TO_USDT":

        rate = r["uah_usdt"]
        received = round(x.amount / rate, 6)
        label = "UAH → USDT"

    else:
        raise HTTPException(
            400,
            "Неверное направление"
        )

    order = db.make_order(
        u["id"],
        label,
        x.amount,
        received,
        rate,
        x.contact
    )

    if BOT_TOKEN:
        notification_bot = Bot(BOT_TOKEN)

        try:
            for admin_id in ADMIN_IDS:
                try:
                    await notification_bot.send_message(
                        admin_id,
                        f"🆕 Нова заявка\n\n"
                        f"Номер: {order['number']}\n"
                        f"Напрямок: {label}\n"
                        f"Сума: {x.amount}\n"
                        f"До отримання: {received}\n"
                        f"Курс: {rate}\n"
                        f"Telegram ID: {u['id']}"
                    )
                except Exception:
                    logger.exception(
                        "Admin notification failed: %s",
                        admin_id
                    )

        finally:
            await notification_bot.session.close()

    return {
        "order_no": order["number"],
        "status": order["status"],
        "receive_amount": received
    }


# =========================
# USER ORDERS
# =========================

@app.get("/api/orders")
def get_my_orders(u=Depends(current_user)):
    return db.my_orders(u["id"])


# =========================
# PROMOTIONS
# =========================

@app.get("/api/promotions")
def get_promotions(u=Depends(current_user)):
    return db.promos()


# =========================
# ADMIN: ALL ORDERS
# =========================

@app.get("/api/admin/orders")
def admin_orders(u=Depends(current_user)):
    admin(u)
    return db.all_orders()


# =========================
# ADMIN: CHANGE ORDER STATUS
# =========================

class StatusIn(BaseModel):
    status: str


@app.patch("/api/admin/orders/{number}")
async def change_order_status(
    number: str,
    x: StatusIn,
    u=Depends(current_user)
):
    admin(u)

    allowed_statuses = [
        "В обработке",
        "Завершена",
        "Отменена"
    ]

    if x.status not in allowed_statuses:
        raise HTTPException(
            400,
            "Недопустимый статус"
        )

    order = db.get_order(number)

    if not order:
        raise HTTPException(
            404,
            "Заявка не найдена"
        )

    db.status(number, x.status)

    if BOT_TOKEN:
        notification_bot = Bot(BOT_TOKEN)

        try:
            await notification_bot.send_message(
                order["user_id"],
                f"🔔 Оновлення заявки {number}\n\n"
                f"Новий статус: { {'В обработке': 'В обробці', 'Завершена': 'Завершена', 'Отменена': 'Скасована'}.get(x.status, x.status) }"
            )

        except Exception:
            logger.exception("User notification failed")

        finally:
            await notification_bot.session.close()

    return {
        "ok": True,
        "number": number,
        "status": x.status
    }


# =========================
# ADMIN: CHANGE RATES
# =========================

class RatesIn(BaseModel):
    usdt_uah: float = Field(gt=0, lt=100000)
    uah_usdt: float = Field(gt=0, lt=100000)


@app.put("/api/admin/rates")
def change_rates(
    x: RatesIn,
    u=Depends(current_user)
):
    admin(u)

    db.set_rates(
        x.usdt_uah,
        x.uah_usdt
    )

    logger.info(
        "Rates changed: USDT/UAH=%s, UAH/USDT=%s",
        x.usdt_uah,
        x.uah_usdt
    )

    return db.rates()


# =========================
# ADMIN: ADD PROMOTION
# =========================

class PromoIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1000)


@app.post("/api/admin/promotions")
def add_promotion(
    x: PromoIn,
    u=Depends(current_user)
):
    admin(u)

    db.add_promo(
        x.title,
        x.description
    )

    return {
        "ok": True,
        "message": "Акция добавлена"
    }
