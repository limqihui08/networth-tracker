import React, { useState, useEffect } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// Storage: uses the browser's localStorage when running outside Claude
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => {
      const v = localStorage.getItem(key);
      if (v === null) throw new Error("not found");
      return { key, value: v };
    },
    set: async (key, value) => {
      localStorage.setItem(key, value);
      return { key, value };
    },
  };
}

// ————— Design tokens: "banker's ledger" —————
const T = {
  bg: "#0C211B",
  panel: "#122B23",
  panelSoft: "#0F2620",
  line: "rgba(237,231,211,0.14)",
  lineSoft: "rgba(237,231,211,0.08)",
  ink: "#EDE7D3",
  muted: "#93A89B",
  brass: "#D9B45B",
  pos: "#84C9A4",
  neg: "#E08B6D",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, monospace",
  sans: "-apple-system, 'Segoe UI', Roboto, sans-serif",
};

const ASSET_CATEGORIES = ["Cash", "CPF", "Investments", "SRS", "Property", "Crypto", "Other"];
const LIABILITY_CATEGORY = "Liabilities";

const CATEGORY_COLORS = {
  Cash: "#8FBF9F",
  CPF: "#D9B45B",
  Investments: "#7FB3A8",
  SRS: "#B0A08F",
  Property: "#C97B5A",
  Crypto: "#A8C686",
  Other: "#8A9A8E",
};

const STORAGE_KEY = "networth:v1";

const DEFAULT_EXPENSES = ["Housing", "Food", "Transport", "Subscriptions", "Insurance", "Fun"];

const DEFAULT_DATA = {
  accounts: [
    { id: "a1", name: "Bank accounts", category: "Cash", value: 0 },
    { id: "a2", name: "CPF Ordinary Account", category: "CPF", value: 0 },
    { id: "a3", name: "CPF Special Account", category: "CPF", value: 0 },
    { id: "a4", name: "CPF MediSave", category: "CPF", value: 0 },
    { id: "a5", name: "IBKR portfolio", category: "Investments", value: 0 },
  ],
  snapshots: [],
  budgets: {},
  projection: { salary: 0, expenses: 0, returnPct: 5, years: 10 },
};

const fmt = (n) =>
  new Intl.NumberFormat("en-SG", {
    style: "currency", currency: "SGD", maximumFractionDigits: 0,
  }).format(n);

const fmtSigned = (n) => (n >= 0 ? "+" : "\u2212") + fmt(Math.abs(n)).replace("SGD", "").trim();

let uid = 0;
const newId = () => `id_${Date.now()}_${uid++}`;

const thisMonthKey = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (key, n) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-SG", { month: "long", year: "numeric" });
};

// ————— Editable value cell —————
function ValueCell({ value, onCommit, negativeStyle, small }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = parseFloat(draft.replace(/[^0-9.\-]/g, ""));
    if (!isNaN(n)) onCommit(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        style={{
          width: small ? 96 : 130, textAlign: "right", fontFamily: T.mono, fontSize: small ? 13 : 14,
          background: T.panelSoft, color: T.ink, border: `1px solid ${T.brass}`,
          borderRadius: 4, padding: "4px 8px", outline: "none",
        }}
        aria-label="Edit value in SGD"
      />
    );
  }
  return (
    <button
      onClick={() => { setDraft(String(value || "")); setEditing(true); }}
      title="Click to edit"
      style={{
        fontFamily: T.mono, fontSize: small ? 13 : 14, fontVariantNumeric: "tabular-nums",
        color: negativeStyle ? T.neg : T.ink, background: "none", border: "none",
        borderBottom: `1px dashed ${T.lineSoft}`, cursor: "pointer", padding: "4px 2px",
      }}
    >
      {fmt(value)}
    </button>
  );
}

// ————— Category block —————
function CategoryBlock({ category, accounts, onUpdate, onAdd, onDelete, isLiability, extraHeader }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const subtotal = accounts.reduce((s, a) => s + a.value, 0);

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, padding: "14px 0 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 2, display: "inline-block",
            background: isLiability ? T.neg : CATEGORY_COLORS[category], transform: "translateY(-1px)",
          }} />
          <span style={{
            fontFamily: T.sans, fontSize: 12, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.muted,
          }}>{category}</span>
          {extraHeader}
        </div>
        <span style={{
          fontFamily: T.mono, fontSize: 13, color: isLiability ? T.neg : T.muted,
          fontVariantNumeric: "tabular-nums",
        }}>
          {isLiability && subtotal > 0 ? "\u2212" : ""}{fmt(subtotal)}
        </span>
      </div>

      {accounts.map((a) => (
        <div key={a.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "6px 0 6px 18px",
        }}>
          <span style={{ fontFamily: T.sans, fontSize: 14.5, color: T.ink, display: "flex", alignItems: "center", gap: 8 }}>
            {a.name}
            <button
              onClick={() => onDelete(a.id)}
              aria-label={`Delete ${a.name}`}
              style={{
                background: "none", border: "none", color: T.muted, cursor: "pointer",
                fontSize: 13, padding: "0 4px", opacity: 0.55,
              }}
            >×</button>
          </span>
          <ValueCell value={a.value} negativeStyle={isLiability} onCommit={(v) => onUpdate(a.id, v)} />
        </div>
      ))}

      {adding ? (
        <div style={{ display: "flex", gap: 8, padding: "6px 0 4px 18px" }}>
          <input
            autoFocus
            placeholder="Account name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) { onAdd(category, name.trim()); setName(""); setAdding(false); }
              if (e.key === "Escape") setAdding(false);
            }}
            style={{
              flex: 1, maxWidth: 260, background: T.panelSoft, color: T.ink,
              border: `1px solid ${T.line}`, borderRadius: 4, padding: "5px 8px",
              fontFamily: T.sans, fontSize: 14, outline: "none",
            }}
          />
          <button
            onClick={() => { if (name.trim()) { onAdd(category, name.trim()); setName(""); } setAdding(false); }}
            style={{
              background: "none", border: `1px solid ${T.line}`, color: T.ink,
              borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 13,
            }}
          >Add</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            background: "none", border: "none", color: T.muted, cursor: "pointer",
            fontFamily: T.sans, fontSize: 13, padding: "4px 0 0 18px",
          }}
        >+ Add account</button>
      )}
    </div>
  );
}

// ————— Small labelled input for projection —————
function LabelledInput({ label, value, onCommit, suffix }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontFamily: T.sans, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(/[^0-9.\-]/g, ""));
            onCommit(isNaN(n) ? 0 : n);
          }}
          style={{
            width: 110, fontFamily: T.mono, fontSize: 14, textAlign: "right",
            background: T.panelSoft, color: T.ink, border: `1px solid ${T.line}`,
            borderRadius: 4, padding: "6px 8px", outline: "none",
          }}
        />
        {suffix && <span style={{ fontFamily: T.sans, fontSize: 13, color: T.muted }}>{suffix}</span>}
      </span>
    </label>
  );
}

// ————— Main —————
export default function NetWorthTracker() {
  const [data, setData] = useState(DEFAULT_DATA);
  const [loaded, setLoaded] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [month, setMonth] = useState(thisMonthKey());
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseName, setExpenseName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const parsed = JSON.parse(r.value);
          setData({
            ...DEFAULT_DATA,
            ...parsed,
            budgets: parsed.budgets || {},
            projection: { ...DEFAULT_DATA.projection, ...(parsed.projection || {}) },
          });
        }
      } catch { /* first run — nothing saved yet */ }
      setLoaded(true);
    })();
  }, []);

  const persist = async (next) => {
    setData(next);
    try {
      await window.storage.set(STORAGE_KEY, JSON.stringify(next));
      setSaveErr("");
    } catch {
      setSaveErr("Couldn't save — changes may not persist.");
    }
  };

  // ————— Net worth —————
  const assets = data.accounts.filter((a) => a.category !== LIABILITY_CATEGORY);
  const liabilities = data.accounts.filter((a) => a.category === LIABILITY_CATEGORY);
  const assetsTotal = assets.reduce((s, a) => s + a.value, 0);
  const liabTotal = liabilities.reduce((s, a) => s + a.value, 0);
  const netWorth = assetsTotal - liabTotal;

  const updateAccount = (id, value) =>
    persist({ ...data, accounts: data.accounts.map((a) => (a.id === id ? { ...a, value } : a)) });
  const addAccount = (category, name) =>
    persist({ ...data, accounts: [...data.accounts, { id: newId(), name, category, value: 0 }] });
  const deleteAccount = (id) =>
    persist({ ...data, accounts: data.accounts.filter((a) => a.id !== id) });

  const recordSnapshot = () => {
    const date = new Date().toISOString().slice(0, 10);
    const snap = { id: Date.now(), date, total: netWorth, assets: assetsTotal, liabilities: liabTotal };
    const rest = data.snapshots.filter((s) => s.date !== date);
    persist({ ...data, snapshots: [...rest, snap].sort((a, b) => a.date.localeCompare(b.date)) });
  };
  const deleteSnapshot = (id) =>
    persist({ ...data, snapshots: data.snapshots.filter((s) => s.id !== id) });

  // ————— Budget —————
  const seedBudget = () => {
    // Copy structure (names + budgets) from the most recent earlier month, if any
    const earlier = Object.keys(data.budgets).filter((k) => k < month).sort().pop();
    if (earlier) {
      return {
        income: data.budgets[earlier].income,
        expenses: data.budgets[earlier].expenses.map((e) => ({ ...e, id: newId(), actual: 0 })),
      };
    }
    return { income: 0, expenses: DEFAULT_EXPENSES.map((n) => ({ id: newId(), name: n, budget: 0, actual: 0 })) };
  };

  const budget = data.budgets[month] || seedBudget();
  const setBudget = (b) => persist({ ...data, budgets: { ...data.budgets, [month]: b } });

  const budgetTotal = budget.expenses.reduce((s, e) => s + e.budget, 0);
  const actualTotal = budget.expenses.reduce((s, e) => s + e.actual, 0);
  const savedThisMonth = budget.income - actualTotal;

  // ————— Projection —————
  const proj = data.projection;
  const setProj = (p) => persist({ ...data, projection: { ...proj, ...p } });
  const monthlySavings = proj.salary - proj.expenses;
  const projPoints = (() => {
    const pts = [];
    let nw = netWorth;
    const r = (proj.returnPct || 0) / 100 / 12;
    const years = Math.max(1, Math.min(40, proj.years || 10));
    for (let m = 0; m <= years * 12; m++) {
      if (m > 0) nw = nw * (1 + r) + monthlySavings;
      if (m % 12 === 0) pts.push({ label: m === 0 ? "Now" : `Y${m / 12}`, value: Math.round(nw) });
    }
    return pts;
  })();
  const projEnd = projPoints[projPoints.length - 1]?.value ?? netWorth;

  const lastSnap = data.snapshots[data.snapshots.length - 1];
  const change = lastSnap ? netWorth - lastSnap.total : null;

  const allocation = ASSET_CATEGORIES
    .map((c) => ({ c, v: assets.filter((a) => a.category === c).reduce((s, a) => s + a.value, 0) }))
    .filter((x) => x.v > 0);

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: T.muted, fontFamily: T.sans, fontSize: 14 }}>Opening the ledger…</span>
      </div>
    );
  }

  const panelStyle = { background: T.panel, border: `1px solid ${T.lineSoft}`, borderRadius: 8, padding: "6px 20px 20px" };
  const h2Style = { fontFamily: T.serif, fontWeight: 400, fontSize: 19, color: T.ink, margin: "14px 0 10px" };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "0 16px 64px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Header */}
        <header style={{ padding: "40px 0 8px" }}>
          <div style={{ fontFamily: T.sans, fontSize: 11, letterSpacing: "0.2em", color: T.muted, textTransform: "uppercase" }}>
            Personal ledger · SGD
          </div>
          <h1 style={{ fontFamily: T.serif, fontWeight: 400, fontSize: 30, color: T.ink, margin: "6px 0 18px" }}>
            Net worth
          </h1>

          <div style={{
            borderTop: `3px double ${T.brass}`, borderBottom: `3px double ${T.brass}`,
            padding: "18px 4px", display: "flex", flexWrap: "wrap",
            justifyContent: "space-between", alignItems: "baseline", gap: 12,
          }}>
            <span style={{
              fontFamily: T.mono, fontSize: "clamp(30px, 6vw, 44px)",
              color: T.brass, fontVariantNumeric: "tabular-nums",
            }}>
              {fmt(netWorth)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 14, color: change == null ? T.muted : change >= 0 ? T.pos : T.neg }}>
              {change == null
                ? "no entries recorded yet"
                : `${fmtSigned(change)} since ${lastSnap.date}`}
            </span>
          </div>
          {saveErr && <div style={{ color: T.neg, fontFamily: T.sans, fontSize: 13, marginTop: 8 }}>{saveErr}</div>}
        </header>

        {/* Allocation bar */}
        {assetsTotal > 0 && (
          <section style={{ margin: "22px 0 6px" }}>
            <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", border: `1px solid ${T.lineSoft}` }}>
              {allocation.map((x) => (
                <div key={x.c} style={{ width: `${(x.v / assetsTotal) * 100}%`, background: CATEGORY_COLORS[x.c] }} title={`${x.c}: ${fmt(x.v)}`} />
              ))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 8 }}>
              {allocation.map((x) => (
                <span key={x.c} style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CATEGORY_COLORS[x.c], display: "inline-block" }} />
                  {x.c} {Math.round((x.v / assetsTotal) * 100)}%
                </span>
              ))}
            </div>
          </section>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 28, marginTop: 26 }}>

          {/* Accounts */}
          <section style={panelStyle}>
            <h2 style={h2Style}>Assets</h2>
            {ASSET_CATEGORIES.map((c) => (
              <CategoryBlock
                key={c}
                category={c}
                accounts={assets.filter((a) => a.category === c)}
                onUpdate={updateAccount}
                onAdd={addAccount}
                onDelete={deleteAccount}
              />
            ))}

            <h2 style={{ ...h2Style, marginTop: 26 }}>Liabilities</h2>
            <CategoryBlock
              category={LIABILITY_CATEGORY}
              accounts={liabilities}
              onUpdate={updateAccount}
              onAdd={addAccount}
              onDelete={deleteAccount}
              isLiability
            />
          </section>

          {/* Monthly budget */}
          <section style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 4px", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ ...h2Style, margin: 0 }}>Monthly budget</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
                  style={{ background: "none", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>‹</button>
                <span style={{ fontFamily: T.serif, fontSize: 16, color: T.ink, minWidth: 130, textAlign: "center" }}>{monthLabel(month)}</span>
                <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"
                  style={{ background: "none", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>›</button>
              </div>
            </div>

            {/* Income */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${T.line}`, padding: "10px 0", marginTop: 10 }}>
              <span style={{ fontFamily: T.sans, fontSize: 14.5, color: T.ink }}>Take-home income</span>
              <ValueCell value={budget.income} onCommit={(v) => setBudget({ ...budget, income: v })} />
            </div>

            {/* Expense table header */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 110px 110px 24px", gap: 8,
              borderTop: `1px solid ${T.line}`, padding: "8px 0 4px",
              fontFamily: T.sans, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted,
            }}>
              <span>Expense</span>
              <span style={{ textAlign: "right" }}>Budget</span>
              <span style={{ textAlign: "right" }}>Actual</span>
              <span />
            </div>

            {budget.expenses.map((e) => {
              const over = e.budget > 0 && e.actual > e.budget;
              return (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 24px", gap: 8, alignItems: "center", padding: "4px 0" }}>
                  <span style={{ fontFamily: T.sans, fontSize: 14.5, color: T.ink }}>
                    {e.name}
                    {over && <span style={{ color: T.neg, fontSize: 12, marginLeft: 8 }}>over</span>}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <ValueCell small value={e.budget} onCommit={(v) => setBudget({ ...budget, expenses: budget.expenses.map((x) => x.id === e.id ? { ...x, budget: v } : x) })} />
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <ValueCell small negativeStyle={over} value={e.actual} onCommit={(v) => setBudget({ ...budget, expenses: budget.expenses.map((x) => x.id === e.id ? { ...x, actual: v } : x) })} />
                  </span>
                  <button
                    onClick={() => setBudget({ ...budget, expenses: budget.expenses.filter((x) => x.id !== e.id) })}
                    aria-label={`Delete ${e.name}`}
                    style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", opacity: 0.55 }}
                  >×</button>
                </div>
              );
            })}

            {addingExpense ? (
              <div style={{ display: "flex", gap: 8, padding: "8px 0 4px" }}>
                <input
                  autoFocus
                  placeholder="Expense name"
                  value={expenseName}
                  onChange={(e) => setExpenseName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && expenseName.trim()) {
                      setBudget({ ...budget, expenses: [...budget.expenses, { id: newId(), name: expenseName.trim(), budget: 0, actual: 0 }] });
                      setExpenseName(""); setAddingExpense(false);
                    }
                    if (e.key === "Escape") setAddingExpense(false);
                  }}
                  style={{
                    flex: 1, maxWidth: 260, background: T.panelSoft, color: T.ink,
                    border: `1px solid ${T.line}`, borderRadius: 4, padding: "5px 8px",
                    fontFamily: T.sans, fontSize: 14, outline: "none",
                  }}
                />
                <button
                  onClick={() => {
                    if (expenseName.trim()) setBudget({ ...budget, expenses: [...budget.expenses, { id: newId(), name: expenseName.trim(), budget: 0, actual: 0 }] });
                    setExpenseName(""); setAddingExpense(false);
                  }}
                  style={{ background: "none", border: `1px solid ${T.line}`, color: T.ink, borderRadius: 4, padding: "5px 12px", cursor: "pointer", fontSize: 13 }}
                >Add</button>
              </div>
            ) : (
              <button onClick={() => setAddingExpense(true)}
                style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontFamily: T.sans, fontSize: 13, padding: "6px 0 0" }}>
                + Add expense
              </button>
            )}

            {/* Budget summary */}
            <div style={{
              borderTop: `1px solid ${T.line}`, marginTop: 12, paddingTop: 12,
              display: "flex", flexWrap: "wrap", gap: "8px 28px",
              fontFamily: T.mono, fontSize: 13.5, fontVariantNumeric: "tabular-nums",
            }}>
              <span style={{ color: T.muted }}>Budgeted <span style={{ color: T.ink }}>{fmt(budgetTotal)}</span></span>
              <span style={{ color: T.muted }}>Spent <span style={{ color: actualTotal > budgetTotal && budgetTotal > 0 ? T.neg : T.ink }}>{fmt(actualTotal)}</span></span>
              <span style={{ color: T.muted }}>Saved <span style={{ color: savedThisMonth >= 0 ? T.pos : T.neg }}>{fmt(savedThisMonth)}</span></span>
            </div>
          </section>

          {/* Projection */}
          <section style={panelStyle}>
            <h2 style={h2Style}>Projected net worth</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 22px", alignItems: "flex-end", marginBottom: 6 }}>
              <LabelledInput label="Monthly salary" value={proj.salary} onCommit={(v) => setProj({ salary: v })} />
              <LabelledInput label="Monthly expenses" value={proj.expenses} onCommit={(v) => setProj({ expenses: v })} />
              <LabelledInput label="Annual return" value={proj.returnPct} onCommit={(v) => setProj({ returnPct: v })} suffix="%" />
              <LabelledInput label="Horizon" value={proj.years} onCommit={(v) => setProj({ years: v })} suffix="yrs" />
              <button
                onClick={() => setProj({ salary: budget.income, expenses: budgetTotal })}
                style={{
                  background: "none", border: `1px solid ${T.line}`, color: T.brass,
                  borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontFamily: T.sans, fontSize: 12,
                }}
              >Pull from {monthLabel(month).split(" ")[0]} budget</button>
            </div>

            <div style={{
              display: "flex", flexWrap: "wrap", gap: "8px 28px", margin: "6px 0 14px",
              fontFamily: T.mono, fontSize: 13.5, fontVariantNumeric: "tabular-nums",
            }}>
              <span style={{ color: T.muted }}>Monthly savings <span style={{ color: monthlySavings >= 0 ? T.pos : T.neg }}>{fmt(monthlySavings)}</span></span>
              <span style={{ color: T.muted }}>In {Math.max(1, Math.min(40, proj.years || 10))} years <span style={{ color: T.brass }}>{fmt(projEnd)}</span></span>
            </div>

            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projPoints} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.pos} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={T.pos} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={T.lineSoft} vertical={false} />
                  <XAxis dataKey="label" stroke={T.muted} tick={{ fontSize: 11, fontFamily: T.mono }} tickLine={false} axisLine={false} />
                  <YAxis stroke={T.muted} tick={{ fontSize: 11, fontFamily: T.mono }} tickLine={false} axisLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} width={48} />
                  <Tooltip
                    formatter={(v) => [fmt(v), "Projected"]}
                    contentStyle={{ background: T.panelSoft, border: `1px solid ${T.line}`, borderRadius: 6, fontFamily: T.mono, fontSize: 13, color: T.ink }}
                    labelStyle={{ color: T.muted }}
                  />
                  <Area type="monotone" dataKey="value" stroke={T.pos} strokeWidth={2} fill="url(#proj)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, marginTop: 10 }}>
              A simple compound model: current net worth grows at the annual return, plus (salary − expenses) added each month. It ignores CPF contributions, bonuses, inflation, and taxes — a sketch, not a plan.
            </p>
          </section>

          {/* History */}
          <section style={panelStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 4px" }}>
              <h2 style={{ ...h2Style, margin: 0 }}>History</h2>
              <button
                onClick={recordSnapshot}
                style={{
                  background: T.brass, color: "#1B1508", border: "none", borderRadius: 4,
                  padding: "7px 14px", cursor: "pointer", fontFamily: T.sans, fontSize: 13, fontWeight: 600,
                }}
              >Record entry</button>
            </div>
            <p style={{ fontFamily: T.sans, fontSize: 13, color: T.muted, margin: "2px 0 14px" }}>
              Record an entry whenever you update your balances — each one becomes a line in the ledger below.
            </p>

            {data.snapshots.length >= 2 && (
              <div style={{ height: 220, marginBottom: 10 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.snapshots} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.brass} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={T.brass} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={T.lineSoft} vertical={false} />
                    <XAxis dataKey="date" stroke={T.muted} tick={{ fontSize: 11, fontFamily: T.mono }} tickLine={false} axisLine={false} />
                    <YAxis stroke={T.muted} tick={{ fontSize: 11, fontFamily: T.mono }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} width={44} />
                    <Tooltip
                      formatter={(v) => [fmt(v), "Net worth"]}
                      contentStyle={{ background: T.panelSoft, border: `1px solid ${T.line}`, borderRadius: 6, fontFamily: T.mono, fontSize: 13, color: T.ink }}
                      labelStyle={{ color: T.muted }}
                    />
                    <Area type="monotone" dataKey="total" stroke={T.brass} strokeWidth={2} fill="url(#nw)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {data.snapshots.length === 0 ? (
              <div style={{ fontFamily: T.sans, fontSize: 14, color: T.muted, padding: "18px 0" }}>
                The ledger is empty. Set your balances above, then record your first entry.
              </div>
            ) : (
              <div>
                {[...data.snapshots].reverse().map((s, i, arr) => {
                  const prev = arr[i + 1];
                  const delta = prev ? s.total - prev.total : null;
                  return (
                    <div key={s.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderTop: `1px solid ${T.lineSoft}`, padding: "8px 0",
                      fontFamily: T.mono, fontSize: 13.5, fontVariantNumeric: "tabular-nums",
                    }}>
                      <span style={{ color: T.muted }}>{s.date}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {delta != null && (
                          <span style={{ color: delta >= 0 ? T.pos : T.neg, fontSize: 12.5 }}>{fmtSigned(delta)}</span>
                        )}
                        <span style={{ color: T.ink }}>{fmt(s.total)}</span>
                        <button
                          onClick={() => deleteSnapshot(s.id)}
                          aria-label={`Delete entry ${s.date}`}
                          style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", opacity: 0.55 }}
                        >×</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <footer style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, marginTop: 22, opacity: 0.8 }}>
          All figures in SGD. Data is saved in this browser on this computer.
        </footer>
      </div>
    </div>
  );
}
