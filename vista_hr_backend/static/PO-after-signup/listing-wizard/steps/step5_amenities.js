// ============================================================
//  VISTA-HR · steps/step5_amenities.js
//  Loads amenities from API instead of hardcoded arrays.
//  Supports custom amenity creation by PO with autofill.
// ============================================================

window.Step5Init = function Step5Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const TAB_META = {
        appliances: { title: "Essentials", hint: "Common home essentials guests expect." },
        activities: { title: "Comfort", hint: "Comfort and extras that improve the stay." },
        safety: { title: "Safety", hint: "Help guests feel safe and prepared." },
    };

    const DEFAULT_ICON = "sparkles";

    // ── State ──────────────────────────────────────────────
    let activeTab = "appliances";
    let searchQ = "";
    let OPTIONS = { appliances: [], activities: [], safety: [] }; // loaded from API
    let isLoaded = false;

    // ── DOM refs ───────────────────────────────────────────
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

    // ── Helpers ────────────────────────────────────────────
    const norm = s => String(s || "").toLowerCase().trim();
    const esc = s => String(s).replace(/[&<>"']/g, m =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] || m
    );

    function findKeywordIcon(label) {
        const l = norm(label);
        if (l.includes("wifi") || l.includes("internet")) return "wifi";
        if (l.includes("air") || l.includes("cool")) return "wind";
        if (l.includes("fan")) return "fan";
        if (l.includes("fridge") || l.includes("refrigerator")) return "refrigerator";
        if (l.includes("microwave")) return "microwave";
        if (l.includes("rice") || l.includes("cook")) return "cooking-pot";
        if (l.includes("kettle")) return "zap";
        if (l.includes("stove") || l.includes("induction")) return "flame";
        if (l.includes("wash") || l.includes("laundry")) return "washing-machine";
        if (l.includes("water heater") || l.includes("heater")) return "flame";
        if (l.includes("tv") || l.includes("television")) return "tv";
        if (l.includes("pool") || l.includes("swim")) return "waves";
        if (l.includes("gym") || l.includes("fitness")) return "dumbbell";
        if (l.includes("basketball") || l.includes("court")) return "dribbble";
        if (l.includes("playground") || l.includes("play")) return "trees";
        if (l.includes("garden") || l.includes("plant")) return "leaf";
        if (l.includes("roof")) return "building";
        if (l.includes("bbq") || l.includes("grill")) return "flame-kindling";
        if (l.includes("work") || l.includes("laptop")) return "laptop";
        if (l.includes("function") || l.includes("hall")) return "users";
        if (l.includes("security")) return "shield";
        if (l.includes("cctv") || l.includes("camera")) return "camera";
        if (l.includes("fire extinguish")) return "flame-kindling";
        if (l.includes("smoke")) return "bell-ring";
        if (l.includes("first aid") || l.includes("medical")) return "cross";
        if (l.includes("gate") || l.includes("gated")) return "door-open";
        if (l.includes("parking") || l.includes("car")) return "car";
        if (l.includes("elevator") || l.includes("lift")) return "arrow-up";
        if (l.includes("generator") || l.includes("power")) return "zap";
        return DEFAULT_ICON;
    }

    function getIcon(item) {
        return item.icon || findKeywordIcon(item.label) || DEFAULT_ICON;
    }

    // ── Load from API ──────────────────────────────────────
    async function loadAmenities() {
        grid.innerHTML = `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px;">
            <i data-lucide="loader-2" style="animation:spin 1s linear infinite;width:20px;height:20px;margin-bottom:8px;display:block;margin-inline:auto"></i>
            Loading amenities…
        </div>`;
        if (window.lucide?.createIcons) lucide.createIcons();

        try {
            const res = await fetch("/api/amenities", { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to load");

            OPTIONS = data.amenities || { appliances: [], activities: [], safety: [] };
            isLoaded = true;
            renderTab(activeTab);
        } catch (err) {
            console.error("[Step5] loadAmenities failed:", err);
            grid.innerHTML = `<div style="padding:32px;text-align:center;color:#ef4444;font-size:13px;">
                Failed to load amenities. <button onclick="loadAmenities()" style="color:#123458;font-weight:700;background:none;border:none;cursor:pointer">Retry</button>
            </div>`;
        }
    }

    // ── Draft helpers ──────────────────────────────────────
    function readAmenDraft() {
        const d = ListingStore.readDraft();
        const a = d.amenities || {};
        return {
            appliances: Array.isArray(a.appliances) ? a.appliances : [],
            activities: Array.isArray(a.activities) ? a.activities : [],
            safety: Array.isArray(a.safety) ? a.safety : [],
        };
    }

    function totalSelected(a) {
        return a.appliances.length + a.activities.length + a.safety.length;
    }

    function setIndicatorTo(btn) {
        if (!indicator || !btn) return;
        const wrap = btn.parentElement.getBoundingClientRect();
        const r = btn.getBoundingClientRect();
        indicator.style.width = `${r.width}px`;
        indicator.style.transform = `translateX(${r.left - wrap.left}px)`;
    }

    function updateCount() {
        const a = readAmenDraft();
        const total = totalSelected(a);
        if (countEl) countEl.textContent = String(total);
        if (nextBtn) nextBtn.disabled = total < 1;
        if (SidePanel) {
            SidePanel.setTips({
                selectedLabel: "Amenities",
                tips: [
                    "Add essentials like Wi-Fi and aircon to match guest expectations.",
                    "Safety items increase trust and approval chances.",
                    "Can't find an amenity? Add a custom one below!",
                ]
            });
            SidePanel.refresh();
        }
    }

    // ── Render tab ─────────────────────────────────────────
    function renderTab(tabKey, animateKey = "") {
        activeTab = tabKey;

        tabs.forEach(t => {
            const on = t.dataset.tab === tabKey;
            t.classList.toggle("isActive", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        });

        if (titleEl) titleEl.textContent = TAB_META[tabKey]?.title || tabKey;
        if (hintEl) hintEl.textContent = TAB_META[tabKey]?.hint || "";

        const draft = readAmenDraft();
        const selectedSet = new Set(draft[tabKey]);
        const list = (OPTIONS[tabKey] || [])
            .filter(item => !searchQ || norm(item.label).includes(searchQ))
            .sort((a, b) => {
                const aS = selectedSet.has(String(a.id || a.label)) ? 1 : 0;
                const bS = selectedSet.has(String(b.id || b.label)) ? 1 : 0;
                if (aS !== bS) return bS - aS;
                return (a.sort_order || 0) - (b.sort_order || 0);
            });

        // Key used for selection — use id if from API, else label
        const itemKey = item => String(item.id || item.label);

        grid.innerHTML = list.map(item => {
            const key = itemKey(item);
            const isSelected = selectedSet.has(key);
            const iconName = getIcon(item);
            const isCustom = !item.is_system;

            return `<button
                class="card amenCard${isSelected ? " selected" : ""}"
                type="button"
                data-key="${esc(key)}"
                data-icon="${esc(iconName)}"
                aria-pressed="${isSelected}"
            >
                <span class="amenIconWrap">
                    <i data-lucide="${esc(iconName)}" class="card-ic amen-lucide" aria-hidden="true"></i>
                </span>
                <span class="label">${esc(item.label)}</span>
                ${isCustom ? '<span style="font-size:9px;color:#6366f1;font-weight:700;margin-top:2px">CUSTOM</span>' : ""}
            </button>`;
        }).join("") + `
        <!-- Add custom amenity row -->
        <button class="card amenCard amenCard--add" type="button" id="addCustomAmenBtn"
            style="border-style:dashed;opacity:.7">
            <span class="amenIconWrap">
                <i data-lucide="plus-circle" class="card-ic" aria-hidden="true"></i>
            </span>
            <span class="label">Add custom</span>
        </button>`;

        if (window.lucide?.createIcons) lucide.createIcons();

        const activeBtn = tabs.find(t => t.dataset.tab === tabKey);
        setIndicatorTo(activeBtn);
        updateCount();

        // Animate selected item
        if (animateKey) {
            const el = grid.querySelector(`[data-key="${CSS.escape(animateKey)}"]`);
            if (el) {
                el.classList.add("animRun");
                setTimeout(() => el.classList.remove("animRun"), 220);
            }
        }

        // Wire custom add button
        document.getElementById("addCustomAmenBtn")?.addEventListener("click", () => {
            openCustomModal(tabKey);
        });
    }

    // ── Grid click — toggle selection ─────────────────────
    grid.addEventListener("click", e => {
        const btn = e.target.closest(".amenCard:not(.amenCard--add)");
        if (!btn) return;

        const key = btn.dataset.key;
        const draft = readAmenDraft();
        const set = new Set(draft[activeTab]);

        if (set.has(key)) set.delete(key);
        else set.add(key);

        draft[activeTab] = Array.from(set);
        ListingStore.saveDraft({ amenities: draft });
        renderTab(activeTab, key);
    });

    // ── Search ─────────────────────────────────────────────
    searchInput?.addEventListener("input", e => {
        searchQ = norm(e.target.value);
        if (searchClear) {
            searchClear.style.opacity = searchQ ? "1" : ".35";
            searchClear.style.pointerEvents = searchQ ? "auto" : "none";
        }
        renderTab(activeTab);
    });

    searchClear?.addEventListener("click", () => {
        searchQ = "";
        if (searchInput) searchInput.value = "";
        searchClear.style.opacity = ".35";
        searchClear.style.pointerEvents = "none";
        renderTab(activeTab);
        searchInput?.focus();
    });

    tabs.forEach(btn => btn.addEventListener("click", () => renderTab(btn.dataset.tab)));

    // ── Custom amenity modal ───────────────────────────────
    function openCustomModal(category) {
        const existing = document.getElementById("customAmenModal");
        if (existing) existing.remove();

        const modal = document.createElement("div");
        modal.id = "customAmenModal";
        modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px";
        modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:min(420px,100%);box-shadow:0 20px 60px rgba(0,0,0,.2)">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:4px">Add custom amenity</h3>
            <p style="font-size:12px;color:#6b7280;margin-bottom:16px">You can use this immediately. Admin will review for system-wide use.</p>

            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Amenity name</label>
            <input id="customAmenInput" type="text" placeholder="e.g. Bathtub, Piano, Sauna…"
                style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;margin-bottom:8px;outline:none;font-family:inherit">

            <!-- Autofill suggestions -->
            <div id="customAmenSuggestions" style="display:none;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;overflow:hidden;max-height:160px;overflow-y:auto"></div>

            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Category</label>
            <select id="customAmenCategory"
                style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;margin-bottom:16px;font-family:inherit">
                <option value="appliances"${category === "appliances" ? " selected" : ""}>Essentials / Appliances</option>
                <option value="activities"${category === "activities" ? " selected" : ""}>Comfort / Activities</option>
                <option value="safety"${category === "safety" ? " selected" : ""}>Safety</option>
            </select>

            <div style="display:flex;gap:10px;justify-content:flex-end">
                <button id="customAmenCancel" type="button"
                    style="padding:9px 18px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
                    Cancel
                </button>
                <button id="customAmenSave" type="button"
                    style="padding:9px 18px;border-radius:8px;background:#123458;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
                    Add amenity
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);

        const input = document.getElementById("customAmenInput");
        const suggestBox = document.getElementById("customAmenSuggestions");
        const saveBtn = document.getElementById("customAmenSave");
        const cancelBtn = document.getElementById("customAmenCancel");

        const close = () => modal.remove();
        cancelBtn.addEventListener("click", close);
        modal.addEventListener("click", e => { if (e.target === modal) close(); });

        // Autofill suggestions
        let suggestTimer = null;
        input.addEventListener("input", () => {
            clearTimeout(suggestTimer);
            const q = input.value.trim();
            if (q.length < 2) { suggestBox.style.display = "none"; return; }
            suggestTimer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/amenities/search?q=${encodeURIComponent(q)}&type=amenity`, { credentials: "include" });
                    const data = await res.json().catch(() => ({}));
                    const suggs = data.suggestions || [];
                    if (!suggs.length) { suggestBox.style.display = "none"; return; }
                    suggestBox.style.display = "block";
                    suggestBox.innerHTML = suggs.map(s =>
                        `<div class="amen-suggest-item" data-label="${esc(s.label)}"
                            style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5;hover:background:#f9fafb">
                            ${esc(s.label)}
                            ${s.is_system ? '' : '<span style="font-size:10px;color:#6366f1;margin-left:4px">custom</span>'}
                        </div>`
                    ).join("");
                    suggestBox.querySelectorAll(".amen-suggest-item").forEach(el => {
                        el.addEventListener("click", () => {
                            input.value = el.dataset.label;
                            suggestBox.style.display = "none";
                        });
                    });
                } catch { }
            }, 300);
        });

        // Save
        saveBtn.addEventListener("click", async () => {
            const label = input.value.trim();
            const category = document.getElementById("customAmenCategory").value;
            if (!label) { input.style.borderColor = "#ef4444"; input.focus(); return; }

            saveBtn.disabled = true;
            saveBtn.textContent = "Adding…";

            try {
                const res = await fetch("/api/amenities", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ label, category, icon: findKeywordIcon(label) }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed");

                const newItem = data.amenity;

                // Add to local OPTIONS so it shows immediately
                if (!OPTIONS[category]) OPTIONS[category] = [];
                if (!OPTIONS[category].find(x => String(x.id) === String(newItem.id))) {
                    OPTIONS[category].push(newItem);
                }

                // Auto-select it
                const draft = readAmenDraft();
                const set = new Set(draft[category]);
                set.add(String(newItem.id || newItem.label));
                draft[category] = Array.from(set);
                ListingStore.saveDraft({ amenities: draft });

                close();
                renderTab(category);

                // Show toast if available
                if (window.showToast) showToast(`"${label}" added and selected! ✓`);

            } catch (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Add amenity";
                alert(err.message || "Failed to add amenity.");
            }
        });

        input.focus();
    }

    // ── Init ───────────────────────────────────────────────
    loadAmenities();
};