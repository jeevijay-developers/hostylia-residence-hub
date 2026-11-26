import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

// Same behaviour as the generated attachSupabaseAuth (src/integrations/supabase/
// auth-attacher.ts): attach the caller's bearer token to every serverFn RPC.
// It imports the Supabase SDK on the first call instead of statically, because
// a static import here puts the SDK in the entry bundle of every page, including
// the marketing site, which never calls a server function on load.
const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
