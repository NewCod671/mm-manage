export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
};

export type TransactionRow = {
  id: string;
  title: string;
  amount: string | number;
  type: TransactionType;
  category: string;
  transaction_date: string | Date;
};

export function isTransactionType(value: unknown): value is TransactionType {
  return value === "income" || value === "expense";
}

export function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

export function rowToTransaction(row: TransactionRow): Transaction {
  const date =
    row.transaction_date instanceof Date
      ? row.transaction_date.toISOString().slice(0, 10)
      : String(row.transaction_date).slice(0, 10);

  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    date
  };
}
