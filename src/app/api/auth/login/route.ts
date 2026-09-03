import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_TTL_SECONDS,
  createAuthCookie,
  isPasswordValid,
} from "@/lib/auth";

export async function POST(request: Request) {
  let password: unknown;
  try {
    ({ password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof password !== "string" || !isPasswordValid(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, createAuthCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AUTH_TTL_SECONDS,
  });
  return res;
}
