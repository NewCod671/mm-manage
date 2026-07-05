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

const defaultCategoryOptions = ["เงินเดือน", "อาหาร", "สั่งของ", "รถ"];
const categoryStorageKey = "money-manager-categories";
const themeStorageKey = "money-manager-theme";
const weekOptions = ["1", "2", "3", "4"] as const;
type Theme = "light" | "dark";

function toMonthKey(date: string) {
  return date.slice(0, 7);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(monthKey: string) {
  return monthFormatter.format(new Date(`${monthKey}-01T00:00:00`));
}

function getWeekOfMonth(date: string) {
  const day = Number(date.slice(8, 10));
  return Math.min(Math.ceil(day / 7), 4).toString();
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
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [type, setType] = useState<TransactionType>("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(defaultCategoryOptions);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [category, setCategory] = useState(defaultCategoryOptions[1]);
  const [newCategory, setNewCategory] = useState("");
  const [date, setDate] = useState(todayInputValue());
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedTheme = window.localStorage.getItem(themeStorageKey);
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const nextTheme =
        savedTheme === "dark" || savedTheme === "light"
          ? savedTheme
          : prefersDark
            ? "dark"
            : "light";

      setTheme(nextTheme);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
    const frame = window.requestAnimationFrame(() => {
      const savedCategories = window.localStorage.getItem(categoryStorageKey);

      if (savedCategories) {
        try {
          const parsedCategories = JSON.parse(savedCategories) as unknown;
          if (Array.isArray(parsedCategories)) {
            const nextCategories = parsedCategories.filter(
              (item): item is string => typeof item === "string" && item.trim().length > 0
            );

            if (nextCategories.length > 0) {
              setCategoryOptions(Array.from(new Set([...defaultCategoryOptions, ...nextCategories])));
            }
          }
        } catch {
          window.localStorage.removeItem(categoryStorageKey);
        }
      }

      setCategoriesLoaded(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (categoriesLoaded) {
      window.localStorage.setItem(categoryStorageKey, JSON.stringify(categoryOptions));
    }
  }, [categoriesLoaded, categoryOptions]);

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

  const availableCategories = useMemo(() => {
    const categories = transactions.map((item) => item.category).filter(Boolean);
    return Array.from(new Set([...categoryOptions, ...categories])).sort((a, b) =>
      a.localeCompare(b, "th")
    );
  }, [categoryOptions, transactions]);

  const visibleTransactions = useMemo(() => {
    return transactions
      .filter((item) => {
        const isSelectedMonth = toMonthKey(item.date) === selectedMonth;
        const isSelectedWeek = selectedWeek === "all" || getWeekOfMonth(item.date) === selectedWeek;
        const isSelectedCategory =
          selectedCategory === "all" || item.category === selectedCategory;

        return isSelectedMonth && isSelectedWeek && isSelectedCategory;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedCategory, selectedMonth, selectedWeek, transactions]);

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
      setCategory(categoryOptions[1] ?? defaultCategoryOptions[1]);
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

  function addCategory() {
    const nextCategory = newCategory.trim();
    if (!nextCategory) {
      return;
    }

    setCategoryOptions((current) => Array.from(new Set([...current, nextCategory])));
    setCategory(nextCategory);
    setSelectedCategory(nextCategory);
    setNewCategory("");
  }

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Money Manager</p>
          <h1>จัดการรายรับ - รายจ่าย</h1>
        </div>
        <div className="topActions">
          <button
            className="themeToggle"
            type="button"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
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
            ประเภทการซื้อ
            <select
              value={category}
              disabled={!user}
              onChange={(event) => setCategory(event.target.value)}
            >
              {availableCategories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <div className="addCategory">
            <label>
              เพิ่มประเภท
              <input
                value={newCategory}
                disabled={!user}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="เช่น ของใช้, เดินทาง"
              />
            </label>
            <button type="button" disabled={!user || !newCategory.trim()} onClick={addCategory}>
              เพิ่ม
            </button>
          </div>
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
            <div className="filters">
              <label>
                เดือน
                <select
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                >
                  {availableMonths.map((month) => (
                    <option key={month} value={month}>
                      {monthLabel(month)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                สัปดาห์
                <select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)}>
                  <option value="all">ทั้งหมด</option>
                  {weekOptions.map((week) => (
                    <option key={week} value={week}>
                      สัปดาห์ที่ {week}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ประเภท
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                >
                  <option value="all">ทั้งหมด</option>
                  {availableCategories.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="transactionList">
            {!user ? (
              <p className="empty">กรุณาเข้าสู่ระบบด้วย Google เพื่อดูข้อมูลของคุณ</p>
            ) : isLoading ? (
              <p className="empty">กำลังโหลดข้อมูล...</p>
            ) : visibleTransactions.length === 0 ? (
              <p className="empty">ยังไม่มีรายการตามตัวกรองนี้</p>
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
