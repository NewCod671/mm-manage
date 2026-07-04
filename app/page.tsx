"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { getFirebaseAuth, googleProvider } from "@/lib/firebase-client";
import type { Transaction, TransactionType } from "@/lib/transactions";

const thb = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});

const monthFormatter = new Intl.DateTimeFormat("th-TH", {
  month: "long",
  year: "numeric"
});

const categoryOptions = ["เงินเดือน", "อาหาร", "สั่งของ", "รถ"];

function toMonthKey(date: string) {
  return date.slice(0, 7);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(monthKey: string) {
  return monthFormatter.format(new Date(`${monthKey}-01T00:00:00`));
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    throw new Error(`API returned non-JSON response (${response.status}): ${preview}`);
  }
}

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(toMonthKey(todayInputValue()));
  const [type, setType] = useState<TransactionType>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categoryOptions[1]);
  const [date, setDate] = useState(todayInputValue());

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      return onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setAuthReady(true);
      });
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "Firebase auth failed";
      const frame = window.requestAnimationFrame(() => {
        setError(message);
        setAuthReady(true);
        setIsLoading(false);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;

    async function loadTransactions() {
      if (!authReady) {
        return;
      }

      if (!user) {
        setTransactions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const token = await user.getIdToken();
        const response = await fetch("/api/transactions", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const payload = await readApiResponse<{
          transactions?: Transaction[];
          error?: string;
        }>(response);

        if (!response.ok) {
          throw new Error(payload.error ?? "Load failed");
        }

        if (isCurrent) {
          const nextTransactions = payload.transactions ?? [];
          setTransactions(nextTransactions);
          setSelectedMonth(toMonthKey(nextTransactions[0]?.date ?? todayInputValue()));
          setError("");
        }
      } catch (loadError) {
        if (isCurrent) {
          const message = loadError instanceof Error ? loadError.message : "Load failed";
          setError(message);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadTransactions();

    return () => {
      isCurrent = false;
    };
  }, [authReady, user]);

  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(transactions.map((item) => toMonthKey(item.date))));
    if (!months.includes(selectedMonth)) {
      months.push(selectedMonth);
    }
    return months.sort().reverse();
  }, [selectedMonth, transactions]);

  const visibleTransactions = useMemo(() => {
    return transactions
      .filter((item) => toMonthKey(item.date) === selectedMonth)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedMonth, transactions]);

  const summary = useMemo(() => {
    return visibleTransactions.reduce(
      (total, item) => {
        if (item.type === "income") {
          total.income += item.amount;
        } else {
          total.expense += item.amount;
        }
        total.balance = total.income - total.expense;
        return total;
      },
      { income: 0, expense: 0, balance: 0 }
    );
  }, [visibleTransactions]);

  const totalBalance = useMemo(() => {
    return transactions.reduce((total, item) => {
      return item.type === "income" ? total + item.amount : total - item.amount;
    }, 0);
  }, [transactions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericAmount = Number(amount);
    if (!title.trim() || !category.trim() || !date || numericAmount <= 0) {
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      if (!user) {
        throw new Error("กรุณาเข้าสู่ระบบด้วย Google ก่อน");
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: title.trim(),
          amount: numericAmount,
          type,
          category: category.trim(),
          date
        })
      });
      const payload = await readApiResponse<{
        transaction?: Transaction;
        error?: string;
      }>(response);

      if (!response.ok || !payload.transaction) {
        throw new Error(payload.error ?? "Save failed");
      }

      setTransactions((current) => [payload.transaction as Transaction, ...current]);
      setSelectedMonth(toMonthKey(date));
      setTitle("");
      setAmount("");
      setCategory(categoryOptions[1]);
      setType("expense");
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Save failed";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteTransaction(id: string) {
    setError("");

    try {
      if (!user) {
        throw new Error("กรุณาเข้าสู่ระบบด้วย Google ก่อน");
      }

      const token = await user.getIdToken();
      const response = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const payload = await readApiResponse<{ error?: string }>(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "Delete failed");
      }

      setTransactions((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Delete failed";
      setError(message);
    }
  }

  async function loginWithGoogle() {
    setError("");
    try {
      const auth = getFirebaseAuth();
      await signInWithPopup(auth, googleProvider);
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Google login failed";
      setError(message);
    }
  }

  async function logout() {
    setError("");
    await signOut(getFirebaseAuth());
    setTransactions([]);
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Money Manager</p>
          <h1>จัดการรายรับ - รายจ่าย</h1>
        </div>
        <div className="topActions">
          <div className="authPanel">
            {user ? (
              <>
                <span>{user.displayName ?? user.email}</span>
                <button type="button" onClick={logout}>
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <button type="button" onClick={loginWithGoogle} disabled={!authReady}>
                เข้าสู่ระบบด้วย Google
              </button>
            )}
          </div>
          <label className="monthPicker">
            <span>เดือนที่ดู</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>
        </div>
      </section>

      {error ? (
        <section className="notice" role="alert">
          <strong>เชื่อมต่อฐานข้อมูลไม่ได้</strong>
          <span>{error}</span>
          <span>ตรวจว่าเปิด Firestore Database แล้ว และตั้งค่า Firebase service account ใน Vercel ถูกต้อง</span>
        </section>
      ) : null}

      <section className="summaryGrid" aria-label="สรุปเงินรายเดือน">
        <article className="metric income">
          <span>รายได้</span>
          <strong>{thb.format(summary.income)}</strong>
        </article>
        <article className="metric expense">
          <span>รายจ่าย</span>
          <strong>{thb.format(summary.expense)}</strong>
        </article>
        <article className="metric balance">
          <span>เงินคงเหลือ</span>
          <strong>{thb.format(summary.balance)}</strong>
        </article>
        <article className="metric total">
          <span>เงินรวมทั้งหมด</span>
          <strong>{thb.format(totalBalance)}</strong>
        </article>
      </section>

      <section className="workspace">
        <form className="entryForm" onSubmit={handleSubmit}>
          <h2>เพิ่มรายการ</h2>
          <div className="segmented" role="group" aria-label="ประเภทรายการ">
            <button
              className={type === "income" ? "active" : ""}
              type="button"
              disabled={!user}
              onClick={() => setType("income")}
            >
              รายรับ
            </button>
            <button
              className={type === "expense" ? "active" : ""}
              type="button"
              disabled={!user}
              onClick={() => setType("expense")}
            >
              รายจ่าย
            </button>
          </div>
          <label>
            ชื่อรายการ
            <input
              value={title}
              disabled={!user}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="เช่น เงินเดือน, ค่าอาหาร"
            />
          </label>
          <label>
            จำนวนเงิน
            <input
              min="1"
              type="number"
              value={amount}
              disabled={!user}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </label>
          <label>
            หมวดหมู่
            <select
              value={category}
              disabled={!user}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            วันที่
            <input
              type="date"
              value={date}
              disabled={!user}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button className="submitButton" disabled={!user || isSaving || isLoading} type="submit">
            {isSaving ? "กำลังบันทึก..." : "บันทึกรายการ"}
          </button>
        </form>

        <section className="ledger" aria-label="รายการของเดือนที่เลือก">
          <div className="ledgerHeader">
            <div>
              <p className="eyebrow">รายการเดือน</p>
              <h2>{monthLabel(selectedMonth)}</h2>
            </div>
            <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {availableMonths.map((month) => (
                <option key={month} value={month}>
                  {monthLabel(month)}
                </option>
              ))}
            </select>
          </div>

          <div className="transactionList">
            {!user ? (
              <p className="empty">กรุณาเข้าสู่ระบบด้วย Google เพื่อดูข้อมูลของคุณ</p>
            ) : isLoading ? (
              <p className="empty">กำลังโหลดข้อมูล...</p>
            ) : visibleTransactions.length === 0 ? (
              <p className="empty">ยังไม่มีรายการในเดือนนี้</p>
            ) : (
              visibleTransactions.map((item) => (
                <article className="transaction" key={item.id}>
                  <div className={`typeDot ${item.type}`} aria-hidden="true" />
                  <div className="transactionMain">
                    <strong>{item.title}</strong>
                    <span>
                      {item.category} · {new Date(item.date).toLocaleDateString("th-TH")}
                    </span>
                  </div>
                  <strong className={item.type === "income" ? "moneyIn" : "moneyOut"}>
                    {item.type === "income" ? "+" : "-"}
                    {thb.format(item.amount)}
                  </strong>
                  <button
                    className="iconButton"
                    type="button"
                    aria-label={`ลบ ${item.title}`}
                    title="ลบรายการ"
                    onClick={() => deleteTransaction(item.id)}
                  >
                    ×
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
