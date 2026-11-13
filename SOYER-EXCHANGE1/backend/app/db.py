import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from .config import DATABASE_PATH
def now(): return datetime.now(timezone.utc).isoformat()
def conn():
    Path(DATABASE_PATH).parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(DATABASE_PATH); c.row_factory=sqlite3.Row; return c
def init():
    with conn() as d:
        d.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT, name TEXT, created TEXT);
        CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, number TEXT UNIQUE, user_id INTEGER, direction TEXT, amount REAL, received REAL, rate REAL, contact TEXT, status TEXT, created TEXT, updated TEXT);
        CREATE TABLE IF NOT EXISTS exchange_rates(id INTEGER PRIMARY KEY CHECK(id=1), usdt_uah REAL, uah_usdt REAL, updated TEXT);
        CREATE TABLE IF NOT EXISTS promotions(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,description TEXT,active INTEGER DEFAULT 1);
        CREATE TABLE IF NOT EXISTS referrals(id INTEGER PRIMARY KEY AUTOINCREMENT,referrer_id INTEGER,referred_id INTEGER UNIQUE,created TEXT);
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
        INSERT OR IGNORE INTO exchange_rates VALUES(1,46.60,47.70,CURRENT_TIMESTAMP);
        """)
def save_user(u):
    with conn() as d:
        d.execute("INSERT INTO users VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name",(u["id"],u.get("username",""),u.get("first_name",""),now()))
def rates():
    with conn() as d: return dict(d.execute("SELECT usdt_uah, uah_usdt, updated FROM exchange_rates WHERE id=1").fetchone())
def set_rates(a,b):
    with conn() as d: d.execute("UPDATE exchange_rates SET usdt_uah=?,uah_usdt=?,updated=? WHERE id=1",(a,b,now()))
def make_order(uid,direction,amount,received,rate,contact):
    with conn() as d:
        cur=d.execute("INSERT INTO orders(number,user_id,direction,amount,received,rate,contact,status,created,updated) VALUES('pending',?,?,?,?,?,?, 'Новая',?,?)",(uid,direction,amount,received,rate,contact,now(),now()))
        n=f"SY-{datetime.now().strftime('%y%m%d')}-{cur.lastrowid:05d}"
        d.execute("UPDATE orders SET number=? WHERE id=?",(n,cur.lastrowid))
        return dict(d.execute("SELECT * FROM orders WHERE id=?",(cur.lastrowid,)).fetchone())
def my_orders(uid):
    with conn() as d: return [dict(x) for x in d.execute("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC",(uid,))]
def all_orders():
    with conn() as d: return [dict(x) for x in d.execute("SELECT * FROM orders ORDER BY id DESC LIMIT 100")]
def get_order(n):
    with conn() as d:
        x=d.execute("SELECT * FROM orders WHERE number=?",(n,)).fetchone()
        return dict(x) if x else None
def status(n,s):
    with conn() as d: return d.execute("UPDATE orders SET status=?,updated=? WHERE number=?",(s,now(),n)).rowcount
def promos():
    with conn() as d: return [dict(x) for x in d.execute("SELECT * FROM promotions WHERE active=1 ORDER BY id DESC")]
def add_promo(t,x):
    with conn() as d: d.execute("INSERT INTO promotions(title,description) VALUES(?,?)",(t,x))
