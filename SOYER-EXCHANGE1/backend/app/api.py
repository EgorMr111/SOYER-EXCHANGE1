
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

            # START COMMAND
            @dp.message(CommandStart())
            async def start(message: Message):
                if not WEBAPP_URL.startswith("https://"):
                    await message.answer(
                        "SOYER EXCHANGE временно настраивается."
                    )
                    return

                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[[
                        InlineKeyboardButton(
                            text="💱 Открыть SOYER EXCHANGE",
                            web_app=WebAppInfo(url=WEBAPP_URL)
                        )
                    ]]
                )

                await message.answer(
                    "👋 Добро пожаловать в SOYER EXCHANGE!\n\n"
                    "💱 Обменивайте USDT и UAH.\n"
                    "📋 Создавайте заявки.\n"
                    "🤝 Наш менеджер поможет провести обмен.",
                    reply_markup=keyboard
                )

            # HELP COMMAND
            @dp.message(Command("help"))
            async def help_command(message: Message):
                await message.answer(
                    "SOYER EXCHANGE\n\n"
                    "/start — открыть приложение\n"
                    "/help — помощь\n"
                    "/admin — админ-панель"
                )

            # ADMIN COMMAND
            @dp.message(Command("admin"))
            async def admin_command(message: Message):
                if not message.from_user:
                    return

                if not is_admin(message.from_user.id):
                    await message.answer(
                        "⛔ У вас нет доступа к админ-панели."
                    )
                    return

                if not WEBAPP_URL.startswith("https://"):
                    await message.answer(
                        "⚠️ Mini App пока не настроен."
                    )
                    return

                keyboard = InlineKeyboardMarkup(
                    inline_keyboard=[[
                        InlineKeyboardButton(
                            text="👑 Открыть админ-панель",
                            web_app=WebAppInfo(url=WEBAPP_URL)
                        )
                    ]]
                )

                await message.answer(
                    "👑 SOYER EXCHANGE ADMIN\n\n"
                    "✅ Доступ администратора подтверждён.\n"
                    "Откройте панель управления:",
                    reply_markup=keyboard
                )

            # REGISTER WEBHOOK
            webhook_url = (
                f"{PUBLIC_BACKEND_URL.rstrip('/')}/telegram/webhook"
            )

            await bot.set_webhook(
                url=webhook_url,
                secret_token=WEBHOOK_SECRET or None,
                drop_pending_updates=True
            )

            logger.info(
                "SOYER EXCHANGE webhook registered: %s",
                webhook_url
            )

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
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


# TELEGRAM WEBHOOK
@app.post("/telegram/webhook")
async def telegram_webhook(request: Request):
    if not bot or not dp:
        raise HTTPException(
            status_code=503,
            detail="Telegram bot is not configured"
        )

    if (
        WEBHOOK_SECRET
        and request.headers.get(
            "X-Telegram-Bot-Api-Secret-Token"
        ) != WEBHOOK_SECRET
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid webhook secret"
        )

    try:
        data = await request.json()

        update = Update.model_validate(
            data,
            context={"bot": bot}
        )

        await dp.feed_update(bot, update)

    except Exception:
        logger.exception("Failed to process Telegram webhook")
        raise HTTPException(
            status_code=500,
            detail="Webhook processing failed"
        )

    return {"ok": True}


# HEALTH
@app.get("/health")
def health():
    return {"ok": True}


# USER PROFILE
@app.get("/api/me")
def me(u=Depends(current_user)):
    db.save_user(u)

    return {
        "id": u["id"],
        "name": u.get("first_name", ""),
        "username": u.get("username", ""),
        "is_admin": is_admin(u["id"])
    }


# RATES
@app.get("/api/rates")
def get_rates(u=Depends(current_user)):
    return db.rates()


# CREATE ORDER
class OrderIn(BaseModel):
    direction: str
    amount: float = Field(gt=0, le=10000000)
    contact: str = Field(default="", max_length=120)


@app.post("/api/orders")
async def create(x: OrderIn, u=Depends(current_user)):
    db.save_user(u)

    r = db.rates()

    if x.direction == "USDT_TO_UAH":
        if x.amount < 10:
            raise HTTPException(
                status_code=400,
                detail="Минимум 10 USDT"
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
            status_code=400,
            detail="Неверное направление"
        )

    o = db.make_order(
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
            for aid in ADMIN_IDS:
                try:
                    await notification_bot.send_message(
                        aid,
                        f"🆕 Новая заявка {o['number']}\n\n"
                        f"Направление: {label}\n"
                        f"Сумма: {x.amount}\n"
                        f"К получению: {received}\n"
                        f"Курс: {rate}\n"
                        f"ID пользователя: {u['id']}"
                    )
                except Exception:
                    logger.exception(
                        "Failed to notify admin %s",
                        aid
                    )

        finally:
            await notification_bot.session.close()

    return {
        "order_no": o["number"],
        "status": o["status"],
        "receive_amount": received
    }


# USER ORDERS
@app.get("/api/orders")
def orders(u=Depends(current_user)):
    return db.my_orders(u["id"])


# PROMOTIONS
@app.get("/api/promotions")
def promotions(u=Depends(current_user)):
    return db.promos()


# ADMIN ORDERS
@app.get("/api/admin/orders")
def admin_orders(u=Depends(current_user)):
    admin(u)
    return db.all_orders()


# CHANGE ORDER STATUS
class StatusIn(BaseModel):
    status: str


@app.patch("/api/admin/orders/{number}")
async def change(number: str, x: StatusIn, u=Depends(current_user)):
    admin(u)

    allowed_statuses = [
        "В обработке",
        "Завершена",
        "Отменена"
    ]

    if x.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Статус не разрешён"
        )

    o = db.get_order(number)

    if not o:
        raise HTTPException(
            status_code=404,
            detail="Заявка не найдена"
        )

    db.status(number, x.status)

    if BOT_TOKEN:
        notification_bot = Bot(BOT_TOKEN)

        try:
            await notification_bot.send_message(
                o["user_id"],
                f"🔔 Статус вашей заявки {number}: {x.status}"
            )
        except Exception:
            logger.exception("Failed to notify user")
        finally:
            await notification_bot.session.close()

    return {"ok": True}


# CHANGE RATES
class RatesIn(BaseModel):
    usdt_uah: float = Field(gt=0, lt=100000)
    uah_usdt: float = Field(gt=0, lt=100000)


@app.put("/api/admin/rates")
def change_rates(x: RatesIn, u=Depends(current_user)):
    admin(u)

    db.set_rates(
        x.usdt_uah,
        x.uah_usdt
    )

    return db.rates()


# ADD PROMOTION
class PromoIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=1000)


@app.post("/api/admin/promotions")
def new_promo(x: PromoIn, u=Depends(current_user)):
    admin(u)

    db.add_promo(
        x.title,
        x.description
    )

    return {"ok": True}
