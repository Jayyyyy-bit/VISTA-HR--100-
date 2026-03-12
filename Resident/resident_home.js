document.addEventListener("DOMContentLoaded", async () => {
  // 1) Guard (only once)
  if (window.AuthGuard?.requireResident) {
    const ok = await window.AuthGuard.requireResident();
    if (!ok) return;
  }

  // 2) Header (who + logout)
  function setupHeader() {
    const whoEl = document.getElementById("who");
    const logoutBtn = document.getElementById("logoutBtn");

    // Show cached identity (kept in sync by /auth/me)
    const s = window.AuthGuard?.getSession?.();
    const user = s?.user || {};
    whoEl.textContent =
      user.email ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      "Resident";

    logoutBtn.addEventListener("click", () => {
      // Use your official logout flow
      if (window.AuthGuard?.logout) return window.AuthGuard.logout();

      // extreme fallback (shouldn’t happen)
      try { localStorage.removeItem("vista_session_user"); } catch { }
      window.location.href = "/auth/login.html";
    });
  }

  // 3) Page
  initResidentHome();
});

function setupHeader() {
  const whoEl = document.getElementById("who");
  const logoutBtn = document.getElementById("logoutBtn");

  // Try to display session identity if available
  let email = "";
  try {
    if (window.AuthGuard?.getSession) {
      const s = window.AuthGuard.getSession();
      email = s?.user?.email || s?.email || "";
    }
  } catch { }

  if (!email) {
    // fallback (common keys)
    const raw =
      localStorage.getItem("session") ||
      localStorage.getItem("vista_session") ||
      localStorage.getItem("auth") ||
      "";
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      email = parsed?.user?.email || parsed?.email || "";
    } catch { }
  }

  whoEl.textContent = email || "Resident";

  logoutBtn.addEventListener("click", () => {
    // Prefer guard logout if available
    try {
      if (window.AuthGuard?.logout) return window.AuthGuard.logout();
      if (window.AuthGuard?.clearSession) window.AuthGuard.clearSession();
    } catch { }

    // fallback clear
    ["session", "vista_session", "auth", "token", "access_token"].forEach(k => {
      try { localStorage.removeItem(k); } catch { }
    });

    window.location.href = "../../Login/login.html";
  });
}

function initResidentHome() {
  const grid = document.getElementById("grid");

  // Static demo cards for now (wire API later)
  const demo = [
    { id: 1, title: "Studio near CBD", city: "Makati", brgy: "Poblacion", price: 9500 },
    { id: 2, title: "Cozy room w/ Wi-Fi", city: "Quezon City", brgy: "Batasan Hills", price: 6500 },
    { id: 3, title: "1BR near MRT", city: "Mandaluyong", brgy: "Highway Hills", price: 12000 },
    { id: 4, title: "Bedspace for students", city: "Manila", brgy: "Sampaloc", price: 3500 },
    { id: 5, title: "Modern shared space", city: "Taguig", brgy: "Fort Bonifacio", price: 14000 },
    { id: 6, title: "Quiet stay w/ AC", city: "Pasig", brgy: "Kapitolyo", price: 9000 },
  ];

  function render(list) {
    grid.innerHTML = list
      .map(x => {
        const rating = `4.${Math.floor(Math.random() * 9) + 1}`;
        return `
          <a class="card card-link" href="/resident/listing/${x.id}" aria-label="View ${escapeHtml(x.title)}">
            <div class="thumb"></div>
            <div class="meta">
              <div class="kicker">
                <span>${escapeHtml(x.city)} • ${escapeHtml(x.brgy)}</span>
                <span>★ ${rating}</span>
              </div>
              <div class="h3">${escapeHtml(x.title)}</div>
              <div class="p">Safe, clean, and close to key locations. Message owner anytime.</div>
              <div class="price">₱${Number(x.price).toLocaleString()} / month</div>
            </div>
          </a>
        `;
      })
      .join("");
  }

  render(demo);

  document.getElementById("searchBtn").addEventListener("click", () => {
    const city = (document.getElementById("qCity").value || "").trim().toLowerCase();
    const maxB = Number((document.getElementById("qBudget").value || "").replace(/\D/g, "")) || Infinity;

    const filtered = demo.filter(x => {
      const okCity = !city || x.city.toLowerCase().includes(city);
      const okBudget = x.price <= maxB;
      return okCity && okBudget;
    });

    render(filtered);
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}