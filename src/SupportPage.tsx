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
  limits: {
    dailyPayoutCents?: number;
    monthlyVolumeCents?: number;
  };
  supportFlags: string[];
  updatedAt: string;
};

type FormState = {
  name: string;
  email: string;
  accountStatus: AccountStatus;
  plan: string;
  dailyPayoutCents: string;
  monthlyVolumeCents: string;
};

const problemTemplates: Array<{
  kind: ProblemKind;
  title: string;
  description: string;
  prompt: string;
}> = [
  {
    kind: "blocked_account",
    title: "Conta bloqueada",
    description: "Marca a conta como bloqueada, cria falha de saque e ticket urgente.",
    prompt: "Minha conta foi bloqueada e eu preciso fazer uma transferência agora.",
  },
  {
    kind: "password_reset",
    title: "Reset de senha",
    description: "Cria um ticket de recuperação de acesso para o agente orientar o usuário.",
    prompt: "Não consigo entrar na minha conta. Pode me ajudar a resetar minha senha?",
  },
  {
    kind: "payout_failed",
    title: "Transferência falhou",
    description: "Coloca a conta em revisão e registra uma falha recente de payout.",
    prompt: "Por que minha transferência falhou hoje?",
  },
  {
    kind: "payment_declined",
    title: "Pagamento recusado",
    description: "Registra uma transação recusada para o agente explicar os próximos passos.",
    prompt: "Meu cliente tentou pagar no cartão e foi recusado. O que aconteceu?",
  },
  {
    kind: "kyc_review",
    title: "KYC pendente",
    description: "Simula revisão de identidade, forçando handoff humano quando necessário.",
    prompt: "Minha verificação de identidade está pendente. Posso continuar vendendo?",
  },
];

export function SupportPage() {
  const authedFetch = useAuthedFetch();
  const [profile, setProfile] = useState<SupportProfile | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await authedFetch("/api/me/support-profile");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      setForm(data.profile ? formFromProfile(data.profile) : emptyForm);
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
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      if (data.profile) setForm(formFromProfile(data.profile));
      setMessage("Perfil atualizado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao salvar perfil.");
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { profile: SupportProfile | null };
      setProfile(data.profile);
      if (data.profile) setForm(formFromProfile(data.profile));
      setMessage("Problema criado. Abra o console e use o prompt sugerido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao criar problema.");
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
              {Array.from({ length: 6 }).map((_, i) => (
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
  return {
    name: profile.name,
    email: profile.email ?? "",
    accountStatus: profile.accountStatus,
    plan: profile.plan,
    dailyPayoutCents: moneyFromCents(profile.limits.dailyPayoutCents ?? 0),
    monthlyVolumeCents: moneyFromCents(profile.limits.monthlyVolumeCents ?? 0),
  };
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
};
