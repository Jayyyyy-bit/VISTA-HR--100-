// core/store.js
const API_BASE = "";

// ===== Draft multi-store keys =====
const INDEX_KEY = "vista_draft_index";       // JSON array of draftIds
const ACTIVE_KEY = "vista_draft_active";     // current draftId
const DRAFT_PREFIX = "vista_listing_draft:"; // + draftId
const LISTING_PREFIX = "listing_id:";        // + draftId
const MAP_KEY = "vista_listing_map";         // JSON map { [listingId]: draftId }

function draftKey(draftId) {
    return `${DRAFT_PREFIX}${draftId}`;
}
function listingKey(draftId) {
    return `${LISTING_PREFIX}${draftId}`;
}

function getIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]") || []; }
    catch { return []; }
}
function saveIndex(arr) {
    localStorage.setItem(INDEX_KEY, JSON.stringify(arr || []));
}
function listDraftIds() {
    return getIndex();
}
function countDrafts() {
    return getIndex().length;
}
function getActiveDraftId() {
    return localStorage.getItem(ACTIVE_KEY);
}
function setActiveDraftId(draftId) {
    localStorage.setItem(ACTIVE_KEY, String(draftId));
}

function getMap() {
    try { return JSON.parse(localStorage.getItem(MAP_KEY) || "{}") || {}; }
    catch { return {}; }
}
function saveMap(map) {
    localStorage.setItem(MAP_KEY, JSON.stringify(map || {}));
}

function newDraftId() {
    return "draft-" + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}

function ensureActiveDraft() {
    let active = getActiveDraftId();
    const ids = getIndex();

    // Accept active draft if it has local draft data OR a bound listing id
    if (
        active &&
        (
            ids.includes(active) ||
            localStorage.getItem(draftKey(active)) ||
            localStorage.getItem(listingKey(active))
        )
    ) {
        return active;
    }

    // Fall back to first known draft id
    if (ids.length > 0) {
        active = ids[0];
        setActiveDraftId(active);
        return active;
    }

    // No draft exists at all — return a placeholder key.
    // DO NOT call createNewDraft() here — it's async and would return a
    // Promise, corrupting all localStorage keys with "[object Promise]".
    // Callers that need a real server-backed draft must call createNewDraft()
    // explicitly and await it before calling any store read/write methods.
    const placeholder = "draft-pending-" + Date.now().toString(16);
    setActiveDraftId(placeholder);
    return placeholder;
}

function isOwnerVerified() {
    try {
        const s = window.AuthGuard?.getSession?.() || JSON.parse(localStorage.getItem("vista_session_user") || "null");
        return !!s?.user?.is_verified;
    } catch {
        return false;
    }
}

function getDraftLimit() {
    // 3 if not verified, 10 if verified
    return isOwnerVerified() ? 10 : 3;
}

function setActiveDraft(draftId) {
    const ids = getIndex();
    if (!ids.includes(draftId)) {
        ids.unshift(draftId);
        saveIndex(ids);
    }
    setActiveDraftId(draftId);
    return draftId;
}

async function createNewDraft() {
    //  Create on server FIRST (backend enforces 3/10 limit)
    // placeType can be null; your backend allows it
    const data = await apiFetch("/listings/step-1", {
        method: "POST",
        body: JSON.stringify({ placeType: null }),
    });

    const listing = data?.listing;
    const listingId = listing?.id;
    if (!listingId) throw { error: "Server did not return listing id" };

    // ✅ Create local draft container mapped to server listing
    const draftId = newDraftId();
    const ids = getIndex();
    ids.unshift(draftId);
    saveIndex(ids);
    setActiveDraftId(draftId);

    // map listingId -> draftId
    const map = getMap();
    map[String(listingId)] = draftId;
    saveMap(map);

    // bind listing id to this draftId
    localStorage.setItem(listingKey(draftId), String(listingId));

    // init empty draft
    localStorage.setItem(draftKey(draftId), JSON.stringify({
        id: draftId,
        status: listing.status || "DRAFT",
        placeType: listing.place_type ?? null,
        spaceType: listing.space_type ?? null,
        location: listing.location ?? {
            lat: null, lng: null, country: "Philippines",
            unit: "", building: "", street: "", barangay: "",
            city: "", province: "", zip: "", precise: false, addressLine: ""
        },
        capacity: listing.capacity ?? { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 },
        amenities: listing.amenities ?? { appliances: [], activities: [], safety: [] },
        highlights: listing.highlights ?? [],
        photos: listing.photos ?? [],
        virtualTour: { enabled: false, panoUrl: "" },
        details: { title: listing.title ?? "", description: listing.description ?? "" },
        verified: isOwnerVerified(),
        updatedAt: new Date().toISOString(),
    }));

    return { draftId, listingId, listing };
}

async function deleteListing(listingId) {
    await apiFetch(`/listings/${listingId}`, { method: "DELETE" });

    // cleanup local mapping if exists
    const map = getMap();
    const dId = map[String(listingId)];
    if (dId) {
        clearDraft(dId); // your existing clearDraft handles map cleanup too
    } else {
        delete map[String(listingId)];
        saveMap(map);
    }
}


function getListingId() {
    const draftId = ensureActiveDraft();
    return localStorage.getItem(listingKey(draftId));
}
function setListingId(id) {
    const draftId = ensureActiveDraft();
    localStorage.setItem(listingKey(draftId), String(id));
}

function readDraft() {
    const draftId = ensureActiveDraft();
    try {
        return JSON.parse(localStorage.getItem(draftKey(draftId)) || "{}") || {};
    } catch {
        return {};
    }
}

function saveDraft(patch) {
    const draftId = ensureActiveDraft();
    const d = readDraft();

    const defaultLocation = {
        lat: null, lng: null, country: "Philippines",
        unit: "", building: "", street: "", barangay: "",
        city: "", province: "", zip: "", precise: false, addressLine: ""
    };

    const next = {
        id: d.id || draftId,
        status: d.status || "DRAFT",

        placeType: d.placeType ?? null,
        spaceType: d.spaceType ?? null,
        location: { ...defaultLocation, ...(d.location || {}) },

        capacity: d.capacity ?? { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 },
        amenities: d.amenities ?? { appliances: [], activities: [], safety: [] },
        highlights: d.highlights ?? [],
        photos: d.photos ?? [],
        virtualTour: d.virtualTour ?? { enabled: false, panoUrl: "" },
        details: d.details ?? { title: "", description: "" },

        verified: d.verified ?? isOwnerVerified(),

        ...d,
        ...patch,
        updatedAt: new Date().toISOString(),
    };

    // nested merges
    if (patch?.location) next.location = { ...next.location, ...patch.location };
    if (patch?.capacity) next.capacity = { ...next.capacity, ...patch.capacity };
    if (patch?.amenities) next.amenities = { ...next.amenities, ...patch.amenities };
    if (patch?.virtualTour) next.virtualTour = { ...next.virtualTour, ...patch.virtualTour };
    if (patch?.details) next.details = { ...next.details, ...patch.details };

    localStorage.setItem(draftKey(draftId), JSON.stringify(next));
    return next;
}

function clearDraft(draftIdMaybe) {
    const ids = getIndex();
    const active = getActiveDraftId();
    const draftId = draftIdMaybe || active;

    if (!draftId) return;

    localStorage.removeItem(draftKey(draftId));
    localStorage.removeItem(listingKey(draftId));

    const nextIds = ids.filter(id => id !== draftId);
    saveIndex(nextIds);

    // cleanup map entries pointing to this draft
    const map = getMap();
    for (const [listingId, dId] of Object.entries(map)) {
        if (dId === draftId) delete map[listingId];
    }
    saveMap(map);

    // choose new active
    if (active === draftId) {
        const newActive = nextIds[0] || null;
        if (newActive) setActiveDraftId(newActive);
        else localStorage.removeItem(ACTIVE_KEY);
    }
}

// =========================
// API helpers
// =========================
async function apiFetch(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        credentials: "include",
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
}

// =========================
// Progress / status
// =========================
const SCHEMA = [
    { step: 1, label: "Place type", weight: 12, isDone: (d) => !!d.placeType },
    { step: 2, label: "Guest space", weight: 12, isDone: (d) => !!d.spaceType },
    {
        step: 3, label: "Location", weight: 16,
        isDone: (d) => {
            const loc = d.location || {};
            return !!(loc.street && loc.city && loc.province && loc.zip);
        }
    },
    {
        step: 4, label: "Capacity", weight: 12,
        isDone: (d) => Number((d.capacity || {}).guests) >= 1
    },
    {
        step: 5, label: "Amenities", weight: 12,
        isDone: (d) => {
            const a = d.amenities || {};
            const count = (a.appliances?.length || 0) + (a.activities?.length || 0) + (a.safety?.length || 0);
            return count > 0;
        }
    },
    { step: 6, label: "Highlights", weight: 10, isDone: (d) => (d.highlights?.length || 0) > 0 },
    { step: 7, label: "Photos & virtual tour", weight: 16, isDone: (d) => (d.photos?.length || 0) >= 5 },
    {
        step: 8, label: "Title & description", weight: 10,
        isDone: (d) => {
            const det = d.details || {};
            return !!(det.title && det.title.trim()) && !!(det.description && det.description.trim());
        }
    },
];

function computeProgress(draft, activeStep = 1) {
    const verified = !!draft?.verified;
    const active = Number(activeStep) || 1;

    // completion independent of active step
    const allComplete = SCHEMA.every(s => !!s.isDone(draft || {}));

    // UI state: done only if completed AND already passed (before active step)
    const steps = SCHEMA.map((s) => {
        const isDone = !!s.isDone(draft || {});
        const done = isDone && s.step < active;
        return { ...s, done, locked: false, active: s.step === active };
    });

    let percent = 0;
    for (const s of steps) if (s.done) percent += s.weight;

    const nextStep =
        steps.find((s) => !s.done && !s.locked)?.step ??
        steps[steps.length - 1]?.step ??
        1;

    // derived status logic
    const serverStatus = String(draft?.status || "").toUpperCase();
    let derivedStatus = "DRAFT";
    if (serverStatus === "PUBLISHED") derivedStatus = "PUBLISHED";
    else if (allComplete) derivedStatus = "READY";

    // publishAllowed: only if verified AND allComplete (you can still require submit)
    const publishAllowed = verified && allComplete;

    return { percent, steps, nextStep, publishAllowed, activeStep: active, allComplete, derivedStatus };
}

// =========================
// Server sync: listing hydration + open listing
// =========================
function hydrateFromServer(listing) {
    if (!listing) return null;

    const photos = listing.photos ?? [];
    const normPhotos = Array.isArray(photos) ? photos : [];

    // Only include fields that are actually present on the server response.
    // Passing undefined for a field causes saveDraft's spread merge to silently
    // ignore it, leaving stale data from a prior draft session.
    const patch = {
        status: listing.status || "DRAFT",
        placeType: listing.place_type ?? null,
        spaceType: listing.space_type ?? null,
        location: listing.location || {},
        photos: normPhotos,
        details: {
            title: listing.title ?? "",
            description: listing.description ?? "",
        },
    };

    // Only override capacity/amenities/highlights if the server actually sent them
    if (listing.capacity != null) patch.capacity = listing.capacity;
    if (listing.amenities != null) patch.amenities = listing.amenities;
    if (listing.highlights != null) patch.highlights = listing.highlights;

    return saveDraft(patch);
}

// Map a server listingId -> a draftId for local storage
function ensureDraftForListing(listingId) {
    const map = getMap();
    const lid = String(listingId);

    // already mapped -> activate it
    if (map[lid]) {
        const existingDraftId = map[lid];

        // ✅ make sure it's also present in the draft index
        const ids = getIndex();
        if (!ids.includes(existingDraftId)) {
            ids.unshift(existingDraftId);
            saveIndex(ids);
        }

        setActiveDraftId(existingDraftId);
        localStorage.setItem(listingKey(existingDraftId), lid);
        return existingDraftId;
    }

    // stable draft id per server listing
    const draftId = `svr-${lid}`;

    // map listingId -> draftId
    map[lid] = draftId;
    saveMap(map);

    //  add to index so resume works across steps
    const ids = getIndex();
    if (!ids.includes(draftId)) {
        ids.unshift(draftId);
        saveIndex(ids);
    }

    setActiveDraftId(draftId);

    // store listingId for this draft
    localStorage.setItem(listingKey(draftId), lid);

    // init container if not exists
    const existing = localStorage.getItem(draftKey(draftId));
    if (!existing) {
        localStorage.setItem(draftKey(draftId), JSON.stringify({
            id: draftId,
            status: "DRAFT",
            verified: isOwnerVerified(),
            updatedAt: new Date().toISOString(),
        }));
    }

    return draftId;
}

function countLocalOnlyDrafts() {
    const ids = getIndex();
    let n = 0;
    for (const id of ids) {
        const lid = localStorage.getItem(listingKey(id));
        // local-only = wala pang server listing id
        if (!lid) n++;
    }
    return n;
}



async function openListing(listingId) {
    const draftId = ensureDraftForListing(listingId);
    const out = await apiFetch(`/listings/${listingId}`, { method: "GET" });
    hydrateFromServer(out.listing);
    setActiveDraftId(draftId);
    return out.listing;
}

async function listMyListings() {
    // You will add this endpoint in backend section below
    const out = await apiFetch("/listings/mine", { method: "GET" });
    return out?.listings || [];
}

// resumeDraft: used by wizard on load
async function resumeDraft({ allowLatestFallback = true } = {}) {
    ensureActiveDraft();

    const listingId = getListingId();

    // Only hydrate if we have a real server-bound listing id.
    // A placeholder draft-pending-* key has no listingId yet.
    if (listingId && !String(listingId).startsWith("draft-pending")) {
        try {
            const out = await apiFetch(`/listings/${listingId}`, { method: "GET" });
            if (out?.listing) {
                hydrateFromServer(out.listing);
                return out.listing;
            }
        } catch {
            // Server listing may have been deleted — clear the stale local entry
            const active = getActiveDraftId();
            if (active) clearDraft(active);
        }
    }

    if (!allowLatestFallback) return null;

    // Fallback: fetch latest draft from server (only when not starting fresh)
    try {
        const out2 = await apiFetch("/listings/drafts/latest", { method: "GET" });
        if (out2?.listing) {
            ensureDraftForListing(out2.listing.id);
            hydrateFromServer(out2.listing);
            return out2.listing;
        }
    } catch {
        // silent — no latest draft is fine
    }

    return null;
}

// =========================
// Sync endpoints (per active draft)
// =========================
async function syncStep1() {
    const d = readDraft();
    if (!d.placeType) throw { error: "placeType is required" };

    // ── FIX: always try to reuse an existing bound listing first ─────────────
    // getListingId() reads from the ACTIVE draft's localStorage entry. After
    // createNewDraft() runs in the router boot we always have an id here, but
    // as a defensive fallback we also check the server for a recent step-1
    // draft before ever creating a new row — preventing ghost/duplicate listings
    // when localStorage is stale or was wiped mid-session.
    let existingId = getListingId();

    if (!existingId) {
        // No local binding — ask the server if we already have a step-1 draft.
        // This covers: browser cleared localStorage after boot, tab restored
        // from bfcache, hard reload mid-wizard, etc.
        try {
            const latest = await apiFetch("/listings/drafts/latest", { method: "GET" });
            if (latest?.listing?.id && latest.listing.current_step === 1) {
                // Recover it: bind to current active draft and skip creating new.
                const recoveredId = latest.listing.id;
                setListingId(recoveredId);
                const map = getMap();
                map[String(recoveredId)] = ensureActiveDraft();
                saveMap(map);
                existingId = recoveredId;
                console.log("[store] syncStep1: recovered existing step-1 draft", recoveredId);
            }
        } catch {
            // No latest draft or network error — safe to fall through and create new.
        }
    }

    // ── PATCH path: listing already exists on the server ─────────────────────
    if (existingId) {
        const data = await apiFetch(`/listings/${existingId}/step-1`, {
            method: "PATCH",
            body: JSON.stringify({ placeType: d.placeType }),
        });

        saveDraft({
            status: data?.listing?.status || "DRAFT",
            placeType: data?.listing?.place_type ?? d.placeType,
        });

        return data;
    }

    // ── POST path: no listing exists yet — create one ─────────────────────────
    // NOTE: the backend's POST /listings/step-1 has an idempotency guard that
    // returns an existing step-1 draft (created within the last 10 min with no
    // placeType) instead of creating a duplicate. Belt-and-suspenders.
    const data = await apiFetch("/listings/step-1", {
        method: "POST",
        body: JSON.stringify({ placeType: d.placeType }),
    });

    const id = data?.listing?.id;
    if (!id) throw { error: "Server did not return listing id" };

    setListingId(id);

    const map = getMap();
    map[String(id)] = ensureActiveDraft();
    saveMap(map);

    saveDraft({
        status: data?.listing?.status || "DRAFT",
        placeType: data?.listing?.place_type ?? d.placeType,
    });

    return data;
}

async function syncStep2() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };
    if (!d.spaceType) throw { error: "spaceType is required" };

    return apiFetch(`/listings/${listingId}/step-2`, {
        method: "PATCH",
        body: JSON.stringify({ spaceType: d.spaceType }),
    });
}

async function syncStep3() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    return apiFetch(`/listings/${listingId}/step-3`, {
        method: "PATCH",
        body: JSON.stringify(d.location || {}),
    });
}

async function syncStep4() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const cap = d.capacity || {};
    if (Number(cap.guests) < 1) throw { error: "Guest count must be at least 1." };

    return apiFetch(`/listings/${listingId}/step-4`, {
        method: "PATCH",
        body: JSON.stringify({ capacity: cap }),
    });
}

async function syncStep5() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const a = d.amenities || { appliances: [], activities: [], safety: [] };
    const total =
        (a.appliances?.length || 0) +
        (a.activities?.length || 0) +
        (a.safety?.length || 0);

    if (total < 1) throw { error: "Select at least 1 amenity." };

    return apiFetch(`/listings/${listingId}/step-5`, {
        method: "PATCH",
        body: JSON.stringify({ amenities: a }),
    });
}

async function syncStep6() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const highlights = Array.isArray(d.highlights) ? d.highlights : [];
    if (highlights.length < 1) throw { error: "Select at least 1 highlight." };
    if (highlights.length > 5) throw { error: "Highlights max is 5." };

    return apiFetch(`/listings/${listingId}/step-6`, {
        method: "PATCH",
        body: JSON.stringify({ highlights }),
    });
}

async function syncStep7() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const photos = Array.isArray(d.photos) ? d.photos : [];
    if (photos.length < 5) throw { error: "Add at least 5 photos." };

    const virtualTour = d.virtualTour || { enabled: false, panoUrl: "" };

    return apiFetch(`/listings/${listingId}/step-7`, {
        method: "PATCH",
        body: JSON.stringify({ photos, virtualTour }),
    });
}

async function syncStep8() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const details = d.details || {};
    const title = String(details.title || "").trim();
    const description = String(details.description || "").trim();

    if (title.length < 3) throw { error: "Title must be at least 3 characters." };
    if (description.length < 10) throw { error: "Description must be at least 10 characters." };

    // Note: student_discount_pct is now handled by syncStep9 (Step 9 - Pricing).
    // Step 8 only saves title + description.
    return apiFetch(`/listings/${listingId}/step-8`, {
        method: "PATCH",
        body: JSON.stringify({ title, description }),
    });
}

async function syncStep9() {
    const d = readDraft();
    const listingId = getListingId();
    if (!listingId) throw { error: "No listing_id found. Finish Step 1 first." };

    const cap = d.capacity || {};
    const monthlyRent = cap.monthly_rent;
    const studentDiscountPct = cap.student_discount_pct ?? null;

    if (!monthlyRent || Number(monthlyRent) < 500) {
        throw { error: "Monthly rent is required (minimum ₱500)." };
    }

    return apiFetch(`/listings/${listingId}/step-9`, {
        method: "PATCH",
        body: JSON.stringify({
            monthly_rent: Number(monthlyRent),
            student_discount_pct: studentDiscountPct,
        }),
    });
}

// Submit
async function submitForVerification() {
    const d = readDraft();
    const p = computeProgress(d, 10);
    if (!p.allComplete) throw { error: "Complete all steps before submitting." };

    const listingId = getListingId();
    if (!listingId) throw { error: "Missing listing id." };

    const out = await apiFetch(`/listings/${listingId}/submit-for-verification`, {
        method: "POST",
        body: JSON.stringify({}),
    });

    // Update local status to READY so dashboard reflects it immediately
    saveDraft({ status: out?.listing?.status || "READY" });

    // Clean up the local draft entry — it's now a published/submitted listing.
    // The server is the source of truth from here. Leaving it in localStorage
    // causes stale index entries that break future resume flows.
    const activeDraftId = getActiveDraftId();
    if (activeDraftId) clearDraft(activeDraftId);

    return out;
}

window.ListingStore = {
    // draft mgmt
    listDraftIds,
    countDrafts,
    getDraftLimit,
    createNewDraft,
    setActiveDraft,
    clearDraft,

    // draft data
    readDraft,
    saveDraft,
    getListingId,
    setListingId,

    // progress/status
    computeProgress,

    // server
    hydrateFromServer,
    openListing,
    listMyListings,
    resumeDraft,
    deleteListing,

    // sync
    syncStep1,
    syncStep2,
    syncStep3,
    syncStep4,
    syncStep5,
    syncStep6,
    syncStep7,
    syncStep8,

    // submit
    submitForVerification,
};