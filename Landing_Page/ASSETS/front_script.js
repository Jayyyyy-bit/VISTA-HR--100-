/* ============================================================
   VISTA-HR | Landing Page — Fullpage Slide Engine
============================================================ */

const API = "http://127.0.0.1:5000/api";
const PATHS = {
    login: "../../auth/login.html",
    signup: "../../Login_Register_Page/Signup/roles.html",
    residentHome: "../../Resident/resident_home.html",
    ownerDash: "../../Property-Owner/dashboard/property-owner-dashboard.html",
};

const MOCK = [
    {
        id: 1, title: "Morning Star Residence", city: "Caloocan", barangay: "Bagong Barrio", place_type: "Boarding House", price: 5500, available: true, tour: true, isNew: true,
        cover: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?auto=format&fit=crop&q=80&w=800"
    },
    {
        id: 2, title: "The Scholar's Nest", city: "Caloocan", barangay: "Grace Park", place_type: "Room", price: 4200, available: true, tour: true, units: 2,
        cover: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&q=80&w=800"
    },
    {
        id: 3, title: "Grand Loft Caloocan", city: "Caloocan", barangay: "Grace Park East", place_type: "Apartment", price: 8000, available: false, tour: false,
        cover: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&q=80&w=800"
    },
    {
        id: 4, title: "Safe Haven Dorms", city: "Caloocan", barangay: "Bagong Barrio", place_type: "Boarding House", price: 3500, available: true, tour: true,
        cover: "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&q=80&w=800"
    },
];

// ── Utils ──
function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function exitTo(url) {
    document.body.classList.add("page-exit");
    setTimeout(() => { window.location.href = url; }, 330);
}

/* ════════════════════════════════════════
   FULLPAGE ENGINE
════════════════════════════════════════ */
const fp = {
    current: 0,
    total: 5,
    isAnimating: false,
    touchStartY: 0,
    DARK_SLIDES: new Set([4]), // slide-navy indices

    init() {
        this.wrapper = document.getElementById("fpWrapper");
        this.slides = [...document.querySelectorAll(".fp-slide")];
        this.dots = [...document.querySelectorAll(".dot")];

        this.goTo(0, false); // activate first slide instantly

        // Mouse wheel
        window.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });

        // Touch
        window.addEventListener("touchstart", (e) => { this.touchStartY = e.touches[0].clientY; }, { passive: true });
        window.addEventListener("touchend", (e) => {
            const dy = this.touchStartY - e.changedTouches[0].clientY;
            if (Math.abs(dy) > 50) dy > 0 ? this.next() : this.prev();
        });

        // Keyboard
        window.addEventListener("keydown", (e) => {
            if (["ArrowDown", "PageDown", "Space"].includes(e.key)) { e.preventDefault(); this.next(); }
            if (["ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); this.prev(); }
        });

        // Dots
        this.dots.forEach(dot => {
            dot.addEventListener("click", () => this.goTo(parseInt(dot.dataset.section)));
        });

        // Nav data-goto
        document.querySelectorAll("[data-goto]").forEach(el => {
            el.addEventListener("click", (e) => { e.preventDefault(); this.goTo(parseInt(el.dataset.goto)); });
        });

        // Scroll cue
        document.getElementById("scrollHint")?.addEventListener("click", () => this.next());
    },

    onWheel(e) {
        // Allow normal scroll inside slide-1 (featured) if cards overflow
        const slide = this.slides[this.current];
        if (slide?.querySelector(".cards-grid")) {
            const inner = slide.querySelector(".slide-inner");
            if (inner && (inner.scrollHeight > inner.clientHeight)) {
                // Only go to next/prev if already at scroll boundary
                if (e.deltaY > 0 && inner.scrollTop + inner.clientHeight < inner.scrollHeight - 5) return;
                if (e.deltaY < 0 && inner.scrollTop > 5) return;
            }
        }
        e.preventDefault();
        if (this.isAnimating) return;
        if (e.deltaY > 40) this.next();
        if (e.deltaY < -40) this.prev();
    },

    next() { if (this.current < this.total - 1) this.goTo(this.current + 1); },
    prev() { if (this.current > 0) this.goTo(this.current - 1); },

    goTo(index, animate = true) {
        if (index < 0 || index >= this.total) return;
        if (this.isAnimating && animate) return;

        const from = this.current;
        this.current = index;
        this.isAnimating = animate;

        // Translate wrapper
        if (this.wrapper) {
            this.wrapper.style.transition = animate ? "transform 900ms cubic-bezier(0.76, 0, 0.24, 1)" : "none";
            this.wrapper.style.transform = `translateY(-${index * 100}svh)`;
        }

        // Active class on slides
        this.slides.forEach((s, i) => s.classList.toggle("is-active", i === index));

        // Dots
        this.dots.forEach((d, i) => d.classList.toggle("active", i === index));

        // Dark/light body class for nav + dots
        document.body.classList.toggle("dark-slide", this.DARK_SLIDES.has(index));

        // Re-init lucide after content changes
        if (animate) {
            setTimeout(() => {
                this.isAnimating = false;
                lucide.createIcons();
            }, 920);
        }
    }
};

/* ════════════════════════════════════════
   AUTH-AWARE NAV
════════════════════════════════════════ */
async function initAuth() {
    const loginBtn = document.getElementById("loginBtn");
    const startBtn = document.getElementById("getStartedBtn");

    // Default handlers
    loginBtn?.addEventListener("click", () => exitTo(PATHS.login));
    startBtn?.addEventListener("click", () => exitTo(PATHS.signup));
    document.getElementById("heroBrowseBtn")?.addEventListener("click", () => exitTo(PATHS.residentHome));
    document.getElementById("heroTourBtn")?.addEventListener("click", () => exitTo(PATHS.residentHome));
    document.getElementById("seeAllBtn")?.addEventListener("click", () => exitTo(PATHS.residentHome));
    document.getElementById("ownerCtaBtn")?.addEventListener("click", () => exitTo(PATHS.signup));
    document.getElementById("demoCta")?.addEventListener("click", () => exitTo(PATHS.login));

    // Check localStorage
    let session = null;
    try { session = JSON.parse(localStorage.getItem("vista_session_user")); } catch { }
    if (session?.user) patchNav(session.user, loginBtn, startBtn);

    // Verify with server
    try {
        const r = await fetch(`${API}/auth/me`, { credentials: "include" });
        if (r.ok) {
            const d = await r.json();
            if (d?.user) {
                localStorage.setItem("vista_session_user", JSON.stringify({ user: d.user }));
                patchNav(d.user, loginBtn, startBtn);
            }
        } else { localStorage.removeItem("vista_session_user"); }
    } catch { }
}

function patchNav(user, loginBtn, startBtn) {
    const role = user?.role || "";
    const name = user?.first_name || user?.email?.split("@")[0] || "User";
    const dest = role === "OWNER" ? PATHS.ownerDash : PATHS.residentHome;

    if (loginBtn) { loginBtn.textContent = `Hi, ${name}`; loginBtn.onclick = () => exitTo(dest); }
    if (startBtn) { startBtn.textContent = role === "OWNER" ? "Dashboard →" : "Browse →"; startBtn.onclick = () => exitTo(dest); }

    document.getElementById("heroBrowseBtn") && (document.getElementById("heroBrowseBtn").onclick = () => exitTo(dest));

    if (role === "OWNER") {
        const oc = document.getElementById("ownerCtaBtn");
        if (oc) { oc.textContent = "Go to Dashboard →"; oc.onclick = () => exitTo(PATHS.ownerDash); }
    }
}

/* ════════════════════════════════════════
   ANIMATED STATS
════════════════════════════════════════ */
function countUp(el, target, dur = 1100) {
    if (!el) return;
    const t0 = performance.now();
    const tick = (now) => {
        const p = Math.min((now - t0) / dur, 1);
        el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target).toLocaleString();
        if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

async function initStats() {
    let count = 0;
    try {
        const r = await fetch(`${API}/listings/feed?limit=60`, { credentials: "include" });
        if (r.ok) { const d = await r.json(); count = (d.listings || []).length; }
    } catch { count = 24; }

    // Trigger when hero becomes active (it's first, so on load)
    const fire = () => {
        countUp(document.getElementById("statListings"), Math.max(count, 8));
        countUp(document.getElementById("statOwners"), Math.max(Math.floor(count * 0.6), 5), 1300);
    };

    // Fire after a short delay so the user sees the animation
    setTimeout(fire, 1200);
}

/* ════════════════════════════════════════
   LIVE FEATURED LISTINGS
════════════════════════════════════════ */
async function initListings() {
    const grid = document.getElementById("featuredGrid");
    if (!grid) return;

    // Skeleton
    grid.innerHTML = Array.from({ length: 4 }, () => `
    <article class="listing listing-skeleton">
      <div class="listing-img sk-img"></div>
      <div class="listing-body" style="padding:14px 16px 16px">
        <div class="sk-line sk-title" style="margin-bottom:12px"></div>
        <div class="sk-line sk-meta"></div>
        <div class="sk-line sk-status"></div>
      </div>
    </article>`).join("");

    let data = [];
    try {
        const r = await fetch(`${API}/listings/feed?limit=8`, { credentials: "include" });
        if (r.ok) { const d = await r.json(); data = (d.listings || []).slice(0, 4); }
    } catch { }

    if (!data.length) data = MOCK;

    grid.innerHTML = data.map(cardHTML).join("");

    grid.querySelectorAll(".listing[data-id]").forEach(card => {
        card.addEventListener("click", (e) => {
            if (e.target.closest(".tour-btn")) return;
            exitTo(PATHS.residentHome + `?open=${card.dataset.id}`);
        });
    });

    lucide.createIcons();
}

function cardHTML(l) {
    const price = l.price
        ? `<span class="price">₱${Number(l.price).toLocaleString()}<span>/mo</span></span>`
        : `<span class="price" style="font-size:12px;color:var(--ink-60)">On request</span>`;
    const loc = [l.barangay, l.city].filter(Boolean).join(", ") || "Caloocan";
    const img = l.cover
        ? `<img src="${esc(l.cover)}" alt="${esc(l.title)}" loading="lazy">`
        : `<div style="width:100%;height:100%;background:var(--beige-lt)"></div>`;
    const status = l.available !== false
        ? `<div class="status available"><span></span>${l.units ? `${l.units} units left` : "Available now"}</div>`
        : `<div class="status booked">Fully booked</div>`;

    return `
    <article class="listing" data-id="${l.id}">
      <div class="listing-img">
        ${img}
        ${l.isNew ? `<span class="tag">New</span>` : ""}
        ${l.tour !== false ? `<button class="tour-btn" title="360° Tour"><i data-lucide="rotate-3d"></i></button>` : ""}
      </div>
      <div class="listing-body">
        <div class="listing-top"><h3>${esc(l.title)}</h3>${price}</div>
        <p class="meta"><i data-lucide="map-pin"></i> ${esc(loc)}</p>
        ${status}
      </div>
    </article>`;
}

/* ════════════════════════════════════════
   HERO VISUAL TILT
════════════════════════════════════════ */
function initTilt() {
    const card = document.getElementById("visualCard");
    if (!card) return;
    card.addEventListener("mousemove", (e) => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -7;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 9;
        card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    card.addEventListener("mouseleave", () => { card.style.transform = ""; });
}

/* ════════════════════════════════════════
   BOOT
════════════════════════════════════════ */
lucide.createIcons();
fp.init();
initAuth();
initStats();
initListings();
initTilt();