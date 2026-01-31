lucide.createIcons();

// =======================
// LocalStorage keys (demo)
// =======================
const LS_USERS_KEY = "vista_users";
const LS_SESSION_KEY = "vista_session_user";

// =======================
// Elements
// =======================
const form = document.getElementById("ownerForm");

const firstName = document.querySelector('input[name="firstName"]');
const lastName = document.querySelector('input[name="lastName"]');
const email = document.querySelector('input[name="email"]');

const phoneWrap = document.getElementById("phoneWrap");
const phone = document.getElementById("phone");

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

const togglePass = document.getElementById("togglePass");
const toggleConfirm = document.getElementById("toggleConfirm");

const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");

const agree = document.getElementById("agree");

// Errors
const firstNameError = document.getElementById("firstNameError");
const lastNameError = document.getElementById("lastNameError");
const emailError = document.getElementById("emailError");
const phoneError = document.getElementById("phoneError");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const agreeError = document.getElementById("agreeError");

// Back button
document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "../roles.html";
});

// =======================
// Storage helpers
// =======================
function readUsers() {
    try { return JSON.parse(localStorage.getItem(LS_USERS_KEY)) || []; }
    catch { return []; }
}
function saveUsers(users) {
    localStorage.setItem(LS_USERS_KEY, JSON.stringify(users));
}

// Demo-only hashing placeholder
function fakeHash(pw) {
    return btoa(unescape(encodeURIComponent(pw))).split("").reverse().join("");
}

// =======================
// Helpers (match resident vibe)
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

function isValidNamePart(value) {
    const v = value.trim();
    if (!v) return false;
    if (v.length < 2) return false;
    return /^[A-Za-z\s'-]+$/.test(v);
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

// Find the closest .field for shake/invalid border
function getFieldWrap(el) {
    return el?.closest(".field") || el;
}

function triggerShake(el) {
    const target = getFieldWrap(el);
    target.classList.remove("shake");
    void target.offsetWidth;
    target.classList.add("shake");
}

function setInvalid(inputEl, errEl, msg, shake = false) {
    const wrap = getFieldWrap(inputEl);
    if (inputEl?.classList) inputEl.classList.add("invalid");
    if (wrap?.classList && wrap !== inputEl) wrap.classList.add("invalid");
    if (errEl) errEl.textContent = msg || "";
    if (shake) triggerShake(inputEl);
}

function setValid(inputEl, errEl) {
    const wrap = getFieldWrap(inputEl);
    if (inputEl?.classList) inputEl.classList.remove("invalid");
    if (wrap?.classList && wrap !== inputEl) wrap.classList.remove("invalid");
    if (errEl) errEl.textContent = "";
}

function scrollToField(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (el?.focus) el.focus();
}

// =======================
// Live: First/Last sanitize + titlecase + inline validation
// =======================
[firstName, lastName].forEach((el) => {
    el.addEventListener("input", () => {
        el.value = titleCaseWords(sanitizeNameInput(el.value));
        if (!el.value.trim()) return;

        if (el === firstName) {
            if (!isValidNamePart(el.value)) setInvalid(firstName, firstNameError, "First name must contain letters only.");
            else setValid(firstName, firstNameError);
        } else {
            if (!isValidNamePart(el.value)) setInvalid(lastName, lastNameError, "Last name must contain letters only.");
            else setValid(lastName, lastNameError);
        }
    });

    el.addEventListener("blur", () => {
        el.value = titleCaseWords(sanitizeNameInput(el.value.trim()));
    });
});

// =======================
// Live: Email
// =======================
email.addEventListener("input", () => {
    const val = email.value.trim();
    if (!val) { setValid(email, emailError); return; }
    if (!isEmailValid(val)) setInvalid(email, emailError, "Please enter a valid email address.");
    else setValid(email, emailError);
});

// =======================
// Live: Phone (+63 fixed) — 10 digits starting with 9
// =======================
phone.addEventListener("input", () => {
    phone.value = phone.value.replace(/\D/g, "");
    if (phone.value.length > 10) phone.value = phone.value.slice(0, 10);

    if (!phone.value) { setValid(phoneWrap, phoneError); return; }

    if (!phone.value.startsWith("9")) {
        setInvalid(phoneWrap, phoneError, "PH number must start with 9 (e.g. 9XXXXXXXXX).");
    } else if (phone.value.length < 10) {
        setInvalid(phoneWrap, phoneError, "Phone number must be 10 digits.");
    } else {
        setValid(phoneWrap, phoneError);
    }
});

// =======================
// Eye toggle FIX (show/hide + re-render lucide)
// =======================
function toggleEye(btn, input) {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.innerHTML = show ? `<i data-lucide="eye-off"></i>` : `<i data-lucide="eye"></i>`;
    lucide.createIcons();
}

togglePass.addEventListener("click", () => toggleEye(togglePass, password));
toggleConfirm.addEventListener("click", () => toggleEye(toggleConfirm, confirmPassword));

// =======================
// Password strength + inline validation
// =======================
password.addEventListener("input", () => {
    if (password.value.length > 16) password.value = password.value.slice(0, 16);

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
        setValid(password, passwordError);
        return;
    }

    const errs = validatePassword(val);
    if (errs.length) {
        strengthText.textContent = errs[0];
        setInvalid(password, passwordError, errs[0], false);
    } else {
        strengthText.textContent = "Strong password ✓";
        setValid(password, passwordError);
    }

    // live confirm match
    if (confirmPassword.value) {
        if (confirmPassword.value !== password.value) {
            setInvalid(confirmPassword, confirmPasswordError, "Passwords do not match.", false);
        } else {
            setValid(confirmPassword, confirmPasswordError);
        }
    }
});

confirmPassword.addEventListener("input", () => {
    if (!confirmPassword.value) {
        setValid(confirmPassword, confirmPasswordError);
        return;
    }
    if (confirmPassword.value !== password.value) {
        setInvalid(confirmPassword, confirmPasswordError, "Passwords do not match.", false);
    } else {
        setValid(confirmPassword, confirmPasswordError);
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
    const em = email.value.trim().toLowerCase();
    const ph = phone.value.trim();
    const pw = password.value;
    const cpw = confirmPassword.value;

    // First name
    if (!fn) {
        setInvalid(firstName, firstNameError, "First name is required.", true);
        ok = false; firstInvalid ??= firstName;
    } else if (!isValidNamePart(fn)) {
        setInvalid(firstName, firstNameError, "First name must contain letters only.", true);
        ok = false; firstInvalid ??= firstName;
    } else {
        setValid(firstName, firstNameError);
    }

    // Last name
    if (!ln) {
        setInvalid(lastName, lastNameError, "Last name is required.", true);
        ok = false; firstInvalid ??= lastName;
    } else if (!isValidNamePart(ln)) {
        setInvalid(lastName, lastNameError, "Last name must contain letters only.", true);
        ok = false; firstInvalid ??= lastName;
    } else {
        setValid(lastName, lastNameError);
    }

    // Email
    if (!em) {
        setInvalid(email, emailError, "Email is required.", true);
        ok = false; firstInvalid ??= email;
    } else if (!isEmailValid(em)) {
        setInvalid(email, emailError, "Please enter a valid email address.", true);
        ok = false; firstInvalid ??= email;
    } else {
        const users = readUsers();
        const exists = users.some(u => (u.email || "").toLowerCase() === em);
        if (exists) {
            setInvalid(email, emailError, "This email is already registered.", true);
            ok = false; firstInvalid ??= email;
        } else {
            setValid(email, emailError);
        }
    }

    // Phone
    if (!ph) {
        setInvalid(phoneWrap, phoneError, "Phone number is required.", true);
        ok = false; firstInvalid ??= phone;
    } else if (ph.length !== 10 || !ph.startsWith("9")) {
        setInvalid(phoneWrap, phoneError, "Enter valid number: +63 9XXXXXXXXX", true);
        ok = false; firstInvalid ??= phone;
    } else {
        setValid(phoneWrap, phoneError);
    }

    // Password
    const pwErrors = validatePassword(pw);
    if (!pw) {
        setInvalid(password, passwordError, "Password is required.", true);
        ok = false; firstInvalid ??= password;
    } else if (pwErrors.length) {
        setInvalid(password, passwordError, pwErrors[0], true);
        ok = false; firstInvalid ??= password;
    } else {
        setValid(password, passwordError);
    }

    // Confirm
    if (!cpw) {
        setInvalid(confirmPassword, confirmPasswordError, "Please confirm your password.", true);
        ok = false; firstInvalid ??= confirmPassword;
    } else if (cpw !== pw) {
        setInvalid(confirmPassword, confirmPasswordError, "Passwords do not match.", true);
        ok = false; firstInvalid ??= confirmPassword;
    } else {
        setValid(confirmPassword, confirmPasswordError);
    }

    // Agree
    if (!agree.checked) {
        agreeError.textContent = "You must agree to continue.";
        ok = false;
        if (!firstInvalid) firstInvalid = agree;
    } else {
        agreeError.textContent = "";
    }

    if (!ok) {
        if (firstInvalid && firstInvalid !== agree) scrollToField(firstInvalid);
        return;
    }

    // ✅ Create owner account (demo storage)
    const users = readUsers();

    const newUser = {
        id: (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now())),
        role: "PROPERTY_OWNER",
        firstName: fn,
        lastName: ln,
        fullName: `${fn} ${ln}`,
        email: em,
        phone: "+63" + ph,
        passwordHash: fakeHash(pw),
        verificationStatus: "UNVERIFIED",
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);

    localStorage.setItem(LS_SESSION_KEY, JSON.stringify({ userId: newUser.id, role: newUser.role }));

    // ✅ Option B: after signup → go straight to create listing wizard
    window.location.href = "../../../Property-Owner/listings/create_listing.html";
});
