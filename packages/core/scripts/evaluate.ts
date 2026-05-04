/**
 * Прогон датасета через цепочку и подсчёт метрик качества.
 *
 * Запуск из корня репозитория:
 *   pnpm --filter @pravoletter/core evaluate
 *
 * Корневой .env должен содержать:
 *   LLM_PROVIDER=openai|gigachat
 *   OPENAI_API_KEY=...   (для openai)
 *   GIGACHAT_AUTH_KEY=... (для gigachat)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createLLMProvider, runPipeline } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Expected {
  id: string;
  expected_classify: { type: string; min_confidence: number };
  expected_pipeline_status?: string;
  expected_fields?: {
    deadline_iso?: string;
    total_amount_rub?: number;
    main_amount_rub?: number;
    must_consult_lawyer?: boolean;
    legal_articles_nk?: string[];
  };
  must_not_appear?: string[];
}

const ALLOWED_NK = new Set([
  "31", "32", "44", "45", "46", "47", "48", "52", "57", "69", "70", "75", "88", "100", "101",
]);

function findSamples(root: string): string[] {
  return readdirSync(root)
    .map((e) => join(root, e))
    .filter((p) => statSync(p).isDirectory())
    .sort();
}

function getProvider() {
  const which = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();
  if (which === "gigachat") {
    if (!process.env.GIGACHAT_AUTH_KEY) throw new Error("GIGACHAT_AUTH_KEY не задан");
    return createLLMProvider({ kind: "gigachat", authKey: process.env.GIGACHAT_AUTH_KEY });
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY не задан");
  return createLLMProvider({
    kind: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  });
}

async function main() {
  const samplesDir = resolve(__dirname, "..", "dataset", "samples");
  const dirs = findSamples(samplesDir);
  if (dirs.length === 0) {
    console.error("Нет сэмплов в", samplesDir);
    process.exit(1);
  }
  const provider = getProvider();
  console.log(`Provider: ${provider.name}\nСэмплов: ${dirs.length}\n`);

  let okType = 0, okStatus = 0, okDeadline = 0, hadDeadline = 0;
  let okTotal = 0, hadTotal = 0, halluc = 0;
  const failed: string[] = [];

  for (const dir of dirs) {
    const id = dir.split(/[\\/]/).pop()!;
    process.stdout.write(`[${id}] ... `);
    const ocr = readFileSync(join(dir, "ocr.txt"), "utf8");
    const exp: Expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
    try {
      const r = await runPipeline(provider, ocr);
      const expStatus = exp.expected_pipeline_status ?? "ok";
      if (r.status === expStatus) okStatus++;
      if (r.classify?.type === exp.expected_classify.type) okType++;

      if (exp.expected_fields?.deadline_iso) {
        hadDeadline++;
        if (r.analysis?.critical_deadline?.date_iso === exp.expected_fields.deadline_iso) okDeadline++;
      }
      if (exp.expected_fields?.total_amount_rub !== undefined) {
        hadTotal++;
        const itog = r.analysis?.amounts_breakdown.find((a) => /итог/i.test(a.description));
        if (itog && Math.abs((itog.amount_rub ?? 0) - exp.expected_fields.total_amount_rub) <= 1) okTotal++;
      }
      for (const ref of r.analysis?.legal_basis ?? []) {
        if (ref.code === "NK_RF" && !ALLOWED_NK.has(ref.article)) halluc++;
      }
      console.log("OK");
    } catch (err) {
      console.log("CRASH:", err instanceof Error ? err.message : err);
      failed.push(id);
    }
  }

  const total = dirs.length;
  console.log("\n=== Метрики ===");
  console.log(`Тип:                 ${okType}/${total}`);
  console.log(`Статус пайплайна:    ${okStatus}/${total}`);
  console.log(`Дата срока:          ${okDeadline}/${hadDeadline}`);
  console.log(`Итоговая сумма:      ${okTotal}/${hadTotal}`);
  console.log(`Галлюцинации статей: ${halluc} (цель 0)`);
  if (failed.length) {
    console.log(`Упавшие:             ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
