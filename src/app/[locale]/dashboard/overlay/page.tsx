import { redirect } from "next/navigation";

/** The old one-page OBS settings moved into the feature hub. */
export default async function OverlayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard/features`);
}
