import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, requireUser } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const identity = await requireUser(request);
    const adminRecord = await getAdminDb()
      .collection("admins")
      .doc(identity.uid)
      .get();
    if (!adminRecord.exists) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
    }

    await getAdminAuth().updateUser(identity.uid, {
      email,
      password,
      emailVerified: false,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not update admin login details.",
    }, { status: 400 });
  }
}
