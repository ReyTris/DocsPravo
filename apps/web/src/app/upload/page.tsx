"use client";

import { useState, useEffect, useCallback, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { isAuthenticated } from "@/lib/auth-client";

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/heic"] as const;
const MAX_BYTES = 20 * 1024 * 1024;

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const requestUrl = trpc.documents.requestUploadUrl.useMutation();
  const confirmUpload = trpc.documents.confirmUpload.useMutation();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
    }
  }, [router]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
  }

  function acceptFile(f: File) {
    setError(null);
    if (!ACCEPTED_TYPES.includes(f.type as (typeof ACCEPTED_TYPES)[number])) {
      setError("Поддерживаются: PDF, JPEG, PNG, HEIC.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Файл больше 20 МБ (${(f.size / 1024 / 1024).toFixed(1)} МБ).`);
      return;
    }
    setFile(f);
  }

  async function startUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      setProgress("Готовим хранилище...");
      const { documentId, uploadUrl } = await requestUrl.mutateAsync({
        filename: file.name,
        contentType: file.type as (typeof ACCEPTED_TYPES)[number],
        sizeBytes: file.size,
      });

      setProgress("Загружаем файл...");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploadRes.ok) {
        throw new Error(`Ошибка загрузки: ${uploadRes.status}`);
      }

      setProgress("Запускаем разбор...");
      await confirmUpload.mutateAsync({ documentId });

      router.push(`/documents/${documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить файл.");
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold">Загрузить письмо</h1>
      <p className="mt-2 text-sm text-gray-600">
        PDF или фото письма. Поддерживаются ФНС, ФССП, ГИБДД, банки. Без судебных
        приказов и повесток военкомата — это в работу не берётся.
      </p>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="mt-6 rounded-xl border-2 border-dashed p-10 text-center hover:border-gray-400"
      >
        {file ? (
          <div>
            <div className="font-medium">{file.name}</div>
            <div className="text-sm text-gray-500">
              {(file.size / 1024).toFixed(0)} КБ · {file.type}
            </div>
            <button
              onClick={() => setFile(null)}
              className="mt-3 text-sm text-gray-600 underline"
              disabled={uploading}
            >
              Выбрать другой
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600">Перетащите файл сюда</p>
            <label className="mt-3 inline-block cursor-pointer rounded-md bg-black px-4 py-2 text-sm text-white">
              Выбрать файл
              <input
                type="file"
                accept={ACCEPTED_TYPES.join(",")}
                onChange={onFileInput}
                className="hidden"
              />
            </label>
            <p className="mt-3 text-xs text-gray-500">
              PDF, JPEG, PNG, HEIC · до 20 МБ
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {file && (
        <button
          onClick={startUpload}
          disabled={uploading}
          className="mt-6 rounded-md bg-black px-6 py-3 text-white disabled:bg-gray-400"
        >
          {uploading ? progress || "Загружаем..." : "Загрузить и разобрать"}
        </button>
      )}

      <div className="mt-10 rounded-md border bg-yellow-50 p-4 text-xs text-yellow-900">
        ⚠️ Мы не запрашиваем оригиналы и не передаём данные в иностранные сервисы.
        Все файлы хранятся на серверах в РФ и автоматически удаляются через 30 дней.
        Сервис информационный, не заменяет юриста.
      </div>
    </main>
  );
}
