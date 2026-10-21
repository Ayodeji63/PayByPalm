/**
 * Authentication and the live `me` snapshot.
 *
 * THE POLLING HERE IS THE DEMO. A judge pays with their palm at the terminal and
 * watches the balance on their phone change a moment later.
 *
 * Signup requires a confirmed email before any session is accepted.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  revokeSession,
  clearSession,
  getSessionRevision,
  loadSession,
  saveSession,
  setUnauthorizedHandler,
  type Me,
  type Session,
} from "./api.js";
import { setCardOwner } from "./cardStore.js";

const POLL_ACTIVE_MS = 3_000;
const POLL_BACKGROUND_MS = 15_000;

interface SignUpInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

interface AuthApi {
  me: Me | null;
  status: "loading" | "authenticated" | "anonymous";
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ email: string }>;
  confirmEmail: (token: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => void;
  /** Force an immediate refresh — after a payment, or on returning from enrolment. */
  refresh: () => Promise<void>;
  /** Biometric consent tracking */
  consentGiven: boolean;
  setConsentGiven: (given: boolean) => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

interface AuthResponse {
  session: Session;
  user?: { phone?: string };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthApi["status"]>(() =>
    loadSession() ? "loading" : "anonymous",
  );
  const [consentGiven, setConsentGivenState] = useState(false);
  const setConsentGiven = useCallback((given: boolean) => {
    setConsentGivenState(given);
  }, []);

  const fetchMe = useCallback(async () => {
    const revision = getSessionRevision();
    try {
      const next = await api.get<Me>("/me");

      if (revision !== getSessionRevision()) return;
      setCardOwner(next.id);

      setMe(next);
      setStatus("authenticated");
    } catch {
      if (revision !== getSessionRevision()) return;
      clearSession();
      setCardOwner(null);
      setMe(null);
      setStatus("anonymous");
    }
  }, []);

  const signOut = useCallback(() => {
    const previous = loadSession();
    if (previous) void revokeSession(previous.accessToken).catch(() => {});
    clearSession();
    setCardOwner(null);
    setConsentGiven(false);
    setMe(null);
    setStatus("anonymous");
  }, [setConsentGiven]);

  // api.ts calls this when a refresh attempt has already failed.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCardOwner(null);
      setMe(null);
      setStatus("anonymous");
    });
  }, []);

  // Initial load.
  useEffect(() => {
    if (loadSession()) void fetchMe();
  }, [fetchMe]);

  // Polling, paced by whether anyone is actually looking.
  useEffect(() => {
    if (status !== "authenticated") return;

    let timer: number;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const visible = document.visibilityState === "visible";
      timer = window.setTimeout(
        async () => {
          await fetchMe();
          schedule();
        },
        visible ? POLL_ACTIVE_MS : POLL_BACKGROUND_MS,
      );
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchMe();
        window.clearTimeout(timer);
        schedule();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [status, fetchMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      signOut();
      const revision = getSessionRevision();
      const data = await api.anonPost<AuthResponse>("/auth/login", {
        email,
        password,
      });
      if (revision !== getSessionRevision())
        throw new Error("Sign-in cancelled.");
      saveSession(data.session);
      setStatus("loading");
      await fetchMe();
      if (!loadSession())
        throw new Error("Unable to verify your session. Please sign in again.");
    },
    [fetchMe, signOut],
  );

  const signUp = useCallback(
    async (input: SignUpInput): Promise<{ email: string }> => {
      signOut();
      const revision = getSessionRevision();
      const data = await api.anonPost<{
        email: string;
        verificationRequired: boolean;
        session?: Session;
      }>("/auth/signup", input);
      if (revision !== getSessionRevision())
        throw new Error("Signup cancelled.");
      if (data.verificationRequired !== true || data.session || !data.email)
        throw new Error(
          "Email verification is not configured. Please contact support.",
        );
      return { email: data.email };
    },
    [signOut],
  );

  const confirmEmail = useCallback(async (token: string) => {
    await api.anonPost<{ verified: true }>("/auth/confirm", { token });
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    await api.anonPost("/auth/resend-confirmation", { email });
  }, []);

  const value = useMemo<AuthApi>(
    () => ({
      me,
      status,
      signIn,
      signUp,
      confirmEmail,
      resendConfirmation,
      signOut,
      refresh: fetchMe,
      consentGiven,
      setConsentGiven,
    }),
    [
      me,
      status,
      signIn,
      signUp,
      confirmEmail,
      resendConfirmation,
      signOut,
      fetchMe,
      consentGiven,
      setConsentGiven,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
