// Presentational layout for long-form legal pages (Terms / Privacy).
// Sections render newline-separated bodies (use "\n" + "• " for bullet lines).
export function LegalDoc({
  title,
  lastUpdated,
  intro,
  sections,
}: {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: { title: string; body: string }[];
}) {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold text-brand-900">{title}</h1>
        <p className="mt-1 text-sm text-brand-900/50">{lastUpdated}</p>
        <p className="mt-4 text-brand-900/75">{intro}</p>
      </header>

      <div className="space-y-4">
        {sections.map((s, i) => (
          <section key={i} className="card rounded-2xl p-5">
            <h2 className="font-bold text-brand-900">
              {i + 1}. {s.title}
            </h2>
            <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed text-brand-900/75">
              {s.body}
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}
