import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc, runTransaction, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.flat().forEach(k => e.append(k)); return e; };

if (firebaseConfig.apiKey === "PASTE_HERE") { $("cfgWarn").hidden = false; throw new Error("firebase config missing"); }
const app = initializeApp(firebaseConfig), db = getFirestore(app), auth = getAuth(app);

const DEPTS = ["الصيانة العامة", "صيانة IS", "صيانة الكولد إند", "صيانة المكابس", "فريق التغييرات", "التشكيل"];
const fillDept = (id, first) => { $(id).replaceChildren(el("option", { value: "", textContent: first }), ...DEPTS.map(d => el("option", { value: d, textContent: d }))); };
fillDept("deptFilter", "كل الأقسام"); fillDept("fdept", "القسم (اختياري)"); fillDept("edept", "القسم"); fillDept("rdept", "قسمك (اختياري)");
let deptF = "", editPart = null;
$("deptFilter").onchange = e => { deptF = e.target.value; render(); };
const minOf = p => Number.isFinite(p.minQty) ? p.minQty : 2;
const isLow = p => p.qty > 0 && p.qty <= minOf(p);
let parts = [], cat = "الكل", isOwner = false, reqPart = null, unsubReq = null;
const flash = t => { const m = $("msg"); m.textContent = t; m.hidden = false; setTimeout(() => m.hidden = true, 6000); };

onSnapshot(collection(db, "parts"), s => { parts = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); renderLow(); },
  e => flash("تعذر تحميل القطع: " + e.message));

function render() {
  const cats = [...new Set(parts.map(p => p.cat))];
  const chips = $("chips"); chips.replaceChildren(...["الكل", ...cats].map(c => el("button", { type: "button", className: "chip" + (c === cat ? " on" : ""), textContent: c, onclick: () => { cat = c; render(); } })));
  $("cats").replaceChildren(...cats.map(c => el("option", { value: c })));
  const q = $("q").value.trim().toLowerCase();
  const shown = parts.filter(p => (cat === "الكل" || p.cat === cat) && (!deptF || p.dept === deptF) && `${p.name} ${p.code || ""} ${p.cat} ${p.model || ""} ${p.loc || ""} ${p.notes || ""} ${p.dept || ""} ${p.dims || ""}`.toLowerCase().includes(q));
  $("empty").hidden = shown.length > 0;
  $("grid").replaceChildren(...shown.map(p => {
    const img = el("img", { src: p.img, alt: p.name, loading: "lazy", onclick: () => { $("mimg").src = p.img; $("mname").textContent = p.name; $("modal").hidden = false; } });
    const card = el("div", { className: "card" }, img,
      el("div", { className: "name", textContent: p.name }),
      el("div", { className: "meta", textContent: (p.code ? p.code + " · " : "") + p.cat + (p.dept ? " · " + p.dept : "") }),
 ...(p.model ? [el("div", { className: "meta", textContent: "موديل: " + p.model })] : []),
 ...(p.loc ? [el("div", { className: "meta", textContent: "المكان: " + p.loc })] : []),
 ...(p.dims ? [el("div", { className: "meta", textContent: "المقاس: " + p.dims })] : []),
 ...(p.notes ? [el("div", { className: "meta", textContent: p.notes })] : []),
 ...(isLow(p) ? [el("div", { className: "low", textContent: "⚠ قربت تخلص" })] : []),
      el("div", { className: p.qty > 0 ? "" : "out", textContent: p.qty > 0 ? "متاح: " + p.qty : "خلصت" }),
      el("button", { className: "btn wide", type: "button", disabled: p.qty <= 0, textContent: "اطلب", onclick: () => openReq(p) }));
    if (isOwner) card.append(el("div", { className: "row" },
      el("button", { className: "btn sec", type: "button", textContent: "+1", onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty + 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "-1", disabled: p.qty <= 0, onclick: () => updateDoc(doc(db, "parts", p.id), { qty: p.qty - 1 }) }),
      el("button", { className: "btn sec", type: "button", textContent: "تعديل", onclick: () => openEdit(p) }),
 el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => { if (confirm("حذف " + p.name + "؟")) deleteDoc(doc(db, "parts", p.id)); } })));
    return card;
  }));
}
$("q").oninput = render;
function renderLow() {
 const low = parts.filter(p => p.qty <= minOf(p)).sort((x, y) => x.qty - y.qty);
 $("lowList").replaceChildren(...(low.length ? low.map(p => el("div", { className: "req" }, el("div", { className: "name", textContent: p.name }), el("div", { className: p.qty > 0 ? "low" : "out", textContent: p.qty > 0 ? "باقي " + p.qty : "خلصت" }))) : [el("p", { className: "hint", textContent: "مفيش قطع قربت تخلص." })]));
}
// ---- edit part ----
function openEdit(p) {
 editPart = p; $("eerr").textContent = "";
 $("ename").value = p.name; $("ecode").value = p.code || ""; $("ecat").value = p.cat; $("edept").value = p.dept || ""; $("emodel").value = p.model || ""; $("eloc").value = p.loc || ""; $("edims").value = p.dims || ""; $("enotes").value = p.notes || ""; $("eqty").value = p.qty; $("emin").value = minOf(p);
 $("editModal").hidden = false;
}
$("ecancel").onclick = () => $("editModal").hidden = true;
$("esave").onclick = async () => {
 const name = $("ename").value.trim(), c = $("ecat").value.trim();
 if (!name || !c) { $("eerr").textContent = "الاسم والتصنيف مطلوبين"; return; }
 $("esave").disabled = true;
 try {
 await updateDoc(doc(db, "parts", editPart.id), { name, code: $("ecode").value.trim(), cat: c, dept: $("edept").value, model: $("emodel").value.trim(), loc: $("eloc").value.trim(), dims: $("edims").value.trim(), notes: $("enotes").value.trim(), qty: Math.max(0, parseInt($("eqty").value) || 0), minQty: Math.max(0, parseInt($("emin").value) || 0) });
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
$("expParts").onclick = () => download(`parts-${stamp()}.csv`, [["الاسم", "رقم القطعة", "التصنيف", "القسم", "الموديل", "المكان", "المقاس", "ملاحظات", "الكمية", "حد التنبيه"], ...parts.map(p => [p.name, p.code, p.cat, p.dept, p.model, p.loc, p.dims, p.notes, p.qty, minOf(p)])]);
$("expReqs").onclick = () => download(`requests-${stamp()}.csv`, [["القطعة", "اسم الطالب", "قسم الطالب", "رقم/إيميل", "الوقت", "تم التسليم"], ...reqs.map(r => [r.partName, r.name, r.dept, r.phone, r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-EG") : "", r.done ? "نعم" : "لا"])]);
$("mclose").onclick = () => $("modal").hidden = true;

// ---- request a part ----
function openReq(p) { reqPart = p; $("rtitle").textContent = "طلب: " + p.name; $("rname").value = localStorage.getItem("rname") || ""; $("rphone").value = localStorage.getItem("rphone") || ""; $("rdept").value = localStorage.getItem("rdept") || ""; $("rerr").textContent = ""; $("reqModal").hidden = false; }
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
      tx.set(rref, { partId: reqPart.id, partName: s.data().name, name, phone, dept: $("rdept").value, createdAt: serverTimestamp(), done: false });
    });
    localStorage.setItem("rname", name); localStorage.setItem("rphone", phone); localStorage.setItem("rdept", $("rdept").value);
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
    $("reqs").replaceChildren(...((reqs = s.docs.map(d => d.data()), s.empty) ? [el("p", { className: "hint", textContent: "مفيش طلبات." })] : s.docs.map(d => {
      const r = d.data(), t = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("ar-EG") : "";
      return el("div", { className: "req" + (r.done ? " done" : "") },
        el("div", {}, el("div", { className: "name", textContent: `${r.partName} ← ${r.name}` }), el("div", { className: "meta", textContent: `${r.dept ? r.dept + " · " : ""}${r.phone || "بدون رقم"} · ${t}` })),
        el("div", { className: "row" },
          el("button", { className: "btn sec", type: "button", textContent: r.done ? "رجّع" : "تم التسليم", onclick: () => updateDoc(d.ref, { done: !r.done }) }),
          el("button", { className: "btn sec", type: "button", textContent: "حذف", onclick: () => deleteDoc(d.ref) })));
    })));
  }, e => flash("تعذر تحميل الطلبات: " + e.message));
  render();
});

// ---- add part: capture 3-4 shots, merge ----
let shots = [], mergedUrl = "", dimsEdited = false;
const dimsOf = () => shots.filter(b => b.mm).map(b => b.mm.kind + " " + b.mm.mm + " مم").join("، ");
const drawShots = () => {
  $("shots").replaceChildren(...[0, 1, 2, 3].map(i => el("div", { className: "shot" }, shots[i] ? el("img", { src: URL.createObjectURL(shots[i]), alt: "لقطة " + (i + 1) }) : "لقطة " + (i + 1) + (i > 2 ? " (اختياري)" : ""))));
  $("merge").disabled = shots.length < 3; $("shoot").disabled = $("gallery").disabled = shots.length >= 4; if (!dimsEdited) $("fdims").value = dimsOf(); checkSave();
};
$("fdims").oninput = () => dimsEdited = true;
const addFiles = e => { shots = [...shots, ...e.target.files].slice(0, 4); e.target.value = ""; mergedUrl = ""; $("merged").hidden = true; drawShots(); };
$("cam").onchange = addFiles; $("pick").onchange = addFiles;
// كاميرا مباشرة: جلسة واحدة مفتوحة لكل اللقطات، ولو الإذن اترفض بنرجع لكاميرا الملفات
let stream = null;
const stopCam = () => { exitMeasure(); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $("live").srcObject = null; $("camModal").hidden = true; };
const camCount = () => { $("camCount").textContent = shots.length + " / 4"; $("snap").disabled = shots.length >= 4; $("camDone").textContent = shots.length >= 3 ? "تم (دمج)" : "تم"; };
$("shoot").onclick = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return $("cam").click();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (e) { return $("cam").click(); }
  $("live").srcObject = stream; $("camModal").hidden = false; camCount();
  try { await $("live").play(); } catch (e) {}
};
$("snap").onclick = () => {
  const v = $("live"); if (!v.videoWidth || shots.length >= 4) return;
  const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight)), c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k); c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  c.toBlob(b => { if (!b || shots.length >= 4) return; shots.push(b); mergedUrl = ""; $("merged").hidden = true; drawShots(); camCount();
    $("camFlash").classList.add("on"); setTimeout(() => $("camFlash").classList.remove("on"), 120); if (navigator.vibrate) navigator.vibrate(30); }, "image/jpeg", 0.9);
};
$("camDone").onclick = () => { stopCam(); if (shots.length >= 3) $("merge").click(); };
$("camCancel").onclick = stopCam;
$("gallery").onclick = () => $("pick").click();
$("clear").onclick = () => { dimsEdited = false; shots = []; mergedUrl = ""; $("merged").hidden = true; drawShots(); };
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
    await addDoc(collection(db, "parts"), { name: $("fname").value.trim(), code: $("fcode").value.trim(), cat: $("fcat").value.trim(), dept: $("fdept").value, model: $("fmodel").value.trim(), loc: $("floc").value.trim(), dims: $("fdims").value.trim(), notes: $("fnotes").value.trim(), minQty: Math.max(0, parseInt($("fmin").value) || 0), qty: Math.max(0, parseInt($("fqty").value) || 0), img: mergedUrl, createdAt: serverTimestamp() });
    shots = []; mergedUrl = ""; $("merged").hidden = true; ["fname", "fcode", "fcat", "fmodel", "floc", "fnotes", "fdims"].forEach(i => $(i).value = ""); dimsEdited = false; $("fdept").value = ""; $("fqty").value = "1"; $("fmin").value = "2"; drawShots(); flash("تمت إضافة القطعة.");
  } catch (e) { $("saveErr").textContent = "تعذر الحفظ: " + e.message; checkSave(); }
};
drawShots();

// ---- قياس داخل الكاميرا: تجميد اللقطة، كارت مرجع (نقطتين) + نقطتين للقياس، والنتيجة تتكتب على الصورة ----
// ملاحظة: قياس AR (WebXR) ما ينفعش يشتغل مع كاميرا الصفحة العادية في نفس الوقت، علشان كده القياس هنا بالصورة والكارت.
const mcv = $("mcv"); let mimg = null, mp = [], mdrag = -1;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const mmCalc = () => mp.length < 4 ? null : dist(mp[2], mp[3]) * (parseFloat($("mref").value) / dist(mp[0], mp[1]));
function mdraw(final) {
 const g = mcv.getContext("2d"), W = mcv.width, fs = Math.round(W / 28), lw = Math.max(2, Math.round(W / 400)), r = Math.round(W / 55);
 g.drawImage(mimg, 0, 0, W, mcv.height);
 const mm = mmCalc(), kind = $("mkind").value;
 [[0, 1, "#ffb300", "مرجع " + $("mref").value + " مم"], [2, 3, "#00e5ff", mm ? kind + " " + mm.toFixed(1) + " مم" : ""]].forEach(([i, j, col, t]) => {
  if (mp.length <= i) return;
  g.lineWidth = lw; g.strokeStyle = col;
  if (mp[j]) { g.beginPath(); g.moveTo(mp[i].x, mp[i].y); g.lineTo(mp[j].x, mp[j].y); g.stroke(); }
  if (!final) [mp[i], mp[j]].forEach(p => { if (p) { g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke(); } });
  if (mp[j] && t) { g.font = "bold " + fs + "px sans-serif"; g.direction = "rtl"; g.textAlign = "center"; const x = (mp[i].x + mp[j].x) / 2, y = (mp[i].y + mp[j].y) / 2 - fs * 0.6;
   g.lineWidth = fs / 4; g.strokeStyle = "#000"; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); }
 });
 const steps = ["اضغط على أول طرف للكارت (الطول المحدد)", "اضغط على الطرف التاني للكارت", "اضغط على بداية الشيء المراد قياسه", "اضغط على نهايته"];
 $("mstat").textContent = mp.length < 4 ? steps[mp.length] : (mm.toFixed(1) + " مم. اسحب أي نقطة للتعديل، وبعدين تثبيت. (حجم البكسل ≈ " + (parseFloat($("mref").value) / dist(mp[0], mp[1])).toFixed(2) + " مم)");
 $("mok").disabled = !mm;
}
const mpos = e => { const r = mcv.getBoundingClientRect(), s = Math.min(r.width / mcv.width, r.height / mcv.height); return { x: (e.clientX - r.left - (r.width - mcv.width * s) / 2) / s, y: (e.clientY - r.top - (r.height - mcv.height * s) / 2) / s, s }; };
mcv.onpointerdown = e => { const p = mpos(e); mdrag = mp.findIndex(q => dist(p, q) < 40 / p.s); if (mdrag < 0 && mp.length < 4) { mp.push({ x: p.x, y: p.y }); mdrag = mp.length - 1; } if (mdrag >= 0) mcv.setPointerCapture(e.pointerId); mdraw(); };
mcv.onpointermove = e => { if (mdrag < 0) return; const p = mpos(e); mp[mdrag] = { x: p.x, y: p.y }; mdraw(); };
mcv.onpointerup = mcv.onpointercancel = () => { mdrag = -1; };
function exitMeasure() { mcv.hidden = $("mstat").hidden = $("mrow").hidden = true; $("live").hidden = false; $("crow").hidden = false; $("camCount").hidden = false; mimg = null; mp = []; }
$("measureBtn").onclick = () => {
 const v = $("live"); if (!v.videoWidth || shots.length >= 4) return;
 const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight)); mimg = document.createElement("canvas");
 mimg.width = mcv.width = Math.round(v.videoWidth * k); mimg.height = mcv.height = Math.round(v.videoHeight * k); mimg.getContext("2d").drawImage(v, 0, 0, mimg.width, mimg.height);
 mp = []; $("live").hidden = true; mcv.hidden = $("mstat").hidden = $("mrow").hidden = false; $("crow").hidden = true; $("camCount").hidden = true; mdraw();
};
$("mreset").onclick = () => { mp = []; mdraw(); };
$("mback").onclick = exitMeasure;
$("mkind").onchange = $("mref").onchange = () => mdraw();
$("mok").onclick = () => {
 const mm = mmCalc(); if (!mm || shots.length >= 4) return; const kind = $("mkind").value; mdraw(true);
 mcv.toBlob(b => { if (!b) return; b.mm = { kind, mm: mm.toFixed(1) }; shots.push(b); mergedUrl = ""; $("merged").hidden = true; exitMeasure(); drawShots(); camCount(); if (navigator.vibrate) navigator.vibrate(30); }, "image/jpeg", 0.9);
};
