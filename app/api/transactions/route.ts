import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/db";
import {
  documentToTransaction,
  isTransactionType,
  normalizeDate,
  type TransactionDocument
} from "@/lib/transactions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ownerCookieName = "money_manager_owner_id";

async function getOwnerId() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ownerCookieName)?.value;

  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) {
    return { ownerId: existing, isNew: false };
  }

  return { ownerId: crypto.randomUUID(), isNew: true };
}

function withOwnerCookie(response: NextResponse, ownerId: string, isNew: boolean) {
  if (isNew) {
    response.cookies.set(ownerCookieName, ownerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365
    });
  }

  return response;
}

export async function GET() {
  try {
    const { ownerId, isNew } = await getOwnerId();
    const snapshot = await getDb()
      .collection("transactions")
      .where("ownerId", "==", ownerId)
      .get();
    const transactions = snapshot.docs
      .map((doc) => {
        const data = doc.data() as Omit<TransactionDocument, "id">;
        return documentToTransaction({ id: doc.id, ...data });
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return withOwnerCookie(NextResponse.json({ transactions }), ownerId, isNew);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { ownerId, isNew } = await getOwnerId();
    const body = (await request.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const amount = Number(body.amount);
    const date = normalizeDate(body.date);

    if (!title || !category || !Number.isFinite(amount) || amount <= 0 || !date) {
      return NextResponse.json({ error: "Invalid transaction data" }, { status: 400 });
    }

    if (!isTransactionType(body.type)) {
      return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const transaction: TransactionDocument = {
      id,
      ownerId,
      title,
      amount,
      type: body.type,
      category,
      date
    };

    await getDb()
      .collection("transactions")
      .doc(id)
      .set({
        ownerId,
        title,
        amount,
        type: body.type,
        category,
        date,
        createdAt: FieldValue.serverTimestamp()
      });

    return withOwnerCookie(
      NextResponse.json({ transaction: documentToTransaction(transaction) }, { status: 201 }),
      ownerId,
      isNew
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
