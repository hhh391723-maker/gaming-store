/* =====================================================================
   shop.js — قائمة الباكات + الشراء من رصيد المحفظة + الرسائل
   بيعتمد على common.js (firebase, أدوات, محفظة).
   كل صفحة لعبة بتحط قبله:  <script>window.SHOP_GAME = 'pes';</script>
   ===================================================================== */
const GAME_KEY = window.SHOP_GAME || 'freefire';
const GAME_FALLBACK_IMG = 'assets/imgs/' + GAME_KEY + '.png';
const GAME_LABELS = { freefire: 'حساب فري فاير', pes: 'حساب PES', pubg: 'حساب PUBG', fortnite: 'حساب Fortnite' };

const isTrusted = getIsTrusted();
const myId = getMyId();

/* ---------- حقن الواجهات (الشراء + الرسائل) ---------- */
function injectUI() {
  if (!document.getElementById('siteToast')) {
    const t = document.createElement('div'); t.id = 'siteToast'; t.className = 'site-toast'; document.body.appendChild(t);
  }
  if (!document.getElementById('paymentModal')) {
    const m = document.createElement('div');
    m.id = 'paymentModal'; m.className = 'payment-modal';
    m.innerHTML = `
      <div class="payment-panel buy-panel">
        <div id="payStepForm">
          <div class="payment-header">
            <h3>تأكيد الشراء</h3>
            <p style="color:#94a3b8; margin:0;">هيتخصم من رصيد محفظتك</p>
          </div>
          <div class="pay-summary" id="paySummary"></div>
          <div class="buy-rows" id="buyRows"></div>
          <div id="buyAlert" class="buy-alert" style="display:none;"></div>
          <div style="padding:6px 20px 8px;">
            <button class="pay-btn" id="payNowBtn">تأكيد الشراء</button>
            <button id="payCancelBtn" class="pay-cancel">إلغاء</button>
          </div>
        </div>
        <div id="payStepDone" style="display:none; padding:32px 24px; text-align:center;">
          <div class="big-check">✓</div>
          <h3 style="margin:14px 0 6px;">تم الشراء بنجاح</h3>
          <p style="color:#94a3b8; margin:0 0 4px;">رقم الطلب</p>
          <p id="payOrderId" style="font-size:22px; font-weight:800; color:#f97316; margin:0 0 6px;"></p>
          <p style="color:#94a3b8; font-size:14px; margin:0 0 16px;">باقي في محفظتك: <b id="payLeft" style="color:#22c55e;"></b><br>بيانات الحساب اتحفظت في معاملاتك.</p>
          <button class="pay-btn" id="goTransBtn">عرض معاملاتي</button>
          <button id="payDoneClose" class="pay-cancel">إغلاق</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    document.getElementById('payNowBtn').addEventListener('click', onBuyButton);
    document.getElementById('payCancelBtn').addEventListener('click', closePayment);
    document.getElementById('payDoneClose').addEventListener('click', () => { closePayment(); document.dispatchEvent(new CustomEvent('purchase-done')); });
    document.getElementById('goTransBtn').addEventListener('click', () => { location.href = 'transactions.html'; });
    m.addEventListener('click', e => { if (e.target === m && !payBusy) closePayment(); });
  }
  if (!document.getElementById('messagesModal')) {
    const m = document.createElement('div');
    m.id = 'messagesModal'; m.className = 'messages-modal';
    m.innerHTML = `
      <div class="messages-panel">
        <div style="padding:16px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
          <h3 style="margin:0;">الرسائل</h3>
          <button onclick="closeMessages()" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer; width:auto; padding:4px 8px;">✕</button>
        </div>
        <div id="messagesList"></div>
      </div>`;
    document.body.appendChild(m);
  }
}

/* ---------- قائمة الباكات (لحظية) ---------- */
let livePacks = {};      // id -> data  (الباكات المتاحة)
let pendingPacks = {};   // id -> data  (الطلبات المعلقة)
let renderTimer = null;

function packCardHtml(key, p, pendingMode, id, idx) {
  const img = esc(p.mainImage || GAME_FALLBACK_IMG);
  const price = p.price ? `<div class="pack-price-pill">${esc(p.price)}</div>` : '';
  const head = (live) => `
      <div class="pack-image-area">
        <img src="${img}" alt="" loading="lazy">
        <span class="pack-badge">${esc(p.packType || 'حساب')}</span>
        ${live ? '<span class="pack-live"><i></i>متاح</span>' : ''}
        ${price}
      </div>`;
  const style = `style="--i:${Math.min(idx, 12)}"`;
  if (!pendingMode) {
    return `
    <div class="pack-card" data-key="${key}" ${style}>${head(true)}
      <div class="pack-details">
        <div class="pack-name">${esc(p.packName || GAME_LABELS[GAME_KEY] || '')}</div>
        <div class="pack-timer">⏳ ${esc(p.timerText || 'متاح')}</div>
        <div class="pack-footer-btns">
          <button class="btn-view" data-act="view" data-id="${esc(id)}">مشاهدة</button>
          ${!isTrusted ? `<button class="btn-coins" data-act="buy" data-id="${esc(id)}">🛒 اشتري</button>` : ''}
        </div>
      </div>
    </div>`;
  }
  if (isTrusted) {
    return `
    <div class="pack-card" data-key="${key}" ${style}>${head(false)}
      <div class="pack-details">
        <div class="pack-name">${esc(p.packName || '')}</div>
        <div class="pack-timer">طلب معلق — راجع وقرر</div>
        <div class="pack-footer-btns">
          <button class="btn-accept" data-act="accept" data-id="${esc(id)}">قبول</button>
          <button class="btn-reject" data-act="reject" data-id="${esc(id)}">رفض</button>
        </div>
      </div>
    </div>`;
  }
  return `
    <div class="pack-card pending" data-key="${key}" ${style}>
      <div class="pending-badge">في الانتظار</div>${head(false)}
      <div class="pack-details">
        <div class="pack-name">${esc(p.packName || '')}</div>
        <div class="pack-timer">⏳ انتظار الموافقة خلال 24 ساعة</div>
        <div class="pack-footer-btns">
          <div style="flex:1; text-align:center; color:#f97316; font-weight:700; padding:10px;">معلق <span class="waiting-spinner"></span></div>
        </div>
      </div>
    </div>`;
}

function renderPacks() {
  const c = document.getElementById('packsContainer');
  if (!c) return;
  const entries = [];
  Object.keys(livePacks).forEach(id => entries.push({ key: 'p_' + id, id, p: livePacks[id], pending: false }));
  Object.keys(pendingPacks).forEach(id => {
    const p = pendingPacks[id];
    if (isTrusted || p.submittedBy === myId) entries.push({ key: 'q_' + id, id, p, pending: true });
  });
  const newKeys = new Set(entries.map(e => e.key));
  const oldKeys = new Set(Array.from(c.querySelectorAll('[data-key]')).map(el => el.dataset.key));

  const gone = Array.from(c.querySelectorAll('[data-key]')).filter(el => !newKeys.has(el.dataset.key));
  const doRender = () => {
    c.innerHTML = entries.length
      ? entries.map((e, i) => packCardHtml(e.key, e.p, e.pending, e.id, oldKeys.size && oldKeys.has(e.key) ? 0 : i)).join('')
      : '<div class="empty-state"><div style="font-size:48px;">📭</div><p>لا توجد باكات متاحة حالياً</p></div>';
  };
  clearTimeout(renderTimer);
  if (gone.length) {
    gone.forEach(el => el.classList.add('removing'));
    renderTimer = setTimeout(doRender, 450);
  } else {
    doRender();
  }

  // لو الباك اللي بيتشرى اتباع لحد تاني والمودال مفتوح
  const modal = document.getElementById('paymentModal');
  if (modal && modal.style.display === 'flex' && currentPayPackId && !payBusy &&
      !livePacks[currentPayPackId] && document.getElementById('payStepForm').style.display !== 'none') {
    closePayment();
    showToast('الباك ده اتباع لحد تاني 😕', 'error');
  }
}

function loadPacks() {
  const c = document.getElementById('packsContainer');
  if (!c) return;
  db.collection(GAME_KEY + '_packs').onSnapshot(snap => {
    livePacks = {};
    snap.forEach(doc => { livePacks[doc.id] = doc.data(); });
    renderPacks();
  }, err => {
    console.error(err);
    c.innerHTML = '<p style="text-align:center;color:#ef4444;grid-column:1/-1;">حصل خطأ في تحميل الباكات، جرب تحدث الصفحة.</p>';
  });

  db.collection('pending_packs').where('game', '==', GAME_KEY).where('status', '==', 'pending').onSnapshot(snap => {
    pendingPacks = {};
    snap.forEach(doc => { pendingPacks[doc.id] = doc.data(); });
    renderPacks();
  }, err => console.error(err));

  c.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.dataset.id;
    switch (btn.dataset.act) {
      case 'view': location.href = 'pack.details.html?id=' + encodeURIComponent(id) + '&game=' + GAME_KEY; break;
      case 'buy': openPayment(id); break;
      case 'accept': acceptPack(id, btn); break;
      case 'reject': rejectPack(id, btn); break;
    }
  });
}

/* ---------- الشراء من الرصيد ---------- */
let currentPayPackId = null;
let payBusy = false;
let payError = null;       // رسالة فشل ظاهرة داخل المودال

function openPayment(packId) {
  if (!isLoggedIn()) {
    showToast('سجل دخولك الأول عشان تشتري', 'error');
    setTimeout(() => { location.href = 'index.html'; }, 1200);
    return;
  }
  if (isTrusted) { showToast('التراستيد مش بيشتري', 'error'); return; }
  const pack = livePacks[packId];
  if (!pack) { showToast('الباك ده مش متاح دلوقتي', 'error'); return; }

  currentPayPackId = packId;
  payBusy = false;
  payError = null;
  document.getElementById('paySummary').innerHTML =
    `<img src="${esc(pack.mainImage || GAME_FALLBACK_IMG)}" alt="">` +
    `<div style="min-width:0;"><div style="font-weight:800;">${esc(pack.packName || '')}</div>` +
    `<div style="color:#94a3b8; font-size:13px;">${esc(pack.packType || '')}</div></div>`;
  document.getElementById('payStepForm').style.display = 'block';
  document.getElementById('payStepDone').style.display = 'none';
  document.getElementById('paymentModal').style.display = 'flex';
  refreshBuyState();
}

// بيحسب حالة المودال حسب الرصيد الحالي (وبيتحدّث لحظياً لما الرصيد يتغير)
function refreshBuyState() {
  const modal = document.getElementById('paymentModal');
  if (!modal || modal.style.display !== 'flex' || !currentPayPackId) return;
  if (document.getElementById('payStepForm').style.display === 'none') return;
  const pack = livePacks[currentPayPackId];
  if (!pack) return;
  const price = parsePrice(pack.price);
  const bal = walletBalance;
  const rows = document.getElementById('buyRows');
  const alertBox = document.getElementById('buyAlert');
  const btn = document.getElementById('payNowBtn');

  if (!(price > 0)) {
    rows.innerHTML = `<div class="buy-row"><span>السعر</span><b>${esc(pack.price || 'غير محدد')}</b></div>`;
    alertBox.style.display = 'block';
    alertBox.textContent = '⚠️ سعر الباك ده غير صالح، مينفعش يتشرى دلوقتي.';
    btn.disabled = true; btn.textContent = 'غير متاح'; btn.className = 'pay-btn';
    return;
  }
  if (bal == null) {
    rows.innerHTML = `<div class="buy-row"><span>السعر</span><b>${fmtMoney(price)}</b></div><div class="buy-row"><span>رصيدك</span><b>…</b></div>`;
    btn.disabled = true; btn.textContent = 'جاري تحميل الرصيد…';
    return;
  }
  const enough = bal >= price;
  rows.innerHTML =
    `<div class="buy-row"><span>السعر</span><b>${fmtMoney(price)}</b></div>` +
    `<div class="buy-row"><span>رصيدك الحالي</span><b>${fmtMoney(bal)}</b></div>` +
    (enough ? `<div class="buy-row total"><span>الباقي بعد الشراء</span><b>${fmtMoney(bal - price)}</b></div>`
            : `<div class="buy-row total bad"><span>ناقصك</span><b>${fmtMoney(price - bal)}</b></div>`);
  if (payError) {
    alertBox.style.display = 'block'; alertBox.textContent = payError;
  } else if (!enough) {
    alertBox.style.display = 'block';
    alertBox.textContent = '💸 معكش رصيد كافي لشراء الباك ده. اشحن محفظتك وارجع كمل.';
  } else {
    alertBox.style.display = 'none';
  }
  if (!payBusy) {
    btn.disabled = false;
    if (enough) { btn.textContent = 'تأكيد الشراء — ' + fmtMoney(price); btn.className = 'pay-btn'; }
    else { btn.textContent = '➕ اشحن ' + fmtMoney(price - bal); btn.className = 'pay-btn topup'; }
  }
}
document.addEventListener('wallet-change', refreshBuyState);

function closePayment() {
  if (payBusy) return;
  document.getElementById('paymentModal').style.display = 'none';
  currentPayPackId = null;
}

function onBuyButton() {
  if (payBusy) return;
  const pack = livePacks[currentPayPackId];
  if (!pack) return;
  const price = parsePrice(pack.price);
  if (walletBalance != null && price > walletBalance) {
    const need = price - walletBalance;
    // نقفل المودال ونفتح المحفظة بالمبلغ الناقص
    document.getElementById('paymentModal').style.display = 'none';
    currentPayPackId = null;
    openWallet({ amount: need });
    return;
  }
  processPurchase();
}

async function processPurchase() {
  if (payBusy) return;
  const packId = currentPayPackId;
  if (!packId) return;
  payError = null;
  payBusy = true;
  const btn = document.getElementById('payNowBtn');
  btn.disabled = true; btn.textContent = 'جاري الشراء...';

  const orderId = genOrderId('BV');
  const packRef = db.collection(GAME_KEY + '_packs').doc(packId);
  const wRef = walletDocRef();
  const txRef = db.collection('user_transactions').doc();
  const wTxRef = db.collection('wallet_tx').doc();
  let leftover = 0;

  try {
    await new Promise(r => setTimeout(r, 700));

    // كل حاجة في ترانزاكشن واحدة: الباك لسه موجود؟ الرصيد يكفي؟ نخصم + نسجل + نحذف الباك
    await db.runTransaction(async t => {
      const pSnap = await t.get(packRef);
      const wSnap = await t.get(wRef);
      if (!pSnap.exists) throw new Error('SOLD');
      const p = pSnap.data();
      const price = parsePrice(p.price);
      if (!(price > 0)) throw new Error('BADPRICE');
      const bal = wSnap.exists ? (Number(wSnap.data().balance) || 0) : 0;
      if (bal < price) { const e = new Error('INSUFFICIENT'); e.need = price - bal; throw e; }
      leftover = bal - price;

      t.set(wRef, { balance: leftover, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      t.set(wTxRef, {
        userId: myId, type: 'purchase', amount: price, bonus: 0, method: 'wallet', orderId,
        note: 'شراء: ' + (p.packName || 'حساب'), balanceAfter: leftover,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      t.set(txRef, {
        buyerId: myId, game: GAME_KEY,
        packName: p.packName || '', packType: p.packType || '',
        email: p.email || '', password: p.password || '', platform: p.platform || '',
        packImage: p.mainImage || '', packId,
        price: p.price || '', amountPaid: price,
        paymentMethod: 'wallet', paymentRef: 'المحفظة', orderId,
        status: 'completed', paidAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      t.delete(packRef);
    });

    payBusy = false;
    document.getElementById('payOrderId').textContent = orderId;
    document.getElementById('payLeft').textContent = fmtMoney(leftover);
    document.getElementById('payStepForm').style.display = 'none';
    document.getElementById('payStepDone').style.display = 'block';
    showToast('تم الشراء بنجاح! ✅', 'success');
  } catch (e) {
    payBusy = false;
    const msg = e && e.message;
    if (msg === 'SOLD') {
      closePayment();
      showToast('للأسف الباك ده اتباع لحد تاني 😕', 'error');
    } else if (msg === 'INSUFFICIENT') {
      payError = '💸 معكش رصيد كافي — ناقصك ' + fmtMoney(e.need) + '. اشحن محفظتك وحاول تاني.';
      showToast('معكش رصيد كافي', 'error');
      refreshBuyState();
    } else if (msg === 'BADPRICE') {
      payError = '⚠️ سعر الباك غير صالح.';
      refreshBuyState();
    } else {
      console.error(e);
      payError = 'حصل خطأ ومتم خصم حاجة من رصيدك. جرب تاني.';
      showToast('حصل خطأ في الشراء', 'error');
      refreshBuyState();
    }
  }
}

/* ---------- قبول / رفض الباكات المعلقة (للتراستيد) ---------- */
async function acceptPack(pendingId, btn) {
  if (!isTrusted) return;
  const card = btn && btn.closest('.pack-card');
  if (btn) btn.disabled = true;
  try {
    const ref = db.collection('pending_packs').doc(pendingId);
    const doc = await ref.get();
    if (!doc.exists) { showToast('الطلب ده اتعالج قبل كده', 'error'); return; }
    const data = doc.data();
    const targetGame = data.game || GAME_KEY;
    const packData = Object.assign({}, data);
    delete packData.status; delete packData.game; delete packData.submittedBy; delete packData.loginType;
    packData.approvedAt = firebase.firestore.FieldValue.serverTimestamp();
    packData.approvedBy = myId;

    const batch = db.batch();
    batch.set(db.collection(targetGame + '_packs').doc(), packData);
    batch.delete(ref);
    batch.set(db.collection('notifications').doc(), {
      toUser: data.submittedBy, type: 'accepted',
      packName: data.packName || '', packImage: data.mainImage || '',
      packType: data.packType || '', price: data.price || '',
      message: 'تم قبول طلبك ونزل الباك على الموقع بنجاح ✅',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(), read: false
    });
    await batch.commit();
    showToast('تم قبول الباك ونزل على الموقع', 'success');
  } catch (e) {
    console.error(e);
    showToast('حصل خطأ في القبول', 'error');
    if (btn) btn.disabled = false;
    if (card) card.classList.remove('removing');
  }
}

async function rejectPack(pendingId, btn) {
  if (!isTrusted) return;
  const card = btn && btn.closest('.pack-card');
  if (btn) btn.disabled = true;
  try {
    const ref = db.collection('pending_packs').doc(pendingId);
    const doc = await ref.get();
    if (!doc.exists) { showToast('الطلب ده اتعالج قبل كده', 'error'); return; }
    const data = doc.data();
    const batch = db.batch();
    batch.delete(ref);
    batch.set(db.collection('notifications').doc(), {
      toUser: data.submittedBy, type: 'rejected',
      packName: data.packName || '', packImage: data.mainImage || '',
      packType: data.packType || '', price: data.price || '',
      message: 'تم رفض الطلب لأنه غير لائق ❌',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(), read: false
    });
    await batch.commit();
    showToast('تم رفض الباك', 'success');
  } catch (e) {
    console.error(e);
    showToast('حصل خطأ في الرفض', 'error');
    if (btn) btn.disabled = false;
    if (card) card.classList.remove('removing');
  }
}

/* ---------- الرسائل ---------- */
let msgUnsub = null;
function openMessages() {
  document.getElementById('messagesModal').style.display = 'flex';
  loadMessages();
}
function closeMessages() {
  document.getElementById('messagesModal').style.display = 'none';
  if (msgUnsub) { msgUnsub(); msgUnsub = null; }
}
function loadMessages() {
  const list = document.getElementById('messagesList');
  if (msgUnsub) msgUnsub();
  msgUnsub = db.collection('notifications').where('toUser', '==', myId).onSnapshot(snap => {
    const docs = snap.docs.slice().sort((a, b) => tsMillis(b.data()) - tsMillis(a.data())).slice(0, 30);
    if (!docs.length) {
      list.innerHTML = '<p style="text-align:center; color:#94a3b8; padding:30px;">لا توجد رسائل.</p>';
      return;
    }
    list.innerHTML = docs.map(doc => {
      const d = doc.data();
      return `
        <div class="msg-item">
          <img src="${esc(d.packImage || GAME_FALLBACK_IMG)}" alt="">
          <div class="msg-content">
            <h4>${esc(d.packName || 'باك')}</h4>
            <p class="msg-status ${d.type === 'accepted' ? 'accepted' : 'rejected'}">${esc(d.message || '')}</p>
            <p>${esc(d.packType || '')} — ${esc(d.price || '')}</p>
          </div>
        </div>`;
    }).join('');
    const unread = docs.filter(x => !x.data().read);
    if (unread.length) {
      const b = db.batch();
      unread.forEach(x => b.update(x.ref, { read: true }));
      b.commit().catch(() => {});
    }
  });
}
function updateMsgBadge() {
  if (!myId || myId === 'guest') return;
  db.collection('notifications').where('toUser', '==', myId).where('read', '==', false).onSnapshot(snap => {
    const badge = document.getElementById('msgBadge');
    if (!badge) return;
    if (snap.size > 0) {
      badge.style.display = 'flex';
      badge.textContent = snap.size > 9 ? '9+' : snap.size;
    } else {
      badge.style.display = 'none';
    }
  });
}

/* ---------- تشغيل ---------- */
document.addEventListener('DOMContentLoaded', () => {
  injectUI();
  loadPacks();
  updateMsgBadge();
});
