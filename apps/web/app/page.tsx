"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock3,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Truck,
  Users,
  X,
} from "lucide-react";
import {
  demoPrompts,
  emptyPlan,
  type EventInfo,
  type EventSummary,
  type EventView,
  type Operation,
  type Proposal,
  type Risk,
  type Task,
  type Vendor,
  type Session,
} from "@event/shared";
import {
  api,
  ApiError,
  Badge,
  ChangeList,
  dateLabel,
  Modal,
  pretty,
} from "./ui";
import { CreateEvent, EditRecord, type EditorState } from "./editors";
import { registerWorkspaceTools, type ModelContext } from "./webmcp";

type User = { id: string; name: string; email: string };
type Tab = "overview" | "tasks" | "vendors" | "schedule" | "activity";
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "vendors", label: "Vendors", icon: Users },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className={`brand ${inverse ? "inverse" : ""}`}>
      <span className="brand-mark">
        <Sparkles size={21} />
      </span>
      <span>
        xperience<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function Auth({ onAuth }: { onAuth: (user: User) => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>(
        `/auth/${register ? "register" : "login"}`,
        "POST",
        {
          email: data.get("email"),
          password: data.get("password"),
          ...(register ? { name: data.get("name") } : {}),
        },
      );
      await onAuth(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand inverse />
        <div className="auth-story-content">
          <span className="eyebrow light">YOUR EVENT, CONNECTED</span>
          <h1>
            Less chasing.
            <br />
            More celebrating.
          </h1>
          <p>
            Bring your conversations, plans, and people into one clear view.
          </p>
          <div className="story-flow">
            <div>
              <MessageSquare size={19} />
              <span>Share the brief</span>
            </div>
            <ChevronRight size={16} />
            <div>
              <ShieldCheck size={19} />
              <span>Review the plan</span>
            </div>
            <ChevronRight size={16} />
            <div>
              <CircleCheck size={19} />
              <span>Make it happen</span>
            </div>
          </div>
          <div className="story-note">
            <span className="story-note-icon">
              <TriangleAlert size={20} />
            </span>
            <div>
              <strong>Stay a step ahead</strong>
              <p>
                Spot missing vendors, approaching deadlines, and capacity gaps
                while there’s time to act.
              </p>
            </div>
          </div>
        </div>
        <span className="auth-caption">
          Built for the people behind every great event.
        </span>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">EVENT MANAGER WORKSPACE</span>
          <h2>
            {register ? "Make room for your next event." : "Welcome back."}
          </h2>
          <p className="muted">
            {register
              ? "Create your account to start planning."
              : "Sign in and pick up where you left off."}
          </p>
          <form onSubmit={submit}>
            {register && (
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={10}
                maxLength={72}
                required
                placeholder={
                  register ? "At least 10 characters" : "Your password"
                }
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy ? <LoaderCircle className="spin" size={18} /> : null}
              {register ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-toggle">
            {register ? "Already have an account?" : "New to Xperience?"}{" "}
            <button
              className="text-button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Sign in" : "Create an account"}
            </button>
          </p>
          <div className="auth-assurance">
            <ShieldCheck size={17} />
            <span>Your events are private to your account.</span>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [initError, setInitError] = useState("");
  const [events, setEvents] = useState<EventSummary[]>([]),
    [event, setEvent] = useState<EventView | null>(null);
  const [liveAvailable, setLiveAvailable] = useState(false),
    [tab, setTab] = useState<Tab>("overview"),
    [mobilePane, setMobilePane] = useState<"dashboard" | "chat">("dashboard");
  const [creating, setCreating] = useState(false),
    [editor, setEditor] = useState<EditorState | null>(null),
    [reviewId, setReviewId] = useState<string | null>(null),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(""),
    [failedMessage, setFailedMessage] = useState("");
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const chatEnd = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const selection = useRef<string | null>(null);
  const agentState = useRef({ event, busy });
  agentState.current = { event, busy };
  const acceptRef = useRef<(next: EventView) => Promise<void>>(async () => {});
  async function loadEvents() {
    const data = await api<{ events: EventSummary[] }>("/events");
    setEvents(data.events);
    return data.events;
  }
  async function selectEvent(id: string) {
    selection.current = id;
    setBusy(true);
    setError("");
    setEditor(null);
    setReviewId(null);
    setSettingsOpen(false);
    setDraft("");
    setFailedMessage("");
    try {
      const result = await api<{ event: EventView }>(`/events/${id}`);
      if (selection.current !== id) return;
      setEvent(result.event);
      setTab("overview");
      setSearch("");
      setFilter("all");
      history.replaceState(null, "", `?event=${id}`);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  function handleError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      setUser(null);
      setEvent(null);
    }
    setError(e instanceof Error ? e.message : "Something went wrong.");
  }
  async function initialize() {
    setLoading(true);
    setInitError("");
    try {
      const config = await api<{ liveAvailable: boolean }>("/config");
      setLiveAvailable(config.liveAvailable);
      const auth = await api<{ user: User }>("/auth/me");
      setUser(auth.user);
      const all = await loadEvents();
      const requested = new URLSearchParams(location.search).get("event");
      if (requested && all.some((e) => e.id === requested))
        await selectEvent(requested);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setInitError(
          e instanceof Error ? e.message : "Could not connect to the server.",
        );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []); // Initialize this workspace once; all later requests are explicit user actions.
  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    return registerWorkspaceTools(
      context,
      () => agentState.current.event,
      async (text) => {
        const current = agentState.current;
        if (!current.event || current.busy)
          throw new Error(
            "Open an event and wait for the current request to finish.",
          );
        setBusy(true);
        try {
          const result = await api<{ event: EventView }>(
            `/events/${current.event.id}/messages`,
            "POST",
            { text },
          );
          await acceptRef.current(result.event);
          const message = result.event.messages.at(-1)!;
          setReviewId(message.proposalId || null);
          setMobilePane("chat");
          return {
            proposalId: message.proposalId || null,
            reply: message.text,
          };
        } finally {
          setBusy(false);
        }
      },
    );
  }, []);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [event?.messages.length, mobilePane]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function acceptView(next: EventView) {
    if (selection.current === next.id) setEvent(next);
    await loadEvents();
  }
  acceptRef.current = acceptView;
  async function create(info: EventInfo, mode: "demo" | "live") {
    const data = await api<{ event: EventView }>("/events", "POST", {
      info,
      mode,
    });
    selection.current = data.event.id;
    setEvent(data.event);
    setTab("overview");
    setCreating(false);
    setDraft("");
    setFailedMessage("");
    setError("");
    history.replaceState(null, "", `?event=${data.event.id}`);
    await loadEvents();
  }
  async function sample(type: "wedding" | "corporate") {
    setBusy(true);
    setError("");
    try {
      const start = new Date();
      start.setUTCDate(start.getUTCDate() + 30);
      const info = emptyPlan({
        title:
          type === "wedding"
            ? "Aarav & Meera · Wedding"
            : "Northstar · Team Retreat",
        type,
        location: type === "wedding" ? "Jaipur" : "Lonavala",
        startDate: start.toISOString().slice(0, 10),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }).info;
      const created = await api<{ event: EventView }>("/events", "POST", {
        info,
        mode: "demo",
      });
      selection.current = created.event.id;
      setEvent(created.event);
      history.replaceState(null, "", `?event=${created.event.id}`);
      const data = await api<{ event: EventView }>(
        `/events/${created.event.id}/messages`,
        "POST",
        { text: demoPrompts[type][0] },
      );
      await acceptView(data.event);
      setTab("overview");
      setMobilePane("chat");
      setReviewId(data.event.proposals.at(-1)?.id || null);
    } catch (e) {
      handleError(e);
      await loadEvents().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  async function save(operations: Operation[], revision: number) {
    if (!event) return;
    const result = await api<{ event: EventView }>(
      `/events/${event.id}`,
      "PATCH",
      { operations, revision },
    );
    await acceptView(result.event);
    setEditor(null);
    setNotice("Changes saved. Risks and deadlines are up to date.");
  }
  async function quickSave(operations: Operation[]) {
    if (!event) return;
    setBusy(true);
    setError("");
    try {
      await save(operations, event.revision);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function send(text = draft) {
    if (!event || !text.trim() || busy) return;
    const id = event.id;
    setBusy(true);
    setError("");
    setFailedMessage("");
    setDraft("");
    try {
      const data = await api<{ event: EventView }>(
        `/events/${id}/messages`,
        "POST",
        { text: text.trim() },
      );
      await acceptView(data.event);
    } catch (e) {
      handleError(e);
      setFailedMessage(text);
      setDraft(text);
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }
  async function decide(proposal: Proposal, decision: "approve" | "reject") {
    if (!event) return;
    setBusy(true);
    setError("");
    try {
      const data = await api<{ event: EventView }>(
        `/events/${event.id}/proposals/${proposal.id}/${decision}`,
        "POST",
      );
      await acceptView(data.event);
      setReviewId(null);
      setNotice(
        decision === "approve"
          ? "Proposal applied. Your dashboard is up to date."
          : "Proposal rejected. Your plan is unchanged.",
      );
      return true;
    } catch (e) {
      handleError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function revise(proposal: Proposal) {
    if (await decide(proposal, "reject")) {
      setMobilePane("chat");
      setDraft(
        `Please revise the proposal “${proposal.changes[0]?.label || "event changes"}”: `,
      );
      setTimeout(() => composer.current?.focus(), 0);
    }
  }
  function edit(kind: EditorState["kind"], record?: Task | Vendor | Session) {
    if (event) setEditor({ kind, record, snapshot: event });
  }
  function backToEvents() {
    selection.current = null;
    setEvent(null);
    setError("");
    history.replaceState(null, "", "/");
  }
  async function signOut() {
    try {
      await api("/auth/logout", "POST");
      backToEvents();
      setUser(null);
      setEvents([]);
      setDraft("");
      setNotice("");
      setReviewId(null);
    } catch (e) {
      handleError(e);
    }
  }
  const proposal = event?.proposals.find((p) => p.id === reviewId);
  const plan = event?.plan;
  const done = plan?.tasks.filter((t) => t.status === "done").length || 0;
  const confirmed =
    plan?.vendors.filter((v) => v.status === "confirmed").length || 0;
  const highRisks =
    event?.risks.filter((r) => r.severity === "high").length || 0;
  const pending = event?.proposals.filter((p) => p.status === "pending") || [];
  const upcoming =
    plan?.tasks
      .filter((t) => t.status !== "done" && t.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      .slice(0, 5) || [];
  if (loading)
    return (
      <div className="loading-page">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Opening your workspace…</p>
      </div>
    );
  if (initError)
    return (
      <div className="loading-page">
        <Brand />
        <p role="alert">{initError}</p>
        <button className="button primary" onClick={() => void initialize()}>
          <RefreshCw size={17} />
          Reconnect
        </button>
      </div>
    );
  if (!user)
    return (
      <Auth
        onAuth={async (next) => {
          setUser(next);
          await loadEvents();
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand-button"
          onClick={backToEvents}
          aria-label="All events"
        >
          <Brand inverse />
        </button>
        <div className="workspace-label">PLANNING WORKSPACE</div>
        <button
          className={`side-link ${!event ? "active" : ""}`}
          onClick={backToEvents}
        >
          <LayoutDashboard size={18} />
          All events<span>{events.length}</span>
        </button>
        <div className="side-section-heading">
          <span>YOUR EVENTS</span>
          <button
            className="icon-button"
            onClick={() => setCreating(true)}
            aria-label="Create event"
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="side-events">
          {events.map((e) => (
            <button
              className={`side-event ${event?.id === e.id ? "selected" : ""}`}
              key={e.id}
              disabled={busy}
              onClick={() => void selectEvent(e.id)}
            >
              <span className={`event-dot ${e.type}`} />
              <span>{e.title}</span>
            </button>
          ))}
          {!events.length && (
            <p className="side-empty">Your next great event starts here.</p>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <ShieldCheck size={18} />
            <span>
              You stay in control.
              <br />
              <small>AI changes require your approval.</small>
            </span>
          </div>
          <div className="profile">
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>Event manager</span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button onClick={backToEvents}>Events</button>
            {event && (
              <>
                <ChevronRight size={14} />
                <span>{event.plan.info.title}</span>
              </>
            )}
          </div>
          <div className="topbar-actions">
            <span className="private-label">
              <ShieldCheck size={14} />
              Private workspace
            </span>
            <button
              className="button secondary small"
              onClick={() => setCreating(true)}
              disabled={busy}
            >
              <Plus size={15} />
              New event
            </button>
            <button
              className="icon-button mobile-signout"
              aria-label="Sign out"
              onClick={() => void signOut()}
              disabled={busy}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {error && (
          <div role="alert" className="error-banner">
            <TriangleAlert size={18} />
            <span>{error}</span>
            {event && (
              <button
                className="text-button"
                onClick={() => void selectEvent(event.id)}
              >
                Refresh event
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => setError("")}
            >
              <X size={17} />
            </button>
          </div>
        )}
        {notice && (
          <div className="toast" role="status">
            <CircleCheck size={18} />
            {notice}
          </div>
        )}
        {!event || !plan ? (
          <main className="events-page">
            <div className="page-title">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h1>Every great event starts with a plan.</h1>
                <p className="muted">A clear home for all the moving parts.</p>
              </div>
              <button
                className="button primary"
                onClick={() => setCreating(true)}
              >
                <Plus size={18} />
                Create event
              </button>
            </div>
            {events.length > 0 && (
              <div className="event-grid">
                {events.map((e) => (
                  <button
                    className="event-card"
                    key={e.id}
                    disabled={busy}
                    onClick={() => void selectEvent(e.id)}
                  >
                    <div className="row between">
                      <span className={`event-type-icon ${e.type}`}>
                        {e.type === "wedding" ? (
                          <Sparkles size={23} />
                        ) : (
                          <Users size={23} />
                        )}
                      </span>
                      <Badge tone={e.mode === "demo" ? "amber" : "blue"}>
                        {e.mode === "demo" ? "Demo" : "Live AI"}
                      </Badge>
                    </div>
                    <h2>{e.title}</h2>
                    <p>
                      <CalendarDays size={16} />
                      {dateLabel(e.startDate, true)}
                    </p>
                    <div className="row between">
                      <span>
                        {e.guestCount || "—"} guests · {pretty(e.type)}
                      </span>
                      <ArrowRight size={18} />
                    </div>
                  </button>
                ))}
              </div>
            )}
            <section className="demo-section">
              <div className="row between">
                <div>
                  <h2>See a conversation become a plan</h2>
                  <p className="muted">
                    Try a fictional assessment scenario. Sample dates start 30
                    days from today.
                  </p>
                </div>
                <Badge tone="amber">No AI key needed</Badge>
              </div>
              <div className="demo-grid">
                <button
                  className="demo-card wedding"
                  disabled={busy}
                  onClick={() => void sample("wedding")}
                >
                  <span className="eyebrow">THE WEDDING</span>
                  <h3>
                    Three days. 400 guests.
                    <br />
                    One beautifully organized plan.
                  </h3>
                  <p>
                    Sangeet to Reception, with guest transfers, vendor changes,
                    and catering deadlines.
                  </p>
                  <span className="demo-cta">
                    Try wedding scenario <ArrowRight size={17} />
                  </span>
                </button>
                <button
                  className="demo-card corporate"
                  disabled={busy}
                  onClick={() => void sample("corporate")}
                >
                  <span className="eyebrow">THE TEAM RETREAT</span>
                  <h3>
                    Bring 200 people together.
                    <br />
                    Keep every detail connected.
                  </h3>
                  <p>
                    Coordinate the resort, leadership schedule, and a
                    last-minute transportation gap.
                  </p>
                  <span className="demo-cta">
                    Try corporate scenario <ArrowRight size={17} />
                  </span>
                </button>
              </div>
            </section>
          </main>
        ) : (
          <>
            <div className="mobile-switch">
              <button
                className={mobilePane === "dashboard" ? "active" : ""}
                onClick={() => setMobilePane("dashboard")}
              >
                <LayoutDashboard size={16} />
                Dashboard
              </button>
              <button
                className={mobilePane === "chat" ? "active" : ""}
                onClick={() => setMobilePane("chat")}
              >
                <Sparkles size={16} />
                Assistant{pending.length > 0 && <span>{pending.length}</span>}
              </button>
            </div>
            <div className={`event-layout show-${mobilePane}`}>
              <main className="dashboard">
                <div className="event-heading">
                  <div>
                    <div className="row">
                      <span className="eyebrow">
                        {pretty(plan.info.type)} PLANNING
                      </span>
                      <Badge tone={event.mode === "demo" ? "amber" : "blue"}>
                        {event.mode === "demo"
                          ? "Scripted demo"
                          : "Live Gemini"}
                      </Badge>
                    </div>
                    <h1>{plan.info.title}</h1>
                    <div className="event-meta">
                      <span>
                        <CalendarDays size={15} />
                        {dateLabel(plan.info.startDate, true)}
                        {plan.info.endDate &&
                          ` – ${dateLabel(plan.info.endDate, true)}`}
                      </span>
                      <span>
                        <MapPin size={15} />
                        {plan.info.location || "Location open"}
                      </span>
                      <span>
                        <Users size={15} />
                        {plan.info.guestCount || "—"} guests
                      </span>
                    </div>
                  </div>
                  <button
                    className="icon-button outlined"
                    aria-label="Event settings"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings2 size={19} />
                  </button>
                </div>
                <div className="stat-grid">
                  <div className="stat">
                    <span>
                      Tasks complete
                      <ListChecks size={17} />
                    </span>
                    <strong>
                      {done}
                      <small> / {plan.tasks.length}</small>
                    </strong>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${plan.tasks.length ? (done / plan.tasks.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="stat">
                    <span>
                      Vendors confirmed
                      <CheckCheck size={17} />
                    </span>
                    <strong>
                      {confirmed}
                      <small> / {plan.vendors.length}</small>
                    </strong>
                    <p>
                      {plan.vendors.length - confirmed} awaiting confirmation
                    </p>
                  </div>
                  <div className={`stat ${highRisks ? "stat-alert" : ""}`}>
                    <span>
                      Needs attention
                      <TriangleAlert size={17} />
                    </span>
                    <strong>
                      {highRisks}
                      <small> high priority</small>
                    </strong>
                    <p>
                      {event.risks.length} total planning{" "}
                      {event.risks.length === 1 ? "alert" : "alerts"}
                    </p>
                  </div>
                </div>
                <div className="tabs" role="tablist" aria-label="Event views">
                  {navigation.map(({ id, label, icon: Icon }, index) => (
                    <button
                      key={id}
                      id={`tab-${id}`}
                      role="tab"
                      aria-selected={tab === id}
                      aria-controls="event-panel"
                      tabIndex={tab === id ? 0 : -1}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(id)}
                      onKeyDown={(e) => {
                        if (
                          ["ArrowRight", "ArrowLeft", "Home", "End"].includes(
                            e.key,
                          )
                        ) {
                          e.preventDefault();
                          const i =
                            e.key === "Home"
                              ? 0
                              : e.key === "End"
                                ? navigation.length - 1
                                : (index +
                                    (e.key === "ArrowRight" ? 1 : -1) +
                                    navigation.length) %
                                  navigation.length;
                          setTab(navigation[i].id);
                          document
                            .getElementById(`tab-${navigation[i].id}`)
                            ?.focus();
                        }
                      }}
                    >
                      <Icon size={16} />
                      {label}
                      {id === "tasks" && <span>{plan.tasks.length}</span>}
                    </button>
                  ))}
                </div>
                <div
                  id="event-panel"
                  role="tabpanel"
                  aria-labelledby={`tab-${tab}`}
                  className="tab-panel"
                >
                  {tab === "overview" && (
                    <>
                      {pending.length > 0 && (
                        <div className="pending-banner">
                          <span className="pending-icon">
                            <Sparkles size={20} />
                          </span>
                          <div>
                            <strong>
                              {pending.length}{" "}
                              {pending.length === 1
                                ? "proposal is"
                                : "proposals are"}{" "}
                              ready for review
                            </strong>
                            <p>Nothing changes until you approve.</p>
                          </div>
                          <button
                            className="button secondary small"
                            onClick={() => setReviewId(pending.at(-1)!.id)}
                          >
                            Review
                            <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                      {!plan.tasks.length && (
                        <div className="empty-plan">
                          <span className="empty-icon">
                            <Sparkles size={26} />
                          </span>
                          <h2>Let’s turn your brief into a plan.</h2>
                          <p>
                            Tell the assistant what you’re organizing, or start
                            with a suggested scenario. Review its proposed tasks
                            and sessions before applying them.
                          </p>
                          <button
                            className="button primary"
                            disabled={busy}
                            onClick={() => {
                              setMobilePane("chat");
                              composer.current?.focus();
                            }}
                          >
                            Start a conversation
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      )}
                      <div className="section-heading">
                        <h2>
                          <TriangleAlert size={18} />
                          On your radar
                        </h2>
                        <span className="muted">
                          {event.risks.length} alerts
                        </span>
                      </div>
                      <div className="risk-list">
                        {event.risks.slice(0, 4).map((r) => (
                          <RiskCard
                            risk={r}
                            key={r.id}
                            onAction={() => {
                              setDraft(
                                `Help me address this risk: ${r.title}. ${r.detail}`,
                              );
                              setMobilePane("chat");
                              composer.current?.focus();
                            }}
                          />
                        ))}
                        {!event.risks.length && (
                          <div className="empty-inline">
                            <CircleCheck size={22} />
                            <span>
                              No current planning alerts. Keep your plan updated
                              as details change.
                            </span>
                          </div>
                        )}
                        {event.risks.length > 4 && (
                          <details className="more-risks">
                            <summary>
                              Show {event.risks.length - 4} more alerts
                            </summary>
                            {event.risks.slice(4).map((r) => (
                              <RiskCard
                                key={r.id}
                                risk={r}
                                onAction={() => {
                                  setDraft(
                                    `Help me address: ${r.title}. ${r.detail}`,
                                  );
                                  setMobilePane("chat");
                                }}
                              />
                            ))}
                          </details>
                        )}
                      </div>
                      <div className="overview-columns">
                        <section className="panel">
                          <div className="section-heading">
                            <h2>
                              <Clock3 size={18} />
                              Upcoming deadlines
                            </h2>
                            <button
                              className="text-button"
                              onClick={() => setTab("tasks")}
                            >
                              View tasks
                            </button>
                          </div>
                          {upcoming.length ? (
                            upcoming.map((t) => (
                              <button
                                className="deadline-row"
                                key={t.id}
                                onClick={() => edit("task", t)}
                              >
                                <span className="deadline-date">
                                  {dateLabel(t.dueDate, true)}
                                </span>
                                <div>
                                  <strong>{t.title}</strong>
                                  <span>{t.assignee || "Unassigned"}</span>
                                </div>
                                <ChevronRight size={15} />
                              </button>
                            ))
                          ) : (
                            <div className="empty-inline">
                              <Clock3 size={20} />
                              <span>
                                No dated tasks yet. Set a due date or a relative
                                deadline.
                              </span>
                            </div>
                          )}
                        </section>
                        <section className="panel">
                          <div className="section-heading">
                            <h2>
                              <CalendarDays size={18} />
                              Event sessions
                            </h2>
                            <button
                              className="text-button"
                              onClick={() => setTab("schedule")}
                            >
                              View all
                            </button>
                          </div>
                          {plan.sessions.slice(0, 4).map((s, i) => (
                            <button
                              className="session-mini"
                              key={s.id}
                              onClick={() => edit("session", s)}
                            >
                              <span className="session-number">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <div>
                                <strong>{s.title}</strong>
                                <span>
                                  {dateLabel(s.date, true)}
                                  {s.time ? ` · ${s.time}` : ""}
                                </span>
                              </div>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                          {!plan.sessions.length && (
                            <div className="empty-inline">
                              Your sessions will appear here.
                            </div>
                          )}
                        </section>
                      </div>
                    </>
                  )}
                  {tab === "tasks" && (
                    <>
                      <div className="list-toolbar">
                        <div>
                          <h2>Make the next move clear.</h2>
                          <p className="muted">
                            {plan.tasks.length - done} open tasks · {done}{" "}
                            completed
                          </p>
                        </div>
                        <button
                          className="button primary small"
                          onClick={() => edit("task")}
                        >
                          <Plus size={16} />
                          Add task
                        </button>
                      </div>
                      <div className="filter-row">
                        <input
                          className="search-input"
                          aria-label="Search tasks"
                          placeholder="Search tasks or assignees…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                        <select
                          aria-label="Filter tasks"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">All tasks</option>
                          <option value="todo">To do</option>
                          <option value="in_progress">In progress</option>
                          <option value="done">Done</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </div>
                      <div className="tasks-list">
                        {plan.tasks
                          .filter(
                            (t) =>
                              (filter === "all" || filter === "blocked"
                                ? filter !== "blocked" ||
                                  (t.status !== "done" &&
                                    t.dependencies.some(
                                      (id) =>
                                        plan.tasks.find((d) => d.id === id)
                                          ?.status !== "done",
                                    ))
                                : t.status === filter) &&
                              `${t.title} ${t.assignee}`
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                          )
                          .map((t) => {
                            const blocked =
                              t.status !== "done" &&
                              t.dependencies.some(
                                (id) =>
                                  plan.tasks.find((d) => d.id === id)
                                    ?.status !== "done",
                              );
                            return (
                              <article
                                className={`task-row ${t.status === "done" ? "completed" : ""}`}
                                key={t.id}
                              >
                                <button
                                  className="task-check"
                                  disabled={busy}
                                  aria-label={`${t.status === "done" ? "Reopen" : "Complete"} ${t.title}`}
                                  onClick={() =>
                                    void quickSave([
                                      {
                                        entity: "task",
                                        action: "upsert",
                                        data: {
                                          ...t,
                                          status:
                                            t.status === "done"
                                              ? "todo"
                                              : "done",
                                        },
                                        reason: "Updated task status.",
                                      },
                                    ])
                                  }
                                >
                                  {t.status === "done" ? (
                                    <CircleCheck size={23} />
                                  ) : (
                                    <Circle size={23} />
                                  )}
                                </button>
                                <button
                                  className="task-info"
                                  onClick={() => edit("task", t)}
                                >
                                  <strong>{t.title}</strong>
                                  <span>
                                    {t.assignee || "Unassigned"}
                                    {t.dueDate
                                      ? ` · ${dateLabel(t.dueDate, true)}`
                                      : " · No due date"}
                                    {t.deadlineRule
                                      ? " · Relative deadline"
                                      : ""}
                                  </span>
                                </button>
                                <div className="task-badges">
                                  {blocked && (
                                    <Badge tone="amber">Blocked</Badge>
                                  )}
                                  <Badge
                                    tone={
                                      t.priority === "high"
                                        ? "danger"
                                        : "neutral"
                                    }
                                  >
                                    {pretty(t.priority)}
                                  </Badge>
                                  <Badge
                                    tone={
                                      t.status === "done" ? "green" : "blue"
                                    }
                                  >
                                    {pretty(t.status)}
                                  </Badge>
                                </div>
                                <button
                                  className="icon-button"
                                  aria-label={`Edit ${t.title}`}
                                  onClick={() => edit("task", t)}
                                >
                                  <MoreHorizontal size={19} />
                                </button>
                              </article>
                            );
                          })}
                        {!plan.tasks.length && (
                          <div className="empty-inline">
                            Add a task or ask the assistant to draft your plan.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {tab === "vendors" && (
                    <>
                      <div className="list-toolbar">
                        <div>
                          <h2>The people making it happen.</h2>
                          <p className="muted">
                            Confirm services, availability, and coverage.
                          </p>
                        </div>
                        <button
                          className="button primary small"
                          onClick={() => edit("vendor")}
                        >
                          <Plus size={16} />
                          Add vendor
                        </button>
                      </div>
                      <div className="vendor-grid">
                        {plan.vendors.map((v) => (
                          <button
                            key={v.id}
                            className="vendor-card"
                            onClick={() => edit("vendor", v)}
                          >
                            <div className="row between">
                              <span className="vendor-icon">
                                {v.service === "transport" ? (
                                  <Truck size={21} />
                                ) : (
                                  <Users size={21} />
                                )}
                              </span>
                              <Badge
                                tone={
                                  v.status === "confirmed"
                                    ? "green"
                                    : v.status === "unavailable"
                                      ? "danger"
                                      : "amber"
                                }
                              >
                                {pretty(v.status)}
                              </Badge>
                            </div>
                            <span className="eyebrow">{pretty(v.service)}</span>
                            <h3>{v.name}</h3>
                            <p>
                              {plan.sessions.find((s) => s.id === v.sessionId)
                                ?.title || "Entire event"}
                            </p>
                            {v.requiredCapacity !== null && (
                              <div
                                className={`capacity ${v.capacity !== null && v.capacity < v.requiredCapacity ? "shortfall" : ""}`}
                              >
                                <Users size={15} />
                                <strong>{v.capacity ?? "?"}</strong>
                                <span>/ {v.requiredCapacity} people</span>
                              </div>
                            )}
                            {v.notes && (
                              <p className="vendor-notes">{v.notes}</p>
                            )}
                            <span className="vendor-edit">
                              Manage vendor
                              <ChevronRight size={15} />
                            </span>
                          </button>
                        ))}
                      </div>
                      {!plan.vendors.length && (
                        <div className="empty-inline">
                          Vendor requirements will appear here after your plan
                          is approved.
                        </div>
                      )}
                    </>
                  )}
                  {tab === "schedule" && (
                    <>
                      <div className="list-toolbar">
                        <div>
                          <h2>A place for every moment.</h2>
                          <p className="muted">
                            All times in {plan.info.timezone}.
                          </p>
                        </div>
                        <button
                          className="button primary small"
                          onClick={() => edit("session")}
                        >
                          <Plus size={16} />
                          Add session
                        </button>
                      </div>
                      <div className="timeline">
                        {[...plan.sessions]
                          .sort(
                            (a, b) =>
                              (a.date || "9999").localeCompare(
                                b.date || "9999",
                              ) ||
                              (a.time || "99").localeCompare(b.time || "99"),
                          )
                          .map((s) => (
                            <button
                              className="timeline-row"
                              key={s.id}
                              onClick={() => edit("session", s)}
                            >
                              <div className="timeline-date">
                                <strong>{dateLabel(s.date, true)}</strong>
                                <span>{s.time || "Time open"}</span>
                              </div>
                              <div className="timeline-node" />
                              <div className="timeline-card">
                                <h3>{s.title}</h3>
                                <span>
                                  <MapPin size={14} />
                                  {s.location || "Location to be confirmed"}
                                </span>
                                {s.notes && <p>{s.notes}</p>}
                              </div>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                      </div>
                      {!plan.sessions.length && (
                        <div className="empty-inline">
                          Add sessions to build your event schedule.
                        </div>
                      )}
                    </>
                  )}
                  {tab === "activity" && (
                    <>
                      <div className="list-toolbar">
                        <div>
                          <h2>A clear record of every change.</h2>
                          <p className="muted">
                            Event revision {event.revision} · Latest 200 updates
                            retained
                          </p>
                        </div>
                        <button
                          className="button secondary small"
                          disabled={busy}
                          onClick={() => void selectEvent(event.id)}
                        >
                          <RefreshCw size={15} />
                          Refresh
                        </button>
                      </div>
                      <div className="activity-list">
                        {[...event.history].reverse().map((a) => (
                          <details className="activity-item" key={a.id}>
                            <summary>
                              <span className="activity-icon">
                                <Check size={17} />
                              </span>
                              <div>
                                <strong>{a.title}</strong>
                                <span>
                                  {new Date(a.createdAt).toLocaleString()} ·
                                  Revision {a.revision} · {a.changes.length}{" "}
                                  changes
                                </span>
                              </div>
                              <ChevronRight size={17} />
                            </summary>
                            <ChangeList changes={a.changes} />
                          </details>
                        ))}
                        {!event.history.length && (
                          <div className="empty-inline">
                            Approved changes and manual edits will be recorded
                            here.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </main>
              <aside className="assistant-panel" aria-label="Event assistant">
                <div className="assistant-header">
                  <span className="assistant-avatar">
                    <Sparkles size={19} />
                  </span>
                  <div>
                    <h2>Your planning assistant</h2>
                    <span>
                      {event.mode === "demo"
                        ? "Scripted demo · no AI calls"
                        : "Powered by Gemini"}
                    </span>
                  </div>
                </div>
                <div className="assistant-explainer">
                  <ShieldCheck size={16} />
                  <span>You review. You approve. Then we update.</span>
                </div>
                <div
                  className="chat-messages"
                  aria-live="polite"
                  aria-busy={busy}
                >
                  {!event.messages.length && (
                    <div className="chat-welcome">
                      <span className="empty-icon">
                        <Sparkles size={25} />
                      </span>
                      <h3>What are we planning?</h3>
                      <p>
                        Share the occasion, guest count, and what needs to
                        happen. I’ll help turn it into a plan you can review.
                      </p>
                    </div>
                  )}
                  {event.messages.map((m) => {
                    const p = event.proposals.find(
                      (p) => p.id === m.proposalId,
                    );
                    return (
                      <div className={`message ${m.role}`} key={m.id}>
                        <div className="message-label">
                          {m.role === "user" ? (
                            "You"
                          ) : (
                            <>
                              <Sparkles size={12} />
                              Xperience assistant
                            </>
                          )}
                        </div>
                        <div className="message-text">{m.text}</div>
                        {p && (
                          <div className="proposal-card">
                            <div className="row between">
                              <span>
                                <ListChecks size={17} />
                                <strong>
                                  {p.changes.length} proposed changes
                                </strong>
                              </span>
                              <Badge
                                tone={
                                  p.status === "approved"
                                    ? "green"
                                    : p.status === "rejected"
                                      ? "neutral"
                                      : "blue"
                                }
                              >
                                {p.status === "pending" &&
                                p.baseRevision !== event.revision
                                  ? "Outdated"
                                  : pretty(p.status)}
                              </Badge>
                            </div>
                            <ul>
                              {p.changes.slice(0, 3).map((c, i) => (
                                <li key={i}>{c.label}</li>
                              ))}
                            </ul>
                            {p.changes.length > 3 && (
                              <p className="muted">
                                +{p.changes.length - 3} more changes
                              </p>
                            )}
                            <button
                              className="button secondary full small"
                              onClick={() => setReviewId(p.id)}
                            >
                              {p.status === "pending"
                                ? "Review proposal"
                                : "View changes"}
                              <ArrowRight size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {busy && (
                    <div className="thinking">
                      <LoaderCircle size={15} className="spin" />
                      Working on your request…
                    </div>
                  )}
                  <div ref={chatEnd} />
                </div>
                {event.mode === "demo" && (
                  <div className="scenario-prompts">
                    <details open={!event.messages.length}>
                      <summary>
                        Try a scenario update <ArrowDown size={13} />
                      </summary>
                      <p>
                        Scripted prompts only. Use direct edits for other
                        changes.
                      </p>
                      <div>
                        {demoPrompts[
                          plan.info.type === "corporate"
                            ? "corporate"
                            : "wedding"
                        ].map((prompt, i) => (
                          <button
                            key={prompt}
                            disabled={busy}
                            onClick={() => void send(prompt)}
                          >
                            <span>{i + 1}</span>
                            {prompt}
                            <ChevronRight size={13} />
                          </button>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  {failedMessage && (
                    <button
                      type="button"
                      className="retry-message"
                      disabled={busy}
                      onClick={() => void send(failedMessage)}
                    >
                      <RefreshCw size={13} />
                      Retry failed message
                    </button>
                  )}
                  <div className="composer-box">
                    <textarea
                      ref={composer}
                      aria-label="Message your planning assistant"
                      placeholder={
                        event.mode === "demo"
                          ? "Choose a scenario prompt above…"
                          : "Share a brief, update, or question…"
                      }
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={6000}
                      rows={3}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !e.shiftKey &&
                          !e.nativeEvent.isComposing
                        ) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <div>
                      <span>
                        {event.mode === "demo"
                          ? "DEMO MODE"
                          : "REVIEW BEFORE APPLY"}
                      </span>
                      <button
                        className="send-button"
                        aria-label="Send message"
                        disabled={busy || !draft.trim()}
                      >
                        <Send size={17} />
                      </button>
                    </div>
                  </div>
                  <p>
                    AI can make mistakes. Check dates, details, and changes.
                  </p>
                </form>
              </aside>
            </div>
          </>
        )}
      </div>
      {creating && (
        <CreateEvent
          liveAvailable={liveAvailable}
          onClose={() => setCreating(false)}
          onCreate={create}
        />
      )}
      {editor && (
        <EditRecord
          editor={editor}
          onClose={() => setEditor(null)}
          onSave={save}
        />
      )}
      {proposal && event && (
        <Modal
          title="Review proposed changes"
          description={`${proposal.changes.length} changes · Based on event revision ${proposal.baseRevision}`}
          onClose={() => !busy && setReviewId(null)}
          wide
        >
          <div className="review-body">
            {proposal.status === "pending" &&
              proposal.baseRevision !== event.revision && (
                <p className="form-error">
                  This proposal is outdated. Reject it and request a new
                  proposal using the current event plan.
                </p>
              )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <ChangeList changes={proposal.changes} />
          </div>
          <div className="modal-footer">
            {proposal.status === "pending" ? (
              <>
                <button
                  className="button secondary push-right"
                  disabled={busy}
                  onClick={() => void decide(proposal, "reject")}
                >
                  Reject
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void revise(proposal)}
                >
                  Request revision
                </button>
                <button
                  className="button primary"
                  disabled={busy || proposal.baseRevision !== event.revision}
                  onClick={() => void decide(proposal, "approve")}
                >
                  <Check size={17} />
                  {busy ? "Applying…" : "Approve & apply"}
                </button>
              </>
            ) : (
              <>
                <Badge
                  tone={proposal.status === "approved" ? "green" : "neutral"}
                >
                  {pretty(proposal.status)}
                </Badge>
                <button
                  className="button secondary"
                  onClick={() => setReviewId(null)}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
      {settingsOpen && event && (
        <Modal title="Event settings" onClose={() => setSettingsOpen(false)}>
          <div className="settings-body">
            <button
              className="settings-row"
              onClick={() => {
                setSettingsOpen(false);
                edit("event");
              }}
            >
              <CalendarDays size={20} />
              <div>
                <strong>Edit event details</strong>
                <span>Guests, location, dates, and timezone</span>
              </div>
              <ChevronRight size={17} />
            </button>
            <label>
              Assistant mode
              <select
                value={event.mode}
                disabled={busy}
                onChange={async (e) => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api<{ event: EventView }>(
                      `/events/${event.id}/mode`,
                      "PATCH",
                      { mode: e.target.value, revision: event.revision },
                    );
                    await acceptView(result.event);
                    setSettingsOpen(false);
                  } catch (e) {
                    handleError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <option value="demo">Scripted demo</option>
                <option value="live" disabled={!liveAvailable}>
                  Live Gemini
                  {!liveAvailable ? " — server API key required" : ""}
                </option>
              </select>
            </label>
            <p className="muted">
              Switching modes keeps your plan and conversation. Live requests
              never silently switch to demo responses.
            </p>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button
              className="button danger-button"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    `Delete “${event.plan.info.title}” and its entire history? This cannot be undone.`,
                  )
                )
                  return;
                setBusy(true);
                try {
                  await api(`/events/${event.id}`, "DELETE");
                  setSettingsOpen(false);
                  backToEvents();
                  await loadEvents();
                } catch (e) {
                  handleError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete event
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function RiskCard({ risk, onAction }: { risk: Risk; onAction: () => void }) {
  return (
    <article className={`risk-card ${risk.severity}`}>
      <span className="risk-symbol">
        <TriangleAlert size={18} />
      </span>
      <div>
        <div className="row">
          <h3>{risk.title}</h3>
          <Badge tone={risk.severity === "high" ? "danger" : "amber"}>
            {risk.severity === "high" ? "High priority" : "Follow up"}
          </Badge>
        </div>
        <p>{risk.detail}</p>
        <span className="risk-action">{risk.action}</span>
      </div>
      <button
        className="icon-button"
        title="Discuss this risk with the assistant"
        aria-label={`Discuss ${risk.title}`}
        onClick={onAction}
      >
        <ArrowRight size={17} />
      </button>
    </article>
  );
}
