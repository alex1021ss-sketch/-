import { getDatabase } from "@netlify/database";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Default admin seeded the first time the dashboard is used. The operator can
// change these from within the dashboard; the new values persist in the
// database, so this default only ever applies to a brand-new, empty install.
const DEFAULT_EMAIL = "admin@admin.com";
const DEFAULT_PASSWORD = "adminadmin";

const normalizeEmail = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = (stored || "").split(":");
  if (!salt || !key) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const keyBuf = Buffer.from(key, "hex");
  return keyBuf.length === derived.length && timingSafeEqual(keyBuf, derived);
}

// Make sure at least one admin exists so the dashboard is reachable on a fresh
// install. Runs inside a guard so concurrent requests cannot create duplicates.
async function ensureSeed(db: ReturnType<typeof getDatabase>) {
  const rows = await db.sql`SELECT COUNT(*)::int AS count FROM admins`;
  if (rows[0].count === 0) {
    const hash = await hashPassword(DEFAULT_PASSWORD);
    await db.sql`
      INSERT INTO admins (email, password_hash)
      VALUES (${DEFAULT_EMAIL}, ${hash})
      ON CONFLICT (email) DO NOTHING
    `;
  }
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ success: false, error: "無效的請求" }, { status: 400 });
  }

  const db = getDatabase();
  await ensureSeed(db);

  const action = body?.action;
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";

  const rows = await db.sql`SELECT * FROM admins WHERE email = ${email}`;
  const admin = rows[0];
  const authorized = admin ? await verifyPassword(password, admin.password_hash) : false;

  if (action === "login") {
    if (!authorized) {
      return Response.json({ success: false, error: "帳號或密碼錯誤" }, { status: 401 });
    }
    return Response.json({
      success: true,
      user: { id: String(admin.id), email: admin.email },
    });
  }

  if (action === "update-credentials") {
    if (!authorized) {
      return Response.json(
        { success: false, error: "目前帳號或密碼錯誤" },
        { status: 401 }
      );
    }

    const newEmail = normalizeEmail(body?.newEmail);
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    const nextEmail = newEmail || admin.email;
    if (!nextEmail.includes("@")) {
      return Response.json(
        { success: false, error: "請輸入有效的 Email" },
        { status: 400 }
      );
    }
    if (newPassword && newPassword.length < 4) {
      return Response.json(
        { success: false, error: "新密碼長度至少 4 個字元" },
        { status: 400 }
      );
    }

    // Reject an email already taken by a different admin account.
    if (nextEmail !== admin.email) {
      const existing = await db.sql`SELECT id FROM admins WHERE email = ${nextEmail}`;
      if (existing.length > 0) {
        return Response.json(
          { success: false, error: "該 Email 已被使用" },
          { status: 409 }
        );
      }
    }

    const nextHash = newPassword
      ? await hashPassword(newPassword)
      : admin.password_hash;

    await db.sql`
      UPDATE admins
      SET email = ${nextEmail}, password_hash = ${nextHash}
      WHERE id = ${admin.id}
    `;

    return Response.json({
      success: true,
      user: { id: String(admin.id), email: nextEmail },
    });
  }

  return Response.json({ success: false, error: "未知操作" }, { status: 400 });
};
