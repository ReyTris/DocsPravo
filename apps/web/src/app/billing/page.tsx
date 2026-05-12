"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { hasSession } from "@/lib/auth-client";

function formatRub(kopecks: number): string {
  return `${(kopecks / 100).toLocaleString("ru-RU")} ₽`;
}

export default function BillingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [buyingId, setBuyingId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSession()) router.replace("/login");
  }, [router]);

  const balanceQuery = trpc.pages.balance.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  const packagesQuery = trpc.pages.packages.useQuery();
  const buyMutation = trpc.pages.buy.useMutation({
    onSuccess: (data) => {
      window.location.href = data.confirmationUrl;
    },
    onError: (err) => {
      setBuyingId(null);
      alert(err.message);
    },
  });

  const balance = balanceQuery.data?.balance ?? 0;
  const packages = packagesQuery.data ?? [];
  const justPaid = searchParams.get("paid") === "1";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">Купить страницы</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        1 страница PDF или 1 фото = 1 страница списания. Страницы не сгорают.
      </p>

      {justPaid && (
        <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400">
          Оплата прошла успешно. Страницы будут зачислены в течение минуты.
        </div>
      )}

      <div className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-sm">
        Текущий баланс:{" "}
        <span className="font-semibold">
          {balanceQuery.isLoading ? "…" : balance}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {packages.map((p) => {
          const pricePerPage = p.priceKopecks / p.pages;
          return (
            <div
              key={p.id}
              className="flex flex-col rounded-md border border-white/10 bg-white/5 p-4"
            >
              <div className="text-3xl font-bold">{p.pages}</div>
              <div className="text-sm text-[var(--muted)]">страниц</div>
              <div className="mt-3 text-xl">{formatRub(p.priceKopecks)}</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {formatRub(pricePerPage)} за страницу
              </div>
              <button
                disabled={buyMutation.isPending && buyingId === p.id}
                onClick={() => {
                  setBuyingId(p.id);
                  buyMutation.mutate({ packageId: p.id as "pages_3" | "pages_10" | "pages_30" });
                }}
                className="mt-4 rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {buyMutation.isPending && buyingId === p.id ? "Перенаправление…" : "Купить"}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-sm">
        <Link href="/upload" className="underline hover:no-underline">
          ← Вернуться к загрузке
        </Link>
      </p>
    </main>
  );
}
