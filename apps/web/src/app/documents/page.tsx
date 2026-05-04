"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth-client";

export default function DocumentsListPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) router.replace("/login");
  }, [router]);

  const list = trpc.documents.list.useQuery({ limit: 50 });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мои документы</h1>
        <Link
          href="/upload"
          className="rounded-md bg-black px-4 py-2 text-sm text-white"
        >
          Загрузить новый
        </Link>
      </div>

      {list.isLoading && <p className="mt-6 text-gray-500">Загрузка...</p>}
      {list.error && (
        <p className="mt-6 text-red-700">Ошибка: {list.error.message}</p>
      )}

      {list.data && list.data.items.length === 0 && (
        <div className="mt-12 rounded-lg border bg-gray-50 p-8 text-center">
          <p className="text-gray-700">Пока ничего не загружено.</p>
          <Link
            href="/upload"
            className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-white"
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
                className="block rounded-lg border p-4 hover:bg-gray-50"
              >
                <div className="flex items-baseline justify-between">
                  <div className="font-medium">{d.filename}</div>
                  <StatusBadge status={d.status} />
                </div>
                {d.essence && <p className="mt-1 text-sm text-gray-700">{d.essence}</p>}
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>{new Date(d.createdAt).toLocaleString("ru-RU")}</span>
                  {d.criticalDeadline && (
                    <span className="text-red-700">
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
    uploaded: { text: "в очереди", cls: "bg-gray-100 text-gray-700" },
    ocr_processing: { text: "OCR", cls: "bg-blue-100 text-blue-700" },
    classify_processing: { text: "классификация", cls: "bg-blue-100 text-blue-700" },
    extract_processing: { text: "извлечение", cls: "bg-blue-100 text-blue-700" },
    analyze_processing: { text: "разбор", cls: "bg-blue-100 text-blue-700" },
    ready: { text: "готово", cls: "bg-green-100 text-green-800" },
    ready_green: { text: "полный разбор", cls: "bg-green-100 text-green-800" },
    ready_yellow: { text: "пересказ", cls: "bg-yellow-100 text-yellow-900" },
    stop_redirect_lawyer: { text: "к юристу", cls: "bg-red-100 text-red-800" },
    unsupported: { text: "не определён", cls: "bg-gray-100 text-gray-700" },
    error: { text: "ошибка", cls: "bg-red-100 text-red-700" },
  };
  const s = labels[status] ?? { text: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${s.cls}`}>
      {s.text}
    </span>
  );
}
