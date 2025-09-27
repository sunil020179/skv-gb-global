import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Download, FileDown, Lock, Unlock } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";

// --- Types ---
type Money = number;

type Company = {
  // --- Company & Bank (for PDF header/footer) ---
const DEFAULT_CONTACT = {
  email: "info@skvchatgb.com",
  website: "skvchatgb.com",
  addressFallback: "Deira Gold Souq",
};

const BANK = {
  line1: "Bank Name: Abu Dhabi Commercial Bank",
  line2: "Account Name: SKV Business Services LLC",
  line3: "Account No: 14302897920001",
  line4: "IBAN: AE780030014302897920001",
  line5: "SWIFT Code: ADCBAEAA",
};

  name: string;
  trn?: string; // VAT/TRN
  address?: string;
  phone?: string;
  email?: string;
};

type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  trn?: string;
  address?: string;
};

type Sale = {
  id: string;
  date: string; // YYYY-MM-DD
  invoiceNo: string;
  customerId: string; // link to customer
  taxable: Money; // before VAT
  vatRate: number; // e.g. 5 for 5%
  note?: string;
};

type Purchase = {
  id: string;
  date: string;
  billNo: string;
  supplier: string;
  taxable: Money;
  vatRate: number;
  note?: string;
};

type Payment = {
  id: string;
  date: string;
  mode: "Cash" | "Bank";
  ref?: string; // invoice/bill ref
  amount: Money;
  direction: "In" | "Out"; // In = receipt, Out = payment
  note?: string;
};

// --- Helpers ---
const fmt = (n: number) =>
  isNaN(n)
    ? "-"
    : n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
const toNum = (v: string) => (v === "" ? 0 : Number(v));
const uid = () => Math.random().toString(36).slice(2);

const VAT = (base: number, rate: number) => base * (rate / 100);
const totalWithVat = (base: number, rate: number) => base + VAT(base, rate);

const saveLocal = <T,>(key: string, data: T) =>
  localStorage.setItem(key, JSON.stringify(data));
const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

const asCSV = (rows: string[][]) =>
  rows.map((r) => r.map((c) => `"${(c ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");

// --- Login Gate (PIN) ---
function LoginGate({ children }: { children: React.ReactNode }) {
  const [requirePin, setRequirePin] = useState<boolean>(() =>
    readLocal("skvgb.requirePin", false)
  );
  const [storedPin, setStoredPin] = useState<string>(() =>
    readLocal("skvgb.pin", "")
  );
  const [authed, setAuthed] = useState<boolean>(() => !requirePin);

  useEffect(() => saveLocal("skvgb.requirePin", requirePin), [requirePin]);
  useEffect(() => saveLocal("skvgb.pin", storedPin), [storedPin]);

  if (requirePin && !authed) {
    return <LoginScreen onSubmit={(p) => setAuthed(p === storedPin)} />;
  }

  return (
    <>
      <div className="bg-amber-50 border-b text-amber-700 text-xs px-4 py-2">
        {requirePin ? "PIN login enabled" : "PIN login disabled"}
      </div>
      <div className="max-w-6xl mx-auto px-4 py-3 flex gap-2 items-center">
        <button
          onClick={() => setRequirePin((v) => !v)}
          className={`px-3 py-1.5 rounded-xl border text-xs flex items-center gap-2 ${
            requirePin ? "bg-slate-900 text-white" : "bg-white"
          }`}
        >
          {requirePin ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          {requirePin ? "Disable PIN" : "Enable PIN"}
        </button>
        <input
          type="password"
          value={storedPin}
          onChange={(e) => setStoredPin(e.target.value)}
          placeholder="Set PIN"
          className="px-3 py-1.5 rounded-xl border text-xs w-40"
        />
        <span className="text-xs text-slate-500">
          (ब्राउज़र-स्तर सुरक्षा; पूर्ण सुरक्षा के लिए बैकएंड लॉगिन जोड़ा जाएगा)
        </span>
      </div>
      {children}
    </>
  );
}

function LoginScreen({ onSubmit }: { onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  return (
    <div className="min-h-screen grid place-items-center bg-slate-50">
      <div className="bg-white p-6 rounded-2xl shadow border w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-2">Enter PIN</h2>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          className="w-full px-3 py-2 rounded-xl border"
        />
        <button
          onClick={() => onSubmit(pin)}
          className="mt-3 w-full px-3 py-2 rounded-xl bg-slate-900 text-white"
        >
          Login
        </button>
      </div>
    </div>
  );
}

// --- UI ---
export default function App() {
  const [tab, setTab] = useState<
    "sales" | "purchases" | "payments" | "reports" | "customers" | "settings"
  >("sales");

  const [sales, setSales] = useState<Sale[]>(() =>
    readLocal("skvgb.sales", [])
  );
  const [purchases, setPurchases] = useState<Purchase[]>(() =>
    readLocal("skvgb.purchases", [])
  );
  const [payments, setPayments] = useState<Payment[]>(() =>
    readLocal("skvgb.payments", [])
  );
  const [customers, setCustomers] = useState<Customer[]>(() =>
    readLocal("skvgb.customers", [])
  );

  const [company, setCompany] = useState<Company>(() =>
    readLocal("skvgb.company", {
      name: "SKV GB Global",
      trn: "",
      address: "",
      phone: "",
      email: "",
    })
  );
  const [defaultVat, setDefaultVat] = useState<number>(() =>
    readLocal("skvgb.vat", 5)
  );
  const [invPrefix, setInvPrefix] = useState<string>(() =>
    readLocal("skvgb.inv.prefix", "INV-")
  );
  const [invNext, setInvNext] = useState<number>(() =>
    readLocal("skvgb.inv.next", 1)
  );

  useEffect(() => saveLocal("skvgb.sales", sales), [sales]);
  useEffect(() => saveLocal("skvgb.purchases", purchases), [purchases]);
  useEffect(() => saveLocal("skvgb.payments", payments), [payments]);
  useEffect(() => saveLocal("skvgb.company", company), [company]);
  useEffect(() => saveLocal("skvgb.vat", defaultVat), [defaultVat]);
  useEffect(() => saveLocal("skvgb.customers", customers), [customers]);
  useEffect(() => saveLocal("skvgb.inv.prefix", invPrefix), [invPrefix]);
  useEffect(() => saveLocal("skvgb.inv.next", invNext), [invNext]);

  const totals = useMemo(() => {
    const salesTax = sales.reduce((s, x) => s + VAT(x.taxable, x.vatRate), 0);
    const salesBase = sales.reduce((s, x) => s + x.taxable, 0);
    const salesGross = salesBase + salesTax;

    const purTax = purchases.reduce(
      (s, x) => s + VAT(x.taxable, x.vatRate),
      0
    );
    const purBase = purchases.reduce((s, x) => s + x.taxable, 0);
    const purGross = purBase + purTax;

    const receipts = payments
      .filter((p) => p.direction === "In")
      .reduce((s, x) => s + x.amount, 0);
    const payouts = payments
      .filter((p) => p.direction === "Out")
      .reduce((s, x) => s + x.amount, 0);

    return {
      salesBase,
      salesTax,
      salesGross,
      purBase,
      purTax,
      purGross,
      receipts,
      payouts,
      vatPayable: Math.max(0, salesTax - purTax),
      vatRecoverable: Math.max(0, purTax - salesTax),
      profitApprox: salesBase - purBase,
    };
  }, [sales, purchases, payments]);

  const exportSales = () => {
    const rows = [
      ["Date", "Invoice", "Customer", "Taxable", "VAT%", "VAT Amt", "Total", "Note"],
      ...sales.map((s) => {
        const c = customers.find((c) => c.id === s.customerId)?.name || "-";
        return [
          s.date,
          s.invoiceNo,
          c,
          fmt(s.taxable),
          s.vatRate + "%",
          fmt(VAT(s.taxable, s.vatRate)),
          fmt(totalWithVat(s.taxable, s.vatRate)),
          s.note || "",
        ];
      }),
    ];
    downloadCSV(asCSV(rows), `sales_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const exportPurchases = () => {
    const rows = [
      ["Date", "Bill", "Supplier", "Taxable", "VAT%", "VAT Amt", "Total", "Note"],
      ...purchases.map((p) => [
        p.date,
        p.billNo,
        p.supplier,
        fmt(p.taxable),
        p.vatRate + "%",
        fmt(VAT(p.taxable, p.vatRate)),
        fmt(totalWithVat(p.taxable, p.vatRate)),
        p.note || "",
      ]),
    ];
    downloadCSV(
      asCSV(rows),
      `purchases_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };
  const exportPayments = () => {
    const rows = [
      ["Date", "Mode", "Direction", "Amount", "Ref", "Note"],
      ...payments.map((p) => [
        p.date,
        p.mode,
        p.direction,
        fmt(p.amount),
        p.ref || "",
        p.note || "",
      ]),
    ];
    downloadCSV(
      asCSV(rows),
      `payments_${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const genInvoiceNo = () => {
    const v = `${invPrefix}${String(invNext).padStart(4, "0")}`;
    setInvNext(invNext + 1);
    return v;
  };

  return (
    <LoginGate>
      <div className="min-h-screen bg-slate-50 text-slate-800">
        <header className="sticky top-0 z-20 bg-white/70 backdrop-blur border-b">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                {company?.name || "skv-gb-global"}
              </h1>
              <p className="text-xs text-slate-500">
                TRN: {company.trn || "—"} · {company.email || "—"} ·{" "}
                {company.phone || "—"}
              </p>
              <p className="text-xs text-slate-500">{company.address || ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
                placeholder="Company name"
                className="px-3 py-2 rounded-xl border"
              />
              <input
                value={company.trn || ""}
                onChange={(e) => setCompany({ ...company, trn: e.target.value })}
                placeholder="TRN"
                className="px-3 py-2 rounded-xl border w-36"
              />
              <input
                value={company.email || ""}
                onChange={(e) => setCompany({ ...company, email: e.target.value })}
                placeholder="Email"
                className="px-3 py-2 rounded-xl border w-48"
              />
              <input
                value={company.phone || ""}
                onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                placeholder="Phone"
                className="px-3 py-2 rounded-xl border w-36"
              />
              <input
                value={company.address || ""}
                onChange={(e) =>
                  setCompany({ ...company, address: e.target.value })
                }
                placeholder="Address"
                className="px-3 py-2 rounded-xl border w-56"
              />
              <input
                type="number"
                value={defaultVat}
                onChange={(e) =>
                  setDefaultVat(Number(e.target.value) || 0)
                }
                className="px-3 py-2 rounded-xl border w-20"
              />
              <span className="text-sm text-slate-500">VAT %</span>
            </div>
          </div>
          <div className="max-w-6xl mx-auto px-4 pb-2 flex gap-2">
            {[
              { k: "sales", label: "Sales" },
              { k: "purchases", label: "Purchases" },
              { k: "payments", label: "Payments" },
              { k: "reports", label: "Reports" },
              { k: "customers", label: "Customers" },
              { k: "settings", label: "Settings" },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k as any)}
                className={`px-3 py-2 rounded-xl border text-sm ${
                  tab === t.k ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">
          {tab === "sales" && (
            <SalesForm
              sales={sales}
              setSales={setSales}
              defaultVat={defaultVat}
              onExport={exportSales}
              company={company}
              customers={customers}
              genInvoiceNo={genInvoiceNo}
            />
          )}
          {tab === "purchases" && (
            <PurchaseForm
              purchases={purchases}
              setPurchases={setPurchases}
              defaultVat={defaultVat}
              onExport={exportPurchases}
            />
          )}
          {tab === "payments" && (
            <PaymentsForm
              payments={payments}
              setPayments={setPayments}
              onExport={exportPayments}
              company={company}
            />
          )}
          {tab === "reports" && <Reports totals={totals} />}
          {tab === "customers" && (
            <CustomersTab customers={customers} setCustomers={setCustomers} />
          )}
          {tab === "settings" && (
            <SettingsTab
              invPrefix={invPrefix}
              setInvPrefix={setInvPrefix}
              invNext={invNext}
              setInvNext={setInvNext}
            />
          )}
        </main>
      </div>
    </LoginGate>
  );
}

// --- Customers Tab ---
function CustomersTab({
  customers,
  setCustomers,
}: {
  customers: Customer[];
  setCustomers: (c: Customer[]) => void;
}) {
  const [x, setX] = useState<Customer>({
    id: uid(),
    name: "",
    phone: "",
    email: "",
    trn: "",
    address: "",
  });
  const add = () => {
    if (!x.name) return alert("Customer name required");
    setCustomers([{ ...x, id: uid() }, ...customers]);
    setX({
      id: uid(),
      name: "",
      phone: "",
      email: "",
      trn: "",
      address: "",
    });
  };
  const del = (id: string) => setCustomers(customers.filter((c) => c.id !== id));
  return (
    <div className="grid gap-4">
      <SectionCard title="Add Customer">
        <div className="grid md:grid-cols-6 gap-3">
          <input
            placeholder="Name"
            value={x.name}
            onChange={(e) => setX({ ...x, name: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Phone"
            value={x.phone || ""}
            onChange={(e) => setX({ ...x, phone: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Email"
            value={x.email || ""}
            onChange={(e) => setX({ ...x, email: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="TRN"
            value={x.trn || ""}
            onChange={(e) => setX({ ...x, trn: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Address"
            value={x.address || ""}
            onChange={(e) => setX({ ...x, address: e.target.value })}
            className="px-3 py-2 rounded-xl border col-span-2"
          />
          <div className="col-span-6 flex justify-end">
            <button
              onClick={add}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white"
            >
              Add Customer
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Customers List">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                {["Name", "Phone", "Email", "TRN", "Address", ""].map((h) => (
                  <th key={h} className="py-2 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">{c.name}</td>
                  <td className="py-2 pr-3">{c.phone}</td>
                  <td className="py-2 pr-3">{c.email}</td>
                  <td className="py-2 pr-3">{c.trn}</td>
                  <td className="py-2 pr-3">{c.address}</td>
                  <td className="py-2 pr-3 text-right">
                    <button onClick={() => del(c.id)} className="text-red-600">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No customers yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

// --- Settings Tab ---
function SettingsTab({
  invPrefix,
  setInvPrefix,
  invNext,
  setInvNext,
}: {
  invPrefix: string;
  setInvPrefix: (v: string) => void;
  invNext: number;
  setInvNext: (v: number) => void;
}) {
  return (
    <div className="grid gap-4">
      <SectionCard title="Invoicing Settings">
        <div className="grid md:grid-cols-6 gap-3 items-center">
          <label className="text-sm text-slate-500">Invoice Prefix</label>
          <input
            value={invPrefix}
            onChange={(e) => setInvPrefix(e.target.value)}
            className="px-3 py-2 rounded-xl border"
          />
          <label className="text-sm text-slate-500">Next Number</label>
          <input
            type="number"
            value={invNext}
            onChange={(e) => setInvNext(Number(e.target.value) || 1)}
            className="px-3 py-2 rounded-xl border"
          />
          <div className="text-xs text-slate-500 col-span-2">
            "Auto" बटन Sales form में invoice no. generate करता है (prefix + running)
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function SalesForm({
  sales,
  setSales,
  defaultVat,
  onExport,
  company,
  customers,
  genInvoiceNo,
}: {
  sales: Sale[];
  setSales: (s: Sale[]) => void;
  defaultVat: number;
  onExport: () => void;
  company: Company;
  customers: Customer[];
  genInvoiceNo: () => string;
}) {
  const [x, setX] = useState<Sale>({
    id: uid(),
    date: today(),
    invoiceNo: "",
    customerId: customers[0]?.id || "",
    taxable: 0,
    vatRate: defaultVat,
    note: "",
  });
  useEffect(() => {
    setX((v) => ({ ...v, vatRate: defaultVat }));
  }, [defaultVat]);
  useEffect(() => {
    if (!x.customerId && customers[0])
      setX((v) => ({ ...v, customerId: customers[0].id }));
  }, [customers]);

  const add = () => {
    if (!x.date || !x.invoiceNo || !x.customerId)
      return alert("Please fill Date, Invoice#, Customer.");
    setSales([{ ...x, id: uid() }, ...sales]);
    setX({
      id: uid(),
      date: today(),
      invoiceNo: "",
      customerId: customers[0]?.id || "",
      taxable: 0,
      vatRate: defaultVat,
      note: "",
    });
  };
  const del = (id: string) => setSales(sales.filter((s) => s.id !== id));

  const mkInvoicePDF = (s: Sale) => {
    const doc = new jsPDF();
    const line = (y: number) => doc.line(14, y, 196, y);

    // Header
    doc.setFontSize(16);
    doc.text(company?.name || "skv-gb-global", 14, 18);
    doc.setFontSize(10);
    const headRight = [
      `TRN: ${company.trn || "-"}`,
      company.email || "",
      company.phone || "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    doc.text(headRight, 196, 18, { align: "right" });
    if (company.address) doc.text(company.address, 14, 24);

    line(28);

    // Title
    doc.setFontSize(14);
    doc.text("TAX INVOICE", 14, 38);
    doc.setFontSize(10);
    doc.text(`Invoice #: ${s.invoiceNo}`, 14, 46);
    doc.text(`Date: ${s.date}`, 80, 46);

    const cust = customers.find((c) => c.id === s.customerId);
    doc.text(
      `Bill To: ${cust?.name || "-"}` + (cust?.trn ? ` · TRN: ${cust.trn}` : ""),
      14,
      54
    );
    if (cust?.address) doc.text(String(cust.address), 14, 60);

    (doc as any).autoTable({
      startY: 68,
      head: [["#", "Particulars", "Taxable", "VAT %", "VAT Amt", "Total"]],
      body: [
        [
          "1",
          s.note || "Service",
          fmt(s.taxable),
          `${s.vatRate}%`,
          fmt(VAT(s.taxable, s.vatRate)),
          fmt(totalWithVat(s.taxable, s.vatRate)),
        ],
      ],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 14, right: 14 },
    });

    const y = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(
      `Amount in words: ${amountInWords(totalWithVat(s.taxable, s.vatRate))}`,
      14,
      y
    );

    doc.save(`${s.invoiceNo}.pdf`);
  };

  const gross = totalWithVat(x.taxable, x.vatRate);

  return (
    <>
      <SectionCard title="Add Sale">
        <div className="grid md:grid-cols-6 gap-3">
          <input
            type="date"
            value={x.date}
            onChange={(e) => setX({ ...x, date: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <div className="flex gap-2">
            <input
              placeholder="Invoice #"
              value={x.invoiceNo}
              onChange={(e) => setX({ ...x, invoiceNo: e.target.value })}
              className="px-3 py-2 rounded-xl border"
            />
            <button
              onClick={() => setX((v) => ({ ...v, invoiceNo: genInvoiceNo() }))}
              className="px-3 py-2 rounded-xl border"
            >
              Auto
            </button>
          </div>
          <select
            value={x.customerId}
            onChange={(e) => setX({ ...x, customerId: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Taxable"
            value={x.taxable}
            onChange={(e) => setX({ ...x, taxable: toNum(e.target.value) })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            type="number"
            step="0.01"
            placeholder="VAT %"
            value={x.vatRate}
            onChange={(e) => setX({ ...x, vatRate: toNum(e.target.value) })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Note / Particulars"
            value={x.note || ""}
            onChange={(e) => setX({ ...x, note: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-slate-500">
            VAT: {fmt(VAT(x.taxable, x.vatRate))} · Total: {fmt(gross)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={add}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Sale
            </button>
            <button
              onClick={onExport}
              className="px-3 py-2 rounded-xl border flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Sales List">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                {[
                  "Date",
                  "Invoice",
                  "Customer",
                  "Taxable",
                  "VAT%",
                  "VAT Amt",
                  "Total",
                  "Note",
                  "",
                ].map((h) => (
                  <th key={h} className="py-2 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const c = customers.find((c) => c.id === s.customerId);
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{s.date}</td>
                    <td className="py-2 pr-3">{s.invoiceNo}</td>
                    <td className="py-2 pr-3">{c?.name || "-"}</td>
                    <td className="py-2 pr-3 text-right">{fmt(s.taxable)}</td>
                    <td className="py-2 pr-3 text-right">{s.vatRate}%</td>
                    <td className="py-2 pr-3 text-right">
                      {fmt(VAT(s.taxable, s.vatRate))}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      {fmt(totalWithVat(s.taxable, s.vatRate))}
                    </td>
                    <td className="py-2 pr-3">{s.note}</td>
                    <td className="py-2 pr-3 text-right flex gap-2 justify-end">
                      <button
                        onClick={() => mkInvoicePDF(s)}
                        className="px-2 py-1.5 rounded-lg border flex items-center gap-1"
                      >
                        <FileDown className="w-4 h-4" />
                        PDF
                      </button>
                      <button
                        onClick={() => del(s.id)}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400">
                    No sales yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function PurchaseForm({
  purchases,
  setPurchases,
  defaultVat,
  onExport,
}: {
  purchases: Purchase[];
  setPurchases: (p: Purchase[]) => void;
  defaultVat: number;
  onExport: () => void;
}) {
  const [x, setX] = useState<Purchase>({
    id: uid(),
    date: today(),
    billNo: "",
    supplier: "",
    taxable: 0,
    vatRate: defaultVat,
    note: "",
  });
  useEffect(() => {
    setX((v) => ({ ...v, vatRate: defaultVat }));
  }, [defaultVat]);
  const add = () => {
    if (!x.date || !x.billNo || !x.supplier)
      return alert("Please fill Date, Bill#, Supplier.");
    setPurchases([{ ...x, id: uid() }, ...purchases]);
    setX({
      id: uid(),
      date: today(),
      billNo: "",
      supplier: "",
      taxable: 0,
      vatRate: defaultVat,
      note: "",
    });
  };
  const del = (id: string) =>
    setPurchases(purchases.filter((s) => s.id !== id));
  const gross = totalWithVat(x.taxable, x.vatRate);

  return (
    <>
      <SectionCard title="Add Purchase">
        <div className="grid md:grid-cols-6 gap-3">
          <input
            type="date"
            value={x.date}
            onChange={(e) => setX({ ...x, date: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Bill #"
            value={x.billNo}
            onChange={(e) => setX({ ...x, billNo: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Supplier"
            value={x.supplier}
            onChange={(e) => setX({ ...x, supplier: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Taxable"
            value={x.taxable}
            onChange={(e) => setX({ ...x, taxable: toNum(e.target.value) })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            type="number"
            step="0.01"
            placeholder="VAT %"
            value={x.vatRate}
            onChange={(e) => setX({ ...x, vatRate: toNum(e.target.value) })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Note"
            value={x.note || ""}
            onChange={(e) => setX({ ...x, note: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-slate-500">
            VAT: {fmt(VAT(x.taxable, x.vatRate))} · Total: {fmt(gross)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={add}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Purchase
            </button>
            <button
              onClick={onExport}
              className="px-3 py-2 rounded-xl border flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Purchases List">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                {[
                  "Date",
                  "Bill",
                  "Supplier",
                  "Taxable",
                  "VAT%",
                  "VAT Amt",
                  "Total",
                  "Note",
                  "",
                ].map((h) => (
                  <th key={h} className="py-2 pr-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {purchases.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{s.date}</td>
                  <td className="py-2 pr-3">{s.billNo}</td>
                  <td className="py-2 pr-3">{s.supplier}</td>
                  <td className="py-2 pr-3 text-right">{fmt(s.taxable)}</td>
                  <td className="py-2 pr-3 text-right">{s.vatRate}%</td>
                  <td className="py-2 pr-3 text-right">
                    {fmt(VAT(s.taxable, s.vatRate))}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {fmt(totalWithVat(s.taxable, s.vatRate))}
                  </td>
                  <td className="py-2 pr-3">{s.note}</td>
                  <td className="py-2 pr-3 text-right">
                    <button
                      onClick={() => del(s.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {purchases.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-400">
                    No purchases yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function PaymentsForm({
  payments,
  setPayments,
  onExport,
  company,
}: {
  payments: Payment[];
  setPayments: (p: Payment[]) => void;
  onExport: () => void;
  company: Company;
}) {
  const [x, setX] = useState<Payment>({
    id: uid(),
    date: today(),
    mode: "Cash",
    direction: "In",
    amount: 0,
    ref: "",
    note: "",
  });
  const add = () => {
    if (!x.date || !x.amount) return alert("Please fill Date & Amount.");
    setPayments([{ ...x, id: uid() }, ...payments]);
    setX({
      id: uid(),
      date: today(),
      mode: "Cash",
      direction: "In",
      amount: 0,
      ref: "",
      note: "",
    });
  };
  const del = (id: string) => setPayments(payments.filter((s) => s.id !== id));

  const mkReceiptPDF = (p: Payment) => {
    const doc = new jsPDF();
    const line = (y: number) => doc.line(14, y, 196, y);

    doc.setFontSize(16);
    doc.text(company?.name || "skv-gb-global", 14, 18);
    doc.setFontSize(10);
    const headRight = [
      `TRN: ${company.trn || "-"}`,
      company.email || "",
      company.phone || "",
    ]
      .filter(Boolean)
      .join("  ·  ");
    doc.text(headRight, 196, 18, { align: "right" });
    if (company.address) doc.text(company.address, 14, 24);

    line(28);

    doc.setFontSize(14);
    doc.text(p.direction === "In" ? "RECEIPT" : "PAYMENT VOUCHER", 14, 38);
    doc.setFontSize(10);
    doc.text(`Date: ${p.date}`, 14, 46);
    if (p.ref) doc.text(`Reference: ${p.ref}`, 80, 46);

    (doc as any).autoTable({
      startY: 56,
      head: [["Mode", "Direction", "Amount", "Note"]],
      body: [[p.mode, p.direction, fmt(p.amount), p.note || "-"]],
      styles: { fontSize: 11 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: 14, right: 14 },
    });

    const y = (doc as any).lastAutoTable.finalY + 16;
    doc.text("Authorized Signatory", 14, y);
    doc.line(14, y + 2, 80, y + 2);

    doc.save(
      `${p.direction === "In" ? "receipt" : "payment"}_${p.date}.pdf`
    );
  };

  return (
    <>
      <SectionCard title="Add Payment / Receipt">
        <div className="grid md-grid-cols-6 md:grid-cols-6 gap-3">
          <input
            type="date"
            value={x.date}
            onChange={(e) => setX({ ...x, date: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <select
            value={x.mode}
            onChange={(e) => setX({ ...x, mode: e.target.value as any })}
            className="px-3 py-2 rounded-xl border"
          >
            <option>Cash</option>
            <option>Bank</option>
          </select>
          <select
            value={x.direction}
            onChange={(e) => setX({ ...x, direction: e.target.value as any })}
            className="px-3 py-2 rounded-xl border"
          >
            <option value="In">Receipt (In)</option>
            <option value="Out">Payment (Out)</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Amount"
            value={x.amount}
            onChange={(e) => setX({ ...x, amount: toNum(e.target.value) })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Ref (Invoice/Bill #)"
            value={x.ref || ""}
            onChange={(e) => setX({ ...x, ref: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
          <input
            placeholder="Note"
            value={x.note || ""}
            onChange={(e) => setX({ ...x, note: e.target.value })}
            className="px-3 py-2 rounded-xl border"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="text-sm text-slate-500">
            Direction: {x.direction} · Mode: {x.mode}
          </div>
          <div className="flex gap-2">
            <button
              onClick={add}
              className="px-3 py-2 rounded-xl bg-slate-900 text-white flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
            <button
              onClick={onExport}
              className="px-3 py-2 rounded-xl border flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Payments List">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                {["Date", "Mode", "Direction", "Amount", "Ref", "Note", ""].map(
                  (h) => (
                    <th key={h} className="py-2 pr-3">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{p.date}</td>
                  <td className="py-2 pr-3">{p.mode}</td>
                  <td className="py-2 pr-3">{p.direction}</td>
                  <td className="py-2 pr-3 text-right">{fmt(p.amount)}</td>
                  <td className="py-2 pr-3">{p.ref}</td>
                  <td className="py-2 pr-3">{p.note}</td>
                  <td className="py-2 pr-3 text-right flex gap-2 justify-end">
                    <button
                      onClick={() => mkReceiptPDF(p)}
                      className="px-2 py-1.5 rounded-lg border flex items-center gap-1"
                    >
                      <FileDown className="w-4 h-4" />
                      PDF
                    </button>
                    <button
                      onClick={() => del(p.id)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No records yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}

function Reports({ totals }: { totals: any }) {
  const exportAll = () => {
    const rows = [
      ["Report", "Value"],
      ["Sales Base", fmt(totals.salesBase)],
      ["Sales VAT", fmt(totals.salesTax)],
      ["Sales Total (with VAT)", fmt(totals.salesGross)],
      ["Purchases Base", fmt(totals.purBase)],
      ["Purchases VAT", fmt(totals.purTax)],
      ["Purchases Total (with VAT)", fmt(totals.purGross)],
      ["VAT Payable", fmt(totals.vatPayable)],
      ["VAT Recoverable", fmt(totals.vatRecoverable)],
      ["Receipts (In)", fmt(totals.receipts)],
      ["Payments (Out)", fmt(totals.payouts)],
      ["Profit (approx)", fmt(totals.profitApprox)],
    ];
    downloadCSV(asCSV(rows), `summary_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <h3 className="text-lg font-semibold mb-3">Summary</h3>
        <ul className="space-y-1 text-sm">
          <li>
            Sales (Taxable): <b>{fmt(totals.salesBase)}</b>
          </li>
          <li>
            Sales VAT: <b>{fmt(totals.salesTax)}</b>
          </li>
          <li>
            Sales Total (with VAT): <b>{fmt(totals.salesGross)}</b>
          </li>
          <li className="mt-2">
            Purchases (Taxable): <b>{fmt(totals.purBase)}</b>
          </li>
          <li>
            Purchases VAT: <b>{fmt(totals.purTax)}</b>
          </li>
          <li>
            Purchases Total (with VAT): <b>{fmt(totals.purGross)}</b>
          </li>
          <li className="mt-2">
            VAT Payable: <b>{fmt(totals.vatPayable)}</b>
          </li>
          <li>
            or VAT Recoverable: <b>{fmt(totals.vatRecoverable)}</b>
          </li>
          <li className="mt-2">
            Receipts (In): <b>{fmt(totals.receipts)}</b>
          </li>
          <li>
            Payments (Out): <b>{fmt(totals.payouts)}</b>
          </li>
          <li className="mt-2">
            Profit (approx): <b>{fmt(totals.profitApprox)}</b>
          </li>
        </ul>
        <button
          onClick={exportAll}
          className="mt-4 px-3 py-2 rounded-xl border flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Export Summary CSV
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <h3 className="text-lg font-semibold mb-3">Quick Notes</h3>
        <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
          <li>Invoice/Receipt PDF एक क्लिक में बनता है (Sales/Payments लिस्ट में PDF बटन)</li>
          <li>हेडर में Company, TRN, Address, Email, Phone भरें ताकि PDF पर आए</li>
          <li>PIN Login अभी browser-level है; proper backend login बाद में जोड़ेंगे</li>
        </ul>
      </div>
    </div>
  );
}

// --- utils ---
function today() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function amountInWords(n: number) {
  try {
    const i = Math.floor(n);
    const f = Math.round((n - i) * 100);
    const words = toWords(i) + (f ? ` and ${f}/100` : "");
    return words + " only";
  } catch {
    return `${fmt(n)} only`;
  }
}

function toWords(n: number): string {
  const a = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const b = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const g = ["", " thousand ", " million ", " billion "];
  if (n === 0) return "zero";
  let str = "";
  let grp = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk) {
      const h = Math.floor(chunk / 100);
      const tens = chunk % 100;
      const ones = chunk % 10;
      let part = "";
      if (h) part += a[h] + " hundred ";
      if (tens < 20) part += a[tens];
      else part += b[Math.floor(tens / 10)] + (ones ? "-" + a[ones] : "");
      str = part + g[grp] + str;
    }
    n = Math.floor(n / 1000);
    grp++;
  }
  return str.trim();
}
