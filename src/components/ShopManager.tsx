"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatBaht } from "@/lib/format";

type Item = {
  id: string;
  type: "DIGITAL" | "COMMISSION";
  title: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  active: boolean;
};
type Order = {
  id: string;
  itemTitle: string;
  buyerName: string;
  buyerContact: string;
  note: string | null;
  amount: number;
  slipUrl: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED" | "DELIVERED";
  createdAt: string;
};

export function ShopManager({
  items,
  orders,
  locale,
}: {
  items: Item[];
  orders: Order[];
  locale: string;
}) {
  const t = useTranslations("shop");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [type, setType] = useState<"DIGITAL" | "COMMISSION">("DIGITAL");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startAdd() {
    setEditing(null);
    setType("DIGITAL");
    setTitle("");
    setPrice("");
    setDescription("");
    setImage(null);
    setError(null);
    setOpen(true);
  }
  function startEdit(item: Item) {
    setEditing(item);
    setType(item.type);
    setTitle(item.title);
    setPrice(String(item.price));
    setDescription(item.description ?? "");
    setImage(null);
    setError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !price) return setError(t("formError"));
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("title", title);
      fd.set("price", price);
      fd.set("description", description);
      if (image) fd.set("image", image);
      const url = editing ? `/api/shop/items/${editing.id}` : "/api/shop/items";
      const res = await fetch(url, { method: editing ? "PATCH" : "POST", body: fd });
      if (!res.ok) {
        setError(t("formError"));
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function patchItem(id: string, body: FormData) {
    await fetch(`/api/shop/items/${id}`, { method: "PATCH", body });
    router.refresh();
  }
  function toggleActive(item: Item) {
    const fd = new FormData();
    fd.set("intent", "toggleActive");
    fd.set("active", item.active ? "0" : "1");
    patchItem(item.id, fd);
  }
  function archive(item: Item) {
    if (!confirm(t("confirmDelete"))) return;
    const fd = new FormData();
    fd.set("intent", "archive");
    patchItem(item.id, fd);
  }

  async function orderAction(id: string, action: string) {
    await fetch(`/api/shop/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }

  const fmtDate = (s: string) =>
    new Date(s).toLocaleString(locale === "th" ? "th-TH" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  const cur = locale === "th" ? "th-TH" : "en-US";

  return (
    <div className="space-y-8">
      {/* Items */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-900">{t("itemsTitle")}</h2>
          <button onClick={startAdd} className="btn-primary px-4 py-2 text-sm">
            + {t("addItem")}
          </button>
        </div>

        {items.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noItems")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((item) => (
              <li key={item.id} className="card flex gap-3 rounded-2xl p-4">
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-brand-900">
                      {item.title}
                    </span>
                    {!item.active && (
                      <span className="shrink-0 rounded-full bg-brand-100 px-2 text-xs text-brand-900/60">
                        {t("hidden")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-brand-700">
                    {formatBaht(item.price, cur)} ·{" "}
                    {item.type === "COMMISSION"
                      ? t("typeCommission")
                      : t("typeDigital")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium">
                    <button
                      onClick={() => startEdit(item)}
                      className="text-brand-700 hover:underline"
                    >
                      {t("edit")}
                    </button>
                    <button
                      onClick={() => toggleActive(item)}
                      className="text-brand-700 hover:underline"
                    >
                      {item.active ? t("hide") : t("show")}
                    </button>
                    <button
                      onClick={() => archive(item)}
                      className="text-red-600 hover:underline"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Orders */}
      <section>
        <h2 className="mb-4 text-lg font-bold text-brand-900">
          {t("ordersTitle")}
        </h2>
        {orders.length === 0 ? (
          <p className="card rounded-2xl p-6 text-center text-brand-900/60">
            {t("noOrders")}
          </p>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id} className="card rounded-2xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-brand-900">
                    {o.itemTitle}
                  </span>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-sm font-bold text-brand-700">
                    {formatBaht(o.amount, cur)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-brand-900/75">
                  {o.buyerName || t("anon")} · {t("contact")}: {o.buyerContact}
                </p>
                {o.note && (
                  <p className="mt-1 text-sm text-brand-900/60">“{o.note}”</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-brand-900/45">{fmtDate(o.createdAt)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-semibold ${
                      o.status === "DELIVERED"
                        ? "bg-green-100 text-green-700"
                        : o.status === "CONFIRMED"
                          ? "bg-blue-100 text-blue-700"
                          : o.status === "REJECTED"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t(`status_${o.status}`)}
                  </span>
                  {o.slipUrl && (
                    <a
                      href={o.slipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t("viewSlip")}
                    </a>
                  )}
                  <span className="flex-1" />
                  {o.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => orderAction(o.id, "confirm")}
                        className="rounded-full bg-brand-600 px-3 py-1 font-semibold text-white hover:bg-brand-700"
                      >
                        {t("confirm")}
                      </button>
                      <button
                        onClick={() => orderAction(o.id, "reject")}
                        className="font-medium text-red-600 hover:underline"
                      >
                        {t("reject")}
                      </button>
                    </>
                  )}
                  {o.status === "CONFIRMED" && (
                    <button
                      onClick={() => orderAction(o.id, "deliver")}
                      className="rounded-full bg-green-600 px-3 py-1 font-semibold text-white hover:bg-green-700"
                    >
                      {t("markDelivered")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add/Edit modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={save}
            className="card mt-8 w-full max-w-md space-y-4 rounded-3xl p-6"
          >
            <h3 className="text-lg font-bold text-brand-900">
              {editing ? t("editItem") : t("addItem")}
            </h3>
            <div className="flex gap-2">
              {(["DIGITAL", "COMMISSION"] as const).map((v) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setType(v)}
                  className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
                    type === v
                      ? "bg-brand-600 text-white"
                      : "border border-brand-200 bg-brand-50 text-brand-800"
                  }`}
                >
                  {v === "DIGITAL" ? t("typeDigital") : t("typeCommission")}
                </button>
              ))}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("titleLabel")}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                className="input"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("priceLabel")}
              </span>
              <input
                type="number"
                min={1}
                max={1000000}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="input"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("descLabel")}
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                className="input resize-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-brand-900/80">
                {t("imageLabel")}
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => setImage(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-brand-900/70 file:mr-3 file:rounded-full file:border-0 file:bg-brand-100 file:px-4 file:py-2 file:font-semibold file:text-brand-700"
              />
            </label>
            {error && <p className="text-sm font-medium text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary flex-1">
                {busy ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-secondary"
              >
                {t("cancel")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
