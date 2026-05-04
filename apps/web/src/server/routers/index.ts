import { router } from "../trpc";
import { authRouter } from "./auth";
import { documentsRouter } from "./documents";
import { paymentsRouter } from "./payments";

export const appRouter = router({
  auth: authRouter,
  documents: documentsRouter,
  payments: paymentsRouter,
});

export type AppRouter = typeof appRouter;
