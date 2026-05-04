/**
 * Типизированный tRPC-клиент для использования в React.
 * AppRouter — только тип, server-код в бандл не попадает.
 */
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers";

export const trpc = createTRPCReact<AppRouter>();
