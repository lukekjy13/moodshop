// script.js — 서버(server.js)한테만 말을 걸어요. API 키는 여기 없음.

// ---------------------------------------------------------
// 0. 저장소 (localStorage - 새로고침해도 안 사라짐)
// ---------------------------------------------------------
const store = {
  get(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
};

let cart = [];
let coupons = store.get("moodshop_coupons", []);
let orders = store.get("moodshop_orders", []);
let wishlist = store.get("moodshop_wishlist", []); // [item, ...]
let collection = store.get("moodshop_collection", []); // 가챠 아이템
let lastSpinDate = store.get("moodshop_last_spin", null);
let lastGachaDate = store.get("moodshop_last_gacha", null);

const itemsById = new Map(); // 화면에 그려진 상품 조회용 (상세모달 등)

function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ---------------------------------------------------------
// 1. DOM 참조
// ---------------------------------------------------------
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const statusMsg = document.getElementById("statusMsg");
const autocompleteBox = document.getElementById("autocompleteBox");

const dealsGrid = document.getElementById("dealsGrid");
const resultsSection = document.getElementById("resultsSection");
const resultsTitle = document.getElementById("resultsTitle");
const grid = document.getElementById("grid");
const recommendSection = document.getElementById("recommendSection");
const recommendGrid = document.getElementById("recommendGrid");

const cartBtn = document.getElementById("cartBtn");
const cartCount = document.getElementById("cartCount");
const cartPanel = document.getElementById("cartPanel");
const cartItemsEl = document.getElementById("cartItems");
const cartSubtotalEl = document.getElementById("cartSubtotal");
const cartDiscountEl = document.getElementById("cartDiscount");
const discountRow = document.getElementById("discountRow");
const cartTotalEl = document.getElementById("cartTotal");
const closeCartBtn = document.getElementById("closeCart");
const overlay = document.getElementById("overlay");
const checkoutBtn = document.getElementById("checkoutBtn");
const couponSelect = document.getElementById("couponSelect");

const couponBtn = document.getElementById("couponBtn");
const couponCountEl = document.getElementById("couponCount");
const couponPanel = document.getElementById("couponPanel");
const closeCouponBtn = document.getElementById("closeCoupon");
const couponListEl = document.getElementById("couponList");

const receiptModal = document.getElementById("receiptModal");
const receiptList = document.getElementById("receiptList");
const receiptTotal = document.getElementById("receiptTotal");
const closeReceiptBtn = document.getElementById("closeReceipt");
const confettiBox = document.getElementById("confetti");

const rouletteOpenBtn = document.getElementById("rouletteOpenBtn");
const rouletteModal = document.getElementById("rouletteModal");
const closeRouletteBtn = document.getElementById("closeRoulette");
const wheel = document.getElementById("wheel");
const spinBtn = document.getElementById("spinBtn");
const rouletteResultMsg = document.getElementById("rouletteResultMsg");

const gachaOpenBtn = document.getElementById("gachaOpenBtn");
const gachaModal = document.getElementById("gachaModal");
const closeGachaBtn = document.getElementById("closeGacha");
const gachaBox = document.getElementById("gachaBox");
const gachaBtn = document.getElementById("gachaBtn");
const gachaResult = document.getElementById("gachaResult");
const gachaResultIcon = document.getElementById("gachaResultIcon");
const gachaResultText = document.getElementById("gachaResultText");

const detailModal = document.getElementById("detailModal");
const detailBody = document.getElementById("detailBody");
const closeDetailBtn = document.getElementById("closeDetail");

const navTabs = document.querySelectorAll(".nav-tab");
const pageHome = document.getElementById("page-home");
const pageWishlist = document.getElementById("page-wishlist");
const pageTracking = document.getElementById("page-tracking");
const orderListEl = document.getElementById("orderList");
const trackingEmptyMsg = document.getElementById("trackingEmptyMsg");
const wishGrid = document.getElementById("wishGrid");
const wishEmptyMsg = document.getElementById("wishEmptyMsg");
const wishCountEl = document.getElementById("wishCount");
const collectionGrid = document.getElementById("collectionGrid");
const collectionEmptyMsg = document.getElementById("collectionEmptyMsg");

const aiChatOpenBtn = document.getElementById("aiChatOpenBtn");
const aiChatPanel = document.getElementById("aiChatPanel");
const closeAiChatBtn = document.getElementById("closeAiChat");
const aiChatMessages = document.getElementById("aiChatMessages");
const aiChatInput = document.getElementById("aiChatInput");
const aiChatSendBtn = document.getElementById("aiChatSendBtn");

// ---------------------------------------------------------
// 2. 할인 뱃지
// ---------------------------------------------------------
function fakeDiscountPercent(item) {
  let sum = 0;
  for (const ch of item.title) sum += ch.charCodeAt(0);
  const options = [10, 15, 20, 25, 30];
  return options[sum % options.length];
}
function fakeOriginalPrice(price, percent) {
  return Math.round((price / (1 - percent / 100)) / 100) * 100;
}

// ---------------------------------------------------------
// 3. 상품 카드 렌더링
// ---------------------------------------------------------
function isWished(id) { return wishlist.some((w) => w.id === id); }

function buildCard(item, { showDiscount = false } = {}) {
  itemsById.set(item.id, item);

  const card = document.createElement("div");
  card.className = "card";

  let priceHtml = `<div class="card-price">${won(item.price)}</div>`;
  let badgeHtml = "";
  if (showDiscount) {
    const percent = fakeDiscountPercent(item);
    const original = fakeOriginalPrice(item.price, percent);
    badgeHtml = `<div class="discount-badge">${percent}% 할인</div>`;
    priceHtml = `<div class="price-original">${won(original)}</div><div class="card-price discounted">${won(item.price)}</div>`;
  }

  card.innerHTML = `
    ${badgeHtml}
    <button class="wish-btn ${isWished(item.id) ? "active" : ""}" data-id="${item.id}">${isWished(item.id) ? "❤️" : "🤍"}</button>
    <img src="${item.image}" alt="${item.title}" loading="lazy" />
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-mall">${item.mall}</div>
      ${priceHtml}
      <button class="add-btn">장바구니 담기</button>
    </div>
  `;

  card.querySelector(".add-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    addToCart(item);
    const btn = e.currentTarget;
    btn.textContent = "담김!";
    btn.classList.add("added");
    setTimeout(() => { btn.textContent = "장바구니 담기"; btn.classList.remove("added"); }, 900);
  });

  card.querySelector(".wish-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleWish(item);
  });

  card.addEventListener("click", () => openDetail(item.id));

  return card;
}

async function fetchProducts(query, { sort = "sim", display } = {}) {
  const params = new URLSearchParams({ query, sort });
  if (display) params.set("display", display);
  const res = await fetch(`/api/search?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "검색 실패");
  return data.items;
}

// ---------------------------------------------------------
// 4. 오늘의 특가
// ---------------------------------------------------------
async function loadDeals() {
  try {
    const items = await fetchProducts("인기 선물 추천", { sort: "sim" });
    dealsGrid.innerHTML = "";
    items.slice(0, 8).forEach((item) => dealsGrid.appendChild(buildCard(item, { showDiscount: true })));
  } catch (err) {
    console.error(err);
    dealsGrid.innerHTML = `<p style="color:#8a8280;">특가 상품을 불러오지 못했어요.</p>`;
  }
}

// ---------------------------------------------------------
// 5. 검색 + 추천 + 자동완성
// ---------------------------------------------------------
function resetHomeView() {
  searchInput.value = "";
  statusMsg.textContent = "";
  document.getElementById("dealsSection").classList.remove("hidden");
  resultsSection.classList.add("hidden");
  recommendSection.classList.add("hidden");
  grid.innerHTML = "";
  recommendGrid.innerHTML = "";
}

async function search() {
  const query = searchInput.value.trim();
  if (!query) return;
  clearTimeout(autocompleteTimer);
  autocompleteToken++; // 이미 나간 자동완성 요청은 나중에 도착해도 무시하도록 표시
  autocompleteBox.classList.add("hidden");

  statusMsg.textContent = "검색 중...";
  document.getElementById("dealsSection").classList.add("hidden");
  resultsSection.classList.remove("hidden");
  recommendSection.classList.add("hidden");
  grid.innerHTML = "";
  recommendGrid.innerHTML = "";

  try {
    const items = await fetchProducts(query, { sort: "sim" });
    if (items.length === 0) { statusMsg.textContent = "결과가 없어요. 다른 검색어로 시도해보세요."; return; }

    statusMsg.textContent = `"${query}" 검색 결과 ${items.length}개`;
    resultsTitle.textContent = `"${query}" 검색결과`;
    items.forEach((item) => grid.appendChild(buildCard(item)));

    const altItems = await fetchProducts(query, { sort: "asc" });
    const shownTitles = new Set(items.map((i) => i.title));
    const recs = altItems.filter((i) => !shownTitles.has(i.title)).slice(0, 8);
    if (recs.length > 0) {
      recommendSection.classList.remove("hidden");
      recs.forEach((item) => recommendGrid.appendChild(buildCard(item, { showDiscount: true })));
    }
  } catch (err) {
    console.error(err);
    statusMsg.textContent = err.message || "서버에 연결할 수 없어요.";
  }
}

// 자동완성: 입력 멈추고 200ms 후, 2글자 이상이면 미리보기 5개 fetch
// (검색이 이미 시작되면, 뒤늦게 도착하는 자동완성 응답은 무시해야 화면이 안 겹침)
let autocompleteTimer = null;
let autocompleteToken = 0;
function scheduleAutocomplete() {
  clearTimeout(autocompleteTimer);
  const myToken = ++autocompleteToken;
  const q = searchInput.value.trim();
  if (q.length < 2) { autocompleteBox.classList.add("hidden"); return; }
  autocompleteTimer = setTimeout(async () => {
    try {
      const items = await fetchProducts(q, { sort: "sim", display: 5 });
      if (myToken !== autocompleteToken) return; // 그 사이에 검색이 실행되었거나 입력이 더 바뀜 → 무시
      if (items.length === 0) { autocompleteBox.classList.add("hidden"); return; }
      autocompleteBox.innerHTML = items
        .map((item) => `
          <div class="autocomplete-item" data-title="${item.title.replace(/"/g, "&quot;")}">
            <img src="${item.image}" alt="" />
            <span>${item.title}</span>
          </div>`)
        .join("");
      autocompleteBox.querySelectorAll(".autocomplete-item").forEach((el) => {
        el.addEventListener("click", () => {
          searchInput.value = el.dataset.title;
          autocompleteBox.classList.add("hidden");
          search();
        });
      });
      autocompleteBox.classList.remove("hidden");
    } catch {
      if (myToken === autocompleteToken) autocompleteBox.classList.add("hidden");
    }
  }, 200);
}

// ---------------------------------------------------------
// 6. 찜(위시리스트)
// ---------------------------------------------------------
function toggleWish(item) {
  if (isWished(item.id)) {
    wishlist = wishlist.filter((w) => w.id !== item.id);
  } else {
    wishlist.push(item);
  }
  store.set("moodshop_wishlist", wishlist);
  refreshWishButtons();
  renderWishlist();
}

function refreshWishButtons() {
  document.querySelectorAll(".wish-btn").forEach((btn) => {
    const id = btn.dataset.id;
    const wished = isWished(id);
    btn.classList.toggle("active", wished);
    btn.textContent = wished ? "❤️" : "🤍";
  });
}

function renderWishlist() {
  wishCountEl.textContent = wishlist.length;
  if (wishlist.length === 0) {
    wishEmptyMsg.classList.remove("hidden");
    wishGrid.innerHTML = "";
  } else {
    wishEmptyMsg.classList.add("hidden");
    wishGrid.innerHTML = "";
    wishlist.forEach((item) => wishGrid.appendChild(buildCard(item)));
  }
}

function renderCollection() {
  if (collection.length === 0) {
    collectionEmptyMsg.classList.remove("hidden");
    collectionGrid.innerHTML = "";
    return;
  }
  collectionEmptyMsg.classList.add("hidden");
  collectionGrid.innerHTML = collection
    .map((c) => `
      <div class="collection-card ${c.rarity}">
        <div class="icon">${c.icon}</div>
        <div class="name">${c.name}</div>
        <div class="rarity">${c.rarityLabel}</div>
      </div>`)
    .join("");
}

// ---------------------------------------------------------
// 7. 상품 상세 모달
// ---------------------------------------------------------
function openDetail(id) {
  const item = itemsById.get(id);
  if (!item) return;
  const wished = isWished(item.id);

  detailBody.innerHTML = `
    <img src="${item.image}" alt="${item.title}" />
    <div class="detail-content">
      <p class="detail-title">${item.title}</p>
      <p class="detail-mall">${item.mall}</p>
      <div class="detail-price-row"><span class="detail-price">${won(item.price)}</span></div>
      <div class="detail-actions">
        <button class="detail-wish-btn ${wished ? "active" : ""}" id="detailWishBtn">${wished ? "❤️ 찜함" : "🤍 찜하기"}</button>
        <button class="detail-add-btn" id="detailAddBtn">🛒 장바구니 담기</button>
      </div>
      <a class="detail-link" href="${item.link}" target="_blank" rel="noopener">네이버에서 실제 상품 보기 ↗</a>
    </div>
  `;

  document.getElementById("detailAddBtn").addEventListener("click", () => {
    addToCart(item);
    document.getElementById("detailAddBtn").textContent = "담김!";
    setTimeout(() => { closeDetail(); }, 500);
  });
  document.getElementById("detailWishBtn").addEventListener("click", (e) => {
    toggleWish(item);
    const nowWished = isWished(item.id);
    e.currentTarget.classList.toggle("active", nowWished);
    e.currentTarget.textContent = nowWished ? "❤️ 찜함" : "🤍 찜하기";
  });

  detailModal.classList.remove("hidden");
}
function closeDetail() { detailModal.classList.add("hidden"); }

// ---------------------------------------------------------
// 8. 장바구니
// ---------------------------------------------------------
function addToCart(item) {
  cart.push({ ...item, cartId: `${item.id}-${Date.now()}` });
  renderCart();
}
function removeFromCart(cartId) {
  cart = cart.filter((i) => i.cartId !== cartId);
  renderCart();
}
function renderCouponSelect() {
  const currentValue = couponSelect.value;
  couponSelect.innerHTML = `<option value="">쿠폰 사용 안 함</option>`;
  coupons.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.label} (${c.percent}% 할인)`;
    couponSelect.appendChild(opt);
  });
  if (coupons.some((c) => c.id === currentValue)) couponSelect.value = currentValue;
}
function getCartTotals() {
  const subtotal = cart.reduce((sum, i) => sum + i.price, 0);
  const coupon = coupons.find((c) => c.id === couponSelect.value);
  const discount = coupon ? Math.round(subtotal * (coupon.percent / 100)) : 0;
  return { subtotal, discount, total: subtotal - discount, coupon };
}
function renderCart() {
  cartCount.textContent = cart.length;
  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<p style="color:#8a8280; font-size:13px; text-align:center; margin-top:30px;">장바구니가 비어있어요</p>`;
  } else {
    cartItemsEl.innerHTML = cart.map((item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="" />
        <div class="cart-item-info">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-price">${won(item.price)}</div>
        </div>
        <button class="remove-btn" data-cartid="${item.cartId}">삭제</button>
      </div>`).join("");
    cartItemsEl.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.cartid));
    });
  }
  renderCouponSelect();
  const { subtotal, discount, total } = getCartTotals();
  cartSubtotalEl.textContent = won(subtotal);
  cartTotalEl.textContent = won(total);
  if (discount > 0) { discountRow.classList.remove("hidden"); cartDiscountEl.textContent = `-${won(discount)}`; }
  else discountRow.classList.add("hidden");
}
function openCart() { cartPanel.classList.remove("hidden"); overlay.classList.remove("hidden"); }
function closeCart() { cartPanel.classList.add("hidden"); overlay.classList.add("hidden"); }

// ---------------------------------------------------------
// 9. 쿠폰함
// ---------------------------------------------------------
function renderCouponPanel() {
  couponCountEl.textContent = coupons.length;
  if (coupons.length === 0) {
    couponListEl.innerHTML = `<p style="color:#8a8280; font-size:13px; text-align:center; margin-top:30px;">쿠폰이 없어요. 룰렛이나 가챠를 돌려보세요!</p>`;
  } else {
    couponListEl.innerHTML = coupons.map((c) => `
      <div class="coupon-card">
        <div><div class="label">${c.label}</div><div class="sub">장바구니에서 사용 가능</div></div>
        <div style="font-weight:900; font-size:18px;">${c.percent}%</div>
      </div>`).join("");
  }
}
function openCoupon() { couponPanel.classList.remove("hidden"); overlay.classList.remove("hidden"); }
function closeCoupon() { couponPanel.classList.add("hidden"); overlay.classList.add("hidden"); }

// ---------------------------------------------------------
// 10. 가짜 결제
// ---------------------------------------------------------
function checkout() {
  if (cart.length === 0) return;
  const { subtotal, discount, total, coupon } = getCartTotals();

  receiptList.innerHTML = cart.map((item) => `
    <div class="receipt-row"><span>${item.title.slice(0, 20)}${item.title.length > 20 ? "..." : ""}</span><span>${won(item.price)}</span></div>
  `).join("");
  if (discount > 0) receiptList.innerHTML += `<div class="receipt-row" style="color:#ff5d3a; font-weight:700;"><span>쿠폰 할인</span><span>-${won(discount)}</span></div>`;
  receiptTotal.textContent = won(total);

  orders.unshift({
    id: "MOOD" + Date.now().toString().slice(-8),
    time: Date.now(),
    items: cart.map((i) => ({ title: i.title, price: i.price })),
    subtotal, discount, total,
  });
  store.set("moodshop_orders", orders);

  if (coupon) { coupons = coupons.filter((c) => c.id !== coupon.id); store.set("moodshop_coupons", coupons); }

  closeCart();
  receiptModal.classList.remove("hidden");
  launchConfetti();
  cart = [];
  renderCart();
  renderCouponPanel();
}

function launchConfetti() {
  confettiBox.innerHTML = "";
  const colors = ["#ff5d3a", "#17b890", "#ffce45", "#4d7cfe", "#ff8bd0"];
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.width = 6 + Math.random() * 6 + "px";
    piece.style.height = 6 + Math.random() * 10 + "px";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = 1.2 + Math.random() * 1 + "s";
    piece.style.animationDelay = Math.random() * 0.4 + "s";
    confettiBox.appendChild(piece);
  }
}

// ---------------------------------------------------------
// 11. 룰렛
// ---------------------------------------------------------
const PRIZES = [
  { percent: 5, label: "5% 할인쿠폰", weight: 25, color: "#ff5d3a" },
  { percent: 0, label: "꽝 😢", weight: 30, color: "#8a8280" },
  { percent: 10, label: "10% 할인쿠폰", weight: 20, color: "#17b890" },
  { percent: 0, label: "다음 기회에", weight: 15, color: "#8a8280" },
  { percent: 15, label: "15% 할인쿠폰", weight: 8, color: "#4d7cfe" },
  { percent: 20, label: "20% 할인쿠폰", weight: 2, color: "#ffce45" },
];
const SLICE_ANGLE = 360 / PRIZES.length;
let wheelRotation = 0;

function buildWheel() {
  const gradientParts = PRIZES.map((p, i) => `${p.color} ${i * SLICE_ANGLE}deg ${(i + 1) * SLICE_ANGLE}deg`);
  wheel.style.background = `conic-gradient(${gradientParts.join(",")})`;
  wheel.innerHTML = "";
  PRIZES.forEach((p, i) => {
    const centerAngle = i * SLICE_ANGLE + SLICE_ANGLE / 2;
    const label = document.createElement("div");
    label.style.cssText = "position:absolute; top:50%; left:50%; width:0; height:0;";
    label.style.transform = `rotate(${centerAngle}deg)`;
    label.innerHTML = `<span style="display:block; position:absolute; top:-95px; left:-30px; width:60px; text-align:center; font-size:10.5px; font-weight:800; color:#fff;">${p.label}</span>`;
    wheel.appendChild(label);
  });
}
function pickWeighted(list) {
  const totalWeight = list.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < list.length; i++) { r -= list[i].weight; if (r <= 0) return i; }
  return 0;
}
function updateSpinAvailability() {
  const already = lastSpinDate === todayStr();
  spinBtn.disabled = already;
  spinBtn.textContent = already ? "오늘은 다 돌렸어요! 내일 다시 와요" : "돌리기!";
  if (already) rouletteResultMsg.textContent = "🎡 하루에 한 번만 돌릴 수 있어요.";
  else rouletteResultMsg.textContent = "";
}
function spinWheel() {
  if (lastSpinDate === todayStr()) return;
  const prizeIndex = pickWeighted(PRIZES);
  const prize = PRIZES[prizeIndex];
  const centerAngle = prizeIndex * SLICE_ANGLE + SLICE_ANGLE / 2;
  const extraSpins = 5 * 360;
  wheelRotation = wheelRotation + extraSpins + (360 - centerAngle) - (wheelRotation % 360);
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  spinBtn.disabled = true;
  rouletteResultMsg.textContent = "두구두구두구...";

  wheel.addEventListener("transitionend", () => {
    lastSpinDate = todayStr();
    store.set("moodshop_last_spin", lastSpinDate);
    if (prize.percent > 0) {
      coupons.push({ id: "cpn_" + Date.now(), percent: prize.percent, label: prize.label });
      store.set("moodshop_coupons", coupons);
      renderCouponPanel(); renderCouponSelect();
      rouletteResultMsg.textContent = `🎉 ${prize.label} 당첨! 쿠폰함에 추가됐어요.`;
    } else {
      rouletteResultMsg.textContent = `${prize.label} 아쉬워요, 내일 다시 도전!`;
    }
    updateSpinAvailability();
  }, { once: true });
}
function openRoulette() { rouletteModal.classList.remove("hidden"); updateSpinAvailability(); }
function closeRoulette() { rouletteModal.classList.add("hidden"); }

// ---------------------------------------------------------
// 12. 가챠 (룰렛과 다르게: 대부분 "수집 아이템", 가끔 쿠폰도 같이)
// ---------------------------------------------------------
const GACHA_TABLE = [
  { rarity: "common", rarityLabel: "커먼", weight: 60, icon: "🛍️", name: "쇼핑백 스티커", percent: 0 },
  { rarity: "common", rarityLabel: "커먼", weight: 0, icon: "🪙", name: "행운의 동전", percent: 0 },
  { rarity: "common", rarityLabel: "커먼", weight: 0, icon: "✨", name: "반짝이 별", percent: 0 },
  { rarity: "rare", rarityLabel: "레어", weight: 30, icon: "🎫", name: "레어 쿠폰 티켓", percent: 8 },
  { rarity: "legendary", rarityLabel: "레전더리", weight: 10, icon: "🏆", name: "레전더리 트로피", percent: 20 },
];
// common 안에서 다시 셋 중 하나 랜덤 뽑기 위해 weight 재조정
GACHA_TABLE[0].weight = 20; GACHA_TABLE[1].weight = 20; GACHA_TABLE[2].weight = 20;

function updateGachaAvailability() {
  const already = lastGachaDate === todayStr();
  gachaBtn.disabled = already;
  gachaBtn.textContent = already ? "오늘은 다 뽑았어요! 내일 다시 와요" : "뽑기!";
  gachaResult.classList.add("hidden");
  gachaBox.className = "gacha-box";
  gachaBox.textContent = "📦";
}
function openGacha() { gachaModal.classList.remove("hidden"); updateGachaAvailability(); }
function closeGacha() { gachaModal.classList.add("hidden"); }

function pullGacha() {
  if (lastGachaDate === todayStr()) return;
  gachaBtn.disabled = true;
  gachaBox.className = "gacha-box shaking";

  setTimeout(() => {
    const idx = pickWeighted(GACHA_TABLE);
    const prize = GACHA_TABLE[idx];

    gachaBox.className = "gacha-box opened";
    gachaBox.textContent = prize.icon;

    lastGachaDate = todayStr();
    store.set("moodshop_last_gacha", lastGachaDate);

    collection.push({ icon: prize.icon, name: prize.name, rarity: prize.rarity, rarityLabel: prize.rarityLabel });
    store.set("moodshop_collection", collection);
    renderCollection();

    let msg = `${prize.icon} ${prize.name} (${prize.rarityLabel}) 획득!`;
    if (prize.percent > 0) {
      coupons.push({ id: "cpn_" + Date.now(), percent: prize.percent, label: `${prize.name} 쿠폰` });
      store.set("moodshop_coupons", coupons);
      renderCouponPanel(); renderCouponSelect();
      msg += ` 덤으로 ${prize.percent}% 할인쿠폰도 받았어요!`;
    }
    gachaResultIcon.textContent = prize.icon;
    gachaResultText.textContent = msg;
    gachaResult.classList.remove("hidden");
    launchConfetti();
  }, 900);
}

// ---------------------------------------------------------
// 13. 배송조회
// ---------------------------------------------------------
const STAGES = [
  { key: "paid", label: "결제완료", icon: "💳", afterMin: 0 },
  { key: "prep", label: "상품준비중", icon: "📦", afterMin: 2 },
  { key: "shipping", label: "배송중", icon: "🚚", afterMin: 5 },
  { key: "done", label: "배송완료", icon: "🏠", afterMin: 10 },
];
function getOrderStage(order) {
  const elapsedMin = (Date.now() - order.time) / 1000 / 60;
  let currentIndex = 0;
  STAGES.forEach((s, i) => { if (elapsedMin >= s.afterMin) currentIndex = i; });
  return currentIndex;
}
function renderOrders() {
  if (orders.length === 0) { trackingEmptyMsg.classList.remove("hidden"); orderListEl.innerHTML = ""; return; }
  trackingEmptyMsg.classList.add("hidden");
  orderListEl.innerHTML = orders.map((order) => {
    const stageIndex = getOrderStage(order);
    const itemSummary = order.items.length === 1
      ? order.items[0].title.slice(0, 26)
      : `${order.items[0].title.slice(0, 20)} 외 ${order.items.length - 1}건`;
    const stepsHtml = STAGES.map((s, i) => {
      const cls = i < stageIndex ? "done" : i === stageIndex ? "current" : "";
      return `<div class="progress-step ${cls}"><div class="progress-dot">${s.icon}</div><div class="progress-label">${s.label}</div></div>`;
    }).join("");
    return `
      <div class="order-card">
        <div class="order-card-header"><span class="order-id">주문번호 ${order.id}</span><span class="order-date">${new Date(order.time).toLocaleString("ko-KR")}</span></div>
        <div class="order-summary">${itemSummary} · <span class="order-total">${won(order.total)}</span></div>
        <div class="progress-track">${stepsHtml}</div>
      </div>`;
  }).join("");
}

// ---------------------------------------------------------
// 14. 탭 전환
// ---------------------------------------------------------
function switchTab(tab) {
  const wasAlreadyHome = tab === "home" && !pageHome.classList.contains("hidden");
  navTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  pageHome.classList.toggle("hidden", tab !== "home");
  pageWishlist.classList.toggle("hidden", tab !== "wishlist");
  pageTracking.classList.toggle("hidden", tab !== "tracking");
  if (tab === "tracking") renderOrders();
  if (tab === "wishlist") { renderWishlist(); renderCollection(); }
  if (tab === "home" && wasAlreadyHome) resetHomeView();
}

// ---------------------------------------------------------
// 15. AI 추천 챗봇
// ---------------------------------------------------------
function addAiMessage(html, cls = "ai-msg-bot") {
  const div = document.createElement("div");
  div.className = `ai-msg ${cls}`;
  div.innerHTML = html;
  aiChatMessages.appendChild(div);
  aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  return div;
}

async function sendAiChat() {
  const text = aiChatInput.value.trim();
  if (!text) return;
  addAiMessage(text, "ai-msg-user");
  aiChatInput.value = "";

  const typingEl = addAiMessage(`<span class="ai-typing">생각하는 중...</span>`);

  try {
    const res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    typingEl.remove();

    if (!res.ok) { addAiMessage(data.error || "추천을 가져오지 못했어요.", "ai-msg-error"); return; }

    if (data.comment) addAiMessage(data.comment);

    (data.groups || []).forEach((group) => {
      if (!group.items || group.items.length === 0) return;
      const wrap = document.createElement("div");
      wrap.className = "ai-msg ai-product-group";
      wrap.innerHTML = `
        <div class="ai-product-group-title">"${group.keyword}" 검색결과</div>
        <div class="ai-product-scroll">
          ${group.items.map((item) => {
            itemsById.set(item.id, item);
            return `
              <div class="ai-product-card" data-id="${item.id}">
                <img src="${item.image}" alt="" />
                <div class="t">${item.title}</div>
                <div class="p">${won(item.price)}</div>
              </div>`;
          }).join("")}
        </div>`;
      wrap.querySelectorAll(".ai-product-card").forEach((el) => {
        el.addEventListener("click", () => openDetail(el.dataset.id));
      });
      aiChatMessages.appendChild(wrap);
    });
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  } catch (err) {
    console.error(err);
    typingEl.remove();
    addAiMessage("서버에 연결할 수 없어요.", "ai-msg-error");
  }
}

function openAiChat() { aiChatPanel.classList.remove("hidden"); }
function closeAiChat() { aiChatPanel.classList.add("hidden"); }

// ---------------------------------------------------------
// 16. 이벤트 연결 + 초기 실행
// ---------------------------------------------------------
searchBtn.addEventListener("click", search);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) search(); });
searchInput.addEventListener("input", scheduleAutocomplete);
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-input-wrap")) autocompleteBox.classList.add("hidden");
});

cartBtn.addEventListener("click", openCart);
closeCartBtn.addEventListener("click", closeCart);
checkoutBtn.addEventListener("click", checkout);
closeReceiptBtn.addEventListener("click", () => receiptModal.classList.add("hidden"));
couponSelect.addEventListener("change", renderCart);

couponBtn.addEventListener("click", openCoupon);
closeCouponBtn.addEventListener("click", closeCoupon);

overlay.addEventListener("click", () => { closeCart(); closeCoupon(); });

rouletteOpenBtn.addEventListener("click", openRoulette);
closeRouletteBtn.addEventListener("click", closeRoulette);
spinBtn.addEventListener("click", spinWheel);

gachaOpenBtn.addEventListener("click", openGacha);
closeGachaBtn.addEventListener("click", closeGacha);
gachaBtn.addEventListener("click", pullGacha);

closeDetailBtn.addEventListener("click", closeDetail);
detailModal.addEventListener("click", (e) => { if (e.target === detailModal) closeDetail(); });

navTabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

aiChatOpenBtn.addEventListener("click", openAiChat);
closeAiChatBtn.addEventListener("click", closeAiChat);
aiChatSendBtn.addEventListener("click", sendAiChat);
aiChatInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) sendAiChat(); });

// 초기화
buildWheel();
renderCart();
renderCouponPanel();
renderWishlist();
renderCollection();
loadDeals();

setInterval(() => { if (!pageTracking.classList.contains("hidden")) renderOrders(); }, 30000);
