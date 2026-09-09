import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  House,
  LoaderCircle,
  Signal,
  Sparkles,
  Sun,
  Users,
  Waves,
  Wifi,
  X,
} from "lucide-react";

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "brand-small" : ""}`}>
      <img src="/koino-logo.png" alt="" />
      <span>
        KOINO
        {!small && (
          <span className="brand-tagline">GEMENSKAP · RYTM · BÖN</span>
        )}
      </span>
    </span>
  );
}

function PhonePreview() {
  return (
    <figure
      className="preview"
      aria-label="Förhandsvisning av Koino: daglig reflektion, bön och gemenskap. Illustrativt innehåll."
    >
      <div className="orbit orbit-one" />
      <div className="orbit orbit-two" />
      <div className="phone-float">
        <div className="phone">
          <div className="phone-side side-left" />
          <div className="phone-side side-right" />
          <div className="phone-screen" aria-hidden="true">
            <div className="status-bar">
              <span>9:41</span>
              <span className="island" />
              <span className="status-icons">
                <Signal size={12} />
                <Wifi size={12} />
                <span className="battery" />
              </span>
            </div>
            <div className="app-top">
              <Brand small />
              <span className="avatar">E</span>
            </div>
            <div className="app-greeting">
              <span className="app-eyebrow">
                <Sun size={13} /> EN NY DAG, TILLSAMMANS
              </span>
              <h2>
                God morgon, Emma<span>.</span>
              </h2>
              <p>En stund för det som bär.</p>
            </div>
            <div className="verse-card">
              <div className="verse-heading">
                <BookOpen size={14} />
                <span>DAGENS ORD</span>
                <span className="verse-dot" />
              </div>
              <p>
                “Där två eller tre är samlade i mitt namn är jag mitt ibland
                dem.”
              </p>
              <span className="verse-source">MATTEUS 18:20</span>
              <Waves className="verse-wave" size={110} strokeWidth={0.7} />
            </div>
            <div className="checkin">
              <div>
                <span className="tiny-label">LANDA EN STUND</span>
                <h3>Hur mår ditt hjärta idag?</h3>
              </div>
              <div className="moods">
                <span>☀</span>
                <span>♡</span>
                <span>≈</span>
                <span>☁</span>
                <span>☂</span>
              </div>
            </div>
            <div className="app-section-title">
              <h3>Vi bär varandra</h3>
              <span>
                Visa alla <ChevronRight size={10} />
              </span>
            </div>
            <div className="prayer-card">
              <span className="prayer-icon">
                <Heart size={18} />
              </span>
              <div>
                <strong>En stund i bön</strong>
                <p>Ge plats för det du bär på.</p>
              </div>
              <ChevronRight size={15} />
            </div>
            <div className="app-nav">
              <span className="selected">
                <House size={17} />
                Hem
              </span>
              <span>
                <Users size={17} />
                Gemenskap
              </span>
              <span>
                <BookOpen size={17} />
                Ordet
              </span>
              <span>
                <Waves size={17} />
                Min rytm
              </span>
            </div>
            <div className="home-indicator" />
          </div>
        </div>
      </div>
      <div className="preview-caption">
        <span />
        EN GLIMT AV KOINO
      </div>
    </figure>
  );
}

function Waitlist() {
  const [email, setEmail] = useState("");
  const [device, setDevice] = useState<"ios" | "android" | "">("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || state === "success") return;
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const body = {
      email: email.trim(),
      device,
      website: new FormData(form).get("website"),
    };
    inFlight.current = true;
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/waitlist.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true)
        throw new Error(
          response.status === 429
            ? "Lite för många försök. Vänta en stund och försök igen."
            : response.status === 422
              ? "Kontrollera din e-postadress och försök igen."
              : "Det gick inte att spara just nu. Försök igen om en stund.",
        );
      setState("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const knownError = ["Det gick", "Lite", "Kontrollera"].some((prefix) =>
        message.startsWith(prefix),
      );
      setError(
        knownError
          ? message
          : "Vi kunde inte nå servern. Kontrollera din anslutning och försök igen.",
      );
      setState("error");
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <div className="waitlist-area">
      {state === "success" ? (
        <div className="success-message" role="status">
          <span>
            <Check size={22} />
          </span>
          <div>
            <strong>Du är med på listan.</strong>
            <p>Vi hör av oss när Koino är redo. Fint att du vill vara med.</p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="waitlist"
          aria-busy={state === "loading"}
        >
          <label htmlFor="email">Din e-postadress</label>
          <div className="signup-row">
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="namn@exempel.se"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={state === "error"}
              aria-describedby={
                state === "error" ? "signup-error signup-note" : "signup-note"
              }
              disabled={state === "loading"}
            />
            <button type="submit" disabled={state === "loading"}>
              {state === "loading" ? (
                <>
                  Sparar <LoaderCircle size={17} className="spinner" />
                </>
              ) : (
                <>
                  Gå med i väntelistan <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
          <fieldset className="device-fieldset">
            <legend>Vilken telefon använder du?</legend>
            <div className="device-options">
              <label className={device === "ios" ? "selected" : ""}>
                <input
                  type="radio"
                  name="device"
                  value="ios"
                  checked={device === "ios"}
                  onChange={() => setDevice("ios")}
                  disabled={state === "loading"}
                  required
                />
                <span>iOS</span>
              </label>
              <label className={device === "android" ? "selected" : ""}>
                <input
                  type="radio"
                  name="device"
                  value="android"
                  checked={device === "android"}
                  onChange={() => setDevice("android")}
                  disabled={state === "loading"}
                  required
                />
                <span>Android</span>
              </label>
            </div>
          </fieldset>
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="website">Lämna tomt</label>
            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          {state === "error" && (
            <p id="signup-error" className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
      <p id="signup-note" className="signup-note">
        <Check size={13} /> Bara nyheter om lanseringen. Ingen reklam.
      </p>
    </div>
  );
}

export default function App() {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <div className="landing">
      <a className="skip-link" href="#waitlist">
        Till väntelistan
      </a>
      <header className="site-header">
        <a className="brand-link" href="/" aria-label="Koino startsida">
          <Brand />
        </a>
        <span className="launch-status">
          <span />
          NÅGOT FINT ÄR PÅ VÄG
        </span>
      </header>
      <main className="hero">
        <section className="hero-copy" aria-labelledby="headline">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            DIN TRO. DIN VARDAG. TILLSAMMANS.
          </div>
          <h1 id="headline">
            Närmare Gud.
            <br />
            <span>
              Närmare
              <br className="desktop-break" /> varandra.
            </span>
          </h1>
          <p className="lede">
            Koino samlar bön, gemenskap och dagliga rytmer i en app. Gå med i
            väntelistan och få besked när vi lanserar.
          </p>
          <div id="waitlist">
            <Waitlist />
          </div>
          <div className="values" aria-label="Bön, gemenskap och daglig rytm">
            <span>
              <Heart size={17} />
              Bön som bär
            </span>
            <span>
              <Users size={17} />
              Äkta gemenskap
            </span>
            <span>
              <Waves size={18} />
              Din dagliga rytm
            </span>
          </div>
        </section>
        <PhonePreview />
      </main>
      <footer className="site-footer">
        <span>
          Små steg. Varje dag. <span className="footer-soft">Tillsammans.</span>
        </span>
        <div>
          <span>© {new Date().getFullYear()} Koino</span>
          <button
            className="privacy-button"
            onClick={() => dialog.current?.showModal()}
          >
            Integritet
          </button>
          <a href="mailto:help@koinolabs.com">
            Kontakt <ArrowRight size={12} />
          </a>
        </div>
      </footer>
      <dialog
        ref={dialog}
        className="privacy-dialog"
        aria-labelledby="privacy-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <button
          className="dialog-close"
          aria-label="Stäng integritetsinformation"
          onClick={() => dialog.current?.close()}
        >
          <X size={22} />
        </button>
        <Sparkles size={24} />
        <h2 id="privacy-title">Din e-post är i trygga händer.</h2>
        <p>
          När du går med i väntelistan ber du Koino att meddela dig om appens
          lansering. Vi sparar din e-postadress, tidpunkten för anmälan och
          vilken version av den här informationen som visades.
        </p>
        <p>
          Uppgifterna används för väntelistan och lanseringsbesked. Vi säljer
          inte din adress. Vi använder inga analys- eller marknadsföringscookies
          på den här sidan.
        </p>
        <p>
          Du kan när som helst be oss ta bort din adress eller fråga om dina
          uppgifter genom att skriva till{" "}
          <a href="mailto:help@koinolabs.com">help@koinolabs.com</a>.
          Väntelistan raderas senast tre månader efter lanseringsbeskedet.
        </p>
        <p className="privacy-version">Koino · Version 2026-09-08</p>
      </dialog>
    </div>
  );
}
