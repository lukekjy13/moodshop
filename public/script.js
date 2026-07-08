// script.js
// 이 파일은 "우리 서버"(server.js)한테만 말을 걸어요.
// 네이버 API 키는 여기 코드 어디에도 없어요 (서버만 알고 있음).

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const grid = document.getElementById("grid");
const statusMsg = document.getElementById("statusMsg");

const cartBtn = document.getElementById("cartBtn");
const cartCount = document.getElementById("cartCount");
const cartPanel = document.getElementById("cartPanel");
const cartItemsEl = document.getElementById("cartItems");
const cartTotalEl = document.getElementById("cartTotal");
const closeCartBtn = document.getElementById("closeCart");
const overlay = document.getElementById("overlay");
const checkoutBtn = document.getElementById("checkoutBtn");

const receiptModal = document.getElementById("receiptModal");
const receiptList = document.getElementById("receiptList");
const receiptTotal = document.getElementById("receiptTotal");
const closeReceiptBtn = document.getElementById("closeReceipt");
const confettiBox = document.getElementById("confetti");

// 장바구니는 그냥 배열로 관리 (새로고침하면 사라짐 - 진짜 쇼핑몰 아니니까 괜찮아요)
let cart = [];

function won(n) {
  return n.toLocaleString("ko-KR") + "원";
}

// ---------- 검색 ----------
async function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  statusMsg.textContent = "검색 중...";
  grid.innerHTML = "";

  try {
    const res = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (!res.ok) {
      statusMsg.textContent = data.error || "검색 실패";
      return;
    }

    if (data.items.length === 0) {
      statusMsg.textContent = "결과가 없어요. 다른 검색어로 시도해보세요.";
      return;
    }

    statusMsg.textContent = `"${query}" 검색 결과 ${data.items.length}개`;
    renderGrid(data.items);
  } catch (err) {
    console.error(err);
    statusMsg.textContent = "서버에 연결할 수 없어요. 서버가 실행 중인지 확인해보세요.";
  }
}

function renderGrid(items) {
  grid.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.title}" loading="lazy" />
      <div class="card-body">
        <div class="card-title">${item.title}</div>
        <div class="card-mall">${item.mall}</div>
        <div class="card-price">${won(item.price)}</div>
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
    grid.appendChild(card);
  });
}

// ---------- 장바구니 ----------
function addToCart(item) {
  cart.push(item);
  renderCart();
}

function removeFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  renderCart();
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
        <button class="remove-btn" data-id="${item.id}">삭제</button>
      </div>
    `
      )
      .join("");

    cartItemsEl.querySelectorAll(".remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => removeFromCart(btn.dataset.id));
    });
  }

  const total = cart.reduce((sum, i) => sum + i.price, 0);
  cartTotalEl.textContent = won(total);
}

function openCart() {
  cartPanel.classList.remove("hidden");
  overlay.classList.remove("hidden");
}
function closeCart() {
  cartPanel.classList.add("hidden");
  overlay.classList.add("hidden");
}

// ---------- 가짜 결제 ----------
function checkout() {
  if (cart.length === 0) return;

  const total = cart.reduce((sum, i) => sum + i.price, 0);
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
  receiptTotal.textContent = won(total);

  closeCart();
  receiptModal.classList.remove("hidden");
  launchConfetti();

  cart = [];
  renderCart();
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

// ---------- 이벤트 연결 ----------
searchBtn.addEventListener("click", search);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") search();
});

cartBtn.addEventListener("click", openCart);
closeCartBtn.addEventListener("click", closeCart);
overlay.addEventListener("click", closeCart);
checkoutBtn.addEventListener("click", checkout);
closeReceiptBtn.addEventListener("click", () => receiptModal.classList.add("hidden"));

renderCart();
