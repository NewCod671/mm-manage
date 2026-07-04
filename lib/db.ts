import postgres from "postgres";

declare global {
  var moneyManagerSql: postgres.Sql | undefined;
}

const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

export function getSql() {
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL");
  }

  globalThis.moneyManagerSql ??= postgres(connectionString, {
    max: 1,
    prepare: false
  });

  return globalThis.moneyManagerSql;
}

let schemaReady: Promise<void> | undefined;

export function ensureSchema() {
  schemaReady ??= getSql()`
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY,
      owner_id UUID NOT NULL,
      title TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      category TEXT NOT NULL,
      transaction_date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `.then(async () => {
    await getSql()`
      CREATE INDEX IF NOT EXISTS transactions_owner_date_idx
      ON transactions (owner_id, transaction_date DESC)
    `;
  });

  return schemaReady;
}
