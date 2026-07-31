import type { Context } from "hono";
import { store } from "../db/store";
import type { Env } from "../config";

export interface AuthUser {
  id: string;
  email: string;
}

/** Dev bearer: "Bearer dev" or "Bearer dev:<email>" maps to demo user. */
export function resolveAuth(
  c: Context,
  cfg: Env,
): AuthUser | null {
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();

  if (cfg.ALLOW_DEV_AUTH && (token === "dev" || token.startsWith("dev:"))) {
    const email = token.startsWith("dev:")
      ? token.slice(4)
      : "jeffry@example.com";
    const user = store.getUserByEmail(email) ?? store.getUser("user_demo");
    if (!user) return null;
    return { id: user.id, email: user.email };
  }

  // Production: validate JWT / session token here
  // For scaffold, reject unknown tokens unless dev auth
  return null;
}

export function requireAuth(c: Context, cfg: Env): AuthUser | Response {
  const user = resolveAuth(c, cfg);
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return user;
}
