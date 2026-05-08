"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";

const STATUSES = [
  "",
  "uploaded",
  "ocr_processing",
  "classify_processing",
  "extract_processing",
  "analyze_processing",
  "ready",
  "ready_green",
  "ready_yellow",
  "stop_redirect_lawyer",
  "unsupported",
  "error",
  "cancelled",
] as const;

const TIER_STYLE: Record<string, string> = {
  green:  "bg-[rgba(52,211,153,0.15)] text-[var(--ok)]",
  yellow: "bg-[rgba(251,191,36,0.15)] text-[var(--warn)]",
  red:    "bg-[rgba(248,113,113,0.15)] text-[var(--danger)]",
};

export default function AdminDocumentsPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const userId = searchParams.get("userId") ?? undefined;

  const list = trpc.admin.documents.list.useQuery({
    status: status || undefined,
    userId,
    limit: 50,
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-[var(--text)]">Документы</h1>
      {userId && (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Фильтр по пользователю: <span className="font-mono text-[var(--brand)]">{userId}</span>
          {" "}
          <Link href="/admin/documents" className="text-[var(--danger)] hover:underline">× убрать</Link>
        </p>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
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
                <th className="px-4 py-3">Файл</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">Страниц</th>
                <th className="px-4 py-3">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {list.data.items.map((d) => (
                <tr key={d.id} className="hover:bg-[var(--bg-2)]">
                  <td className="px-4 py-3">
                    {d.user ? (
                      <Link href={`/admin/users/${d.user.id}`} className="text-[var(--brand)] hover:underline">
                        {d.user.email}
                      </Link>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-[var(--text)]" title={d.filename}>
                    {d.filename}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">{d.status}</td>
                  <td className="px-4 py-3">
                    {d.tier ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TIER_STYLE[d.tier] ?? ""}`}>
                        {d.tier}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="max-w-[140px] truncate px-4 py-3 text-xs text-[var(--muted)]" title={d.detectedType ?? ""}>
                    {d.detectedType ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{d.pagesCharged ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{new Date(d.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {list.data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">Нет документов</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
