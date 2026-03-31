// steps/step5_amenities.js

window.Step5Init = function Step5Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const TAB_META = {
        appliances: {
            title: "Essentials",
            hint: "Common home essentials guests expect."
        },
        activities: {
            title: "Comfort",
            hint: "Comfort and extras that improve the stay."
        },
        safety: {
            title: "Safety",
            hint: "Help guests feel safe and prepared."
        }
    };

    const OPTIONS = {
        appliances: [
            "Air conditioning",
            "Electric fan",
            "Refrigerator",
            "Microwave",
            "Rice cooker",
            "Electric kettle",
            "Induction stove",
            "Washing machine",
            "Water heater",
            "TV",
            "WiFi"
        ],

        activities: [
            "Swimming pool",
            "Gym",
            "Basketball court",
            "Playground",
            "Garden",
            "Rooftop access",
            "BBQ area",
            "Co-working space",
            "Function room"
        ],

        safety: [
            "24/7 security",
            "CCTV",
            "Fire extinguisher",
            "Smoke detector",
            "First aid kit",
            "Gated property",
            "Secure parking",
            "Elevator",
            "Backup generator"
        ]
    };

    // Use safe Lucide names only
    const DEFAULT_ICON = "sparkles";

    const LUCIDE_MAP = {
        "Air conditioning": "wind",
        "Electric fan": "fan",
        "Refrigerator": "refrigerator",
        "Microwave": "microwave",
        "Rice cooker": "cooking-pot",
        "Electric kettle": "kettle",
        "Induction stove": "flame",
        "Washing machine": "washing-machine",
        "Water heater": "flame",
        "TV": "tv",
        "WiFi": "wifi",

        "Swimming pool": "waves",
        "Gym": "dumbbell",
        "Basketball court": "dribbble",
        "Playground": "trees",
        "Garden": "leaf",
        "Rooftop access": "building-2",
        "BBQ area": "flame-kindling",
        "Co-working space": "laptop",
        "Function room": "door-open",

        "24/7 security": "shield",
        "CCTV": "cctv",
        "Fire extinguisher": "shield-alert",
        "Smoke detector": "siren",
        "First aid kit": "briefcase-medical",
        "Gated property": "gate",
        "Secure parking": "parking-circle",
        "Elevator": "arrow-up-down",
        "Backup generator": "battery-charging"
    };

    const ICON_ANIM_CLASSES = [
        "anim-wifi",
        "anim-wind",
        "anim-water",
        "anim-bounce",
        "anim-sway",
        "anim-rise",
        "anim-shield",
        "anim-car",
        "anim-fire",
        "anim-spin",
        "anim-default"
    ];

    const tabs = Array.from(document.querySelectorAll(".amenTab"));
    const indicator = document.getElementById("amenIndicator");
    const grid = document.getElementById("amenGrid");
    const titleEl = document.getElementById("amenTitle");
    const hintEl = document.getElementById("amenHint");
    const countEl = document.getElementById("amenCount");
    const searchInput = document.getElementById("amenSearchInput");
    const searchClear = document.getElementById("amenSearchClear");

    if (!grid || !tabs.length) {
        console.error("[Step5] Missing amenity UI elements (#amenGrid or .amenTab).");
        return;
    }

    let activeTab = "appliances";
    let searchQ = "";

    const norm = (s) => String(s || "").toLowerCase().trim();

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (m) => {
            const map = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                "\"": "&quot;",
                "'": "&#39;"
            };
            return map[m] || m;
        });
    }

    function toAmenityItem(label, index) {
        return {
            key: label,
            label,
            order: index
        };
    }

    function findKeywordIcon(label) {
        const l = norm(label);

        if (!l) return "";

        if (l.includes("wifi") || l.includes("internet")) return "wifi";
        if (l.includes("air") || l.includes("fan") || l.includes("cool")) return "wind";
        if (l.includes("refrigerator") || l.includes("fridge")) return "refrigerator";
        if (l.includes("microwave")) return "microwave";
        if (l.includes("rice") || l.includes("cook")) return "cooking-pot";
        if (l.includes("kettle")) return "kettle";
        if (l.includes("stove") || l.includes("bbq") || l.includes("heat")) return "flame";
        if (l.includes("wash") || l.includes("laundry")) return "washing-machine";
        if (l.includes("tv") || l.includes("television")) return "tv";

        if (l.includes("pool") || l.includes("water")) return "waves";
        if (l.includes("gym") || l.includes("fitness")) return "dumbbell";
        if (l.includes("basketball") || l.includes("court")) return "dribbble";
        if (l.includes("play")) return "trees";
        if (l.includes("garden") || l.includes("plant")) return "leaf";
        if (l.includes("roof") || l.includes("building")) return "building-2";
        if (l.includes("room") || l.includes("hall")) return "door-open";
        if (l.includes("work") || l.includes("laptop")) return "laptop";

        if (l.includes("security") || l.includes("shield")) return "shield";
        if (l.includes("camera") || l.includes("cctv")) return "cctv";
        if (l.includes("fire")) return "shield-alert";
        if (l.includes("smoke") || l.includes("alarm")) return "siren";
        if (l.includes("first aid") || l.includes("medical") || l.includes("aid")) return "briefcase-medical";
        if (l.includes("gate") || l.includes("door")) return "gate";
        if (l.includes("parking") || l.includes("car")) return "parking-circle";
        if (l.includes("elevator") || l.includes("lift")) return "arrow-up-down";
        if (l.includes("generator") || l.includes("battery") || l.includes("power")) return "battery-charging";

        return "";
    }

    function getAmenityIcon(label) {
        return LUCIDE_MAP[label] || findKeywordIcon(label) || DEFAULT_ICON;
    }

    function safeCreateLucideIcons() {
        try {
            if (window.lucide && typeof window.lucide.createIcons === "function") {
                window.lucide.createIcons();
            }
        } catch (err) {
            console.error("[Step5] lucide.createIcons failed:", err);
        }
    }

    function getIconAnimClass(amenityKey, iconName) {
        const key = norm(amenityKey);
        const icon = norm(iconName);

        if (icon.includes("wifi")) return "anim-wifi";

        if (icon.includes("wind") || icon.includes("fan")) return "anim-wind";

        if (icon.includes("waves")) return "anim-water";

        if (
            icon.includes("dumbbell") ||
            icon.includes("dribbble") ||
            icon.includes("trees")
        ) {
            return "anim-bounce";
        }

        if (icon.includes("leaf")) return "anim-sway";

        if (
            icon.includes("building") ||
            icon.includes("door-open") ||
            icon.includes("arrow-up-down")
        ) {
            return "anim-rise";
        }

        if (
            icon.includes("shield") ||
            icon.includes("cctv") ||
            icon.includes("siren") ||
            icon.includes("briefcase-medical") ||
            icon.includes("gate")
        ) {
            return "anim-shield";
        }

        if (icon.includes("parking") || icon.includes("car")) {
            return "anim-car";
        }

        if (
            icon.includes("flame") ||
            icon.includes("battery-charging") ||
            icon.includes("kettle") ||
            icon.includes("cooking-pot")
        ) {
            return "anim-fire";
        }

        if (icon.includes("washing-machine")) {
            return "anim-spin";
        }

        // fallback with some label hints
        if (key.includes("wifi")) return "anim-wifi";
        if (key.includes("air") || key.includes("fan")) return "anim-wind";
        if (key.includes("pool")) return "anim-water";

        return "anim-default";
    }

    function triggerAmenAnim(btn) {
        if (!btn) return;

        const icon = btn.dataset.icon || "";
        const iconEl = btn.querySelector(".card-ic");

        btn.classList.remove("animRun");
        void btn.offsetWidth;
        btn.classList.add("animRun");

        if (iconEl) {
            iconEl.classList.remove(...ICON_ANIM_CLASSES);
            void iconEl.offsetWidth;

            const anim = getIconAnimClass(btn.dataset.key || "", icon);
            iconEl.classList.add(anim);

            setTimeout(() => {
                iconEl.classList.remove(anim);
            }, 220);
        }

        setTimeout(() => {
            btn.classList.remove("animRun");
        }, 220);
    }

    function readAmenDraft() {
        const d = ListingStore.readDraft();
        const a = d.amenities || { appliances: [], activities: [], safety: [] };

        return {
            appliances: Array.isArray(a.appliances) ? a.appliances : [],
            activities: Array.isArray(a.activities) ? a.activities : [],
            safety: Array.isArray(a.safety) ? a.safety : []
        };
    }

    function saveAmenDraft(nextAmenities) {
        ListingStore.saveDraft({ amenities: nextAmenities });
    }

    function totalSelectedCount(a) {
        return a.appliances.length + a.activities.length + a.safety.length;
    }

    function setIndicatorTo(btn) {
        if (!indicator || !btn) return;

        const wrap = btn.parentElement.getBoundingClientRect();
        const r = btn.getBoundingClientRect();
        const left = r.left - wrap.left;

        indicator.style.width = `${r.width}px`;
        indicator.style.transform = `translateX(${left}px)`;
    }

    function updateCountAndNext() {
        const a = readAmenDraft();
        const total = totalSelectedCount(a);

        if (countEl) countEl.textContent = String(total);
        if (nextBtn) nextBtn.disabled = total < 1;

        if (SidePanel) {
            SidePanel.setTips({
                selectedLabel: "Amenities",
                tips: [
                    "Add essentials like Wi-Fi and aircon to match guest expectations.",
                    "Safety items increase trust and approval chances.",
                    "You can always update amenities later."
                ]
            });
            SidePanel.refresh();
        }
    }

    function renderTab(tabKey, animateKey = "") {
        activeTab = tabKey;

        tabs.forEach((t) => {
            const on = t.dataset.tab === tabKey;
            t.classList.toggle("isActive", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        });

        if (titleEl) titleEl.textContent = TAB_META[tabKey].title;
        if (hintEl) hintEl.textContent = TAB_META[tabKey].hint;

        const draft = readAmenDraft();
        const selectedSet = new Set(draft[tabKey]);

        const list = (OPTIONS[tabKey] || [])
            .map((label, index) => toAmenityItem(label, index))
            .filter((item) => !searchQ || norm(item.label).includes(searchQ))
            .sort((a, b) => {
                const aSel = selectedSet.has(a.key) ? 1 : 0;
                const bSel = selectedSet.has(b.key) ? 1 : 0;

                if (aSel !== bSel) return bSel - aSel;
                return a.order - b.order;
            });

        grid.innerHTML =
            list.map((item) => {
                const isSelected = selectedSet.has(item.key);
                const iconName = getAmenityIcon(item.label);

                return `
<button
    class="card amenCard${isSelected ? " selected" : ""}"
    type="button"
    data-key="${escapeHtml(item.key)}"
    data-icon="${escapeHtml(iconName)}"
    aria-pressed="${isSelected ? "true" : "false"}"
>
    <span class="amenIconWrap">
        <i data-lucide="${iconName}" class="card-ic amen-lucide" aria-hidden="true"></i>
    </span>
    <span class="label">${escapeHtml(item.label)}</span>
</button>
`;
            }).join("") || `
<div class="amenEmpty">
    <div class="amenEmptyTitle">No results</div>
    <div class="amenEmptySub">Try a different keyword.</div>
</div>
`;

        safeCreateLucideIcons();

        const activeBtn = tabs.find((t) => t.dataset.tab === tabKey);
        setIndicatorTo(activeBtn);
        updateCountAndNext();

        if (animateKey) {
            const nextBtnEl = Array.from(grid.querySelectorAll(".amenCard"))
                .find((card) => card.dataset.key === animateKey);

            if (nextBtnEl) triggerAmenAnim(nextBtnEl);
        }
    }

    function setSearch(value) {
        searchQ = norm(value);

        if (searchInput) searchInput.value = value;
        if (searchClear) {
            searchClear.style.opacity = searchQ ? "1" : ".35";
            searchClear.style.pointerEvents = searchQ ? "auto" : "none";
        }

        renderTab(activeTab);
    }

    grid.addEventListener("click", (e) => {
        const btn = e.target.closest(".amenCard");
        if (!btn || !grid.contains(btn)) return;

        const key = btn.dataset.key;
        const draft = readAmenDraft();
        const set = new Set(draft[activeTab]);

        if (set.has(key)) set.delete(key);
        else set.add(key);

        draft[activeTab] = Array.from(set);
        saveAmenDraft(draft);

        renderTab(activeTab, key);
    });

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            setSearch(e.target.value);
        });
    }

    if (searchClear) {
        searchClear.addEventListener("click", () => {
            setSearch("");
            searchInput.focus();
        });

        searchClear.style.opacity = ".35";
        searchClear.style.pointerEvents = "none";
    }

    tabs.forEach((btn) => {
        btn.addEventListener("click", () => {
            renderTab(btn.dataset.tab);
        });
    });

    renderTab(activeTab);
};