from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from .config import DATABASE_URL


def conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row, connect_timeout=15)


def now():
    return datetime.now(timezone.utc).isoformat()


def init():
    statements = [
        """CREATE TABLE IF NOT EXISTS users (
            id BIGINT PRIMARY KEY, username TEXT, name TEXT, created TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS orders (
            id BIGSERIAL PRIMARY KEY, number TEXT UNIQUE, user_id BIGINT,
            direction TEXT, amount DOUBLE PRECISION, received DOUBLE PRECISION,
            rate DOUBLE PRECISION, contact TEXT, status TEXT, created TEXT, updated TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS exchange_rates (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            usdt_uah DOUBLE PRECISION, uah_usdt DOUBLE PRECISION, updated TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS promotions (
            id BIGSERIAL PRIMARY KEY, title TEXT, description TEXT, active INTEGER DEFAULT 1
        )""",
        """CREATE TABLE IF NOT EXISTS referrals (
            id BIGSERIAL PRIMARY KEY, referrer_id BIGINT, referred_id BIGINT UNIQUE, created TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)""",
        """INSERT INTO exchange_rates(id, usdt_uah, uah_usdt, updated)
             VALUES(1, 46.60, 47.70, CURRENT_TIMESTAMP)
             ON CONFLICT (id) DO NOTHING"""
    ]
    with conn() as d:
        for statement in statements:
            d.execute(statement)


def save_user(u):
    with conn() as d:
        d.execute(
            """INSERT INTO users(id, username, name, created)
               VALUES(%s, %s, %s, %s)
               ON CONFLICT(id) DO UPDATE SET
               username=EXCLUDED.username, name=EXCLUDED.name""",
            (u["id"], u.get("username", ""), u.get("first_name", ""), now())
        )


def rates():
    with conn() as d:
        row = d.execute(
            "SELECT usdt_uah, uah_usdt, updated FROM exchange_rates WHERE id=1"
        ).fetchone()
        if row is None:
            d.execute(
                """INSERT INTO exchange_rates(id, usdt_uah, uah_usdt, updated)
                   VALUES(1, 46.60, 47.70, %s) ON CONFLICT(id) DO NOTHING""",
                (now(),)
            )
            row = d.execute(
                "SELECT usdt_uah, uah_usdt, updated FROM exchange_rates WHERE id=1"
            ).fetchone()
        return dict(row)


def set_rates(a, b):
    with conn() as d:
        row = d.execute(
            """INSERT INTO exchange_rates(id, usdt_uah, uah_usdt, updated)
               VALUES(1, %s, %s, %s)
               ON CONFLICT(id) DO UPDATE SET
               usdt_uah=EXCLUDED.usdt_uah,
               uah_usdt=EXCLUDED.uah_usdt,
               updated=EXCLUDED.updated
               RETURNING usdt_uah, uah_usdt, updated""",
            (float(a), float(b), now())
        ).fetchone()
        if row is None:
            raise RuntimeError("Exchange rates were not persisted")
        return dict(row)


def make_order(uid, direction, amount, received, rate, contact):
    with conn() as d:
        created = now()
        row = d.execute(
            """INSERT INTO orders(number, user_id, direction, amount, received,
               rate, contact, status, created, updated)
               VALUES('pending', %s, %s, %s, %s, %s, %s, 'Новая', %s, %s)
               RETURNING id""",
            (uid, direction, amount, received, rate, contact, created, created)
        ).fetchone()
        number = f"SY-{datetime.now().strftime('%y%m%d')}-{row['id']:05d}"
        d.execute("UPDATE orders SET number=%s WHERE id=%s", (number, row["id"]))
        saved = d.execute("SELECT * FROM orders WHERE id=%s", (row["id"],)).fetchone()
        return dict(saved)


def my_orders(uid):
    with conn() as d:
        return [dict(x) for x in d.execute(
            "SELECT * FROM orders WHERE user_id=%s ORDER BY id DESC", (uid,)
        ).fetchall()]


def all_orders():
    with conn() as d:
        return [dict(x) for x in d.execute(
            """SELECT orders.*, users.username AS username, users.name AS customer_name
               FROM orders LEFT JOIN users ON users.id=orders.user_id
               ORDER BY orders.id DESC LIMIT 100"""
        ).fetchall()]


def get_order(number):
    with conn() as d:
        row = d.execute("SELECT * FROM orders WHERE number=%s", (number,)).fetchone()
        return dict(row) if row else None


def status(number, new_status):
    with conn() as d:
        updated = now()
        row = d.execute(
            """UPDATE orders SET status=%s, updated=%s WHERE number=%s
               RETURNING *""",
            (new_status, updated, number)
        ).fetchone()
        if row is None:
            raise LookupError(f"Order {number} was not found while updating status")
        return dict(row)


def promos():
    with conn() as d:
        return [dict(x) for x in d.execute(
            "SELECT * FROM promotions WHERE active=1 ORDER BY id DESC"
        ).fetchall()]


def add_promo(title, description):
    with conn() as d:
        d.execute(
            "INSERT INTO promotions(title, description) VALUES(%s, %s)",
            (title, description)
        )
