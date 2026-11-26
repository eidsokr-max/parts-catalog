import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, getDoc, getDocs, setDoc, deleteDoc, deleteField, updateDoc, runTransaction, increment, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.flat().forEach(k => e.append(k)); return e; };

if (firebaseConfig.apiKey === "PASTE_HERE") { $("cfgWarn").hidden = false; throw new Error("firebase config missing"); }
const app = initializeApp(firebaseConfig), db = getFirestore(app), auth = getAuth(app);

const BASE_DEPTS = ["الصيانة العامة", "صيانة IS", "صيانة الكولد إند", "صيانة المكابس", "فريق التغييرات", "التشكيل", "مخزن مستلزمات"];
const extraDepts = () => { try { return JSON.parse(localStorage.getItem("xdepts") || "[]"); } catch (e) { return []; } };
let DEPTS = [...BASE_DEPTS];
const DSEL = [["deptFilter", "كل الأقسام"], ["fdept", "القسم (اختياري)"], ["edept", "القسم"], ["rdept", "قسمك (اختياري)"]];
// الأقسام = الأساسية + اللي المالك أضافها + أي قسم مستخدم في قطعة (عشان يظهر لكل الناس)
function fillDepts() {
  DEPTS = [...new Set([...BASE_DEPTS, ...extraDepts(), ...parts.map(p => p.dept).filter(Boolean)])];
  DSEL.forEach(([id, first]) => { const s = $(id), v = s.value; s.replaceChildren(el("option", { value: "", textContent: first }), ...DEPTS.map(d => el("option", { value: d, textContent: d }))); s.value = DEPTS.includes(v) ? v : ""; });
}
let deptF = "", editPart = null;
let parts = [];
fillDepts();
$("deptFilter").onchange = e => { deptF = e.target.value; render(); };
let cat = "الكل", isOwner = false, reqPart = null, unsubReq = null;
const flash = t => { const m = $("msg"); m.textContent = t; m.hidden = false; setTimeout(() => m.hidden = true, 6000); };

onSnapshot(collection(db, "parts"), s => { window.__ld = true; parts = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); renderLow(); },
  e => flash("تعذر تحميل القطع: " + e.message));

// ---- الصور: نسخة صغيرة (thumb) للقائمة، والصورة الكاملة في مجموعة partimg بتتحمل لما تفتح القطعة بس ----
let modalPartId = null;
function openFull(p) {
  modalPartId = p.id;
  const mi = $("mimg");
  mi.src = p.thumb || p.img || "";
  $("mname").textContent = p.name;
  $("modal").hidden = false;
  if (p.img) return; // قطعة لسه ماتحولتش: الصورة الكاملة أصلا محملة
  getDoc(doc(db, "partimg", p.id)).then(s => {
    const full = s.exists() ? s.data().img : "";
    if (full && modalPartId === p.id && !$("modal").hidden) mi.src = full;
  }).catch(() => {});
}
const makeThumb = src => new Promise((res, rej) => {
  const i = new Image();
  i.onload = () => {
    const k = Math.min(1, 360 / Math.max(i.width, i.height));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(i.width * k)); c.height = Math.max(1, Math.round(i.height * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(i, 0, 0, c.width, c.height);
    for (const q of [0.72, 0.6, 0.5]) { const d = c.toDataURL("image/jpeg", q); if (d.length < 60000) return res(d); }
    res(c.toDataURL("image/jpeg", 0.4));
  };
  i.onerror = () => rej(new Error("تعذر تجهيز النسخة الصغيرة"));
  i.src = src;
});

function render() {
  fillDepts(); deptF = $("deptFilter").value;
  const cats = [...new Set(parts.map(p => p.cat))];
  const chips = $("chips"); chips.replaceChildren(...["الكل", ...cats].map(c => el("button", { type: "button", className: "chip" + (c === cat ? " on" : ""), textContent: c, onclick: () => { cat = c; render(); } })));
  $("cats").replaceChildren(...cats.map(c => el("option", { value: c })));
  const q = $("q").value.trim().toLowerCase();
  const shown = parts.filter(p => (cat === "الكل" || p.cat === cat) && (!deptF || p.dept === deptF) && `${p.name} ${p.code || ""} ${p.cat} ${p.model || ""} ${p.loc || ""} ${p.notes || ""} ${p.dept || ""} ${p.dims || ""} ${p.qtyu ? "تقريبي مش متأكد" : ""}`.toLowerCase().includes(q));
  $("empty").textContent = window.__ld ? "مفيش نتائج." : "جاري التحميل..."; $("empty").hidden = !!window.__ld && shown.length > 0;
  $("grid").replaceChildren(...shown.map(p => {
    const img = el("img", { src: p.thumb || p.img || "", alt: p.name, loading: "lazy", onclick: () => openFull(p) });
    const card = el("div", { className: "card" }, img,
      el("div", { className: "name", textContent: p.name }),
      el("div", { className: "meta", textContent: (p.code ? p.code + " · " : "") + p.cat + (p.dept ? " · " + p.dept : "") }),
 ...(p.model ? [el("div", { className: "meta", textContent: "موديل: " + p.model })] : []),
 ...(p.loc ? [el("div", { className: "meta", textContent: "المكان: " + p.loc })] : []),
 ...(p.dims ? [el("div", { className: "meta", textContent: "المقاس: " + p.dims })] : []),
 ...(p.notes ? [el("div", { className: "meta", textContent: p.notes })] : []),
      el("div", { className: p.qty > 0 ? "" : "out", textContent: p.qty > 0 ? (p.qtyu ? "متاح: حوالي " + p.qty + " (العدد غير مؤكد)" : "متاح: " + p.qty) : "خلصت" }),
      el("button", { className: "btn wide", type: "button", disabled: p.qty <= 0, textContent: "اطلب", onclick: () => openReq(p) }));
    if (isOwner) card.append(el("div", { className: "row" },
      el("button", { className: "btn sec", type: "button", textContent: "+1", onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty + 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "-1", disabled: p.qty <= 0, onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty - 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "تعديل", onclick: () => openEdit(p) }),
 (() => { const s = el("select", { className: "inp", title: "نقل لقسم آخر" }, el("option", { value: "", textContent: "نقل إلى…" }), ...DEPTS.filter(d => d !== p.dept).map(d => el("option", { value: d, textContent: d }))); s.onchange = async () => { if (!s.value) return; const to = s.value; if (confirm("نقل " + p.name + " إلى " + to + "؟")) { try { await updateDoc(doc(db, "parts", p.id), { dept: to }); flash("تم نقل القطعة إلى " + to); } catch (e) { flash("تعذر النقل: " + e.message); } } s.value = ""; }; return s; })(),
 el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => { if (confirm("حذف " + p.name + "؟")) { deleteDoc(doc(db, "parts", p.id)); deleteDoc(doc(db, "partimg", p.id)).catch(() => {}); } } })));
    return card;
  }));
}
$("q").oninput = render;
function renderLow() {
 const low = parts.filter(p => p.qty <= 0).sort((x, y) => x.qty - y.qty);
 $("lowList").replaceChildren(...(low.length ? low.map(p => el("div", { className: "req" }, el("div", { className: "name", textContent: p.name }), el("div", { className: p.qty > 0 ? "low" : "out", textContent: p.qty > 0 ? "باقي " + p.qty : "خلصت" }))) : [el("p", { className: "hint", textContent: "مفيش قطع خلصت." })]));
}
// ---- edit part ----
function openEdit(p) {
 editPart = p; $("eerr").textContent = "";
 $("ename").value = p.name; $("ecode").value = p.code || ""; $("ecat").value = p.cat; $("edept").value = p.dept || ""; $("emodel").value = p.model || ""; $("eloc").value = p.loc || ""; $("edims").value = p.dims || ""; $("enotes").value = p.notes || ""; $("eqty").value = p.qty; $("equ").checked = !!p.qtyu;
 $("editModal").hidden = false;
}
$("ecancel").onclick = () => $("editModal").hidden = true;
$("esave").onclick = async () => {
 const name = $("ename").value.trim(), c = $("ecat").value.trim();
 if (!name || !c) { $("eerr").textContent = "الاسم والتصنيف مطلوبين"; return; }
 $("esave").disabled = true;
 try {
 await updateDoc(doc(db, "parts", editPart.id), { name, code: $("ecode").value.trim(), cat: c, dept: $("edept").value, model: $("emodel").value.trim(), loc: $("eloc").value.trim(), dims: $("edims").value.trim(), notes: $("enotes").value.trim(), qty: (n => $("equ").checked && !n ? 1 : n)(Math.max(0, parseInt($("eqty").value) || 0)), qtyu: $("equ").checked });
 $("editModal").hidden = true; flash("تم حفظ التعديل.");
 } catch (e) { $("eerr").textContent = "تعذر الحفظ: " + e.message; }
 $("esave").disabled = false;
};
// ---- export (CSV opens in Excel) ----
let reqs = [];
function download(name, rows) {
 const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
 const blob = new Blob(["\ufeff" + rows.map(r => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
 const a = el("a", { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
}
const stamp = () => new Date().toISOString().slice(0, 10);
$("expParts").onclick = () => download(`parts-${stamp()}.csv`, [["الاسم", "رقم القطعة", "التصنيف", "القسم", "الموديل", "المكان", "المقاس", "ملاحظات", "الكمية", "العدد مؤكد؟"], ...parts.map(p => [p.name, p.code, p.cat, p.dept, p.model, p.loc, p.dims, p.notes, p.qtyu ? p.qty + " (تقريبي)" : p.qty, p.qtyu ? "لا" : "نعم"])]);
$("expReqs").onclick = () => download(`requests-${stamp()}.csv`, [["القطعة", "اسم الطالب", "قسم الطالب", "رقم/إيميل", "الوقت", "الحالة", "تم التسليم"], ...reqs.map(r => [r.partName, r.name, r.dept, r.phone, r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-EG") : "", ({ pending: "في الانتظار", rejected: "مرفوض" })[r.status] || "تمت الموافقة", r.done ? "نعم" : "لا"])]);
$("mclose").onclick = () => { $("modal").hidden = true; modalPartId = null; };

// ---- نسخة احتياطية كاملة (JSON فيه الصور) + تحويل القطع القديمة للنظام السريع ----
$("backup").onclick = async () => {
  $("backup").disabled = true;
  try {
    const snap = await getDocs(collection(db, "partimg")), imgMap = {};
    snap.forEach(d => { imgMap[d.id] = d.data().img; });
    const iso = t => t && t.toDate ? t.toDate().toISOString() : null;
    const data = { exportedAt: new Date().toISOString(), parts: parts.map(p => ({ ...p, createdAt: iso(p.createdAt), img: p.img || imgMap[p.id] || null })), requests: reqs.map(r => ({ ...r, createdAt: iso(r.createdAt), decidedAt: iso(r.decidedAt) })) };
    const a = el("a", { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" })), download: `backup-${stamp()}.json` });
    document.body.append(a); a.click(); a.remove();
    flash("اتنزّلت النسخة الاحتياطية (" + data.parts.length + " قطعة).");
  } catch (e) { flash("تعذر النسخ الاحتياطي: " + e.message); }
  $("backup").disabled = false;
};
$("migrate").onclick = async () => {
  const st = $("migStatus"), todo = parts.filter(p => p.img || !p.thumb);
  if (!todo.length) { st.textContent = "كل القطع على النظام السريع بالفعل."; return; }
  $("migrate").disabled = true;
  let ok = 0, fail = 0;
  for (const p of todo) {
    st.textContent = "جاري تحويل " + (ok + fail + 1) + " من " + todo.length + ": " + p.name;
    try {
      let src = p.img;
      if (!src) { const s = await getDoc(doc(db, "partimg", p.id)); src = s.exists() ? s.data().img : ""; }
      if (!src) throw new Error("مفيش صورة");
      const thumb = p.thumb || await makeThumb(src);
      await setDoc(doc(db, "partimg", p.id), { img: src });
      await updateDoc(doc(db, "parts", p.id), { thumb, img: deleteField() });
      ok++;
    } catch (e) { fail++; console.error("migrate failed", p.id, e); }
  }
  st.textContent = "تم تحويل " + ok + " قطعة" + (fail ? "، وفشل " + fail + " (التفاصيل في الـconsole)" : "") + ".";
  $("migrate").disabled = false;
};

// ---- request a part ----
function openReq(p) { reqPart = p; $("rtitle").textContent = "طلب: " + p.name; $("rname").value = localStorage.getItem("rname") || ""; $("rphone").value = localStorage.getItem("rphone") || ""; $("rdept").value = localStorage.getItem("rdept") || ""; $("rerr").textContent = ""; $("reqModal").hidden = false; }
$("rcancel").onclick = () => $("reqModal").hidden = true;
$("rsend").onclick = async () => {
  const name = $("rname").value.trim(), phone = $("rphone").value.trim();
  if (!name) { $("rerr").textContent = "اكتب اسمك"; return; }
  $("rsend").disabled = true;
  try {
    const cur = parts.find(x => x.id === reqPart.id);
    if (!cur || cur.qty <= 0) throw new Error("القطعة خلصت");
    await addDoc(collection(db, "requests"), { partId: reqPart.id, partName: cur.name, name, phone, dept: $("rdept").value, qty: 1, status: "pending", createdAt: serverTimestamp(), done: false });
    localStorage.setItem("rname", name); localStorage.setItem("rphone", phone); localStorage.setItem("rdept", $("rdept").value);
    $("reqModal").hidden = true; flash("تم ارسال الطلب");
  } catch (e) { $("rerr").textContent = e.message; }
  $("rsend").disabled = false;
};

// ---- موافقة / رفض الطلبات: الكمية بتنقص بعد الموافقة بس ----
const badge = el("span", { id: "reqBadge", className: "badge", hidden: true, title: "طلبات في انتظار موافقتك", role: "button", tabIndex: 0, "aria-label": "افتح الطلبات في إدارة المخزن" });
$("ownerBtn").after(badge);
function highlightPendingRequests() {
  const pending = [...$("reqs").querySelectorAll(".req.pending")];
  pending.forEach(row => {
    row.style.outline = "3px solid #df4a3f";
    row.style.outlineOffset = "2px";
    setTimeout(() => { row.style.outline = ""; row.style.outlineOffset = ""; }, 5000);
  });
  // سكرول فوري (مش smooth) ويتكرر بعد ما الصور والعناصر تحمّل وتحرّك الصفحة
  const go = () => { const t = $("reqs").querySelector(".req.pending") || $("reqs"); t.scrollIntoView({ behavior: "auto", block: "center" }); };
  go(); [300, 800, 1600].forEach(ms => setTimeout(() => { if (location.hash === "#requests") go(); }, ms));
}
function openRequests() {
  if (!isOwner) {
    $("owner").hidden = true;
    $("login").hidden = false;
    $("email").focus({ preventScroll: true });
    return;
  }
  $("login").hidden = true;
  $("owner").hidden = false;
  highlightPendingRequests();
  clearNotifs();
}
function goToRequests() {
  if (location.hash !== "#requests") history.replaceState(null, "", "#requests");
  openRequests();
}
badge.onclick = goToRequests;
badge.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToRequests(); } };
window.addEventListener("hashchange", () => { if (location.hash === "#requests") openRequests(); });
const baseTitle = document.title;
function setBadge(n) { badge.textContent = n; badge.hidden = !n; document.title = n ? "(" + n + ") " + baseTitle : baseTitle; }
// إشعار المتصفح: بيشتغل والصفحة مفتوحة أو في الخلفية. مش بيوصل لو المتصفح اتقفل خالص.
let reqSeen = false, swReg = null, ac = null;
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").then(r => swReg = r).catch(() => {});
const beep = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); const o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); o.frequency.value = 880; g.gain.value = 0.2; o.start(); o.stop(ac.currentTime + 0.35); } catch (e) {} };
async function notify(title, body) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opt = { body, vibrate: [200, 100, 200, 100, 300], tag: "newreq", renotify: true };
  try { if (swReg) { await swReg.showNotification(title, opt); return; } } catch (e) {}
  try { const n = new Notification(title, opt); n.onclick = () => { try { n.close(); } catch (e) {} try { window.focus(); } catch (e) {} goToRequests(); }; } catch (e) {}
}
// يقفل أي إشعار ظاهر (لما تفتح الطلبات أو ترجع للصفحة)
async function clearNotifs() { try { const r = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration()); if (r) (await r.getNotifications()).forEach(n => n.close()); } catch (e) {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden && isOwner) clearNotifs(); });
window.addEventListener("focus", () => { if (isOwner) clearNotifs(); });
const notifBtn = el("button", { className: "btn sec wide", type: "button" });
const updNotif = () => { const p = "Notification" in window ? Notification.permission : "none"; notifBtn.textContent = p === "granted" ? "إشعارات المتصفح شغالة ✓" : p === "denied" ? "الإشعارات مقفولة من إعدادات المتصفح" : p === "none" ? "المتصفح مش بيدعم الإشعارات" : "فعّل إشعارات المتصفح"; };
notifBtn.onclick = async () => { beep(); if (!("Notification" in window)) return; try { await Notification.requestPermission(); } catch (e) {} updNotif(); notify("تم تفعيل الإشعارات", "هيوصلك إشعار لما حد يطلب قطعة."); };
updNotif(); $("reqs").before(notifBtn);
async function approveReq(ref) {
  let approx = false;
  try {
    await runTransaction(db, async tx => {
      const rs = await tx.get(ref);
      if (!rs.exists()) throw new Error("الطلب اتحذف");
      const r = rs.data();
      if ((r.status || "approved") !== "pending") throw new Error("الطلب ده اتعالج قبل كده");
      const pref = doc(db, "parts", r.partId), ps = await tx.get(pref);
      if (!ps.exists()) throw new Error("القطعة اتحذفت");
      const p = ps.data(), need = r.qty || 1;
      if (p.qty < need && !p.qtyu) throw new Error("الكمية المتاحة (" + p.qty + ") أقل من المطلوب (" + need + "). ارفض الطلب أو عدّل الكمية الأول.");
      approx = !!p.qtyu;
      tx.update(pref, { qty: Math.max(0, p.qty - need) });
      tx.update(ref, { status: "approved", decidedAt: serverTimestamp() });
    });
    flash(approx ? "تمت الموافقة ونقصت الكمية. العدد كان تقريبي، راجع الكمية الفعلية." : "تمت الموافقة ونقصت الكمية.");
  } catch (e) { flash("تعذرت الموافقة: " + e.message); }
}
async function rejectReq(ref) {
  try {
    await runTransaction(db, async tx => {
      const rs = await tx.get(ref);
      if (!rs.exists()) throw new Error("الطلب اتحذف");
      if ((rs.data().status || "approved") !== "pending") throw new Error("الطلب ده اتعالج قبل كده");
      tx.update(ref, { status: "rejected", decidedAt: serverTimestamp() });
    });
    flash("تم رفض الطلب. الكمية زي ما هي.");
  } catch (e) { flash("تعذر الرفض: " + e.message); }
}

// ---- owner login ----
$("ownerBtn").onclick = () => { if (isOwner) $("owner").scrollIntoView(); else { $("login").hidden = false; $("email").focus(); } };
$("cancelLogin").onclick = () => $("login").hidden = true;
$("doLogin").onclick = async () => { $("loginErr").textContent = ""; try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("pass").value); $("pass").value = ""; } catch { $("loginErr").textContent = "الإيميل أو الباسورد غلط"; } };
$("logout").onclick = () => signOut(auth);
onAuthStateChanged(auth, u => {
  isOwner = !!u; $("owner").hidden = !u; $("login").hidden = true; $("ownerBtn").textContent = "إدارة المخزن";
  if (unsubReq) { unsubReq(); unsubReq = null; }
  setBadge(0); reqSeen = false;
  if (u && location.hash === "#requests") openRequests();
  else if (!u && location.hash === "#requests") { $("login").hidden = false; $("email").focus({ preventScroll: true }); }
  if (u) unsubReq = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), s => {
    const docs = s.docs, st = d => d.data().status || "approved"; // الطلبات القديمة (قبل نظام الموافقة) اتخصمت فعلًا
    reqs = docs.map(d => d.data());
    const ordered = [...docs.filter(d => st(d) === "pending"), ...docs.filter(d => st(d) !== "pending")];
    if (!reqSeen) reqSeen = true; else s.docChanges().forEach(c => { const r = c.doc.data(); if (c.type === "added" && r.status === "pending") { notify("طلب جديد: " + r.partName, r.name + (r.dept ? " (" + r.dept + ")" : "") + " طلب القطعة دي. افتح إدارة المخزن للموافقة."); beep(); } });
    setBadge(docs.filter(d => st(d) === "pending").length);
    $("reqs").replaceChildren(...(s.empty ? [el("p", { className: "hint", textContent: "مفيش طلبات." })] : ordered.map(d => {
      const r = d.data(), t = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-EG") : "", sx = st(d);
      const label = sx === "pending" ? "في انتظار موافقتك" : sx === "rejected" ? "مرفوض" : "تمت الموافقة";
      return el("div", { className: "req" + (r.done ? " done" : "") + (sx === "pending" ? " pending" : "") },
        el("div", {}, el("div", { className: "name", textContent: `${r.partName} ← ${r.name}` }), el("div", { className: "meta", textContent: `${r.dept ? r.dept + " · " : ""}${r.phone || "بدون رقم"} · ${t}` }), el("div", { className: "meta st-" + sx, textContent: label })),
        el("div", { className: "row" },
          ...(sx === "pending" ? [
            el("button", { className: "btn", type: "button", textContent: "موافقة", onclick: e => { e.target.disabled = true; approveReq(d.ref).finally(() => e.target.disabled = false); } }),
            el("button", { className: "btn sec", type: "button", textContent: "رفض", onclick: () => rejectReq(d.ref) })
          ] : sx === "approved" ? [el("button", { className: "btn sec", type: "button", textContent: r.done ? "رجّع" : "تم التسليم", onclick: () => updateDoc(d.ref, { done: !r.done }) })] : []),
          el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => { if (confirm("حذف الطلب؟")) deleteDoc(d.ref); } })));
    })));
    if (location.hash === "#requests") highlightPendingRequests();
  }, e => flash("تعذر تحميل الطلبات: " + e.message));
  render();
});

// ---- add part: capture 3-4 shots, merge ----
let shots = [], mergedUrl = "", dimsEdited = false;
const dimsOf = () => shots.filter(b => b.mm).flatMap(b => Array.isArray(b.mm) ? b.mm.map(d => d.kind + " " + d.txt) : [b.mm.kind + " " + b.mm.mm + " مم"]).join("، ");
const drawShots = () => {
  $("shots").replaceChildren(...[0, 1, 2, 3].map(i => el("div", { className: "shot" }, shots[i] ? el("img", { src: URL.createObjectURL(shots[i]), alt: "لقطة " + (i + 1) }) : "لقطة " + (i + 1) + (i > 2 ? " (اختياري)" : ""))));
  $("merge").disabled = shots.length < 3; $("shoot").disabled = $("gallery").disabled = shots.length >= 4; if (!dimsEdited) $("fdims").value = dimsOf(); checkSave(); persistShots();
};
$("fdims").oninput = () => dimsEdited = true;
// ننسخ بايتات الصورة فورًا قبل ما نفرّغ الحقل (على أندرويد تفريغ الحقل بيبوّظ الملف فتظهر الصورة مكسورة)
// وبعدها بنجهّز كل صورة: نحوّلها JPEG بحد أقصى 1600px عشان الدمج والحفظ، ونحوّل HEIC لو الجهاز مش بيقراها
const imgFromBlob = b => new Promise((res, rej) => { const u = URL.createObjectURL(b), i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); }; i.src = u; });
const shrink = async b => {
  const im = await imgFromBlob(b), k = Math.min(1, 1600 / Math.max(im.width, im.height));
  const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
  return await new Promise((res, rej) => c.toBlob(x => x ? res(x) : rej(new Error("encode")), "image/jpeg", 0.88));
};
let heicLib = null;
const heicToJpeg = async b => {
  if (!heicLib) { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js"; s.onload = res; s.onerror = () => rej(new Error("تعذر تحميل محول HEIC")); document.head.append(s); }); heicLib = window.heic2any; }
  const out = await heicLib({ blob: b, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
};
const normShot = async f => {
  const buf = await f.arrayBuffer(); if (!buf.byteLength) throw new Error("الملف فاضي");
  const b = new Blob([buf], { type: f.type || "image/jpeg" });
  try { return await shrink(b); } catch (e) {}
  try { return await shrink(await heicToJpeg(b)); } catch (e) { throw new Error(/heic|heif/i.test((f.type || "") + " " + (f.name || "")) ? "صورة HEIC اتعذّر تحويلها" : "صيغة الصورة دي مش مدعومة"); }
};
const addFiles = async e => {
  const inp = e.target, fl = [...inp.files].slice(0, 4 - shots.length);
  const got = [], bad = [];
  for (const f of fl) { try { got.push(await normShot(f)); } catch (err) { bad.push(err.message); } }
  inp.value = "";
  if (bad.length) flash("في " + bad.length + " صورة ما اتقرتش (" + bad[0] + "). جرّب تختارها تاني أو حوّلها JPEG.");
  shots = [...shots, ...got].slice(0, 4); mergedUrl = ""; $("merged").hidden = true; drawShots();
};
$("cam").onchange = addFiles; $("pick").onchange = addFiles;
// ---- الكاميرا = شاشة القياس AR (WebXR): قيس، التقط لقطة بالقياس، كرر لحد ٤ لقطات، وارجع للفورم ----
$("shoot").onclick = () => startAR();
$("plain").onclick = () => $("cam").click();
$("gallery").onclick = () => $("pick").click();
$("clear").onclick = () => { dimsEdited = false; shots = []; mergedUrl = ""; $("merged").hidden = true; drawShots(); };
const loadImg = f => new Promise((res, rej) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("في لقطة مش بتتقرا، امسح اللقطات وجرّب تاني")); i.src = u; });
async function combine(files) {
  // كل لقطة بتظهر كاملة من غير قص: الخلية بنسبة الصور الحقيقية (الوسيط)
  const imgs = await Promise.all(files.map(loadImg));
  const rs = imgs.map(i => i.width / i.height).sort((x, y) => x - y), r = rs[Math.floor(rs.length / 2)];
  for (const cw of [1000, 850, 700, 600]) {
    const ch = Math.round(cw / r), pad = 6, c = document.createElement("canvas"); c.width = cw * 2; c.height = ch * 2;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    const cells = [[0, 0], [cw, 0], [0, ch], [cw, ch]];
    if (imgs.length === 3) cells[2] = [cw / 2, ch]; // الثالثة في النص تحت
    imgs.forEach((im, i) => { const [x, y] = cells[i], k = Math.min((cw - 2 * pad) / im.width, (ch - 2 * pad) / im.height), w = im.width * k, h = im.height * k;
      g.drawImage(im, x + (cw - w) / 2, y + (ch - h) / 2, w, h); });
    for (const qlt of [0.92, 0.85, 0.75, 0.65]) { const d = c.toDataURL("image/jpeg", qlt); if (d.length < 900000) return d; } // حد Firestore 1MB للمستند
  }
  throw new Error("الصورة كبيرة، جرّب لقطات أقل");
}
$("merge").onclick = async () => { $("merge").disabled = true; $("saveErr").textContent = ""; try { mergedUrl = await combine(shots); $("merged").src = mergedUrl; $("merged").hidden = false; } catch (e) { $("saveErr").textContent = e.message; } $("merge").disabled = shots.length < 3; checkSave(); };
const checkSave = () => $("save").disabled = !(mergedUrl && $("fname").value.trim() && $("fcat").value.trim());
["fname", "fcat"].forEach(i => $(i).oninput = checkSave);
$("save").onclick = async () => {
  $("save").disabled = true; $("saveErr").textContent = "";
  const done = () => { shots = []; mergedUrl = ""; $("merged").hidden = true; ["fname", "fcode", "fcat", "fmodel", "floc", "fnotes", "fdims"].forEach(i => $(i).value = ""); dimsEdited = false; $("fdept").value = ""; $("fqty").value = "1"; $("fqtyu").checked = false; drawShots(); flash("تمت إضافة القطعة."); localStorage.removeItem("draft"); localStorage.removeItem("draftu"); };
  try {
    const thumb = await makeThumb(mergedUrl);
    const ref = doc(collection(db, "parts"));
    await setDoc(doc(db, "partimg", ref.id), { img: mergedUrl });
    await setDoc(ref, { name: $("fname").value.trim(), code: $("fcode").value.trim(), cat: $("fcat").value.trim(), dept: $("fdept").value, model: $("fmodel").value.trim(), loc: $("floc").value.trim(), dims: $("fdims").value.trim(), notes: $("fnotes").value.trim(), qty: (n => $("fqtyu").checked && !n ? 1 : n)(Math.max(0, parseInt($("fqty").value) || 0)), qtyu: $("fqtyu").checked, thumb, createdAt: serverTimestamp() });
    done();
  } catch (e) { if (e && e.code === "already-exists") { done(); return; } $("saveErr").textContent = "تعذر الحفظ: " + e.message; checkSave(); }
};
// ---- حفظ مؤقت للصور والبيانات لحد ما تحفظ القطعة (لو المتصفح اتقفل في الخلفية) ----
let idbOk = false;
const idb = () => new Promise((res, rej) => { const r = indexedDB.open("draft", 1); r.onupgradeneeded = () => r.result.createObjectStore("s"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function persistShots() { if (!idbOk) return; try { const d = await idb(), s = d.transaction("s", "readwrite").objectStore("s"); s.clear(); shots.forEach((b, i) => s.put({ blob: b, mm: b.mm || null }, i)); } catch (e) {} }
async function restoreShots() {
 try { const d = await idb(), all = await new Promise((res, rej) => { const q = d.transaction("s").objectStore("s").getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  shots = all.map(x => { if (x.mm) x.blob.mm = x.mm; return x.blob; }).filter(b => b && b.size > 0).slice(0, 4); } catch (e) {}
 idbOk = true; drawShots();
 if (shots.length) { flash("رجّعت الصور اللي كانت متصورة."); if (shots.length >= 3) $("merge").click(); }
}
const DF = ["fname", "fcode", "fcat", "fdept", "fmodel", "floc", "fnotes", "fdims", "fqty"];
const saveDraft = () => { try { localStorage.setItem("draft", JSON.stringify(DF.map(i => $(i).value))); } catch (e) {} };
$("fqtyu").addEventListener("change", () => { try { localStorage.setItem("draftu", $("fqtyu").checked ? "1" : ""); } catch (e) {} });
if (localStorage.getItem("draftu")) $("fqtyu").checked = true;
DF.forEach(i => { $(i).addEventListener("input", saveDraft); $(i).addEventListener("change", saveDraft); });
try { const d = JSON.parse(localStorage.getItem("draft") || "null"); if (d) DF.forEach((i, k) => { if (d[k]) $(i).value = d[k]; }); } catch (e) {}
if ($("fdims").value) dimsEdited = true;
restoreShots();

// ---- إضافة قسم جديد (المالك) ----
$("addDept").onclick = () => {
 const n = $("newDept").value.trim(); if (!n) return;
 if (DEPTS.includes(n)) { flash("القسم موجود بالفعل."); return; }
 localStorage.setItem("xdepts", JSON.stringify([...extraDepts(), n])); $("newDept").value = ""; fillDepts(); $("fdept").value = n; flash("تمت إضافة القسم: " + n);
};


// ---- AR measuring camera ----
const fmtLen = m => { const mm = m * 1000; return mm < 1000 ? mm.toFixed(0) + " مم" : (m * 100).toFixed(1) + " سم"; };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mul4v = (m, v) => { const o = [0, 0, 0, 0]; for (let r = 0; r < 4; r++) o[r] = m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]; return o; };
const project = (proj, view, p, W, H) => { const c = mul4v(proj, mul4v(view, [p[0], p[1], p[2], 1])); if (c[3] <= 0) return null; return [(c[0] / c[3] * 0.5 + 0.5) * W, (1 - (c[1] / c[3] * 0.5 + 0.5)) * H]; };
let xrSession = null;
const A = { start: null, end: null, hit: null, list: [], proj: null, view: null, gl: null, glb: null, refSpace: null, src: null, wantShot: false };
const SH = { base: null, meas: [], rot: 0, proj: null, view: null };
const arCv = $("arCv"), actx = arCv.getContext("2d");
const arMsg = t => { $("arMsg").textContent = t; };
const arToast = (t, ms) => { const e = $("arToast"); e.textContent = t; e.style.display = "block"; setTimeout(() => e.style.display = "none", ms || 3500); };
function arRender() {
  const W = arCv.width = innerWidth, H = arCv.height = innerHeight, ctx = actx;
  ctx.clearRect(0, 0, W, H);
  const pr = p => p && A.proj ? project(A.proj, A.view, p, W, H) : null;
  const draw = (a, b, col) => { const pa = pr(a), pb = pr(b); if (!pa || !pb) return;
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
    ctx.fillStyle = "#fff"; [pa, pb].forEach(q => { ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, 7); ctx.fill(); });
    const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2; ctx.font = "bold 22px sans-serif"; ctx.textAlign = "center";
    const t = fmtLen(dist3(a, b)); ctx.lineWidth = 5; ctx.strokeStyle = "#000"; ctx.strokeText(t, mx, my - 12); ctx.fillStyle = "#ffd24a"; ctx.fillText(t, mx, my - 12); };
  A.list.forEach(m => draw(m[0], m[1], "#17a05a"));
  if (A.start && !A.end && A.hit) draw(A.start, A.hit, "#ffd24a");
  if (A.start && A.end) draw(A.start, A.end, "#ffd24a");
  const rp = pr(A.hit) || [W / 2, H / 2];
  ctx.strokeStyle = A.hit ? "#3df58c" : "#ff6b6b"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(rp[0], rp[1], 18, 0, 7); ctx.moveTo(rp[0] - 26, rp[1]); ctx.lineTo(rp[0] + 26, rp[1]); ctx.moveTo(rp[0], rp[1] - 26); ctx.lineTo(rp[0], rp[1] + 26); ctx.stroke();
}
function arUpdateText() {
  let t = "—";
  if (A.start && A.end) t = fmtLen(dist3(A.start, A.end)); else if (A.start && A.hit) t = fmtLen(dist3(A.start, A.hit));
  $("arLen").textContent = t; $("arCount").textContent = "اللقطات: " + shots.length + " / 4";
  if (!A.hit) arMsg("حرّك الموبايل ببطء على السطح لحد ما النقطة تظهر");
  else if (!A.start) arMsg("حط النقطة على أول الشيء واضغط على الشاشة");
  else if (!A.end) arMsg("حرّك مع الشيء، وعند الآخر اضغط تاني");
  else arMsg('تم. اضغط "قياس جديد" لقياس تاني');
}
function onSelect() {
  if (A.end) return;
  if (!A.hit) { arMsg("مفيش سطح متتبّع، حرّك الكاميرا شوية"); return; }
  if (!A.start) A.start = A.hit.slice(); else { A.end = A.hit.slice(); A.list.push([A.start, A.end]); }
  if (navigator.vibrate) navigator.vibrate(30);
  arUpdateText();
}
async function startAR() {
  if (shots.length >= 4) { flash("وصلت ٤ لقطات. امسح اللقطات لو عايز تعيد."); return; }
  if (!navigator.xr) { flash("المتصفح ده مش بيدعم قياس AR. افتح الصفحة من Chrome، أو استخدم زرار الكاميرا العادية."); return; }
  const root = $("arRoot");
  try {
    root.style.display = "block";
    const s = await navigator.xr.requestSession("immersive-ar", { requiredFeatures: ["hit-test"], optionalFeatures: ["dom-overlay", "camera-access"], domOverlay: { root } });
    xrSession = s;
    const gl = document.createElement("canvas").getContext("webgl", { xrCompatible: true });
    await gl.makeXRCompatible?.();
    s.updateRenderState({ baseLayer: new XRWebGLLayer(s, gl) });
    A.gl = gl; A.glb = null; try { A.glb = new XRWebGLBinding(s, gl); } catch (e) {}
    A.refSpace = await s.requestReferenceSpace("local");
    const viewer = await s.requestReferenceSpace("viewer");
    A.src = await s.requestHitTestSource({ space: viewer });
    A.start = A.end = A.hit = null; A.list = []; A.wantShot = false; $("arPrev").style.display = "none"; arUpdateText();
    s.addEventListener("select", onSelect);
    s.addEventListener("end", () => { xrSession = null; root.style.display = "none"; $("arPrev").style.display = "none"; A.src = null; drawShots(); if (shots.length >= 3 && !mergedUrl) $("merge").click(); });
    const hist = [];
    const loop = (t, frame) => {
      if (!xrSession) return;
      xrSession.requestAnimationFrame(loop);
      gl.bindFramebuffer(gl.FRAMEBUFFER, xrSession.renderState.baseLayer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const vp = frame.getViewerPose(A.refSpace);
      if (vp && vp.views[0]) { A.proj = vp.views[0].projectionMatrix; A.view = vp.views[0].transform.inverse.matrix; if (A.wantShot) { A.wantShot = false; grabShot(gl, vp.views[0]); } }
      const r = A.src && frame.getHitTestResults(A.src);
      if (r && r.length) { const p = r[0].getPose(A.refSpace);
        if (p) { const q = p.transform.position; hist.push([q.x, q.y, q.z]); if (hist.length > 7) hist.shift();
          A.hit = [0, 1, 2].map(i => { const v = hist.map(h => h[i]).sort((a, b) => a - b); return v[v.length >> 1]; }); } }
      else { A.hit = null; hist.length = 0; }
      arUpdateText(); arRender();
    };
    s.requestAnimationFrame(loop);
  } catch (e) {
    root.style.display = "none"; xrSession = null;
    flash("مقدرتش أشغّل قياس AR: " + (e && e.message ? e.message : e) + ". تأكد إنك في Chrome و\"Google Play Services for AR\" متثبت، أو استخدم زرار الكاميرا العادية.");
  }
}
$("arExit").onclick = () => { if (xrSession) xrSession.end(); };
$("arNew").onclick = () => { A.start = A.end = null; arUpdateText(); };
$("arUndo").onclick = () => { if (A.end) { A.list.pop(); A.end = null; } else if (A.start) A.start = null; arUpdateText(); };
["arBar", "arPrev"].forEach(id => $(id).addEventListener("beforexrselect", e => e.preventDefault()));
function grabShot(gl, view) {
  const cam = view.camera;
  SH.meas = A.list.map(m => [m[0].slice(), m[1].slice()]);
  if (A.start && !A.end && A.hit) SH.meas.push([A.start.slice(), A.hit.slice()]);
  SH.proj = Array.from(A.proj); SH.view = Array.from(A.view); SH.base = null;
  if (cam && A.glb) {
    try {
      const tex = A.glb.getCameraImage(cam), w = cam.width, h = cam.height;
      const fb = gl.createFramebuffer(), old = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("fb");
      const px = new Uint8ClampedArray(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, old); gl.deleteFramebuffer(fb);
      const t = document.createElement("canvas"); t.width = w; t.height = h; t.getContext("2d").putImageData(new ImageData(px, w, h), 0, 0);
      const b = document.createElement("canvas"); b.width = w; b.height = h; const g = b.getContext("2d"); g.translate(0, h); g.scale(1, -1); g.drawImage(t, 0, 0);
      SH.base = b; SH.rot = ((w > h) !== (innerWidth > innerHeight)) ? 1 : 0;
    } catch (e) { SH.base = null; }
  }
  showPrev();
}
const kindOf = () => $("arKind").value;
function composeShot() {
  const base = SH.base; let W = base.width, H = base.height;
  const rot = SH.rot % 4, sw = rot % 2 ? H : W, sh = rot % 2 ? W : H, k = Math.min(1, 1600 / Math.max(sw, sh));
  const c = document.createElement("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const g = c.getContext("2d"); g.save(); g.scale(k, k); g.translate(sw / 2, sh / 2); g.rotate(rot * Math.PI / 2); g.drawImage(base, -W / 2, -H / 2); g.restore();
  const CW = c.width, CH = c.height, fs = Math.max(18, Math.round(CW / 22)), lw = Math.max(3, Math.round(CW / 200));
  SH.meas.forEach(m => {
    const pa = project(SH.proj, SH.view, m[0], CW, CH), pb = project(SH.proj, SH.view, m[1], CW, CH); if (!pa || !pb) return;
    g.strokeStyle = "#ffd24a"; g.lineWidth = lw; g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
    g.fillStyle = "#fff"; [pa, pb].forEach(q => { g.beginPath(); g.arc(q[0], q[1], lw * 2, 0, 7); g.fill(); });
    g.font = "bold " + fs + "px sans-serif"; g.textAlign = "center"; const t = kindOf() + " " + fmtLen(dist3(m[0], m[1]));
    const x = (pa[0] + pb[0]) / 2, y = (pa[1] + pb[1]) / 2 - fs * 0.5; g.lineWidth = fs / 4; g.strokeStyle = "#000"; g.strokeText(t, x, y); g.fillStyle = "#ffd24a"; g.fillText(t, x, y);
  });
  return c;
}
function showPrev() {
  if (!SH.meas.length) { arToast("اعمل قياس الأول (اضغط على أول الشيء وآخره) وبعدين التقط", 3500); return; }
  if (!SH.base) {
    // الموبايل مادّيش صورة الكاميرا من جوه الـAR: نسجل المقاس بس في خانة المقاس، والصورة تتاخد من الكاميرا العادية أو المعرض
    const txt = SH.meas.map(m => kindOf() + " " + fmtLen(dist3(m[0], m[1]))).join("، ");
    $("fdims").value = ($("fdims").value ? $("fdims").value + "، " : "") + txt; dimsEdited = true; saveDraft();
    arToast("الموبايل ما سمحش بأخد الصورة من جوه القياس. اتسجل المقاس: " + txt + ". صوّر الصورة بالكاميرا العادية أو من المعرض.", 7000); return;
  }
  $("arPrevImg").src = composeShot().toDataURL("image/jpeg", 0.85); $("arPrev").style.display = "flex";
}
$("arShot").onclick = () => { if (shots.length >= 4) { arToast("وصلت ٤ لقطات"); return; } if (!A.hit && !A.end && !A.list.length) { arToast("لازم قياس الأول"); return; } A.wantShot = true; };
$("arRot").onclick = () => { SH.rot = (SH.rot + 1) % 4; showPrev(); };
$("arKind").onchange = () => { if (SH.base) showPrev(); };
$("arRetry").onclick = () => { $("arPrev").style.display = "none"; };
$("arUse").onclick = () => {
  const dims = SH.meas.map(m => ({ kind: kindOf(), txt: fmtLen(dist3(m[0], m[1])) }));
  composeShot().toBlob(b => {
    if (!b || shots.length >= 4) return;
    b.mm = dims; shots.push(b); mergedUrl = ""; $("merged").hidden = true; $("arPrev").style.display = "none";
    A.start = A.end = null; A.list = []; drawShots(); arUpdateText();
    if (shots.length >= 4) { arToast("٤ لقطات تمام. برجعك للفورم."); setTimeout(() => { if (xrSession) xrSession.end(); }, 900); }
    else arToast("اتحفظت اللقطة " + shots.length + " من ٤. قيس وصوّر اللقطة اللي بعدها، أو اضغط خروج.", 3000);
  }, "image/jpeg", 0.85);
};

// ---- عداد الزيارات (المالك بس اللي يشوفه) ----
const dayId = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
async function loadVisits() {
  const box = $("visitStats"); if (!box) return;
  try {
    const s = await getDocs(collection(db, "visits")); const m = {}; s.docs.forEach(d => m[d.id] = d.data().n || 0);
    const today = m[dayId()] || 0; let week = 0, all = 0;
    for (const k in m) { all += m[k]; if (Date.now() - new Date(k + "T12:00:00+02:00").getTime() < 7 * 864e5) week += m[k]; }
    box.textContent = "النهارده: " + today + " | آخر 7 أيام: " + week + " | الإجمالي: " + all + " (كل فتحة للموقع في جلسة جديدة بتتحسب مرة، وزياراتك انت مش بتتحسب)";
  } catch (e) { box.textContent = "تعذر تحميل الزيارات"; }
}
let visitDone = false;
onAuthStateChanged(auth, u => {
  if (u) { loadVisits(); }
  if (visitDone) return; visitDone = true; if (u) return;
  try { if (sessionStorage.getItem("vc")) return; sessionStorage.setItem("vc", "1"); } catch (e) {}
  setDoc(doc(db, "visits", dayId()), { n: increment(1) }, { merge: true }).catch(() => {});
});
