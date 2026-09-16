// Presentational layout for long-form legal pages (Terms / Privacy).
// Sections render newline-separated bodies (use "\n" + "• " for bullet lines).
// Deliberately static — no reveals — a legal document should just be there.
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
    <article className="mx-auto max-w-3xl">
      <header>
        <h1 className="text-4xl font-extrabold tracking-tight text-brand-900">
          {title}
        </h1>
        <p className="mt-2 text-sm text-brand-900/50">{lastUpdated}</p>
        <p className="mt-5 max-w-2xl text-lg text-brand-900/70">{intro}</p>
      </header>

      <ol className="mt-10 divide-y divide-brand-900/10">
        {sections.map((s, i) => (
          <li
            key={i}
            className="grid grid-cols-[3rem_1fr] gap-4 py-7 first:pt-0"
          >
            <span
              aria-hidden
              className="pt-0.5 text-3xl font-black tabular-nums leading-none text-brand-900/15"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <section className="min-w-0">
              <h2 className="text-xl font-bold text-brand-900">{s.title}</h2>
              <p className="mt-2 whitespace-pre-line break-words leading-relaxed text-brand-900/75">
                {s.body}
              </p>
            </section>
          </li>
        ))}
      </ol>
    </article>
  );
}
