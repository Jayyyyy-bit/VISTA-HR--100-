lucide.createIcons();

const btnGetStarted = document.getElementById("getStartedBtn");

// OPTIONAL: if you have a back button on this page
const backBtn = document.getElementById("backBtn");

// Page exit helper (safe)
function exitTo(url) {
    document.body.classList.add("page-exit");
    setTimeout(() => {
        window.location.href = url;
    }, 350);
}

/**
 * Smooth reveal animation on scroll
 */
const revealElements = document.querySelectorAll(".reveal");

const io = new IntersectionObserver(
    (entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
                io.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.12 }
);

revealElements.forEach((el) => io.observe(el));

/**
 * Visual tilt effect
 */
const visual = document.querySelector(".visual-card");
if (visual) {
    visual.addEventListener("mousemove", (e) => {
        const rect = visual.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rx = ((y / rect.height) - 0.5) * -8;
        const ry = ((x / rect.width) - 0.5) * 10;

        visual.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });

    visual.addEventListener("mouseleave", () => {
        visual.style.transform = `perspective(900px) rotateX(0deg) rotateY(0deg)`;
    });
}

/**
 * ✅ Single Get Started redirect (NO duplicates)
 * From: Landing_Page/ASSETS/front_index.html
 * To:   Login_Register_Page/Signup/roles.html
 */
if (btnGetStarted) {
    btnGetStarted.addEventListener("click", () => {
        exitTo("../../Login_Register_Page/Signup/roles.html");
    });
}

/**
 * Back button (optional)
 */
if (backBtn) {
    backBtn.addEventListener("click", () => {
        exitTo("../../Landing_Page/ASSETS/front_index.html");
    });
}
