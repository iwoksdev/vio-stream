import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { apiRequest } from "./api";
import type { AccountUser, PlatformStatus } from "./types";

interface AccountContextValue {
  user: AccountUser | null;
  loading: boolean;
  mode: string;
  registration: boolean;
  authOpen: boolean;
  setAuthOpen: (v: boolean) => void;
  acceptSession: (user: AccountUser) => void;
  logout: () => Promise<void>;
}
const AccountContext = createContext<AccountContextValue | null>(null);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true),
    [mode, setMode] = useState("live"),
    [registration, setRegistration] = useState(true),
    [authOpen, setAuthOpen] = useState(false);
  useEffect(() => {
    let active = true;
    apiRequest<{
      user: AccountUser | null;
      registration: boolean;
      mode: string;
    }>("/api/auth/me")
      .then((data) => {
        if (active) {
          setUser(data.user);
          setRegistration(data.registration);
          setMode(data.mode || "live");
        }
      })
      .catch(() => {
        if (active) setMode("unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const acceptSession = (next: AccountUser) => {
    setUser(next);
    setAuthOpen(false);
  };
  const logout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setUser(null);
  };
  return (
    <AccountContext.Provider
      value={{
        user,
        loading,
        mode,
        registration,
        authOpen,
        setAuthOpen,
        acceptSession,
        logout,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw new Error("Missing AccountProvider");
  return context;
}
const ServicesContext = createContext<{
  status: PlatformStatus | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
} | null>(null);
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PlatformStatus | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(
        await apiRequest<PlatformStatus>("/api/platform/status?refresh=1"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "سرور در دسترس نیست.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <ServicesContext.Provider value={{ status, loading, error, refresh }}>
      {children}
    </ServicesContext.Provider>
  );
}
export function useServices() {
  const context = useContext(ServicesContext);
  if (!context) throw new Error("Missing ServicesProvider");
  return context;
}
