"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc";

function fmt(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

const REASON_LABELS: Record<string, string> = {
  signup_bonus: "бонус при регистрации",
  purchase: "покупка пакета",
  document_charge: "списание за документ",
  document_refund: "возврат за документ",
  adjustment: "ручная корректировка",
};

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();

  const user = trpc.admin.users.getById.useQuery({ id });
  const adjust = trpc.admin.users.adjustQuota.useMutation({
    onSuccess: () => {
      utils.admin.users.getById.invalidate({ id });
      setDelta("");
      setNote("");
      setMsg("Квота обновлена");
      setTimeout(() => setMsg(""), 3000);
    },
    onError: (e) => setMsg("Ошибка: " + e.message),
  });

  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  if (user.isLoading) return <p className="text-[var(--muted)]">Загрузка...</p>;
  if (user.error) return <p className="text-[var(--danger)]">Ошибка: {user.error.message}</p>;

  const u = user.data!;

  function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    const d = parseInt(delta, 10);
    if (!Number.isFinite(d) || d === 0) { setMsg("Введите целое ненулевое число"); return; }
    if (!note.trim()) { setMsg("Укажите причину"); return; }
    adjust.mutate({ userId: id, delta: d, note: note.trim() });
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-[var(--muted)] hover:text-[var(--text)]">
          ← Пользователи
        </Link>
      </div>

      {/* User info */}
      <div className="mb-6 rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-[var(--text)]">{u.email}</p>
            <p className="mt-0.5 text-sm text-[var(--muted)]">ID: {u.id}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            u.role === "admin"
              ? "bg-[rgba(108,140,255,0.15)] text-[var(--brand)]"
              : "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]"
          }`}>
            {u.role}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[var(--muted)]">Баланс страниц</p>
            <p className="font-bold text-[var(--text)]">{u.balancePages} стр.</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Телефон</p>
            <p className="text-[var(--text)]">{u.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-[var(--muted)]">Зарегистрирован</p>
            <p className="text-[var(--text)]">{new Date(u.createdAt).toLocaleString("ru-RU")}</p>
          </div>
          {u.deletedAt && (
            <div>
              <p className="text-[var(--muted)]">Удалён</p>
              <p className="text-[var(--danger)]">{new Date(u.deletedAt).toLocaleString("ru-RU")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Quota adjustment */}
      <div className="mb-6 rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5">
        <h2 className="mb-3 font-semibold text-[var(--text)]">Ручное начисление / списание квоты</h2>
        <form onSubmit={submitAdjust} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--muted)]">Delta (+ или −)</label>
            <input
              type="number"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              placeholder="например, 5 или -2"
              className="w-36 rounded-xl border border-[var(--card-border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-[var(--muted)]">Причина</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Причина (обязательно)"
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
            />
          </div>
          <button
            type="submit"
            disabled={adjust.isPending}
            className="btn-brand rounded-xl px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {adjust.isPending ? "..." : "Применить"}
          </button>
        </form>
        {msg && (
          <p className={`mt-2 text-sm ${msg.startsWith("Ошибка") ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}>
            {msg}
          </p>
        )}
      </div>

      {/* Transaction history */}
      <section className="mb-6">
        <h2 className="mb-3 font-semibold text-[var(--text)]">История транзакций (последние 20)</h2>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--bg-2)] text-left text-xs uppercase text-[var(--muted)]">
                <th className="px-4 py-2">Дата</th>
                <th className="px-4 py-2">Причина</th>
                <th className="px-4 py-2">Delta</th>
                <th className="px-4 py-2">Баланс после</th>
                <th className="px-4 py-2">Заметка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {u.pageTransactions.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 text-[var(--muted)]">{new Date(t.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-2 text-[var(--text)]">{REASON_LABELS[t.reason] ?? t.reason}</td>
                  <td className={`px-4 py-2 font-semibold ${t.delta > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                    {t.delta > 0 ? "+" : ""}{t.delta}
                  </td>
                  <td className="px-4 py-2 text-[var(--text)]">{t.balanceAfter}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{t.note ?? "—"}</td>
                </tr>
              ))}
              {u.pageTransactions.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--muted)]">Нет транзакций</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent documents */}
      <section className="mb-6">
        <h2 className="mb-3 font-semibold text-[var(--text)]">Последние документы</h2>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--bg-2)] text-left text-xs uppercase text-[var(--muted)]">
                <th className="px-4 py-2">Файл</th>
                <th className="px-4 py-2">Статус</th>
                <th className="px-4 py-2">Страниц списано</th>
                <th className="px-4 py-2">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {u.documents.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 text-[var(--brand)]">
                    <Link href={`/admin/documents?userId=${u.id}`} className="hover:underline">{d.filename}</Link>
                  </td>
                  <td className="px-4 py-2 text-[var(--text)]">{d.status}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{d.pagesCharged ?? "—"}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{new Date(d.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {u.documents.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-[var(--muted)]">Нет документов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent payments */}
      <section>
        <h2 className="mb-3 font-semibold text-[var(--text)]">Последние платежи</h2>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--bg-2)] text-left text-xs uppercase text-[var(--muted)]">
                <th className="px-4 py-2">Продукт</th>
                <th className="px-4 py-2">Сумма</th>
                <th className="px-4 py-2">Страниц</th>
                <th className="px-4 py-2">Статус</th>
                <th className="px-4 py-2">Дата</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {u.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-[var(--text)]">{p.product}</td>
                  <td className="px-4 py-2 text-[var(--text)]">{fmt(p.amountKopecks)}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{p.pagesGranted ?? "—"}</td>
                  <td className={`px-4 py-2 font-medium ${
                    p.status === "succeeded" ? "text-[var(--ok)]" :
                    p.status === "canceled" ? "text-[var(--danger)]" : "text-[var(--muted)]"
                  }`}>{p.status}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">{new Date(p.createdAt).toLocaleString("ru-RU")}</td>
                </tr>
              ))}
              {u.payments.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--muted)]">Нет платежей</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
