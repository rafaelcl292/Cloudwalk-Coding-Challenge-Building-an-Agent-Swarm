import { useEffect, useState } from "react";
import { PageHeader } from "./PageHeader";
import { useAuthedFetch } from "./useAuthedFetch";

type AccountStatus = "active" | "blocked" | "review" | "closed";
type ProblemKind =
  | "blocked_account"
  | "password_reset"
  | "payout_failed"
  | "payment_declined"
  | "kyc_review";

type SupportProfile = {
  name: string;
  email: string | null;
  accountStatus: AccountStatus;
  plan: string;
  limits: SupportLimits | string | null;
  supportFlags: string[];
  updatedAt: string;
};

type SupportLimits = {
  dailyPayoutCents?: number;
  monthlyVolumeCents?: number;
  availableBalanceCents?: number;
  pendingBalanceCents?: number;
  reservedBalanceCents?: number;
  lastPayoutCents?: number;
};

type FormState = {
  name: string;
  email: string;
  accountStatus: AccountStatus;
  plan: string;
  dailyPayoutCents: string;
  monthlyVolumeCents: string;
  availableBalanceCents: string;
  pendingBalanceCents: string;
  reservedBalanceCents: string;
  lastPayoutCents: string;
};

type ApiError = {
  error: { message: string };
};

const problemTemplates: Array<{
  kind: ProblemKind;
  title: string;
  description: string;
  prompt: string;
}> = [
  {
    kind: "blocked_account",
    title: "Blocked account",
    description:
      "Marks the account as blocked, creates a failed payout, and opens an urgent ticket.",
    prompt: "My account was blocked and I need to make a transfer now.",
  },
  {
    kind: "password_reset",
    title: "Password reset",
    description: "Creates an account recovery ticket so the agent can guide the user.",
    prompt: "I cannot sign in to my account. Can you help me reset my password?",
  },
  {
    kind: "payout_failed",
    title: "Failed payout",
    description: "Moves the account into review and records a recent payout failure.",
    prompt: "Why did my payout fail today?",
  },
  {
    kind: "payment_declined",
    title: "Declined payment",
    description: "Records a declined transaction so the agent can explain next steps.",
    prompt: "My customer tried to pay by card and it was declined. What happened?",
  },
  {
    kind: "kyc_review",
    title: "Pending KYC",
    description: "Simulates an identity review and triggers human handoff when needed.",
    prompt: "My identity verification is pending. Can I keep selling?",
  },
];

export function SupportPage() {
  const authedFetch = useAuthedFetch();
  const [profile, setProfile] = useState<SupportProfile | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await authedFetch("/api/me/support-profile");
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      setForm(data.profile ? formFromProfile(data.profile) : emptyForm);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfile();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await authedFetch("/api/me/support-profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email.trim() || null,
          accountStatus: form.accountStatus,
          plan: form.plan,
          dailyPayoutCents: centsFromInput(form.dailyPayoutCents),
          monthlyVolumeCents: centsFromInput(form.monthlyVolumeCents),
          availableBalanceCents: centsFromInput(form.availableBalanceCents),
          pendingBalanceCents: centsFromInput(form.pendingBalanceCents),
          reservedBalanceCents: centsFromInput(form.reservedBalanceCents),
          lastPayoutCents: centsFromInput(form.lastPayoutCents),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      if (data.profile) setForm(formFromProfile(data.profile));
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const createProblem = async (kind: ProblemKind) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await authedFetch("/api/me/support-problems", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as ApiError | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      if (data.profile) setForm(formFromProfile(data.profile));
      setMessage("Issue created. Open the console and use the suggested prompt.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to create issue.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] px-6 sm:px-10 lg:px-14 py-10">
      <PageHeader
        kicker="Section · Support lab"
        title="Customer State"
        lede="Edit the support data attached to your Clerk session and create demo problems for the Support Agent."
      />

      {loadError ? <ErrorPanel message={loadError} /> : null}

      {!loadError ? (
        <div className="mt-10 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-px bg-rule border border-rule">
          <section className="bg-ink p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="kicker">Profile</div>
                <h2 className="display-tight text-3xl mt-2">Support identity</h2>
              </div>
              {profile ? <StatusPill status={profile.accountStatus} /> : null}
            </div>

            {loading ? (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-20 bg-ink-3/70" />
                ))}
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Name">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Account status">
                  <select
                    value={form.accountStatus}
                    onChange={(e) =>
                      setForm({ ...form, accountStatus: e.target.value as AccountStatus })
                    }
                    className="support-input"
                  >
                    <option value="active">Active</option>
                    <option value="review">Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
                <Field label="Plan">
                  <input
                    value={form.plan}
                    onChange={(e) => setForm({ ...form, plan: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Daily payout limit">
                  <input
                    inputMode="decimal"
                    value={form.dailyPayoutCents}
                    onChange={(e) => setForm({ ...form, dailyPayoutCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Monthly volume">
                  <input
                    inputMode="decimal"
                    value={form.monthlyVolumeCents}
                    onChange={(e) => setForm({ ...form, monthlyVolumeCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Available balance">
                  <input
                    inputMode="decimal"
                    value={form.availableBalanceCents}
                    onChange={(e) => setForm({ ...form, availableBalanceCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Pending balance">
                  <input
                    inputMode="decimal"
                    value={form.pendingBalanceCents}
                    onChange={(e) => setForm({ ...form, pendingBalanceCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Reserved balance">
                  <input
                    inputMode="decimal"
                    value={form.reservedBalanceCents}
                    onChange={(e) => setForm({ ...form, reservedBalanceCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
                <Field label="Last payout">
                  <input
                    inputMode="decimal"
                    value={form.lastPayoutCents}
                    onChange={(e) => setForm({ ...form, lastPayoutCents: e.target.value })}
                    className="support-input"
                  />
                </Field>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={save}
                disabled={saving || loading}
                className="btn-ember px-5 py-2.5 text-xs uppercase tracking-[0.15em] rounded"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
              {message ? (
                <span className="font-mono text-[11px] text-paper-mute">{message}</span>
              ) : null}
            </div>

            {profile?.supportFlags.length ? (
              <div className="mt-8">
                <div className="kicker">Current flags</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {profile.supportFlags.map((flag) => (
                    <span key={flag} className="pill pill-gold">
                      {flag.replaceAll("_", " ")}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <aside className="bg-ink p-6 lg:p-8">
            <div className="kicker">Problem factory</div>
            <h2 className="display-tight text-3xl mt-2">Demo issues</h2>
            <div className="mt-6 space-y-3">
              {problemTemplates.map((template) => (
                <div key={template.kind} className="border border-rule p-4 bg-ink-2/50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="serif text-lg leading-tight">{template.title}</h3>
                      <p className="text-[13px] leading-relaxed text-paper-dim mt-1">
                        {template.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => createProblem(template.kind)}
                      disabled={saving || loading}
                      className="btn-ghost px-3 py-1.5 text-xs shrink-0"
                    >
                      Create
                    </button>
                  </div>
                  <p className="font-mono text-[11px] leading-relaxed text-paper-mute mt-3">
                    {template.prompt}
                  </p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="mt-10 border border-ember/40 bg-ember/5 p-6 max-w-2xl">
      <div
        className="font-mono text-[11px] uppercase tracking-[0.18em]"
        style={{ color: "var(--color-ember)" }}
      >
        Support profile unavailable
      </div>
      <p className="serif text-base mt-2">{message}</p>
      <p className="text-[12px] mt-3 text-paper-mute">
        If this is your first local run, ensure Postgres is up and migrations are applied:{" "}
        <code className="font-mono text-paper-dim">docker compose up -d postgres</code> then{" "}
        <code className="font-mono text-paper-dim">bun run db:migrate</code>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="kicker block">{label}</span>
      <span className="block mt-2">{children}</span>
    </label>
  );
}

function StatusPill({ status }: { status: AccountStatus }) {
  const className =
    status === "active" ? "pill-moss" : status === "review" ? "pill-gold" : "pill-ember";
  return <span className={`pill ${className}`}>{status}</span>;
}

function formFromProfile(profile: SupportProfile): FormState {
  const limits = readLimits(profile.limits);

  return {
    name: profile.name,
    email: profile.email ?? "",
    accountStatus: profile.accountStatus,
    plan: profile.plan,
    dailyPayoutCents: moneyFromCents(limits.dailyPayoutCents ?? 0),
    monthlyVolumeCents: moneyFromCents(limits.monthlyVolumeCents ?? 0),
    availableBalanceCents: moneyFromCents(limits.availableBalanceCents ?? 0),
    pendingBalanceCents: moneyFromCents(limits.pendingBalanceCents ?? 0),
    reservedBalanceCents: moneyFromCents(limits.reservedBalanceCents ?? 0),
    lastPayoutCents: moneyFromCents(limits.lastPayoutCents ?? 0),
  };
}

function readLimits(value: SupportProfile["limits"]): SupportLimits {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isPlainRecord(value) ? value : {};
}

function isPlainRecord(value: unknown): value is SupportLimits {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function centsFromInput(value: string) {
  const normalized = value
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  return Math.round(Number(normalized || "0") * 100);
}

function moneyFromCents(value: number) {
  return (value / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const emptyForm: FormState = {
  name: "",
  email: "",
  accountStatus: "active",
  plan: "InfinitePay Pro",
  dailyPayoutCents: "1.500,00",
  monthlyVolumeCents: "25.000,00",
  availableBalanceCents: "3.250,00",
  pendingBalanceCents: "890,00",
  reservedBalanceCents: "120,00",
  lastPayoutCents: "1.400,00",
};
