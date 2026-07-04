import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getFirebaseErrorMessage } from "@/lib/firebase-error";
import {
  documentToTransaction,
  isTransactionType,
  normalizeDate,
  type TransactionDocument
} from "@/lib/transactions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await getAuthenticatedUserId(request);
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

    return NextResponse.json({ transactions });
  } catch (error) {
    return NextResponse.json({ error: getFirebaseErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = await getAuthenticatedUserId(request);
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

    return NextResponse.json({ transaction: documentToTransaction(transaction) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getFirebaseErrorMessage(error) }, { status: 500 });
  }
}
