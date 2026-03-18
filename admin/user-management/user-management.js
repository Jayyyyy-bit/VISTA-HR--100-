document.addEventListener("DOMContentLoaded", async () => {
    const LOGIN_URL = "/auth/login.html";
    const API_BASE = "http://127.0.0.1:5000/api";

    let me = null;

    try {
        if (window.AuthGuard?.fetchMe) {
            const res = await window.AuthGuard.fetchMe();
            if (res?.ok) {
                me = res.data?.user || null;
            }
        }

        if (!me) {
            const raw = await fetch(`${API_BASE}/auth/me`, {
                credentials: "include"
            }).then(r => r.json()).catch(() => null);

            me = raw?.user || raw?.data?.user || null;
        }
    } catch (e) {
        me = null;
    }

    if (!me) {
        window.location.replace(LOGIN_URL);
        return;
    }

    if (String(me.role || "").toUpperCase() !== "ADMIN") {
        alert("Admin access only.");
        window.location.replace(LOGIN_URL);
        return;
    }

    let users = [];
    let editingId = null;

    const adminLogoutBtn = document.getElementById("adminLogoutBtn");

    const tableBody = document.getElementById("userTableBody");
    const searchInput = document.getElementById("searchInput");
    const roleFilter = document.getElementById("roleFilter");
    const statusFilter = document.getElementById("statusFilter");

    const addUserBtn = document.getElementById("addUserBtn");
    const modalOverlay = document.getElementById("modalOverlay");
    const closeModalBtn = document.getElementById("closeModalBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const saveUserBtn = document.getElementById("saveUserBtn");
    const modalTitle = document.getElementById("modalTitle");

    const nameInput = document.getElementById("nameInput");
    const emailInput = document.getElementById("emailInput");
    const roleInput = document.getElementById("roleInput");
    const statusInput = document.getElementById("statusInput");

    const totalUsers = document.getElementById("totalUsers");
    const totalAdmins = document.getElementById("totalAdmins");
    const totalOwners = document.getElementById("totalOwners");
    const totalResidents = document.getElementById("totalResidents");

    function mapRoleToBackend(role) {
        if (role === "Admin") return "ADMIN";
        if (role === "Property Owner") return "OWNER";
        return "RESIDENT";
    }

    function mapRoleFromBackend(role) {
        if (role === "ADMIN") return "Admin";
        if (role === "OWNER") return "Property Owner";
        return "Resident";
    }

    function apiStatusToUi(user) {
        if (user.is_suspended) return "Suspended";
        if (!user.is_verified) return "Pending";
        return "Active";
    }

    async function apiFetch(path, options = {}) {
        const res = await fetch(`${API_BASE}${path}`, {
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || data?.error || "Request failed");
        return data;
    }

    function getStatusClass(status) {
        return status.toLowerCase();
    }

    function openModal(mode = "add", user = null) {
        modalOverlay.classList.add("open");

        if (mode === "edit" && user) {
            editingId = user.id;
            modalTitle.textContent = "Edit User";
            nameInput.value = user.name;
            emailInput.value = user.email;
            roleInput.value = user.role;
            statusInput.value = user.status;
        } else {
            editingId = null;
            modalTitle.textContent = "Add User";
            nameInput.value = "";
            emailInput.value = "";
            roleInput.value = "Resident";
            statusInput.value = "Active";
        }
    }

    function closeModal() {
        modalOverlay.classList.remove("open");
    }

    function renderStats() {
        totalUsers.textContent = users.length;
        totalAdmins.textContent = users.filter(u => u.role === "Admin").length;
        totalOwners.textContent = users.filter(u => u.role === "Property Owner").length;
        totalResidents.textContent = users.filter(u => u.role === "Resident").length;
    }

    function renderUsers() {
        const keyword = searchInput.value.trim().toLowerCase();
        const roleValue = roleFilter.value;
        const statusValue = statusFilter.value;

        const filtered = users.filter(user => {
            const matchesKeyword =
                user.name.toLowerCase().includes(keyword) ||
                user.email.toLowerCase().includes(keyword) ||
                user.role.toLowerCase().includes(keyword);

            const matchesRole = roleValue === "all" || user.role === roleValue;
            const matchesStatus = statusValue === "all" || user.status === statusValue;

            return matchesKeyword && matchesRole && matchesStatus;
        });

        tableBody.innerHTML = filtered.map(user => `
            <tr>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td><span class="badge ${getStatusClass(user.status)}">${user.status}</span></td>
                <td>
                    <div class="actionRow">
                        <button class="actionBtn" data-action="edit" data-id="${user.id}">Edit</button>
                        <button class="actionBtn" data-action="toggle" data-id="${user.id}">
                            ${user.status === "Suspended" ? "Activate" : "Suspend"}
                        </button>
                        <button class="actionBtn danger" data-action="delete" data-id="${user.id}">Delete</button>
                    </div>
                </td>
            </tr>
        `).join("");

        renderStats();
    }

    async function loadUsers() {
        const data = await apiFetch("/users");
        users = (data.users || []).map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: mapRoleFromBackend(u.role),
            status: apiStatusToUi(u),
            is_verified: !!u.is_verified,
            is_suspended: !!u.is_suspended,
        }));
        renderUsers();
    }

    tableBody.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;

        const id = Number(btn.dataset.id);
        const action = btn.dataset.action;
        const user = users.find(u => u.id === id);
        if (!user) return;

        if (action === "edit") {
            openModal("edit", user);
            return;
        }

        if (action === "toggle") {
            try {
                await apiFetch(`/users/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        name: user.name,
                        email: user.email,
                        role: mapRoleToBackend(user.role),
                        is_verified: user.is_verified,
                        is_suspended: !user.is_suspended,
                    }),
                });
                await loadUsers();
            } catch (err) {
                alert(err.message);
            }
            return;
        }

        if (action === "delete") {
            try {
                await apiFetch(`/users/${id}`, { method: "DELETE" });
                await loadUsers();
            } catch (err) {
                alert(err.message);
            }
        }
    });

    saveUserBtn.addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const role = roleInput.value;
        const status = statusInput.value;

        if (!name || !email) {
            alert("Please fill out the required fields.");
            return;
        }

        const payload = {
            name,
            email,
            role: mapRoleToBackend(role),
            password: "12345678",
            is_verified: status !== "Pending",
            is_suspended: status === "Suspended",
        };

        try {
            if (editingId !== null) {
                await apiFetch(`/users/${editingId}`, {
                    method: "PUT",
                    body: JSON.stringify(payload),
                });
            } else {
                await apiFetch("/users", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
            }

            closeModal();
            await loadUsers();
        } catch (err) {
            alert(err.message);
        }
    });

    addUserBtn.addEventListener("click", () => openModal("add"));
    closeModalBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    searchInput.addEventListener("input", renderUsers);
    roleFilter.addEventListener("change", renderUsers);
    statusFilter.addEventListener("change", renderUsers);

    await loadUsers();

    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }

    // ── Admin view tabs ───────────────────────────────────────
    const adminTabs = document.querySelectorAll(".adminTab");
    const viewUsers = document.getElementById("viewUsers");
    const viewKyc = document.getElementById("viewKyc");
    const viewStudent = document.getElementById("viewStudent");
    const kycBadge = document.getElementById("kycBadge");
    const studentBadge = document.getElementById("studentBadge");

    let currentView = "users";

    adminTabs.forEach(tab => {
        tab.addEventListener("click", async () => {
            adminTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            currentView = tab.dataset.view;
            viewUsers.hidden = currentView !== "users";
            viewKyc.hidden = currentView !== "kyc";
            viewStudent.hidden = currentView !== "student";

            if (currentView === "kyc") await loadKyc();
            if (currentView === "student") await loadStudent();
        });
    });

    // Preload badge counts
    async function refreshBadges() {
        try {
            const [kData, sData] = await Promise.all([
                apiFetch("/admin/kyc?status=PENDING"),
                apiFetch("/admin/student?status=PENDING"),
            ]);
            const kCount = (kData.kyc_applications || []).length;
            const sCount = (sData.student_applications || []).length;
            if (kycBadge) { kycBadge.textContent = kCount; kycBadge.hidden = kCount === 0; }
            if (studentBadge) { studentBadge.textContent = sCount; studentBadge.hidden = sCount === 0; }
        } catch { }
    }
    refreshBadges();

    // ── KYC view ──────────────────────────────────────────────
    let kycStatusFilter = "PENDING";

    document.querySelectorAll("#viewKyc .verifyFilterBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#viewKyc .verifyFilterBtn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            kycStatusFilter = btn.dataset.status;
            loadKyc();
        });
    });

    async function loadKyc() {
        const list = document.getElementById("kycList");
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/kyc?status=${kycStatusFilter}`);
            const items = data.kyc_applications || [];
            if (!items.length) {
                list.innerHTML = `<div class="verifyEmpty">No ${kycStatusFilter.toLowerCase()} KYC applications.</div>`;
                return;
            }
            list.innerHTML = items.map(u => kycCardHTML(u)).join("");
            bindVerifyActions(list, "kyc");
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function kycCardHTML(u) {
        const statusCls = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" }[u.kyc_status] || "pending";
        const submitted = u.kyc_submitted_at ? new Date(u.kyc_submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
        const isPending = u.kyc_status === "PENDING";
        const rejectNote = u.kyc_reject_reason ? `<div class="verifyReason">Reason: ${escHtml(u.kyc_reject_reason)}</div>` : "";

        return `
        <div class="verifyCard" data-id="${u.id}">
            <div class="verifyCardTop">
                <div class="verifyCardInfo">
                    <div class="verifyName">${escHtml(u.name)}</div>
                    <div class="verifyEmail">${escHtml(u.email)}</div>
                    <div class="verifyMeta">Submitted ${submitted}</div>
                    ${rejectNote}
                </div>
                <span class="badge ${statusCls}">${u.kyc_status}</span>
            </div>
            <div class="verifyDocs">
                ${u.kyc_id_front_url ? `<a href="${u.kyc_id_front_url}" target="_blank" class="docThumb"><img src="${u.kyc_id_front_url}" alt="ID Front"/><span>Front</span></a>` : ""}
                ${u.kyc_id_back_url ? `<a href="${u.kyc_id_back_url}"  target="_blank" class="docThumb"><img src="${u.kyc_id_back_url}"  alt="ID Back"/><span>Back</span></a>` : ""}
                ${u.kyc_selfie_url ? `<a href="${u.kyc_selfie_url}"   target="_blank" class="docThumb"><img src="${u.kyc_selfie_url}"   alt="Selfie"/><span>Selfie</span></a>` : ""}
            </div>
            ${isPending ? `
            <div class="verifyActions">
                <button class="btn solid verifyApprove" data-action="kyc-approve" data-id="${u.id}">Approve</button>
                <button class="btn ghost verifyReject"  data-action="kyc-reject"  data-id="${u.id}">Reject</button>
            </div>` : ""}
        </div>`;
    }

    // ── Student view ──────────────────────────────────────────
    let studentStatusFilter = "PENDING";

    document.querySelectorAll("#viewStudent .verifyFilterBtn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#viewStudent .verifyFilterBtn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            studentStatusFilter = btn.dataset.status;
            loadStudent();
        });
    });

    async function loadStudent() {
        const list = document.getElementById("studentList");
        list.innerHTML = `<div class="verifyLoading">Loading…</div>`;
        try {
            const data = await apiFetch(`/admin/student?status=${studentStatusFilter}`);
            const items = data.student_applications || [];
            if (!items.length) {
                list.innerHTML = `<div class="verifyEmpty">No ${studentStatusFilter.toLowerCase()} student applications.</div>`;
                return;
            }
            list.innerHTML = items.map(u => studentCardHTML(u)).join("");
            bindVerifyActions(list, "student");
            if (window.lucide?.createIcons) lucide.createIcons();
        } catch (err) {
            list.innerHTML = `<div class="verifyEmpty">Failed to load. ${err.message}</div>`;
        }
    }

    function studentCardHTML(u) {
        const statusCls = { PENDING: "pending", APPROVED: "approved", REJECTED: "rejected" }[u.student_status] || "pending";
        const submitted = u.student_submitted_at ? new Date(u.student_submitted_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—";
        const isPending = u.student_status === "PENDING";
        const rejectNote = u.student_reject_reason ? `<div class="verifyReason">Reason: ${escHtml(u.student_reject_reason)}</div>` : "";

        return `
        <div class="verifyCard" data-id="${u.id}">
            <div class="verifyCardTop">
                <div class="verifyCardInfo">
                    <div class="verifyName">${escHtml(u.name)}</div>
                    <div class="verifyEmail">${escHtml(u.email)}</div>
                    <div class="verifyMeta">Submitted ${submitted}</div>
                    ${rejectNote}
                </div>
                <span class="badge ${statusCls}">${u.student_status}</span>
            </div>
            <div class="verifyDocs">
                ${u.student_id_url ? `<a href="${u.student_id_url}"  target="_blank" class="docThumb"><img src="${u.student_id_url}"  alt="School ID"/><span>School ID</span></a>` : ""}
                ${u.student_cor_url ? `<a href="${u.student_cor_url}" target="_blank" class="docThumb"><img src="${u.student_cor_url}" alt="CoR"/><span>CoR</span></a>` : ""}
            </div>
            ${isPending ? `
            <div class="verifyActions">
                <button class="btn solid verifyApprove" data-action="student-approve" data-id="${u.id}">Approve</button>
                <button class="btn ghost verifyReject"  data-action="student-reject"  data-id="${u.id}">Reject</button>
            </div>` : ""}
        </div>`;
    }

    // ── Shared approve/reject handler ─────────────────────────
    function bindVerifyActions(container, type) {
        container.querySelectorAll("[data-action]").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.dataset.id;
                const action = btn.dataset.action;

                if (action.endsWith("-approve")) {
                    if (!confirm("Approve this application?")) return;
                    const endpoint = type === "kyc"
                        ? `/admin/kyc/${id}/approve`
                        : `/admin/student/${id}/approve`;
                    try {
                        await apiFetch(endpoint, { method: "POST" });
                        if (type === "kyc") loadKyc(); else loadStudent();
                        refreshBadges();
                    } catch (err) { alert(err.message); }
                }

                if (action.endsWith("-reject")) {
                    const reason = prompt("Enter a reason for rejection (shown to the user):");
                    if (reason === null) return; // cancelled
                    const endpoint = type === "kyc"
                        ? `/admin/kyc/${id}/reject`
                        : `/admin/student/${id}/reject`;
                    try {
                        await apiFetch(endpoint, {
                            method: "POST",
                            body: JSON.stringify({ reason: reason.trim() || "Documents were unclear." }),
                        });
                        if (type === "kyc") loadKyc(); else loadStudent();
                        refreshBadges();
                    } catch (err) { alert(err.message); }
                }
            });
        });
    }

    function escHtml(str) {
        return String(str || "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    adminLogoutBtn?.addEventListener("click", async () => {
        await fetch("http://127.0.0.1:5000/api/auth/logout", {
            method: "POST",
            credentials: "include"
        }).catch(() => { });
        window.location.replace("/auth/login.html");
    });
});