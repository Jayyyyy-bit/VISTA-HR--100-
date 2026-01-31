lucide.createIcons();

// =======================
// Elements
// =======================
const form = document.getElementById("residentForm");

const firstName = document.querySelector('input[name="firstName"]');
const lastName = document.querySelector('input[name="lastName"]');
const email = document.querySelector('input[name="email"]');

const phoneWrap = document.getElementById("phoneWrap");
const phone = document.getElementById("phone");

const password = document.getElementById("password");
const togglePass = document.getElementById("togglePass");

const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");

// Errors
const firstNameError = document.getElementById("firstNameError");
const lastNameError = document.getElementById("lastNameError");
const emailError = document.getElementById("emailError");
const phoneError = document.getElementById("phoneError");
const passError = document.getElementById("passError");

// Back button
document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "../roles.html";
});

// =======================
// Helpers
// =======================
function titleCaseWords(str) {
    return str
        .toLowerCase()
        .split(" ")
        .filter(Boolean)
        .map(word =>
            word
                .split("-")
                .map(part =>
                    part
                        .split("'")
                        .map(p => (p ? p[0].toUpperCase() + p.slice(1) : ""))
                        .join("'")
                )
                .join("-")
        )
        .join(" ");
}

function sanitizeNameInput(value) {
    return value.replace(/[^a-zA-Z\s'-]/g, "");
}

function isEmailValid(val) {
    return /^\S+@\S+\.\S+$/.test(val);
}

function validatePassword(pw) {
    const errors = [];
    if (pw.length < 8) errors.push("Use at least 8 characters.");
    if (pw.length > 16) errors.push("Max 16 characters only.");
    if (!/[a-z]/.test(pw)) errors.push("Add a lowercase letter.");
    if (!/[A-Z]/.test(pw)) errors.push("Add an uppercase letter.");
    if (!/[0-9]/.test(pw)) errors.push("Add a number.");
    if (!/[^A-Za-z0-9]/.test(pw)) errors.push("Add a special character.");
    return errors;
}

function getFieldWrap(el) {
    return el?.closest(".field") || el;
}

function triggerShake(el) {
    const target = getFieldWrap(el);
    target.classList.remove("shake");
    void target.offsetWidth; // restart animation
    target.classList.add("shake");
}

function setInvalid(inputEl, errEl, msg, shake = false) {
    const wrap = getFieldWrap(inputEl);

    // invalid style
    if (inputEl.classList) inputEl.classList.add("invalid");
    if (wrap.classList && wrap !== inputEl) wrap.classList.add("invalid");

    if (errEl) errEl.textContent = msg;

    if (shake) triggerShake(inputEl);
}

function setValid(inputEl, errEl) {
    const wrap = getFieldWrap(inputEl);

    if (inputEl.classList) inputEl.classList.remove("invalid");
    if (wrap.classList && wrap !== inputEl) wrap.classList.remove("invalid");

    if (errEl) errEl.textContent = "";
}

function scrollToField(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
}

// =======================
// Name fields (live sanitize + auto caps)
// =======================
[firstName, lastName].forEach((input) => {
    const errEl = input === firstName ? firstNameError : lastNameError;

    input.addEventListener("input", () => {
        const cleaned = sanitizeNameInput(input.value);
        input.value = titleCaseWords(cleaned);

        // no shaking here, just clear errors when user fixes
        if (!input.value.trim()) {
            setValid(input, errEl);
            return;
        }

        if (!/^[A-Za-z\s'-]+$/.test(input.value.trim())) {
            setInvalid(input, errEl, "Name must contain letters only.");
        } else {
            setValid(input, errEl);
        }
    });

    input.addEventListener("blur", () => {
        input.value = titleCaseWords(sanitizeNameInput(input.value.trim()));
    });
});

// =======================
// Email (live)
// =======================
email.addEventListener("input", () => {
    const val = email.value.trim();

    if (!val) {
        setValid(email, emailError);
        return;
    }

    if (!isEmailValid(val)) {
        setInvalid(email, emailError, "Please enter a valid email address.");
    } else {
        setValid(email, emailError);
    }
});

// =======================
// Phone (+63 fixed) — user types 10 digits starting with 9
// =======================
phone.addEventListener("input", () => {
    phone.value = phone.value.replace(/\D/g, "");

    if (phone.value.length > 10) {
        phone.value = phone.value.slice(0, 10);
    }

    // while typing, no shake
    if (!phone.value) {
        setValid(phoneWrap, phoneError);
        return;
    }

    if (!phone.value.startsWith("9")) {
        setInvalid(phoneWrap, phoneError, "PH number must start with 9 (e.g. 9XXXXXXXXX).");
    } else if (phone.value.length < 10) {
        setInvalid(phoneWrap, phoneError, "Phone number must be 10 digits.");
    } else {
        setValid(phoneWrap, phoneError);
    }
});

// =======================
// Password toggle
// =======================
togglePass.addEventListener("click", () => {
    const isPass = password.type === "password";
    password.type = isPass ? "text" : "password";

    togglePass.innerHTML = isPass
        ? `<i data-lucide="eye-off"></i>`
        : `<i data-lucide="eye"></i>`;

    lucide.createIcons();
});

// =======================
// Password strength + inline error (NO SHAKE here)
// =======================
password.addEventListener("input", () => {
    if (password.value.length > 16) {
        password.value = password.value.slice(0, 16);
    }

    const val = password.value;
    let score = 0;

    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const widths = ["12%", "30%", "50%", "70%", "100%"];
    strengthBar.style.width = widths[Math.min(score, 4)];

    if (!val) {
        strengthText.textContent = "Use 8–16 characters with upper/lower/number/special.";
        setValid(password, passError);
        return;
    }

    const errs = validatePassword(val);
    if (errs.length) {
        strengthText.textContent = errs[0];
        setInvalid(password, passError, errs[0], false);
    } else {
        strengthText.textContent = "Strong password ✓";
        setValid(password, passError);
    }
});

// =======================
// Submit validation (SHAKE ONLY HERE)
// =======================
form.addEventListener("submit", (e) => {
    e.preventDefault();

    let ok = true;
    let firstInvalid = null;

    const fn = firstName.value.trim();
    const ln = lastName.value.trim();
    const em = email.value.trim();
    const ph = phone.value.trim();
    const pw = password.value;

    // First name
    if (!fn) {
        setInvalid(firstName, firstNameError, "First name is required.", true);
        ok = false;
        firstInvalid ??= firstName;
    } else if (!/^[A-Za-z\s'-]+$/.test(fn)) {
        setInvalid(firstName, firstNameError, "First name must contain letters only.", true);
        ok = false;
        firstInvalid ??= firstName;
    } else {
        setValid(firstName, firstNameError);
    }

    // Last name
    if (!ln) {
        setInvalid(lastName, lastNameError, "Last name is required.", true);
        ok = false;
        firstInvalid ??= lastName;
    } else if (!/^[A-Za-z\s'-]+$/.test(ln)) {
        setInvalid(lastName, lastNameError, "Last name must contain letters only.", true);
        ok = false;
        firstInvalid ??= lastName;
    } else {
        setValid(lastName, lastNameError);
    }

    // Email
    if (!em) {
        setInvalid(email, emailError, "Email is required.", true);
        ok = false;
        firstInvalid ??= email;
    } else if (!isEmailValid(em)) {
        setInvalid(email, emailError, "Please enter a valid email address.", true);
        ok = false;
        firstInvalid ??= email;
    } else {
        setValid(email, emailError);
    }

    // Phone
    if (!ph) {
        setInvalid(phoneWrap, phoneError, "Phone number is required.", true);
        ok = false;
        firstInvalid ??= phone;
    } else if (ph.length !== 10 || !ph.startsWith("9")) {
        setInvalid(phoneWrap, phoneError, "Enter valid number: +63 9XXXXXXXXX", true);
        ok = false;
        firstInvalid ??= phone;
    } else {
        setValid(phoneWrap, phoneError);
    }

    // Password
    const pwErrors = validatePassword(pw);
    if (!pw) {
        setInvalid(password, passError, "Password is required.", true);
        ok = false;
        firstInvalid ??= password;
    } else if (pwErrors.length) {
        setInvalid(password, passError, pwErrors[0], true);
        ok = false;
        firstInvalid ??= password;
    } else {
        setValid(password, passError);
    }

    if (!ok) {
        if (firstInvalid) scrollToField(firstInvalid);
        return;
    }

    console.log("Resident account created (UI only) ✅");
});
