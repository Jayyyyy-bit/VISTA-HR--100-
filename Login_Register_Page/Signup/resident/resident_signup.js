lucide.createIcons();

const backBtn = document.getElementById("backBtn");
const togglePass = document.getElementById("togglePass");
const password = document.getElementById("password");
const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");
const form = document.getElementById("tenantForm");

document.getElementById("backBtn").addEventListener("click", () => {
    window.location.href = "../roles.html";
});

togglePass.addEventListener("click", () => {
    const isPass = password.type === "password";
    password.type = isPass ? "text" : "password";
    togglePass.innerHTML = isPass
        ? `<i data-lucide="eye-off"></i>`
        : `<i data-lucide="eye"></i>`;
    lucide.createIcons();
});

password.addEventListener("input", () => {
    const val = password.value;

    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const widths = ["20%", "40%", "65%", "100%"];
    strengthBar.style.width = widths[Math.min(score, 3)];

    const labels = [
        "Use at least 8 characters.",
        "Weak password — add uppercase / numbers.",
        "Good — add symbols for stronger security.",
        "Strong password ✓"
    ];
    strengthText.textContent = labels[Math.min(score, 3)];
});

form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Resident account created (UI only for now) ✅");
});
