// ============================================================
//  users.js — User management
//  Stores users directly in Firestore users collection.
//  No Auth account created here — that comes later with
//  an invite flow. Document ID is auto-generated.
// ============================================================

import { auth, db }                          from "./firebase.js";
import { onAuthStateChanged, signOut
         as fbSignOut }                      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, addDoc,
         doc, getDoc }                       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  STATE
// ============================================================
let authResolved = false;

// ============================================================
//  AUTH GATE
// ============================================================
onAuthStateChanged(auth, async user => {
  if (authResolved) return;
  authResolved = true;

  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists() || userSnap.data().role !== "admin") {
      alert("Access denied. Admin accounts only.");
      await fbSignOut(auth);
      window.location.href = "../login.html";
      return;
    }
  } catch (err) {
    console.error("Role check failed:", err);
    window.location.href = "../login.html";
    return;
  }

  document.getElementById("header-user").textContent     = user.email;
  document.getElementById("user-menu").style.display     = "block";
  document.getElementById("admin-content").style.display = "block";

  loadUsers();
});

// ============================================================
//  USER MENU
// ============================================================
window.toggleUserMenu = function () {
  document.getElementById("user-menu-dropdown").classList.toggle("open");
};

document.addEventListener("click", e => {
  const menu = document.getElementById("user-menu");
  if (menu && !menu.contains(e.target)) {
    document.getElementById("user-menu-dropdown")?.classList.remove("open");
  }
});

window.adminSignOut = async function () {
  authResolved = false;
  await fbSignOut(auth);
  window.location.href = "../login.html";
};

// ============================================================
//  LOAD USERS
// ============================================================
async function loadUsers() {
  const listEl = document.getElementById("users-list");
  listEl.innerHTML = `<p class="users-empty">Loading...</p>`;

  try {
    const snapshot = await getDocs(collection(db, "users"));

    document.getElementById("users-count").textContent =
      snapshot.empty ? "" : `(${snapshot.size})`;

    if (snapshot.empty) {
      listEl.innerHTML = `<p class="users-empty">No users yet. Add one above.</p>`;
      return;
    }

    const users = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    listEl.innerHTML = `
      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Added</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.email || "—"}</td>
                <td>${u.phone || "—"}</td>
                <td>
                  <span class="role-badge ${u.role === "admin" ? "admin" : "buyer"}">
                    ${u.role || "buyer"}
                  </span>
                </td>
                <td>${u.createdAt
                  ? new Date(u.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric"
                    })
                  : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

  } catch (err) {
    console.error("Failed to load users:", err);
    listEl.innerHTML = `<p class="users-empty">Failed to load users. Please refresh.</p>`;
  }
}

// ============================================================
//  ADD USER
//  Writes directly to Firestore — no Auth account created.
//  Uses addDoc so Firestore auto-generates the document ID.
// ============================================================
window.createUser = async function () {
  const email   = document.getElementById("new-user-email").value.trim();
  const phone   = document.getElementById("new-user-phone").value.trim();
  const role    = document.getElementById("new-user-role").value;
  const errorEl = document.getElementById("create-user-error");
  const btn     = document.getElementById("create-user-btn");

  errorEl.style.display = "none";

  if (!email) {
    errorEl.textContent   = "Email is required.";
    errorEl.style.display = "block";
    return;
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errorEl.textContent   = "Please enter a valid email address.";
    errorEl.style.display = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Adding...";

  try {
    await addDoc(collection(db, "users"), {
      email,
      phone:     phone || "",
      role,
      createdAt: new Date().toISOString()
    });

    // Clear form
    document.getElementById("new-user-email").value = "";
    document.getElementById("new-user-phone").value = "";
    document.getElementById("new-user-role").value  = "buyer";

    showToast(`User added: ${email}`);
    loadUsers();

  } catch (err) {
    console.error("Failed to add user:", err);
    errorEl.textContent   = "Failed to add user. Please try again.";
    errorEl.style.display = "block";
  } finally {
    btn.disabled    = false;
    btn.textContent = "Add User";
  }
};

// ============================================================
//  TOAST
// ============================================================
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}
