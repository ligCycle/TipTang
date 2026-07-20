import { OverlayClient } from "@/components/OverlayClient";

export default async function OverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ key?: string; test?: string }>;
}) {
  const { username } = await params;
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : "";
  const test = sp.test === "1";

  return <OverlayClient username={username} apiKey={key} test={test} />;
}
