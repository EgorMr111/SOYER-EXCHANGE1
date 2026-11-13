import os
from dotenv import load_dotenv
load_dotenv()
BOT_TOKEN=os.getenv("BOT_TOKEN","").strip()
WEBAPP_URL=os.getenv("WEBAPP_URL","").strip()
ADMIN_IDS={int(x.strip()) for x in os.getenv("ADMIN_IDS","").split(",") if x.strip().isdigit()}
DATABASE_PATH=os.getenv("DATABASE_PATH","./data/soyer.sqlite3")
DATABASE_URL=os.getenv("DATABASE_URL","").strip()
CORS_ORIGINS=[x.strip() for x in os.getenv("CORS_ORIGINS","*").split(",") if x.strip()]

PUBLIC_BACKEND_URL=os.getenv("PUBLIC_BACKEND_URL", os.getenv("RENDER_EXTERNAL_URL", "")).strip().rstrip("/")
WEBHOOK_SECRET=os.getenv("WEBHOOK_SECRET", "").strip()
