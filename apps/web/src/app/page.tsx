import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-bold">Разбор писем от государства и банков</h1>
      <p className="mt-4 text-lg text-gray-700">
        Загрузите письмо из ФНС, ФССП, банка или ГИБДД — получите структурированный разбор:
        что это за документ, сроки, варианты действий.
      </p>

      <div className="mt-8 rounded-lg border bg-yellow-50 p-4 text-sm text-yellow-900">
        Это информационно-справочный сервис с использованием AI. Не является юридической консультацией.
        При суммах от 100 000 ₽, судебных или уголовных делах — обратитесь к юристу.
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href="/upload"
          className="inline-block rounded-lg bg-black px-6 py-3 text-white hover:bg-gray-800"
        >
          Загрузить письмо →
        </Link>
        <Link
          href="/login"
          className="inline-block rounded-lg border px-6 py-3 hover:bg-gray-50"
        >
          У меня уже есть аккаунт
        </Link>
      </div>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        <Feature title="📄 Понятный разбор" body="Объясняем, что написано в документе, без канцелярита." />
        <Feature title="⏰ Сроки и последствия" body="Чётко показываем ключевые даты и что будет при пропуске." />
        <Feature title="🔒 Данные в РФ" body="Серверы и обработка — в России. Письма не уходят за границу." />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm text-gray-600">{body}</p>
    </div>
  );
}
