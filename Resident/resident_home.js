(() => {
    const LS_SESSION_KEY = "vista_session_user";

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        localStorage.removeItem(LS_SESSION_KEY);
        window.location.href = "../Login_Register_Page/login.html";
    });

    //  feed (replace later with backend)
    a(async () => {
        const API = "http://127.0.0.1:5000/api";
        const root = document.getElementById("sections");

        function card(item) {
            const img = item.cover || "https://via.placeholder.com/800x600?text=No+Photo";
            const loc = [item.barangay, item.city].filter(Boolean).join(", ") || "Metro Manila";
            const price = item.price ? `₱${Number(item.price).toLocaleString()}` : "₱—";

            return `
      <a class="card" href="#">
        <div class="cardImgWrap"><img src="${img}" alt=""></div>
        <div class="cardBody">
          <div class="cardTitle">${item.title}</div>
          <div class="cardSub">${loc}</div>
          <div class="cardMeta">
            <span class="price">${price}</span>
            <span>·</span>
            <span>★ 4.8</span>
          </div>
        </div>
      </a>
    `;
        }

        async function loadFeed() {
            const res = await fetch(`${API}/listings/feed`, { cache: "no-store" });
            const data = await res.json().catch(() => ({}));
            return Array.isArray(data.listings) ? data.listings : [];
        }

        const items = await loadFeed();

        root.innerHTML = `
    <section class="section">
      <div class="sectionHeader">
        <h2>Available Spaces</h2>
      </div>
      <div class="row">
        ${items.length ? items.map(card).join("") : `<div style="padding:10px;color:#666;">No published listings yet.</div>`}
      </div>
    </section>
  `;
    })();



    const root = document.getElementById("sections");

    function card(item) {
        return `
      <a class="card" href="#">
        <div class="cardImgWrap"><img src="${item.image}" alt=""></div>
        <div class="cardBody">
          <div class="cardTitle">${item.title}</div>
          <div class="cardSub">${item.location}</div>
          <div class="cardMeta">
            <span class="price">₱${Number(item.price).toLocaleString()}</span>
            <span>·</span>
            <span>★ ${item.rating}</span>
          </div>
        </div>
      </a>
    `;
    }

    function render() {
        root.innerHTML = "";

        demoData.forEach((sec, idx) => {
            const rowId = `row_${idx}`;
            const section = document.createElement("section");
            section.className = "section";

            section.innerHTML = `
        <div class="sectionHeader">
          <h2>${sec.title}</h2>
          <div class="navBtns">
            <button type="button" data-dir="-1" data-row="${rowId}">‹</button>
            <button type="button" data-dir="1" data-row="${rowId}">›</button>
          </div>
        </div>
        <div class="row" id="${rowId}">
          ${sec.items.map(card).join("")}
        </div>
      `;

            root.appendChild(section);
        });

        root.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-row]");
            if (!btn) return;
            const row = document.getElementById(btn.dataset.row);
            if (!row) return;
            const dir = Number(btn.dataset.dir);
            row.scrollBy({ left: dir * 650, behavior: "smooth" });
        });
    }

    render();

    const seen = localStorage.getItem("vista_resident_guide_seen");
    if (!seen) {
        window.location.href = "./quick_guide.html";
    }

})();
