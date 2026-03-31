// steps/step6_highlights.js

window.Step6Init = function Step6Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const MAX = 5;

    const HIGHLIGHTS = [
        { key: "PEACEFUL", label: "Peaceful", icon: "sparkles" },
        { key: "FAMILY_FRIENDLY", label: "Family-friendly", icon: "baby" },
        { key: "WORK_FRIENDLY", label: "Work-friendly", icon: "laptop" },
        { key: "NEAR_TRANSIT", label: "Near transit", icon: "train-front" },
        { key: "NEAR_MALLS", label: "Near malls", icon: "shopping-bag" },
        { key: "CITY_CENTER", label: "City center", icon: "building" },
        { key: "GREAT_VIEW", label: "Great view", icon: "binoculars" },
        { key: "FAST_WIFI", label: "Fast Wi-Fi", icon: "zap" },
        { key: "PET_FRIENDLY", label: "Pet-friendly", icon: "paw-print" },
        { key: "BUDGET_FRIENDLY", label: "Budget-friendly", icon: "badge-percent" },
        { key: "LUXE_FEEL", label: "Premium feel", icon: "sparkles" },
        { key: "SAFE_AREA", label: "Safe neighborhood", icon: "shield-check" },
        { key: "NEWLY_RENOVATED", label: "Newly renovated", icon: "paintbrush" },
        { key: "COZY", label: "Cozy", icon: "house" },
        { key: "SPACIOUS", label: "Spacious", icon: "expand" },
        { key: "BRIGHT", label: "Bright & airy", icon: "sun" },
        { key: "QUIET_NIGHTS", label: "Quiet nights", icon: "moon" },
        { key: "LONG_STAY", label: "Long-stay ready", icon: "calendar-days" },
        { key: "SELF_CHECKIN", label: "Self check-in", icon: "key-round" },
        { key: "WELL_EQUIPPED", label: "Well-equipped", icon: "check-circle-2" },
        { key: "CLEAN", label: "Very clean", icon: "sparkles" },
        { key: "NEAR_SCHOOLS", label: "Near schools", icon: "graduation-cap" },
        { key: "NEAR_HOSPITALS", label: "Near hospitals", icon: "heart-pulse" }
    ];

    const ICON_FALLBACK = {
        "badge-percent": "badge-check",
        "shield-check": "shield",
        "key-round": "key",
        "train-front": "train-front-tunnel"
    };

    const chipsEl = document.getElementById("hlChips");
    const countEl = document.getElementById("hlCount");
    const searchInput = document.getElementById("hlSearchInput");
    const searchClear = document.getElementById("hlSearchClear");

    if (!chipsEl) {
        console.error("[Step6] Missing #hlChips");
        return;
    }

    let q = "";

    const norm = (s) => String(s || "").toLowerCase().trim();

    function readSelected() {
        const d = ListingStore.readDraft();
        return Array.isArray(d.highlights) ? d.highlights : [];
    }

    function saveSelected(next) {
        ListingStore.saveDraft({ highlights: next });
    }

    function getIcon(name) {
        return ICON_FALLBACK[name] || name;
    }

    function chipMarkup(item, selected) {
        return `
<button
    class="hlChip hlChipMinimal ${selected ? "selected" : ""}"
    type="button"
    data-key="${item.key}"
    aria-pressed="${selected ? "true" : "false"}"
>
    <i class="hlIc" data-lucide="${getIcon(item.icon)}"></i>
    <span>${item.label}</span>
</button>
`;
    }

    function paintMeta(selected) {
        if (countEl) countEl.textContent = String(selected.length);
        if (nextBtn) nextBtn.disabled = selected.length < 1;

        SidePanel.setTips({
            selectedLabel: "Highlights",
            tips: [
                "Pick only what you can honestly support with photos and details.",
                "5 strong highlights beats 15 generic ones.",
                "You can edit these later from your dashboard."
            ]
        });
        SidePanel.refresh();

        if (searchClear) {
            searchClear.style.opacity = q ? "1" : ".35";
            searchClear.style.pointerEvents = q ? "auto" : "none";
        }
    }

    function bindEvents() {
        chipsEl.querySelectorAll(".hlChip").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;
                const current = new Set(readSelected());
                const wasOn = current.has(key);

                if (!wasOn && current.size >= MAX) {
                    btn.classList.add("shake");
                    setTimeout(() => btn.classList.remove("shake"), 220);
                    return;
                }

                if (wasOn) current.delete(key);
                else current.add(key);

                saveSelected(Array.from(current));
                render(key);
            });
        });
    }

    function render(animateKey = "") {
        const selected = readSelected();
        const selectedSet = new Set(selected);

        const filtered = HIGHLIGHTS
            .filter((item) => !q || norm(item.label).includes(q))
            .sort((a, b) => {
                const aSel = selectedSet.has(a.key) ? 1 : 0;
                const bSel = selectedSet.has(b.key) ? 1 : 0;
                if (aSel !== bSel) return bSel - aSel;
                return a.label.localeCompare(b.label);
            });

        chipsEl.innerHTML = filtered.length
            ? filtered.map((item) => chipMarkup(item, selectedSet.has(item.key))).join("")
            : `
<div class="hlEmpty">
    <div class="hlEmptyTitle">No results</div>
    <div class="hlEmptySub">Try a different keyword.</div>
</div>
`;

        bindEvents();

        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }

        if (animateKey) {
            const target = chipsEl.querySelector(`.hlChip[data-key="${animateKey}"]`);
            if (target) {
                target.classList.remove("animRun");
                void target.offsetWidth;
                target.classList.add("animRun");
                setTimeout(() => target.classList.remove("animRun"), 180);
            }
        }

        paintMeta(selected);
    }

    function setSearch(value) {
        q = norm(value);
        if (searchInput) searchInput.value = value;
        render();
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => setSearch(e.target.value));
    }

    if (searchClear) {
        searchClear.addEventListener("click", () => {
            setSearch("");
            if (searchInput) searchInput.focus();
        });
    }

    render();
};