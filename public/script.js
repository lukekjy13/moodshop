// script.js
// 서버(server.js)한테만 말을 걸어요. 네이버 API 키는 여기 없음.

// ---------------------------------------------------------
// 0. 저장할 데이터 (localStorage에 저장 - 새로고침해도 안 사라짐)
//    실제 결제/배송은 절대 안 일어나고, 전부 브라우저 안에서만 흉내내는 거예요.
// ---------------------------------------------------------
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

let cart = [];
let coupons = store.get("moodshop_coupons", []); // [{id, percent, label}]
let orders = store.get("moodshop_orders", []); // [{id, time, items, total}]
let lastSpinDate = store.get("moodshop_last_spin", null); // "2026-07-09"

function won(n) {
  return Math.round(n).toLocaleString("ko-KR") + "원";
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------
// 1. DOM 참조
// ---------------------------------------------------------
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const statusMsg = document.getElementById("statusMsg");

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

const navTabs = document.querySelectorAll(".nav-tab");
const pageHome = document.getElementById("page-home");
const pageTracking = document.getElementById("page-tracking");
const orderListEl = document.getElementById("orderList");
const trackingEmptyMsg = document.getElementById("trackingEmptyMsg");

// ---------------------------------------------------------
// 2. 할인 뱃지 (실제 가격은 그대로, "원래 가격"만 가짜로 부풀려서 표시)
// ---------------------------------------------------------
function fakeDiscountPercent(item) {
  // 상품마다 항상 같은 할인율이 나오도록 제목 글자로 규칙 생성 (매번 랜덤이면 이상해서)
  let sum = 0;
  for (const ch of item.title) sum += ch.charCodeAt(0);
  const options = [10, 15, 20, 25, 30];
  return options[sum % options.length];
}
function fakeOriginalPrice(price, percent) {
  return Math.round((price / (1 - percent / 100)) / 100) * 100;
}

// ---------------------------------------------------------
// 3. 상품 카드 렌더링 (공통 함수 - 특가/검색/추천 다 같이 사용)
// ---------------------------------------------------------
function buildCard(item, { showDiscount = false } = {}) {
  const card = document.createElement("div");
  card.className = "card";

  let priceHtml = `<div class="card-price">${won(item.price)}</div>`;
  let badgeHtml = "";

  if (showDiscount) {
    const percent = fakeDiscountPercent(item);
    const original = fakeOriginalPrice(item.price, percent);
    badgeHtml = `<div class="discount-badge">${percent}% 할인</div>`;
    priceHtml = `
      <div class="price-original">${won(original)}</div>
      <div class="card-price discounted">${won(item.price)}</div>
    `;
  }

  card.innerHTML = `
    ${badgeHtml}
    <img src="${item.image}" alt="${item.title}" loading="lazy" />
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-mall">${item.mall}</div>
      ${priceHtml}
      <button class="add-btn">장바구니 담기</button>
    </div>
  `;
  const btn = card.querySelector(".add-btn");
  btn.addEventListener("click", () => {
    addToCart(item);
    btn.textContent = "담김!";
    btn.classList.add("added");
    setTimeout(() => {
      btn.textContent = "장바구니 담기";
      btn.classList.remove("added");
    }, 900);
  });
  return card;
}

async function fetchProducts(query, sort = "sim") {
  const res = await fetch(`/api/search?query=${encodeURIComponent(query)}&sort=${sort}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "검색 실패");
  return data.items;
}

// ---------------------------------------------------------
// 4. 오늘의 특가 (홈 진입시 자동으로 한 번 불러옴)
// ---------------------------------------------------------
async function loadDeals() {
  try {
    const items = await fetchProducts("인기 선물 추천", "sim");
    dealsGrid.innerHTML = "";
    items.slice(0, 8).forEach((item) => {
      dealsGrid.appendChild(buildCard(item, { showDiscount: true }));
    });
  } catch (err) {
    console.error(err);
    dealsGrid.innerHTML = `<p style="color:#8a8280;">특가 상품을 불러오지 못했어요.</p>`;
  }
}

// ---------------------------------------------------------
// 5. 검색 + 검색 기반 추천
// ---------------------------------------------------------
async function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  statusMsg.textContent = "검색 중...";
  resultsSection.classList.remove("hidden");
  recommendSection.classList.add("hidden");
  grid.innerHTML = "";
  recommendGrid.innerHTML = "";

  try {
    const items = await fetchProducts(query, "sim");

    if (items.length === 0) {
      statusMsg.textContent = "결과가 없어요. 다른 검색어로 시도해보세요.";
      return;
    }

    statusMsg.textContent = `"${query}" 검색 결과 ${items.length}개`;
    resultsTitle.textContent = `"${query}" 검색결과`;
    items.forEach((item) => grid.appendChild(buildCard(item)));

    // 추천: 같은 검색어를 다른 정렬(낮은 가격순)로 한 번 더 가져와서
    // 위에 이미 보여준 상품과 겹치지 않는 것만 "추천"으로 보여줌
    const altItems = await fetchProducts(query, "asc");
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

// ---------------------------------------------------------
// 6. 장바구니
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
  // 이전에 선택돼있던 쿠폰이 아직 있으면 유지
  if (coupons.some((c) => c.id === currentValue)) couponSelect.value = currentValue;
}

function getCartTotals() {
  const subtotal = cart.reduce((sum, i) => sum + i.price, 0);
  const selectedCouponId = couponSelect.value;
  const coupon = coupons.find((c) => c.id === selectedCouponId);
  const discount = coupon ? Math.round(subtotal * (coupon.percent / 100)) : 0;
  const total = subtotal - discount;
  return { subtotal, discount, total, coupon };
}

function renderCart() {
  cartCount.textContent = cart.length;

  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<p style="color:#8a8280; font-size:13px; text-align:center; margin-top:30px;">장바구니가 비어있어요</p>`;
  } else {
    cartItemsEl.innerHTML = cart
      .map(
        (item) => `
      <div class="cart-item">
        <img src="${item.image}" alt="" />
        <div class="cart-item-info">
          <div class="cart-item-title">${item.title}</div>
          <div class="cart-item-price">${won(item.price)}</div>
        </div>
        <button class="remove-btn" data-cartid="${item.cartId}">삭제</button>
      </div>
    `
      )
      .join("");
    cartItemsEl.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.cartid));
    });
  }

  renderCouponSelect();
  const { subtotal, discount, total } = getCartTotals();
  cartSubtotalEl.textContent = won(subtotal);
  cartTotalEl.textContent = won(total);
  if (discount > 0) {
    discountRow.classList.remove("hidden");
    cartDiscountEl.textContent = `-${won(discount)}`;
  } else {
    discountRow.classList.add("hidden");
  }
}

function openCart() { cartPanel.classList.remove("hidden"); overlay.classList.remove("hidden"); }
function closeCart() { cartPanel.classList.add("hidden"); overlay.classList.add("hidden"); }

// ---------------------------------------------------------
// 7. 쿠폰함
// ---------------------------------------------------------
function renderCouponPanel() {
  couponCountEl.textContent = coupons.length;
  if (coupons.length === 0) {
    couponListEl.innerHTML = `<p style="color:#8a8280; font-size:13px; text-align:center; margin-top:30px;">쿠폰이 없어요. 룰렛을 돌려보세요!</p>`;
  } else {
    couponListEl.innerHTML = coupons
      .map(
        (c) => `
      <div class="coupon-card">
        <div>
          <div class="label">${c.label}</div>
          <div class="sub">장바구니에서 사용 가능</div>
        </div>
        <div style="font-weight:900; font-size:18px;">${c.percent}%</div>
      </div>
    `
      )
      .join("");
  }
}
function openCoupon() { couponPanel.classList.remove("hidden"); overlay.classList.remove("hidden"); }
function closeCoupon() { couponPanel.classList.add("hidden"); overlay.classList.add("hidden"); }

// ---------------------------------------------------------
// 8. 가짜 결제 + 가짜 주문 생성
// ---------------------------------------------------------
function checkout() {
  if (cart.length === 0) return;

  const { subtotal, discount, total, coupon } = getCartTotals();

  receiptList.innerHTML = cart
    .map(
      (item) => `
    <div class="receipt-row">
      <span>${item.title.slice(0, 20)}${item.title.length > 20 ? "..." : ""}</span>
      <span>${won(item.price)}</span>
    </div>
  `
    )
    .join("");
  if (discount > 0) {
    receiptList.innerHTML += `<div class="receipt-row" style="color:#ff5d3a; font-weight:700;"><span>쿠폰 할인</span><span>-${won(discount)}</span></div>`;
  }
  receiptTotal.textContent = won(total);

  // 가짜 주문 내역 저장 (배송조회에서 씀)
  const order = {
    id: "MOOD" + Date.now().toString().slice(-8),
    time: Date.now(),
    items: cart.map((i) => ({ title: i.title, price: i.price })),
    subtotal,
    discount,
    total,
  };
  orders.unshift(order);
  store.set("moodshop_orders", orders);

  // 사용한 쿠폰은 없앰
  if (coupon) {
    coupons = coupons.filter((c) => c.id !== coupon.id);
    store.set("moodshop_coupons", coupons);
  }

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
// 9. 룰렛
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
    label.style.position = "absolute";
    label.style.top = "50%";
    label.style.left = "50%";
    label.style.width = "0";
    label.style.height = "0";
    label.style.transform = `rotate(${centerAngle}deg)`;
    label.innerHTML = `<span style="
      display:block; position:absolute; top:-95px; left:-30px; width:60px;
      text-align:center; font-size:10.5px; font-weight:800; color:#fff;
      transform: rotate(0deg);
    ">${p.label}</span>`;
    wheel.appendChild(label);
  });
}

function pickWeightedPrize() {
  const totalWeight = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < PRIZES.length; i++) {
    r -= PRIZES[i].weight;
    if (r <= 0) return i;
  }
  return 0;
}

function updateSpinAvailability() {
  const alreadySpun = lastSpinDate === todayStr();
  spinBtn.disabled = alreadySpun;
  spinBtn.textContent = alreadySpun ? "오늘은 다 돌렸어요! 내일 다시 와요" : "돌리기!";
  if (alreadySpun) rouletteResultMsg.textContent = "🎡 하루에 한 번만 돌릴 수 있어요.";
}

function spinWheel() {
  if (lastSpinDate === todayStr()) return;

  const prizeIndex = pickWeightedPrize();
  const prize = PRIZES[prizeIndex];
  const centerAngle = prizeIndex * SLICE_ANGLE + SLICE_ANGLE / 2;

  // 포인터는 12시 방향 고정. 바퀴를 여러바퀴+목표각도만큼 돌려서 해당 조각이 위로 오게 함
  const extraSpins = 5 * 360;
  const targetRotation = wheelRotation + extraSpins + (360 - centerAngle) - (wheelRotation % 360);
  wheelRotation = targetRotation;
  wheel.style.transform = `rotate(${wheelRotation}deg)`;

  spinBtn.disabled = true;
  rouletteResultMsg.textContent = "두구두구두구...";

  wheel.addEventListener(
    "transitionend",
    () => {
      lastSpinDate = todayStr();
      store.set("moodshop_last_spin", lastSpinDate);

      if (prize.percent > 0) {
        const coupon = {
          id: "cpn_" + Date.now(),
          percent: prize.percent,
          label: prize.label,
        };
        coupons.push(coupon);
        store.set("moodshop_coupons", coupons);
        renderCouponPanel();
        renderCouponSelect();
        rouletteResultMsg.textContent = `🎉 ${prize.label} 당첨! 쿠폰함에 추가됐어요.`;
      } else {
        rouletteResultMsg.textContent = `${prize.label} 아쉬워요, 내일 다시 도전!`;
      }
      updateSpinAvailability();
    },
    { once: true }
  );
}

function openRoulette() { rouletteModal.classList.remove("hidden"); updateSpinAvailability(); }
function closeRoulette() { rouletteModal.classList.add("hidden"); }

// ---------------------------------------------------------
// 10. 배송조회 (가짜 시뮬레이션 - 시간이 지나면 단계가 자동으로 넘어감)
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
  STAGES.forEach((s, i) => {
    if (elapsedMin >= s.afterMin) currentIndex = i;
  });
  return currentIndex;
}

function renderOrders() {
  if (orders.length === 0) {
    trackingEmptyMsg.classList.remove("hidden");
    orderListEl.innerHTML = "";
    return;
  }
  trackingEmptyMsg.classList.add("hidden");

  orderListEl.innerHTML = orders
    .map((order) => {
      const stageIndex = getOrderStage(order);
      const itemSummary =
        order.items.length === 1
          ? order.items[0].title.slice(0, 26)
          : `${order.items[0].title.slice(0, 20)} 외 ${order.items.length - 1}건`;

      const stepsHtml = STAGES.map((s, i) => {
        let cls = "";
        if (i < stageIndex) cls = "done";
        else if (i === stageIndex) cls = "current";
        return `
          <div class="progress-step ${cls}">
            <div class="progress-dot">${s.icon}</div>
            <div class="progress-label">${s.label}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="order-card">
          <div class="order-card-header">
            <span class="order-id">주문번호 ${order.id}</span>
            <span class="order-date">${new Date(order.time).toLocaleString("ko-KR")}</span>
          </div>
          <div class="order-summary">${itemSummary} · <span class="order-total">${won(order.total)}</span></div>
          <div class="progress-track">${stepsHtml}</div>
        </div>
      `;
    })
    .join("");
}

// ---------------------------------------------------------
// 11. 탭 전환
// ---------------------------------------------------------
function switchTab(tab) {
  navTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  pageHome.classList.toggle("hidden", tab !== "home");
  pageTracking.classList.toggle("hidden", tab !== "tracking");
  if (tab === "tracking") renderOrders();
}

// ---------------------------------------------------------
// 12. 이벤트 연결 + 초기 실행
// ---------------------------------------------------------
searchBtn.addEventListener("click", search);
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") search(); });

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

navTabs.forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

// 초기화
buildWheel();
renderCart();
renderCouponPanel();
loadDeals();

// 배송조회 탭이 열려있는 동안 30초마다 진행상황 자동 갱신
setInterval(() => {
  if (!pageTracking.classList.contains("hidden")) renderOrders();
}, 30000);
