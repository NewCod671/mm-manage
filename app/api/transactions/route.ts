import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureSchema, getSql } from "@/lib/db";
import {
  isTransactionType,
  normalizeDate,
  rowToTransaction,
  type TransactionRow
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
    await ensureSchema();
    const { ownerId, isNew } = await getOwnerId();
    const rows = await getSql()`
      SELECT id, title, amount, type, category, transaction_date
      FROM transactions
      WHERE owner_id = ${ownerId}
      ORDER BY transaction_date DESC, created_at DESC
    `;

    const transactions = rows.map((row) => rowToTransaction(row as TransactionRow));

    return withOwnerCookie(NextResponse.json({ transactions }), ownerId, isNew);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchema();
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
    const rows = await getSql()`
      INSERT INTO transactions (id, owner_id, title, amount, type, category, transaction_date)
      VALUES (${id}, ${ownerId}, ${title}, ${amount}, ${body.type}, ${category}, ${date})
      RETURNING id, title, amount, type, category, transaction_date
    `;

    return withOwnerCookie(
      NextResponse.json(
        { transaction: rowToTransaction(rows[0] as TransactionRow) },
        { status: 201 }
      ),
      ownerId,
      isNew
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
