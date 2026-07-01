import { NextResponse } from "next/server";
import { AUTH_COOKIE, expectedAuthCookie, isPasswordValid } from "@/lib/auth";

const THIRTY_DAYS_S = 60 * 60 * 24 * 30;

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
  res.cookies.set(AUTH_COOKIE, expectedAuthCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS_S,
  });
  return res;
}
