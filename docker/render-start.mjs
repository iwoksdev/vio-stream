import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const root = path.resolve(process.env.PERSISTENT_ROOT || "/var/data");
const ariaPort = Number(process.env.ARIA2_LOCAL_PORT || 6800);
const secret = process.env.ARIA2_RPC_SECRET;
if (!secret || !/^[A-Za-z0-9_-]{24,200}$/.test(secret))
  throw new Error(
    "Set a strong ARIA2_RPC_SECRET in Render runtime settings. Never use your Render API key here.",
  );
if (!Number.isInteger(ariaPort) || ariaPort < 1024 || ariaPort > 65535)
  throw new Error("Invalid private RPC port.");
const accountDir = path.join(root, "accounts"),
  downloads = path.join(root, "downloads"),
  ariaDir = path.join(root, "aria2");
for (const dir of [root, accountDir, downloads, ariaDir]) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.getuid?.() === 0) await fs.chown(dir, 1000, 1000);
  await fs.chmod(dir, 0o700);
}
if (process.getuid?.() === 0) {
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
process.umask(0o077);
process.env.DATA_DIR = accountDir;
process.env.DOWNLOAD_DIR = downloads;
process.env.ARIA2_RPC_URL = `http://127.0.0.1:${ariaPort}/jsonrpc`;
const session = path.join(ariaDir, "session.txt");
try {
  await fs.access(session);
} catch {
  await fs.writeFile(session, "", { mode: 0o600 });
}
const confDir = await fs.mkdtemp(path.join(os.tmpdir(), "vio-aria2-"));
const conf = path.join(confDir, "aria2.conf");
const limit = String(process.env.ARIA2_DOWNLOAD_LIMIT || "0");
if (!/^\d+[KMG]?$/.test(limit))
  throw new Error("Invalid download speed limit.");
await fs.writeFile(
  conf,
  [
    `dir=${downloads}`,
    "enable-rpc=true",
    "rpc-listen-all=false",
    `rpc-listen-port=${ariaPort}`,
    `rpc-secret=${secret}`,
    "rpc-allow-origin-all=false",
    "rpc-max-request-size=2M",
    "daemon=false",
    "continue=true",
    "allow-overwrite=false",
    "auto-file-renaming=true",
    "max-concurrent-downloads=2",
    "max-connection-per-server=3",
    "split=3",
    "seed-time=0",
    "seed-ratio=0.0",
    `input-file=${session}`,
    `save-session=${session}`,
    "save-session-interval=30",
    "force-save=true",
    "console-log-level=warn",
    "enable-color=false",
    "summary-interval=0",
    `max-overall-download-limit=${limit}`,
  ].join("\n") + "\n",
  { mode: 0o600 },
);
const children = [];
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  const deadline = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
    process.exit(code);
  }, 12000);
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else child.once("exit", resolve);
        }),
    ),
  );
  clearTimeout(deadline);
  await fs.rm(confDir, { recursive: true, force: true });
  process.exit(code);
}
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void stop(0));
function launch(command, args, label) {
  const child = spawn(command, args, { stdio: "inherit", env: process.env });
  children.push(child);
  child.on("error", () => {
    console.error(`${label} could not start.`);
    void stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${label} exited; stopping service.`);
      void stop(code || 1);
    }
  });
  return child;
}
launch("aria2c", [`--conf-path=${conf}`], "aria2");
let ready = false;
for (let attempt = 0; attempt < 40 && !stopping; attempt++) {
  try {
    const response = await fetch(process.env.ARIA2_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "startup",
        method: "aria2.getVersion",
        params: [`token:${secret}`],
      }),
      signal: AbortSignal.timeout(1000),
    });
    const data = await response.json();
    if (response.ok && data.result?.version) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (!ready) {
  console.error("Private aria2 did not become ready.");
  await stop(1);
}
console.log(
  "VIO: persistent storage and private aria2 ready; starting web service.",
);
launch(process.execPath, ["server.mjs"], "VIO");
