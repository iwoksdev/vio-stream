import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destination = path.join(root, ".env.docker");
try {
  await fs.access(destination);
  console.log(
    ".env.docker already exists; nothing was overwritten. Edit it for your own domain and Jellyfin server.",
  );
} catch {
  const example = await fs.readFile(
    path.join(root, ".env.docker.example"),
    "utf8",
  );
  const output = example.replace(
    /^ARIA2_RPC_SECRET=.*$/m,
    "ARIA2_RPC_SECRET=" + crypto.randomBytes(32).toString("hex"),
  );
  await fs.writeFile(destination, output, { mode: 0o600, flag: "wx" });
  console.log(
    "Created private .env.docker with a random aria2 secret. The secret is not printed.",
  );
}
await fs.mkdir(path.join(root, "media"), { recursive: true });
console.log(
  "Next: edit .env.docker, then run docker compose --env-file .env.docker up -d --build. See DEPLOY.md.",
);
