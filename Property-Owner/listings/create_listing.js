lucide.createIcons();

/**
 * Demo storage keys
 */
const LS_USERS_KEY = "vista_users";
const LS_SESSION_KEY = "vista_session_user";
const LS_LISTINGS_KEY = "vista_listings";

/**
 * Helpers
 */
function readJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
}
function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}
function uid() {
    return (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
}

//const session = readJSON(LS_SESSION_KEY, null);
//if (!session?.userId) {
// not logged in; bring them back to login
//window.location.href = "../../Login_Register_Page/Login/login.html";
//}

const users = readJSON(LS_USERS_KEY, []);
const me = users.find(u => u.id === session.userId);

const verificationStatus = me?.verificationStatus || "UNVERIFIED";

/**
 * UI elements
 */
const slider = document.getElementById("slider");
const slides = Array.from(document.querySelectorAll(".slide"));
const progressBar = document.getElementById("progressBar");
const stepLabel = document.getElementById("stepLabel");
const draftStatus = document.getElementById("draftStatus");

const verifyBanner = document.getElementById("verifyBanner");
const verifyNowBtn = document.getElementById("verifyNowBtn");
const verifyLaterBtn = document.getElementById("verifyLaterBtn");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const saveDraftBtn = document.getElementById("saveDraftBtn");
const publishBtn = document.getElementById("publishBtn");
const publishHint = document.getElementById("publishHint");

const toDashboardBtn = document.getElementById("toDashboardBtn");
const myListingsBtn = document.getElementById("myListingsBtn");

/**
 * Form fields
 */
const unitCategory = document.getElementById("unitCategory");
const placeType = document.getElementById("placeType");

const placeSearch = document.getElementById("placeSearch");
const street = document.getElementById("street");
const barangay = document.getElementById("barangay");
const city = document.getElementById("city");
const zip = document.getElementById("zip");
const lat = document.getElementById("lat");
const lng = document.getElementById("lng");
const placeId = document.getElementById("placeId");

const guests = document.getElementById("guests");
const bedrooms = document.getElementById("bedrooms");
const bathrooms = document.getElementById("bathrooms");

const amenityChecks = () => Array.from(document.querySelectorAll(".amenity")).filter(x => x.checked).map(x => x.value);

const photosInput = document.getElementById("photos");
const photoGrid = document.getElementById("photoGrid");

const title = document.getElementById("title");
const description = document.getElementById("description");

const price = document.getElementById("price");
const bookingType = document.getElementById("bookingType");

const dpEnabled = document.getElementById("dpEnabled");
const dpFields = document.getElementById("dpFields");
const dpType = document.getElementById("dpType");
const dpValue = document.getElementById("dpValue");
const payMethods = () => Array.from(document.querySelectorAll(".payMethod")).filter(x => x.checked).map(x => x.value);

/**
 * Listing object (draft)
 * - We'll create or restore a "current draft listing" for this owner.
 */
let listings = readJSON(LS_LISTINGS_KEY, []);
let currentListing = null;

// Try restore last draft for this owner (latest DRAFT)
const ownerDrafts = listings.filter(l => l.ownerId === session.userId && l.status === "DRAFT");
if (ownerDrafts.length) {
    ownerDrafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    currentListing = ownerDrafts[0];
} else {
    currentListing = {
        id: uid(),
        ownerId: session.userId,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),

        // fields
        unitCategory: "",
        placeType: "",
        location: {
            placeSearch: "",
            street: "",
            barangay: "",
            city: "",
            zip: "",
            lat: "",
            lng: "",
            placeId: ""
        },
        details: { guests: 1, bedrooms: 0, bathrooms: 0 },
        amenities: [],
        photos: [], // store file names for demo
        title: "",
        description: "",
        pricing: { price: "", bookingType: "Standard" },
        downPayment: { enabled: false, type: "fixed", value: "", methods: [] }
    };
    listings.push(currentListing);
    writeJSON(LS_LISTINGS_KEY, listings);
}

function setSavedHint(text) {
    draftStatus.textContent = text;
    setTimeout(() => (draftStatus.textContent = "Saved as draft"), 1200);
}

function persist() {
    currentListing.updatedAt = new Date().toISOString();
    listings = readJSON(LS_LISTINGS_KEY, []);
    const idx = listings.findIndex(l => l.id === currentListing.id);
    if (idx >= 0) listings[idx] = currentListing;
    else listings.push(currentListing);
    writeJSON(LS_LISTINGS_KEY, listings);
    setSavedHint("Saved ✓");
}

function loadIntoUI() {
    unitCategory.value = currentListing.unitCategory || "";
    placeType.value = currentListing.placeType || "";

    placeSearch.value = currentListing.location.placeSearch || "";
    street.value = currentListing.location.street || "";
    barangay.value = currentListing.location.barangay || "";
    city.value = currentListing.location.city || "";
    zip.value = currentListing.location.zip || "";
    lat.value = currentListing.location.lat || "";
    lng.value = currentListing.location.lng || "";
    placeId.value = currentListing.location.placeId || "";

    guests.value = currentListing.details.guests ?? 1;
    bedrooms.value = currentListing.details.bedrooms ?? 0;
    bathrooms.value = currentListing.details.bathrooms ?? 0;

    // amenities
    const setA = new Set(currentListing.amenities || []);
    document.querySelectorAll(".amenity").forEach(c => (c.checked = setA.has(c.value)));

    // photos
    renderPhotos(currentListing.photos || []);

    title.value = currentListing.title || "";
    description.value = currentListing.description || "";

    price.value = currentListing.pricing.price ?? "";
    bookingType.value = currentListing.pricing.bookingType || "Standard";

    dpEnabled.checked = !!currentListing.downPayment.enabled;
    dpType.value = currentListing.downPayment.type || "fixed";
    dpValue.value = currentListing.downPayment.value ?? "";
    const setM = new Set(currentListing.downPayment.methods || []);
    document.querySelectorAll(".payMethod").forEach(c => (c.checked = setM.has(c.value)));

    toggleDPFields();
}

function collectFromUI() {
    currentListing.unitCategory = unitCategory.value;
    currentListing.placeType = placeType.value;

    currentListing.location = {
        placeSearch: placeSearch.value,
        street: street.value,
        barangay: barangay.value,
        city: city.value,
        zip: zip.value,
        lat: lat.value,
        lng: lng.value,
        placeId: placeId.value
    };

    currentListing.details = {
        guests: Number(guests.value || 1),
        bedrooms: Number(bedrooms.value || 0),
        bathrooms: Number(bathrooms.value || 0)
    };

    currentListing.amenities = amenityChecks();
    currentListing.title = title.value;
    currentListing.description = description.value;

    currentListing.pricing = {
        price: price.value,
        bookingType: bookingType.value
    };

    currentListing.downPayment = {
        enabled: dpEnabled.checked,
        type: dpType.value,
        value: dpValue.value,
        methods: payMethods()
    };
}

function renderPhotos(names) {
    photoGrid.innerHTML = "";
    (names || []).forEach(n => {
        const div = document.createElement("div");
        div.className = "photo";
        div.textContent = n;
        photoGrid.appendChild(div);
    });
}

/**
 * Verification banner + publish lock
 */
function applyVerificationUI() {
    const isVerified = verificationStatus === "VERIFIED";
    verifyBanner.style.display = isVerified ? "none" : "flex";

    if (!isVerified) {
        publishBtn.disabled = true;
        publishBtn.style.opacity = ".6";
        publishHint.textContent = "Verify your account to publish this listing.";
    } else {
        publishBtn.disabled = false;
        publishBtn.style.opacity = "1";
        publishHint.textContent = "";
    }
}

verifyNowBtn.addEventListener("click", () => {
    window.location.href = "../verification/verify.html";
});
verifyLaterBtn.addEventListener("click", () => {
    verifyBanner.style.display = "none";
});

/**
 * DP toggle
 */
function toggleDPFields() {
    if (dpEnabled.checked) dpFields.classList.remove("muted-panel");
    else dpFields.classList.add("muted-panel");
}
dpEnabled.addEventListener("change", () => {
    toggleDPFields();
    collectFromUI(); persist();
});

/**
 * Wizard state
 */
let currentStep = 1;
const totalSteps = 7;

function setStep(step, direction = "forward") {
    currentStep = Math.max(1, Math.min(totalSteps, step));

    slides.forEach(s => {
        s.classList.remove("active");
        s.classList.remove("backward");
    });

    const active = slides.find(s => Number(s.dataset.step) === currentStep);
    if (direction === "back") active.classList.add("backward");
    active.classList.add("active");

    const pct = Math.round((currentStep / totalSteps) * 100);
    progressBar.style.setProperty("--p", `${pct}%`);
    stepLabel.textContent = `Step ${currentStep} of ${totalSteps}`;

    prevBtn.disabled = currentStep === 1;
    nextBtn.innerHTML = currentStep === totalSteps ? `Finish <i data-lucide="check"></i>` : `Next <i data-lucide="arrow-right"></i>`;
    lucide.createIcons();
}

function setError(key, msg) {
    const el = document.querySelector(`[data-err="${key}"]`);
    if (el) el.textContent = msg || "";
}
function clearErrors() {
    document.querySelectorAll("[data-err]").forEach(el => (el.textContent = ""));
}

/**
 * Step validation (light but meaningful)
 * - Draft can always be saved, but next requires key fields to avoid empty wizard.
 */
function validateStep(step) {
    clearErrors();
    collectFromUI();

    if (step === 1) {
        let ok = true;
        if (!currentListing.unitCategory) { setError("unitCategory", "Required"); ok = false; }
        if (!currentListing.placeType) { setError("placeType", "Required"); ok = false; }
        return ok;
    }

    if (step === 2) {
        // City required + Metro Manila scope is enforced when using Maps.
        if (!currentListing.location.city) {
            setError("city", "City is required (Metro Manila only).");
            return false;
        }
        return true;
    }

    if (step === 4) {
        // For moving forward we don't force amenities; for publishing yes.
        return true;
    }

    if (step === 5) return true;
    if (step === 6) return true;
    if (step === 7) return true;

    return true;
}

nextBtn.addEventListener("click", () => {
    // validate current step to proceed
    if (!validateStep(currentStep)) return;
    persist();

    if (currentStep < totalSteps) setStep(currentStep + 1, "forward");
    else setSavedHint("Wizard complete ✓");
});

prevBtn.addEventListener("click", () => {
    persist();
    setStep(currentStep - 1, "back");
});

saveDraftBtn.addEventListener("click", () => {
    collectFromUI();
    persist();
});

/**
 * Autosave on field changes (lightweight)
 */
[
    unitCategory, placeType, placeSearch, street, barangay, city, zip,
    guests, bedrooms, bathrooms, title, description, price, bookingType, dpType, dpValue, photosInput
].forEach(el => {
    if (!el) return;
    el.addEventListener("change", () => { collectFromUI(); persist(); });
});

document.querySelectorAll(".amenity").forEach(el => {
    el.addEventListener("change", () => { collectFromUI(); persist(); });
});
document.querySelectorAll(".payMethod").forEach(el => {
    el.addEventListener("change", () => { collectFromUI(); persist(); });
});

/**
 * Photos: store filenames (demo)
 */
photosInput.addEventListener("change", () => {
    const files = Array.from(photosInput.files || []);
    currentListing.photos = files.map(f => f.name);
    renderPhotos(currentListing.photos);
    persist();
});

/**
 * Publish (locked if not verified; also checks completeness)
 */
publishBtn.addEventListener("click", () => {
    if (verificationStatus !== "VERIFIED") {
        alert("Verification required to publish. Verify now to publish your listing.");
        return;
    }

    collectFromUI();

    // publish requirements
    const errors = [];
    if (!currentListing.unitCategory) errors.push("Unit category required");
    if (!currentListing.placeType) errors.push("Place type required");
    if (!currentListing.location.city) errors.push("City required");
    if (!currentListing.title || currentListing.title.trim().length < 5) errors.push("Title required (min 5 chars)");
    if (!currentListing.description || currentListing.description.trim().length < 20) errors.push("Description required (min 20 chars)");
    if (!currentListing.pricing.price || Number(currentListing.pricing.price) <= 0) errors.push("Price required");
    if (!currentListing.amenities || currentListing.amenities.length < 1) errors.push("Select at least 1 amenity");
    if (!currentListing.photos || currentListing.photos.length < 5) errors.push("Add at least 5 photos");

    if (errors.length) {
        alert("Cannot publish yet:\n- " + errors.join("\n- "));
        return;
    }

    currentListing.status = "PUBLISHED";
    persist();
    alert("Listing published! (Demo) It will now appear in tenant browsing once you build that page.");
});

/**
 * Nav buttons
 */
toDashboardBtn.addEventListener("click", () => {
    window.location.href = "../dashboard/property-owner-dashboard.html";
});
myListingsBtn.addEventListener("click", () => {
    window.location.href = "./my_listings.html";
});

/**
 * Initial load
 */
loadIntoUI();
applyVerificationUI();
setStep(1);

/**
 * Google Maps integration (later):
 * Call window.initMap() when you load Maps script.
 * - Metro Manila restriction (bounds + PH) + NCR city allowlist check
 */
window.initMap = function initMap() {
    // Requires Google Maps JS with places library loaded.
    // If not loaded, just keep the map placeholder.
    if (!window.google?.maps) return;

    const ncrBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(14.339, 120.917), // SW approx NCR
        new google.maps.LatLng(14.815, 121.177)  // NE approx NCR
    );

    const map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 14.5995, lng: 120.9842 },
        zoom: 12,
        restriction: { latLngBounds: ncrBounds, strictBounds: true },
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
    });

    const marker = new google.maps.Marker({ map, draggable: true });

    const ac = new google.maps.places.Autocomplete(placeSearch, {
        bounds: ncrBounds,
        strictBounds: true,
        componentRestrictions: { country: "ph" },
        fields: ["place_id", "geometry", "address_components", "formatted_address", "name"]
    });

    ac.addListener("place_changed", () => {
        const p = ac.getPlace();
        if (!p?.geometry?.location) return;

        const loc = p.geometry.location;
        const latVal = loc.lat();
        const lngVal = loc.lng();

        marker.setPosition(loc);
        map.panTo(loc);
        map.setZoom(16);

        lat.value = String(latVal);
        lng.value = String(lngVal);
        placeId.value = p.place_id || "";
        currentListing.location.lat = lat.value;
        currentListing.location.lng = lng.value;
        currentListing.location.placeId = placeId.value;

        // Autofill address pieces (editable)
        const comps = p.address_components || [];
        const get = (type) => comps.find(c => c.types.includes(type))?.long_name || "";

        // NOTE: PH address formats vary. We'll do best-effort mapping.
        const route = get("route");
        const streetNumber = get("street_number");
        const sublocality = get("sublocality") || get("sublocality_level_1");
        const locality = get("locality") || get("administrative_area_level_2");
        const postal = get("postal_code");

        street.value = [streetNumber, route].filter(Boolean).join(" ") || p.formatted_address || "";
        barangay.value = sublocality || "";
        city.value = locality || "";
        zip.value = postal || zip.value;

        // Basic NCR allowlist check (extra)
        const ncrCities = new Set([
            "Manila", "Quezon City", "Caloocan", "Las Piñas", "Makati", "Malabon", "Mandaluyong", "Marikina", "Muntinlupa",
            "Navotas", "Parañaque", "Pasay", "Pasig", "Pateros", "San Juan", "Taguig", "Valenzuela"
        ]);

        if (city.value && !ncrCities.has(city.value)) {
            alert("Metro Manila only. Please choose a location within NCR.");
            city.value = "";
        }

        // Save + autosave
        collectFromUI();
        persist();
    });

    // If marker moved, update lat/lng only (address stays editable)
    marker.addListener("dragend", (e) => {
        lat.value = String(e.latLng.lat());
        lng.value = String(e.latLng.lng());
        collectFromUI();
        persist();
    });
};
