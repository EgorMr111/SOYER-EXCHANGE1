import asyncio
from aiogram import Bot,Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import Message,InlineKeyboardMarkup,InlineKeyboardButton,WebAppInfo
from app.config import BOT_TOKEN,WEBAPP_URL
async def main():
    if not BOT_TOKEN or not WEBAPP_URL.startswith("https://"): raise RuntimeError("Укажите BOT_TOKEN и HTTPS WEBAPP_URL")
    bot=Bot(BOT_TOKEN); dp=Dispatcher()
    @dp.message(CommandStart())
    async def start(m:Message):
        kb=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💱 Відкрити застосунок",web_app=WebAppInfo(url=WEBAPP_URL))]])
        await m.answer("👋 Ласкаво просимо до SOYER EXCHANGE!\nВідкрийте Mini App, щоб розрахувати обмін і надіслати заявку менеджеру.",reply_markup=kb)
    await dp.start_polling(bot)
if __name__=="__main__": asyncio.run(main())
