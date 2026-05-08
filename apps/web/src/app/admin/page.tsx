"use client";

import { trpc } from "@/lib/trpc";

function fmt(kopecks: number) {
  return (kopecks / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--text)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard() {
  const stats = trpc.admin.stats.useQuery();

  if (stats.isLoading) {
    return <p className="text-[var(--muted)]">Загрузка...</p>;
  }
  if (stats.error) {
    return <p className="text-[var(--danger)]">Ошибка: {stats.error.message}</p>;
  }

  const d = stats.data!;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[var(--text)]">Дашборд</h1>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Пользователи</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Всего" value={d.users.total} />
          <StatCard label="За сегодня" value={d.users.today} />
          <StatCard label="За 7 дней" value={d.users.week} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Документы</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Всего" value={d.documents.total} />
          <StatCard label="За сегодня" value={d.documents.today} />
          <StatCard label="В обработке" value={d.documents.processing} />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-[var(--muted)]">Платежи</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Успешных всего" value={d.payments.total} />
          <StatCard label="За сегодня" value={d.payments.today} />
          <StatCard label="Выручка всего" value={fmt(d.payments.revenueKopecks)} />
          <StatCard label="Выручка за 30 дней" value={fmt(d.payments.revenueMonthKopecks)} />
        </div>
      </section>
    </div>
  );
}
