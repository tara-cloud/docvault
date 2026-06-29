import type { SessionOptions } from "iron-session";

export interface SessionData {
  authenticated: boolean;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SECRET_KEY ?? "fallback-dev-key-change-in-production-32chars",
  cookieName: "dv_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production" && process.env.FORCE_HTTPS === "1",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60,
  },
};
