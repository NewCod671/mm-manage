export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
};

export type TransactionDocument = {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  ownerId: string;
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

export function documentToTransaction(document: TransactionDocument): Transaction {
  return {
    id: document.id,
    title: document.title,
    amount: document.amount,
    type: document.type,
    category: document.category,
    date: document.date
  };
}
