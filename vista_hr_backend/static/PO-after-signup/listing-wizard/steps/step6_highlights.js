// ============================================================
//  VISTA-HR · steps/step6_highlights.js
//  Loads highlights from API instead of hardcoded array.
//  Supports custom highlight creation by PO with autofill.
// ============================================================

window.Step6Init = function Step6Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const MAX = 5;

    // ── State ──────────────────────────────────────────────
    let HIGHLIGHTS = []; // loaded from API
    let q = "";

    // ── DOM refs ───────────────────────────────────────────
    const chipsEl = document.getElementById("hlChips");
    const countEl = document.getElementById("hlCount");
    const searchInput = document.getElementById("hlSearchInput");
    const searchClear = document.getElementById("hlSearchClear");

    if (!chipsEl) { console.error("[Step6] Missing #hlChips"); return; }

    // ── Helpers ────────────────────────────────────────────
    const norm = s => String(s || "").toLowerCase().trim();
    const esc = s => String(s).replace(/[&<>"']/g, m =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] || m
    );

    function itemKey(item) {
        // Use DB id as key if available, else key string
        return String(item.id || item.key || item.label);
    }

    function readSelected() {
        const d = ListingStore.readDraft();
        return Array.isArray(d.highlights) ? d.highlights : [];
    }

    function saveSelected(next) {
        ListingStore.saveDraft({ highlights: next });
    }

    // ── Load from API ──────────────────────────────────────
    async function loadHighlights() {
        chipsEl.innerHTML = `<div style="padding:32px;text-align:center;color:#9ca3af;font-size:13px;">
            <i data-lucide="loader-2" style="animation:spin 1s linear infinite;width:20px;height:20px;display:block;margin:0 auto 8px"></i>
            Loading highlights…
        </div>`;
        if (window.lucide?.createIcons) lucide.createIcons();

        try {
            const res = await fetch("/api/highlights", { credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Failed to load");

            HIGHLIGHTS = data.highlights || [];

            // Cache id → { label, icon } globally so step 10 preview can resolve IDs → labels
            window._hlCache = new Map(HIGHLIGHTS.map(h => [h.id, { label: h.label, icon: h.icon || "star" }]));

            render();
        } catch (err) {
            console.error("[Step6] loadHighlights failed:", err);
            chipsEl.innerHTML = `<div style="padding:32px;text-align:center;color:#ef4444;font-size:13px;">
                Failed to load highlights.
                <button onclick="loadHighlights()" style="color:#123458;font-weight:700;background:none;border:none;cursor:pointer">Retry</button>
            </div>`;
        }
    }

    // ── Render ─────────────────────────────────────────────
    function render(animateKey = "") {
        const selected = readSelected();
        const selectedSet = new Set(selected);

        const filtered = HIGHLIGHTS
            .filter(item => !q || norm(item.label).includes(q))
            .sort((a, b) => {
                const aS = selectedSet.has(itemKey(a)) ? 1 : 0;
                const bS = selectedSet.has(itemKey(b)) ? 1 : 0;
                if (aS !== bS) return bS - aS;
                return (a.sort_order || 0) - (b.sort_order || 0);
            });

        chipsEl.innerHTML = filtered.length
            ? filtered.map(item => {
                const key = itemKey(item);
                const isSelected = selectedSet.has(key);
                const icon = item.icon || "sparkles";
                const isCustom = !item.is_system;
                return `<button
                    class="hlChip hlChipMinimal${isSelected ? " selected" : ""}"
                    type="button"
                    data-key="${esc(key)}"
                    aria-pressed="${isSelected}">
                    <i class="hlIc" data-lucide="${esc(icon)}"></i>
                    <span>${esc(item.label)}</span>
                    ${isCustom ? '<span style="font-size:9px;color:#6366f1;font-weight:700;margin-left:2px">✦</span>' : ""}
                </button>`;
            }).join("")
            : `<div class="hlEmpty"><div class="hlEmptyTitle">No results</div><div class="hlEmptySub">Try a different keyword.</div></div>`;

        // Add custom highlight button
        chipsEl.innerHTML += `<button class="hlChip hlChipMinimal hlChip--add" type="button" id="addCustomHlBtn"
            style="border-style:dashed;opacity:.7">
            <i class="hlIc" data-lucide="plus-circle"></i>
            <span>Add custom</span>
        </button>`;

        if (window.lucide?.createIcons) lucide.createIcons();

        // Bind chip clicks
        chipsEl.querySelectorAll(".hlChip:not(.hlChip--add)").forEach(btn => {
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

        // Bind add custom button
        document.getElementById("addCustomHlBtn")?.addEventListener("click", () => {
            openCustomModal();
        });

        // Animate
        if (animateKey) {
            const target = chipsEl.querySelector(`.hlChip[data-key="${CSS.escape(animateKey)}"]`);
            if (target) {
                target.classList.add("animRun");
                setTimeout(() => target.classList.remove("animRun"), 180);
            }
        }

        paintMeta(readSelected());
    }

    function paintMeta(selected) {
        if (countEl) countEl.textContent = String(selected.length);
        if (nextBtn) nextBtn.disabled = selected.length < 1;
        if (searchClear) {
            searchClear.style.opacity = q ? "1" : ".35";
            searchClear.style.pointerEvents = q ? "auto" : "none";
        }
        if (SidePanel) {
            SidePanel.setTips({
                selectedLabel: "Highlights",
                tips: [
                    "Pick only what you can honestly support with photos and details.",
                    "5 strong highlights beats 15 generic ones.",
                    "Can't find yours? Add a custom highlight below!",
                ]
            });
            SidePanel.refresh();
        }
    }

    // ── Search ─────────────────────────────────────────────
    searchInput?.addEventListener("input", e => {
        q = norm(e.target.value);
        render();
    });

    searchClear?.addEventListener("click", () => {
        q = "";
        if (searchInput) searchInput.value = "";
        render();
        searchInput?.focus();
    });

    // ── Custom highlight modal ─────────────────────────────
    function openCustomModal() {
        const existing = document.getElementById("customHlModal");
        if (existing) existing.remove();

        const modal = document.createElement("div");
        modal.id = "customHlModal";
        modal.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:20px";
        modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:24px;width:min(400px,100%);box-shadow:0 20px 60px rgba(0,0,0,.2)">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:4px">Add custom highlight</h3>
            <p style="font-size:12px;color:#6b7280;margin-bottom:16px">You can use this immediately. Admin will review for system-wide use.</p>

            <label style="font-size:12px;font-weight:700;display:block;margin-bottom:4px">Highlight name</label>
            <input id="customHlInput" type="text" placeholder="e.g. Near the beach, Rooftop view…"
                style="width:100%;padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;margin-bottom:8px;outline:none;font-family:inherit">

            <!-- Autofill suggestions -->
            <div id="customHlSuggestions" style="display:none;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:16px;overflow:hidden;max-height:160px;overflow-y:auto"></div>

            <div style="display:flex;gap:10px;justify-content:flex-end">
                <button id="customHlCancel" type="button"
                    style="padding:9px 18px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
                    Cancel
                </button>
                <button id="customHlSave" type="button"
                    style="padding:9px 18px;border-radius:8px;background:#123458;color:#fff;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
                    Add highlight
                </button>
            </div>
        </div>`;

        document.body.appendChild(modal);

        const input = document.getElementById("customHlInput");
        const suggestBox = document.getElementById("customHlSuggestions");
        const saveBtn = document.getElementById("customHlSave");
        const cancelBtn = document.getElementById("customHlCancel");

        const close = () => modal.remove();
        cancelBtn.addEventListener("click", close);
        modal.addEventListener("click", e => { if (e.target === modal) close(); });

        // Autofill suggestions
        let timer = null;
        input.addEventListener("input", () => {
            clearTimeout(timer);
            const v = input.value.trim();
            if (v.length < 2) { suggestBox.style.display = "none"; return; }
            timer = setTimeout(async () => {
                try {
                    const res = await fetch(`/api/amenities/search?q=${encodeURIComponent(v)}&type=highlight`, { credentials: "include" });
                    const data = await res.json().catch(() => ({}));
                    const suggs = data.suggestions || [];
                    if (!suggs.length) { suggestBox.style.display = "none"; return; }
                    suggestBox.style.display = "block";
                    suggestBox.innerHTML = suggs.map(s =>
                        `<div data-label="${esc(s.label)}"
                            style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid #f5f5f5">
                            ${esc(s.label)}
                            ${s.is_system ? "" : '<span style="font-size:10px;color:#6366f1;margin-left:4px">custom</span>'}
                        </div>`
                    ).join("");
                    suggestBox.querySelectorAll("[data-label]").forEach(el => {
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
            if (!label) { input.style.borderColor = "#ef4444"; input.focus(); return; }

            // Check max
            if (readSelected().length >= MAX) {
                alert(`You can only select up to ${MAX} highlights.`);
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = "Adding…";

            try {
                const res = await fetch("/api/highlights", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        label,
                        key: label.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, ""),
                        icon: "sparkles",
                    }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || "Failed");

                const newItem = data.highlight;

                // Add to local list + update global cache
                if (!HIGHLIGHTS.find(x => itemKey(x) === String(newItem.id))) {
                    HIGHLIGHTS.push(newItem);
                }
                if (!window._hlCache) window._hlCache = new Map();
                window._hlCache.set(newItem.id, { label: newItem.label, icon: newItem.icon || "star" });

                // Auto-select
                const current = new Set(readSelected());
                current.add(itemKey(newItem));
                saveSelected(Array.from(current));

                close();
                render(itemKey(newItem));

                if (window.showToast) showToast(`"${label}" added! ✓`);

            } catch (err) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Add highlight";
                alert(err.message || "Failed to add highlight.");
            }
        });

        input.focus();
    }

    // ── Init ───────────────────────────────────────────────
    loadHighlights();
};