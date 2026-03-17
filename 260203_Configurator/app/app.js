// UCL, Bartlett, RC5
import { AuthApi, auth, db, FsApi } from "../firebase/firebaseClient.js";
if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
}

const qs = new URLSearchParams(window.location.search);
const isPublic = qs.get("public") === "1";
const panelToolbar = document.querySelector(".panel.toolbar");
const sidebar = document.getElementById("sidebar");
const navCamera = document.getElementById("nav-camera");
const navChat = document.getElementById("nav-chat");

function togglePanel(el) {
    if (!el) return;
    el.classList.toggle("hidden");
}

function toggleSubmenu(submenu) {
    if (!submenu) return;
    sidebar.classList.add("expanded");
    const isOpen = !submenu.classList.contains("hidden");
    submenu.classList.toggle("hidden", isOpen);
    const section = submenu.closest(".nav-section");
    if (section) section.classList.toggle("open", !isOpen);
}

// Sidebar expand / collapse
const btnSidebarToggle = document.getElementById("btnSidebarToggle");
if (btnSidebarToggle) {
    btnSidebarToggle.onclick = () => {
        const expanding = !sidebar.classList.contains("expanded");
        sidebar.classList.toggle("expanded");
        if (!expanding) {
            // collapsing: close all open submenus
            document.querySelectorAll(".nav-submenu").forEach(m => m.classList.add("hidden"));
            document.querySelectorAll(".nav-section").forEach(s => s.classList.remove("open"));
        }
    };
}

// Nav section dropdown toggles
document.querySelectorAll(".nav-section-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        const submenu = document.getElementById(btn.dataset.target);
        toggleSubmenu(submenu);
    });
});

// Workflow lightbox
const workflowLightbox = document.getElementById("workflowLightbox");
const workflowThumb    = document.getElementById("workflowThumb");
const workflowClose    = document.getElementById("workflowLightboxClose");

if (workflowThumb) {
    workflowThumb.addEventListener("click", () => {
        workflowLightbox.classList.remove("hidden");
        workflowLightbox.querySelector(".workflow-lightbox-scroll").scrollTop = 0;
    });
}
if (workflowClose) {
    workflowClose.addEventListener("click", () => workflowLightbox.classList.add("hidden"));
}
if (workflowLightbox) {
    workflowLightbox.addEventListener("click", (e) => {
        if (e.target === workflowLightbox || e.target === workflowLightbox.querySelector(".workflow-lightbox-scroll")) {
            workflowLightbox.classList.add("hidden");
        }
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") workflowLightbox.classList.add("hidden");
    });
}

window.addEventListener("keydown", (e) => {
    if (e.target && (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT")) return;
    if (e.key === "1") togglePanel(panelToolbar);
    if (e.key === "2") toggleSubmenu(navCamera);
    if (e.key === "3") toggleSubmenu(navChat);
});

const room = qs.get("room");


async function ensureSpaceExists(uid, roomKey) {
    const ref = FsApi.doc(db, "users", uid, "spaces", roomKey);
    const snap = await FsApi.getDoc(ref);
    return snap.exists();
}

AuthApi.onAuthStateChanged(auth, async (user) => {
    if (!room) {
        window.location.replace(isPublic ? "../index.html" : "../library/library.html");
        return;
    }

    if (isPublic) {
        if (!user) {
            try {
                await AuthApi.signInAnonymously();
            } catch (e) {
                console.warn("Anonymous sign-in failed:", e?.message || e);
            }
        }
        await import("./three.js");
        return;
    }
    if (!user) {
        window.location.replace("../index.html");
        return;
    }

    const ok = await ensureSpaceExists(user.uid, room);
    if (!ok) {
        window.location.replace("../library/library.html");
        return;
    }

    await import("./three.js");
});
