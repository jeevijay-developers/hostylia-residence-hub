import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

/** Digital Asset Links for Android App Links (`com.hostylia.mobile`). */
const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.hostylia.mobile",
      sha256_cert_fingerprints: [
        "REPLACE_WITH_PLAY_APP_SIGNING_SHA256",
        "REPLACE_WITH_EAS_UPLOAD_KEY_SHA256_IF_DIFFERENT",
      ],
    },
  },
];

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(ASSET_LINKS, null, 2), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        }),
    },
  },
});
