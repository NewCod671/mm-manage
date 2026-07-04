import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ownerCookieName = "money_manager_owner_id";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const ownerId = cookieStore.get(ownerCookieName)?.value;
    const { id } = await context.params;

    if (!ownerId || !/^[0-9a-f-]{36}$/i.test(ownerId)) {
      return NextResponse.json({ error: "Owner not found" }, { status: 401 });
    }

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
    }

    const documentRef = getDb().collection("transactions").doc(id);
    const document = await documentRef.get();

    if (!document.exists || document.data()?.ownerId !== ownerId) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    await documentRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
