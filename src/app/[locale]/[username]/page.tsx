import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { TipForm } from "@/components/TipForm";
import { formatBaht } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const creator = await prisma.user.findUnique({
    where: { username },
    select: { displayName: true, bio: true },
  });
  if (!creator) return { title: "Not found" };

  const title = `Support ${creator.displayName}`;
  const description =
    creator.bio || `Support ${creator.displayName} with a tip via PromptPay.`;
  return {
    title,
    description,
    openGraph: { title: `${title} · TipTang`, description, type: "profile" },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string; username: string }>;
}) {
  const { locale, username } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");

  const creator = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      // promptpayId is selected only to derive `canTip` below — it is NEVER
      // passed to a client component or rendered (PDPA).
      promptpayId: true,
    },
  });
  if (!creator) notFound();

  const canTip = Boolean(creator.promptpayId && creator.promptpayId.length > 0);

  const tips = await prisma.tip.findMany({
    where: { creatorId: creator.id, status: "CONFIRMED", isMessagePublic: true },
    orderBy: { confirmedAt: "desc" },
    take: 20,
    select: {
      id: true,
      supporterName: true,
      message: true,
      amount: true,
      confirmedAt: true,
    },
  });

  const initial = creator.displayName.charAt(0).toUpperCase();
  const currencyLocale = locale === "th" ? "th-TH" : "en-US";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Profile header */}
      <section className="card overflow-hidden rounded-3xl text-center">
        {/* Cover */}
        <div className="h-32 w-full bg-gradient-to-br from-brand-300 to-brand-500 sm:h-40">
          {creator.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="px-8 pb-8">
          {/* Avatar (overlaps cover) */}
          <div className="mx-auto -mt-12 flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-br from-brand-400 to-brand-600 text-4xl font-black text-white shadow-lg">
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creator.avatarUrl}
                alt={creator.displayName}
                className="h-full w-full object-cover"
              />
            ) : (
              initial
            )}
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-brand-900">
            {creator.displayName}
          </h1>
          <p className="text-sm font-medium text-brand-600">
            @{creator.username}
          </p>
          {creator.bio && (
            <p className="mx-auto mt-3 max-w-md text-brand-900/70">
              {creator.bio}
            </p>
          )}
        </div>
      </section>

      {/* Tip form */}
      {canTip ? (
        <TipForm username={creator.username} creatorName={creator.displayName} />
      ) : (
        <div className="card rounded-2xl p-6 text-center text-brand-900/70">
          {t("notConfigured")}
        </div>
      )}

      {/* Message wall */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-brand-900">
          {t("recentSupporters")}
        </h2>
        {tips.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noSupporters")}
          </p>
        ) : (
          <ul className="space-y-3">
            {tips.map((tip) => (
              <li key={tip.id} className="card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-brand-800">
                    {tip.supporterName || t("namePlaceholder")}
                  </span>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
                    {formatBaht(Number(tip.amount), currencyLocale)}
                  </span>
                </div>
                {tip.message && (
                  <p className="mt-2 text-brand-900/75">{tip.message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
