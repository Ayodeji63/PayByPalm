import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError } from "./api";
import { Icon } from "./icons";
import "./style.css";

type Business = { id: string; name: string };
type Session = { user: { id: string; email: string }; businesses: Business[] };
type Mode = "test" | "live";
type Payment = {
  id: string;
  reference: string;
  amount_minor: number;
  description: string | null;
  status: string;
  created_at: string;
  settled_at: string | null;
  terminal_label: string | null;
  domain: Mode;
};
type Terminal = {
  id: string;
  label: string;
  last_seen_at: string | null;
  disabled_at: string | null;
};
type Daily = { date: string; amountMinor: number; count: number };
type Overview = {
  paymentMode: Mode;
  summary: {
    paidAmountMinor: number;
    paidCount: number;
    pendingCount: number;
    failedCount: number;
    totalCount: number;
    daily: Daily[];
  };
  recent: Payment[];
};
type Settings = {
  paymentMode: Mode;
  business: Business & {
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  payoutConfigured: boolean;
  payout: {
    bank_name: string;
    account_last4: string;
    account_name: string;
    percentage_charge: number;
    provider_verified: boolean | null;
    provider_active: boolean | null;
  } | null;
};
type Settlement = {
  id: number;
  status: string;
  amountMinor: number;
  feesMinor: number;
  processedAmountMinor: number;
  effectiveAmountMinor: number;
  settlementDate: string;
};
type Report = {
  paymentMode: Mode;
  transactions?: Payment[];
  terminals?: Terminal[];
  settlements?: Settlement[];
  page: number;
  hasMore: boolean;
  configured?: boolean;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(value / 100);
const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Lagos",
      }).format(new Date(value))
    : "Not recorded";
const day = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value + "T12:00:00Z"));
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const range = (days: number) => ({
  from: new Date(Date.parse(today()) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10),
  to: today(),
});
const nav = [
  ["overview", "Overview", "activity"],
  ["payments", "Payments", "merchants"],
  ["settlements", "Settlements", "download"],
  ["terminals", "Terminals", "terminals"],
  ["business", "Business settings", "shield"],
];
const route = () => window.location.hash.replace(/^#\/?/, "") || "overview";
function Notice({
  children,
  danger = false,
}: {
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={"notice" + (danger ? " danger" : "")}
      role={danger ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
function Badge({ status }: { status: string }) {
  const label: Record<string, string> = {
    settled: "Paid",
    success: "Paid out",
    processing: "Processing",
    pending: "Pending",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return (
    <span
      className={
        "badge " +
        (["settled", "success"].includes(status)
          ? "green"
          : status === "failed"
            ? "red"
            : status === "processing" || status === "pending"
              ? "amber"
              : "neutral")
      }
    >
      {label[status] || status}
    </span>
  );
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name="activity" size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Login({
  onLogin,
  initialError = "",
}: {
  onLogin: (session: Session) => void;
  initialError?: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  const locked = useRef(false);
  async function submit() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      onLogin(await api<Session>("/auth/login", { email, password }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <main className="login-layout">
      <section className="login-story">
        <a className="brand" href="https://www.paybypalm.app">
          <Icon name="palm" size={31} />
          PayByPalm
        </a>
        <div>
          <h1>
            Your business.
            <br />
            Every payment,
            <br />
            accounted for.
          </h1>
          <p>
            A dedicated workspace for your palm payments, bank settlements and
            terminals.
          </p>
          <div className="login-features">
            <span>
              <Icon name="check" /> Business-only reports
            </span>
            <span>
              <Icon name="check" /> Clear settlement status
            </span>
            <span>
              <Icon name="check" /> Records you can export
            </span>
          </div>
        </div>
        <span className="login-footer">PayByPalm for merchants</span>
      </section>
      <section className="login-form">
        <div className="login-form-inner">
          <div className="workspace-mark">
            <Icon name="merchants" size={24} />
          </div>
          <h2>Welcome to your workspace</h2>
          <p>
            Sign in with the verified account your administrator granted
            merchant access.
          </p>
          {error && <Notice danger>{error}</Notice>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                maxLength={254}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <button className="button" disabled={busy} type="submit">
              {busy ? "Signing in…" : "Sign in to merchant workspace"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <div className="login-help">
            <Icon name="shield" size={20} />
            <p>
              Need access? Ask your PayByPalm administrator to link your
              verified account to your business.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
function SalesChart({ daily }: { daily: Daily[] }) {
  const [index, setIndex] = useState<number | null>(null),
    max = Math.max(1, ...daily.map((d) => d.amountMinor));
  const width = 680,
    height = 155;
  const points = daily.map((d, i) => [
    daily.length === 1 ? width / 2 : (i / (daily.length - 1)) * width,
    height - (d.amountMinor / max) * (height - 10),
  ]);
  const line = points
    .map(([x, y], i) => (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1))
    .join(" ");
  const active = index === null ? null : daily[index];
  return (
    <div className="sales-chart">
      <div className="chart-caption">
        <span>{active ? day(active.date) : "Daily successful payments"}</span>
        <strong>{active ? money(active.amountMinor) : "NGN"}</strong>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 5}`}
        role="img"
        aria-label="Successful payment amounts by day"
        onMouseLeave={() => setIndex(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setIndex(
            Math.max(
              0,
              Math.min(
                daily.length - 1,
                Math.round(
                  ((e.clientX - r.left) / r.width) * (daily.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        <path
          d={`M0 ${height}H${width}M0 ${height / 2}H${width}`}
          stroke="var(--line)"
          fill="none"
        />
        {points.length > 0 && (
          <>
            <path
              d={`${line} L${points.at(-1)![0]} ${height} L${points[0][0]} ${height} Z`}
              fill="var(--blue-soft)"
            />
            <path
              d={line}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {index !== null && points[index] && (
              <circle
                cx={points[index][0]}
                cy={points[index][1]}
                r="4"
                fill="var(--blue)"
              />
            )}
          </>
        )}
      </svg>
      <div className="chart-dates">
        <span>{daily[0] ? day(daily[0].date) : ""}</span>
        <span>{daily.length ? day(daily.at(-1)!.date) : ""}</span>
      </div>
      <details className="chart-values">
        <summary>View daily values</summary>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Paid payments</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.date}>
                <td>{day(d.date)}</td>
                <td>{d.count}</td>
                <td>{money(d.amountMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
function PaymentsTable({
  payments,
  onOpen,
}: {
  payments: Payment[];
  onOpen: (p: Payment) => void;
}) {
  if (!payments.length)
    return (
      <Empty title="No payments in this period">
        Completed and attempted card charges will appear here. Try a different
        date range.
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Payment</th>
            <th>Terminal</th>
            <th>Status</th>
            <th className="amount">Amount</th>
            <th>
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>
                <strong title={p.reference}>
                  {p.reference.length > 16
                    ? "…" + p.reference.slice(-16)
                    : p.reference}
                </strong>
                <small>{time(p.created_at)}</small>
              </td>
              <td>{p.terminal_label || "Terminal unavailable"}</td>
              <td>
                <Badge status={p.status} />
              </td>
              <td className="amount">
                <strong>{money(p.amount_minor)}</strong>
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"View payment " + p.reference}
                  onClick={() => onOpen(p)}
                >
                  <Icon name="chevron" size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function PaymentDetail({
  payment,
  business,
  onClose,
}: {
  payment: Payment;
  business: Business;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="payment-details-title"
      onClose={onClose}
      className="payment-dialog"
    >
      <div className="panel-head">
        <h2 id="payment-details-title">Payment details</h2>
        <button
          className="icon-button"
          aria-label="Close payment details"
          onClick={() => ref.current?.close()}
        >
          <Icon name="close" />
        </button>
      </div>
      <p className="detail-amount">{money(payment.amount_minor)}</p>
      <Badge status={payment.status} />
      <dl>
        <dt>Business</dt>
        <dd>{business.name}</dd>
        <dt>Reference</dt>
        <dd className="reference">{payment.reference}</dd>
        <dt>Terminal</dt>
        <dd>{payment.terminal_label || "Unavailable"}</dd>
        <dt>Created</dt>
        <dd>{time(payment.created_at)}</dd>
        <dt>Payment completed</dt>
        <dd>{time(payment.settled_at)}</dd>
        <dt>Description</dt>
        <dd>{payment.description || "No description"}</dd>
        <dt>Environment</dt>
        <dd>{payment.domain === "live" ? "Live payments" : "Test payments"}</dd>
      </dl>
      <p className="muted">
        A paid card payment is separate from the bank settlement. Check
        Settlements for the payout status.
      </p>
      <button className="button secondary" onClick={() => ref.current?.close()}>
        Close details
      </button>
    </dialog>
  );
}
function Workspace({
  session,
  onLogout,
}: {
  session: Session;
  onLogout: () => void;
}) {
  const [section, setSection] = useState(route),
    [businessId, setBusinessId] = useState(session.businesses[0]?.id || ""),
    [period, setPeriod] = useState(range(30)),
    [draft, setDraft] = useState(range(30)),
    [status, setStatus] = useState("all"),
    [reference, setReference] = useState(""),
    [referenceInput, setReferenceInput] = useState(""),
    [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode | null>(null),
    [data, setData] = useState<Overview | Report | Settings | null>(null),
    [settings, setSettings] = useState<Settings | null>(null),
    [terminalPreview, setTerminalPreview] = useState<Terminal[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [updated, setUpdated] = useState<string | null>(null),
    [selected, setSelected] = useState<Payment | null>(null);
  const sequence = useRef(0),
    latestMode = useRef<Mode | null>(null),
    live = useRef(true);
  const exportScope = useRef("");
  exportScope.current = [
    businessId,
    period.from,
    period.to,
    status,
    reference,
  ].join("|");
  const business = session.businesses.find((b) => b.id === businessId)!;
  useEffect(() => {
    const change = () => {
      setSection(route());
      setPage(1);
      setSelected(null);
      setData(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(
    () => () => {
      live.current = false;
      ++sequence.current;
    },
    [],
  );
  const params = useCallback(
    (nextPage = page) =>
      new URLSearchParams({
        merchantId: businessId,
        from: period.from,
        to: period.to,
        page: String(nextPage),
        ...(section === "payments" ? { status, reference } : {}),
      }),
    [businessId, period, page, section, status, reference],
  );
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setBusy(true);
    setError("");
    const resource =
      section === "payments"
        ? "transactions"
        : section === "business"
          ? "settings"
          : nav.some((n) => n[0] === section)
            ? section
            : "overview";
    try {
      const result = await api<any>("/reports/" + resource + "?" + params());
      if (!live.current || request !== sequence.current) return;
      if (result.paymentMode !== "test" && result.paymentMode !== "live")
        throw Error(
          "The payment mode could not be verified. Reload the workspace.",
        );
      if (latestMode.current && latestMode.current !== result.paymentMode) {
        setSelected(null);
        setSettings(null);
        setTerminalPreview([]);
      }
      latestMode.current = result.paymentMode;
      setMode(result.paymentMode);
      setData(result);
      setUpdated(new Date().toISOString());
      if (resource === "overview") {
        setSettings(result.settings ?? null);
        setTerminalPreview(result.terminals ?? []);
      }
    } catch (e) {
      if (live.current && request === sequence.current) {
        setData(null);
        setSettings(null);
        setTerminalPreview([]);
        setError((e as Error).message);
      }
    } finally {
      if (live.current && request === sequence.current) setBusy(false);
    }
  }, [params, section]);
  useEffect(() => {
    setData(null);
    setSelected(null);
    setSettings(null);
    setTerminalPreview([]);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 30000);
    return () => {
      window.removeEventListener("focus", focus);
      window.clearInterval(timer);
    };
  }, [refresh]);
  async function exportPayments() {
    if (exporting || !mode) return;
    setExporting(true);
    setError("");
    const requestScope = exportScope.current;
    try {
      const q = params(1);
      q.set("paymentMode", mode);
      const response = await fetch("/api/reports/export?" + q, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error?.message ||
            "The export could not be completed. Please retry.",
        );
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv"))
        throw Error("The export could not be verified.");
      const blob = await response.blob();
      if (
        !live.current ||
        requestScope !== exportScope.current ||
        latestMode.current !== mode
      )
        return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `paybypalm-payments-${period.from}-${period.to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setExporting(false);
    }
  }
  function chooseRange(days: number) {
    const next = range(days);
    setDraft(next);
    setPeriod(next);
    setPage(1);
  }
  const overview = section === "overview" ? (data as Overview | null) : null,
    report = data as Report | null,
    configuration =
      section === "business" ? (data as Settings | null) : settings;
  const title = nav.find((n) => n[0] === section)?.[1] || "Overview";
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#/overview" className="brand">
          <Icon name="palm" size={29} />
          PayByPalm
        </a>
        <span className="workspace-label">Merchant workspace</span>
        <label className="business-switch">
          <span>Your business</span>
          <select
            aria-label="Your business"
            value={businessId}
            onChange={(e) => {
              ++sequence.current;
              setData(null);
              setSelected(null);
              setBusinessId(e.target.value);
              setPage(1);
            }}
          >
            {session.businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <nav aria-label="Merchant navigation">
          {nav.map(([key, label, icon]) => (
            <a
              href={"#/" + key}
              key={key}
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon name={icon} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="shield" size={21} />
          <strong>Built around your business</strong>
          <p>Only the businesses linked to your account are available here.</p>
        </div>
        <div className="account">
          <span className="avatar">{session.user.email[0].toUpperCase()}</span>
          <div>
            <strong>Merchant account</strong>
            <small title={session.user.email}>{session.user.email}</small>
          </div>
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={onLogout}
          >
            <Icon name="logout" size={19} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {business?.name || "Merchant workspace"}{" "}
            <span className="topbar-divider">/</span> {title}
          </span>
          <div className="topbar-status">
            {mode && (
              <span className={"mode " + mode}>
                <span />
                {mode === "live" ? "Live payments" : "Test payments"}
              </span>
            )}
            <button
              className="icon-button mobile-logout"
              aria-label="Sign out"
              onClick={onLogout}
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main id="content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>{title === "Overview" ? business?.name : title}</h1>
              <p>
                {section === "overview"
                  ? "A clear view of your business, from payment to payout."
                  : section === "payments"
                    ? "Your card payment records, with the detail behind every sale."
                    : section === "settlements"
                      ? "Bank payouts reported by Paystack for this business."
                      : section === "terminals"
                        ? "Your counters and their most recent connection."
                        : "Business details and your configured payout destination."}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void refresh()}
              >
                <Icon name="refresh" size={17} />
                {busy ? "Refreshing…" : "Refresh"}
              </button>
              {["overview", "payments"].includes(section) && (
                <button
                  className="button"
                  disabled={!data || busy || exporting}
                  onClick={() => void exportPayments()}
                >
                  <Icon name="download" size={17} />
                  {exporting ? "Exporting…" : "Export payments"}
                </button>
              )}
            </div>
          </div>
          {mode === "test" && (
            <Notice>
              Test payments · These records are simulated and do not represent
              real money.
            </Notice>
          )}
          {session.user.email.endsWith("@example.test") && (
            <Notice>
              Demonstration data · Automated browser test fixtures.
            </Notice>
          )}
          {["overview", "payments", "settlements"].includes(section) && (
            <div className="filter-bar">
              <div className="quick-range">
                <button
                  onClick={() => chooseRange(7)}
                  className={period.from === range(7).from ? "selected" : ""}
                >
                  7 days
                </button>
                <button
                  onClick={() => chooseRange(30)}
                  className={period.from === range(30).from ? "selected" : ""}
                >
                  30 days
                </button>
              </div>
              <form
                className="date-filter"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPeriod({ ...draft });
                  setPage(1);
                }}
              >
                <label>
                  From
                  <input
                    aria-label="From date"
                    type="date"
                    value={draft.from}
                    onChange={(e) =>
                      setDraft({ ...draft, from: e.target.value })
                    }
                    required
                  />
                </label>
                <span className="date-arrow">—</span>
                <label>
                  To
                  <input
                    aria-label="To date"
                    type="date"
                    value={draft.to}
                    min={draft.from}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                    required
                  />
                </label>
                <button className="button secondary small" type="submit">
                  Apply dates
                </button>
              </form>
            </div>
          )}
          {error && (
            <Notice danger>
              {error}{" "}
              <button className="text-button" onClick={() => void refresh()}>
                Try again
              </button>
            </Notice>
          )}
          {busy && !data && (
            <div className="loading" role="status">
              <span className="spinner" />
              Loading your business records…
            </div>
          )}
          {overview && (
            <>
              <section className="summary-strip" aria-label="Payment summary">
                <div>
                  <span>Payments received</span>
                  <strong>{money(overview.summary.paidAmountMinor)}</strong>
                  <small>Successful card charges in this period</small>
                </div>
                <div>
                  <span>Successful payments</span>
                  <strong>{overview.summary.paidCount.toLocaleString()}</strong>
                  <small>Verified as paid</small>
                </div>
                <div>
                  <span>Processing</span>
                  <strong>{overview.summary.pendingCount}</strong>
                  <small>Outcome being checked</small>
                </div>
                <div>
                  <span>Failed payments</span>
                  <strong>{overview.summary.failedCount}</strong>
                  <small>Not counted as received</small>
                </div>
              </section>
              <div className="overview-grid">
                <div className="overview-main">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Payment activity</h2>
                      <span>
                        {overview.summary.totalCount} payment attempts
                      </span>
                    </div>
                    <SalesChart daily={overview.summary.daily} />
                  </section>
                  <section className="panel payment-panel">
                    <div className="panel-head">
                      <h2>Recent payments</h2>
                      <a href="#/payments">
                        View all payments <Icon name="arrow" size={15} />
                      </a>
                    </div>
                    <PaymentsTable
                      payments={overview.recent}
                      onOpen={setSelected}
                    />
                  </section>
                </div>
                <aside className="overview-rail">
                  <section className="payout-summary">
                    <div className="payout-heading">
                      <Icon name="merchants" size={22} />
                      <h2>Your bank payouts</h2>
                    </div>
                    <p>
                      Your bank
                      <br />
                      settlement details.
                    </p>
                    {settings ? (
                      <>
                        <span
                          className={
                            "badge " +
                            (settings.payoutConfigured ? "green" : "amber")
                          }
                        >
                          {settings.payoutConfigured
                            ? "Payout account configured"
                            : "Setup needed"}
                        </span>
                        <h3>
                          {settings.payout?.bank_name ||
                            "Bank details unavailable"}
                        </h3>
                        {settings.payout && (
                          <div className="bank-ending">
                            Account ending{" "}
                            <strong>{settings.payout.account_last4}</strong>
                          </div>
                        )}
                        <a href="#/settlements" className="button secondary">
                          View settlements
                          <Icon name="arrow" size={16} />
                        </a>
                      </>
                    ) : (
                      <p className="rail-note">
                        Payout settings could not be loaded. Open Business
                        settings to check setup.
                      </p>
                    )}
                    <small>
                      Card payments and bank settlements have separate statuses.
                    </small>
                  </section>
                  <section className="panel terminal-preview">
                    <div className="panel-head">
                      <h2>Terminal activity</h2>
                      <a href="#/terminals" aria-label="View all terminals">
                        <Icon name="arrow" size={17} />
                      </a>
                    </div>
                    {terminalPreview.length ? (
                      terminalPreview.slice(0, 4).map((t) => (
                        <div className="terminal-line" key={t.id}>
                          <span className="terminal-icon">
                            <Icon name="terminals" size={18} />
                          </span>
                          <div>
                            <strong>{t.label}</strong>
                            <small>
                              {t.disabled_at
                                ? "Disabled"
                                : t.last_seen_at
                                  ? "Last contact " + time(t.last_seen_at)
                                  : "Not connected yet"}
                            </small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">
                        No terminal activity to show. Open Terminals for
                        details.
                      </p>
                    )}
                  </section>
                </aside>
              </div>
            </>
          )}
          {section === "payments" && (
            <section className="panel payment-panel">
              <div className="panel-head payments-filters">
                <h2>Payments</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setReference(referenceInput);
                    setPage(1);
                  }}
                >
                  <label className="inline-field">
                    Status
                    <select
                      aria-label="Payment status"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">All statuses</option>
                      <option value="settled">Paid</option>
                      <option value="processing">Processing</option>
                      <option value="failed">Failed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label className="inline-field">
                    Reference
                    <input
                      aria-label="Payment reference"
                      value={referenceInput}
                      onChange={(e) => setReferenceInput(e.target.value)}
                      placeholder="Exact payment reference"
                      maxLength={100}
                    />
                  </label>
                  <button className="button secondary small" type="submit">
                    Find payment
                  </button>
                </form>
              </div>
              {report?.transactions && (
                <PaymentsTable
                  payments={report.transactions}
                  onOpen={setSelected}
                />
              )}
            </section>
          )}
          {section === "settlements" && report?.settlements && (
            <section className="panel payment-panel">
              <div className="panel-head">
                <h2>Bank settlements</h2>
                <span>Source: Paystack</span>
              </div>
              {!report.configured ? (
                <Empty title="Payout setup is needed">
                  Ask your administrator to configure this business’s {mode}{" "}
                  payout account.
                </Empty>
              ) : !report.settlements.length ? (
                <Empty title="No settlements in this period">
                  A successful payment can appear before its bank settlement.
                  Try a different date range or check again later.
                </Empty>
              ) : (
                <>
                  <Notice>
                    A “Paid out” status is reported by Paystack. Your bank may
                    take additional time to post the funds. Payout amount uses
                    Paystack’s reported effective amount.
                  </Notice>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Settlement</th>
                          <th>Status</th>
                          <th className="amount">Processed</th>
                          <th className="amount">Fees</th>
                          <th className="amount">Payout amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.settlements.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <strong>#{s.id}</strong>
                              <small>{time(s.settlementDate)}</small>
                            </td>
                            <td>
                              <Badge status={s.status} />
                            </td>
                            <td className="amount">
                              {money(s.processedAmountMinor)}
                            </td>
                            <td className="amount">{money(s.feesMinor)}</td>
                            <td className="amount">
                              <strong>{money(s.effectiveAmountMinor)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
          {section === "terminals" && report?.terminals && (
            <section className="panel payment-panel">
              <div className="panel-head">
                <h2>Business terminals</h2>
                <span>
                  Device configuration is managed by your administrator
                </span>
              </div>
              {!report.terminals.length ? (
                <Empty title="No terminals linked">
                  Ask your administrator to link a terminal to this business.
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Terminal</th>
                        <th>Access</th>
                        <th>Last contact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.terminals.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.label}</strong>
                            <small>{t.id.slice(0, 8)}</small>
                          </td>
                          <td>
                            <Badge
                              status={t.disabled_at ? "Disabled" : "Enabled"}
                            />
                          </td>
                          <td>{time(t.last_seen_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {section === "business" && configuration && (
            <div className="settings-grid">
              <section className="panel">
                <h2>Business details</h2>
                <dl>
                  <dt>Business name</dt>
                  <dd>{configuration.business.name}</dd>
                  <dt>Contact email</dt>
                  <dd>{configuration.business.email || "Not provided"}</dd>
                  <dt>Contact phone</dt>
                  <dd>{configuration.business.phone || "Not provided"}</dd>
                  <dt>Address</dt>
                  <dd>{configuration.business.address || "Not provided"}</dd>
                </dl>
                <p className="muted">
                  Contact your administrator to update these details or manage
                  portal access.
                </p>
              </section>
              <section className="panel">
                <h2>Payout account</h2>
                {configuration.payout ? (
                  <>
                    <dl>
                      <dt>Bank</dt>
                      <dd>{configuration.payout.bank_name}</dd>
                      <dt>Account name</dt>
                      <dd>{configuration.payout.account_name}</dd>
                      <dt>Account number</dt>
                      <dd>Ending {configuration.payout.account_last4}</dd>
                      <dt>PayByPalm share</dt>
                      <dd>{configuration.payout.percentage_charge}%</dd>
                      <dt>Paystack verification</dt>
                      <dd>
                        {configuration.payout.provider_verified
                          ? "Verified"
                          : "Pending or not checked"}
                      </dd>
                      <dt>Paystack access</dt>
                      <dd>
                        {configuration.payout.provider_active === true
                          ? "Active"
                          : configuration.payout.provider_active === false
                            ? "Inactive"
                            : "Not checked"}
                      </dd>
                    </dl>
                  </>
                ) : (
                  <Empty title="Payout details unavailable">
                    Ask your administrator to complete or review the {mode} bank
                    setup.
                  </Empty>
                )}
                <p className="muted">
                  Bank destination changes are managed through your
                  administrator.
                </p>
              </section>
            </div>
          )}
          {["payments", "settlements", "terminals"].includes(section) &&
            data && (
              <div className="pagination">
                <span>Page {page}</span>
                <div>
                  <button
                    className="button secondary small"
                    disabled={busy || page === 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy || !report?.hasMore}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          <footer className="page-footer">
            <span>PayByPalm Merchant workspace</span>
            <span>
              {updated
                ? "Updated " + time(updated)
                : "Records refresh when connected"}{" "}
              · Africa/Lagos
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <PaymentDetail
          payment={selected}
          business={business}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setSession(await api<Session>("/auth/session"));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setError((e as Error).message);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const expire = () => {
      setSession(null);
      setReady(true);
    };
    window.addEventListener("merchant-session-expired", expire);
    return () => window.removeEventListener("merchant-session-expired", expire);
  }, [load]);
  async function logout() {
    try {
      await api("/auth/logout", {});
      setSession(null);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!ready)
    return (
      <main className="boot" role="status">
        <Icon name="palm" size={38} />
        <p>Opening your merchant workspace…</p>
      </main>
    );
  return session ? (
    <>
      {error && <Notice danger>{error}</Notice>}
      <Workspace session={session} onLogout={() => void logout()} />
    </>
  ) : (
    <Login key={error} initialError={error} onLogin={setSession} />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
