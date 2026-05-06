import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const isProd = process.env.NODE_ENV === "production";
    const isInternal =
      error.code === "INTERNAL_SERVER_ERROR" ||
      error.code === "PRECONDITION_FAILED";
    return {
      ...shape,
      message: isProd && isInternal ? "Внутренняя ошибка" : shape.message,
      data: {
        ...shape.data,
        // Никогда не отдаём стектрейсы клиенту.
        stack: undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
