import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Home,
  Gift,
  UserRound,
  ShieldCheck,
  Headphones,
  Clock3,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ---------- Типи ---------- */

type Direction = "USDT_TO_UAH" | "UAH_TO_USDT";
type Tab = "home" | "promos" | "profile" | "admin";
type LoadState = "idle" | "loading" | "ok" | "error";

interface Rates {
  usdt_uah: number;
  uah_usdt: number;
  updated?: string;
}

interface User {
  id: number;
  name: string;
  username: string;
  is_admin: boolean;
}

interface Promo {
  id: number;
  title: string;
  description: string;
}

/* ---------- Константи ---------- */

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const tg = window.Telegram?.WebApp;

const MANAGER_URL = "https://t.me/soyermanager";
/** Мінімальна сума обміну, виражена в USDT (для обох напрямків). */
const MIN_USDT = 5;
/** Збігається з лімітом на бекенді (OrderIn.amount le=10000000). */
const MAX_AMOUNT = 10_000_000;
/** Межа курсу на бекенді (RatesIn lt=100000). */
const MAX_RATE = 100_000;

const requestedAdmin =
  new URLSearchParams(window.location.search).get("view") === "admin";

const NAV: { id: Tab; label: string; Icon: LucideIcon }[] = [
  { id: "home", label: "Головна", Icon: Home },
  { id: "promos", label: "Акції", Icon: Gift },
  { id: "profile", label: "Профіль", Icon: UserRound },
];

/* ---------- Допоміжні функції ---------- */

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat("uk-UA", { maximumFractionDigits: d }).format(
    Number.isFinite(n) ? n : 0
  );

/** Залишає лише цифри та одну десяткову крапку (кома → крапка). */
function sanitizeInput(raw: string, decimals = 2): string {
  const s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) {
    const int = s.slice(0, dot);
    const frac = s.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
    return `${int.slice(0, 9)}.${frac}`;
  }
  return s.slice(0, 9);
}

/** Повертає число або null, якщо рядок порожній чи некоректний. */
function parseAmount(s: string): number | null {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function formatResult(n: number): string {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toFixed(2) : "";
}

const sendToReceive = (dir: Direction, send: number, r: Rates) =>
  dir === "USDT_TO_UAH" ? send * r.usdt_uah : send / r.uah_usdt;

const receiveToSend = (dir: Direction, receive: number, r: Rates) =>
  dir === "USDT_TO_UAH" ? receive / r.usdt_uah : receive * r.uah_usdt;

function openManager() {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(MANAGER_URL);
  } else {
    window.open(MANAGER_URL, "_blank", "noopener,noreferrer");
  }
}

function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm) {
      try {
        tg.showConfirm(message, resolve);
        return;
      } catch {
        /* старі версії Telegram не підтримують showConfirm */
      }
    }
    resolve(window.confirm(message));
  });
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": tg?.initData || "",
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new Error("Немає зв’язку із сервером. Спробуйте ще раз.");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // FastAPI повертає detail масивом для помилок валідації (422).
    const detail =
      typeof data?.detail === "string"
        ? data.detail
        : res.status === 422
          ? "Перевірте правильність введених даних"
          : `Помилка API: ${res.status}`;
    throw new Error(detail);
  }

  return data as T;
}

const errMsg = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

/* ---------- Застосунок ---------- */

export default function App() {
  const [tab, setTab] = useState<Tab>("home");
  const [user, setUser] = useState<User | null>(null);
  // null — курс ще не отримано з сервера (не показуємо вигаданих значень)
  const [rates, setRates] = useState<Rates | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [promos, setPromos] = useState<Promo[]>([]);

  const [direction, setDirection] = useState<Direction>("USDT_TO_UAH");
  const [amount, setAmount] = useState("100");
  const [receiveAmount, setReceiveAmount] = useState("");

  const [notice, setNotice] = useState("");

  const [rateA, setRateA] = useState("");
  const [rateB, setRateB] = useState("");
  const [ratesSaving, setRatesSaving] = useState(false);
  const [promoTitle, setPromoTitle] = useState("");
  const [promoDesc, setPromoDesc] = useState("");
  const [promoAdding, setPromoAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refreshing = useRef(false);
  const adminHandled = useRef(false);

  const isAdmin = user?.is_admin === true;

  async function refresh() {
    if (!tg?.initData) {
      setNotice("Відкрийте застосунок через Telegram-бота для авторизації.");
      setLoadState("error");
      return;
    }
    if (refreshing.current) return;
    refreshing.current = true;
    setLoadState("loading");

    try {
      const [u, r, p] = await Promise.all([
        api<User>("/api/me"),
        api<Rates>("/api/rates"),
        api<Promo[]>("/api/promotions"),
      ]);

      setUser(u);
      setRates(r);
      setPromos(p);
      setRateA(String(r.usdt_uah));
      setRateB(String(r.uah_usdt));

      if (requestedAdmin && !adminHandled.current) {
        adminHandled.current = true;
        if (u.is_admin === true) {
          setTab("admin");
        } else {
          setNotice("Цей акаунт не має доступу до панелі адміністратора.");
        }
      }
      setLoadState("ok");
    } catch (e) {
      setNotice(errMsg(e, "Не вдалося завантажити дані"));
      setLoadState("error");
    } finally {
      refreshing.current = false;
    }
  }

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.("#080a0f");
    tg?.setBackgroundColor?.("#080a0f");
    refresh();
  }, []);

  // Перерахунок «Отримую» щойно змінився курс (завантаження / збереження в адмінці).
  useEffect(() => {
    if (!rates) return;
    const n = parseAmount(amount);
    setReceiveAmount(
      n === null ? "" : formatResult(sendToReceive(direction, n, rates))
    );
  }, [rates]);

  // Нова вкладка — завжди з початку сторінки.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  // Кнопка «Назад» Telegram: з адмінки — до профілю.
  useEffect(() => {
    const back = tg?.BackButton;
    if (!back || tab !== "admin") return;
    const goBack = () => setTab("profile");
    back.show();
    back.onClick(goBack);
    return () => {
      back.offClick(goBack);
      back.hide();
    };
  }, [tab]);

  // Сповіщення зникає саме.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  /* ----- Калькулятор ----- */

  function updateSend(raw: string) {
    const value = sanitizeInput(raw);
    setAmount(value);
    const n = parseAmount(value);
    setReceiveAmount(
      n === null || !rates ? "" : formatResult(sendToReceive(direction, n, rates))
    );
  }

  function updateReceive(raw: string) {
    const value = sanitizeInput(raw);
    setReceiveAmount(value);
    const n = parseAmount(value);
    setAmount(
      n === null || !rates ? "" : formatResult(receiveToSend(direction, n, rates))
    );
  }

  function changeDirection(next: Direction) {
    if (next === direction) return;
    setDirection(next);
    const n = parseAmount(amount);
    setReceiveAmount(
      n === null || !rates ? "" : formatResult(sendToReceive(next, n, rates))
    );
  }

  /** Міняє місцями «Віддаю» та «Отримую»: що отримували — тепер віддаємо. */
  function swapDirection() {
    const next: Direction =
      direction === "USDT_TO_UAH" ? "UAH_TO_USDT" : "USDT_TO_UAH";
    const newAmount = receiveAmount;
    setDirection(next);
    setAmount(newAmount);
    const n = parseAmount(newAmount);
    setReceiveAmount(
      n === null || !rates ? "" : formatResult(sendToReceive(next, n, rates))
    );
  }

  const sendUnit = direction === "USDT_TO_UAH" ? "USDT" : "UAH";
  const receiveUnit = direction === "USDT_TO_UAH" ? "UAH" : "USDT";
  const sendNum = parseAmount(amount);

  let calcMessage: { kind: "error" | "info"; text: string } | null = null;
  let calcValid = false;

  if (!rates) {
    calcMessage = {
      kind: "info",
      text:
        loadState === "error"
          ? "Курс наразі недоступний."
          : "Завантаження актуального курсу…",
    };
  } else if (amount !== "" && (sendNum === null || sendNum <= 0)) {
    calcMessage = { kind: "error", text: "Введіть коректну суму" };
  } else if (sendNum !== null && sendNum > MAX_AMOUNT) {
    calcMessage = {
      kind: "error",
      text: `Максимальна сума — ${fmt(MAX_AMOUNT, 0)} ${sendUnit}`,
    };
  } else if (sendNum !== null) {
    const usdtEquivalent =
      direction === "USDT_TO_UAH" ? sendNum : sendNum / rates.uah_usdt;
    if (Math.round(usdtEquivalent * 100) / 100 < MIN_USDT) {
      const minHint =
        direction === "UAH_TO_USDT"
          ? ` (≈ ${fmt(Math.ceil(MIN_USDT * rates.uah_usdt * 100) / 100)} UAH)`
          : "";
      calcMessage = {
        kind: "error",
        text: `Мінімальна сума — ${MIN_USDT} USDT${minHint}`,
      };
    } else {
      calcValid = true;
    }
  }

  /* ----- Адмінпанель ----- */

  async function saveRates() {
    if (ratesSaving) return;

    const a = parseAmount(rateA);
    const b = parseAmount(rateB);

    if (a === null || b === null || a <= 0 || b <= 0) {
      setNotice("Введіть коректні курси");
      return;
    }
    if (a >= MAX_RATE || b >= MAX_RATE) {
      setNotice(`Курс має бути меншим за ${fmt(MAX_RATE, 0)}`);
      return;
    }

    setRatesSaving(true);
    try {
      await api("/api/admin/rates", {
        method: "PUT",
        body: JSON.stringify({ usdt_uah: a, uah_usdt: b }),
      });

      // Читаємо назад із бази, щоб підтвердити реальне збереження.
      const persisted = await api<Rates>("/api/rates");
      if (
        Number(persisted.usdt_uah) !== a ||
        Number(persisted.uah_usdt) !== b
      ) {
        throw new Error("Курси не підтверджені базою даних. Спробуйте ще раз.");
      }

      setRates(persisted);
      setRateA(String(persisted.usdt_uah));
      setRateB(String(persisted.uah_usdt));
      setNotice("Курси успішно збережено");
    } catch (e) {
      setNotice(errMsg(e, "Не вдалося зберегти курси"));
    } finally {
      setRatesSaving(false);
    }
  }

  async function addPromo() {
    if (promoAdding) return;

    if (!promoTitle.trim() || !promoDesc.trim()) {
      setNotice("Заповніть назву та опис акції");
      return;
    }

    setPromoAdding(true);
    try {
      await api("/api/admin/promotions", {
        method: "POST",
        body: JSON.stringify({
          title: promoTitle.trim(),
          description: promoDesc.trim(),
        }),
      });

      setPromoTitle("");
      setPromoDesc("");
      setPromos(await api<Promo[]>("/api/promotions"));
      setNotice("Акцію додано");
    } catch (e) {
      setNotice(errMsg(e, "Не вдалося додати акцію"));
    } finally {
      setPromoAdding(false);
    }
  }

  async function deletePromo(id: number) {
    if (deletingId !== null) return;
    if (!(await confirmAction("Видалити цю акцію?"))) return;

    setDeletingId(id);
    try {
      await api(`/api/admin/promotions/${id}`, { method: "DELETE" });
      setPromos(await api<Promo[]>("/api/promotions"));
      setNotice("Акцію видалено");
    } catch (e) {
      setNotice(errMsg(e, "Не вдалося видалити акцію"));
    } finally {
      setDeletingId(null);
    }
  }

  /* ---------- Розмітка ---------- */

  return (
    <div className="app">
      <header>
        <div className="logo" aria-hidden="true">
          <ArrowDownUp />
        </div>

        <div className="brand">
          <b>
            SOYER <i>EXCHANGE</i>
          </b>
          <small>СЕРВІС ОБМІНУ</small>
        </div>

        <span className="online">ОНЛАЙН</span>
      </header>

      {notice && (
        <button
          type="button"
          className="notice"
          aria-live="polite"
          onClick={() => setNotice("")}
        >
          <span>{notice}</span>
          <span aria-label="Закрити">×</span>
        </button>
      )}

      {tab === "home" && (
        <main>
          <section className="hero">
            <small>ПРОСТО • ЗРОЗУМІЛО • ЗРУЧНО</small>

            <h1>
              Обмін
              <br />
              <em>без зайвого.</em>
            </h1>

            <p>
              Розрахуйте суму та напишіть менеджеру напряму — він уточнить деталі обміну.
            </p>

            <div className="rates">
              <div>
                <label>USDT → UAH</label>
                <b>{rates ? `${fmt(rates.usdt_uah)} ₴` : "—"}</b>
              </div>

              <div>
                <label>UAH → USDT</label>
                <b>{rates ? `${fmt(rates.uah_usdt)} ₴` : "—"}</b>
              </div>
            </div>

            <small className="hint">
              <ShieldCheck size={14} />
              Курс орієнтовний · мінімум {MIN_USDT} USDT
            </small>
          </section>

          <section className="panel">
            <div className="section">
              <div>
                <small>КАЛЬКУЛЯТОР</small>
                <h2>Розрахувати обмін</h2>
              </div>

              <span className="pill">АКТУАЛЬНИЙ КУРС</span>
            </div>

            <label>Напрямок</label>

            <div className="switch">
              <button
                type="button"
                className={direction === "USDT_TO_UAH" ? "sel" : ""}
                aria-pressed={direction === "USDT_TO_UAH"}
                onClick={() => changeDirection("USDT_TO_UAH")}
              >
                USDT → UAH
              </button>

              <button
                type="button"
                className={direction === "UAH_TO_USDT" ? "sel" : ""}
                aria-pressed={direction === "UAH_TO_USDT"}
                onClick={() => changeDirection("UAH_TO_USDT")}
              >
                UAH → USDT
              </button>
            </div>

            <div className="amount">
              <small>Віддаю</small>

              <div>
                <input
                  value={amount}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  aria-label={`Сума, яку ви віддаєте (${sendUnit})`}
                  onChange={(e) => updateSend(e.target.value)}
                />

                <b>{sendUnit}</b>
              </div>
            </div>

            <button
              type="button"
              className="swap"
              aria-label="Поміняти напрямок обміну"
              onClick={swapDirection}
            >
              <ArrowDownUp />
            </button>

            <div className="amount receive">
              <small>Отримую</small>

              <div>
                <input
                  value={receiveAmount}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  disabled={!rates}
                  aria-label={`Сума, яку ви отримуєте (${receiveUnit})`}
                  onChange={(e) => updateReceive(e.target.value)}
                />

                <b>{receiveUnit}</b>
              </div>
            </div>

            <p
              className={`calc-msg ${calcMessage?.kind ?? ""}`}
              aria-live="polite"
            >
              {calcMessage?.text}
            </p>

            {!rates && loadState === "error" && (
              <button type="button" className="outline" onClick={refresh}>
                <RefreshCw size={16} />
                Спробувати ще раз
              </button>
            )}

            <button
              type="button"
              className="primary"
              onClick={openManager}
              disabled={!calcValid}
            >
              Написати менеджеру
              <ArrowRight size={17} />
            </button>

            <p className="disclaimer">
              Розрахунок орієнтовний. Остаточні умови обміну погоджуйте безпосередньо з менеджером.
            </p>
          </section>

          <div className="features">
            <div>
              <ShieldCheck />
              <b>Ручне підтвердження</b>
              <small>Умови погоджуються з менеджером</small>
            </div>

            <div>
              <Clock3 />
              <b>Зв’язок напряму</b>
              <small>Менеджер відповість у Telegram</small>
            </div>

            <div>
              <Headphones />
              <b>Підтримка</b>
              <small>@soyermanager</small>
            </div>
          </div>
        </main>
      )}

      {tab === "promos" && (
        <main>
          <div className="title">
            <small>ПРОПОЗИЦІЇ</small>
            <h1>Акції</h1>
          </div>

          {promos.length ? (
            promos.map((p) => (
              <article className="order" key={p.id}>
                <Gift />
                <h3>{p.title}</h3>
                <p>{p.description}</p>
                {isAdmin && (
                  <button
                    type="button"
                    className="delete-promo"
                    disabled={deletingId !== null}
                    onClick={() => deletePromo(p.id)}
                  >
                    {deletingId === p.id ? "Видалення…" : "Видалити акцію"}
                  </button>
                )}
              </article>
            ))
          ) : (
            <div className="empty">
              <Gift />
              <b>Активних акцій поки немає</b>
            </div>
          )}
        </main>
      )}

      {tab === "profile" && (
        <main>
          <div className="title">
            <small>ОСОБИСТИЙ КАБІНЕТ</small>
            <h1>Профіль</h1>
          </div>

          <section className="panel profile">
            <UserRound size={40} />

            <h2>{user?.name || "Користувач Telegram"}</h2>

            {user?.username && <p>@{user.username}</p>}

            <p>Telegram ID: {user?.id || "—"}</p>

            <button type="button" className="primary" onClick={openManager}>
              Зв’язатися з менеджером
            </button>
          </section>

          {isAdmin && (
            <button
              type="button"
              className="primary"
              onClick={() => setTab("admin")}
            >
              <ShieldCheck size={18} />
              Панель адміністратора
            </button>
          )}

          <button
            type="button"
            className="outline"
            onClick={refresh}
            disabled={loadState === "loading"}
          >
            <RefreshCw
              size={16}
              className={loadState === "loading" ? "spin" : ""}
            />
            {loadState === "loading" ? "Оновлення…" : "Оновити дані"}
          </button>
        </main>
      )}

      {tab === "admin" && isAdmin && (
        <main>
          <div className="title">
            <small>КЕРУВАННЯ</small>
            <h1>Панель адміністратора</h1>
          </div>

          <section className="panel">
            <h2>Курси обміну</h2>

            <label>USDT → UAH</label>

            <input
              className="text"
              value={rateA}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => setRateA(sanitizeInput(e.target.value, 4))}
            />

            <label>UAH → USDT</label>

            <input
              className="text"
              value={rateB}
              inputMode="decimal"
              autoComplete="off"
              onChange={(e) => setRateB(sanitizeInput(e.target.value, 4))}
            />

            <button
              type="button"
              className="primary"
              onClick={saveRates}
              disabled={ratesSaving}
            >
              {ratesSaving ? "Збереження…" : "Зберегти курси"}
            </button>
          </section>

          <section className="panel">
            <h2>Додати акцію</h2>

            <input
              className="text"
              placeholder="Назва"
              maxLength={100}
              value={promoTitle}
              onChange={(e) => setPromoTitle(e.target.value)}
            />

            <textarea
              className="text"
              placeholder="Опис"
              maxLength={1000}
              value={promoDesc}
              onChange={(e) => setPromoDesc(e.target.value)}
            />

            <button
              type="button"
              className="primary"
              onClick={addPromo}
              disabled={promoAdding}
            >
              {promoAdding ? "Додавання…" : "Додати акцію"}
            </button>
          </section>

          <section className="panel">
            <div className="admin-promos-heading">
              <h2>Керування акціями</h2>
              <span>{promos.length} шт.</span>
            </div>

            {promos.length ? (
              <div className="admin-promos-list">
                {promos.map((p) => (
                  <article className="admin-promo" key={p.id}>
                    <div className="admin-promo-copy">
                      <b>{p.title}</b>
                      <p>{p.description}</p>
                      <small>ID: {p.id}</small>
                    </div>

                    <button
                      type="button"
                      className="delete-promo"
                      disabled={deletingId !== null}
                      onClick={() => deletePromo(p.id)}
                    >
                      {deletingId === p.id ? "Видалення…" : "Видалити"}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="admin-promos-empty">
                Акцій поки немає. Додайте першу вище.
              </div>
            )}
          </section>
        </main>
      )}

      <nav>
        {NAV.map(({ id, label, Icon }) => {
          // Адмінпанель відкривається з профілю — підсвічуємо його.
          const active = tab === id || (id === "profile" && tab === "admin");
          return (
            <button
              type="button"
              className={active ? "active" : ""}
              aria-current={active ? "page" : undefined}
              onClick={() => setTab(id)}
              key={id}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
