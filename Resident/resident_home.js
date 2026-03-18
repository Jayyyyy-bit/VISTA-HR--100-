/* ============================================================
   VISTA-HR · Resident Home JS
   - Horizontal scroll rows with curated categories
   - Filter panel + search dropdown
   - Detail drawer
   - Auth-aware header
============================================================ */

const API = "http://127.0.0.1:5000/api";
const CITIES = ["Caloocan", "Quezon City", "Manila", "Makati", "Pasay", "Taguig", "Mandaluyong"];

const MOCK = [
  {
    id: 1, title: "Morning Star Residence", city: "Caloocan", barangay: "Bagong Barrio", place_type: "Boarding House", price: 5500, available: true, tour: true, badge: "Guest fave",
    cover: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800",
    tour_url: "https://pannellum.org/images/alma.jpg",
    capacity: { guests: 1, beds: 1 }, highlights: ["Near UCC", "WiFi included", "With bathroom"], amenities: { appliances: ["Electric fan", "Ref", "Microwave"], safety: ["CCTV", "24hr guard"] }, description: "Well-maintained room perfect for students. Walking distance to University of Caloocan City. All utilities included."
  },
  {
    id: 2, title: "The Scholar's Nest", city: "Caloocan", barangay: "Grace Park", place_type: "Room", price: 4200, available: true, tour: true, badge: "New",
    cover: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&q=80&w=800",
    tour_url: "https://pannellum.org/images/cerro-toco-0.jpg",
    capacity: { guests: 1, beds: 1 }, highlights: ["Near MCU", "Study area", "With WiFi"], amenities: { appliances: ["AC", "Ref"], safety: ["Guard"] }, description: "Cozy room near MCU Monumento. Perfect for nursing and engineering students."
  },
  {
    id: 3, title: "Affordable Bedspace", city: "Caloocan", barangay: "Camarin", place_type: "Bedspace", price: 2500, available: true, tour: false,
    cover: "https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&q=80&w=800",
    capacity: { guests: 1, beds: 1 }, highlights: ["Budget-friendly", "Near transport", "Meals available"], amenities: { appliances: ["Electric fan"], safety: ["CCTV"] }, description: "Affordable bedspace for students on a tight budget."
  },
  {
    id: 4, title: "Safe Haven Dorms", city: "Caloocan", barangay: "Bagong Barrio", place_type: "Boarding House", price: 3500, available: true, tour: true,
    cover: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=800",
    tour_url: "https://pannellum.org/images/alma.jpg",
    capacity: { guests: 1, beds: 1 }, highlights: ["Girls dorm", "Meals included", "Curfew 10pm"], amenities: { appliances: ["AC", "Ref"], safety: ["Female guard", "CCTV"] }, description: "Safe dormitory for female students with meals included."
  },
  {
    id: 5, title: "Grand Loft Caloocan", city: "Caloocan", barangay: "Grace Park East", place_type: "Apartment", price: 8000, available: false, tour: false,
    cover: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&q=80&w=800",
    capacity: { guests: 2, beds: 1 }, highlights: ["Fully furnished", "Modern kitchen", "Secure building"], amenities: { appliances: ["AC", "Ref", "Stove"], safety: ["Guard", "CCTV"] }, description: "Modern loft apartment in Grace Park East. Fully furnished and ready to move in."
  },
  {
    id: 6, title: "BGC-style Condo Unit", city: "Caloocan", barangay: "Bagumbong", place_type: "Condo", price: 12000, available: true, tour: true, badge: "Guest fave",
    cover: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
    tour_url: "https://pannellum.org/images/cerro-toco-0.jpg",
    capacity: { guests: 2, beds: 1 }, highlights: ["Pool access", "Gym", "High floor"], amenities: { appliances: ["AC", "Ref", "Smart TV"], activities: ["Pool", "Gym"], safety: ["24hr security"] }, description: "Premium condo unit with resort-like amenities. High floor with city views."
  },
  {
    id: 7, title: "Transient Room near LRT", city: "Manila", barangay: "Tondo", place_type: "Room", price: 4200, available: true, tour: true,
    cover: "https://images.unsplash.com/photo-1586105251261-72a756497a11?auto=format&fit=crop&q=80&w=800",
    tour_url: "https://pannellum.org/images/alma.jpg",
    capacity: { guests: 1, beds: 1 }, highlights: ["Near LRT-1", "Private entrance", "Fast WiFi"], amenities: { appliances: ["AC", "Electric fan"], safety: ["Guard"] }, description: "Convenient room just steps from LRT-1 Tayuman. Best for daily commuters."
  },
  {
    id: 8, title: "Shared Apartment Makati", city: "Makati", barangay: "Guadalupe", place_type: "Apartment", price: 6500, available: true, tour: false,
    cover: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&q=80&w=800",
    capacity: { guests: 3, beds: 2 }, highlights: ["Near Ayala", "Share-able", "Good neighborhood"], amenities: { appliances: ["AC", "Ref", "Stove", "Washing machine"], safety: ["Guard"] }, description: "Spacious apartment to share near Makati CBD. Great location, well-maintained."
  },
  {
    id: 9, title: "Cozy Room w/ Own Bath", city: "Caloocan", barangay: "Deparo", place_type: "Room", price: 3800, available: true, tour: true,
    cover: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=800",
    capacity: { guests: 1, beds: 1 }, highlights: ["Private bathroom", "WiFi", "Air-conditioned"], amenities: { appliances: ["AC", "Ref"], safety: ["CCTV"] }, description: "Private room with own bathroom. Clean and well-ventilated, near public transport."
  },
  {
    id: 10, title: "Budget Room near Monumento", city: "Caloocan", barangay: "Grace Park", place_type: "Room", price: 2800, available: true, tour: false,
    cover: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&q=80&w=800",
    capacity: { guests: 1, beds: 1 }, highlights: ["Near Monumento", "Very affordable", "Clean"], amenities: { appliances: ["Electric fan"], safety: ["CCTV"] }, description: "Budget-friendly room very close to Monumento station. Ideal for students."
  },
];

// ── State ──
const state = {
  all: [],
  saved: new Set(JSON.parse(localStorage.getItem("vista_saved") || "[]")),
  filters: { type: "", city: "", minPrice: 0, maxPrice: 0, availOnly: false, tourOnly: false },
  mode: "default", // "default" | "filtered"
  filteredPage: 0,
  perPage: 12,
};

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  if (window.AuthGuard?.requireResident) {
    const ok = await window.AuthGuard.requireResident();
    if (!ok) return;
  }

  lucide.createIcons();
  setupEmailVerifyBanner();
  setupHeader();
  setupSearchPill();
  setupCategoryBar();
  setupFilterPanel();
  setupDropdownClose();
  setupDrawerClose();

  await loadListings();
  checkURLParams();
});

/* ════════════════════════════════════════
   AUTH HEADER
════════════════════════════════════════ */
function setupHeader() {
  let user = null;
  try { user = window.AuthGuard?.getSession?.()?.user || null; } catch { }

  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Resident";
  const init = (name[0] || "R").toUpperCase();

  set("avatarEl", init);
  set("udAvatar", init);
  set("udName", name);
  set("udEmail", user?.email || "");

  // Dropdown toggle
  const btn = $("profileBtn");
  const menu = $("userDropdown");
  btn?.addEventListener("click", (e) => { e.stopPropagation(); menu?.classList.toggle("open"); });
  document.addEventListener("click", () => menu?.classList.remove("open"));
  menu?.addEventListener("click", e => e.stopPropagation());

  // Logout
  // Profile menu links
  $("udProfile")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    location.href = "/auth/account-settings.html";
  });
  $("udBookings")?.addEventListener("click", () => {
    menu?.classList.remove("open");
    // Will be a full bookings page — for now scroll to top as placeholder
    location.href = "/auth/account-settings.html";
  });

  $("udLogout")?.addEventListener("click", async () => {
    try { await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }); } catch { }
    try { window.AuthGuard?.clearSession?.(); } catch { }
    window.location.href = "../auth/login.html";
  });
}

function $(id) { return document.getElementById(id); }
function set(id, val) { const el = $(id); if (el) el.textContent = val; }

/* ════════════════════════════════════════
   EMAIL VERIFY BANNER
════════════════════════════════════════ */
function setupEmailVerifyBanner() {
  let user = null;
  try { user = window.AuthGuard?.getSession?.()?.user || null; } catch { }

  const banner = $("emailVerifyBanner");
  if (!banner) return;

  const emailVerified = user?.email_verified === true;
  if (emailVerified) { banner.hidden = true; return; }

  // Show banner
  banner.hidden = false;
  const email = encodeURIComponent(user?.email || "");
  const btn = $("emailVerifyBtn");
  if (btn) btn.href = `/auth/verify-email.html?email=${email}&role=RESIDENT`;

  // Dismiss (hides for this session only)
  $("evbDismiss")?.addEventListener("click", () => { banner.hidden = true; });
}

/* ════════════════════════════════════════
   LOAD LISTINGS
════════════════════════════════════════ */
async function loadListings() {
  // Show skeletons in all rows
  showRowSkeletons();

  try {
    const r = await fetch(`${API}/listings/feed?limit=60`, { credentials: "include" });
    if (r.ok) {
      const d = await r.json();
      state.all = (d.listings || []).map(normalizeAPIListing);
    }
  } catch { }

  if (!state.all.length) state.all = MOCK;

  renderDefaultRows();
}

function normalizeAPIListing(l) {
  const photos = l.photos || [];
  const cover = typeof photos[0] === "object" ? photos[0]?.url : photos[0] || l.cover || null;
  const cap = typeof l.capacity === "object" ? l.capacity : {};
  const tourUrl = l.tour_url || l.pano_url || null;
  // monthly_rent is the canonical price field; fall back to legacy price
  const price = l.price ?? cap.monthly_rent ?? cap.price ?? null;
  return {
    id: l.id, title: l.title || "Untitled space",
    city: l.city || "", barangay: l.barangay || "",
    place_type: l.place_type || l.placeType || "Room",
    price,
    student_discount: l.student_discount || 0,
    available: l.status === "PUBLISHED",
    tour: !!(tourUrl || l.has_tour),
    tour_url: tourUrl,
    cover, capacity: cap,
    highlights: l.highlights || [],
    amenities: l.amenities || {},
    description: l.description || "",
    badge: l.badge || null,
  };
}

function showRowSkeletons() {
  ["scrollUE", "scrollBudget", "scrollTour", "scrollAvail"].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = Array.from({ length: 5 }, () => `
      <div class="row-skeleton">
        <div class="sk-photo"></div>
        <div class="sk-line w70"></div>
        <div class="sk-line w45"></div>
      </div>`).join("");
  });
}

/* ════════════════════════════════════════
   RENDER DEFAULT ROWS
════════════════════════════════════════ */
function renderDefaultRows() {
  const nearUE = state.all.filter(l => l.city === "Caloocan").slice(0, 8);
  const budget = state.all.filter(l => l.price && l.price <= 4000).slice(0, 8);
  const tours = state.all.filter(l => l.tour).slice(0, 8);
  const avail = state.all.filter(l => l.available !== false).slice(0, 8);

  fillRow("scrollUE", nearUE);
  fillRow("scrollBudget", budget);
  fillRow("scrollTour", tours);
  fillRow("scrollAvail", avail);

  // Hide rows with no data
  hideEmptyRow("rowUE", nearUE);
  hideEmptyRow("rowBudget", budget);
  hideEmptyRow("rowTour", tours);
  hideEmptyRow("rowAvail", avail);

  lucide.createIcons();
}

function fillRow(containerId, listings) {
  const el = $(containerId);
  if (!el) return;

  if (!listings.length) {
    el.innerHTML = `<p style="color:var(--ink-60);font-size:13px;padding:16px 0">No listings available.</p>`;
    return;
  }

  el.innerHTML = listings.map(l => rowCardHTML(l)).join("");

  el.querySelectorAll(".lcard[data-id]").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".lcard-save")) return;
      openDrawer(parseInt(card.dataset.id));
    });
    card.querySelector(".lcard-save")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSave(parseInt(card.dataset.id), card.querySelector(".lcard-save"));
    });
  });
}

function hideEmptyRow(rowId, arr) {
  const el = $(rowId);
  if (el) el.style.display = arr.length ? "" : "none";
}

/* Row card HTML */
function rowCardHTML(l) {
  const saved = state.saved.has(l.id);
  const loc = [l.barangay, l.city].filter(Boolean).join(", ") || "Caloocan";
  const price = l.price
    ? `<b>₱${Number(l.price).toLocaleString()}</b><span>/mo</span>`
    : `<span style="color:var(--ink-60)">On request</span>`;

  const imgEl = l.cover
    ? `<img class="lcard-img" src="${esc(l.cover)}" alt="${esc(l.title)}" loading="lazy">`
    : `<div class="lcard-placeholder"><i data-lucide="home"></i></div>`;

  const badge = l.badge ? `<div class="lcard-badge">${esc(l.badge)}</div>` : "";
  const tour = l.tour ? `<div class="lcard-tour"><i data-lucide="rotate-3d"></i>360° Tour</div>` : "";
  const dot = `<div class="lcard-status-dot${l.available === false ? " unavail" : ""}"></div>`;

  return `
    <div class="lcard" data-id="${l.id}">
      <div class="lcard-photo">
        ${imgEl}
        ${badge}
        <button class="lcard-save${saved ? " saved" : ""}" aria-label="Save">
          <i data-lucide="heart"></i>
        </button>
        ${tour}
      </div>
      <div class="lcard-body">
        <div class="lcard-top">
          <span class="lcard-location">${esc(loc)}</span>
          ${dot}
        </div>
        <div class="lcard-type">${esc(l.place_type || "Room")}</div>
        <div class="lcard-price">${price}</div>
      </div>
    </div>`;
}

/* ════════════════════════════════════════
   CATEGORY BAR
════════════════════════════════════════ */
function setupCategoryBar() {
  document.querySelectorAll(".cat-item").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".cat-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const type = btn.dataset.type || "";
      state.filters.type = type;

      if (!type) {
        showDefaultView();
      } else {
        state.mode = "filtered";
        applyFilters();
      }
    });
  });

  // Row "show all" buttons
  document.querySelectorAll(".row-see-all").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.city) { state.filters.city = btn.dataset.city; }
      if (btn.dataset.maxprice) { state.filters.maxPrice = parseInt(btn.dataset.maxprice); }
      if (btn.dataset.tour) { state.filters.tourOnly = true; }
      if (btn.dataset.available) { state.filters.availOnly = true; }
      state.mode = "filtered";
      applyFilters();
    });
  });
}

function showDefaultView() {
  $("defaultView").hidden = false;
  $("filteredView").hidden = true;
  $("emptyState").hidden = true;
  state.mode = "default";
}

/* ════════════════════════════════════════
   SEARCH PILL + DROPDOWN
════════════════════════════════════════ */
function setupSearchPill() {
  const drop = $("searchDrop");

  // City chips
  const chipsEl = $("sdCityChips");
  if (chipsEl) {
    chipsEl.innerHTML = CITIES.map(c =>
      `<button class="city-chip" data-city="${c}">${c}</button>`
    ).join("");
    chipsEl.querySelectorAll(".city-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        chipsEl.querySelectorAll(".city-chip").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.filters.city = btn.dataset.city;
        set("spWhereVal", btn.dataset.city);
        $("spWhereVal")?.classList.add("active");
      });
    });
  }

  // Price presets
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const min = parseInt(btn.dataset.min) || 0;
      const max = parseInt(btn.dataset.max) || 0;
      state.filters.minPrice = min;
      state.filters.maxPrice = max;
      const sdMin = $("sdMin"); const sdMax = $("sdMax");
      if (sdMin) sdMin.value = min || "";
      if (sdMax) sdMax.value = max || "";
      const label = max ? `₱${min.toLocaleString()}–₱${max.toLocaleString()}` : `₱${min.toLocaleString()}+`;
      set("spBudgetVal", label);
      $("spBudgetVal")?.classList.add("active");
    });
  });

  // Toggle where section
  $("spWhere")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = false;
    $("sdBudgetSec").hidden = true;
    drop.hidden = !drop.hidden;
    if (!drop.hidden) lucide.createIcons();
  });

  // Toggle budget section
  $("spBudget")?.addEventListener("click", (e) => {
    e.stopPropagation();
    $("sdWhere").hidden = true;
    $("sdBudgetSec").hidden = false;
    drop.hidden = false;
    if (!drop.hidden) lucide.createIcons();
  });

  // Type pill just opens filter panel
  $("spType")?.addEventListener("click", (e) => {
    e.stopPropagation();
    drop.hidden = true;
    openFilterPanel();
  });

  // Apply search
  $("sdropSearch")?.addEventListener("click", () => {
    const min = parseInt($("sdMin")?.value) || 0;
    const max = parseInt($("sdMax")?.value) || 0;
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
    drop.hidden = true;
    state.mode = "filtered";
    applyFilters();
  });

  $("sdropClear")?.addEventListener("click", clearAll);
  $("searchBtn")?.addEventListener("click", () => { drop.hidden = true; state.mode = "filtered"; applyFilters(); });
}

function setupDropdownClose() {
  document.addEventListener("click", (e) => {
    const drop = $("searchDrop");
    if (drop && !drop.contains(e.target) && !$("searchPill")?.contains(e.target)) {
      drop.hidden = true;
    }
  });
}

/* ════════════════════════════════════════
   FILTER PANEL
════════════════════════════════════════ */
function setupFilterPanel() {
  $("filterToggle")?.addEventListener("click", openFilterPanel);
  $("fpClose")?.addEventListener("click", closeFilterPanel);
  $("filterOverlay")?.addEventListener("click", closeFilterPanel);

  // Type buttons
  document.querySelectorAll(".fp-type-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".fp-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // Toggle switches
  setupToggle("fpAvailToggle");
  setupToggle("fpTourToggle");

  $("fpReset")?.addEventListener("click", () => {
    document.querySelectorAll(".fp-type-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
    const fpMin = $("fpMin"); const fpMax = $("fpMax");
    if (fpMin) fpMin.value = "";
    if (fpMax) fpMax.value = "";
    $("fpAvailToggle")?.setAttribute("aria-checked", "false");
    $("fpTourToggle")?.setAttribute("aria-checked", "false");
  });

  $("fpApply")?.addEventListener("click", () => {
    // Collect from filter panel
    const activeType = document.querySelector(".fp-type-btn.active")?.dataset.type || "";
    const min = parseInt($("fpMin")?.value) || 0;
    const max = parseInt($("fpMax")?.value) || 0;
    const avail = $("fpAvailToggle")?.getAttribute("aria-checked") === "true";
    const tour = $("fpTourToggle")?.getAttribute("aria-checked") === "true";

    state.filters.type = activeType;
    state.filters.minPrice = min;
    state.filters.maxPrice = max;
    state.filters.availOnly = avail;
    state.filters.tourOnly = tour;

    // Sync category bar
    document.querySelectorAll(".cat-item").forEach(b => b.classList.toggle("active", b.dataset.type === activeType));

    // Update filter btn state
    const hasFilters = activeType || min || max || avail || tour;
    $("filterToggle")?.classList.toggle("active", !!hasFilters);

    closeFilterPanel();
    state.mode = "filtered";
    applyFilters();
  });
}

function setupToggle(id) {
  const btn = $(id);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const cur = btn.getAttribute("aria-checked") === "true";
    btn.setAttribute("aria-checked", (!cur).toString());
  });
}

function openFilterPanel() {
  $("filterPanel")?.classList.add("open");
  $("filterOverlay")?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeFilterPanel() {
  $("filterPanel")?.classList.remove("open");
  $("filterOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ════════════════════════════════════════
   APPLY FILTERS → FILTERED VIEW
════════════════════════════════════════ */
function applyFilters() {
  let results = [...state.all];

  if (state.filters.type)
    results = results.filter(l => (l.place_type || "").toLowerCase() === state.filters.type.toLowerCase());
  if (state.filters.city)
    results = results.filter(l => (l.city || "").toLowerCase().includes(state.filters.city.toLowerCase()));
  if (state.filters.minPrice)
    results = results.filter(l => (l.price || 0) >= state.filters.minPrice);
  if (state.filters.maxPrice)
    results = results.filter(l => (l.price || 0) <= state.filters.maxPrice);
  if (state.filters.availOnly)
    results = results.filter(l => l.available !== false);
  if (state.filters.tourOnly)
    results = results.filter(l => l.tour);

  showFilteredView(results);
}

function showFilteredView(results) {
  $("defaultView").hidden = true;
  $("emptyState").hidden = true;
  $("filteredView").hidden = false;

  if (!results.length) {
    $("filteredView").hidden = true;
    $("emptyState").hidden = false;
    $("esClear")?.addEventListener("click", clearAll, { once: true });
    return;
  }

  // Build title
  const parts = [];
  if (state.filters.type) parts.push(state.filters.type);
  if (state.filters.city) parts.push(`in ${state.filters.city}`);
  if (state.filters.maxPrice) parts.push(`under ₱${state.filters.maxPrice.toLocaleString()}`);
  const title = parts.length ? parts.join(" ") : "All listings";

  set("filteredTitle", title);
  set("filteredCount", `${results.length} listing${results.length !== 1 ? "s" : ""} found`);

  state.filteredPage = 0;
  renderFilteredCards(results, true);
}

function renderFilteredCards(results, reset) {
  const grid = $("listingGrid");
  if (!grid) return;
  const loadMoreWrap = $("loadMoreWrap");

  const next = results.slice(state.filteredPage, state.filteredPage + state.perPage);
  state.filteredPage += next.length;

  if (reset) grid.innerHTML = "";

  grid.insertAdjacentHTML("beforeend", next.map(l => gridCardHTML(l)).join(""));

  grid.querySelectorAll(".lcard[data-id]:not([data-bound])").forEach(card => {
    card.dataset.bound = "1";
    card.addEventListener("click", (e) => {
      if (e.target.closest(".lcard-save")) return;
      openDrawer(parseInt(card.dataset.id));
    });
    card.querySelector(".lcard-save")?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSave(parseInt(card.dataset.id), card.querySelector(".lcard-save"));
    });
  });

  if (loadMoreWrap) loadMoreWrap.hidden = state.filteredPage >= results.length;
  $("loadMoreBtn")?.addEventListener("click", () => renderFilteredCards(results, false), { once: true });

  lucide.createIcons();
}

function gridCardHTML(l) {
  return rowCardHTML(l).replace('class="lcard"', 'class="lcard grid-mode"');
}

function clearAll() {
  state.filters = { type: "", city: "", minPrice: 0, maxPrice: 0, availOnly: false, tourOnly: false };
  set("spWhereVal", "Search destinations"); $("spWhereVal")?.classList.remove("active");
  set("spTypeVal", "Any type");
  set("spBudgetVal", "Add budget"); $("spBudgetVal")?.classList.remove("active");
  document.querySelectorAll(".cat-item").forEach((b, i) => b.classList.toggle("active", i === 0));
  $("filterToggle")?.classList.remove("active");
  showDefaultView();
}

/* ════════════════════════════════════════
   SAVE / HEART
════════════════════════════════════════ */
function toggleSave(id, btn) {
  if (state.saved.has(id)) {
    state.saved.delete(id);
    btn?.classList.remove("saved");
  } else {
    state.saved.add(id);
    btn?.classList.add("saved");
    if (btn) { btn.style.transform = "scale(1.35)"; setTimeout(() => btn.style.transform = "", 200); }
  }
  localStorage.setItem("vista_saved", JSON.stringify([...state.saved]));
}

/* ════════════════════════════════════════
   DETAIL DRAWER
════════════════════════════════════════ */
function openDrawer(id) {
  const l = state.all.find(x => x.id === id);
  if (!l) return;

  const inner = $("ddInner");
  if (!inner) return;

  const allAmenities = [
    ...(l.amenities?.appliances || []),
    ...(l.amenities?.activities || []),
    ...(l.amenities?.safety || []),
  ];

  const hasTour = !!(l.tour_url || l.tour);
  const tourUrl = l.tour_url || null;

  // Check if current user is a verified student
  let isStudentVerified = false;
  try { isStudentVerified = window.AuthGuard?.getSession?.()?.user?.student_verified === true; } catch { }

  const discount = l.student_discount || 0;
  const showDiscount = isStudentVerified && discount > 0 && l.price;
  const discountedPrice = showDiscount ? Math.round(l.price * (1 - discount / 100)) : null;

  const price = l.price
    ? `<div>
        ${showDiscount
      ? `<div class="dd-price-num">₱${Number(discountedPrice).toLocaleString()}</div>
             <div class="dd-price-lbl" style="display:flex;gap:8px;align-items:center">
               <s style="color:var(--ink-35)">₱${Number(l.price).toLocaleString()}</s>
               <span style="background:rgba(34,197,94,.12);color:#166534;font-weight:700;font-size:10px;padding:2px 8px;border-radius:999px">
                 ${discount}% student discount
               </span>
             </div>`
      : `<div class="dd-price-num">₱${Number(l.price).toLocaleString()}</div>
             <div class="dd-price-lbl">${discount > 0 ? `<span style="font-size:11px;color:var(--navy);font-weight:700">${discount}% off for verified students</span>` : "per month"}</div>`
    }
      </div>`
    : `<div class="dd-price-num" style="font-size:18px">Price on request</div>`;

  // ── Media area: photo + optional tour tabs ──
  const mediaTabs = hasTour ? `
    <div class="dd-media-tabs">
      <button class="dd-mtab active" id="ddTabPhoto">
        <i data-lucide="image"></i> Photos
      </button>
      <button class="dd-mtab" id="ddTabTour">
        <i data-lucide="rotate-3d"></i> 360° Tour
      </button>
    </div>` : "";

  const photoPanel = l.cover
    ? `<img class="dd-photo" id="ddPhotoImg" src="${esc(l.cover)}" alt="${esc(l.title)}">`
    : `<div class="dd-photo-placeholder"><i data-lucide="home"></i></div>`;

  const tourPanel = hasTour ? `
    <div class="dd-tour-panel" id="ddTourPanel" hidden>
      <div class="dd-tour-loading" id="ddTourLoading">
        <div class="tour-spinner"></div>
        <span>Loading 360° view…</span>
      </div>
      <div id="ddPannellum" class="dd-pannellum-container"></div>
    </div>` : "";

  inner.innerHTML = `
    <div class="dd-topbar">
      <button class="dd-close" id="ddClose"><i data-lucide="x"></i></button>
      <span class="dd-close-label">${esc(l.place_type || "Room")}</span>
      ${hasTour ? `<span class="dd-tour-badge-sm"><i data-lucide="rotate-3d"></i>360° Available</span>` : ""}
    </div>

    <div class="dd-media-wrap">
      ${mediaTabs}
      <div class="dd-media-body">
        <div class="dd-photo-panel" id="ddPhotoPanel">${photoPanel}</div>
        ${tourPanel}
      </div>
    </div>

    <div class="dd-content">
      <div class="dd-tags">
        <span class="dd-tag">${esc(l.place_type || "Room")}</span>
        ${l.available !== false ? `<span class="dd-tag avail">Available now</span>` : ""}
        ${hasTour ? `<span class="dd-tag tour-tag"><i data-lucide="rotate-3d"></i>360° Tour</span>` : ""}
      </div>

      <h2 class="dd-title">${esc(l.title)}</h2>

      <div class="dd-loc">
        <i data-lucide="map-pin"></i>
        ${esc([l.barangay, l.city].filter(Boolean).join(", ") || "Caloocan")}
      </div>

      <div class="dd-price-row">
        <div>${price}</div>
        <button class="dd-book-btn" id="ddBook">Reserve now</button>
      </div>

      ${(l.capacity?.guests || l.capacity?.beds) ? `
        <div class="dd-specs">
          ${l.capacity.guests ? `<div class="dd-spec"><span class="dd-spec-n">${l.capacity.guests}</span><span class="dd-spec-l">Guests</span></div>` : ""}
          ${l.capacity.beds ? `<div class="dd-spec"><span class="dd-spec-n">${l.capacity.beds}</span><span class="dd-spec-l">Beds</span></div>` : ""}
          ${l.capacity.baths ? `<div class="dd-spec"><span class="dd-spec-n">${l.capacity.baths}</span><span class="dd-spec-l">Baths</span></div>` : ""}
        </div>` : ""}

      ${l.description ? `
        <div class="dd-sec">
          <div class="dd-sec-title">About this place</div>
          <p class="dd-desc">${esc(l.description)}</p>
        </div>` : ""}

      ${(l.highlights || []).length ? `
        <div class="dd-sec">
          <div class="dd-sec-title">Highlights</div>
          <div class="dd-highlights">${l.highlights.map(h => `<span class="dd-hl">${esc(h)}</span>`).join("")}</div>
        </div>` : ""}

      ${allAmenities.length ? `
        <div class="dd-sec">
          <div class="dd-sec-title">Amenities</div>
          <div class="dd-amenities">${allAmenities.map(a => `
            <div class="dd-amenity"><i data-lucide="check"></i>${esc(a)}</div>`).join("")}
          </div>
        </div>` : ""}
    </div>`;

  // ── Close ──
  $("ddClose")?.addEventListener("click", closeDrawer);
  $("ddBook")?.addEventListener("click", () => openBookingModal(l));

  // ── Photo / Tour tab switching ──
  if (hasTour) {
    let pannellumViewer = null;

    $("ddTabPhoto")?.addEventListener("click", () => {
      $("ddTabPhoto")?.classList.add("active");
      $("ddTabTour")?.classList.remove("active");
      $("ddPhotoPanel").hidden = false;
      $("ddTourPanel").hidden = true;
    });

    $("ddTabTour")?.addEventListener("click", () => {
      $("ddTabTour")?.classList.add("active");
      $("ddTabPhoto")?.classList.remove("active");
      $("ddPhotoPanel").hidden = true;
      $("ddTourPanel").hidden = false;

      // Init Pannellum only once
      if (!pannellumViewer) {
        initPannellum(tourUrl || l.cover, l.title);
      }
    });
  }

  // ── Open ──
  $("drawerOverlay")?.classList.add("open");
  $("detailDrawer")?.classList.add("open");
  $("detailDrawer")?.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lucide.createIcons();
}

/* ════════════════════════════════════════
   PANNELLUM 360° VIEWER
════════════════════════════════════════ */
function initPannellum(imageUrl, title) {
  const container = $("ddPannellum");
  const loadingEl = $("ddTourLoading");

  if (!container) return;

  // Load Pannellum CSS + JS dynamically (CDN, no install)
  if (!document.getElementById("pannellum-css")) {
    const link = document.createElement("link");
    link.id = "pannellum-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
    document.head.appendChild(link);
  }

  const loadViewer = () => {
    if (loadingEl) loadingEl.hidden = false;
    container.innerHTML = "";

    // eslint-disable-next-line no-undef
    window.pannellum.viewer(container, {
      type: "equirectangular",
      panorama: imageUrl,
      title: title,
      autoLoad: true,
      autoRotate: -2,
      compass: false,
      showZoomCtrl: true,
      showFullscreenCtrl: true,
      hfov: 100,
      strings: {
        loadButtonLabel: "Click to<br>Load Panorama",
        loadingLabel: "Loading 360° view…",
        bylineLabel: "VISTA-HR",
      },
      // Hide loading overlay once loaded
      onLoad: () => {
        if (loadingEl) loadingEl.hidden = true;
      },
      onError: (err) => {
        if (loadingEl) {
          loadingEl.innerHTML = `
            <div class="tour-error">
              <i data-lucide="camera-off"></i>
              <p>360° tour unavailable</p>
              <span>The panorama image could not be loaded.</span>
            </div>`;
          loadingEl.hidden = false;
          lucide.createIcons();
        }
        console.warn("Pannellum error:", err);
      }
    });
  };

  // Load Pannellum JS if not already loaded
  if (window.pannellum) {
    loadViewer();
  } else {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
    script.onload = loadViewer;
    script.onerror = () => {
      if (loadingEl) {
        loadingEl.innerHTML = `<div class="tour-error"><i data-lucide="wifi-off"></i><p>Failed to load viewer</p><span>Check your internet connection.</span></div>`;
        loadingEl.hidden = false;
        lucide.createIcons();
      }
    };
    document.head.appendChild(script);
  }
}

function closeDrawer() {
  $("drawerOverlay")?.classList.remove("open");
  $("detailDrawer")?.classList.remove("open");
  document.body.style.overflow = "";
}

function setupDrawerClose() {
  $("drawerOverlay")?.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrawer(); });
}

/* ════════════════════════════════════════
   URL PARAMS (open=id from landing page)
════════════════════════════════════════ */
function checkURLParams() {
  const p = new URLSearchParams(location.search);
  const openId = p.get("open");
  const city = p.get("city");
  const type = p.get("type");

  if (openId) {
    setTimeout(() => openDrawer(parseInt(openId)), 600);
  }

  if (city || type) {
    if (city) state.filters.city = city;
    if (type) state.filters.type = type;
    state.mode = "filtered";
    applyFilters();
  }
}

/* ════════════════════════════════════════
   BOOKING MODAL
════════════════════════════════════════ */
function openBookingModal(l) {
  const overlay = $("bmOverlay");
  const modal = $("bmModal");
  const listingEl = $("bmListing");
  const body = $("bmBody");
  const success = $("bmSuccess");
  const footer = $("bmFooter");
  const errorEl = $("bmError");

  if (!modal) return;

  // Reset state
  body.hidden = false;
  success.hidden = true;
  footer.hidden = false;
  errorEl.hidden = true;
  $("bmMoveIn").value = "";
  $("bmMessage").value = "";
  $("bmSubmit").disabled = false;
  $("bmSubmitLabel").hidden = false;
  $("bmSpinner").hidden = true;

  // Set min date to today
  const today = new Date().toISOString().split("T")[0];
  $("bmMoveIn").min = today;

  // Listing snapshot
  const photoEl = l.cover
    ? `<img class="bm-listing-photo" src="${esc(l.cover)}" alt="${esc(l.title)}">`
    : `<div class="bm-listing-photo-placeholder"><i data-lucide="home"></i></div>`;
  let bmStudentVerified = false;
  try { bmStudentVerified = window.AuthGuard?.getSession?.()?.user?.student_verified === true; } catch { }
  const bmDiscount = l.student_discount || 0;
  const bmDiscounted = bmStudentVerified && bmDiscount > 0 && l.price
    ? Math.round(l.price * (1 - bmDiscount / 100)) : null;

  const priceEl = l.price
    ? bmDiscounted
      ? `<div class="bm-listing-price" style="text-align:right">
           ₱${Number(bmDiscounted).toLocaleString()}<span>/mo</span>
           <div style="font-size:10px;color:#166534;font-weight:700;margin-top:2px">${bmDiscount}% student discount</div>
         </div>`
      : `<div class="bm-listing-price">₱${Number(l.price).toLocaleString()}<span>/mo</span></div>`
    : "";

  listingEl.innerHTML = `
    ${photoEl}
    <div class="bm-listing-info">
      <div class="bm-listing-title">${esc(l.title)}</div>
      <div class="bm-listing-meta">${esc(l.place_type || "Room")} · ${esc([l.barangay, l.city].filter(Boolean).join(", "))}</div>
    </div>
    ${priceEl}`;

  overlay.hidden = false;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  lucide.createIcons();

  // ── Submit ──
  const submitHandler = async () => {
    // Check email verification before allowing booking
    let sessionUser = null;
    try { sessionUser = window.AuthGuard?.getSession?.()?.user || null; } catch { }
    if (sessionUser && sessionUser.email_verified === false) {
      const email = encodeURIComponent(sessionUser.email || "");
      errorEl.textContent = "Please verify your email before booking.";
      errorEl.hidden = false;
      // Add a verify link inside the error
      errorEl.innerHTML = `Email not verified. <a href="/auth/verify-email.html?email=${email}&role=RESIDENT" style="color:inherit;font-weight:800;text-decoration:underline">Verify now →</a>`;
      return;
    }

    const moveIn = $("bmMoveIn").value || null;
    const message = $("bmMessage").value.trim() || null;

    $("bmSubmit").disabled = true;
    $("bmSubmitLabel").hidden = true;
    $("bmSpinner").hidden = false;
    errorEl.hidden = true;

    try {
      const res = await fetch(`${API}/bookings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: l.id, move_in_date: moveIn, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit booking request.");
      }

      // Show success
      body.hidden = true;
      footer.hidden = true;
      success.hidden = false;
      lucide.createIcons();

      // Auto-close after 3s
      setTimeout(closeBookingModal, 3000);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      $("bmSubmit").disabled = false;
      $("bmSubmitLabel").hidden = false;
      $("bmSpinner").hidden = true;
    }
  };

  // Use { once: true } to prevent duplicate handlers on re-open
  $("bmSubmit")?.addEventListener("click", submitHandler, { once: true });
  $("bmCancel")?.addEventListener("click", closeBookingModal, { once: true });
  $("bmClose")?.addEventListener("click", closeBookingModal, { once: true });
  $("bmOverlay")?.addEventListener("click", closeBookingModal, { once: true });
}

function closeBookingModal() {
  $("bmOverlay").hidden = true;
  $("bmModal").hidden = true;
  document.body.style.overflow = "";
}