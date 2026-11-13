
import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Home,
  History,
  Gift,
  UserRound,
  ShieldCheck,
  Clock3,
  Headphones,
  RefreshCw,
} from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "http://localhost:8000";
const tg = window.Telegram?.WebApp;

const fmt = (n: number, d = 2) =>
  new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: d,
  }).format(Number(n) || 0);

export default function App() {
  const [tab, T] = useState("home");
  const [user, U] = useState<any>(null);

  const [rates, R] = useState<any>({
    usdt_uah: 46.6,
    uah_usdt: 47.7,
  });

  const [orders, O] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [promos, P] = useState<any[]>([]);

  const [direction, D] = useState("USDT_TO_UAH");
  const [amount, A] = useState("100");
  const [receiveAmount, SetReceiveAmount] = useState("4660");

  const [contact, C] = useState("");
  const [notice, N] = useState("");
  const [busy, B] = useState(false);

  const [adminOrders, AO] = useState<any[]>([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);
  const [adminOrdersError, setAdminOrdersError] = useState("");
  const [updatingOrder, setUpdatingOrder] = useState("");
  const [ra, RA] = useState("46.60");
  const [rb, RB] = useState("47.70");
  const [ratesSaving, setRatesSaving] = useState(false);
  const [pt, PT] = useState("");
  const [pd, PD] = useState("");

  const headers = {
    "Content-Type": "application/json",
    "X-Telegram-Init-Data": tg?.initData || "",
  };

  async function api(path: string, options: any = {}) {
    const res = await fetch(API + path, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.detail || `Помилка API: ${res.status}`);
    }

    return data;
  }

  async function refresh() {
    if (!tg?.initData) {
      N("Відкрийте застосунок через Telegram-бота для авторизації.");
      return;
    }

    try {
      setOrdersLoading(true);
      setOrdersError("");
      const [u, r, o, p] = await Promise.all([
        api("/api/me"),
        api("/api/rates"),
        api("/api/orders"),
        api("/api/promotions"),
      ]);

      U(u);
      if (requestedAdmin) {
        if (u.is_admin === true) {
          T("admin");
        } else {
          T("home");
          N("Цей акаунт не має доступу до панелі адміністратора.");
        }
      }
      R(r);
      O(o);
      setOrdersError("");
      P(p);

      // The admin deep link must load the admin order list as soon as
      // Telegram authentication confirms the account is an administrator.
      if (requestedAdmin && u.is_admin === true) {
        T("admin");
        try {
          setAdminOrdersLoading(true);
          setAdminOrdersError("");
          AO(await api("/api/admin/orders"));
        } catch (adminError: any) {
          setAdminOrdersError(adminError.message || "Не вдалося завантажити заявки");
        } finally {
          setAdminOrdersLoading(false);
        }
      }

      RA(String(r.usdt_uah));
      RB(String(r.uah_usdt));

      const initial = Number(amount) || 0;
      const result =
        direction === "USDT_TO_UAH"
          ? initial * Number(r.usdt_uah)
          : initial / Number(r.uah_usdt);

      SetReceiveAmount(
        result.toFixed(direction === "USDT_TO_UAH" ? 2 : 6)
      );
    } catch (e: any) {
      setOrdersError(e.message || "Не вдалося завантажити заявки");
      N(e.message || "Не вдалося завантажити дані");
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();
    // Keep Telegram's Mini App chrome aligned with the website background.
    tg?.setHeaderColor?.("#080a0f");
    tg?.setBackgroundColor?.("#080a0f");
    refresh();
  }, []);

  const isAdmin = user?.is_admin === true;
  const requestedAdmin = new URLSearchParams(window.location.search).get("view") === "admin";

  function updateSend(value: string) {
    A(value);

    const num = Number(value.replace(",", "."));

    if (value.trim() === "" || !Number.isFinite(num) || num < 0) {
      SetReceiveAmount("");
      return;
    }

    const result =
      direction === "USDT_TO_UAH"
        ? num * Number(rates.usdt_uah)
        : num / Number(rates.uah_usdt);

    SetReceiveAmount(
      result.toFixed(direction === "USDT_TO_UAH" ? 2 : 6)
    );
  }

  function updateReceive(value: string) {
    SetReceiveAmount(value);

    const num = Number(value.replace(",", "."));

    if (value.trim() === "" || !Number.isFinite(num) || num < 0) {
      A("");
      return;
    }

    const result =
      direction === "USDT_TO_UAH"
        ? num / Number(rates.usdt_uah)
        : num * Number(rates.uah_usdt);

    A(
      result.toFixed(direction === "USDT_TO_UAH" ? 6 : 2)
    );
  }

  function changeDirection(value: string) {
    D(value);

    const current = Number(amount.replace(",", ".")) || 0;

    const result =
      value === "USDT_TO_UAH"
        ? current * Number(rates.usdt_uah)
        : current / Number(rates.uah_usdt);

    SetReceiveAmount(
      result.toFixed(value === "USDT_TO_UAH" ? 2 : 6)
    );
  }

  const sendNumber = Math.max(
    0,
    Number(amount.replace(",", ".")) || 0
  );

  const receiveNumber = Math.max(
    0,
    Number(receiveAmount.replace(",", ".")) || 0
  );

  async function submit() {
    if (!sendNumber || sendNumber <= 0) {
      N("Введіть коректну суму");
      return;
    }

    if (direction === "USDT_TO_UAH" && sendNumber < 10) {
      N("Мінімальна сума — 10 USDT");
      return;
    }

    B(true);

    try {
      const x = await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          direction,
          amount: sendNumber,
          contact,
        }),
      });

      N("Заявку " + x.order_no + " створено. Менеджер зв’яжеться з вами.");
      T("orders");
      await refresh();
    } catch (e: any) {
      N(e.message);
    } finally {
      B(false);
    }
  }

  async function loadAdmin() {
    setAdminOrdersLoading(true);
    setAdminOrdersError("");
    try {
      const data = await api("/api/admin/orders");
      AO(data);
      return true;
    } catch (e: any) {
      setAdminOrdersError(e.message || "Не вдалося завантажити заявки");
      return false;
    } finally {
      setAdminOrdersLoading(false);
    }
  }

  async function changeStatus(no: string, status: string) {
    if (updatingOrder) return;
    setUpdatingOrder(no);
    try {
      const saved = await api("/api/admin/orders/" + encodeURIComponent(no), {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      // Update the visible row from the backend's confirmed response first.
      AO((current) =>
        current.map((order) =>
          order.number === no
            ? { ...order, status: saved.status, updated: saved.updated }
            : order
        )
      );

      const refreshed = await loadAdmin();
      N(
        refreshed
          ? "Статус заявки змінено"
          : "Статус збережено, але список не оновився. Натисніть «Оновити»."
      );
    } catch (e: any) {
      N(e.message || "Не вдалося змінити статус заявки");
    } finally {
      setUpdatingOrder("");
    }
  }

  async function saveRates() {
    const a = Number(ra.replace(",", "."));
    const b = Number(rb.replace(",", "."));

    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) {
      N("Введіть коректні курси");
      return;
    }

    if (ratesSaving) return;

    setRatesSaving(true);
    try {
      await api("/api/admin/rates", {
        method: "PUT",
        body: JSON.stringify({
          usdt_uah: a,
          uah_usdt: b,
        }),
      });

      // Read back from the database so the UI only confirms a real save.
      const persisted = await api("/api/rates");
      if (
        Number(persisted.usdt_uah) !== a ||
        Number(persisted.uah_usdt) !== b
      ) {
        throw new Error("Курси не підтверджені базою даних. Спробуйте ще раз.");
      }

      R(persisted);
      RA(String(persisted.usdt_uah));
      RB(String(persisted.uah_usdt));

      const current = Number(amount.replace(",", ".")) || 0;
      const result =
        direction === "USDT_TO_UAH"
          ? current * Number(persisted.usdt_uah)
          : current / Number(persisted.uah_usdt);

      SetReceiveAmount(
        result.toFixed(direction === "USDT_TO_UAH" ? 2 : 6)
      );

      N("Курси успішно збережено");
    } catch (e: any) {
      N(e.message || "Не вдалося зберегти курси");
    } finally {
      setRatesSaving(false);
    }
  }

  async function addPromo() {
    if (!pt.trim() || !pd.trim()) {
      N("Заповніть назву та опис акції");
      return;
    }

    try {
      await api("/api/admin/promotions", {
        method: "POST",
        body: JSON.stringify({
          title: pt.trim(),
          description: pd.trim(),
        }),
      });

      PT("");
      PD("");

      P(await api("/api/promotions"));
      N("Акцію додано");
    } catch (e: any) {
      N(e.message);
    }
  }

  const statusLabel = (s: string) =>
    s === "В обработке" ? "В обробці" :
    s === "Отменена" ? "Скасована" :
    s === "Завершена" ? "Завершена" : "Нова";

  const statusClass = (s: string) =>
    s === "Завершена"
      ? "done"
      : s === "Отменена"
      ? "cancel"
      : s === "В обработке"
      ? "work"
      : "new";

  return (
    <div className="app">
      <header>
        <div className="logo">
          <ArrowDownUp />
        </div>

        <div>
          <b>
            SOYER <i>EXCHANGE</i>
          </b>
          <small>СЕРВІС ОБМІНУ</small>
        </div>

        <span className="online">● ОНЛАЙН</span>
      </header>

      {notice && (
        <div className="notice" onClick={() => N("")}>
          {notice}　×
        </div>
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
              Залиште заявку — менеджер уточнить деталі та підтвердить умови.
            </p>

            <div className="rates">
              <div>
                <label>USDT → UAH</label>
                <b>{fmt(rates.usdt_uah)} ₴</b>
              </div>

              <div>
                <label>UAH → USDT</label>
                <b>{fmt(rates.uah_usdt)} ₴</b>
              </div>
            </div>

            <small className="hint">
              <ShieldCheck size={14} />
              Курс орієнтовний · мінімум 10 USDT
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
                className={direction === "USDT_TO_UAH" ? "sel" : ""}
                onClick={() => changeDirection("USDT_TO_UAH")}
              >
                USDT → UAH
              </button>

              <button
                className={direction === "UAH_TO_USDT" ? "sel" : ""}
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
                  onChange={(e) => updateSend(e.target.value)}
                />

                <b>{direction === "USDT_TO_UAH" ? "USDT" : "UAH"}</b>
              </div>
            </div>

            <div className="swap">
              <ArrowDownUp />
            </div>

            <div className="amount receive">
              <small>Отримую</small>

              <div>
                <input
                  value={receiveAmount}
                  inputMode="decimal"
                  onChange={(e) => updateReceive(e.target.value)}
                />

                <b>{direction === "USDT_TO_UAH" ? "UAH" : "USDT"}</b>
              </div>
            </div>

            <label>Контакт для зв’язку (необов’язково)</label>

            <input
              className="text"
              placeholder="@username або телефон"
              value={contact}
              onChange={(e) => C(e.target.value)}
            />

            <button
              className="primary"
              disabled={busy}
              onClick={submit}
            >
              {busy ? "Надсилання…" : "Створити заявку"}
              <ArrowRight size={17} />
            </button>

            <p className="disclaimer">
              Заявка не є угодою. Не надсилайте кошти до підтвердження умов менеджером.
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
              <b>Статус заявки</b>
              <small>Сповіщення в Telegram</small>
            </div>

            <div>
              <Headphones />
              <b>Підтримка</b>
              <small>@soyermanager</small>
            </div>
          </div>
        </main>
      )}

      {tab === "orders" && (
        <main>
          <div className="title">
            <small>ВАША АКТИВНІСТЬ</small>
            <h1>Мої заявки</h1>
          </div>

          {ordersLoading ? (
            <div className="empty"><RefreshCw /><b>Завантаження заявок…</b></div>
          ) : ordersError ? (
            <div className="empty">
              <b>Не вдалося завантажити заявки</b>
              <p>{ordersError}</p>
              <button className="primary" onClick={refresh}>Спробувати ще раз</button>
            </div>
          ) : orders.length ? (
            orders.map((o) => (
              <article className="order" key={o.number}>
                <div className="orderhead">
                  <b>{o.number}</b>
                  <span className={statusClass(o.status)}>
                    {statusLabel(o.status)}
                  </span>
                </div>

                <h3>{o.direction}</h3>
                <p>
                  {fmt(o.amount, 6)} → {fmt(o.received, 6)}
                </p>

                <small>
                  {new Date(o.created).toLocaleString("uk-UA")}
                </small>
              </article>
            ))
          ) : (
            <div className="empty">
              <History />
              <b>Заявок поки немає</b>

              <button className="primary" onClick={() => T("home")}>
                Перейти до обміну
              </button>
            </div>
          )}
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

            <p>@{user?.username || "telegram"}</p>

            <p>Telegram ID: {user?.id || "—"}</p>

            <button
              className="primary"
              onClick={() =>
                window.open("https://t.me/soyermanager", "_blank")
              }
            >
              Зв’язатися з менеджером
            </button>
          </section>

          {isAdmin && (
            <button
              className="primary"
              onClick={() => {
                T("admin");
                loadAdmin();
              }}
            >
              <ShieldCheck size={18} />
              Панель адміністратора
            </button>
          )}

          <button className="outline" onClick={refresh}>
            <RefreshCw size={16} />
            Оновити дані
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
              value={ra}
              onChange={(e) => RA(e.target.value)}
              inputMode="decimal"
            />

            <label>UAH → USDT</label>

            <input
              className="text"
              value={rb}
              onChange={(e) => RB(e.target.value)}
              inputMode="decimal"
            />

            <button className="primary" onClick={saveRates} disabled={ratesSaving}>
              {ratesSaving ? "Збереження…" : "Зберегти курси"}
            </button>
          </section>

          <section className="panel">
            <h2>Додати акцію</h2>

            <input
              className="text"
              placeholder="Назва"
              value={pt}
              onChange={(e) => PT(e.target.value)}
            />

            <textarea
              className="text"
              placeholder="Опис"
              value={pd}
              onChange={(e) => PD(e.target.value)}
            />

            <button className="primary" onClick={addPromo}>
              Додати акцію
            </button>
          </section>

          <section>
            <h2>Заявки користувачів</h2>

            <button className="outline" onClick={loadAdmin}>
              <RefreshCw size={15} />
              Оновити
            </button>

            {adminOrdersLoading ? (
              <div className="empty"><RefreshCw /><b>Завантаження заявок…</b></div>
            ) : adminOrdersError ? (
              <div className="empty">
                <b>Не вдалося завантажити заявки</b>
                <p>{adminOrdersError}</p>
                <button className="primary" onClick={loadAdmin}>Спробувати ще раз</button>
                {adminOrders.length > 0 ? <p>Показано раніше завантажені заявки.</p> : null}
              </div>
            ) : adminOrders.length ? (
              adminOrders.map((o) => (
                <article className="order" key={o.number}>
                  <div className="orderhead">
                    <b>{o.number}</b>
                    <span className={statusClass(o.status)}>
                      {o.status}
                    </span>
                  </div>

                  <p>
                    {o.direction} · {o.amount} → {o.received}
                  </p>

                  <div className="customer-contact">
                    <p><b>Клієнт:</b> {o.customer_name || "Без імені"}</p>
                    <p><b>Telegram ID:</b> {o.user_id}</p>
                    {o.username ? (
                      <p><b>Telegram:</b> @{o.username}</p>
                    ) : null}
                    {o.contact ? (
                      <p><b>Контакт із заявки:</b> {o.contact}</p>
                    ) : (
                      <p><b>Контакт із заявки:</b> не вказано</p>
                    )}
                    <div className="actions">
                      {o.username ? (
                        <button onClick={() => window.open("https://t.me/" + encodeURIComponent(o.username), "_blank")}>
                          Відкрити чат
                        </button>
                      ) : (
                        <button onClick={() => navigator.clipboard?.writeText(String(o.user_id))}>
                          Скопіювати Telegram ID
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="actions">
                    {[
                      ["В обработке", "В обробці"],
                      ["Завершена", "Завершена"],
                      ["Отменена", "Скасована"],
                    ].map(([status, label]) => (
                      <button
                        key={status}
                        disabled={updatingOrder === o.number}
                        onClick={() => changeStatus(o.number, status)}
                      >
                        {updatingOrder === o.number ? "Збереження…" : label}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty">
                <History />
                <b>Заявок поки немає</b>
              </div>
            )}
          </section>
        </main>
      )}

      <nav>
        {[
          ["home", "Головна", Home],
          ["orders", "Заявки", History],
          ["promos", "Акції", Gift],
          ["profile", "Профіль", UserRound],
        ].map(([id, label, Icon]: any) => (
          <button
            className={tab === id ? "active" : ""}
            onClick={() => T(id)}
            key={id}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
