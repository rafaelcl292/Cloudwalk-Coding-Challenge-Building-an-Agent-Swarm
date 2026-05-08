export function PageHeader({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-rule pb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
      <div>
        <div className="kicker anim-fade">{kicker}</div>
        <h1 className="display text-[clamp(2.25rem,4vw,3.5rem)] mt-2 anim-rise">{title}</h1>
        {lede ? (
          <p className="serif text-base mt-3 text-paper-dim max-w-[60ch] anim-rise stagger-1">
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 anim-rise stagger-2">{actions}</div> : null}
    </header>
  );
}
