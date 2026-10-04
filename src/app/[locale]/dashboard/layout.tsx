import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreatorTheme } from "@/components/CreatorTheme";

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
      {children}
    </>
  );
}
