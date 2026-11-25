import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc, runTransaction, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.flat().forEach(k => e.append(k)); return e; };

if (firebaseConfig.apiKey === "PASTE_HERE") { $("cfgWarn").hidden = false; throw new Error("firebase config missing"); }
const app = initializeApp(firebaseConfig), db = getFirestore(app), auth = getAuth(app);

let parts = [], cat = "الكل", isOwner = false, reqPart = null, unsubReq = null;
const flash = t => { const m = $("msg"); m.textContent = t; m.hidden = false; setTimeout(() => m.hidden = true, 6000); };

onSnapshot(collection(db, "parts"), s => { parts = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); },
  e => flash("تعذر تحميل القطع: " + e.message));

function render() {
  const cats = [...new Set(parts.map(p => p.cat))];
  const chips = $("chips"); chips.replaceChildren(...["الكل", ...cats].map(c => el("button", { type: "button", className: "chip" + (c === cat ? " on" : ""), textContent: c, onclick: () => { cat = c; render(); } })));
  $("cats").replaceChildren(...cats.map(c => el("option", { value: c })));
  const q = $("q").value.trim().toLowerCase();
  const shown = parts.filter(p => (cat === "الكل" || p.cat === cat) && `${p.name} ${p.code || ""} ${p.cat}`.toLowerCase().includes(q));
  $("empty").hidden = shown.length > 0;
  $("grid").replaceChildren(...shown.map(p => {
    const img = el("img", { src: p.img, alt: p.name, loading: "lazy", onclick: () => { $("mimg").src = p.img; $("mname").textContent = p.name; $("modal").hidden = false; } });
    const card = el("div", { className: "card" }, img,
      el("div", { className: "name", textContent: p.name }),
      el("div", { className: "meta", textContent: (p.code ? p.code + " · " : "") + p.cat }),
      el("div", { className: p.qty > 0 ? "" : "out", textContent: p.qty > 0 ? "متاح: " + p.qty : "خلصت" }),
      el("button", { className: "btn wide", type: "button", disabled: p.qty <= 0, textContent: "اطلب", onclick: () => openReq(p) }));
    if (isOwner) card.append(el("div", { className: "row" },
      el("button", { className: "btn sec", type: "button", textContent: "+1", onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty + 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "-1", disabled: p.qty <= 0, onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty - 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => { if (confirm("حذف " + p.name + "؟")) deleteDoc(doc(db, "parts", p.id)); } })));
    return card;
  }));
}
$("q").oninput = render;
$("mclose").onclick = () => $("modal").hidden = true;

// ---- request a part ----
function openReq(p) { reqPart = p; $("rtitle").textContent = "طلب: " + p.name; $("rname").value = localStorage.getItem("rname") || ""; $("rphone").value = localStorage.getItem("rphone") || ""; $("rerr").textContent = ""; $("reqModal").hidden = false; }
$("rcancel").onclick = () => $("reqModal").hidden = true;
$("rsend").onclick = async () => {
  const name = $("rname").value.trim(), phone = $("rphone").value.trim();
  if (!name) { $("rerr").textContent = "اكتب اسمك"; return; }
  $("rsend").disabled = true;
  try {
    const pref = doc(db, "parts", reqPart.id), rref = doc(collection(db, "requests"));
    await runTransaction(db, async tx => {
      const s = await tx.get(pref);
      if (!s.exists() || s.data().qty <= 0) throw new Error("القطعة خلصت");
      tx.update(pref, { qty: s.data().qty - 1 });
      tx.set(rref, { partId: reqPart.id, partName: s.data().name, name, phone, createdAt: serverTimestamp(), done: false });
    });
    localStorage.setItem("rname", name); localStorage.setItem("rphone", phone);
    $("reqModal").hidden = true; flash("تم تسجيل طلبك. هيتواصل معاك المسؤول.");
  } catch (e) { $("rerr").textContent = e.message; }
  $("rsend").disabled = false;
};

// ---- owner login ----
$("ownerBtn").onclick = () => { if (isOwner) $("owner").scrollIntoView(); else { $("login").hidden = false; $("email").focus(); } };
$("cancelLogin").onclick = () => $("login").hidden = true;
$("doLogin").onclick = async () => { $("loginErr").textContent = ""; try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("pass").value); $("pass").value = ""; } catch { $("loginErr").textContent = "الإيميل أو الباسورد غلط"; } };
$("logout").onclick = () => signOut(auth);
onAuthStateChanged(auth, u => {
  isOwner = !!u; $("owner").hidden = !u; $("login").hidden = true; $("ownerBtn").textContent = u ? "وضع المالك" : "دخول المالك";
  if (unsubReq) { unsubReq(); unsubReq = null; }
  if (u) unsubReq = onSnapshot(query(collection(db, "requests"), orderBy("createdAt", "desc")), s => {
    $("reqs").replaceChildren(...(s.empty ? [el("p", { className: "hint", textContent: "مفيش طلبات." })] : s.docs.map(d => {
      const r = d.data(), t = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-EG") : "";
      return el("div", { className: "req" + (r.done ? " done" : "") },
        el("div", {}, el("div", { className: "name", textContent: `${r.partName} ← ${r.name}` }), el("div", { className: "meta", textContent: `${r.phone || "بدون رقم"} · ${t}` })),
        el("div", { className: "row" },
          el("button", { className: "btn sec", type: "button", textContent: r.done ? "رجّع" : "تم التسليم", onclick: () => updateDoc(d.ref, { done: !r.done }) }),
          el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => deleteDoc(d.ref) })));
    })));
  }, e => flash("تعذر تحميل الطلبات: " + e.message));
  render();
});

// ---- add part: capture 3-4 shots, merge ----
let shots = [], mergedUrl = "";
const drawShots = () => {
  $("shots").replaceChildren(...[0, 1, 2, 3].map(i => el("div", { className: "shot" }, shots[i] ? el("img", { src: URL.createObjectURL(shots[i]), alt: "لقطة " + (i + 1) }) : "لقطة " + (i + 1) + (i > 2 ? " (اختياري)" : ""))));
  $("merge").disabled = shots.length < 3; $("shoot").disabled = $("gallery").disabled = shots.length >= 4; checkSave();
};
const addFiles = e => { shots = [...shots, ...e.target.files].slice(0, 4); e.target.value = ""; mergedUrl = ""; $("merged").hidden = true; drawShots(); };
$("cam").onchange = addFiles; $("pick").onchange = addFiles;
$("shoot").onclick = () => $("cam").click(); $("gallery").onclick = () => $("pick").click();
$("clear").onclick = () => { shots = []; mergedUrl = ""; $("merged").hidden = true; drawShots(); };
const loadImg = f => new Promise((res, rej) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
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
  try {
    await addDoc(collection(db, "parts"), { name: $("fname").value.trim(), code: $("fcode").value.trim(), cat: $("fcat").value.trim(), qty: Math.max(0, parseInt($("fqty").value) || 0), img: mergedUrl, createdAt: serverTimestamp() });
    shots = []; mergedUrl = ""; $("merged").hidden = true; ["fname", "fcode", "fcat"].forEach(i => $(i).value = ""); $("fqty").value = "1"; drawShots(); flash("تمت إضافة القطعة.");
  } catch (e) { $("saveErr").textContent = "تعذر الحفظ: " + e.message; checkSave(); }
};
drawShots();
