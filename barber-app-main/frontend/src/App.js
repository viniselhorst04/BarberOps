import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  Clock3,
  Coffee,
  Crown,
  LogOut,
  MapPin,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "@/App.css";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const money = (value) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    value || 0,
  );
const shopInitials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
const shopAddress = (shop) =>
  [
    shop.street,
    shop.number,
    shop.complement,
    shop.neighborhood,
    shop.city,
    shop.state,
  ]
    .filter(Boolean)
    .join(", ");
const formatShopHours = (hours = []) => {
  const active = hours.filter((item) => item.is_working);
  if (!active.length) return "Horários não cadastrados";
  const first = active[0];
  const sameTimes = active.every(
    (item) =>
      item.start_time === first.start_time && item.end_time === first.end_time,
  );
  return sameTimes
    ? `${active.length === 6 ? "Seg a sáb" : "Horário da unidade"} · ${first.start_time}–${first.end_time}`
    : `${active.length} dias de atendimento · consulte os horários`;
};
const api = async (path, options = {}) => {
  const token =
    localStorage.getItem("barberops_token") ||
    localStorage.getItem("imperial_token");
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json()
    : await res.text();
  if (!res.ok) {
    const detail =
      typeof body === "object" && typeof body.detail === "string"
        ? body.detail
        : "A API não está disponível neste endereço";
    throw new Error(detail);
  }
  if (typeof body === "string")
    throw new Error("A API retornou uma resposta inválida");
  return body;
};

function Auth({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    hair_type: "LISO",
  });
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = await api(
        `/auth/${mode === "login" ? "login" : "register"}`,
        { method: "POST", body: JSON.stringify(form) },
      );
      localStorage.setItem("barberops_token", body.token);
      onLogin(body.user);
      toast.success("Bem-vindo ao BarberOps");
    } catch (error) {
      toast.error(error.message);
    }
  };
  return (
    <main className="auth-shell">
      <div className="auth-visual">
        <div className="brand-mark">
          BARBER<span>OPS</span>
        </div>
        <div className="auth-copy">
          <p className="eyebrow">ESTILO SOB MEDIDA</p>
          <h1>Seu melhor corte começa aqui.</h1>
          <p>Agende seu momento. A gente cuida do resto.</p>
        </div>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <div className="mobile-brand brand-mark">
          BARBER<span>OPS</span>
        </div>
        <p className="eyebrow">
          {mode === "login" ? "BEM-VINDO DE VOLTA" : "PRIMEIRO ACESSO"}
        </p>
        <h2>{mode === "login" ? "Entre na sua conta" : "Crie seu perfil"}</h2>
        {mode !== "login" && (
          <Input
            data-testid="register-name-input"
            placeholder="Seu nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
        <Input
          data-testid="auth-email-input"
          type="email"
          placeholder="E-mail"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          data-testid="auth-password-input"
          type="password"
          placeholder="Senha"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {mode !== "login" && (
          <select
            data-testid="hair-type-select"
            value={form.hair_type}
            onChange={(e) => setForm({ ...form, hair_type: e.target.value })}
          >
            <option value="LISO">Cabelo liso</option>
            <option value="ONDULADO">Cabelo ondulado</option>
            <option value="CACHEADO">Cabelo cacheado</option>
            <option value="CRESPO">Cabelo crespo</option>
          </select>
        )}
        <Button
          data-testid="auth-submit-button"
          className="gold-button"
          type="submit"
        >
          {mode === "login" ? "Entrar" : "Criar conta"}
          <ChevronRight size={17} />
        </Button>
        <button
          data-testid="auth-mode-toggle"
          className="text-button"
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Ainda não sou cliente" : "Já tenho uma conta"}
        </button>
      </form>
    </main>
  );
}

function Header({ user, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand-mark">
        BARBER<span>OPS</span>
      </div>
      <div className="header-user">
        <span data-testid="header-user-name">
          Olá, {user.name.split(" ")[0]}
        </span>
        <button
          data-testid="logout-button"
          className="icon-button"
          onClick={onLogout}
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}

function ClientHome({ user, onLogout }) {
  const [shops, setShops] = useState([]);
  const [selectedShop, setSelectedShop] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [service, setService] = useState("");
  const [barber, setBarber] = useState("");
  const [slot, setSlot] = useState("");
  const [courtesy, setCourtesy] = useState("");
  const [product, setProduct] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [loyalty, setLoyalty] = useState({ stamps: 0 });
  const [slots, setSlots] = useState([]);
  const [isBooking, setIsBooking] = useState(false);
  const [isOfferOpen, setIsOfferOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlot, setRescheduleSlot] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [isAppointmentActionLoading, setIsAppointmentActionLoading] =
    useState(false);
  useEffect(() => {
    Promise.all([api("/shops"), api("/appointments/mine"), api("/loyalty")])
      .then(([s, a, l]) => {
        setShops(s);
        setSelectedShop(s[0]?.id || "");
        setAppointments(a);
        setLoyalty(l);
      })
      .catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => {
    if (!selectedShop) return;
    setCatalog(null);
    setService("");
    setBarber("");
    setSlot("");
    setCourtesy("");
    setProduct("");
    api(`/catalog?shop_id=${encodeURIComponent(selectedShop)}`)
      .then((c) => {
        setCatalog(c);
        setService(c.services[0]?.id || "");
        setBarber(c.barbers[0]?.id || "");
      })
      .catch((e) => toast.error(e.message));
  }, [selectedShop]);
  useEffect(() => {
    if (service && barber && date)
      api(
        `/slots?barber_id=${barber}&service_id=${service}&appointment_date=${date}`,
      )
        .then(setSlots)
        .catch(() => setSlots([]));
  }, [service, barber, date]);
  const selectedService = catalog?.services.find((x) => x.id === service);
  const matchingProducts =
    catalog?.products.filter((x) => x.target_hair_type === user.hair_type) ||
    [];
  const suggested = [
    ...matchingProducts,
    ...(catalog?.products || []).filter(
      (productItem) =>
        !matchingProducts.some((item) => item.id === productItem.id),
    ),
  ];
  const hasIdealProduct = matchingProducts.length > 0;
  const confirmBooking = async (selectedProduct = product) => {
    if (!slot) return toast.error("Escolha um horário");
    setIsBooking(true);
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          barber_id: barber,
          service_id: service,
          appointment_date: date,
          start_time: slot,
          courtesy_id: courtesy || null,
          product_ids: selectedProduct ? [selectedProduct] : [],
          payment_method: "IN_PERSON",
        }),
      });
      toast.success("Horário reservado!");
      setAppointments(await api("/appointments/mine"));
      setSlot("");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsBooking(false);
    }
  };
  const book = () => {
    if (!slot) return toast.error("Escolha um horário");
    if (suggested.length > 0 && !product) {
      setIsOfferOpen(true);
      return;
    }
    confirmBooking();
  };
  const acceptOffer = (productId) => {
    setProduct(productId);
    setIsOfferOpen(false);
    confirmBooking(productId);
  };
  const openReschedule = (appointment) => {
    setRescheduleTarget(appointment);
    setRescheduleDate(appointment.appointment_date);
    setRescheduleSlot("");
  };
  useEffect(() => {
    if (!rescheduleTarget || !rescheduleDate) return;
    setRescheduleSlots([]);
    api(
      `/slots?barber_id=${rescheduleTarget.barber_id}&service_id=${rescheduleTarget.service_id}&appointment_date=${rescheduleDate}&exclude_appointment_id=${rescheduleTarget.id}`,
    )
      .then(setRescheduleSlots)
      .catch(() => setRescheduleSlots([]));
  }, [rescheduleTarget, rescheduleDate]);
  const cancelAppointment = async () => {
    setIsAppointmentActionLoading(true);
    try {
      await api(`/appointments/${cancelTarget.id}/cancel`, { method: "POST" });
      setAppointments(await api("/appointments/mine"));
      setCancelTarget(null);
      toast.success("Agendamento cancelado");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsAppointmentActionLoading(false);
    }
  };
  const rescheduleAppointment = async (event) => {
    event.preventDefault();
    if (!rescheduleSlot) return toast.error("Escolha um novo horário");
    setIsAppointmentActionLoading(true);
    try {
      await api(`/appointments/${rescheduleTarget.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({
          appointment_date: rescheduleDate,
          start_time: rescheduleSlot,
        }),
      });
      setAppointments(await api("/appointments/mine"));
      setRescheduleTarget(null);
      toast.success("Agendamento remarcado");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setIsAppointmentActionLoading(false);
    }
  };
  const canManageAppointment = (appointment) => {
    if (appointment.status !== "CONFIRMED") return false;
    return (
      new Date(`${appointment.appointment_date}T${appointment.start_time}`) >
      new Date()
    );
  };
  const bookingProgress = [service, date, slot].filter(Boolean).length;
  const bookingSteps = [
    { label: "Serviço", value: selectedService?.name || "Escolha um serviço" },
    {
      label: "Data",
      value: date
        ? new Date(`${date}T12:00`).toLocaleDateString("pt-BR")
        : "Escolha uma data",
    },
    { label: "Horário", value: slot || "Escolha um horário" },
  ];
  if (!catalog)
    return <div className="loading-state">Preparando sua experiência...</div>;
  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <main className="client-layout">
        {isOfferOpen && (
          <div className="offer-backdrop" role="presentation">
            <section
              className="offer-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="offer-title"
            >
              <button
                className="offer-close"
                type="button"
                aria-label="Fechar oferta"
                onClick={() => setIsOfferOpen(false)}
              >
                ×
              </button>
              <span className="offer-icon">
                <Sparkles size={22} />
              </span>
              <p className="eyebrow">OFERTA PARA O SEU PERFIL</p>
              <h2 id="offer-title">Complete seu ritual em casa.</h2>
              <p className="offer-copy">
                {hasIdealProduct
                  ? `Encontramos um produto ideal para cabelos ${user.hair_type.toLowerCase()}.`
                  : "Selecionamos um produto recomendado pela nossa barbearia para completar seu ritual."}{" "}
                Aproveite 10% de desconto adicionando ao seu agendamento.
              </p>
              <div className="offer-products">
                {suggested.map((p) => (
                  <div className="offer-product" key={p.id}>
                    <img src={p.image_url} alt="" />
                    <div>
                      <b>{p.name}</b>
                      <span>
                        De {money(p.price)} por{" "}
                        <strong>{money(p.price * 0.9)}</strong>
                      </span>
                    </div>
                    <button type="button" onClick={() => acceptOffer(p.id)}>
                      Adicionar
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="offer-skip"
                type="button"
                onClick={() => {
                  setIsOfferOpen(false);
                  confirmBooking();
                }}
              >
                Continuar sem produto
              </button>
            </section>
          </div>
        )}
        {cancelTarget && (
          <div className="offer-backdrop" role="presentation">
            <section
              className="action-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cancel-title"
            >
              <button
                className="offer-close"
                type="button"
                aria-label="Fechar"
                onClick={() => setCancelTarget(null)}
              >
                <X size={17} />
              </button>
              <span className="action-icon danger">
                <Trash2 size={21} />
              </span>
              <p className="eyebrow">CANCELAR AGENDAMENTO</p>
              <h2 id="cancel-title">Quer liberar este horário?</h2>
              <p className="offer-copy">
                Seu horário de {cancelTarget.appointment_date} às{" "}
                {cancelTarget.start_time} será liberado para outros clientes.
              </p>
              <div className="action-modal-buttons">
                <button
                  className="offer-skip"
                  type="button"
                  onClick={() => setCancelTarget(null)}
                >
                  Manter agendamento
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={isAppointmentActionLoading}
                  onClick={cancelAppointment}
                >
                  {isAppointmentActionLoading
                    ? "Cancelando..."
                    : "Cancelar agendamento"}
                </button>
              </div>
            </section>
          </div>
        )}
        {rescheduleTarget && (
          <div className="offer-backdrop" role="presentation">
            <form
              className="action-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reschedule-title"
              onSubmit={rescheduleAppointment}
            >
              <button
                className="offer-close"
                type="button"
                aria-label="Fechar"
                onClick={() => setRescheduleTarget(null)}
              >
                <X size={17} />
              </button>
              <span className="action-icon">
                <CalendarDays size={21} />
              </span>
              <p className="eyebrow">REMARCAR AGENDAMENTO</p>
              <h2 id="reschedule-title">Escolha um novo momento.</h2>
              <p className="offer-copy">
                O serviço e o barbeiro continuam os mesmos. Selecione apenas uma
                nova data e horário.
              </p>
              <div className="reschedule-fields">
                <label>
                  Nova data
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={rescheduleDate}
                    onChange={(e) => {
                      setRescheduleDate(e.target.value);
                      setRescheduleSlot("");
                    }}
                  />
                </label>
                <label>
                  Novo horário
                  <select
                    value={rescheduleSlot}
                    onChange={(e) => setRescheduleSlot(e.target.value)}
                  >
                    <option value="">Escolha um horário</option>
                    {rescheduleSlots.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {!rescheduleSlots.length && (
                <p className="empty-note">
                  Nenhum horário disponível nesta data.
                </p>
              )}
              <div className="action-modal-buttons">
                <button
                  className="offer-skip"
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                >
                  Voltar
                </button>
                <button
                  className="gold-button"
                  type="submit"
                  disabled={isAppointmentActionLoading || !rescheduleSlot}
                >
                  {isAppointmentActionLoading
                    ? "Salvando..."
                    : "Confirmar nova data"}
                </button>
              </div>
            </form>
          </div>
        )}
        <section className="experience-shell">
          <div className="hero-panel">
            <p className="eyebrow">SEU RITUAL</p>
            <h1>
              Seu próximo momento, <em>{user.name.split(" ")[0]}.</em>
            </h1>
            <p className="hero-copy">
              Agende um corte premium, acompanhe sua fidelidade e viva uma
              experiência feita sob medida para o seu estilo.
            </p>
            <div className="status-pills">
              <span className="status-pill">
                <Sparkles size={14} /> Atendimento premium
              </span>
              <span className="status-pill subtle">
                <ShieldCheck size={14} /> Confiança total
              </span>
            </div>
          </div>

          <div className="mini-metrics">
            <div className="mini-card">
              <span>Próximo corte</span>
              <strong>
                {appointments[0] ? appointments[0].service_name : "A definir"}
              </strong>
              <small>
                {appointments[0]
                  ? `${appointments[0].appointment_date} · ${appointments[0].start_time}`
                  : "Escolha seu horário"}
              </small>
            </div>
            <div className="mini-card accent">
              <span>Fidelidade</span>
              <strong>{loyalty.stamps}/10</strong>
              <small>
                {loyalty.discount_ready
                  ? "50% liberado"
                  : "Faltam alguns selos"}
              </small>
            </div>
          </div>
        </section>

        <section className="welcome-row">
          <div>
            <p className="eyebrow soft">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h2>Personalize sua experiência</h2>
          </div>
          <div className="welcome-actions">
            <div className="loyalty-mini" data-testid="loyalty-summary">
              <Crown size={19} />
              <div>
                <b>{loyalty.stamps}/10 selos</b>
                <span>
                  {loyalty.discount_ready ? "50% liberado" : "Mais um pouco"}
                </span>
              </div>
            </div>
          </div>
        </section>
        <section
          className="shop-selection"
          aria-labelledby="shop-selection-title"
        >
          <div className="shop-selection-heading">
            <div>
              <p className="eyebrow soft">SEU DESTINO</p>
              <h2 id="shop-selection-title">Escolha onde viver seu ritual</h2>
              <p>
                Compare as unidades e selecione a barbearia ideal para você.
              </p>
            </div>
            <MapPin size={24} />
          </div>
          <div className="shop-card-list">
            {shops.map((shop) => {
              const isSelected = selectedShop === shop.id;
              return (
                <button
                  type="button"
                  data-testid={`shop-card-${shop.id}`}
                  className={`shop-card ${isSelected ? "selected" : ""}`}
                  key={shop.id}
                  onClick={() => setSelectedShop(shop.id)}
                  aria-pressed={isSelected}
                >
                  <span className="shop-logo">
                    {shop.logo_url ? (
                      <img src={shop.logo_url} alt="" />
                    ) : (
                      shopInitials(shop.name)
                    )}
                  </span>
                  <span className="shop-card-content">
                    <strong>{shop.name}</strong>
                    <span className="shop-detail">
                      <MapPin size={13} />
                      {shopAddress(shop) || "Endereço não cadastrado"}
                    </span>
                    <span className="shop-detail">
                      <Clock3 size={13} />
                      {formatShopHours(shop.opening_hours)}
                    </span>
                  </span>
                  <span className="shop-card-check" aria-hidden="true">
                    {isSelected ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <section
          className="booking-progress"
          aria-label="Progresso do agendamento"
        >
          <div className="progress-intro">
            <span className="progress-count">{bookingProgress}/4</span>
            <div>
              <b>Seu agendamento</b>
              <span>
                {bookingProgress === 4
                  ? "Tudo pronto para confirmar"
                  : "Complete os detalhes do seu ritual"}
              </span>
            </div>
          </div>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${bookingProgress * 33.333}%` }} />
          </div>
          <div className="progress-steps">
            {bookingSteps.map((step, index) => (
              <div
                className={
                  step.value.startsWith("Escolha")
                    ? "progress-step"
                    : "progress-step complete"
                }
                key={step.label}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{step.label}</b>
                  <small>{step.value}</small>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="booking-grid">
          <div className="booking-panel">
            <div className="section-heading">
              <span className="number">01</span>
              <div>
                <h2>Escolha seu serviço</h2>
                <p>O ritual começa pela escolha certa.</p>
              </div>
            </div>
            <div className="service-list">
              {catalog.services.map((item) => (
                <button
                  data-testid={`service-${item.id}`}
                  className={`service-option ${service === item.id ? "selected" : ""}`}
                  onClick={() => setService(item.id)}
                  key={item.id}
                >
                  <span>
                    <Scissors size={18} />
                    <b>{item.name}</b>
                  </span>
                  <span>
                    <small>{item.duration_minutes} min</small>
                    <strong>{money(item.price)}</strong>
                  </span>
                </button>
              ))}
            </div>
            <div className="section-heading second">
              <span className="number">02</span>
              <div>
                <h2>Quando você vem?</h2>
                <p>Escolha uma data e veja horários reais.</p>
              </div>
            </div>
            <div className="date-row">
              <Input
                data-testid="appointment-date-input"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSlot("");
                }}
              />
              <select
                data-testid="barber-select"
                value={barber}
                onChange={(e) => setBarber(e.target.value)}
              >
                {catalog.barbers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="slot-list">
              {slots.length ? (
                slots.map((s) => (
                  <button
                    data-testid={`slot-${s.replace(":", "-")}`}
                    key={s}
                    className={`slot ${slot === s ? "selected" : ""}`}
                    onClick={() => setSlot(s)}
                  >
                    <Clock3 size={14} />
                    {s}
                  </button>
                ))
              ) : (
                <span className="empty-note">
                  Sem horários disponíveis nesta data.
                </span>
              )}
            </div>
          </div>
          <aside className="checkout-panel">
            <div className="panel-kicker">
              <Sparkles size={16} /> FINALIZAÇÃO
            </div>
            <h2>Seu ritual</h2>
            <div className="summary-line">
              <span>{selectedService?.name}</span>
              <b>{money(selectedService?.price)}</b>
            </div>
            {suggested.length > 0 && (
              <div className="upsell-block">
                <p>
                  <Sparkles size={14} />
                  {hasIdealProduct
                    ? `Feito para o seu cabelo ${user.hair_type.toLowerCase()}`
                    : "Recomendação da nossa barbearia"}
                </p>
                {suggested.map((p) => (
                  <button
                    data-testid={`product-${p.id}`}
                    className={`product-suggestion ${product === p.id ? "selected" : ""}`}
                    key={p.id}
                    onClick={() => setProduct(product === p.id ? "" : p.id)}
                  >
                    <img src={p.image_url} alt="" />
                    <span>
                      <b>{p.name}</b>
                      <small>10% off no agendamento</small>
                    </span>
                    <strong>{money(p.price * 0.9)}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="courtesy-block">
              <label>
                <Coffee size={15} /> Uma cortesia para você?
              </label>
              <select
                data-testid="courtesy-select"
                value={courtesy}
                onChange={(e) => setCourtesy(e.target.value)}
              >
                <option value="">Sem cortesia</option>
                {catalog.courtesies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="payment-note">
              <ShieldCheck size={17} />
              <span>
                <b>Pagamento no salão</b>
                <small>PIX ficará disponível quando configurado</small>
              </span>
            </div>
            <Button
              data-testid="book-appointment-button"
              className="gold-button booking-submit"
              onClick={book}
              disabled={isBooking}
            >
              {isBooking ? "Confirmando..." : "Confirmar agendamento"}
              {!isBooking && <ChevronRight size={17} />}
            </Button>
          </aside>
        </section>
        <section className="history-section">
          <div className="section-heading">
            <CalendarDays size={20} />
            <div>
              <h2>Seus agendamentos</h2>
              <p>Um histórico do seu estilo.</p>
            </div>
          </div>
          {appointments.length ? (
            <div className="appointment-list">
              {appointments.map((a) => (
                <div
                  className="appointment-row history-appointment"
                  data-testid={`appointment-${a.id}`}
                  key={a.id}
                >
                  <div className="appointment-date">
                    <b>
                      {new Date(
                        `${a.appointment_date}T12:00`,
                      ).toLocaleDateString("pt-BR", { day: "2-digit" })}
                    </b>
                    <span>
                      {new Date(
                        `${a.appointment_date}T12:00`,
                      ).toLocaleDateString("pt-BR", { month: "short" })}
                    </span>
                  </div>
                  <div className="appointment-main">
                    <b>{a.service_name}</b>
                    <span className="appointment-detail">
                      {a.start_time}–{a.end_time} ·{" "}
                      {a.barber_name || "Barbeiro não informado"}
                    </span>
                    <span className="appointment-detail">
                      {a.shop_name || "Barbearia não informada"}
                    </span>
                    {a.products?.length > 0 && (
                      <span className="appointment-products">
                        Produto:{" "}
                        {a.products.map((item) => item.name).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="appointment-summary">
                    <span
                      className={`status appointment-status ${a.status.toLowerCase()}`}
                    >
                      {a.status === "CONFIRMED"
                        ? "Confirmado"
                        : a.status === "CANCELLED"
                          ? "Cancelado"
                          : a.status === "COMPLETED"
                            ? "Concluído"
                            : a.status}
                    </span>
                    <strong>{money(a.total)}</strong>
                    <small>Total do atendimento</small>
                  </div>
                  {canManageAppointment(a) && (
                    <div className="appointment-actions">
                      <button type="button" onClick={() => openReschedule(a)}>
                        Remarcar
                      </button>
                      <button
                        type="button"
                        className="cancel-action"
                        onClick={() => setCancelTarget(a)}
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">
              Seu próximo corte está esperando por você.
            </p>
          )}
        </section>
      </main>
    </>
  );
}

const weekDays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function BarberManager() {
  const [barbers, setBarbers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    is_active: true,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const result = await api("/admin/barbers");
    setBarbers(result);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((e) => {
      toast.error(e.message);
      setLoading(false);
    });
  }, []);

  const createBarber = async (event) => {
    event.preventDefault();
    try {
      await api("/admin/barbers", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "", is_active: true });
      await load();
      toast.success("Barbeiro adicionado");
    } catch (e) {
      toast.error(e.message);
    }
  };

  const toggleBarber = async (barberId, isActive) => {
    try {
      await api(`/admin/barbers/${barberId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: isActive }),
      });
      await load();
      toast.success(isActive ? "Barbeiro ativado" : "Barbeiro desativado");
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <section className="schedule-panel">
        <p className="empty-note">Carregando barbeiros...</p>
      </section>
    );
  }

  return (
    <section className="schedule-panel">
      <div className="section-heading">
        <UserRound size={20} />
        <div>
          <h2>Cadastro de barbeiros</h2>
          <p>Adicione novos profissionais e ative ou desative cada agenda.</p>
        </div>
      </div>

      <form className="barber-manager-form" onSubmit={createBarber}>
        <label>
          Nome
          <input
            placeholder="Nome do barbeiro"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label>
          E-mail
          <input
            type="email"
            placeholder="barbeiro@imperial.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            placeholder="Senha temporária"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>
        <label className="schedule-toggle">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />{" "}
          Ativo ao cadastrar
        </label>
        <Button className="gold-button" type="submit">
          Adicionar barbeiro
        </Button>
      </form>

      <div className="barber-manager-list">
        {barbers.map((barber) => (
          <div className="barber-manager-row" key={barber.id}>
            <div>
              <b>{barber.name}</b>
              <span>{barber.email}</span>
            </div>
            <div className="barber-manager-actions">
              <span
                className={`status ${barber.is_active ? "confirmed" : "cancelled"}`}
              >
                {barber.is_active ? "Ativo" : "Inativo"}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => toggleBarber(barber.id, !barber.is_active)}
              >
                {barber.is_active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ServiceManager() {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    name: "",
    price: "",
    duration_minutes: "30",
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const result = await api("/admin/services");
    setServices(result);
    setLoading(false);
  };
  useEffect(() => {
    load().catch((e) => {
      toast.error(e.message);
      setLoading(false);
    });
  }, []);
  const createService = async (event) => {
    event.preventDefault();
    try {
      await api("/admin/services", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          duration_minutes: Number(form.duration_minutes),
        }),
      });
      setForm({ name: "", price: "", duration_minutes: "30", is_active: true });
      await load();
      toast.success("Serviço adicionado");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggleService = async (service) => {
    try {
      await api(`/admin/services/${service.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...service, is_active: !service.is_active }),
      });
      await load();
      toast.success(
        service.is_active ? "Serviço desativado" : "Serviço ativado",
      );
    } catch (e) {
      toast.error(e.message);
    }
  };
  if (loading) {
    return (
      <section className="schedule-panel">
        <p className="empty-note">Carregando serviços...</p>
      </section>
    );
  }
  return (
    <section className="schedule-panel">
      <div className="section-heading">
        <Scissors size={20} />
        <div>
          <h2>Cadastro de serviços</h2>
          <p>Defina os serviços oferecidos pela sua barbearia.</p>
        </div>
      </div>
      <form className="service-manager-form" onSubmit={createService}>
        <input
          placeholder="Nome do serviço"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Preço"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="number"
          min="1"
          max="240"
          placeholder="Duração em minutos"
          value={form.duration_minutes}
          onChange={(e) =>
            setForm({ ...form, duration_minutes: e.target.value })
          }
        />
        <Button className="gold-button" type="submit">
          Adicionar serviço
        </Button>
      </form>
      <div className="barber-manager-list">
        {services.map((service) => (
          <div className="barber-manager-row" key={service.id}>
            <div>
              <b>{service.name}</b>
              <span>
                {service.duration_minutes} min · {money(service.price)}
              </span>
            </div>
            <div className="barber-manager-actions">
              <span
                className={`status ${service.is_active ? "confirmed" : "cancelled"}`}
              >
                {service.is_active ? "Ativo" : "Inativo"}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => toggleService(service)}
              >
                {service.is_active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductManager() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    name: "",
    price: "",
    cost_price: "",
    stock_quantity: "",
    target_hair_type: "LISO",
    image_url: "",
  });
  const load = async () => setProducts(await api("/admin/products"));
  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);
  const create = async (event) => {
    event.preventDefault();
    try {
      await api("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          price: Number(form.price),
          cost_price: Number(form.cost_price),
          stock_quantity: Number(form.stock_quantity),
          is_active: true,
        }),
      });
      setForm({
        name: "",
        price: "",
        cost_price: "",
        stock_quantity: "",
        target_hair_type: "LISO",
        image_url: "",
      });
      await load();
      toast.success("Produto adicionado");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (product) => {
    try {
      await api(`/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...product, is_active: !product.is_active }),
      });
      await load();
      toast.success(
        product.is_active ? "Produto desativado" : "Produto ativado",
      );
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <section className="schedule-panel">
      <div className="section-heading">
        <Sparkles size={20} />
        <div>
          <h2>Cadastro de produtos</h2>
          <p>Controle produtos, preços e estoque da loja.</p>
        </div>
      </div>
      <form className="catalog-manager-form" onSubmit={create}>
        <input
          placeholder="Nome do produto"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Preço de venda"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Preço de custo"
          value={form.cost_price}
          onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
        />
        <input
          type="number"
          min="0"
          placeholder="Estoque"
          value={form.stock_quantity}
          onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
        />
        <select
          value={form.target_hair_type}
          onChange={(e) =>
            setForm({ ...form, target_hair_type: e.target.value })
          }
        >
          <option value="LISO">Liso</option>
          <option value="ONDULADO">Ondulado</option>
          <option value="CACHEADO">Cacheado</option>
          <option value="CRESPO">Crespo</option>
        </select>
        <input
          placeholder="URL da imagem (opcional)"
          value={form.image_url}
          onChange={(e) => setForm({ ...form, image_url: e.target.value })}
        />
        <Button className="gold-button" type="submit">
          Adicionar produto
        </Button>
      </form>
      <div className="barber-manager-list">
        {products.map((product) => (
          <div className="barber-manager-row" key={product.id}>
            <div>
              <b>{product.name}</b>
              <span>
                {money(product.price)} · estoque {product.stock_quantity}
              </span>
            </div>
            <div className="barber-manager-actions">
              <span
                className={`status ${product.is_active ? "confirmed" : "cancelled"}`}
              >
                {product.is_active ? "Ativo" : "Inativo"}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => toggle(product)}
              >
                {product.is_active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CourtesyManager() {
  const [courtesies, setCourtesies] = useState([]);
  const [name, setName] = useState("");
  const load = async () => setCourtesies(await api("/admin/courtesies"));
  useEffect(() => {
    load().catch((e) => toast.error(e.message));
  }, []);
  const create = async (event) => {
    event.preventDefault();
    try {
      await api("/admin/courtesies", {
        method: "POST",
        body: JSON.stringify({ name, is_active: true }),
      });
      setName("");
      await load();
      toast.success("Cortesia adicionada");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (courtesy) => {
    try {
      await api(`/admin/courtesies/${courtesy.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...courtesy, is_active: !courtesy.is_active }),
      });
      await load();
      toast.success(
        courtesy.is_active ? "Cortesia desativada" : "Cortesia ativada",
      );
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <section className="schedule-panel">
      <div className="section-heading">
        <Coffee size={20} />
        <div>
          <h2>Cadastro de cortesias</h2>
          <p>Defina as cortesias oferecidas aos clientes.</p>
        </div>
      </div>
      <form className="courtesy-manager-form" onSubmit={create}>
        <input
          placeholder="Nome da cortesia"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button className="gold-button" type="submit">
          Adicionar cortesia
        </Button>
      </form>
      <div className="barber-manager-list">
        {courtesies.map((courtesy) => (
          <div className="barber-manager-row" key={courtesy.id}>
            <b>{courtesy.name}</b>
            <div className="barber-manager-actions">
              <span
                className={`status ${courtesy.is_active ? "confirmed" : "cancelled"}`}
              >
                {courtesy.is_active ? "Ativa" : "Inativa"}
              </span>
              <button
                className="text-button"
                type="button"
                onClick={() => toggle(courtesy)}
              >
                {courtesy.is_active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SchedulePanel() {
  const [data, setData] = useState({
    barbers: [],
    schedules: [],
    exceptions: [],
  });
  const [barberId, setBarberId] = useState("");
  const [exception, setException] = useState({
    exception_date: "",
    start_time: "09:00",
    end_time: "18:00",
    is_working: false,
    reason: "",
  });
  const [loading, setLoading] = useState(true);
  const load = async () => {
    const result = await api("/admin/schedules");
    setData(result);
    setBarberId((current) => current || result.barbers[0]?.id || "");
    setLoading(false);
  };
  useEffect(() => {
    load().catch((e) => {
      toast.error(e.message);
      setLoading(false);
    });
  }, []);
  const currentSchedule = (day) =>
    data.schedules.find(
      (item) => item.barber_id === barberId && item.day_of_week === day,
    ) || { start_time: "09:00", end_time: "18:00", is_working: day < 6 };
  const updateDay = (day, field, value) =>
    setData((current) => ({
      ...current,
      schedules: current.schedules
        .map((item) =>
          item.barber_id === barberId && item.day_of_week === day
            ? { ...item, [field]: value }
            : item,
        )
        .concat(
          current.schedules.some(
            (item) => item.barber_id === barberId && item.day_of_week === day,
          )
            ? []
            : [
                {
                  barber_id: barberId,
                  day_of_week: day,
                  start_time: "09:00",
                  end_time: "18:00",
                  is_working: day < 6,
                  [field]: value,
                },
              ],
        ),
    }));
  const saveDay = async (day) => {
    const schedule = currentSchedule(day);
    try {
      await api(`/admin/schedules/${barberId}/${day}`, {
        method: "PUT",
        body: JSON.stringify({
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          is_working: schedule.is_working,
        }),
      });
      toast.success("Expediente atualizado");
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const saveException = async (event) => {
    event.preventDefault();
    if (!exception.exception_date) return toast.error("Escolha uma data");
    try {
      await api("/admin/schedule-exceptions", {
        method: "POST",
        body: JSON.stringify({ barber_id: barberId, ...exception }),
      });
      toast.success("Exceção salva");
      setException({
        exception_date: "",
        start_time: "09:00",
        end_time: "18:00",
        is_working: false,
        reason: "",
      });
      await load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const removeException = async (id) => {
    try {
      await api(`/admin/schedule-exceptions/${id}`, { method: "DELETE" });
      await load();
      toast.success("Exceção removida");
    } catch (e) {
      toast.error(e.message);
    }
  };
  if (loading)
    return (
      <section className="schedule-panel">
        <p className="empty-note">Carregando expediente...</p>
      </section>
    );
  return (
    <section className="schedule-panel">
      <div className="section-heading">
        <Clock3 size={20} />
        <div>
          <h2>Horários personalizados</h2>
          <p>Ajuste o expediente e as exceções da agenda.</p>
        </div>
      </div>
      {data.barbers.length ? (
        <>
          <label className="schedule-select">
            Barbeiro
            <select
              value={barberId}
              onChange={(e) => setBarberId(e.target.value)}
            >
              {data.barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                  {barber.name}
                </option>
              ))}
            </select>
          </label>
          <div className="schedule-list">
            {weekDays.map((name, day) => {
              const schedule = currentSchedule(day);
              return (
                <div className="schedule-row" key={day}>
                  <strong>{name}</strong>
                  <label className="schedule-toggle">
                    <input
                      type="checkbox"
                      checked={schedule.is_working}
                      onChange={(e) =>
                        updateDay(day, "is_working", e.target.checked)
                      }
                    />{" "}
                    Aberto
                  </label>
                  <input
                    aria-label={`${name} início`}
                    type="time"
                    value={schedule.start_time}
                    onChange={(e) =>
                      updateDay(day, "start_time", e.target.value)
                    }
                  />
                  <span>até</span>
                  <input
                    aria-label={`${name} fim`}
                    type="time"
                    value={schedule.end_time}
                    onChange={(e) => updateDay(day, "end_time", e.target.value)}
                  />
                  <Button size="sm" onClick={() => saveDay(day)}>
                    Salvar
                  </Button>
                </div>
              );
            })}
          </div>
          <form className="exception-form" onSubmit={saveException}>
            <div>
              <label>
                Data
                <input
                  type="date"
                  value={exception.exception_date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) =>
                    setException({
                      ...exception,
                      exception_date: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                Motivo
                <input
                  placeholder="Ex.: Feriado"
                  value={exception.reason}
                  onChange={(e) =>
                    setException({ ...exception, reason: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="schedule-toggle">
              <input
                type="checkbox"
                checked={exception.is_working}
                onChange={(e) =>
                  setException({ ...exception, is_working: e.target.checked })
                }
              />{" "}
              Trabalha neste dia
            </label>
            {exception.is_working && (
              <div>
                <label>
                  Início
                  <input
                    type="time"
                    value={exception.start_time}
                    onChange={(e) =>
                      setException({ ...exception, start_time: e.target.value })
                    }
                  />
                </label>
                <label>
                  Fim
                  <input
                    type="time"
                    value={exception.end_time}
                    onChange={(e) =>
                      setException({ ...exception, end_time: e.target.value })
                    }
                  />
                </label>
              </div>
            )}
            <Button className="gold-button" type="submit">
              Adicionar exceção
            </Button>
          </form>
          <div className="exception-list">
            {data.exceptions
              .filter((item) => item.barber_id === barberId)
              .map((item) => (
                <div className="exception-row" key={item.id}>
                  <div>
                    <b>
                      {new Date(
                        `${item.exception_date}T12:00`,
                      ).toLocaleDateString("pt-BR")}
                    </b>
                    <span>
                      {item.reason || "Exceção"} ·{" "}
                      {item.is_working
                        ? `${item.start_time} às ${item.end_time}`
                        : "Fechado"}
                    </span>
                  </div>
                  <button
                    className="icon-button"
                    title="Remover exceção"
                    onClick={() => removeException(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
        </>
      ) : (
        <p className="empty-note">Nenhum barbeiro cadastrado.</p>
      )}
    </section>
  );
}

function ShopAddressManager() {
  const [shop, setShop] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api("/admin/shop")
      .then((result) => {
        setShop(result);
        setForm({
          postal_code: result.postal_code || "",
          street: result.street || "",
          number: result.number || "",
          complement: result.complement || "",
          neighborhood: result.neighborhood || "",
          city: result.city || "",
          state: result.state || "",
          country: result.country || "Brasil",
        });
      })
      .catch((e) => toast.error(e.message));
  }, []);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await api("/admin/shop/address", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setShop(result);
      toast.success("Endereço da barbearia atualizado");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };
  const update = (field, value) => setForm({ ...form, [field]: value });
  return (
    <section className="schedule-panel shop-address-manager">
      <div className="section-heading">
        <MapPin size={20} />
        <div>
          <h2>Endereço da sua barbearia</h2>
          <p>Esses dados aparecem para clientes na escolha da unidade.</p>
        </div>
      </div>
      {shop && (
        <p className="address-preview">
          {shopAddress(shop) || "Preencha o endereço da unidade"}
        </p>
      )}
      <form className="address-admin-form" onSubmit={save}>
        <Input
          placeholder="CEP"
          value={form.postal_code || ""}
          onChange={(e) => update("postal_code", e.target.value)}
        />
        <Input
          placeholder="Logradouro / rua"
          value={form.street || ""}
          onChange={(e) => update("street", e.target.value)}
        />
        <Input
          placeholder="Número"
          value={form.number || ""}
          onChange={(e) => update("number", e.target.value)}
        />
        <Input
          placeholder="Complemento"
          value={form.complement || ""}
          onChange={(e) => update("complement", e.target.value)}
        />
        <Input
          placeholder="Bairro"
          value={form.neighborhood || ""}
          onChange={(e) => update("neighborhood", e.target.value)}
        />
        <Input
          placeholder="Cidade"
          value={form.city || ""}
          onChange={(e) => update("city", e.target.value)}
        />
        <Input
          placeholder="Estado / UF"
          value={form.state || ""}
          onChange={(e) => update("state", e.target.value)}
        />
        <Input
          placeholder="País"
          value={form.country || ""}
          onChange={(e) => update("country", e.target.value)}
        />
        <Button className="gold-button" type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar endereço"}
        </Button>
      </form>
    </section>
  );
}

function ShopHoursManager() {
  const [hours, setHours] = useState(
    weekDays.map((_, day) => ({
      day_of_week: day,
      start_time: "09:00",
      end_time: "18:00",
      is_working: day < 6,
    })),
  );
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState(null);
  useEffect(() => {
    api("/admin/shop/hours")
      .then((result) => {
        setHours((current) =>
          current.map(
            (fallback) =>
              result.find(
                (item) => item.day_of_week === fallback.day_of_week,
              ) || fallback,
          ),
        );
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);
  const update = (day, field, value) =>
    setHours((current) =>
      current.map((item) =>
        item.day_of_week === day ? { ...item, [field]: value } : item,
      ),
    );
  const save = async (day) => {
    setSavingDay(day);
    try {
      await api(`/admin/shop/hours/${day}`, {
        method: "PUT",
        body: JSON.stringify(hours.find((item) => item.day_of_week === day)),
      });
      toast.success("Horário da unidade atualizado");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSavingDay(null);
    }
  };
  return (
    <section className="schedule-panel shop-hours-manager">
      <div className="section-heading">
        <Clock3 size={20} />
        <div>
          <h2>Funcionamento da unidade</h2>
          <p>Defina o limite geral de atendimento da sua barbearia.</p>
        </div>
      </div>
      {loading ? (
        <p className="empty-note">Carregando horários...</p>
      ) : (
        <div className="shop-hours-list">
          {hours.map((item) => (
            <div className="shop-hours-row" key={item.day_of_week}>
              <strong>{weekDays[item.day_of_week]}</strong>
              <label className="schedule-toggle">
                <input
                  type="checkbox"
                  checked={item.is_working}
                  onChange={(e) =>
                    update(item.day_of_week, "is_working", e.target.checked)
                  }
                />
                Aberto
              </label>
              <input
                type="time"
                value={item.start_time}
                disabled={!item.is_working}
                onChange={(e) =>
                  update(item.day_of_week, "start_time", e.target.value)
                }
              />
              <span>até</span>
              <input
                type="time"
                value={item.end_time}
                disabled={!item.is_working}
                onChange={(e) =>
                  update(item.day_of_week, "end_time", e.target.value)
                }
              />
              <Button
                size="sm"
                onClick={() => save(item.day_of_week)}
                disabled={savingDay === item.day_of_week}
              >
                {savingDay === item.day_of_week ? "Salvando" : "Salvar"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AdminHome({ user, onLogout }) {
  const [appointments, setAppointments] = useState([]);
  const [reports, setReports] = useState(null);
  useEffect(() => {
    Promise.all([api("/admin/appointments"), api("/admin/reports")])
      .then(([a, r]) => {
        setAppointments(a);
        setReports(r);
      })
      .catch((e) => toast.error(e.message));
  }, []);
  const complete = async (id) => {
    await api(`/admin/appointments/${id}/complete`, { method: "POST" });
    setAppointments(await api("/admin/appointments"));
    toast.success("Atendimento concluído e selo adicionado");
  };
  const dailyRevenue = (reports?.daily || []).map((item) => ({
    ...item,
    label: new Date(`${item.date}T12:00:00`).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
  }));
  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <main className="admin-layout">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">PAINEL DA EQUIPE</p>
            <h1>
              A operação <em>BarberOps.</em>
            </h1>
          </div>
          <div className="role-chip">
            <ShieldCheck size={16} />{" "}
            {user.role === "ADMIN" ? "Administrador" : "Barbeiro"}
          </div>
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>Faturamento bruto</span>
            <b data-testid="gross-revenue">{money(reports?.gross)}</b>
          </div>
          <div className="metric">
            <span>Faturamento líquido</span>
            <b>{money(reports?.net)}</b>
          </div>
          <div className="metric">
            <span>Atendimentos</span>
            <b>{reports?.appointments || 0}</b>
          </div>
          <div className="metric">
            <span>Serviços / produtos</span>
            <b>
              {money(reports?.services)} / {money(reports?.products)}
            </b>
          </div>
        </div>
        <section className="revenue-chart-panel">
          <div className="section-heading">
            <Scissors size={20} />
            <div>
              <h2>Faturamento por dia</h2>
              <p>Serviços e produtos nos atendimentos registrados.</p>
            </div>
          </div>
          {dailyRevenue.length ? (
            <div
              className="revenue-chart"
              aria-label="Gráfico de faturamento diário"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyRevenue}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted)", fontSize: 11 }}
                    tickFormatter={(value) => `R$${value}`}
                    width={54}
                  />
                  <Tooltip
                    formatter={(value) => money(value)}
                    labelFormatter={(label) => `Dia ${label}`}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      borderRadius: 3,
                      color: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="services"
                    name="Serviços"
                    fill="var(--gold)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="products"
                    name="Produtos"
                    fill="#7f8c8d"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty-note">Ainda não há faturamento registrado.</p>
          )}
          <div className="chart-legend">
            <span>
              <i className="legend-service" /> Serviços
            </span>
            <span>
              <i className="legend-product" /> Produtos
            </span>
          </div>
        </section>
        {user.role === "ADMIN" && (
          <>
            <ShopAddressManager />
            <ShopHoursManager />
            <BarberManager />
            <ServiceManager />
            <ProductManager />
            <CourtesyManager />
          </>
        )}
        <SchedulePanel />
        <section className="admin-table">
          <div className="section-heading">
            <CalendarDays size={20} />
            <div>
              <h2>Agenda da equipe</h2>
              <p>Todos os compromissos em ordem.</p>
            </div>
          </div>
          {appointments.map((a) => (
            <div
              className="appointment-row"
              data-testid={`admin-appointment-${a.id}`}
              key={a.id}
            >
              <div className="appointment-date">
                <b>
                  {new Date(`${a.appointment_date}T12:00`).toLocaleDateString(
                    "pt-BR",
                    { day: "2-digit" },
                  )}
                </b>
                <span>{a.start_time}</span>
              </div>
              <div>
                <b>{a.client_name}</b>
                <span>
                  {a.service_name} ·{" "}
                  {a.payment_method === "IN_PERSON" ? "No salão" : "PIX"}
                </span>
              </div>
              <span className={`status ${a.status.toLowerCase()}`}>
                {a.status}
              </span>
              {a.status !== "COMPLETED" && (
                <Button
                  data-testid={`complete-${a.id}`}
                  onClick={() => complete(a.id)}
                  size="sm"
                >
                  Concluir
                </Button>
              )}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

function PlatformHome({ user, onLogout }) {
  const [shops, setShops] = useState([]);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    postal_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    country: "Brasil",
  });
  const [editingShopId, setEditingShopId] = useState("");
  const [addressForm, setAddressForm] = useState({});
  const load = () =>
    api("/platform/shops")
      .then(setShops)
      .catch((e) => toast.error(e.message));
  useEffect(() => {
    load();
  }, []);
  const create = async (event) => {
    event.preventDefault();
    try {
      await api("/platform/shops", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        name: "",
        slug: "",
        admin_name: "",
        admin_email: "",
        admin_password: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        country: "Brasil",
      });
      await load();
      toast.success("Barbearia cadastrada");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const editAddress = (shop) => {
    setEditingShopId(shop.id);
    setAddressForm({
      postal_code: shop.postal_code || "",
      street: shop.street || "",
      number: shop.number || "",
      complement: shop.complement || "",
      neighborhood: shop.neighborhood || "",
      city: shop.city || "",
      state: shop.state || "",
      country: shop.country || "Brasil",
    });
  };
  const saveAddress = async (event, shopId) => {
    event.preventDefault();
    try {
      await api(`/platform/shops/${shopId}`, {
        method: "PATCH",
        body: JSON.stringify(addressForm),
      });
      setEditingShopId("");
      await load();
      toast.success("Endereço atualizado");
    } catch (e) {
      toast.error(e.message);
    }
  };
  const toggle = async (shop) => {
    try {
      await api(`/platform/shops/${shop.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !shop.is_active }),
      });
      await load();
      toast.success(
        shop.is_active ? "Barbearia desativada" : "Barbearia ativada",
      );
    } catch (e) {
      toast.error(e.message);
    }
  };
  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <main className="admin-layout">
        <div className="welcome-row">
          <div>
            <p className="eyebrow">PAINEL DA PLATAFORMA</p>
            <h1>
              Rede de <em>barbearias.</em>
            </h1>
          </div>
          <div className="role-chip">
            <ShieldCheck size={16} /> Plataforma
          </div>
        </div>
        <section className="schedule-panel platform-panel">
          <div className="section-heading">
            <MapPin size={20} />
            <div>
              <h2>Nova barbearia</h2>
              <p>Cadastre uma nova operação na plataforma.</p>
            </div>
          </div>
          <form className="platform-form" onSubmit={create}>
            <Input
              placeholder="Nome da barbearia"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="Identificador, ex.: centro-sp"
              value={form.slug}
              onChange={(e) =>
                setForm({
                  ...form,
                  slug: e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, "-"),
                })
              }
            />
            <Input
              placeholder="Nome do responsável"
              value={form.admin_name}
              onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
            />
            <Input
              type="email"
              placeholder="E-mail do responsável"
              value={form.admin_email}
              onChange={(e) =>
                setForm({ ...form, admin_email: e.target.value })
              }
            />
            <Input
              type="password"
              placeholder="Senha inicial"
              value={form.admin_password}
              onChange={(e) =>
                setForm({ ...form, admin_password: e.target.value })
              }
            />
            <div className="address-fields">
              <p className="form-subtitle">Endereço da unidade</p>
              <Input
                placeholder="CEP"
                value={form.postal_code}
                onChange={(e) =>
                  setForm({ ...form, postal_code: e.target.value })
                }
              />
              <Input
                placeholder="Logradouro / rua"
                value={form.street}
                onChange={(e) => setForm({ ...form, street: e.target.value })}
              />
              <Input
                placeholder="Número"
                value={form.number}
                onChange={(e) => setForm({ ...form, number: e.target.value })}
              />
              <Input
                placeholder="Complemento"
                value={form.complement}
                onChange={(e) =>
                  setForm({ ...form, complement: e.target.value })
                }
              />
              <Input
                placeholder="Bairro"
                value={form.neighborhood}
                onChange={(e) =>
                  setForm({ ...form, neighborhood: e.target.value })
                }
              />
              <Input
                placeholder="Cidade"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
              <Input
                placeholder="Estado / UF"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Input
                placeholder="País"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              />
            </div>
            <Button className="gold-button" type="submit">
              Cadastrar barbearia <ChevronRight size={17} />
            </Button>
          </form>
        </section>
        <section className="admin-table platform-list">
          <div className="section-heading">
            <MapPin size={20} />
            <div>
              <h2>Barbearias cadastradas</h2>
              <p>Controle a disponibilidade de cada operação.</p>
            </div>
          </div>
          {shops.map((shop) => (
            <div className="platform-shop-item" key={shop.id}>
              <div className="appointment-row">
                <div>
                  <b>{shop.name}</b>
                  <span>/{shop.slug}</span>
                  <span>
                    {[
                      shop.street,
                      shop.number,
                      shop.neighborhood,
                      shop.city,
                      shop.state,
                    ]
                      .filter(Boolean)
                      .join(", ") || "Endereço ainda não cadastrado"}
                  </span>
                </div>
                <span
                  className={`status ${shop.is_active ? "confirmed" : "cancelled"}`}
                >
                  {shop.is_active ? "ATIVA" : "INATIVA"}
                </span>
                <Button size="sm" onClick={() => editAddress(shop)}>
                  {editingShopId === shop.id ? "Fechar" : "Editar endereço"}
                </Button>
                <Button size="sm" onClick={() => toggle(shop)}>
                  {shop.is_active ? "Desativar" : "Ativar"}
                </Button>
              </div>
              {editingShopId === shop.id && (
                <form
                  className="address-edit-form"
                  onSubmit={(event) => saveAddress(event, shop.id)}
                >
                  <Input
                    placeholder="CEP"
                    value={addressForm.postal_code}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        postal_code: e.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Logradouro / rua"
                    value={addressForm.street}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, street: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Número"
                    value={addressForm.number}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, number: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Complemento"
                    value={addressForm.complement}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        complement: e.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Bairro"
                    value={addressForm.neighborhood}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        neighborhood: e.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder="Cidade"
                    value={addressForm.city}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, city: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Estado / UF"
                    value={addressForm.state}
                    onChange={(e) =>
                      setAddressForm({ ...addressForm, state: e.target.value })
                    }
                  />
                  <Input
                    placeholder="País"
                    value={addressForm.country}
                    onChange={(e) =>
                      setAddressForm({
                        ...addressForm,
                        country: e.target.value,
                      })
                    }
                  />
                  <Button className="gold-button" type="submit">
                    Salvar endereço
                  </Button>
                </form>
              )}
            </div>
          ))}
        </section>
      </main>
    </>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (
      localStorage.getItem("barberops_token") ||
      localStorage.getItem("imperial_token")
    )
      api("/auth/me")
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("barberops_token");
          localStorage.removeItem("imperial_token");
        })
        .finally(() => setChecking(false));
    else setChecking(false);
  }, []);
  const logout = () => {
    localStorage.removeItem("barberops_token");
    localStorage.removeItem("imperial_token");
    setUser(null);
  };
  if (checking)
    return <div className="loading-state">Abrindo a barbearia...</div>;
  return (
    <>
      {user ? (
        user.role === "PLATFORM_ADMIN" ? (
          <PlatformHome user={user} onLogout={logout} />
        ) : user.role === "CLIENT" ? (
          <ClientHome user={user} onLogout={logout} />
        ) : (
          <AdminHome user={user} onLogout={logout} />
        )
      ) : (
        <Auth onLogin={setUser} />
      )}
      <Toaster theme="dark" position="top-right" />
    </>
  );
}
export default function Root() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
