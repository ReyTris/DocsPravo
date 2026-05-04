import { router } from "../trpc.js";
import { authRouter } from "./auth.js";
import { documentsRouter } from "./documents.js";
import { paymentsRouter } from "./payments.js";

export const appRouter = router({
  auth: authRouter,
  documents: documentsRouter,
  payments: paymentsRouter,
});

export type AppRouter = typeof appRouter;
