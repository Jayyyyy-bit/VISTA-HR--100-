// steps/step6.js

window.Step6Init = function Step6Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const MAX = 5;

    const HIGHLIGHTS = [
        { key: "PEACEFUL", label: "Peaceful", icon: "sparkles" },
        { key: "FAMILY_FRIENDLY", label: "Family-friendly", icon: "baby" },
        { key: "WORK_FRIENDLY", label: "Work-friendly", icon: "laptop" },
        { key: "NEAR_TRANSIT", label: "Near transit", icon: "train" },
        { key: "NEAR_MALLS", label: "Near malls", icon: "shopping-bag" },
        { key: "CITY_CENTER", label: "City center", icon: "building" },
        { key: "GREAT_VIEW", label: "Great view", icon: "binoculars" },
        { key: "FAST_WIFI", label: "Fast Wi-Fi", icon: "zap" },
        { key: "PET_FRIENDLY", label: "Pet-friendly", icon: "paw-print" },
        { key: "BUDGET_FRIENDLY", label: "Budget-friendly", icon: "badge-percent" },
        { key: "LUXE_FEEL", label: "Premium feel", icon: "gem" },
        { key: "SAFE_AREA", label: "Safe neighborhood", icon: "shield-check" },
        { key: "NEWLY_RENOVATED", label: "Newly renovated", icon: "paintbrush" },
        { key: "COZY", label: "Cozy", icon: "sofa" },
        { key: "SPACIOUS", label: "Spacious", icon: "expand" },
        { key: "BRIGHT", label: "Bright & airy", icon: "sun" },
        { key: "QUIET_NIGHTS", label: "Quiet nights", icon: "moon" },
        { key: "LONG_STAY", label: "Long-stay ready", icon: "calendar-days" },
        { key: "SELF_CHECKIN", label: "Self check-in", icon: "key" },
        { key: "WELL_EQUIPPED", label: "Well-equipped", icon: "check-circle-2" },
        { key: "CLEAN", label: "Very clean", icon: "sparkles" },
        { key: "NEAR_SCHOOLS", label: "Near schools", icon: "graduation-cap" },
        { key: "NEAR_HOSPITALS", label: "Near hospitals", icon: "heart-pulse" },
    ];

    const ICON_FALLBACK = {
        gem: "sparkles",
        sofa: "home",
        "shield-check": "shield",
        "badge-percent": "badge-check",
    };

    const chipsEl = document.getElementById("hlChips");
    const countEl = document.getElementById("hlCount");
    const searchInput = document.getElementById("hlSearchInput");
    const searchClear = document.getElementById("hlSearchClear");

    if (!chipsEl) {
        console.error("[Step6] #hlChips not found.");
        return;
    }

    let q = "";
    const norm = (s) => (s || "").toLowerCase().trim();

    function readSelected() {
        const d = ListingStore.readDraft();
        return Array.isArray(d.highlights) ? d.highlights : [];
    }

    function saveSelected(arr) {
        ListingStore.saveDraft({ highlights: arr });
    }

    function paintCount(selectedArr) {
        if (countEl) countEl.textContent = String(selectedArr.length);
        if (nextBtn) nextBtn.disabled = selectedArr.length < 1;

        SidePanel.setTips({
            selectedLabel: "Highlights",
            tips: [
                "Pick only what you can honestly support with photos and details.",
                "5 strong highlights beats 15 generic ones.",
                "You can edit these later from your dashboard.",
            ],
        });
        SidePanel.refresh();
    }

    function render() {
        const selected = new Set(readSelected());
        const list = HIGHLIGHTS.filter((h) => !q || norm(h.label).includes(q));

        chipsEl.innerHTML = list
            .map((h) => {
                const on = selected.has(h.key);
                const icon = ICON_FALLBACK[h.icon] || h.icon;
                return `
          <button class="hlChip ${on ? "selected" : ""}" type="button" data-key="${h.key}">
            <i class="hlIc" data-lucide="${icon}"></i>
            <span>${h.label}</span>
          </button>
        `;
            })
            .join("");

        if (window.lucide?.createIcons) window.lucide.createIcons();

        chipsEl.querySelectorAll(".hlChip").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;
                const current = new Set(readSelected());

                const wasOn = current.has(key);

                if (!wasOn && current.size >= MAX) {
                    btn.classList.add("shake");
                    setTimeout(() => btn.classList.remove("shake"), 240);
                    return;
                }

                if (wasOn) current.delete(key);
                else current.add(key);

                const arr = Array.from(current);
                saveSelected(arr);

                btn.classList.toggle("selected");
                paintCount(arr);
            });
        });

        paintCount(Array.from(selected));
    }

    function setSearch(v) {
        q = norm(v);
        if (searchInput) searchInput.value = v;
        if (searchClear) searchClear.style.opacity = q ? "1" : ".35";
        render();
    }

    if (searchInput) searchInput.addEventListener("input", (e) => setSearch(e.target.value));
    if (searchClear) searchClear.addEventListener("click", () => setSearch(""));

    // initial render
    render();

    // ✅ Sync Step 6 to backend on Next

};
