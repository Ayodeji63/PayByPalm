import { useEffect, useRef, useState } from "react";
import { api } from "./api";
type Member = {
  id: string;
  user_id: string;
  email: string;
  created_at: string;
  updated_at: string;
};
export function MerchantAccess({ merchantId }: { merchantId: string }) {
  const [members, setMembers] = useState<Member[]>([]),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revoking, setRevoking] = useState<string | null>(null);
  const live = useRef(true);
  async function load() {
    const r = await api<{ members: Member[] }>(
      `/merchants/${merchantId}/access`,
    );
    if (live.current) {
      setMembers(r.members);
      setLoaded(true);
    }
  }
  useEffect(() => {
    live.current = true;
    void load().catch((e) => {
      if (live.current) setError(e.message);
    });
    return () => {
      live.current = false;
    };
  }, [merchantId]);
  async function grant() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/merchants/${merchantId}/access`, { email });
      if (!live.current) return;
      setEmail("");
      setNotice("Merchant portal access granted.");
      await load();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  async function revoke(member: Member) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/merchants/${merchantId}/access/${member.user_id}/revoke`, {
        expected: member.updated_at,
      });
      if (!live.current) return;
      setRevoking(null);
      setNotice("Merchant portal access revoked.");
      await load();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <section
      className="panel form-panel"
      aria-labelledby="merchant-access-title"
    >
      <h2 id="merchant-access-title">Merchant portal access</h2>
      <p>
        Grant a verified PayByPalm account access to this business’s payments,
        settlements and terminals. This does not grant administrator access.
      </p>
      <p>
        Merchant sign-in:{" "}
        <a
          href="https://merchant.paybypalm.app"
          target="_blank"
          rel="noreferrer"
        >
          merchant.paybypalm.app
        </a>
      </p>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void grant();
        }}
      >
        <label className="field">
          <span>Verified account email</span>
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            placeholder="owner@example.com"
            disabled={busy}
          />
          <small>
            The account must already exist and have a verified email address.
          </small>
        </label>
        <button className="button" type="submit" disabled={busy || !email}>
          {busy ? "Saving access…" : "Grant merchant access"}
        </button>
      </form>
      {loaded && !members.length && (
        <p className="notice">
          No accounts have portal access to this business yet.
        </p>
      )}
      <ul className="merchant-access-list">
        {members.map((member) => (
          <li key={member.id}>
            <div>
              <strong>{member.email}</strong>
              <small>Can view this business’s reports</small>
            </div>
            {revoking === member.id ? (
              <div>
                <p>Revoke this account’s access to this business?</p>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={() => void revoke(member)}
                >
                  Confirm revoke
                </button>{" "}
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setRevoking(null)}
                >
                  Keep access
                </button>
              </div>
            ) : (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => setRevoking(member.id)}
              >
                Revoke access
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
