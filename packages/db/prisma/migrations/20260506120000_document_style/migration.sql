-- AlterTable: добавляем опциональный стиль пересказа документа.
-- NULL = классический разбор. Поле читается воркером после pipeline
-- и решает, запускать ли шаг stylize.
ALTER TABLE "Document" ADD COLUMN "style" TEXT;
