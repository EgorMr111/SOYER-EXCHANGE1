import hashlib,hmac,json,time
from urllib.parse import parse_qsl
from fastapi import Header,HTTPException
from .config import BOT_TOKEN,ADMIN_IDS
def current_user(x_telegram_init_data:str=Header(default="")):
    try:
        if not BOT_TOKEN: raise ValueError()
        p=dict(parse_qsl(x_telegram_init_data,keep_blank_values=True)); received=p.pop("hash")
        if abs(time.time()-int(p["auth_date"]))>86400: raise ValueError()
        check="\\n".join(f"{k}={v}" for k,v in sorted(p.items()))
        secret=hmac.new(b"WebAppData",BOT_TOKEN.encode(),hashlib.sha256).digest()
        expected=hmac.new(secret,check.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(received,expected): raise ValueError()
        return json.loads(p["user"])
    except Exception: raise HTTPException(401,"Откройте приложение через Telegram")
def admin(u):
    if int(u["id"]) not in ADMIN_IDS: raise HTTPException(403,"Нет доступа")
