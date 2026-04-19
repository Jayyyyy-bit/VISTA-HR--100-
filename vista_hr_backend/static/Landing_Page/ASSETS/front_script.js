/* ============================================================
   VISTA-HR | Landing Page — Fullpage Slide Engine
============================================================ */

const API = "/api";
const PATHS = {
    login: "/auth/login.html",
    signup: "/Login_Register_Page/Signup/roles.html",
    residentHome: "/Resident/resident_home.html",
    ownerDash: "/Property-Owner/dashboard/property-owner-dashboard.html",
};


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
    total: 6,
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
                // Re-render hero map tiles when slide 0 becomes visible
                if (index === 0 && _heroMap) _heroMap.invalidateSize();
            }, 920);
        }
    }
};

/* ════════════════════════════════════════
   AUTH-AWARE NAV
════════════════════════════════════════ */
async function initAuth() {
    const nextParam = new URLSearchParams(location.search).get("next");
    if (nextParam) sessionStorage.setItem("loadingDest", nextParam);

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
    document.getElementById("helpNavBtn")?.addEventListener("click", () => fp.goTo(5));

    // Check localStorage first
    // Check localStorage first (optimistic render)
    // Check localStorage first (optimistic render while server verifies)
    let session = null;
    try { session = JSON.parse(localStorage.getItem("vista_session_user")); } catch { }
    if (session?.user) patchNav(session.user, loginBtn, startBtn);

    // Verify with server — always authoritative
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const r = await fetch(`${API}/auth/me`, { credentials: "include", signal: controller.signal });
        clearTimeout(timeout);

        if (r.ok) {
            const d = await r.json();
            if (d?.user) {
                localStorage.setItem("vista_session_user", JSON.stringify({ user: d.user }));
                patchNav(d.user, loginBtn, startBtn);
            }
        } else {
            localStorage.removeItem("vista_session_user");
        }
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
    // Check cache first (5 minute TTL)
    const cached = localStorage.getItem("vista_stats_cache");
    const cacheTime = localStorage.getItem("vista_stats_cache_time");
    const now = Date.now();

    let totalListings = 0;
    let totalOwners = 0;
    let totalCities = 0;
    let totalUsers = 0;

    if (cached && cacheTime && (now - parseInt(cacheTime)) < 60 * 1000) {
        // Use cached data
        try {
            const d = JSON.parse(cached);
            totalListings = d.totalListings || 0;
            totalOwners = d.totalOwners || 0;
            totalUsers = d.totalUsers || 0;
        } catch { }
    } else {
        // Fetch data in parallel
        try {
            const results = await Promise.allSettled([
                fetch(`${API}/public/stats`).then(r => r.ok ? r.json() : null),
                fetch(`${API}/listings/feed?limit=60`).then(r => r.ok ? r.json() : null)
            ]);
            const [statsRes, feedRes] = results.map(r => r.status === 'fulfilled' ? r.value : null);
            console.log('statsRes:', statsRes);
            console.log('totalUsers:', totalUsers);

            if (statsRes) {
                totalListings = statsRes.total_listings || 0;
                totalOwners = statsRes.total_owners || 0;
                totalUsers = (statsRes.total_owners || 0) + (statsRes.total_residents || 0);
            }
            if (feedRes?.listings) {
                const cities = new Set(feedRes.listings.map(l => l.city).filter(Boolean));
                totalCities = cities.size;
            }

            // Cache results
            localStorage.setItem("vista_stats_cache", JSON.stringify({ totalListings, totalOwners, totalCities, totalUsers }));
            localStorage.setItem("vista_stats_cache_time", String(now));
        } catch { }
    }

    const fire = () => {
        countUp(document.getElementById("statListings"), totalListings);
        countUp(document.getElementById("statOwners"), totalOwners, 1300);
        countUp(document.getElementById("statUsers"), totalUsers, 1300);
        const citiesEl = document.getElementById("statCities");
        if (citiesEl) {
            citiesEl.textContent = totalCities > 0 ? `${totalCities}+` : "—";
        }
    };

    setTimeout(fire, 1200);
}

/* ════════════════════════════════════════
   LIVE FEATURED LISTINGS
════════════════════════════════════════ */
async function initListings() {
    const grid = document.getElementById("featuredGrid");
    if (!grid) return;

    // Check cache first (10 minute TTL)
    const cached = localStorage.getItem("vista_listings_cache");
    const cacheTime = localStorage.getItem("vista_listings_cache_time");
    const now = Date.now();

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

    // Try cache first
    if (cached && cacheTime && (now - parseInt(cacheTime)) < 10 * 60 * 1000) {
        try {
            data = JSON.parse(cached);
        } catch { }
    }

    // If no cache, fetch (with timeout)
    if (!data.length) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);
            const r = await fetch(`${API}/listings/feed?limit=30`, { credentials: "include", signal: controller.signal });
            clearTimeout(timeout);

            if (r.ok) {
                const d = await r.json();
                data = d.listings || [];
                // Cache results
                localStorage.setItem("vista_listings_cache", JSON.stringify(data));
                localStorage.setItem("vista_listings_cache_time", String(now));
            }
        } catch { }
    }

    if (!data.length) {
        grid.innerHTML = `
        <div style="grid-column:1/-1;padding:48px 24px;text-align:center;color:var(--ink-40)">
            <div style="font-size:14px;font-weight:600">No listings published yet.</div>
            <div style="font-size:13px;margin-top:6px">Be the first to list your space.</div>
        </div>`;
        return;
    }

    grid.innerHTML = (data.slice(0, 4)).map(cardHTML).join("");

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
    const loc = [l.barangay, l.city].filter(Boolean).join(", ") || "Metro Manila";
    const img = l.cover
        ? `<img src="${esc(l.cover)}" alt="${esc(l.title)}" loading="lazy">`
        : `<div style="width:100%;height:100%;background:var(--beige-lt);display:flex;align-items:center;justify-content:center;color:#bbb"><i data-lucide="home" style="width:32px;height:32px"></i></div>`;

    // All listings from feed are available (reserved ones are now excluded server-side)
    const status = `<div class="status available"><span></span>Available now</div>`;

    const typeLabel = l.place_type
        ? `<span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-40);margin-bottom:4px;display:block">${esc(l.place_type)}</span>`
        : "";

    return `
    <article class="listing" data-id="${l.id}">
      <div class="listing-img">
        ${img}
        <span class="tag new-tag">Available</span>
        ${l.has_tour ? `<button class="tour-btn" title="360° Tour"><i data-lucide="rotate-3d"></i></button>` : ""}
      </div>
      <div class="listing-body">
        ${typeLabel}
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
   360° PANORAMA VIEWER
════════════════════════════════════════ */
function initPanorama() {
    if (typeof pannellum === 'undefined') return;
    pannellum.viewer('panorama', {
        "type": "equirectangular",
        "panorama": "https://pannellum.org/images/alma.jpg",
        "autoLoad": true,
        "showControls": false,
        "mouseZoom": false,
        "compass": false,
        "hotSpots": []
    });
}

function initTourPanorama() {
    if (typeof pannellum === 'undefined') return;
    pannellum.viewer('tourPanorama', {
        "type": "equirectangular",
        "panorama": "https://pannellum.org/images/bma-1.jpg",
        "autoLoad": true,
        "showControls": true,
        "mouseZoom": true,
        "compass": false,
        "autoRotate": -2,
        "hotSpots": []
    });
}

/* ════════════════════════════════════════
   HERO MAP — Leaflet + OpenStreetMap
════════════════════════════════════════ */
let _heroMap = null;

function initHeroMap() {
    const mapEl = document.getElementById("heroMap");
    if (!mapEl || !window.L) return;

    _heroMap = L.map("heroMap", {
        center: [14.6042, 120.9822],
        zoom: 13,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
    }).addTo(_heroMap);

    const pinIcon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#1B3F6E;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.25);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
    });

    setTimeout(() => _heroMap.invalidateSize(), 300);
    _loadMapPins(pinIcon);
}

async function _loadMapPins(pinIcon) {
    if (!_heroMap) return;

    const redPin = L.divIcon({
        className: '',
        html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
                fill="#EA4335" stroke="#c0392b" stroke-width="1"/>
            <circle cx="14" cy="14" r="5.5" fill="#fff"/>
        </svg>`,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -38]
    });

    try {
        const r = await fetch(`${API}/listings/feed?limit=60`);
        if (!r.ok) return;
        const d = await r.json();
        const listings = d.listings || [];

        const bounds = [];
        let pinCount = 0;

        listings.forEach(l => {
            const loc = l.location || {};
            // Try all possible key names used across the codebase
            const lat = parseFloat(loc.lat ?? loc.latitude ?? loc.Lat ?? 0);
            const lng = parseFloat(loc.lng ?? loc.longitude ?? loc.lon ?? loc.Lng ?? 0);
            console.log("[HeroMap]", l.title, "→ lat:", lat, "lng:", lng, "raw:", JSON.stringify(loc));
            if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

            const price = l.price ? `₱${Number(l.price).toLocaleString()}/mo` : "";
            const area = [l.barangay, l.city].filter(Boolean).join(", ");

            L.marker([lat, lng], { icon: redPin })
                .addTo(_heroMap)
                .bindPopup(`
                    <div style="font-family:'DM Sans',sans-serif;min-width:150px;padding:2px 0;">
                        <div style="font-weight:700;font-size:13px;color:#0A0A0A;margin-bottom:2px;">${esc(l.title || "Listing")}</div>
                        ${area ? `<div style="font-size:11px;color:#666;margin-bottom:4px;">${esc(area)}</div>` : ""}
                        ${price ? `<div style="font-weight:700;font-size:13px;color:#1B3F6E;">${price}</div>` : ""}
                    </div>
                `, { maxWidth: 200 });

            bounds.push([lat, lng]);
            pinCount++;
        });

        const badge = document.getElementById("mapListingCount");
        if (badge) badge.textContent = pinCount || listings.length;

        _heroMap.setView([14.5995, 120.9842], 12);

    } catch (e) {
        console.warn("[HeroMap] failed to load pins", e);
    }
}

/* ════════════════════════════════════════
   BOOT
════════════════════════════════ */
async function bootPage() {
    lucide.createIcons();
    fp.init();
    initTilt();
    initHeroMap();
    initTourPanorama();
    await initAuth();

    // Deferred init (after page is interactive)
    setTimeout(() => {
        initStats();
        initListings();
    }, 100);
}

// Initial load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootPage);
} else {
    bootPage();
}

// Handle back button (page restoration from history)
window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
        // Page was restored from back-forward cache
        bootPage();
    }
});

/* ════════════════════════════════════════
   FAQ ACCORDION — SLIDE 5
════════════════════════════════════════ */
(function initFAQ() {
    const FAQS = [
        { q: "How do I create an account?", a: "Click Sign up on the login page. Choose your role — Resident or Property Owner — fill in your details, then verify your email using the OTP sent to your inbox.", tag: "all" },
        { q: "What is KYC verification and why do I need it?", a: "KYC verifies your identity using a government-issued ID and a selfie. Residents must complete it before booking. Property Owners must complete it before publishing a listing.", tag: "all" },
        { q: "How do I list my property?", a: "After completing KYC, go to your Owner Dashboard and use the listing wizard. It walks you through property details, photos, capacity, amenities, and pricing across 10 steps.", tag: "owner" },
        { q: "How do I book a room?", a: "Browse listings from the home page, open a listing you like, and click Reserve. You can only have one active booking at a time (Pending, Approved, or Active).", tag: "resident" },
        { q: "What happens after I submit a booking request?", a: "Your request enters Pending status. The property owner reviews it and either approves or rejects it. You'll receive a notification either way.", tag: "resident" },
        { q: "How do I submit payment proof?", a: "Go to My Bookings, open your approved booking, and tap Upload Payment Proof. The image uploads directly and is sent to the owner for review.", tag: "resident" },
        { q: "Can I get a student discount?", a: "Yes. Go to Account Settings → Verification and toggle 'I am a student'. Upload your School ID and Certificate of Registration. Once approved, the discount applies automatically on eligible listings.", tag: "resident" },
        { q: "How do I move out early?", a: "Go to My Bookings and tap Move Out on your active booking. This initiates a cancellation and records your move-out date.", tag: "resident" },
        { q: "How do I message a property owner?", a: "Open any listing and use the message button. All conversations are in your Messages tab, with inbox and archived views.", tag: "all" },
        { q: "How do I file a support ticket?", a: "Log in and go to Help & Support from your dashboard. Describe your issue and submit — admins will reply and you'll get a notification on every update.", tag: "all" },
    ];

    const TAG_LABEL = { all: "General", owner: "Property Owners", resident: "Residents" };
    const TAG_CLASS = { all: "faq-tag-all", owner: "faq-tag-owner", resident: "faq-tag-resident" };

    const list = document.getElementById("faqList");
    if (!list) return;

    FAQS.forEach((f, i) => {
        const item = document.createElement("div");
        item.className = "faq-item";
        item.innerHTML = `
            <button class="faq-q" aria-expanded="false" aria-controls="faq-ans-${i}">
                <span>${f.q}</span>
                <span class="faq-icon" aria-hidden="true"></span>
            </button>
            <div class="faq-a" id="faq-ans-${i}" role="region">
                <div class="faq-a-inner">
                    <span class="faq-tag ${TAG_CLASS[f.tag]}">${TAG_LABEL[f.tag]}</span>
                    ${f.a}
                </div>
            </div>`;

        item.querySelector(".faq-q").addEventListener("click", () => {
            const isOpen = item.classList.contains("faq-open");
            list.querySelectorAll(".faq-item.faq-open").forEach(el => {
                el.classList.remove("faq-open");
                el.querySelector(".faq-q").setAttribute("aria-expanded", "false");
            });
            if (!isOpen) {
                item.classList.add("faq-open");
                item.querySelector(".faq-q").setAttribute("aria-expanded", "true");
            }
        });

        list.appendChild(item);
    });

    // ── Feedback section ──────────────────────────────────────
    // ── Feedback section ──────────────────────────────────────
    (function () {
        const API = "/api";

        async function loadFeedback() {
            const grid = document.getElementById("feedbackGrid");
            if (!grid) return;
            try {
                const res = await fetch(`${API}/feedback?limit=6`);
                const data = await res.json();
                const items = data.feedback || [];

                if (!items.length) {
                    grid.innerHTML = `<div class="feedback-empty">No feedback yet.</div>`;
                    return;
                }

                grid.innerHTML = items.map((f, i) => {
                    const stars = f.rating
                        ? `<div class="fb-card-stars">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</div>`
                        : "";
                    const initials = (f.name?.[0] || "?").toUpperCase();
                    const roleLabel = f.role ? `<span class="fb-card-role">${esc(f.role)}</span>` : "";
                    const avatarHtml = f.avatar_url
                        ? `<img src="${esc(f.avatar_url)}" alt="${esc(f.name)}" class="fb-card-av-img">`
                        : initials;
                    return `<div class="fb-card" style="animation-delay:${i * 80}ms">
                    <div class="fb-card-top">
                        <div class="fb-card-av">${avatarHtml}</div>
                        <div>
                            <div class="fb-card-name">${esc(f.name)}</div>
                            ${roleLabel}
                        </div>
                        ${stars}
                    </div>
                    <p class="fb-card-msg">"${esc(f.message)}"</p>
                </div>`;
                }).join("");

            } catch {
                grid.innerHTML = `<div class="feedback-empty">Could not load feedback.</div>`;
            }
        }

        function esc(s) {
            return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        }

        loadFeedback();
    })();


})();