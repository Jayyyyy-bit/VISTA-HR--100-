lucide.createIcons();

const btnOwner = document.getElementById("btnOwner");
const btnResident = document.getElementById("btnResident");
const backBtn = document.getElementById("backBtn");

function exitTo(url) {
    document.body.classList.add("page-exit");
    setTimeout(() => window.location.href = url, 320);
}

btnOwner.addEventListener("click", () => {
    exitTo("./property-owner/owner_signup.html");
});

btnResident.addEventListener("click", () => {
    exitTo("./resident/resident_signup.html");
});

backBtn.addEventListener("click", () => {
    exitTo("../../Landing_Page/ASSETS/front_index.html");
});