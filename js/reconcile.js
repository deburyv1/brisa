/* ============================================
   BRISA - Reconcile Module
   Bank vs Brisa balance check. No backend: the last
   bank figure lives in localStorage (zero migrations).
   ============================================ */

const KEY = "brisa.bankCheck";

export function localDateKey(date = new Date()) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7);
}

export function readBankCheck() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

export function writeBankCheck(accountId, bank) {
  const rec = {
    accountId,
    bank: Number(bank),
    date: localDateKey(),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    // ignore
  }
  return rec;
}

// Posted movements only (planned excluded), same rule as finance.js
export function brisaBalance(account, allTxs) {
  const initial = Number(account?.initial_balance) || 0;
  const net = (allTxs || [])
    .filter(t => t.status !== "planned" && String(t.account_id) === String(account?.id))
    .reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  return initial + net;
}

// diff = bank - brisa. Negative: bank lower (Brisa misses expenses).
export function bankDiff(account, allTxs, check) {
  if (!check || String(check.accountId) !== String(account?.id)) return null;
  const brisa = brisaBalance(account, allTxs);
  return { brisa, bank: Number(check.bank) || 0, diff: (Number(check.bank) || 0) - brisa, date: check.date };
}
