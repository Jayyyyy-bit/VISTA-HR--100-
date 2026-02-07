// core/store.js

const API_BASE = "http://127.0.0.1:5000/api";

function getToken() {
    return localStorage.getItem("access_token");
}

function getListingId() {
    return localStorage.getItem("listing_id");
}

function setListingId(id) {
    localStorage.setItem("listing_id", String(id));
}

async function apiFetch(path, options = {}) {
    const token = getToken();

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
}

window.ListingStore = (() => {
    const KEY = "vista_listing_draft";

    function readDraft() {
        try {
            return JSON.parse(localStorage.getItem(KEY)) || {};
        } catch {
            return {};
        }
    }

    function saveDraft(patch) {
        const d = readDraft();

        const defaultLocation = {
            lat: null,
            lng: null,
            country: "Philippines",
            unit: "",
            building: "",
            street: "",
            barangay: "",
            city: "",
            province: "",
            zip: "",
            precise: false,
            addressLine: "",
        };

        const next = {
            id: d.id || "draft-" + Date.now(),
            status: d.status || "DRAFT",

            // Step 1–3
            placeType: d.placeType ?? null,
            spaceType: d.spaceType ?? null,
            location: { ...defaultLocation, ...(d.location || {}) },

            // Future steps (safe defaults)
            capacity: d.capacity ?? { guests: 1, bedrooms: 0, beds: 1, bathrooms: 1 },
            amenities: d.amenities ?? { appliances: [], activities: [], safety: [] },
            highlights: d.highlights ?? [],
            photos: d.photos ?? [],
            virtualTour: d.virtualTour ?? { enabled: false, panoUrl: "" },
            details: d.details ?? { title: "", description: "" },

            verified: d.verified ?? false,

            ...d,
            ...patch,
            updatedAt: new Date().toISOString(),
        };

        // Nested merge safety
        if (patch && patch.location) next.location = { ...next.location, ...patch.location };
        if (patch && patch.capacity) next.capacity = { ...next.capacity, ...patch.capacity };
        if (patch && patch.amenities) next.amenities = { ...next.amenities, ...patch.amenities };
        if (patch && patch.virtualTour) next.virtualTour = { ...next.virtualTour, ...patch.virtualTour };
        if (patch && patch.details) next.details = { ...next.details, ...patch.details };

        localStorage.setItem(KEY, JSON.stringify(next));
        return next;
    }

    function clearDraft() {
        localStorage.removeItem(KEY);
        localStorage.removeItem("listing_id");
    }

    // ✅ Step 1–3 only now; extend later
    const SCHEMA = [
        { step: 1, label: "Place type", weight: 12, isDone: (d) => !!d.placeType },
        { step: 2, label: "Guest space", weight: 12, isDone: (d) => !!d.spaceType },
        {
            step: 3,
            label: "Location",
            weight: 16,
            isDone: (d) => {
                const loc = d.location || {};
                return !!(loc.street && loc.city && loc.province && loc.zip);
            },
        },

        // Future-proof steps
        {
            step: 4,
            label: "Capacity",
            weight: 12,
            isDone: (d) => {
                const c = d.capacity || {};
                return Number(c.guests) >= 1;
            },
        },
        {
            step: 5,
            label: "Amenities",
            weight: 12,
            isDone: (d) => {
                const a = d.amenities || {};
                const count =
                    (a.appliances?.length || 0) +
                    (a.activities?.length || 0) +
                    (a.safety?.length || 0);
                return count > 0;
            },
        },
        { step: 6, label: "Highlights", weight: 10, isDone: (d) => (d.highlights?.length || 0) > 0 },
        {
            step: 7,
            label: "Photos & virtual tour",
            weight: 16,
            isDone: (d) => (d.photos?.length || 0) >= 5,
        },
        {
            step: 8,
            label: "Title & description",
            weight: 10,
            isDone: (d) => {
                const det = d.details || {};
                return !!(det.title && det.title.trim()) && !!(det.description && det.description.trim());
            },
        },
    ];

    function computeProgress(draft) {
        const verified = !!draft?.verified;

        const steps = SCHEMA.map((s) => {
            const done = !!s.isDone(draft || {});
            return { ...s, done, locked: false };
        });

        const ready = steps.every((s) => s.done);
        const publishAllowed = verified && ready;

        let percent = 0;
        for (const s of steps) {
            if (s.done) percent += s.weight;
        }

        const nextStep =
            steps.find((s) => !s.done && !s.locked)?.step ??
            steps[steps.length - 1]?.step ??
            1;

        return { percent, steps, nextStep, publishAllowed };
    }

    // ===== API Sync (Backend) =====

    async function syncStep1() {
        const d = readDraft();
        if (!d.placeType) throw { error: "placeType is required" };

        const existingId = getListingId();
        if (existingId) {
            // already created draft before; don't create new one
            return { message: "Draft already exists", listing_id: Number(existingId) };
        }

        const data = await apiFetch("/listings/step-1", {
            method: "POST",
            body: JSON.stringify({ placeType: d.placeType }),
        });

        setListingId(data.listing.id);
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

        return apiFetch(`/listings/${listingId}/step-8`, {
            method: "PATCH",
            body: JSON.stringify({ title, description }),
        });
    }
    function hydrateFromServer(listing) {
        if (!listing) return null;

        // Save listing_id
        setListingId(listing.id);

        // Convert server fields -> draft shape
        return saveDraft({
            status: listing.status || "DRAFT",
            placeType: listing.place_type ?? null,
            spaceType: listing.space_type ?? null,
            location: listing.location ?? {},
            capacity: listing.capacity ?? undefined,
            amenities: listing.amenities ?? undefined,
            highlights: listing.highlights ?? undefined,
            photos: listing.photos ?? undefined,
            // If you later add virtual_tour column in backend:
            // virtualTour: listing.virtual_tour ?? undefined,
            details: {
                title: listing.title ?? "",
                description: listing.description ?? "",
            },
        });
    }

    async function resumeDraft() {
        // 1) Try by stored listing_id
        const listingId = getListingId();
        if (listingId) {
            try {
                const out = await apiFetch(`/listings/${listingId}`, { method: "GET" });
                hydrateFromServer(out.listing);
                return out.listing;
            } catch (e) {
                // if not found/forbidden, clear and fallback
                localStorage.removeItem("listing_id");
            }
        }

        // 2) Try latest server draft
        const out2 = await apiFetch("/listings/drafts/latest", { method: "GET" });
        if (out2?.listing) {
            hydrateFromServer(out2.listing);
            return out2.listing;
        }

        return null;
    }

    return {
        readDraft,
        saveDraft,
        clearDraft,
        computeProgress,
        syncStep1,
        syncStep2,
        syncStep3,
        syncStep4,
        syncStep5,
        syncStep6,
        syncStep7,
        syncStep8,
        hydrateFromServer,
        resumeDraft,

    };
})();
