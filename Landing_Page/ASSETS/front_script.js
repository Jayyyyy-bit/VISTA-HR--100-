lucide.createIcons();

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
 * Optional: small "tilt" effect on hero visual for premium feel
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

    document.getElementById("getStartedBtn").addEventListener("click", () => {
        document.body.classList.add("page-exit");
        setTimeout(() => {
            window.location.href = "role.html";
        }, 350);
    });

}
