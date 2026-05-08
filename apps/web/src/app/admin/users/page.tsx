"use client";

import { useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

export default function AdminUsersPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const list = trpc.admin.users.list.useQuery({ search: debouncedSearch || undefined, limit: 50 });

  function handleSearch(v: string) {
    setSearch(v);
    clearTimeout((handleSearch as unknown as { t?: ReturnType<typeof setTimeout> }).t);
    (handleSearch as unknown as { t?: ReturnType<typeof setTimeout> }).t = setTimeout(() => setDebouncedSearch(v), 400);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">Пользователи</h1>

      <input
        type="search"
        placeholder="Поиск по email..."
        value={search}
        onChange={(e) => handleSearch(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
      />

      {list.isLoading && <p className="text-[var(--muted)]">Загрузка...</p>}
      {list.error && <p className="text-[var(--danger)]">Ошибка: {list.error.message}</p>}

      {list.data && (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--card-border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] bg-[var(--bg-2)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Баланс</th>
                <th className="px-4 py-3">Документы</th>
                <th className="px-4 py-3">Платежи</th>
                <th className="px-4 py-3">Регистрация</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)] bg-[var(--card)]">
              {list.data.items.map((u) => (
                <tr key={u.id} className="hover:bg-[var(--bg-2)]">
                  <td className="px-4 py-3 font-medium text-[var(--text)]">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      u.role === "admin"
                        ? "bg-[rgba(108,140,255,0.15)] text-[var(--brand)]"
                        : "bg-[rgba(255,255,255,0.06)] text-[var(--muted)]"
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--text)]">{u.balancePages} стр.</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{u._count.documents}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{u._count.payments}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{new Date(u.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-xs font-medium text-[var(--brand)] hover:underline"
                    >
                      Детали →
                    </Link>
                  </td>
                </tr>
              ))}
              {list.data.items.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">Ничего не найдено</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
