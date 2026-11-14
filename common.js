/* =====================================================================
   common.js — مشترك بين كل الصفحات: Firebase + أدوات + المحفظة
   لازم يتحمّل بعد firebase-app و firebase-firestore.
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyB3E9e2aFVgrpTm0df7tC_YKskT-MA3h0s",
  authDomain: "my-pes-shop.firebaseapp.com",
  projectId: "my-pes-shop",
  storageBucket: "my-pes-shop.firebasestorage.app",
  messagingSenderId: "438807292964",
  appId: "1:438807292964:web:38709635a02d9e1bd8bcb1"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ---------- أدوات ---------- */
function getMyId() { return localStorage.getItem('userEmail') || localStorage.getItem('userName') || 'guest'; }
function getIsTrusted() { return localStorage.getItem('userRole') === 'trusted'; }
function isLoggedIn() { return !!localStorage.getItem('userName'); }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function digits(s) {
  return String(s || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/\D/g, '');
}
// "100 جنيه" / "١٥٠" / "1,500" -> رقم  (NaN لو مفيش رقم)
function parsePrice(str) {
  const t = String(str == null ? '' : str)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[,٬،]/g, '');
  const m = /\d+(\.\d+)?/.exec(t);
  return m ? parseFloat(m[0]) : NaN;
}
function fmtMoney(n) {
  n = Number(n) || 0;
  return (Math.round(n * 100) / 100).toLocaleString('en-US') + ' جنيه';
}
function luhn(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}
function tsMillis(d, f) {
  const t = d && d[f || 'timestamp'];
  return t && t.toMillis ? t.toMillis() : Date.now();
}
function genOrderId(prefix) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return (prefix || 'BV') + '-' + s;
}
/* ---------- رسائل التوست (نزول ناعم + شريط وقت + اختفاء ناعم) ---------- */
function showToast(msg, type) {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    document.body.appendChild(stack);
  }
  // الصندوق القديم الثابت مش محتاجينه تاني
  const legacy = document.getElementById('siteToast');
  if (legacy) legacy.style.display = 'none';

  // نفس الرسالة لسه ظاهرة؟ ما نكررهاش — نعمل لها "نبضة" بس
  for (const el of stack.children) {
    if (el.dataset.msg === msg && !el.classList.contains('leaving')) {
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
      restartToastTimer(el);
      return;
    }
  }
  // أقصى 3 رسائل مع بعض — الأقدم يختفي بنعومة
  const alive = [...stack.children].filter(e => !e.classList.contains('leaving'));
  if (alive.length >= 3) dismissToast(alive[0]);

  const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  const t = document.createElement('div');
  t.className = 'toast-item' + (type ? ' ' + type : '');
  t.dataset.msg = msg;
  t.innerHTML = '<span class="toast-ico">' + icon + '</span><span class="toast-text"></span><span class="toast-bar"></span>';
  t.querySelector('.toast-text').textContent = msg;
  t.addEventListener('click', () => dismissToast(t));
  stack.appendChild(t);
  restartToastTimer(t);
}
function restartToastTimer(t) {
  clearTimeout(t._timer);
  const bar = t.querySelector('.toast-bar');
  if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
  t._timer = setTimeout(() => dismissToast(t), 3800);
}
function dismissToast(t) {
  if (!t || t.classList.contains('leaving')) return;
  clearTimeout(t._timer);
  // نثبّت الارتفاع الحالي عشان باقي الرسائل تتحرك لفوق بنعومة بدل ما تقفز
  t.style.maxHeight = t.offsetHeight + 'px';
  void t.offsetHeight;
  t.classList.add('leaving');
  setTimeout(() => t.remove(), 600);
}
// إخفاء عنصر بنعومة (بدل display:none المفاجئ)
function hideSmooth(el, ms) {
  if (!el || el.style.display === 'none') return;
  el.classList.add('smooth-out');
  setTimeout(() => { el.style.display = 'none'; el.classList.remove('smooth-out'); }, ms || 380);
}
function animateNumber(el, from, to, ms) {
  const start = performance.now();
  from = Number(from) || 0; to = Number(to) || 0;
  function step(now) {
    const k = Math.min(1, (now - start) / (ms || 700));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmtMoney(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =====================================================================
   المحفظة
   wallets/{id}      { balance, updatedAt }
   wallet_tx/{auto}  { userId, type: topup|purchase, amount, bonus, method, ref, orderId, note, balanceAfter, createdAt }
   ===================================================================== */
const MIN_TOPUP = 10;
const MAX_TOPUP = 10000;
const PROMO_CODES = { BAVLY10: 0.10, WELCOME5: 0.05 };   // نسبة بونص على الشحن (للتجربة)
const OTP_DEMO = '1234';
const TOPUP_METHODS = {
  fawry:    { label: 'فوري',         icon: '📱' },
  vodafone: { label: 'فودافون كاش',  icon: '🔴' },
  instapay: { label: 'إنستا باي',     icon: '⚡' },
  visa:     { label: 'فيزا',         icon: '💳' }
};

let walletBalance = null;      // null = لسه بيتحمل
let walletUnsub = null;
let walletBoundId = null;
let walletHistUnsub = null;

function walletDocRef(id) { return db.collection('wallets').doc(String(id || getMyId()).replace(/\//g, '_')); }

function bindWallet() {
  if (!isLoggedIn() || getIsTrusted()) return;
  const id = getMyId();
  if (walletBoundId === id) return;
  walletBoundId = id;
  if (walletUnsub) walletUnsub();
  walletUnsub = walletDocRef(id).onSnapshot(snap => {
    const prev = walletBalance;
    walletBalance = snap.exists ? (Number(snap.data().balance) || 0) : 0;
    window.walletBalance = walletBalance;
    updateWalletUI(prev);
    document.dispatchEvent(new CustomEvent('wallet-change', { detail: { balance: walletBalance } }));
  }, err => console.error(err));
}

function updateWalletUI(prev) {
  document.querySelectorAll('.wallet-balance-text').forEach(el => {
    if (walletBalance == null) { el.textContent = '…'; return; }
    if (prev != null && prev !== walletBalance) animateNumber(el, prev, walletBalance, 600);
    else el.textContent = fmtMoney(walletBalance);
  });
  document.querySelectorAll('.wallet-chip').forEach(c => {
    if (prev != null && prev !== walletBalance) {
      c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    }
  });
  const pb = document.getElementById('profileBalance');
  if (pb && walletBalance != null) pb.textContent = fmtMoney(walletBalance);
}

/* شارة المحفظة جنب الظرف */
function mountWalletChip() {
  if (!isLoggedIn() || getIsTrusted()) return;
  if (document.querySelector('.wallet-chip')) { bindWallet(); return; }
  const env = document.querySelector('header .msg-icon-wrap');
  if (!env) return;
  const chip = document.createElement('div');
  chip.className = 'wallet-chip';
  chip.title = 'المحفظة';
  chip.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 12V8a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4h12"></path>
      <path d="M3 5v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4"></path>
      <path d="M21 12h-5a2 2 0 0 0 0 4h5z"></path>
    </svg>
    <span class="wallet-balance-text">…</span>
    <span class="wallet-plus">+</span>`;
  chip.addEventListener('click', () => openWallet());
  env.parentNode.insertBefore(chip, env);
  bindWallet();
  updateWalletUI(null);
}

/* ---------- مودال المحفظة ---------- */
let wState = { method: null, amount: 0, busy: false, promo: null, pending: null };

function injectWalletModal() {
  if (document.getElementById('walletModal')) return;
  const m = document.createElement('div');
  m.id = 'walletModal'; m.className = 'payment-modal wallet-modal';
  m.innerHTML = `
    <div class="payment-panel wallet-panel">
      <button class="wallet-close" id="wClose" aria-label="إغلاق">✕</button>

      <div id="wStepMain">
        <div class="wallet-card">
          <div class="wallet-card-shine"></div>
          <div class="wallet-card-label">رصيدك الحالي</div>
          <div class="wallet-card-balance wallet-balance-text">…</div>
          <div class="wallet-card-foot">💎 محفظة بافلي</div>
        </div>

        <div class="w-section">
          <div class="w-title">عايز تشحن كام؟</div>
          <div class="amount-chips" id="wChips">
            ${[50, 100, 200, 500].map(a => `<button type="button" class="amount-chip" data-amt="${a}">${a}</button>`).join('')}
          </div>
          <input id="wAmount" class="w-input" inputmode="numeric" placeholder="أو اكتب مبلغ تاني (من ${MIN_TOPUP} لـ ${MAX_TOPUP})" maxlength="5">
        </div>

        <div class="w-section">
          <div class="w-title">طريقة الدفع</div>
          <div class="method-grid" id="wMethods">
            ${Object.keys(TOPUP_METHODS).map(k => `<div class="method-card" data-method="${k}"><div style="font-size:26px;">${TOPUP_METHODS[k].icon}</div><div>${TOPUP_METHODS[k].label}</div></div>`).join('')}
          </div>

          <div id="wFields" style="display:none; margin-top:12px;">
            <div id="wPhoneField" style="display:none;">
              <input id="wPhone" class="w-input" inputmode="numeric" placeholder="رقم الموبايل (مثال: 01012345678)" maxlength="11" autocomplete="tel">
            </div>
            <div id="wInstaField" style="display:none;">
              <input id="wInsta" class="w-input" dir="ltr" placeholder="اسم المستخدم (name@instapay) أو رقم الموبايل">
            </div>
            <div id="wCardField" style="display:none;">
              <input id="wCard" class="w-input" inputmode="numeric" placeholder="رقم البطاقة" maxlength="23" autocomplete="cc-number">
              <div class="pay-row">
                <input id="wExp" class="w-input" inputmode="numeric" placeholder="MM/YY" maxlength="5" autocomplete="cc-exp">
                <input id="wCvv" class="w-input" inputmode="numeric" placeholder="CVV" maxlength="4" autocomplete="cc-csc">
              </div>
              <div class="test-hint">للتجربة: <b id="wFillCard" style="cursor:pointer; color:#f97316;">4242 4242 4242 4242</b> — أي تاريخ مستقبلي — أي CVV</div>
            </div>
            <div class="promo-row">
              <input id="wPromo" class="w-input" dir="ltr" placeholder="كود خصم / بونص (اختياري)" maxlength="12" style="margin-bottom:0;">
              <button type="button" id="wPromoBtn" class="promo-btn">تطبيق</button>
            </div>
            <div id="wPromoMsg" class="test-hint" style="margin:6px 0 0; min-height:16px;"></div>
          </div>
        </div>

        <div class="w-summary" id="wSummary" style="display:none;"></div>
        <button class="pay-btn" id="wPayBtn" style="margin:0 20px 6px; width:calc(100% - 40px);">اشحن الرصيد</button>

        <div class="w-section" id="wHistWrap" style="padding-top:8px;">
          <div class="w-title">آخر الحركات</div>
          <div id="wHist"><p class="test-hint">جاري التحميل…</p></div>
        </div>
      </div>

      <div id="wStepOtp" style="display:none; padding:36px 24px; text-align:center;">
        <div style="font-size:48px;">🔐</div>
        <h3 style="margin:10px 0 6px;">كود التحقق</h3>
        <p style="color:#94a3b8; margin:0 0 14px; font-size:14px;" id="wOtpSub"></p>
        <input id="wOtp" class="w-input" inputmode="numeric" maxlength="4" placeholder="••••" style="text-align:center; font-size:26px; letter-spacing:10px;">
        <div class="test-hint">للتجربة الكود: <b style="color:#f97316;">${OTP_DEMO}</b></div>
        <button class="pay-btn" id="wOtpOk">تأكيد</button>
        <button class="pay-cancel" id="wOtpBack">رجوع</button>
      </div>

      <div id="wStepDone" style="display:none; padding:36px 24px; text-align:center;">
        <div class="big-check">✓</div>
        <h3 style="margin:14px 0 4px;">تم شحن الرصيد</h3>
        <p style="color:#94a3b8; margin:0 0 4px; font-size:14px;" id="wDoneAdded"></p>
        <div class="wallet-card-balance" id="wDoneBalance" style="color:#22c55e; font-size:30px; margin:8px 0 6px;"></div>
        <p style="color:#94a3b8; font-size:13px; margin:0 0 18px;">رقم العملية: <span class="order-tag" id="wDoneRef"></span></p>
        <button class="pay-btn" id="wDoneBtn">تمام</button>
      </div>
    </div>`;
  document.body.appendChild(m);

  const $ = id => document.getElementById(id);
  m.addEventListener('click', e => { if (e.target === m && !wState.busy) closeWallet(); });
  $('wClose').onclick = () => { if (!wState.busy) closeWallet(); };
  $('wChips').addEventListener('click', e => {
    const b = e.target.closest('.amount-chip'); if (!b) return;
    $('wAmount').value = b.dataset.amt; syncAmount();
  });
  $('wAmount').addEventListener('input', e => { e.target.value = digits(e.target.value).slice(0, 5); syncAmount(); });
  $('wMethods').addEventListener('click', e => {
    const c = e.target.closest('.method-card'); if (c) selectTopupMethod(c.dataset.method);
  });
  $('wPhone').addEventListener('input', e => { e.target.value = digits(e.target.value).slice(0, 11); });
  $('wCard').addEventListener('input', e => {
    const d = digits(e.target.value).slice(0, 19);
    e.target.value = d.replace(/(.{4})/g, '$1 ').trim();
  });
  $('wExp').addEventListener('input', e => {
    let d = digits(e.target.value).slice(0, 4);
    if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
    e.target.value = d;
  });
  $('wFillCard').onclick = () => { $('wCard').value = '4242 4242 4242 4242'; };
  $('wPromoBtn').onclick = applyPromo;
  $('wPayBtn').onclick = startTopup;
  $('wOtpOk').onclick = confirmOtp;
  $('wOtpBack').onclick = () => { if (!wState.busy) showWalletStep('Main'); };
  $('wOtp').addEventListener('input', e => { e.target.value = digits(e.target.value).slice(0, 4); });
  $('wDoneBtn').onclick = closeWallet;
}

function showWalletStep(name) {
  ['Main', 'Otp', 'Done'].forEach(s => { document.getElementById('wStep' + s).style.display = s === name ? 'block' : 'none'; });
  const x = document.getElementById('wClose');
  if (x) x.style.display = name === 'Main' ? 'block' : 'none';
}

function syncAmount() {
  const v = parseInt(digits(document.getElementById('wAmount').value), 10) || 0;
  wState.amount = v;
  document.querySelectorAll('#wChips .amount-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.amt, 10) === v));
  renderWalletSummary();
}

function selectTopupMethod(m) {
  if (wState.busy) return;
  wState.method = m;
  document.querySelectorAll('#wMethods .method-card').forEach(c => c.classList.toggle('active', c.dataset.method === m));
  const $ = id => document.getElementById(id);
  $('wFields').style.display = 'block';
  $('wPhoneField').style.display = (m === 'fawry' || m === 'vodafone') ? 'block' : 'none';
  $('wInstaField').style.display = m === 'instapay' ? 'block' : 'none';
  $('wCardField').style.display = m === 'visa' ? 'block' : 'none';
  $('wPhone').placeholder = m === 'vodafone' ? 'رقم فودافون كاش (010…)' : 'رقم الموبايل (مثال: 01012345678)';
  try { localStorage.setItem('lastTopupMethod', m); } catch (e) {}
}

function applyPromo() {
  const code = document.getElementById('wPromo').value.trim().toUpperCase();
  const msg = document.getElementById('wPromoMsg');
  if (!code) { wState.promo = null; msg.textContent = ''; renderWalletSummary(); return; }
  if (PROMO_CODES[code]) {
    wState.promo = code;
    msg.style.color = '#22c55e';
    msg.textContent = '✅ بونص ' + Math.round(PROMO_CODES[code] * 100) + '% هيتضاف على الشحن';
  } else {
    wState.promo = null;
    msg.style.color = '#ef4444';
    msg.textContent = 'الكود غير صحيح';
  }
  renderWalletSummary();
}

function calcBonus(amount) {
  const r = wState.promo ? PROMO_CODES[wState.promo] : 0;
  return Math.floor(amount * r);
}

function renderWalletSummary() {
  const s = document.getElementById('wSummary');
  const a = wState.amount;
  if (!a) { s.style.display = 'none'; return; }
  const b = calcBonus(a);
  s.style.display = 'block';
  s.innerHTML = `<div><span>المبلغ</span><b>${fmtMoney(a)}</b></div>` +
    (b ? `<div style="color:#22c55e;"><span>بونص</span><b>+ ${fmtMoney(b)}</b></div>` : '') +
    `<div class="w-total"><span>هيوصل رصيدك</span><b>${fmtMoney((walletBalance || 0) + a + b)}</b></div>`;
  document.getElementById('wPayBtn').textContent = 'اشحن ' + fmtMoney(a);
}

function openWallet(opts) {
  if (!isLoggedIn()) { showToast('سجل دخولك الأول', 'error'); return; }
  if (getIsTrusted()) { showToast('التراستيد معندوش محفظة', 'error'); return; }
  injectWalletModal();
  bindWallet();
  wState = { method: null, amount: 0, busy: false, promo: null, pending: null };
  const $ = id => document.getElementById(id);
  $('wAmount').value = ''; $('wPromo').value = ''; $('wPromoMsg').textContent = '';
  ['wCard', 'wExp', 'wCvv', 'wInsta', 'wOtp'].forEach(i => { $(i).value = ''; });
  $('wPhone').value = digits(localStorage.getItem('userPhone') || '');
  $('wFields').style.display = 'none';
  document.querySelectorAll('#wMethods .method-card').forEach(c => c.classList.remove('active'));
  $('wPayBtn').disabled = false; $('wPayBtn').textContent = 'اشحن الرصيد';
  $('wSummary').style.display = 'none';
  showWalletStep('Main');
  $('walletModal').style.display = 'flex';
  updateWalletUI(null);
  if (opts && opts.amount) { $('wAmount').value = String(Math.min(MAX_TOPUP, Math.max(MIN_TOPUP, Math.ceil(opts.amount)))); syncAmount(); }
  let last = null; try { last = localStorage.getItem('lastTopupMethod'); } catch (e) {}
  if (last && TOPUP_METHODS[last]) selectTopupMethod(last);
  loadWalletHistory();
}
function closeWallet() {
  const m = document.getElementById('walletModal');
  if (m) m.style.display = 'none';
  if (walletHistUnsub) { walletHistUnsub(); walletHistUnsub = null; }
}

function loadWalletHistory() {
  if (walletHistUnsub) walletHistUnsub();
  const box = document.getElementById('wHist');
  walletHistUnsub = db.collection('wallet_tx').where('userId', '==', getMyId()).onSnapshot(snap => {
    const docs = snap.docs.map(d => d.data()).sort((a, b) => tsMillis(b, 'createdAt') - tsMillis(a, 'createdAt')).slice(0, 6);
    if (!docs.length) { box.innerHTML = '<p class="test-hint">لسه مفيش حركات.</p>'; return; }
    box.innerHTML = docs.map(d => {
      const plus = d.type === 'topup';
      const when = d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '';
      return `<div class="w-hist-row">
        <div class="w-hist-ic ${plus ? 'up' : 'down'}">${plus ? '↑' : '↓'}</div>
        <div style="flex:1; min-width:0;">
          <div class="w-hist-t">${esc(d.note || (plus ? 'شحن رصيد' : 'شراء'))}</div>
          <div class="w-hist-s">${esc(when)}${d.orderId ? ' • ' + esc(d.orderId) : ''}</div>
        </div>
        <div class="w-hist-a ${plus ? 'up' : 'down'}">${plus ? '+' : '−'}${fmtMoney((Number(d.amount) || 0) + (plus ? (Number(d.bonus) || 0) : 0))}</div>
      </div>`;
    }).join('');
  }, () => { box.innerHTML = '<p class="test-hint">مقدرتش أحمّل الحركات.</p>'; });
}

/* ---------- التحقق + الشحن ---------- */
function validateTopup() {
  const a = wState.amount;
  if (!a || a < MIN_TOPUP) return { ok: false, message: 'أقل مبلغ للشحن ' + MIN_TOPUP + ' جنيه' };
  if (a > MAX_TOPUP) return { ok: false, message: 'أقصى مبلغ للشحن ' + MAX_TOPUP + ' جنيه' };
  const m = wState.method;
  if (!m) return { ok: false, message: 'اختار طريقة الدفع' };
  const $ = id => document.getElementById(id);

  if (m === 'fawry' || m === 'vodafone') {
    const num = digits($('wPhone').value);
    if (!/^01[0125]\d{8}$/.test(num)) return { ok: false, message: 'رقم الموبايل غير صحيح — 11 رقم' };
    if (m === 'vodafone' && !num.startsWith('010')) return { ok: false, message: 'فودافون كاش لازم الرقم يبدأ بـ 010' };
    const reg = digits(localStorage.getItem('userPhone') || '');
    if (reg && reg !== num) return { ok: false, message: 'الرقم ده مش مطابق للرقم المسجل في حسابك' };
    if (!reg) localStorage.setItem('userPhone', num);
    return { ok: true, ref: '•••• ' + num.slice(-4), otpTo: 'رقم ' + num.slice(0, 3) + '•••••' + num.slice(-3) };
  }
  if (m === 'instapay') {
    const v = $('wInsta').value.trim();
    const phone = digits(v);
    const isPhone = /^01[0125]\d{8}$/.test(phone) && /^[\d\s٠-٩+]+$/.test(v);
    const isHandle = /^[a-z0-9._-]{3,}@[a-z]{3,}$/i.test(v);
    if (!isPhone && !isHandle) return { ok: false, message: 'اكتب اسم إنستا باي صحيح (name@instapay) أو رقم موبايل' };
    return { ok: true, ref: isPhone ? '•••• ' + phone.slice(-4) : v.replace(/^(.{2}).*(@.*)$/, '$1•••$2'), otpTo: 'تطبيق إنستا باي' };
  }
  const card = digits($('wCard').value);
  if (card.length < 13 || card.length > 19 || !luhn(card)) return { ok: false, message: 'رقم البطاقة غير صحيح (للتجربة: 4242 4242 4242 4242)' };
  const mm = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec($('wExp').value.trim());
  if (!mm) return { ok: false, message: 'تاريخ الانتهاء غير صحيح (MM/YY)' };
  const now = new Date(), y = 2000 + parseInt(mm[2], 10), mo = parseInt(mm[1], 10);
  if (y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth() + 1)) return { ok: false, message: 'البطاقة منتهية' };
  if (!/^\d{3,4}$/.test($('wCvv').value.trim())) return { ok: false, message: 'الـ CVV غير صحيح' };
  return { ok: true, ref: '•••• ' + card.slice(-4), otpTo: 'رقمك المسجل في البنك' };
}

function startTopup() {
  if (wState.busy) return;
  applyPromo();
  const v = validateTopup();
  if (!v.ok) { showToast(v.message, 'error'); return; }
  wState.pending = v;
  wState.otpTries = 0;
  document.getElementById('wOtpSub').textContent = 'بعتنالك كود من 4 أرقام على ' + v.otpTo;
  document.getElementById('wOtp').value = '';
  showWalletStep('Otp');
}

async function confirmOtp() {
  if (wState.busy) return;
  const code = digits(document.getElementById('wOtp').value);
  if (code !== OTP_DEMO) {
    wState.otpTries = (wState.otpTries || 0) + 1;
    if (wState.otpTries >= 3) { showToast('جربت 3 مرات غلط — ابدأ من الأول', 'error'); showWalletStep('Main'); return; }
    showToast('الكود غلط (' + (3 - wState.otpTries) + ' محاولات متبقية)', 'error');
    return;
  }
  wState.busy = true;
  const btn = document.getElementById('wOtpOk');
  btn.disabled = true; btn.textContent = 'جاري الشحن...';

  const amount = wState.amount;
  const bonus = calcBonus(amount);
  const method = wState.method;
  const ref = wState.pending.ref;
  const orderId = genOrderId('TP');
  const wRef = walletDocRef();
  const txRef = db.collection('wallet_tx').doc();
  const prev = walletBalance || 0;
  let newBal = 0;

  try {
    await new Promise(r => setTimeout(r, 800));
    await db.runTransaction(async t => {
      const snap = await t.get(wRef);
      const cur = snap.exists ? (Number(snap.data().balance) || 0) : 0;
      newBal = cur + amount + bonus;
      t.set(wRef, { balance: newBal, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      t.set(txRef, {
        userId: getMyId(), type: 'topup', amount, bonus, method, ref, orderId,
        note: 'شحن عن طريق ' + TOPUP_METHODS[method].label,
        balanceAfter: newBal, createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    wState.busy = false;
    btn.disabled = false; btn.textContent = 'تأكيد';
    document.getElementById('wDoneAdded').textContent = 'اتضاف ' + fmtMoney(amount) + (bonus ? ' + بونص ' + fmtMoney(bonus) : '');
    document.getElementById('wDoneRef').textContent = orderId;
    showWalletStep('Done');
    animateNumber(document.getElementById('wDoneBalance'), prev, newBal, 900);
    showToast('تم شحن الرصيد ✅', 'success');
  } catch (e) {
    console.error(e);
    wState.busy = false;
    btn.disabled = false; btn.textContent = 'تأكيد';
    showToast('حصل خطأ ومتم سحب حاجة. جرب تاني.', 'error');
    showWalletStep('Main');
  }
}

document.addEventListener('DOMContentLoaded', () => { mountWalletChip(); });
