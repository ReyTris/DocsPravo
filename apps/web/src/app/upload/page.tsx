"use client";

import { useState, useEffect, useCallback, useRef, type DragEvent, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { hasSession } from "@/lib/auth-client";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
] as const;
type AcceptedType = (typeof ACCEPTED_TYPES)[number];

// Для некоторых типов браузер не всегда корректно проставляет MIME — определим
// дополнительно по расширению.
function detectMime(file: File): AcceptedType | null {
  if ((ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return file.type as AcceptedType;
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  return null;
}

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 20;
const MAX_TEXT_LEN = 50_000;
const MIN_TEXT_LEN = 20;

type Mode = "files" | "text";

export default function UploadPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("files");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const requestUrls = trpc.documents.requestUploadUrls.useMutation();
  const confirmUpload = trpc.documents.confirmUpload.useMutation();
  const createFromText = trpc.documents.createFromText.useMutation();

  useEffect(() => {
    if (!hasSession()) router.replace("/login");
    const onAuthChanged = () => {
      if (!hasSession()) router.replace("/login");
    };
    window.addEventListener("auth-changed", onAuthChanged);
    return () => window.removeEventListener("auth-changed", onAuthChanged);
  }, [router]);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      acceptFiles(Array.from(e.dataTransfer.files));
    },
    [files],
  );

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) acceptFiles(Array.from(e.target.files));
    // позволяем выбрать те же файлы снова после удаления
    e.target.value = "";
  }

  function acceptFiles(incoming: File[]) {
    setError(null);
    const next = [...files];
    for (const f of incoming) {
      const mime = detectMime(f);
      if (!mime) {
        setError(`Файл "${f.name}": формат не поддерживается. PDF, JPEG, PNG, HEIC.`);
        continue;
      }
      // Если браузер не выставил MIME (часто для .heic/.docx) — пересоздаём File
      // с правильным типом, чтобы и валидация, и Content-Type в presigned-PUT совпали.
      const normalized = f.type === mime ? f : new File([f], f.name, { type: mime });
      if (normalized.size > MAX_BYTES) {
        setError(`Файл "${f.name}" больше 20 МБ.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setError(`Можно загрузить максимум ${MAX_FILES} файлов за раз.`);
        break;
      }
      // дедупликация по имени + размеру
      if (next.some((x) => x.name === normalized.name && x.size === normalized.size)) continue;
      next.push(normalized);
    }
    setFiles(next);
  }

  function removeFile(idx: number) {
    setFiles(files.filter((_, i) => i !== idx));
  }

  function moveFile(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= files.length) return;
    const next = files.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setFiles(next);
  }

  async function startUpload() {
    if (files.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploading(true);
    setError(null);
    try {
      setProgress("Готовим хранилище...");
      const res = await requestUrls.mutateAsync({
        files: files.map((f) => ({
          filename: f.name,
          contentType: f.type as AcceptedType,
          sizeBytes: f.size,
        })),
      });
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      // Параллельная загрузка всех файлов на S3 по pre-signed URL.
      setProgress(`Загружаем ${res.files.length} ${plural(res.files.length, ["файл", "файла", "файлов"])}...`);
      let uploaded = 0;
      await Promise.all(
        res.files.map(async (presigned, i) => {
          const file = files[i]!;
          const uploadRes = await fetch(presigned.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
            signal: controller.signal,
          });
          if (!uploadRes.ok) {
            throw new Error(`Ошибка загрузки "${file.name}": ${uploadRes.status}`);
          }
          uploaded++;
          setProgress(`Загружено ${uploaded} из ${res.files.length}...`);
        }),
      );

      setProgress("Запускаем разбор...");
      await confirmUpload.mutateAsync({ documentId: res.documentId });
      if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");

      router.push(`/documents/${res.documentId}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Загрузка отменена.");
      } else {
        setError(err instanceof Error ? err.message : "Не удалось загрузить файл.");
      }
      setUploading(false);
      setProgress("");
    } finally {
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  async function submitText() {
    setError(null);
    const trimmed = text.trim();
    if (trimmed.length < MIN_TEXT_LEN) {
      setError(`Текст слишком короткий (минимум ${MIN_TEXT_LEN} символов).`);
      return;
    }
    if (trimmed.length > MAX_TEXT_LEN) {
      setError(`Текст слишком длинный (максимум ${MAX_TEXT_LEN} символов).`);
      return;
    }
    setUploading(true);
    setProgress("Отправляем текст...");
    try {
      const res = await createFromText.mutateAsync({
        text: trimmed,
        title: title.trim() || undefined,
      });
      router.push(`/documents/${res.documentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отправить текст.");
      setUploading(false);
      setProgress("");
    }
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-bold">Загрузить письмо</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        PDF или фото письма. Можно несколько страниц/листов одного документа — они будут
        объединены в один разбор. Либо вставьте текст вручную.
      </p>

      <div role="tablist" className="mt-6 inline-flex rounded-md border border-white/10 p-1 text-sm">
        <button
          role="tab"
          aria-selected={mode === "files"}
          onClick={() => {
            setMode("files");
            setError(null);
          }}
          disabled={uploading}
          className={
            "rounded px-4 py-2 " +
            (mode === "files" ? "bg-white/10 font-medium" : "text-[var(--muted)] hover:bg-white/5")
          }
        >
          Файлы
        </button>
        <button
          role="tab"
          aria-selected={mode === "text"}
          onClick={() => {
            setMode("text");
            setError(null);
          }}
          disabled={uploading}
          className={
            "rounded px-4 py-2 " +
            (mode === "text" ? "bg-white/10 font-medium" : "text-[var(--muted)] hover:bg-white/5")
          }
        >
          Текст
        </button>
      </div>

      {mode === "files" && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Зона перетаскивания файлов"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="mt-6 rounded-xl border-2 border-dashed p-8 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-white/30"
        >
          <p className="text-sm text-[var(--muted)]">Перетащите файлы сюда</p>
          <label className="mt-3 inline-block cursor-pointer rounded-md bg-black px-4 py-2 text-sm text-white">
            Выбрать файлы
            <input
              type="file"
              multiple
              accept={[
                ".pdf",
                ".jpg",
                ".jpeg",
                ".png",
                ".heic",
                ...ACCEPTED_TYPES,
              ].join(",")}
              onChange={onFileInput}
              className="hidden"
            />
          </label>
          <p className="mt-3 text-xs text-[var(--muted)]">
            PDF, JPEG, PNG, HEIC · до 20 МБ каждый · максимум {MAX_FILES} файлов
          </p>
        </div>
      )}

      {mode === "text" && (
        <div className="mt-6 space-y-3">
          <div>
            <label htmlFor="doc-title" className="block text-sm font-medium">
              Заголовок (необязательно)
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              maxLength={255}
              placeholder="Например: Требование ФНС от 12.03.2026"
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="doc-text" className="block text-sm font-medium">
              Текст документа
            </label>
            <textarea
              id="doc-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={uploading}
              maxLength={MAX_TEXT_LEN}
              rows={14}
              placeholder="Вставьте сюда полный текст письма / документа..."
              className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 font-mono text-sm"
            />
            <div className="mt-1 text-right text-xs text-[var(--muted)]">
              {text.length.toLocaleString("ru-RU")} / {MAX_TEXT_LEN.toLocaleString("ru-RU")}
            </div>
          </div>
          <button
            onClick={submitText}
            disabled={uploading || text.trim().length < MIN_TEXT_LEN}
            className="rounded-md bg-black px-6 py-3 text-white disabled:bg-gray-400"
          >
            {uploading ? progress || "Отправляем..." : "Разобрать текст"}
          </button>
        </div>
      )}

      {mode === "files" && files.length > 0 && (
        <ul className="mt-6 space-y-2">
          {files.map((f, idx) => (
            <li
              key={`${f.name}_${f.size}_${idx}`}
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {(f.size / 1024).toFixed(0)} КБ · {f.type}
                </div>
              </div>
              <div className="ml-3 flex shrink-0 items-center gap-1">
                <button
                  onClick={() => moveFile(idx, -1)}
                  disabled={idx === 0 || uploading}
                  className="rounded px-2 py-1 text-[var(--muted)] hover:bg-white/10 disabled:opacity-30"
                  title="Выше"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveFile(idx, 1)}
                  disabled={idx === files.length - 1 || uploading}
                  className="rounded px-2 py-1 text-[var(--muted)] hover:bg-white/10 disabled:opacity-30"
                  title="Ниже"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeFile(idx)}
                  disabled={uploading}
                  className="rounded px-2 py-1 text-[var(--danger)] hover:bg-white/10 disabled:opacity-30"
                  title="Удалить"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" aria-live="polite" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {mode === "files" && files.length > 0 && (
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={startUpload}
            disabled={uploading}
            className="rounded-md bg-black px-6 py-3 text-white disabled:bg-gray-400"
          >
            {uploading
              ? progress || "Загружаем..."
              : `Загрузить и разобрать (${files.length} ${plural(files.length, ["файл", "файла", "файлов"])})`}
          </button>
          {uploading && (
            <button
              onClick={cancelUpload}
              className="rounded-md border border-white/20 px-4 py-3 text-sm text-[var(--muted)] hover:bg-white/10"
            >
              Отменить
            </button>
          )}
          <span className="text-xs text-[var(--muted)]">
            Всего: {(totalBytes / 1024 / 1024).toFixed(1)} МБ
          </span>
        </div>
      )}

      <div className="mt-10 rounded-md border border-[var(--warn)]/30 bg-[var(--warn)]/10 p-4 text-xs text-[var(--warn)]">
        ⚠️ Мы не запрашиваем оригиналы и не передаём данные в иностранные сервисы.
        Все файлы хранятся на серверах в РФ и автоматически удаляются через 30 дней.
        Сервис информационный, не заменяет юриста.
      </div>
    </main>
  );
}

function plural(n: number, [one, few, many]: [string, string, string]): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}
