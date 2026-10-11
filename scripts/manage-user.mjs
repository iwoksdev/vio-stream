import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { openStore, hashPassword } from "../server/store.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const [command, email, name = "دوست ویو"] = process.argv.slice(2);
if (!["list", "create", "reset"].includes(command)) {
  console.log(
    "Usage: node scripts/manage-user.mjs list | create EMAIL NAME | reset EMAIL",
  );
  console.log(
    "For create/reset, supply VIO_NEW_PASSWORD in the environment (10–200 characters). No password is printed.",
  );
  process.exit(1);
}
const db = openStore(root);
try {
  if (command === "list") {
    console.table(
      db
        .prepare("SELECT id,name,email,role FROM users ORDER BY created_at")
        .all(),
    );
  } else {
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      throw new Error("Valid email required.");
    const password = process.env.VIO_NEW_PASSWORD;
    if (!password || password.length < 10 || password.length > 200)
      throw new Error("Set VIO_NEW_PASSWORD to 10–200 characters.");
    const hash = await hashPassword(password);
    const normalized = email.trim().toLowerCase();
    if (command === "create") {
      if (db.prepare("SELECT id FROM users WHERE email=?").get(normalized))
        throw new Error("This account already exists.");
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
        crypto.randomUUID(),
        name.slice(0, 60),
        normalized,
        hash,
        "user",
        Date.now(),
      );
      console.log("Account created.");
    } else {
      const user = db
        .prepare("SELECT id FROM users WHERE email=?")
        .get(normalized);
      if (!user) throw new Error("Account not found.");
      db.transaction(() => {
        db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(
          hash,
          user.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      })();
      console.log("Password reset; previous sessions revoked.");
    }
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
