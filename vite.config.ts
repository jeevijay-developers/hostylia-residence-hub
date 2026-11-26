// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    environments: {
      client: {
        build: {
          rolldownOptions: {
            output: {
              codeSplitting: {
                // Only the matched modules: shared helpers they use (e.g. tslib) stay in
                // their own chunks, or every importer of those would load the SDK too.
                includeDependenciesRecursively: false,
                groups: [
                  {
                    // The Supabase SDK (~50 KB gzipped) gets its own chunk. Without this
                    // Rolldown folds it into the entry bundle, because the entry
                    // dynamic-imports it (auth listener, serverFn auth middleware,
                    // _authenticated beforeLoad) and every dashboard chunk shares it,
                    // so marketing visitors would download it on first paint.
                    name: "supabase",
                    test: /node_modules[\/](@supabase|iceberg-js)[\/]|[\/]src[\/]integrations[\/]supabase[\/]client\.ts$/,
                  },
                ],
              },
            },
          },
        },
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
