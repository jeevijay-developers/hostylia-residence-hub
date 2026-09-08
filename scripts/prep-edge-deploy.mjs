import fs from "node:fs";
import path from "node:path";

const root = path.resolve("supabase/functions");
const shared = fs.readFileSync(path.join(root, "_shared/msg91.ts"), "utf8");

function prep(fnName, rewriteImport = true) {
  let index = fs.readFileSync(path.join(root, fnName, "index.ts"), "utf8");
  if (rewriteImport) {
    index = index.replaceAll("../_shared/msg91.ts", "./_shared/msg91.ts");
  }
  const payload = {
    name: fnName,
    entrypoint_path: "index.ts",
    files: [
      { name: "index.ts", content: index },
      { name: "_shared/msg91.ts", content: shared },
    ],
  };
  const out = path.join("scripts", `deploy-${fnName}.json`);
  fs.writeFileSync(out, JSON.stringify(payload));
  console.log(out, index.length, shared.length);
}

prep("send-sms-hook");
prep("send-notification");
