document.addEventListener("DOMContentLoaded", async () => {
  if (window.AuthGuard?.requireResident) {
    const ok = await window.AuthGuard.requireResident();
    if (!ok) return;
  }

  setupHeader();
  initResidentHome();
});

function setupHeader() {
  const whoEl = document.getElementById("who");
  const logoutBtn = document.getElementById("logoutBtn");

  let user = null;

  try {
    if (window.AuthGuard?.getSession) {
      const s = window.AuthGuard.getSession();
      user = s?.user || null;
    }
  } catch { }

  const displayName =
    user?.email ||
    [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
    "Resident";

  if (whoEl) whoEl.textContent = displayName;

  logoutBtn?.addEventListener("click", async () => {
    try {
      if (window.AuthGuard?.logout) {
        await window.AuthGuard.logout();
        return;
      }
    } catch { }

    try {
      if (window.AuthGuard?.clearSession) {
        window.AuthGuard.clearSession();
      }
    } catch { }

    [
      "vista_session_user",
      "vista_last_user_id",
      "session",
      "vista_session",
      "auth",
      "token",
      "access_token"
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch { }
    });

    try {
      await fetch("http://127.0.0.1:5000/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } catch { }

    window.location.replace("/Login_Register_Page/index.html");
  });
}

function initResidentHome() {
  const grid = document.getElementById("grid");

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

  document.getElementById("searchBtn")?.addEventListener("click", () => {
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