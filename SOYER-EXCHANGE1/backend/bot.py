"""Production/local entry point for SOYER EXCHANGE.

The Telegram bot is handled by FastAPI's webhook in app.api. Do not start
aiogram polling alongside that webhook: Telegram allows only one update mode.
Run this file to start the same webhook-enabled API service.
"""
import os
import uvicorn


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.api:app", host="0.0.0.0", port=port)
