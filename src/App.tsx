import { Show, SignInButton, SignUpButton, useAuth, UserButton } from "@clerk/react";
import { useEffect } from "react";
import { ApiPage } from "./ApiPage";
import { ChatConsole } from "./ChatConsole";
import { DashboardPage } from "./DashboardPage";
import { KnowledgePage } from "./KnowledgePage";
import { SupportPage } from "./SupportPage";
import { hrefFor, navigate, type Route, useRoute } from "./useRoute";
import "./index.css";

const whatsappSupportUrl = "https://wa.me/5511984952410?text=Hello%20Swarm%20Support";

export function App() {
  const route = useRoute();
  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && route !== "landing") {
      navigate("landing", { replace: true });
    }
  }, [isLoaded, isSignedIn, route]);

  if (route === "landing") {
    return (
      <div className="relative z-10 min-h-screen flex flex-col">
        <SignedOutHero isSignedIn={isSignedIn === true} />
      </div>
    );
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <Show when="signed-out">
        <SignedOutHero isSignedIn={false} />
      </Show>
      <Show when="signed-in">
        <SignedInShell route={route} />
      </Show>
    </div>
  );
}

function SignedInShell({ route }: { route: Route }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Masthead route={route} />
      <main className="flex-1 flex flex-col">
        {route === "console" ? <ChatConsole /> : null}
        {route === "support" ? <SupportPage /> : null}
        {route === "dashboard" ? <DashboardPage /> : null}
        {route === "knowledge" ? <KnowledgePage /> : null}
        {route === "api" ? <ApiPage /> : null}
      </main>
    </div>
  );
}

function Masthead({ route }: { route: Route }) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-4 flex items-center justify-between gap-6">
        <a
          href={hrefFor("console")}
          onClick={(e) => {
            e.preventDefault();
            navigate("console");
          }}
          className="flex items-center gap-3 group"
        >
          <span className="ornament text-3xl leading-none">❦</span>
          <div className="leading-tight">
            <div className="kicker">CloudWalk · Agent Swarm</div>
            <div className="display-tight text-lg group-hover:text-paper transition-colors">
              The Swarm Review
            </div>
          </div>
        </a>
        <nav className="hidden md:flex items-center gap-7">
          <NavLink route="console" current={route}>
            Console
          </NavLink>
          <NavLink route="support" current={route}>
            Support
          </NavLink>
          <NavLink route="dashboard" current={route}>
            Dashboard
          </NavLink>
          <NavLink route="knowledge" current={route}>
            Knowledge
          </NavLink>
          <NavLink route="api" current={route}>
            API
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          <span className="pill pill-moss hidden sm:inline-flex">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--color-moss)" }}
            />
            Live
          </span>
          <a
            href={whatsappSupportUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="btn-ghost px-3 py-2 text-xs uppercase tracking-[0.15em] rounded hidden sm:inline-flex"
          >
            WhatsApp
          </a>
          <UserButton />
        </div>
      </div>
    </header>
  );
}

function NavLink({
  route,
  current,
  children,
}: {
  route: Route;
  current: Route;
  children: React.ReactNode;
}) {
  const active = route === current;
  return (
    <a
      href={hrefFor(route)}
      onClick={(e) => {
        e.preventDefault();
        navigate(route);
      }}
      className={`smallcaps text-[0.95rem] tracking-[0.12em] hover:text-paper transition-colors ${
        active ? "text-paper" : "text-paper-dim"
      }`}
    >
      {children}
      {active ? (
        <span
          className="block h-px mt-1"
          style={{ background: "var(--color-ember)" }}
          aria-hidden
        />
      ) : null}
    </a>
  );
}

function SignedOutHero({ isSignedIn }: { isSignedIn: boolean }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="ornament text-3xl leading-none">❦</span>
            <div className="leading-tight">
              <div className="kicker">Vol. III · Established 2026</div>
              <div className="display-tight text-xl">The Swarm Review</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={whatsappSupportUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="btn-ghost px-4 py-2 text-xs hidden sm:inline-flex"
            >
              WhatsApp
            </a>
            {isSignedIn ? (
              <button
                type="button"
                onClick={() => navigate("console")}
                className="btn-ember px-4 py-2 text-xs uppercase tracking-[0.18em]"
              >
                Open console
              </button>
            ) : (
              <>
                <SignInButton mode="modal">
                  <button type="button" className="btn-ghost px-4 py-2 text-xs">
                    Sign in
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button
                    type="button"
                    className="btn-ember px-4 py-2 text-xs uppercase tracking-[0.18em]"
                  >
                    Subscribe
                  </button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-8">
              <div className="kicker anim-fade">Edition · No. 0001 · The masthead issue</div>
              <h1 className="display text-[clamp(3rem,8vw,7.5rem)] mt-4 anim-rise">
                A daily,
                <br />
                <span className="italic" style={{ color: "var(--color-ember)" }}>
                  argued
                </span>{" "}
                by agents.
              </h1>
              <p className="article-prose text-paper-dim mt-7 max-w-[52ch] anim-rise stagger-1">
                The Swarm Review is an authenticated console for InfinitePay&rsquo;s multi-agent
                assistant. A Router decides who answers; a Knowledge agent reads InfinitePay sources
                and the open web; a Customer Support agent inspects the books. Every reply is filed
                with its byline, its route, and its citations.
              </p>
              <div className="mt-9 flex flex-wrap gap-3 anim-rise stagger-2">
                {isSignedIn ? (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate("console")}
                      className="btn-ember px-6 py-3 text-xs uppercase tracking-[0.18em]"
                    >
                      Open console
                    </button>
                    <a
                      href={whatsappSupportUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn-ghost px-6 py-3 text-xs uppercase tracking-[0.18em]"
                    >
                      Open WhatsApp
                    </a>
                  </>
                ) : (
                  <>
                    <SignUpButton mode="modal">
                      <button
                        type="button"
                        className="btn-ember px-6 py-3 text-xs uppercase tracking-[0.18em]"
                      >
                        Begin reading
                      </button>
                    </SignUpButton>
                    <SignInButton mode="modal">
                      <button type="button" className="btn-ghost px-6 py-3 text-xs">
                        I&rsquo;m a returning subscriber
                      </button>
                    </SignInButton>
                    <a
                      href={whatsappSupportUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="btn-ghost px-6 py-3 text-xs uppercase tracking-[0.18em]"
                    >
                      Try WhatsApp
                    </a>
                  </>
                )}
              </div>
            </div>

            <aside className="lg:col-span-4 border-l border-rule pl-8 anim-rise stagger-3">
              <div className="kicker">From the colophon</div>
              <p className="serif text-base mt-3 leading-relaxed text-paper-dim">
                Built on Bun, Postgres &amp; pgvector, the Vercel AI SDK, Clerk, and a deliberate
                refusal of generic chat aesthetics.
              </p>
              <hr className="my-6" />
              <dl className="grid grid-cols-2 gap-y-5 gap-x-3 text-sm">
                <Stat label="Agents" value="03" />
                <Stat label="Tools" value="07" />
                <Stat label="Sources" value="17" />
                <Stat label="Channels" value="WEB" />
              </dl>
            </aside>
          </div>
        </section>

        <section className="border-b border-rule">
          <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-14 grid grid-cols-1 md:grid-cols-3 gap-px bg-rule border border-rule">
            <Feature
              num="I"
              title="The Router decides"
              body="A typed route plan with category, confidence, and the agents to call — never free-form JSON."
            />
            <Feature
              num="II"
              title="Knowledge, grounded"
              body="Retrieval-augmented answers from InfinitePay pages with pgvector, plus a web tool for current events."
            />
            <Feature
              num="III"
              title="Support, with receipts"
              body="Profile, recent transactions, open tickets — and an unambiguous human handoff when warranted."
            />
          </div>
        </section>

        <section>
          <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-14 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="kicker">Featured dispatch · Specimen</div>
              <blockquote className="display text-[clamp(1.75rem,3.4vw,2.75rem)] mt-3 leading-[1.05]">
                <span style={{ color: "var(--color-ember)" }}>&ldquo;</span>
                Maquininha Smart at 12&times; with no monthly fee, debit at 1.37%, credit from 2.69%
                — filed by the Knowledge desk in 1.2 seconds.
                <span style={{ color: "var(--color-ember)" }}>&rdquo;</span>
              </blockquote>
              <div className="kicker mt-4">— specimen response, Knowledge Agent</div>
            </div>
            <div className="border border-rule p-8 bg-ink-2/40">
              <div className="kicker">Issue No. 0042 · A worked example</div>
              <pre className="font-mono text-[11px] leading-relaxed text-paper-dim mt-4 overflow-x-auto whitespace-pre-wrap">
                {`POST /api/swarm
{
  "message": "What are the fees of the Maquininha Smart?"
}

→ route.category   = "knowledge"
→ selectedAgents   = ["knowledge"]
→ requiredTools    = ["retrieveKnowledge"]
→ confidence       = 0.94
→ sources          = [
     "https://www.infinitepay.io/maquininha"
  ]
→ handoffRequired  = false`}
              </pre>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-6 flex flex-col sm:flex-row items-baseline justify-between gap-3">
          <div className="kicker">© CloudWalk · A coding challenge, set in print</div>
          <div className="kicker text-paper-mute">All routes typed. All sources kept.</div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="kicker">{label}</dt>
      <dd className="figure-num text-3xl mt-1">{value}</dd>
    </div>
  );
}

function Feature({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="bg-ink p-8">
      <div className="figure-num text-5xl">{num}</div>
      <h3 className="display-tight text-2xl mt-3">{title}</h3>
      <p className="serif text-base mt-3 text-paper-dim leading-relaxed">{body}</p>
    </div>
  );
}

export default App;
