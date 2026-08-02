import type { Context } from "hono";
import { store, type PersonaRole, type UserRecord } from "../db/store";
import type { Env } from "../config";

export interface AuthUser {
  id: string;
  email: string;
  role: PersonaRole;
}

/**
 * Dev personas (ALLOW_DEV_AUTH):
 *   Bearer admin     → admin@ade.local
 *   Bearer operator  → jeffry@example.com (default operator)
 *   Bearer viewer    → viewer@ade.local
 *   Bearer dev       → same as operator
 *   Bearer dev:<email>
 */
export function resolveAuth(c: Context, cfg: Env): AuthUser | null {
  const header = c.req.header("authorization") ?? c.req.header("Authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();

  if (cfg.ALLOW_DEV_AUTH) {
    const personaMap: Record<string, string> = {
      admin: "admin@ade.local",
      operator: "jeffry@example.com",
      viewer: "viewer@ade.local",
      dev: "jeffry@example.com",
    };
    if (personaMap[token]) {
      const user = store.getUserByEmail(personaMap[token]);
      if (!user) return null;
      return { id: user.id, email: user.email, role: user.role };
    }
    if (token.startsWith("dev:")) {
      const email = token.slice(4);
      const user = store.getUserByEmail(email) ?? store.getUser("user_demo");
      if (!user) return null;
      return { id: user.id, email: user.email, role: user.role };
    }
  }

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

export function requireRole(
  c: Context,
  cfg: Env,
  roles: PersonaRole[],
): AuthUser | Response {
  const auth = requireAuth(c, cfg);
  if (auth instanceof Response) return auth;
  if (!roles.includes(auth.role)) {
    return new Response(
      JSON.stringify({ error: "forbidden", required: roles, role: auth.role }),
      { status: 403, headers: { "content-type": "application/json" } },
    );
  }
  return auth;
}

export function userRecord(auth: AuthUser): UserRecord | undefined {
  return store.getUser(auth.id);
}
