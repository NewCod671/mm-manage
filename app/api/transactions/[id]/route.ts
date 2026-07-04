import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getFirebaseErrorMessage } from "@/lib/firebase-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const ownerId = await getAuthenticatedUserId(request);
    const { id } = await context.params;

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
    return NextResponse.json({ error: getFirebaseErrorMessage(error) }, { status: 500 });
  }
}
