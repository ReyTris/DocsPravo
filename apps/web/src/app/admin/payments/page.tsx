"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

type Status = "pending" | "succeeded" | "canceled" | "refunded";

function fmt(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

const STATUS_STYLE: Record<string, string> = {
  succeeded: "bg-[rgba(52,211,153,0.15)] text-[var(--ok)]",
  pending:   "bg-[rgba(108,140,255,0.15)] text-[var(--brand)]",
  canceled:  "bg-[rgba(248,113,113,0.15)] text-[var(--danger)]",
  refunded:  "bg-[rgba(251,191,36,0.15)] text-[var(--warn)]",
};

export default function AdminPaymentsPage() {
  const [status, setStatus] = useState<Status | "">("");

  const list = trpc.admin.payments.list.useQuery({
    status: status || undefined,
    limit: 50,
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">Платежи</h1>

      <div className="mb-4 flex gap-2">
        {(["", "succeeded", "pending", "canceled", "refunded"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === s
                ? "bg-[var(--brand)] text-white"
                : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {s === "" ? "Все" : s}
          </button>
        ))}
      </div>

      {list.isLoading && <p className="text-[var(--muted)]">Загрузка...</p>}
      {list.error && <p className="text-[var(--danger)]">Ошибка: {list.error.message}</p>}

      {list.data && (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--bg-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-4 py-3">Пользователь</th>
                <th className="px-4 py-3">Продукт</th>
                <th className="px-4 py-3">Сумма</th>
                <th className="px-4 py-3">Страниц</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">ЮKassa ID</th>
                <th className="px-4 py-3">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {list.data.items.map((p) => (
                <tr key={p.id} className="hover:bg-[var(--bg-2)]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.user.id}`} className="text-[var(--brand)] hover:underline">
                      {p.user.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--text)]">{p.product}</td>
                  <td className="px-4 py-3 font-medium text-[var(--text)]">{fmt(p.amountKopecks)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{p.pagesGranted ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[p.status] ?? ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">{p.ukassaId ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{new Date(p.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {list.data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">Нет платежей</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
