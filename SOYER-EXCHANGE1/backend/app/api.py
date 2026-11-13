from fastapi import FastAPI,Depends,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel,Field
from aiogram import Bot
from . import db
from .auth import current_user,admin
from .config import BOT_TOKEN,CORS_ORIGINS
app=FastAPI(title="SOYER EXCHANGE API")
app.add_middleware(CORSMiddleware,allow_origins=CORS_ORIGINS or ["*"],allow_methods=["*"],allow_headers=["*"])
@app.on_event("startup")
def startup(): db.init()
@app.get("/health")
def health(): return {"ok":True}
@app.get("/api/me")
def me(u=Depends(current_user)): db.save_user(u); return {"id":u["id"],"name":u.get("first_name",""),"username":u.get("username","")}
@app.get("/api/rates")
def get_rates(u=Depends(current_user)): return db.rates()
class OrderIn(BaseModel):
    direction:str
    amount:float=Field(gt=0,le=10000000)
    contact:str=Field(default="",max_length=120)
@app.post("/api/orders")
async def create(x:OrderIn,u=Depends(current_user)):
    db.save_user(u); r=db.rates()
    if x.direction=="USDT_TO_UAH":
        if x.amount<10: raise HTTPException(400,"Минимум 10 USDT")
        rate=r["usdt_uah"]; received=round(x.amount*rate,2); label="USDT → UAH"
    elif x.direction=="UAH_TO_USDT":
        rate=r["uah_usdt"]; received=round(x.amount/rate,6); label="UAH → USDT"
    else: raise HTTPException(400,"Неверное направление")
    o=db.make_order(u["id"],label,x.amount,received,rate,x.contact)
    if BOT_TOKEN:
        bot=Bot(BOT_TOKEN)
        try:
            from .config import ADMIN_IDS
            for aid in ADMIN_IDS:
                try: await bot.send_message(aid,f"🆕 <b>{o['number']}</b>\n{label}\nСумма: {x.amount}\nОриентировочно: {received}\nID: <code>{u['id']}</code>")
                except Exception: pass
        finally: await bot.session.close()
    return {"order_no":o["number"],"status":o["status"],"receive_amount":received}
@app.get("/api/orders")
def orders(u=Depends(current_user)): return db.my_orders(u["id"])
@app.get("/api/promotions")
def promotions(u=Depends(current_user)): return db.promos()
@app.get("/api/admin/orders")
def admin_orders(u=Depends(current_user)): admin(u); return db.all_orders()
class StatusIn(BaseModel): status:str
@app.patch("/api/admin/orders/{number}")
async def change(number:str,x:StatusIn,u=Depends(current_user)):
    admin(u)
    if x.status not in ["В обработке","Завершена","Отменена"]: raise HTTPException(400,"Статус не разрешён")
    o=db.get_order(number)
    if not o: raise HTTPException(404,"Заявка не найдена")
    db.status(number,x.status)
    if BOT_TOKEN:
        b=Bot(BOT_TOKEN)
        try: await b.send_message(o["user_id"],f"🔔 Статус заявки <b>{number}</b>: <b>{x.status}</b>")
        except Exception: pass
        finally: await b.session.close()
    return {"ok":True}
class RatesIn(BaseModel):
    usdt_uah:float=Field(gt=0,lt=100000)
    uah_usdt:float=Field(gt=0,lt=100000)
@app.put("/api/admin/rates")
def change_rates(x:RatesIn,u=Depends(current_user)): admin(u); db.set_rates(x.usdt_uah,x.uah_usdt); return db.rates()
class PromoIn(BaseModel):
    title:str=Field(min_length=1,max_length=100)
    description:str=Field(min_length=1,max_length=1000)
@app.post("/api/admin/promotions")
def new_promo(x:PromoIn,u=Depends(current_user)): admin(u); db.add_promo(x.title,x.description); return {"ok":True}
