import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError, configuration, deviceCredential } from "./api";
import { Icon } from "./icons";
import type { Merchant, Overview, Provision, Terminal, User } from "./types";
import "./style.css";
import {PayoutSetup} from "./PayoutSetup";
import {MerchantAccess} from "./MerchantAccess";

const go = (path: string) => {
  window.location.hash = path;
  window.scrollTo(0, 0);
};
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos",
      }).format(new Date(v))
    : "Not seen yet";
const short = (id: string) => id.slice(0, 8);
function ErrorNotice({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="notice danger">
      <Icon name="shield" />
      <span>{error}</span>
    </div>
  ) : null;
}
function Button({
  children,
  icon,
  onClick,
  type = "button",
  disabled = false,
  secondary = false,
  danger = false,
}: {
  children: ReactNode;
  icon?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "destructive" : ""}`}
    >
      {icon && <Icon name={icon} size={18} />} {children}
    </button>
  );
}
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">
        <Icon name="merchants" size={30} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Seen({ terminal }: { terminal: Terminal }) {
  if (terminal.disabled_at) return <Badge tone="red">Disabled</Badge>;
  return (
    <Badge
      tone={
        terminal.last_seen_at &&
        Date.now() - Date.parse(terminal.last_seen_at) < 300000
          ? "green"
          : "neutral"
      }
    >
      {terminal.last_seen_at ? "Last contact recorded" : "Not seen yet"}
    </Badge>
  );
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ user: User }>("/auth/login", { email, password });
      setPassword("");
      onLogin(r.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-layout">
      <div className="login-story">
        <a className="brand" href="#/merchants">
          <span className="brand-mark">
            <Icon name="palm" size={27} />
          </span>
          PayByPalm<span className="brand-tag">Admin</span>
        </a>
        <div>
          <h1>
            Every merchant.
            <br />
            Every terminal.
            <br />
            One place.
          </h1>
          <p>
            Onboard businesses, connect their devices and keep palm payments
            moving.
          </p>
          <div className="login-capability">
            <Icon name="merchants" /> Merchant onboarding
          </div>
          <div className="login-capability">
            <Icon name="terminals" /> Terminal provisioning
          </div>
          <div className="login-capability">
            <Icon name="shield" /> Controlled administrator access
          </div>
        </div>
        <small>PayByPalm administration</small>
      </div>
      <section className="login-panel">
        <div className="login-form">
          <span className="login-icon">
            <Icon name="shield" size={26} />
          </span>
          <h2>Welcome back</h2>
          <p>Sign in with your verified PayByPalm administrator account.</p>
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            <fieldset disabled={busy}>
              <Field label="Email address">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                  placeholder="you@company.com"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Button type="submit" disabled={busy} icon="arrow">
                {busy ? "Signing in…" : "Sign in to admin"}
              </Button>
            </fieldset>
          </form>
          <p className="login-note">
            Access is restricted to accounts approved by the PayByPalm operator.
          </p>
        </div>
        <small>
          Customer accounts and terminal devices are managed separately.
        </small>
      </section>
    </main>
  );
}

function MerchantForm({
  merchant,
  onSaved,
  onCancel,
}: {
  merchant?: Merchant;
  onSaved: (merchant: Merchant) => void;
  onCancel: () => void;
}) {
  const [id] = useState(() => merchant?.id || crypto.randomUUID());
  const [fields, setFields] = useState({
    name: merchant?.name || "",
    email: merchant?.contact_email || "",
    phone: merchant?.contact_phone || "",
    address: merchant?.address || "",
    subaccount: merchant?.paystack_subaccount || "",
  });
  const [expected, setExpected] = useState(merchant?.updated_at || null);
  const stale = !!merchant && merchant.updated_at !== expected;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update =
    (name: keyof typeof fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setFields({ ...fields, [name]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || stale) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ merchant: Merchant }>("/merchants", {
        id,
        ...fields,
        expected,
      });
      setExpected(r.merchant.updated_at);
      onSaved(r.merchant);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-workspace">
      <div className="form-main">
        <div className="panel form-panel">
          <h2>Business details</h2>
          <p>
            The business name appears on its terminals and payment receipts.
          </p>
          <ErrorNotice error={error} />
          {stale && (
            <div className="notice" role="status">
              <span>
                This merchant changed since you started editing. Load the latest
                details before saving; this replaces your unsaved draft.
              </span>
              <Button
                secondary
                onClick={() => {
                  setFields({
                    name: merchant!.name,
                    email: merchant!.contact_email || "",
                    phone: merchant!.contact_phone || "",
                    address: merchant!.address || "",
                    subaccount: merchant!.paystack_subaccount || "",
                  });
                  setExpected(merchant!.updated_at);
                  setError("");
                }}
              >
                Load latest details
              </Button>
            </div>
          )}
          <form onSubmit={save}>
            <fieldset disabled={busy}>
              <Field label="Business name">
                <input
                  autoFocus
                  value={fields.name}
                  onChange={update("name")}
                  required
                  maxLength={120}
                  placeholder="e.g. Ayo Stores"
                />
              </Field>
              <div className="form-grid">
                <Field label="Contact email (optional)">
                  <input
                    type="email"
                    value={fields.email}
                    onChange={update("email")}
                    maxLength={254}
                    placeholder="operations@business.com"
                  />
                </Field>
                <Field label="Contact phone (optional)">
                  <input
                    type="tel"
                    value={fields.phone}
                    onChange={update("phone")}
                    maxLength={40}
                    placeholder="+234…"
                  />
                </Field>
              </div>
              <Field label="Business address (optional)">
                <textarea
                  value={fields.address}
                  onChange={update("address")}
                  maxLength={300}
                  rows={3}
                  placeholder="Street, city and state"
                />
              </Field>
              <hr />
              <h3>Settlement</h3>
              <Field
                label="Paystack subaccount code (optional)"
                hint="An existing live ACCT_ code can be saved here. To create one automatically, save the merchant and use Bank payouts below."
              >
                <input
                  value={fields.subaccount}
                  onChange={update("subaccount")}
                  pattern="ACCT_[A-Za-z0-9]{1,80}"
                  placeholder="ACCT_…"
                />
              </Field>
              <div className="notice">
                <Icon name="shield" />
                <span>
                  Save the business, then verify its bank account in Bank payouts.
                  A live subaccount is required before real card payments.
                </span>
              </div>
              <div className="form-actions">
                <Button secondary onClick={onCancel} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || stale} icon="check">
                  {busy
                    ? "Saving…"
                    : merchant
                      ? "Save changes"
                      : "Create merchant"}
                </Button>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
      <aside className="context-panel">
        <h3>A merchant comes first</h3>
        <p>
          Each terminal belongs to one merchant. Create the business, then add
          the device for its counter.
        </p>
        <ol className="steps">
          <li className="current">Save merchant details</li>
          <li>Verify the bank and create its payout account</li>
          <li>Add a terminal and label</li>
          <li>Install its configuration on the Pi</li>
        </ol>
        <p className="muted">
          Creating a merchant does not enroll a customer palm or charge a card.
        </p>
      </aside>
    </div>
  );
}

function TerminalForm({
  merchants,
  initialMerchant,
  onSaved,
  onProvision,
  onCancel,
  url,
}: {
  merchants: Merchant[];
  initialMerchant?: string;
  onSaved: (t: Terminal) => void;
  onProvision: (p: Provision) => void;
  onCancel: () => void;
  url: string;
}) {
  const [id] = useState(() => crypto.randomUUID()),
    [merchantId, setMerchant] = useState(
      initialMerchant || merchants[0]?.id || "",
    ),
    [label, setLabel] = useState(""),
    [mode, setMode] = useState("generate"),
    [hash, setHash] = useState("");
  const secret = useRef<{ key: string; hash: string } | null>(null),
    inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "generate" && !secret.current)
        secret.current = await deviceCredential();
      const r = await api<{ terminal: Terminal }>("/terminals", {
        id,
        merchantId,
        label,
        keyHash: mode === "generate" ? secret.current!.hash : hash,
      });
      if (mode === "generate") {
        onProvision({ terminal: r.terminal, key: secret.current!.key, url });
        secret.current = null;
      } else onSaved(r.terminal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (!merchants.length)
    return (
      <Empty
        title="Create a merchant first"
        action={
          <Button onClick={() => go("/merchants/new")} icon="plus">
            Create merchant
          </Button>
        }
      >
        A terminal needs a merchant before it can accept sales.
      </Empty>
    );
  return (
    <div className="form-workspace">
      <div className="panel form-panel">
        <h2>Connect a terminal</h2>
        <p>
          Bind a device to its merchant and give the counter a recognizable
          label.
        </p>
        <ErrorNotice error={error} />
        <form onSubmit={submit}>
          <fieldset disabled={busy}>
            <Field
              label="Merchant"
              hint="The merchant assignment is fixed after creation. Register a new terminal to use a different merchant."
            >
              <select
                value={merchantId}
                onChange={(e) => setMerchant(e.target.value)}
                required
              >
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Terminal label">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder="e.g. Ayo Stores — Counter 1"
                required
              />
            </Field>
            <h3>Device credential</h3>
            <div className="choice-list">
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "generate"}
                  onChange={() => setMode("generate")}
                />
                <span>
                  <strong>Generate a new configuration</strong>
                  <small>
                    Download a private terminal.env file to install on the Pi.
                  </small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "existing"}
                  onChange={() => setMode("existing")}
                />
                <span>
                  <strong>Register a key already on the Pi</strong>
                  <small>
                    Paste the SHA-256 key hash printed by the provisioning
                    script.
                  </small>
                </span>
              </label>
            </div>
            {mode === "existing" && (
              <Field
                label="SHA-256 key hash"
                hint="Exactly 64 lowercase hexadecimal characters. Paste the hash, never the device key."
              >
                <input
                  value={hash}
                  onChange={(e) => setHash(e.target.value.trim())}
                  required
                  pattern="[0-9a-f]{64}"
                  maxLength={64}
                  spellCheck={false}
                />
              </Field>
            )}
            <div className="form-actions">
              <Button secondary onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" icon="key" disabled={busy}>
                {busy ? "Registering…" : "Register terminal"}
              </Button>
            </div>
          </fieldset>
        </form>
      </div>
      <aside className="context-panel">
        <h3>One device, one key</h3>
        <p>
          The database stores a key hash. A generated key stays in this browser
          until you download its file.
        </p>
        <ol className="steps">
          <li className="current">Register the terminal</li>
          <li>Download the private configuration</li>
          <li>Install it on the correct Pi</li>
          <li>Start the kiosk manually for a test</li>
        </ol>
        <div className="small-block">
          <strong>Kiosk address</strong>
          <p className="break">{url}</p>
        </div>
      </aside>
    </div>
  );
}

function TerminalDetail({
  terminal,
  merchant,
  url,
  onSaved,
  onProvision,
}: {
  terminal: Terminal;
  merchant?: Merchant;
  url: string;
  onSaved: (t: Terminal) => void;
  onProvision: (p: Provision) => void;
}) {
  const [label, setLabel] = useState(terminal.label),
    [confirm, setConfirm] = useState<"rotate" | "disable" | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [expected, setExpected] = useState(terminal.updated_at);
  const stale = terminal.updated_at !== expected;
  const pending = useRef<{ key: string; hash: string } | null>(null),
    inFlight = useRef(false);
  async function change(action: "label" | "rotate" | "disable", e?: FormEvent) {
    e?.preventDefault();
    if (inFlight.current || stale) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "rotate" && !pending.current)
        pending.current = await deviceCredential();
      const r = await api<{ terminal: Terminal }>("/terminals/" + terminal.id, {
        action,
        expected,
        ...(action === "label"
          ? { label }
          : action === "rotate"
            ? { keyHash: pending.current!.hash }
            : {}),
      });
      setExpected(r.terminal.updated_at);
      setLabel(r.terminal.label);
      if (action === "rotate") {
        onProvision({ terminal: r.terminal, key: pending.current!.key, url });
        pending.current = null;
      } else {
        onSaved(r.terminal);
        setConfirm(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="form-workspace">
      <div className="detail-stack">
        <div className="panel form-panel">
          <div className="panel-heading">
            <h2>Terminal configuration</h2>
            <Seen terminal={terminal} />
          </div>
          <ErrorNotice error={error} />
          {stale && (
            <div className="notice" role="status">
              <span>
                This terminal changed since you opened it. Load the latest
                configuration before making changes; this replaces your unsaved
                label.
              </span>
              <Button
                secondary
                onClick={() => {
                  setLabel(terminal.label);
                  setExpected(terminal.updated_at);
                  setConfirm(null);
                  pending.current = null;
                  setError("");
                }}
              >
                Load latest configuration
              </Button>
            </div>
          )}
          <dl className="details-list">
            <div>
              <dt>Merchant</dt>
              <dd>{merchant?.name || "Unknown merchant"}</dd>
            </div>
            <div>
              <dt>Terminal ID</dt>
              <dd className="identifier">{terminal.id}</dd>
            </div>
            <div>
              <dt>Last contact · Lagos time</dt>
              <dd>{date(terminal.last_seen_at)}</dd>
            </div>
            <div>
              <dt>Created · Lagos time</dt>
              <dd>{date(terminal.created_at)}</dd>
            </div>
          </dl>
          <form onSubmit={(e) => void change("label", e)}>
            <fieldset disabled={busy}>
              <Field label="Terminal label">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={120}
                  required
                />
              </Field>
              <Button
                type="submit"
                disabled={busy || stale || label === terminal.label}
              >
                {busy ? "Saving…" : "Save label"}
              </Button>
            </fieldset>
          </form>
        </div>
        <div className="panel form-panel">
          <h2>Device access</h2>
          <p>
            Keys are private to the device and cannot be retrieved from the
            database.
          </p>
          {confirm ? (
            <div className="confirm-box">
              <h3>
                {confirm === "rotate"
                  ? "Replace this terminal’s key?"
                  : "Disable this terminal?"}
              </h3>
              <p>
                {confirm === "rotate"
                  ? "The current key will stop working immediately. Download the replacement and install it on this Pi before its next sale."
                  : "The current key will stop authenticating. Stop any active sale first. Re-enabling requires generating and installing a new key."}
              </p>
              <div className="button-row">
                <Button
                  danger
                  disabled={busy || stale}
                  onClick={() => void change(confirm)}
                >
                  {busy
                    ? "Updating…"
                    : confirm === "rotate"
                      ? "Replace key"
                      : "Disable terminal"}
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onClick={() => setConfirm(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="button-row">
              <Button
                secondary
                icon="key"
                disabled={busy || stale}
                onClick={() => setConfirm("rotate")}
              >
                {terminal.disabled_at
                  ? "Generate key to re-enable"
                  : "Replace device key"}
              </Button>
              {!terminal.disabled_at && (
                <Button
                  danger
                  disabled={busy || stale}
                  onClick={() => setConfirm("disable")}
                >
                  Disable terminal
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
      <aside className="context-panel">
        <h3>About device status</h3>
        <p>
          Last contact records the most recent authenticated terminal request.
          It does not guarantee the Pi is currently online.
        </p>
        <h3>Moving this device?</h3>
        <p>
          For another merchant, disable this registration and create a new
          terminal under that merchant.
        </p>
        <p>No payment history is deleted when a device is disabled.</p>
      </aside>
    </div>
  );
}

function Provisioned({
  value,
  onDone,
}: {
  value: Provision;
  onDone: () => void;
}) {
  const [downloaded, setDownloaded] = useState(false),
    [error, setError] = useState("");
  function download() {
    try {
      const blob = new Blob([configuration(value.url, value.key)], {
          type: "text/plain",
        }),
        href = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = href;
      a.download = "terminal.env";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      setDownloaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="provision-layout">
      <div className="panel provision-panel">
        <span className="completion-mark">
          <Icon name="check" size={28} />
        </span>
        <h2>Terminal registered</h2>
        <p>
          <strong>{value.terminal.label}</strong> is ready for its device
          configuration.
        </p>
        <ErrorNotice error={error} />
        <div className="notice warning">
          <Icon name="key" />
          <span>
            Download this file before leaving. The device key is only held in
            this browser and cannot be recovered after a refresh.
          </span>
        </div>
        <Button icon="download" onClick={download}>
          Download terminal.env
        </Button>
        {downloaded && (
          <p role="status" className="success-text">
            Download requested. Keep terminal.env private and transfer it to the
            intended Pi.
          </p>
        )}
        <hr />
        <h3>On the Pi</h3>
        <p>
          Transfer the file privately to the desktop user’s Downloads folder.
          Install it as that user:
        </p>
        <pre>
          <code>
            {
              "mkdir -p ~/.config/paybypalm\ninstall -m 600 ~/Downloads/terminal.env ~/.config/paybypalm/terminal.env"
            }
          </code>
        </pre>
        <p>With the Pi desktop open, start a test session:</p>
        <pre>
          <code>bash ~/.local/share/paybypalm/pi/start-kiosk-session.sh</code>
        </pre>
        <p className="muted">
          This starts the kiosk manually. It does not re-enable desktop
          autostart. The PayByPalm kiosk launcher must already be installed on
          the Pi.
        </p>
        <Button secondary onClick={onDone} disabled={!downloaded}>
          I’ve downloaded it — open terminal
        </Button>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined),
    [data, setData] = useState<Overview | null>(null),
    [route, setRoute] = useState(window.location.hash.slice(1) || "/merchants");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [provision, setProvision] = useState<Provision | null>(null);
  const epoch = useRef(0),
    request = useRef(0);
  useEffect(() => {
    const fn = () => {
      setRoute(window.location.hash.slice(1) || "/merchants");
      setError("");
      setNotice("");
      setSearch("");
      setFilter("all");
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (route !== "/provisioned") setProvision(null);
  }, [route]);
  useEffect(() => {
    let live = true;
    api<{ user: User }>("/auth/session")
      .then((r) => {
        if (live) setUser(r.user);
      })
      .catch((e) => {
        if (live) {
          setUser(null);
          if (!(e instanceof ApiError && e.status === 401)) setError(e.message);
        }
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const expired = () => {
      epoch.current++;
      setUser(null);
      setData(null);
      setProvision(null);
    };
    window.addEventListener("admin-session-expired", expired);
    return () => window.removeEventListener("admin-session-expired", expired);
  }, []);
  const load = useCallback(async () => {
    const generation = epoch.current,
      ticket = ++request.current;
    setLoading(true);
    try {
      const next = await api<Overview>("/overview");
      if (epoch.current === generation && request.current === ticket) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (epoch.current === generation) setError((e as Error).message);
    } finally {
      if (epoch.current === generation && request.current === ticket)
        setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (user) {
      void load();
      const timer = setInterval(() => void load(), 60000);
      return () => clearInterval(timer);
    }
  }, [user?.id, load]);
  const login = (u: User) => {
    epoch.current++;
    setUser(u);
    setError("");
    go("/merchants");
  };
  async function logout() {
    try {
      await api("/auth/logout", {});
      epoch.current++;
      setUser(null);
      setData(null);
      setProvision(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function saveMerchant(m: Merchant) {
    setData((d) =>
      d
        ? { ...d, merchants: [...d.merchants.filter((v) => v.id !== m.id), m] }
        : d,
    );
    go("/merchants/" + m.id);
    setNotice("Merchant saved. Configure bank payouts below, then add its terminal.");
    void load();
  }
  function saveTerminal(t: Terminal) {
    setData((d) =>
      d
        ? { ...d, terminals: [...d.terminals.filter((v) => v.id !== t.id), t] }
        : d,
    );
    go("/terminals/" + t.id);
    setNotice("Terminal configuration saved.");
    void load();
  }
  function provisionTerminal(p: Provision) {
    setData((d) =>
      d
        ? {
            ...d,
            terminals: [
              ...d.terminals.filter((v) => v.id !== p.terminal.id),
              p.terminal,
            ],
          }
        : d,
    );
    setProvision(p);
    go("/provisioned");
    void load();
  }
  if (user === undefined)
    return (
      <main className="initial-loading">
        <Icon name="palm" size={38} />
        <p role="status">Verifying administrator session…</p>
      </main>
    );
  if (!user)
    return (
      <>
        <ErrorNotice error={error} />
        <Login onLogin={login} />
      </>
    );
  const base = route.split("/")[1],
    entityId = route.split("/")[2]?.split("?")[0];
  const merchant = data?.merchants.find((m) => m.id === entityId),
    terminal = data?.terminals.find((t) => t.id === entityId);
  const section =
    base === "terminals"
      ? "terminals"
      : base === "activity"
        ? "activity"
        : "merchants";
  const titles: Record<string, [string, string]> = {
    merchants: ["Merchants", "Build the network, one business at a time."],
    terminals: ["Terminals", "Every device, connected to the right merchant."],
    activity: ["Activity", "A record of changes made in this admin workspace."],
  };
  let [title, subtitle] = titles[section];
  if (base === "merchants" && entityId) {
    title =
      entityId === "new"
        ? "New merchant"
        : merchant?.name || "Merchant details";
    subtitle = "Business details and terminal onboarding.";
  }
  if (base === "terminals" && entityId) {
    title =
      entityId === "new"
        ? "New terminal"
        : terminal?.label || "Terminal details";
    subtitle = "Merchant assignment, device configuration and access.";
  }
  if (base === "provisioned") {
    title = "Device setup";
    subtitle = "Finish configuring the intended Raspberry Pi.";
  }
  const shownMerchants = (data?.merchants || []).filter(
    (m) =>
      [m.name, m.contact_email, m.contact_phone].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase()),
      ) &&
      (filter !== "needs-terminal" ||
        !data?.terminals.some((t) => t.merchant_id === m.id && !t.disabled_at)),
  );
  const shownTerminals = (data?.terminals || []).filter(
    (t) =>
      [t.label, data?.merchants.find((m) => m.id === t.merchant_id)?.name].some(
        (v) => v?.toLowerCase().includes(search.toLowerCase()),
      ) &&
      (filter === "all" ||
        (filter === "disabled" ? !!t.disabled_at : !t.disabled_at)),
  );
  const counts = (id: string) =>
    data?.terminals.filter((t) => t.merchant_id === id && !t.disabled_at)
      .length || 0;
  return (
    <div className="app-shell">
      <a
        href="#content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("content")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <a href="#/merchants" className="brand">
          <span className="brand-mark">
            <Icon name="palm" size={25} />
          </span>
          PayByPalm
        </a>
        <span className="workspace-label">Administration</span>
        <nav aria-label="Main navigation">
          {(["merchants", "terminals", "activity"] as const).map((name) => (
            <a
              key={name}
              href={"#/" + name}
              aria-current={section === name ? "page" : undefined}
              className={section === name ? "nav-active" : ""}
            >
              <Icon name={name} />
              <span>{name[0].toUpperCase() + name.slice(1)}</span>
              {name !== "activity" && data && (
                <span className="nav-count">{data[name].length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-help">
          <Icon name="shield" />
          <strong>Merchant operations</strong>
          <p>
            Only authorized administrators can change merchant and device
            access.
          </p>
        </div>
        <div className="sidebar-account">
          <span className="avatar">{user.email.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>Administrator</strong>
            <small title={user.email}>{user.email}</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => void logout()}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            PayByPalm <span className="slash">/</span> Merchant operations
          </span>
          <span className="topbar-private">
            <Icon name="shield" size={16} /> Restricted workspace
          </span>
          <button
            className="mobile-signout"
            onClick={() => void logout()}
            aria-label="Sign out"
          >
            <Icon name="logout" size={17} />
            Sign out
          </button>
        </header>
        <main id="content" className="main-content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              {entityId || base === "provisioned" ? (
                <button
                  className="back-button"
                  onClick={() => go("/" + section)}
                >
                  <Icon name="back" size={16} /> Back to {section}
                </button>
              ) : null}
              <h1>{title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="heading-actions">
              <button
                className="icon-button"
                disabled={loading}
                onClick={() => void load()}
                aria-label="Refresh inventory"
              >
                <Icon name="refresh" />
              </button>
              {!entityId &&
                base !== "provisioned" &&
                section !== "activity" && (
                  <Button
                    icon="plus"
                    onClick={() => go("/" + section + "/new")}
                  >
                    {section === "merchants" ? "Add merchant" : "Add terminal"}
                  </Button>
                )}
            </div>
          </div>
          <ErrorNotice error={error} />
          {notice && (
            <div role="status" className="notice success">
              <Icon name="check" />
              {notice}
            </div>
          )}
          {data?.fixture && (
            <div className="notice warning">
              Browser test fixtures — no live merchant or device changes.
            </div>
          )}
          {!data ? (
            <div className="panel loading-panel" role="status">
              <span className="skeleton line" />
              <span className="skeleton line" />
              <span className="skeleton line" />
              <p>
                {loading
                  ? "Loading merchant inventory…"
                  : "Inventory could not be loaded. Use Refresh after completing setup."}
              </p>
            </div>
          ) : base === "provisioned" ? (
            provision ? (
              <Provisioned
                value={provision}
                onDone={() => {
                  const id = provision.terminal.id;
                  setProvision(null);
                  go("/terminals/" + id);
                }}
              />
            ) : (
              <Empty
                title="Configuration is no longer in this browser"
                action={
                  <Button onClick={() => go("/terminals")}>
                    Open terminals
                  </Button>
                }
              >
                Open the terminal and replace its key to generate a new
                configuration.
              </Empty>
            )
          ) : base === "merchants" && entityId ? (
            entityId === "new" || merchant ? (
              <>
                <MerchantForm
                  key={entityId}
                  merchant={merchant}
                  onSaved={saveMerchant}
                  onCancel={() => go("/merchants")}
                />
                {merchant&&<PayoutSetup key={merchant.id} merchant={merchant} onSaved={saveMerchant}/>}
                {merchant&&<MerchantAccess key={"access-"+merchant.id} merchantId={merchant.id}/>}
                {merchant && (
                  <div className="panel merchant-terminals">
                    <div className="panel-heading">
                      <h2>Terminals for {merchant.name}</h2>
                      <Button
                        icon="plus"
                        onClick={() =>
                          go("/terminals/new?merchant=" + merchant.id)
                        }
                      >
                        Add terminal
                      </Button>
                    </div>
                    {data.terminals.filter((t) => t.merchant_id === merchant.id)
                      .length ? (
                      <ul className="terminal-list">
                        {data.terminals
                          .filter((t) => t.merchant_id === merchant.id)
                          .map((t) => (
                            <li key={t.id}>
                              <button onClick={() => go("/terminals/" + t.id)}>
                                <Icon name="terminals" />
                                <span>
                                  <strong>{t.label}</strong>
                                  <small>{date(t.last_seen_at)}</small>
                                </span>
                                <Seen terminal={t} />
                                <Icon name="chevron" size={16} />
                              </button>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        No terminal has been registered for this merchant yet.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <Empty title="Merchant not found">
                Refresh the inventory or return to the merchant list.
              </Empty>
            )
          ) : base === "terminals" && entityId ? (
            entityId === "new" ? (
              <TerminalForm
                key={route}
                merchants={data.merchants}
                initialMerchant={
                  new URLSearchParams(route.split("?")[1]).get("merchant") ||
                  undefined
                }
                onSaved={saveTerminal}
                onProvision={provisionTerminal}
                onCancel={() => go("/terminals")}
                url={data.terminalUrl}
              />
            ) : terminal ? (
              <TerminalDetail
                key={terminal.id}
                terminal={terminal}
                merchant={data.merchants.find(
                  (m) => m.id === terminal.merchant_id,
                )}
                url={data.terminalUrl}
                onSaved={saveTerminal}
                onProvision={provisionTerminal}
              />
            ) : (
              <Empty title="Terminal not found">
                Refresh the inventory or return to the terminal list.
              </Empty>
            )
          ) : section === "activity" ? (
            <div className="panel activity-panel">
              <div className="panel-heading">
                <h2>Recent operator changes</h2>
                <Badge>Latest 100 events</Badge>
              </div>
              {data.activity.length ? (
                <ol className="activity-list">
                  {data.activity.map((a) => (
                    <li key={a.id}>
                      <span className="event-icon">
                        <Icon
                          name={
                            a.action.startsWith("merchant")
                              ? "merchants"
                              : "terminals"
                          }
                          size={18}
                        />
                      </span>
                      <div>
                        <strong>{a.label}</strong>
                        <p>
                          {a.action.replaceAll(".", " · ").replaceAll("_", " ")}
                        </p>
                      </div>
                      <time dateTime={a.created_at}>{date(a.created_at)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="Your change history starts here">
                  Merchant and terminal changes made through this app will
                  appear here.
                </Empty>
              )}
            </div>
          ) : (
            <div className="register-layout">
              <section className="panel register">
                <div className="register-heading">
                  <div>
                    <h2>
                      {section === "merchants"
                        ? "Merchant directory"
                        : "Terminal inventory"}
                    </h2>
                    <p>
                      {section === "merchants"
                        ? `${data.merchants.length} registered businesses`
                        : `${data.terminals.length} registered devices`}
                    </p>
                  </div>
                  <Badge tone="blue">
                    {section === "merchants"
                      ? "Merchant onboarding"
                      : "Device management"}
                  </Badge>
                </div>
                <div className="table-toolbar">
                  <label className="search">
                    <Icon name="search" size={18} />
                    <input
                      aria-label={
                        section === "merchants"
                          ? "Search merchants"
                          : "Search terminals"
                      }
                      placeholder={
                        section === "merchants"
                          ? "Search by name, email or phone"
                          : "Search by terminal or merchant"
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="Filter inventory"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {section === "merchants" ? (
                      <>
                        <option value="all">All merchants</option>
                        <option value="needs-terminal">Needs a terminal</option>
                      </>
                    ) : (
                      <>
                        <option value="all">All terminals</option>
                        <option value="active">Enabled</option>
                        <option value="disabled">Disabled</option>
                      </>
                    )}
                  </select>
                </div>
                {section === "merchants" ? (
                  shownMerchants.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Business</th>
                            <th>Contact</th>
                            <th>Terminals</th>
                            <th>Settlement</th>
                            <th>
                              <span className="sr-only">Actions</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownMerchants.map((m) => (
                            <tr key={m.id}>
                              <td>
                                <button
                                  className="record-name"
                                  onClick={() => go("/merchants/" + m.id)}
                                >
                                  <span className="record-avatar">
                                    {m.name.slice(0, 1).toUpperCase()}
                                  </span>
                                  <span>
                                    <strong>{m.name}</strong>
                                    <small>{short(m.id)}</small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span>{m.contact_email || "Not provided"}</span>
                                <small>
                                  {m.contact_phone || "No phone added"}
                                </small>
                              </td>
                              <td>
                                <Badge tone={counts(m.id) ? "blue" : "neutral"}>
                                  {counts(m.id)}{" "}
                                  {counts(m.id) === 1
                                    ? "terminal"
                                    : "terminals"}
                                </Badge>
                              </td>
                              <td>
                                <span
                                  className={
                                    m.paystack_subaccount
                                      ? "settlement-set"
                                      : "muted"
                                  }
                                >
                                  {m.paystack_subaccount
                                    ? "Subaccount set"
                                    : "Not configured"}
                                </span>
                              </td>
                              <td>
                                <button
                                  className="row-link"
                                  onClick={() => go("/merchants/" + m.id)}
                                >
                                  Manage <Icon name="chevron" size={16} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={
                        search || filter !== "all"
                          ? "No merchants match this view"
                          : "Add your first merchant"
                      }
                      action={
                        !search && filter === "all" ? (
                          <Button
                            icon="plus"
                            onClick={() => go("/merchants/new")}
                          >
                            Add merchant
                          </Button>
                        ) : (
                          <Button
                            secondary
                            onClick={() => {
                              setSearch("");
                              setFilter("all");
                            }}
                          >
                            Clear filters
                          </Button>
                        )
                      }
                    >
                      {search || filter !== "all"
                        ? "Try a different search or clear the filter."
                        : "Create the business profile, then register the terminal for its counter."}
                    </Empty>
                  )
                ) : shownTerminals.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Terminal</th>
                          <th>Merchant</th>
                          <th>Access</th>
                          <th>Last contact · Lagos</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownTerminals.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <button
                                className="record-name"
                                onClick={() => go("/terminals/" + t.id)}
                              >
                                <span className="device-avatar">
                                  <Icon name="terminals" />
                                </span>
                                <span>
                                  <strong>{t.label}</strong>
                                  <small>{short(t.id)}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              {data.merchants.find(
                                (m) => m.id === t.merchant_id,
                              )?.name || "Unknown merchant"}
                            </td>
                            <td>
                              <Badge tone={t.disabled_at ? "red" : "green"}>
                                {t.disabled_at ? "Disabled" : "Enabled"}
                              </Badge>
                            </td>
                            <td>{date(t.last_seen_at)}</td>
                            <td>
                              <button
                                className="row-link"
                                onClick={() => go("/terminals/" + t.id)}
                              >
                                Configure <Icon name="chevron" size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title={
                      search || filter !== "all"
                        ? "No terminals match this view"
                        : "Connect your first terminal"
                    }
                    action={
                      !search && filter === "all" ? (
                        <Button
                          icon="plus"
                          onClick={() => go("/terminals/new")}
                        >
                          Add terminal
                        </Button>
                      ) : (
                        <Button
                          secondary
                          onClick={() => {
                            setSearch("");
                            setFilter("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      )
                    }
                  >
                    {search || filter !== "all"
                      ? "Try another search or filter."
                      : "Choose a merchant and create a private configuration for its Pi."}
                  </Empty>
                )}
                <div className="table-footer">
                  <span>
                    {section === "merchants"
                      ? shownMerchants.length
                      : shownTerminals.length}{" "}
                    {section === "merchants" ? "merchants" : "terminals"} shown
                  </span>
                  <span>Refreshes every minute</span>
                </div>
              </section>
              <aside className="onboarding-rail">
                <div className="rail-icon">
                  <Icon name="palm" size={25} />
                </div>
                <h2>
                  From business
                  <br />
                  to first scan.
                </h2>
                <p>Bring a merchant and its counter online in three steps.</p>
                <ol className="steps">
                  <li>
                    <strong>Create the merchant</strong>
                    <span>Add its business and settlement details.</span>
                  </li>
                  <li>
                    <strong>Register its terminal</strong>
                    <span>Choose the merchant and label the counter.</span>
                  </li>
                  <li>
                    <strong>Configure the Pi</strong>
                    <span>
                      Install its private file and start a test session.
                    </span>
                  </li>
                </ol>
                <a href="#/terminals/new" className="rail-link">
                  Set up a terminal <Icon name="arrow" size={17} />
                </a>
                <div className="rail-footnote">
                  <Icon name="shield" size={17} />
                  <p>
                    Device keys stay private. The server stores only their
                    hashes.
                  </p>
                </div>
              </aside>
            </div>
          )}
          <footer className="workspace-footer">
            <span>PayByPalm administration</span>
            <span>All displayed times use Africa/Lagos</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
