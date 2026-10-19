import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreatorTheme } from "@/components/CreatorTheme";
import { DashboardNav } from "@/components/DashboardNav";
import { isAdminEmail } from "@/lib/admin";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  // The signed-in creator's channel colour paints their own pages.
  const me = session.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { profileColor: true },
      })
    : null;

  return (
    <>
      <CreatorTheme color={me?.profileColor} />
      {/* On large screens the dashboard grows past the site's max-w-5xl (up to
          80rem, keeping 1.5rem each side) via negative margins — no transform,
          so fixed dialogs inside still cover the whole viewport. */}
      <div className="md:flex md:items-start md:gap-8 xl:mx-[calc(50%_-_min(40rem,_50vw_-_1.5rem))]">
        <DashboardNav admin={isAdminEmail(session.user.email)} />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </>
  );
}
