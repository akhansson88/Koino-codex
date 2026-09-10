import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Download,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import "./admin.css";

type DeviceFilter = "all" | "ios" | "android" | "unknown";
type Platform = "google-play" | "testflight";

type Session = {
  username: string;
  csrfToken: string;
  expiresAt: string;
};

type Overview = {
  generatedAt: string;
  timezone: string;
  counts: { total: number; ios: number; android: number; unknown: number };
  daily: Array<{ date: string; total: number; ios: number; android: number }>;
};

type Registration = {
  id: number;
  email: string;
  device: Exclude<DeviceFilter, "all">;
  createdAt: string;
};

type RegistrationPage = {
  filter: DeviceFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Registration[];
};

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code = "unknown",
  ) {
    super(code);
  }
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // The status code remains the source of truth for malformed responses.
  }
  if (!response.ok || payload.ok !== true) {
    throw new ApiError(response.status, String(payload.code ?? "unknown"));
  }
  return payload as unknown as T;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function AnimatedNumber({ value }: { value: number }) {
  const reducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(reducedMotion ? value : 0);
  useEffect(() => {
    if (reducedMotion) {
      setDisplay(value);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 400, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion, value]);
  return (
    <>
      <span aria-hidden="true">{new Intl.NumberFormat("sv-SE").format(display)}</span>
      <span className="sr-only" aria-live="polite">
        {new Intl.NumberFormat("sv-SE").format(value)}
      </span>
    </>
  );
}

const dateLabel = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
const timestampLabel = new Intl.DateTimeFormat("sv-SE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Stockholm",
});

function formatChartDate(value: string) {
  return dateLabel.format(new Date(`${value}T12:00:00`));
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length || typeof label !== "string") return null;
  return (
    <div className="admin-chart-tooltip">
      <strong>{formatChartDate(label)}</strong>
      {payload.map((item) => (
        <span key={String(item.dataKey)}>
          {item.name}: {Array.isArray(item.value) ? item.value.join("–") : Number(item.value).toLocaleString("sv-SE")}
        </span>
      ))}
    </div>
  );
}

function BrandMark() {
  return (
    <span className="admin-brand">
      <img src="/koino-logo.png" alt="" width="32" height="32" />
      <span>KOINO</span>
      <span className="admin-brand-divider" aria-hidden="true" />
      <span className="admin-brand-section">Statistik</span>
    </span>
  );
}

function PageFooter() {
  return (
    <footer className="admin-footer">
      <p>Siffrorna hämtas direkt från väntelistan.</p>
      <div>
        <BrandMark />
        <span>Intern vy · Europe/Stockholm</span>
      </div>
    </footer>
  );
}

function Login({ onAuthenticated, notice }: { onAuthenticated: (session: Session) => void; notice: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState(notice);
  const inFlight = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    inFlight.current = true;
    setState("loading");
    setMessage("");
    try {
      const result = await jsonRequest<{
        ok: true;
        user: { username: string };
        csrfToken: string;
        expiresAt: string;
      }>("/api/admin/login.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setPassword("");
      onAuthenticated({
        username: result.user.username,
        csrfToken: result.csrfToken,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setState("error");
      setMessage(
        apiError?.status === 429
          ? "För många inloggningsförsök. Vänta 15 minuter och försök igen."
          : apiError?.status === 401
            ? "Inloggningen misslyckades. Kontrollera uppgifterna och försök igen."
            : "Inloggningen kunde inte nå servern. Kontrollera anslutningen och försök igen.",
      );
    } finally {
      inFlight.current = false;
      setState((current) => (current === "loading" ? "idle" : current));
    }
  }

  return (
    <div className="admin-page admin-login-page">
      <header className="admin-login-header"><BrandMark /></header>
      <main className="admin-login-main">
        <section className="admin-login-copy">
          <ShieldCheck size={34} aria-hidden="true" />
          <h1>Logga in till statistiken</h1>
          <p>Den här sidan innehåller väntelistans e-postadresser och är endast avsedd för Koinos administratör.</p>
        </section>
        <form className="admin-login-form" onSubmit={submit} aria-busy={state === "loading"}>
          <label htmlFor="admin-username">Användarnamn</label>
          <input
            id="admin-username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={64}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            aria-invalid={state === "error"}
            aria-describedby={message ? "admin-login-message" : undefined}
          />
          <label htmlFor="admin-password">Lösenord</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={1024}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={state === "error"}
            aria-describedby={message ? "admin-login-message" : undefined}
          />
          <p
            id="admin-login-message"
            className={`admin-form-message ${state === "error" || notice ? "is-error" : ""}`}
            role={state === "error" || notice ? "alert" : undefined}
          >
            {message || "Sessionen gäller i åtta timmar."}
          </p>
          <button className="admin-primary-button" type="submit" disabled={state === "loading"}>
            {state === "loading" ? "Loggar in…" : "Logga in"}
          </button>
        </form>
      </main>
      <PageFooter />
    </div>
  );
}

function Dashboard({ session, onExpired }: { session: Session; onExpired: (message?: string) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationPage | null>(null);
  const [device, setDevice] = useState<DeviceFilter>("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overviewError, setOverviewError] = useState("");
  const [tableError, setTableError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [downloading, setDownloading] = useState<Platform | null>(null);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setOverviewError("");
    jsonRequest<{ ok: true } & Overview>("/api/admin/overview.php", { signal: controller.signal })
      .then((result) => setOverview(result))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired("Sessionen har gått ut. Logga in igen.");
        else setOverviewError("Statistiken kunde inte hämtas. Försök att uppdatera sidan.");
      });
    return () => controller.abort();
  }, [onExpired, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    setTableError("");
    setRegistrations(null);
    jsonRequest<{ ok: true } & RegistrationPage>(
      `/api/admin/registrations.php?device=${device}&page=${page}`,
      { signal: controller.signal },
    )
      .then((result) => setRegistrations(result))
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) onExpired("Sessionen har gått ut. Logga in igen.");
        else setTableError("Anmälningarna kunde inte hämtas. Försök att uppdatera sidan.");
      });
    return () => controller.abort();
  }, [device, onExpired, page, refreshKey]);

  const range = useMemo(() => {
    if (!overview?.daily.length) return "Ingen data ännu";
    const first = formatChartDate(overview.daily[0].date);
    const last = formatChartDate(overview.daily[overview.daily.length - 1].date);
    return `${first}–${last}`;
  }, [overview]);

  async function logout() {
    setLoggingOut(true);
    try {
      await jsonRequest<{ ok: true }>("/api/admin/logout.php", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrfToken },
      });
    } catch {
      // Clear the local authenticated state even if the server is unavailable.
    } finally {
      onExpired();
    }
  }

  async function download(platform: Platform) {
    setDownloading(platform);
    setDownloadError("");
    try {
      const response = await fetch(`/api/admin/export.php?platform=${platform}`, { credentials: "same-origin" });
      if (response.status === 401) {
        onExpired("Sessionen har gått ut. Logga in igen.");
        return;
      }
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `koino-testers-${platform}.csv`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Exporten kunde inte skapas. Försök igen.");
    } finally {
      setDownloading(null);
    }
  }

  const filters: Array<{ id: DeviceFilter; label: string }> = [
    { id: "all", label: "Alla" },
    { id: "ios", label: "iOS" },
    { id: "android", label: "Android" },
    { id: "unknown", label: "Okänd" },
  ];

  return (
    <div className="admin-page">
      <nav className="admin-nav" aria-label="Admin">
        <BrandMark />
        <span className="admin-nav-user">{session.username}</span>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} aria-label="Uppdatera statistik">
          <RefreshCw size={16} aria-hidden="true" />
          <span>Uppdatera</span>
        </button>
        <button type="button" onClick={logout} disabled={loggingOut} aria-label="Logga ut">
          <LogOut size={16} aria-hidden="true" />
          <span>{loggingOut ? "Loggar ut…" : "Logga ut"}</span>
        </button>
      </nav>

      <main className="admin-main">
        <h1 className="sr-only">Koinos väntelistestatistik</h1>
        <section className="admin-stat-hero" aria-labelledby="total-heading">
          <div className="admin-total-block">
            <h2 id="total-heading">Totalt på väntelistan</h2>
            <p className="admin-total-number">
              {overview ? <AnimatedNumber value={overview.counts.total} /> : <span className="admin-number-skeleton" />}
            </p>
            <p>{overview ? `${range} · samtliga registrerade adresser` : "Hämtar aktuell totalsiffra…"}</p>
          </div>
          <dl className="admin-supporting-stats">
            {(["ios", "android", "unknown"] as const).map((key) => (
              <div key={key}>
                <dt>{key === "ios" ? "iOS" : key === "android" ? "Android" : "Okänd device"}</dt>
                <dd>{overview ? <AnimatedNumber value={overview.counts[key]} /> : "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {overviewError ? (
          <div className="admin-error-panel" role="alert">
            <AlertTriangle size={20} aria-hidden="true" />
            <span>{overviewError}</span>
          </div>
        ) : null}

        <section className="admin-chart-section" aria-labelledby="chart-heading">
          <div className="admin-section-heading">
            <div>
              <h2 id="chart-heading">Anmälningar per dag</h2>
              <p>Totalt jämfört med iOS och Android.</p>
            </div>
            <span>{overview ? `Uppdaterad ${timestampLabel.format(new Date(overview.generatedAt))}` : "Hämtar data…"}</span>
          </div>
          {!overview ? (
            <div className="admin-chart-skeleton" aria-label="Laddar diagram" />
          ) : overview.daily.length === 0 ? (
            <div className="admin-empty-state">
              <p>Inga anmälningar ännu.</p>
              <span>Grafen visas när den första personen går med i väntelistan.</span>
            </div>
          ) : (
            <div className="admin-chart" role="img" aria-label="Kurvdiagram över antal anmälningar per dag">
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={overview.daily} margin={{ top: 16, right: 12, bottom: 4, left: -14 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="var(--color-admin-rule)" />
                  <XAxis dataKey="date" tickFormatter={formatChartDate} minTickGap={34} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={ChartTooltip} />
                  <Legend iconType="plainline" />
                  <Line type="monotone" dataKey="total" name="Totalt" stroke="var(--color-admin-total)" strokeWidth={3} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ios" name="iOS" stroke="var(--color-admin-ios)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="android" name="Android" stroke="var(--color-admin-android)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="admin-table-section" aria-labelledby="registrations-heading">
          <div className="admin-table-header">
            <div>
              <h2 id="registrations-heading">Anmälningar</h2>
              <p>{registrations ? `${registrations.total.toLocaleString("sv-SE")} poster i vald vy` : "Filtrera efter device och exportera testare."}</p>
            </div>
            <div className="admin-export-actions" aria-label="Exportera testare">
              {(device === "all" || device === "android") && (
                <button type="button" onClick={() => download("google-play")} disabled={downloading !== null}>
                  <Download size={16} aria-hidden="true" />
                  {downloading === "google-play" ? "Skapar…" : "Google Play CSV"}
                </button>
              )}
              {(device === "all" || device === "ios") && (
                <button type="button" onClick={() => download("testflight")} disabled={downloading !== null}>
                  <Download size={16} aria-hidden="true" />
                  {downloading === "testflight" ? "Skapar…" : "TestFlight CSV"}
                </button>
              )}
            </div>
          </div>

          <div className="admin-tabs" role="tablist" aria-label="Filtrera anmälningar efter device">
            {filters.map((filter) => (
              <button
                key={filter.id}
                type="button"
                role="tab"
                aria-selected={device === filter.id}
                tabIndex={device === filter.id ? 0 : -1}
                onClick={() => {
                  setDevice(filter.id);
                  setPage(1);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const current = filters.findIndex((candidate) => candidate.id === filter.id);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? filters.length - 1
                        : (current + (event.key === "ArrowRight" ? 1 : -1) + filters.length) % filters.length;
                  setDevice(filters[next].id);
                  setPage(1);
                  const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
                  tabs?.[next]?.focus({ preventScroll: true });
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {downloadError ? <p className="admin-download-error" role="alert">{downloadError}</p> : null}
          {tableError ? (
            <div className="admin-error-panel" role="alert">
              <AlertTriangle size={20} aria-hidden="true" />
              <span>{tableError}</span>
            </div>
          ) : !registrations ? (
            <div className="admin-table-skeleton" aria-label="Laddar anmälningar" />
          ) : registrations.items.length === 0 ? (
            <div className="admin-empty-state">
              <p>Inga anmälningar i den här vyn.</p>
              <span>Byt flik för att se en annan device.</span>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead><tr><th scope="col">E-postadress</th><th scope="col">Device</th><th scope="col">Anmäld</th></tr></thead>
                <tbody>
                  {registrations.items.map((item) => (
                    <tr key={item.id}>
                      <td data-label="E-postadress">{item.email}</td>
                      <td data-label="Device"><span className={`admin-device admin-device-${item.device}`}>{item.device === "ios" ? "iOS" : item.device === "android" ? "Android" : "Okänd"}</span></td>
                      <td data-label="Anmäld">{timestampLabel.format(new Date(item.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {registrations && registrations.totalPages > 1 ? (
            <nav className="admin-pagination" aria-label="Tabellsidor">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                <ArrowLeft size={16} aria-hidden="true" /> Föregående
              </button>
              <span>Sida {page} av {registrations.totalPages}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(registrations.totalPages, value + 1))} disabled={page >= registrations.totalPages}>
                Nästa <ArrowRight size={16} aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </section>
      </main>
      <PageFooter />
    </div>
  );
}

export default function AdminPage() {
  const [state, setState] = useState<"checking" | "guest" | "authenticated">("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
  const expire = useCallback((message = "") => {
    setSession(null);
    setNotice(message);
    setState("guest");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    jsonRequest<{
      ok: true;
      user: { username: string };
      csrfToken: string;
      expiresAt: string;
    }>("/api/admin/session.php", { signal: controller.signal })
      .then((result) => {
        setSession({
          username: result.user.username,
          csrfToken: result.csrfToken,
          expiresAt: result.expiresAt,
        });
        setState("authenticated");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (!(error instanceof ApiError) || error.status !== 401) {
          setNotice("Sessionen kunde inte kontrolleras. Du kan försöka logga in igen.");
        }
        setState("guest");
      });
    return () => controller.abort();
  }, []);

  if (state === "checking") {
    return <div className="admin-page admin-session-check" role="status"><BrandMark /><span>Kontrollerar session…</span></div>;
  }
  if (state === "guest" || !session) {
    return <Login notice={notice} onAuthenticated={(next) => { setSession(next); setNotice(""); setState("authenticated"); }} />;
  }
  return <Dashboard session={session} onExpired={expire} />;
}
