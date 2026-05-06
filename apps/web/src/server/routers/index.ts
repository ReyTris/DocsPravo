import { router } from "../trpc";
import { authRouter } from "./auth";
import { documentsRouter } from "./documents";
import { pagesRouter } from "./pages";
import { paymentsRouter } from "./payments";

export const appRouter = router({
  auth: authRouter,
  documents: documentsRouter,
  pages: pagesRouter,
  payments: paymentsRouter,
});

export type AppRouter = typeof appRouter;
