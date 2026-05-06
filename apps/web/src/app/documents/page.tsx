"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { hasSession } from "@/lib/auth-client";

export default function DocumentsListPage() {
  const router = useRouter();

  useEffect(() => {
    if (!hasSession()) router.replace("/login");
    const onAuthChanged = () => {
      if (!hasSession()) router.replace("/login");
    };
    window.addEventListener("auth-changed", onAuthChanged);
    return () => window.removeEventListener("auth-changed", onAuthChanged);
  }, [router]);

  const list = trpc.documents.list.useQuery({ limit: 50 });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text)]">Мои документы</h1>
        <Link
          href="/upload"
          className="btn-brand rounded-xl px-4 py-2 text-sm font-semibold"
        >
          Загрузить новый
        </Link>
      </div>

      {list.isLoading && (
        <p className="mt-6 text-[var(--muted)]">Загрузка...</p>
      )}
      {list.error && (
        <p className="mt-6 text-[var(--danger)]">Ошибка: {list.error.message}</p>
      )}

      {list.data && list.data.items.length === 0 && (
        <div className="mt-12 rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-8 text-center">
          <p className="text-[var(--muted)]">Пока ничего не загружено.</p>
          <Link
            href="/upload"
            className="btn-brand mt-4 inline-block rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Загрузить первое письмо
          </Link>
        </div>
      )}

      {list.data && list.data.items.length > 0 && (
        <ul className="mt-6 space-y-3">
          {list.data.items.map((d) => (
            <li key={d.id}>
              <Link
                href={`/documents/${d.id}`}
                className="block rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] p-5 transition-colors hover:border-[rgba(108,140,255,0.3)] hover:bg-[rgba(108,140,255,0.06)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold text-[var(--brand)]">{d.filename}</div>
                  <StatusBadge status={d.status} />
                </div>
                {d.essence && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{d.essence}</p>
                )}
                <div className="mt-3 flex gap-4 text-xs text-[var(--muted)]">
                  <span>{new Date(d.createdAt).toLocaleString("ru-RU")}</span>
                  {d.criticalDeadline && (
                    <span className="font-medium text-[var(--warn)]">
                      срок: {new Date(d.criticalDeadline).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    uploaded:             { text: "в очереди",    cls: "bg-[rgba(255,255,255,0.06)] text-[var(--muted)] border-[var(--card-border)]" },
    ocr_processing:       { text: "OCR",           cls: "bg-[rgba(108,140,255,0.15)] text-[var(--brand)] border-[rgba(108,140,255,0.3)]" },
    classify_processing:  { text: "классификация", cls: "bg-[rgba(108,140,255,0.15)] text-[var(--brand)] border-[rgba(108,140,255,0.3)]" },
    extract_processing:   { text: "извлечение",    cls: "bg-[rgba(108,140,255,0.15)] text-[var(--brand)] border-[rgba(108,140,255,0.3)]" },
    analyze_processing:   { text: "разбор",        cls: "bg-[rgba(108,140,255,0.15)] text-[var(--brand)] border-[rgba(108,140,255,0.3)]" },
    ready:                { text: "готово",        cls: "bg-[rgba(52,211,153,0.15)] text-[var(--ok)] border-[rgba(52,211,153,0.3)]" },
    ready_green:          { text: "полный разбор", cls: "bg-[rgba(52,211,153,0.15)] text-[var(--ok)] border-[rgba(52,211,153,0.3)]" },
    ready_yellow:         { text: "пересказ",      cls: "bg-[rgba(251,191,36,0.15)] text-[var(--warn)] border-[rgba(251,191,36,0.3)]" },
    stop_redirect_lawyer: { text: "к юристу",      cls: "bg-[rgba(248,113,113,0.15)] text-[var(--danger)] border-[rgba(248,113,113,0.3)]" },
    unsupported:          { text: "не определён",  cls: "bg-[rgba(255,255,255,0.06)] text-[var(--muted)] border-[var(--card-border)]" },
    error:                { text: "ошибка",        cls: "bg-[rgba(248,113,113,0.15)] text-[var(--danger)] border-[rgba(248,113,113,0.3)]" },
  };
  const s = labels[status] ?? { text: status, cls: "bg-[rgba(255,255,255,0.06)] text-[var(--muted)] border-[var(--card-border)]" };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
      {s.text}
    </span>
  );
}
