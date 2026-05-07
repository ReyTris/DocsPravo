import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[820px] px-6 py-10">
      <article className="prose prose-neutral max-w-none text-[15px] leading-[1.7] text-[var(--text)] [&_h1]:text-[28px] [&_h1]:font-bold [&_h1]:mt-0 [&_h1]:mb-3 [&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-2 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:my-3 [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc [&_ol]:my-3 [&_ol]:pl-6 [&_ol]:list-decimal [&_li]:my-1 [&_a]:text-[var(--brand)] [&_a]:underline [&_strong]:font-semibold">
        {children}
      </article>
    </main>
  );
}
