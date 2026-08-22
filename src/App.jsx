import React, { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, Trash2, Printer, LogOut, ShoppingCart,
  Users, History, X, Instagram, Send, Wallet, Check, ChevronLeft, Inbox
} from "lucide-react";
import { supabase } from "./supabaseClient";

const SELLER_NAMES = ["Azizxon", "Doniyorjon", "Jahongir", "Javohirbek", "Hamidjon", "Jamshidbek", "Xislatbek", "Mubashirxon", "Jahongiroldi"];
const ORANGE = "#E9642B";
const ORANGE_DARK = "#C24F1F";
const PURPLE_DARK = "#3D2A54";
const PURPLE = "#4D3966";
const PURPLE_BORDER = "#5D4976";
function fmt(n) { return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function formatDate(iso) {
  try { return new Date(iso).toLocaleString("uz-UZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch (e) { return iso; }
}

function LogoMark({ size = 20, sub = true }) {
  return (
    <img src="/logo.png" alt="MARBA" style={{ height: size * 2.6, width: "auto", borderRadius: "50%" }} />
  );
}

async function nextCustomerId() {
  const { data } = await supabase.from("customers").select("id").order("id", { ascending: false }).limit(1);
  const last = data && data[0] ? data[0].id.trim() : "00000000";
  const next = (parseInt(last, 10) || 0) + 1;
  return String(next).padStart(8, "0");
}

const ORDER_STATUS_LABELS = {
  yangi: "Yangi", qabul_qilindi: "Qabul qilindi", yigilmoqda: "Yig'ilmoqda",
  yolda: "Yo'lda", yetkazildi: "Yetkazildi", yakunlandi: "Sotuvga aylandi", bekor_qilindi: "Bekor qilindi",
};
function orderStatusColor(status) {
  if (status === "yangi") return "#8a887e";
  if (status === "qabul_qilindi") return "#2C6FA6";
  if (status === "yigilmoqda" || status === "yolda") return "#B8860B";
  if (status === "yetkazildi" || status === "yakunlandi") return "#2c7a4b";
  return "#a1281f";
}

export default function App() {
  const [session, setSession] = useState(null);
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [loginName, setLoginName] = useState(null);
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState("sale");
  const [products, setProducts] = useState([]);

  const [saleCustomer, setSaleCustomer] = useState(null);
  const [customerIdInput, setCustomerIdInput] = useState("");
  const [saleError, setSaleError] = useState("");
  const [newCustomerForm, setNewCustomerForm] = useState(null);
  const [cart, setCart] = useState([]);
  const [saleSearch, setSaleSearch] = useState("");
  const [qtyDraft, setQtyDraft] = useState({});
  const [paymentInput, setPaymentInput] = useState("");
  const [convertingOrderId, setConvertingOrderId] = useState(null);

  const [custSearch, setCustSearch] = useState("");
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [payAmount, setPayAmount] = useState("");

  const [historyRows, setHistoryRows] = useState([]);
  const [receipt, setReceipt] = useState(null);

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) initSeller(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) initSeller(s); else { setSession(null); setSellerName(""); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function initSeller(s) {
    setSession(s);
    const { data } = await supabase.from("sellers").select("name, phone").eq("auth_user_id", s.user.id).maybeSingle();
    setSellerName(data?.name || s.user.email.split("@")[0]);
    setSellerPhone(data?.phone || "");
  }

  useEffect(() => { if (session) refreshProducts(); }, [session]);
  useEffect(() => { if (activeTab === "history" && session) refreshHistory(); }, [activeTab, session]);
  useEffect(() => { if (activeTab === "orders" && session) refreshOrders(); }, [activeTab, session]);

  async function refreshProducts() {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data || []);
  }
  async function refreshHistory() {
    const { data } = await supabase
      .from("sales")
      .select("*, customers(name), sale_items(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    setHistoryRows(data || []);
  }
  async function refreshOrders() {
    setOrdersLoading(true);
    const { data } = await supabase
      .from("buyurtmalar")
      .select("*, buyurtma_items(*)")
      .not("status", "in", "(bekor_qilindi,yetkazildi,yakunlandi)")
      .order("created_at", { ascending: false });
    const list = data || [];
    const customerIds = [...new Set(list.map((o) => o.customer_id))];
    let customerMap = {};
    if (customerIds.length) {
      const { data: custs } = await supabase.from("customers").select("*").in("id", customerIds);
      (custs || []).forEach((c) => { customerMap[c.id] = c; });
    }
    setOrders(list.map((o) => ({ ...o, customer: customerMap[o.customer_id] })));
    setOrdersLoading(false);
  }

  async function setOrderStatus(order, status) {
    await supabase.from("buyurtmalar").update({ status }).eq("id", order.id);
    refreshOrders();
  }

  function convertOrderToSale(order) {
    if (!order.customer) return;
    setConvertingOrderId(order.id);
    setSaleCustomer(order.customer);
    setCart(order.buyurtma_items.map((it) => ({ productId: it.product_id, name: it.product_name, price: it.price, qty: it.qty })));
    setActiveTab("sale");
  }
  async function cancelOrder(order) {
    if (!confirm("Buyurtmani bekor qilishga ishonchingiz komilmi?")) return;
    await supabase.from("buyurtmalar").update({ status: "bekor_qilindi" }).eq("id", order.id);
    refreshOrders();
  }

  async function savePhone(newPhone) {
    await supabase.from("sellers").update({ phone: newPhone }).eq("auth_user_id", session.user.id);
    setSellerPhone(newPhone);
  }

  async function doLogin() {
    if (!loginName) { setLoginError("Sotuvchini tanlang"); return; }
    setBusy(true);
    const email = `${loginName.toLowerCase()}@marba.internal`;
    const { error } = await supabase.auth.signInWithPassword({ email, password: loginPass });
    setBusy(false);
    if (error) { setLoginError("Parol noto'g'ri"); return; }
    setLoginPass(""); setLoginError("");
  }
  async function doLogout() {
    await supabase.auth.signOut();
    setActiveTab("sale"); setSaleCustomer(null); setCart([]);
  }

  async function searchCustomer() {
    const id = customerIdInput.trim();
    setSaleError("");
    if (!/^\d{8}$/.test(id)) { setSaleError("Mijoz ID 8 ta raqamdan iborat bo'lishi kerak"); return; }
    const { data } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (data) { setSaleCustomer(data); setNewCustomerForm(null); }
    else setSaleError("Bunday ID topilmadi. Yangi mijoz yarating.");
  }
  async function startNewCustomer() {
    const previewId = await nextCustomerId();
    setNewCustomerForm({ previewId, name: "", viloyat: "", manzil: "" });
    setSaleError("");
  }
  async function saveNewCustomer() {
    if (!newCustomerForm.name.trim() || !newCustomerForm.viloyat.trim()) { setSaleError("Mijoz ismi va viloyatini to'liq kiriting"); return; }
    const { data, error } = await supabase.from("customers")
      .insert({ id: newCustomerForm.previewId, name: newCustomerForm.name.trim(), viloyat: newCustomerForm.viloyat.trim(), manzil: newCustomerForm.manzil.trim(), debt: 0 })
      .select("*").single();
    if (error) { setSaleError("Xatolik: " + error.message); return; }
    setSaleCustomer(data); setNewCustomerForm(null); setSaleError("");
  }
  function changeCustomer() { setSaleCustomer(null); setCustomerIdInput(""); setCart([]); setPaymentInput(""); setSaleError(""); setConvertingOrderId(null); }

  const saleSearchResults = useMemo(() => {
    const q = saleSearch.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [saleSearch, products]);

  function addToCart(product) {
    const qty = Math.max(1, Math.min(Number(qtyDraft[product.id]) || 1, product.qty));
    if (product.qty <= 0) return;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.productId === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: Math.min(copy[idx].qty + qty, product.qty) };
        return copy;
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, qty }];
    });
    setQtyDraft((d) => ({ ...d, [product.id]: 1 }));
  }
  function removeFromCart(idx) { setCart((prev) => prev.filter((_, i) => i !== idx)); }
  const cartTotal = useMemo(() => cart.reduce((s, l) => s + l.price * l.qty, 0), [cart]);
  const paidNum = Number(paymentInput) || 0;
  const debtPreview = Math.max((saleCustomer?.debt || 0) + cartTotal - paidNum, 0);

  async function finishSale() {
    if (!saleCustomer) { setSaleError("Avval mijozni tanlang"); return; }
    if (cart.length === 0) { setSaleError("Ro'yxatga kamida bitta qism qo'shing"); return; }
    setSaleError(""); setBusy(true);

    const total = cartTotal, paid = paidNum;
    const newDebt = Math.max((saleCustomer.debt || 0) + total - paid, 0);

    const { data: sale, error: saleErr } = await supabase.from("sales")
      .insert({ customer_id: saleCustomer.id, seller_name: sellerName, total, paid })
      .select("*").single();
    if (saleErr) { setSaleError("Xatolik: " + saleErr.message); setBusy(false); return; }

    await supabase.from("sale_items").insert(cart.map((l) => ({ sale_id: sale.id, product_name: l.name, price: l.price, qty: l.qty })));

    for (const line of cart) {
      const prod = products.find((p) => p.id === line.productId);
      if (prod) await supabase.from("products").update({ qty: Math.max(0, prod.qty - line.qty) }).eq("id", prod.id);
    }

    if (paid > 0) {
      await supabase.from("payments").insert({ customer_id: saleCustomer.id, amount: paid, seller_name: sellerName });
    }

    const { data: updatedCustomer } = await supabase.from("customers").update({ debt: newDebt }).eq("id", saleCustomer.id).select("*").single();

    if (convertingOrderId) {
      await supabase.from("buyurtmalar").update({ status: "yakunlandi" }).eq("id", convertingOrderId);
      setConvertingOrderId(null);
      refreshOrders();
    }

    setBusy(false);
    setReceipt({ customer: updatedCustomer, purchase: { ...sale, items: cart, date: sale.created_at }, seller: sellerName });
    setCart([]); setPaymentInput(""); setSaleCustomer(updatedCustomer);
    refreshProducts();
  }

  useEffect(() => {
    if (activeTab !== "customers") return;
    (async () => {
      const q = custSearch.trim();
      let query = supabase.from("customers").select("*").order("created_at", { ascending: false }).limit(30);
      if (q) query = supabase.from("customers").select("*").or(`id.ilike.%${q}%,name.ilike.%${q}%`).limit(30);
      const { data } = await query;
      setCustomerResults(data || []);
    })();
  }, [custSearch, activeTab]);

  async function openCustomer(c) {
    const { data: sales } = await supabase.from("sales").select("*, sale_items(*)").eq("customer_id", c.id).order("created_at", { ascending: false });
    setSelectedCustomer({ ...c, purchases: sales || [] });
  }
  async function addStandalonePayment() {
    if (!selectedCustomer) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    await supabase.from("payments").insert({ customer_id: selectedCustomer.id, amount: amt, seller_name: sellerName });
    const newDebt = Math.max((selectedCustomer.debt || 0) - amt, 0);
    const { data } = await supabase.from("customers").update({ debt: newDebt }).eq("id", selectedCustomer.id).select("*").single();
    setSelectedCustomer({ ...selectedCustomer, debt: data.debt });
    setPayAmount("");
  }

  if (!session) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: PURPLE_DARK, padding: 24 }}>
        <style>{loginCss}</style>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}><LogoMark size={26} /></div>
          <div className="mb-card" style={{ background: PURPLE, border: `1px solid ${PURPLE_BORDER}` }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Sotuvchini tanlang</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
              {SELLER_NAMES.map((n) => (
                <button key={n} onClick={() => { setLoginName(n); setLoginError(""); }} className="mb-btn"
                  style={{ background: loginName === n ? ORANGE : PURPLE_DARK, color: "#fff", fontSize: 13, padding: "10px 8px" }}>{n}</button>
              ))}
            </div>
            <div style={{ color: "#d9d0e6", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Parol</div>
            <input type="password" className="mb-input" style={{ background: PURPLE_DARK, border: `1.5px solid ${PURPLE_BORDER}`, color: "#fff", marginBottom: 12 }}
              value={loginPass} onChange={(e) => setLoginPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} placeholder="Parolni kiriting" />
            {loginError && <div style={{ color: "#f0837f", fontSize: 13, marginBottom: 10 }}>{loginError}</div>}
            <button className="mb-btn mb-btn-primary" style={{ width: "100%" }} disabled={busy} onClick={doLogin}>{busy ? "..." : "Kirish"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", minHeight: "100vh", background: PURPLE, color: "#161615" }}>
      <style>{appCss}</style>
      <div className="no-print">
        <div style={{ background: PURPLE_DARK, padding: "10px 20px", display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", borderBottom: `1px solid ${PURPLE_BORDER}` }}>
          <img src="/logo.png" alt="MARBA" style={{ height: 42, width: 42, borderRadius: "50%", flexShrink: 0 }} />
          <div style={{ width: 1, height: 28, background: PURPLE_BORDER, flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            <div className={`mb-tab ${activeTab === "sale" ? "active" : ""}`} onClick={() => setActiveTab("sale")}><ShoppingCart size={16} /> Yangi sotuv</div>
            <div className={`mb-tab ${activeTab === "orders" ? "active" : ""}`} onClick={() => setActiveTab("orders")}><Inbox size={16} /> Buyurtmalar{orders.length > 0 ? ` (${orders.length})` : ""}</div>
            <div className={`mb-tab ${activeTab === "customers" ? "active" : ""}`} onClick={() => setActiveTab("customers")}><Users size={16} /> Mijozlar</div>
            <div className={`mb-tab ${activeTab === "history" ? "active" : ""}`} onClick={() => setActiveTab("history")}><History size={16} /> Tarix</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{ color: "#d9d0e6", fontSize: 13.5, cursor: "pointer" }}
              onClick={() => {
                const val = prompt("Telefon raqamingizni kiriting:", sellerPhone);
                if (val !== null) savePhone(val.trim());
              }}
              title="Telefon raqamingizni kiritish uchun bosing"
            >
              Sotuvchi: <b style={{ color: "#fff" }}>{sellerName}</b>{sellerPhone ? "" : " (telefon kiritilmagan — bosing)"}
            </span>
            <button className="mb-btn mb-btn-ghost" style={{ color: "#fff", borderColor: PURPLE_BORDER, display: "flex", alignItems: "center", gap: 6, padding: "8px 12px" }} onClick={doLogout}><LogOut size={15} /> Chiqish</button>
          </div>
        </div>

        <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
          {activeTab === "orders" && (
            <div className="mb-card">
              <div style={{ fontWeight: 700, marginBottom: 14 }}>Mijozlardan kelgan buyurtmalar</div>
              {ordersLoading ? <div style={{ color: "#8a887e" }}>Yuklanmoqda...</div> : orders.length === 0 ? (
                <div style={{ textAlign: "center", color: "#8a887e", padding: "30px 0" }}>Hozircha yangi buyurtma yo'q.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {orders.map((o) => (
                    <div key={o.id} style={{ border: "1px solid #efeee7", borderRadius: 10, padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{o.customer?.name || "Noma'lum mijoz"} <span style={{ color: "#8a887e", fontFamily: "monospace", fontWeight: 400, fontSize: 12.5 }}>({o.customer_id})</span></div>
                          <div style={{ fontSize: 12.5, color: "#8a887e" }}>{formatDate(o.created_at)}{o.order_no ? ` • #${o.order_no}` : ""}</div>
                        {(o.packed_by || o.driver_name) && (
  <div style={{ fontSize: 12, color: "#2C6FA6", marginTop: 4 }}>
    {o.packed_by ? `📦 Yig'di: ${o.packed_by}` : ""}{o.packed_by && o.driver_name ? " • " : ""}{o.driver_name ? `🚗 Haydovchi: ${o.driver_name}` : ""}
  </div>
)}
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          Jami: {fmt(o.buyurtma_items.reduce((s, it) => s + it.price * it.qty, 0))}
                        </div>
                      </div>
                      <div style={{ fontSize: 13.5, marginBottom: 10 }}>
                        {o.buyurtma_items.map((it) => `${it.product_name} x${it.qty}`).join(", ")}
                      </div>
                      <div style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: orderStatusColor(o.status) }}>
                        Holat: {ORDER_STATUS_LABELS[o.status] || o.status}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {o.status === "yangi" && <button className="mb-btn mb-btn-primary" onClick={() => setOrderStatus(o, "qabul_qilindi")}>Qabul qilish</button>}
                        {o.status === "qabul_qilindi" && <button className="mb-btn mb-btn-primary" onClick={() => setOrderStatus(o, "yigilmoqda")}>Yig'ilmoqda deb belgilash</button>}
                        {o.status === "yigilmoqda" && <button className="mb-btn mb-btn-primary" onClick={() => setOrderStatus(o, "yolda")}>Yo'lga chiqdi</button>}
                        {o.status === "yolda" && <button className="mb-btn mb-btn-primary" onClick={() => setOrderStatus(o, "yetkazildi")}>Yetkazildi</button>}
                        <button className="mb-btn mb-btn-dark" onClick={() => convertOrderToSale(o)}>Sotuvga aylantirish</button>
                        <button className="mb-btn mb-btn-danger" onClick={() => cancelOrder(o)}>Bekor qilish</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "sale" && (
            <div style={{ display: "grid", gap: 16 }}>
              {convertingOrderId && (
                <div style={{ background: "#fff4e0", border: "1px solid #f0c674", borderRadius: 10, padding: 12, fontSize: 13.5, color: "#7a5a00" }}>
                  Buyurtmadan sotuvga aylantirilmoqda — yakunlangach buyurtma avtomatik yopiladi.
                </div>
              )}
              {!saleCustomer ? (
                <div className="mb-card">
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>1. Mijozni tanlang</div>
                  {!newCustomerForm ? (
                    <>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <input className="mb-input" placeholder="Mijoz ID (8 xonali)" value={customerIdInput}
                          onChange={(e) => setCustomerIdInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
                          onKeyDown={(e) => e.key === "Enter" && searchCustomer()} />
                        <button className="mb-btn mb-btn-dark" onClick={searchCustomer}><Search size={15} /></button>
                      </div>
                      {saleError && <div style={{ color: "#c0392b", fontSize: 13.5, marginBottom: 10 }}>{saleError}</div>}
                      <button className="mb-btn mb-btn-primary" onClick={startNewCustomer}><Plus size={14} style={{ verticalAlign: -2 }} /> Yangi mijoz yaratish</button>
                    </>
                  ) : (
                    <div>
                      <div style={{ color: "#8a887e", fontSize: 13, marginBottom: 10 }}>Yangi mijoz ID: <b style={{ color: "#161615", fontFamily: "monospace", fontSize: 15 }}>{newCustomerForm.previewId}</b></div>
                      <div style={{ display: "grid", gap: 10 }}>
                        <input className="mb-input" placeholder="Mijoz ismi (to'liq)" value={newCustomerForm.name} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, name: e.target.value })} />
                        <input className="mb-input" placeholder="Viloyati / hududi" value={newCustomerForm.viloyat} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, viloyat: e.target.value })} />
                        <input className="mb-input" placeholder="Manzil (ixtiyoriy)" value={newCustomerForm.manzil} onChange={(e) => setNewCustomerForm({ ...newCustomerForm, manzil: e.target.value })} />
                      </div>
                      {saleError && <div style={{ color: "#c0392b", fontSize: 13.5, margin: "10px 0" }}>{saleError}</div>}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="mb-btn mb-btn-primary" onClick={saveNewCustomer}>Saqlash</button>
                        <button className="mb-btn mb-btn-ghost" onClick={() => setNewCustomerForm(null)}>Bekor qilish</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "#8a887e", fontWeight: 700 }}>MIJOZ ID: {saleCustomer.id}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, margin: "3px 0" }}>{saleCustomer.name}</div>
                      <div style={{ fontSize: 13.5, color: "#666" }}>{saleCustomer.viloyat}{saleCustomer.manzil ? `, ${saleCustomer.manzil}` : ""}</div>
                      {saleCustomer.debt > 0 && <div style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 6, background: "#fbe4e2", color: "#a1281f", fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6 }}><Wallet size={13} /> Joriy qarz: {fmt(saleCustomer.debt)}</div>}
                    </div>
                    <button className="mb-btn mb-btn-ghost" onClick={changeCustomer}><ChevronLeft size={14} style={{ verticalAlign: -2 }} /> Boshqa mijoz</button>
                  </div>

                  <div className="mb-card">
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>2. Ehtiyot qismlar qo'shish</div>
                    <input className="mb-input" placeholder="Qism nomini qidirish..." value={saleSearch} onChange={(e) => setSaleSearch(e.target.value)} />
                    {saleSearchResults.length > 0 && (
                      <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                        {saleSearchResults.map((p) => (
                          <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "#f7f6f1", borderRadius: 8, gap: 8, flexWrap: "wrap" }}>
                            <div style={{ minWidth: 140 }}>
                              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                              <div style={{ fontSize: 12, color: "#8a887e" }}>{fmt(p.price)} • omborda: {p.qty}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <input type="number" min="1" max={p.qty} className="mb-input" style={{ width: 64, padding: "6px 8px" }} value={qtyDraft[p.id] ?? 1} onChange={(e) => setQtyDraft((d) => ({ ...d, [p.id]: e.target.value }))} />
                              <button className="mb-btn mb-btn-dark" style={{ padding: "8px 10px" }} disabled={p.qty <= 0} onClick={() => addToCart(p)}>{p.qty <= 0 ? "Tugagan" : <Plus size={14} />}</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {cart.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <table className="mb-table">
                          <thead><tr><th>Nomi</th><th>Soni</th><th>Narxi</th><th>Summa</th><th></th></tr></thead>
                          <tbody>
                            {cart.map((l, i) => (
                              <tr key={i}><td>{l.name}</td><td>{l.qty}</td><td>{fmt(l.price)}</td><td>{fmt(l.price * l.qty)}</td>
                                <td><button className="mb-btn mb-btn-danger" style={{ padding: "5px 8px" }} onClick={() => removeFromCart(i)}><Trash2 size={13} /></button></td></tr>
                            ))}
                          </tbody>
                        </table>
                        <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, marginTop: 10 }}>Jami: {fmt(cartTotal)}</div>
                      </div>
                    )}
                  </div>

                  {cart.length > 0 && (
                    <div className="mb-card">
                      <div style={{ fontWeight: 700, marginBottom: 12 }}>3. To'lov</div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                        <input type="number" className="mb-input" style={{ maxWidth: 200 }} placeholder="To'langan summa" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} />
                        <button className="mb-btn mb-btn-ghost" onClick={() => setPaymentInput(String(cartTotal))}>To'liq to'lash</button>
                      </div>
                      <div style={{ fontSize: 13.5, color: debtPreview > 0 ? "#a1281f" : "#2c7a4b", fontWeight: 600, marginBottom: 14 }}>{debtPreview > 0 ? `Yangi qarz bo'ladi: ${fmt(debtPreview)}` : "Qarz qolmaydi"}</div>
                      {saleError && <div style={{ color: "#c0392b", fontSize: 13.5, marginBottom: 10 }}>{saleError}</div>}
                      <button className="mb-btn mb-btn-primary" disabled={busy} onClick={finishSale}>{busy ? "..." : "Sotuvni yakunlash va chek chiqarish"}</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === "customers" && (
            <div style={{ display: "grid", gap: 14 }}>
              <input className="mb-input" style={{ maxWidth: 360 }} placeholder="ID yoki ism bo'yicha qidirish..." value={custSearch} onChange={(e) => setCustSearch(e.target.value)} />
              {!selectedCustomer ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {customerResults.length === 0 && <div style={{ color: "#8a887e", padding: "20px 0", textAlign: "center" }}>Mijozlar topilmadi.</div>}
                  {customerResults.map((c) => (
                    <div key={c.id} className="mb-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", padding: 14 }} onClick={() => openCustomer(c)}>
                      <div><div style={{ fontWeight: 700 }}>{c.name}</div><div style={{ fontSize: 12.5, color: "#8a887e", fontFamily: "monospace" }}>ID: {c.id} • {c.viloyat}</div></div>
                      {c.debt > 0 && <div style={{ color: "#a1281f", fontWeight: 700, fontSize: 13.5 }}>Qarz: {fmt(c.debt)}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mb-card">
                  <button className="mb-btn mb-btn-ghost" style={{ marginBottom: 14 }} onClick={() => setSelectedCustomer(null)}><ChevronLeft size={14} style={{ verticalAlign: -2 }} /> Orqaga</button>
                  <div style={{ fontSize: 12, color: "#8a887e", fontWeight: 700 }}>MIJOZ ID: {selectedCustomer.id}</div>
                  <div style={{ fontSize: 19, fontWeight: 700, margin: "4px 0" }}>{selectedCustomer.name}</div>
                  <div style={{ color: "#666", marginBottom: 12 }}>{selectedCustomer.viloyat}{selectedCustomer.manzil ? `, ${selectedCustomer.manzil}` : ""}</div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
                    <div style={{ background: "#f7f6f1", borderRadius: 10, padding: "10px 16px" }}><div style={{ fontSize: 11.5, color: "#8a887e", fontWeight: 700 }}>JORIY QARZ</div><div style={{ fontSize: 18, fontWeight: 700, color: selectedCustomer.debt > 0 ? "#a1281f" : "#2c7a4b" }}>{fmt(selectedCustomer.debt)}</div></div>
                    <div style={{ background: "#f7f6f1", borderRadius: 10, padding: "10px 16px" }}><div style={{ fontSize: 11.5, color: "#8a887e", fontWeight: 700 }}>JAMI XARIDLAR</div><div style={{ fontSize: 18, fontWeight: 700 }}>{selectedCustomer.purchases.length}</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                    <input type="number" className="mb-input" style={{ maxWidth: 200 }} placeholder="Qarz to'lovi summasi" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                    <button className="mb-btn mb-btn-primary" onClick={addStandalonePayment}><Check size={14} style={{ verticalAlign: -2 }} /> To'lov qo'shish</button>
                  </div>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Xaridlar tarixi</div>
                  {selectedCustomer.purchases.length === 0 ? <div style={{ color: "#8a887e", fontSize: 13.5 }}>Hali xarid yo'q.</div> : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {selectedCustomer.purchases.map((p) => (
                        <div key={p.id} style={{ border: "1px solid #efeee7", borderRadius: 10, padding: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8a887e", marginBottom: 6 }}>
                            <span>{formatDate(p.created_at)} • {p.seller_name}</span>
                            <span>Jami: {fmt(p.total)} / To'landi: {fmt(p.paid)}</span>
                          </div>
                          <div style={{ fontSize: 13.5 }}>{(p.sale_items || []).map((it) => `${it.product_name} x${it.qty}`).join(", ")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="mb-card">
              {historyRows.length === 0 ? <div style={{ textAlign: "center", color: "#8a887e", padding: "30px 0" }}>Hali sotuvlar tarixi yo'q.</div> : (
                <table className="mb-table">
                  <thead><tr><th>Sana</th><th>Mijoz</th><th>Sotuvchi</th><th>Jami</th><th>To'landi</th></tr></thead>
                  <tbody>
                    {historyRows.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontSize: 12.5 }}>{formatDate(r.created_at)}</td>
                        <td>{r.customers?.name} <span style={{ color: "#8a887e", fontFamily: "monospace", fontSize: 11.5 }}>({r.customer_id})</span></td>
                        <td>{r.seller_name}</td><td>{fmt(r.total)}</td>
                        <td style={{ color: r.paid < r.total ? "#a1281f" : "#2c7a4b" }}>{fmt(r.paid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {receipt && <ReceiptOverlay data={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function ReceiptOverlay({ data, onClose }) {
  return (
    <>
      <div className="no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 12, maxWidth: 640, width: "100%", maxHeight: "90vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: 12, borderBottom: "1px solid #eee" }}>
            <button className="mb-btn mb-btn-primary" onClick={() => window.print()}><Printer size={14} style={{ verticalAlign: -2 }} /> Chop etish</button>
            <button className="mb-btn mb-btn-ghost" onClick={onClose}><X size={16} /></button>
          </div>
          <ReceiptContent data={data} />
        </div>
      </div>
      <div className="print-only"><ReceiptContent data={data} /></div>
    </>
  );
}

function ReceiptContent({ data }) {
  const { customer, purchase, seller } = data;
  return (
    <div style={{ padding: 28, color: "#111", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #111", paddingBottom: 14, marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div>
          <LogoMark size={18} />
          <div style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.7 }}>
            <div>Mijoz ID: <b style={{ fontFamily: "monospace" }}>{customer.id}</b></div>
            <div>Mijoz: <b>{customer.name}</b></div>
            <div>Manzil: {customer.viloyat}{customer.manzil ? `, ${customer.manzil}` : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: 12.5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 4 }}><Instagram size={14} /> @marba_avtoparts</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end", marginBottom: 10 }}><Send size={14} /> @marba_zapchast</div>
          <div>Sana: {formatDate(purchase.date)}</div>
          <div>Sotuvchi: {seller}</div>
        </div>
      </div>
      {customer.delivery_lat && customer.delivery_lng && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <div style={{ textAlign: "center" }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(`https://yandex.uz/maps/?pt=${customer.delivery_lng},${customer.delivery_lat}&z=16&l=map`)}`}
              alt="Manzil QR"
              style={{ width: 90, height: 90 }}
            />
            <div style={{ fontSize: 10.5, color: "#666", marginTop: 4 }}>Yetkazib berish manzili</div>
          </div>
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, marginBottom: 14 }}>
        <thead><tr><th style={{ textAlign: "left", padding: "6px 4px", borderBottom: "2px solid #111" }}>Nomi</th><th style={{ textAlign: "center", padding: "6px 4px", borderBottom: "2px solid #111" }}>Soni</th><th style={{ textAlign: "right", padding: "6px 4px", borderBottom: "2px solid #111" }}>Narxi</th><th style={{ textAlign: "right", padding: "6px 4px", borderBottom: "2px solid #111" }}>Summa</th></tr></thead>
        <tbody>
          {purchase.items.map((it, i) => (
            <tr key={i}><td style={{ padding: "6px 4px", borderBottom: "1px solid #ddd" }}>{it.name}</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #ddd", textAlign: "center" }}>{it.qty}</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #ddd", textAlign: "right" }}>{fmt(it.price)}</td><td style={{ padding: "6px 4px", borderBottom: "1px solid #ddd", textAlign: "right" }}>{fmt(it.price * it.qty)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: "auto", width: 240, fontSize: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>Jami:</span><b>{fmt(purchase.total)}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span>To'landi:</span><b>{fmt(purchase.paid)}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: customer.debt > 0 ? "#a1281f" : "#2c7a4b" }}><span>Qolgan qarz:</span><b>{fmt(customer.debt)}</b></div>
      </div>
      <div style={{ borderTop: "1px solid #ccc", marginTop: 18, paddingTop: 10, fontSize: 11.5, color: "#666", textAlign: "center" }}>MARBA AUTO PARTS — Xaridingiz uchun rahmat!</div>
    </div>
  );
}

const loginCss = `
  * { box-sizing: border-box; }
  .mb-btn { cursor:pointer; border:none; border-radius:8px; font-weight:700; font-size:14px; padding:10px 16px; }
  .mb-btn-primary { background:${ORANGE}; color:#fff; }
  .mb-btn-primary:disabled { background:#d7a48c; }
  .mb-btn-ghost { background:transparent; border:1.5px solid #d8d6cc; }
  .mb-input { width:100%; padding:10px 12px; border:1.5px solid #d8d6cc; border-radius:8px; font-size:14px; }
  .mb-card { background:#fff; border-radius:14px; padding:20px; border:1px solid #e7e5db; }
`;
const appCss = loginCss + `
  .mb-btn-primary:hover { background:${ORANGE_DARK}; }
  .mb-btn-dark { background:${PURPLE_DARK}; color:#fff; }
  .mb-btn-ghost:hover { background:#eae8df; }
  .mb-btn-danger { background:#fbe4e2; color:#a1281f; }
  .mb-table { width:100%; border-collapse:collapse; font-size:13.5px; }
  .mb-table th { text-align:left; padding:9px 10px; color:#8a887e; font-weight:700; font-size:11.5px; text-transform:uppercase; border-bottom:1.5px solid #e7e5db; }
  .mb-table td { padding:10px; border-bottom:1px solid #efeee7; vertical-align:middle; }
  .mb-tab { display:flex; align-items:center; gap:7px; padding:12px 18px; cursor:pointer; color:#c9c7bd; font-weight:700; font-size:14px; border-bottom:3px solid transparent; white-space:nowrap; }
  .mb-tab.active { color:#fff; border-bottom-color:${ORANGE}; }
  .print-only { display:none; }
  @media print { .no-print { display:none !important; } .print-only { display:block !important; } }
`;