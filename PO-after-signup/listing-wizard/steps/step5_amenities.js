// steps/step5.js

window.Step5Init = function Step5Init({ nextBtn }) {
    const { ListingStore, SidePanel } = window;

    const TAB_META = {
        appliances: { title: "Appliances", hint: "Common home essentials guests expect." },
        activities: { title: "Activities", hint: "Comfort and extras that improve the stay." },
        safety: { title: "Safety items", hint: "Help guests feel safe and prepared." }
    };

    const OPTIONS = {
        appliances: [
            { key: "WIFI", label: "Wi-Fi", icon: "wifi" },
            { key: "AIRCON", label: "Aircon", icon: "snowflake" },
            { key: "FAN", label: "Electric fan", icon: "wind" },
            { key: "TV", label: "TV", icon: "tv" },
            { key: "CABLE_TV", label: "Cable TV", icon: "tv-2" },
            { key: "STREAMING", label: "Streaming", icon: "play-circle" },
            { key: "REFRIGERATOR", label: "Refrigerator", icon: "archive" },
            { key: "MICROWAVE", label: "Microwave", icon: "zap" },
            { key: "RICE_COOKER", label: "Rice cooker", icon: "utensils" },
            { key: "ELECTRIC_KETTLE", label: "Electric kettle", icon: "cup-soda" },
            { key: "COFFEE_MAKER", label: "Coffee maker", icon: "coffee" },
            { key: "STOVE", label: "Stove / cooktop", icon: "flame" },
            { key: "OVEN", label: "Oven", icon: "box" },
            { key: "TOASTER", label: "Toaster", icon: "square" },
            { key: "KITCHEN", label: "Kitchen", icon: "utensils-crossed" },
            { key: "COOKWARE", label: "Cookware", icon: "utensils" },
            { key: "DISHES", label: "Dishes & utensils", icon: "utensils" },
            { key: "DINING_TABLE", label: "Dining table", icon: "table" },

            { key: "HOT_WATER", label: "Hot water", icon: "droplet" },
            { key: "WATER_HEATER", label: "Water heater", icon: "thermometer" },
            { key: "BIDET", label: "Bidet", icon: "droplets" },

            { key: "WASHER", label: "Washing machine", icon: "refresh-cw" },
            { key: "DRYER", label: "Dryer", icon: "wind" },
            { key: "IRON", label: "Iron", icon: "layers" },
            { key: "HANGERS", label: "Hangers", icon: "paperclip" },

            { key: "HAIR_DRYER", label: "Hair dryer", icon: "wind" },
            { key: "TOWELS", label: "Towels", icon: "bookmark" },
            { key: "LINENS", label: "Bed linens", icon: "layers-2" },

            { key: "BACKUP_POWER", label: "Backup power", icon: "battery-charging" },
            { key: "ROUTER_MODEM", label: "Router / modem", icon: "router" },
            { key: "WORK_DESK", label: "Desk", icon: "laptop" },

            { key: "CLEANING_SUPPLIES", label: "Cleaning supplies", icon: "spray-can" },
            { key: "TRASH_BINS", label: "Trash bins", icon: "trash-2" },
            { key: "BLACKOUT_CURTAINS", label: "Blackout curtains", icon: "moon" },
            { key: "ELEVATOR_ACCESS", label: "Elevator access", icon: "arrow-up-down" },
            { key: "HEATER", label: "Heater", icon: "thermometer-sun" },
            { key: "FIREPLACE", label: "Fireplace", icon: "flame" }
        ],

        activities: [
            { key: "WORKSPACE", label: "Dedicated workspace", icon: "laptop" },
            { key: "BALCONY", label: "Balcony / terrace", icon: "building-2" },
            { key: "GARDEN", label: "Garden", icon: "leaf" },
            { key: "PATIO", label: "Patio", icon: "sun" },
            { key: "ROOFTOP", label: "Rooftop access", icon: "mountain" },

            { key: "POOL", label: "Pool access", icon: "waves" },
            { key: "GYM", label: "Gym access", icon: "dumbbell" },
            { key: "SPA", label: "Spa / sauna", icon: "sparkles" },
            { key: "GAME_ROOM", label: "Game room", icon: "gamepad-2" },

            { key: "PARKING", label: "Parking", icon: "car" },
            { key: "FREE_PARKING", label: "Free parking", icon: "car" },
            { key: "PAID_PARKING", label: "Paid parking", icon: "car" },

            { key: "SELF_CHECKIN", label: "Self check-in", icon: "key" },
            { key: "DOORMAN", label: "Doorman / lobby", icon: "bell" },
            { key: "ELEVATOR", label: "Elevator", icon: "arrow-up-down" },

            { key: "PET_FRIENDLY", label: "Pet-friendly", icon: "paw-print" },
            { key: "SMOKING_AREA", label: "Smoking area", icon: "cigarette" },
            { key: "FAMILY_FRIENDLY", label: "Family-friendly", icon: "baby" },

            { key: "WHEELCHAIR", label: "Wheelchair accessible", icon: "accessibility" },
            { key: "STAIRS_ONLY", label: "Stairs only", icon: "arrow-up" },

            { key: "NEAR_TRANSIT", label: "Near transit", icon: "train" },
            { key: "NEAR_MALL", label: "Near mall", icon: "shopping-bag" },
            { key: "NEAR_SCHOOL", label: "Near school", icon: "graduation-cap" },
            { key: "NEAR_HOSPITAL", label: "Near hospital", icon: "heart-pulse" },
            { key: "NEAR_GROCERIES", label: "Near groceries", icon: "shopping-cart" },

            { key: "QUIET_AREA", label: "Quiet area", icon: "volume-x" },
            { key: "GREAT_VIEW", label: "Great view", icon: "binoculars" },
            { key: "CITY_VIEW", label: "City view", icon: "building" },
            { key: "PARK_VIEW", label: "Park view", icon: "trees" },


            { key: "EXTRA_STORAGE", label: "Extra storage", icon: "archive" },
            { key: "LONG_STAY", label: "Long-stay friendly", icon: "calendar-days" },
            { key: "SHORT_STAY", label: "Short-stay friendly", icon: "clock" },

            { key: "EVENT_OK", label: "Events allowed", icon: "sparkles" },
            { key: "COOKING_ALLOWED", label: "Cooking allowed", icon: "utensils-crossed" },
            { key: "LAUNDRY_AREA", label: "Laundry area", icon: "shirt" },
            { key: "WATER_REFILL", label: "Water refill nearby", icon: "droplet" }
        ],

        safety: [
            { key: "SECURITY_GUARD", label: "Security / guard", icon: "shield" },
            { key: "CCTV_OUTSIDE", label: "CCTV outside", icon: "camera" },
            { key: "CCTV_COMMON", label: "CCTV common areas", icon: "camera" },
            { key: "GATED", label: "Gated property", icon: "shield-check" },
            { key: "SMART_LOCK", label: "Smart lock", icon: "lock" },
            { key: "KEYPAD", label: "Keypad entry", icon: "keyboard" },
            { key: "LOCKBOX", label: "Lockbox", icon: "package" },

            { key: "SMOKE_ALARM", label: "Smoke alarm", icon: "bell" },
            { key: "CO_ALARM", label: "CO alarm", icon: "alert-triangle" },
            { key: "FIRE_EXT", label: "Fire extinguisher", icon: "flame" },
            { key: "FIRST_AID", label: "First aid kit", icon: "heart-pulse" },
            { key: "EMERGENCY_EXIT", label: "Emergency exit", icon: "door-open" },
            { key: "FIRE_ESCAPE_PLAN", label: "Fire escape plan", icon: "map" },

            { key: "WELL_LIT", label: "Well-lit entrance", icon: "sun" },
            { key: "SAFEBOX", label: "Safe", icon: "package" },
            { key: "WINDOW_GRILLS", label: "Window grills", icon: "grid-3x3" },
            { key: "DOOR_CHAIN", label: "Door chain", icon: "link" },

            { key: "NO_WEAPONS", label: "No weapons on property", icon: "ban" },
            { key: "NO_ILLEGAL", label: "No illegal activities", icon: "ban" },

            { key: "LIFEGUARD", label: "Lifeguard (if pool)", icon: "life-buoy" },
            { key: "POOL_FENCE", label: "Pool fence", icon: "grid-3x3" },

            { key: "CHILD_SAFETY", label: "Child-safe furniture", icon: "baby" },
            { key: "STAIR_GATES", label: "Stair gates", icon: "grid-3x3" },

            { key: "PEST_CONTROL", label: "Pest control", icon: "bug" },
            { key: "EARTHQUAKE_KIT", label: "Emergency kit", icon: "backpack" },
            { key: "EVAC_ROUTE", label: "Evacuation route info", icon: "route" },

            { key: "CONTACT_INFO", label: "Emergency contacts posted", icon: "phone" },
            { key: "BUILDING_RULES", label: "Building rules available", icon: "file-text" },
            { key: "CHECKIN_ID", label: "Check-in ID policy", icon: "badge-check" },

            { key: "POWER_SURGE", label: "Surge protector", icon: "zap" },
            { key: "GENERATOR", label: "Generator", icon: "battery" },
            { key: "WATER_SUPPLY", label: "Emergency water supply", icon: "droplet" }
        ]
    };

    const ICON_FALLBACK = {
        router: "wifi",
        "shield-check": "shield",
        "tv-2": "tv",
        "spray-can": "spray-can",
        table: "grid-2x2",
        trees: "leaf"
    };

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

    const norm = (s) => (s || "").toLowerCase().trim();

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

    function renderTab(tabKey) {
        activeTab = tabKey;

        tabs.forEach((t) => {
            const on = t.dataset.tab === tabKey;
            t.classList.toggle("isActive", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        });

        if (titleEl) titleEl.textContent = TAB_META[tabKey].title;
        if (hintEl) hintEl.textContent = TAB_META[tabKey].hint;

        const a = readAmenDraft();
        const selectedSet = new Set(a[tabKey]);

        const list = (OPTIONS[tabKey] || []).filter((o) => {
            if (!searchQ) return true;
            return norm(o.label).includes(searchQ);
        });

        grid.innerHTML = list.map((o) => {
            const icon = ICON_FALLBACK[o.icon] || o.icon;
            const sel = selectedSet.has(o.key) ? "selected" : "";
            return `
        <button class="card amenCard ${sel}" type="button" data-key="${o.key}">
          <i class="card-ic" data-lucide="${icon}"></i>
          <div class="label">${o.label}</div>
        </button>
      `;
        }).join("") || `
      <div class="amenEmpty">
        <div class="amenEmptyTitle">No results</div>
        <div class="amenEmptySub">Try a different keyword.</div>
      </div>
    `;

        if (window.lucide?.createIcons) window.lucide.createIcons();

        grid.querySelectorAll(".amenCard").forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.dataset.key;
                const curr = readAmenDraft();
                const set = new Set(curr[activeTab]);

                if (set.has(key)) set.delete(key);
                else set.add(key);

                curr[activeTab] = Array.from(set);
                saveAmenDraft(curr);

                btn.classList.toggle("selected");
                updateCountAndNext();
            });
        });

        const activeBtn = tabs.find((t) => t.dataset.tab === tabKey);
        setIndicatorTo(activeBtn);

        updateCountAndNext();
    }

    function setSearch(q) {
        searchQ = norm(q);
        if (searchInput) searchInput.value = q;
        if (searchClear) searchClear.style.opacity = searchQ ? "1" : ".35";
        renderTab(activeTab);
    }

    // bind search
    if (searchInput) searchInput.addEventListener("input", (e) => setSearch(e.target.value));
    if (searchClear) searchClear.addEventListener("click", () => setSearch(""));

    // tab clicks
    tabs.forEach((btn) => btn.addEventListener("click", () => renderTab(btn.dataset.tab)));

    // first paint
    renderTab(activeTab);

    // ✅ Sync Step 5 to backend on Next

};
