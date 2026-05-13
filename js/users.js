// ============================================================
//  users.js — User management page
//
//  KEY FIX: User creation uses a SECONDARY Firebase app instance
//  so that creating a new Auth account never signs out the admin.
//  The secondary app is signed out immediately after the account
//  is created — it only exists long enough to register the user.
// ============================================================

import { initializeApp }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as fbSignOut,
         createUserWithEmailAndPassword }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc }
                                   from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyBUYsfVLBF6kF9pcnOguREn3dQQBvGfVbo",
  authDomain:        "andersonwholesale-2d4f4.firebaseapp.com",
  projectId:         "andersonwholesale-2d4f4",
  storageBucket:     "andersonwholesale-2d4f4.firebasestorage.app",
  messagingSenderId: "869988074727",
  appId:             "1:869988074727:web:f1b141289ba41d3d440e42"
};

// Primary app — maintains the admin's session
const primaryApp  = initializeApp(firebaseConfig, "primary-users");
const primaryAuth = getAuth(primaryApp);
const db          = getFirestore(primaryApp);

// Secondary app — used only for creating new users, never disrupts admin session
const secondaryApp  = initializeApp(firebaseConfig, "secondary");
const secondaryAuth = getAuth(secondaryApp);

// ============================================================
//  STATE
// ============================================================
let currentUser = null;

// ============================================================
//  AUTH GATE
// ============================================================
onAuthStateChanged(primaryAuth, async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    alert("Access denied. Admin accounts only.");
    await fbSignOut(primaryAuth);
    window.location.href = "../login.html";
    return;
  }

  currentUser = user;
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
  await fbSignOut(primaryAuth);
  window.location.href = "../login.html";
};

// ============================================================
//  LOAD USERS from Firestore users collection
// ============================================================
async function loadUsers() {
  const listEl = document.getElementById("users-list");
  listEl.innerHTML = `<p class="users-empty">Loading...</p>`;

  try {
    const snapshot = await getDocs(collection(db, "users"));

    document.getElementById("users-count").textContent =
      snapshot.empty ? "" : `(${snapshot.size})`;

    if (snapshot.empty) {
      listEl.innerHTML = `<p class="users-empty">No users yet. Create one above.</p>`;
      return;
    }

    const users = snapshot.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    listEl.innerHTML = `
      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
              <th>UID</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${u.email || "—"}</td>
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
                <td style="font-family:var(--font-mono);font-size:11px;
                    color:var(--color-text-muted);">${u.uid}</td>
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
//  CREATE USER
//  Uses secondary app instance so admin session is never touched
// ============================================================
window.createUser = async function () {
  const email    = document.getElementById("new-user-email").value.trim();
  const password = document.getElementById("new-user-password").value;
  const role     = document.getElementById("new-user-role").value;
  const errorEl  = document.getElementById("create-user-error");
  const btn      = document.getElementById("create-user-btn");

  errorEl.style.display = "none";

  // Validate
  if (!email || !password) {
    errorEl.textContent   = "Email and password are required.";
    errorEl.style.display = "block";
    return;
  }
  if (password.length < 6) {
    errorEl.textContent   = "Password must be at least 6 characters.";
    errorEl.style.display = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Creating...";

  try {
    // Step 1 — Create Auth account on SECONDARY app (admin stays signed in)
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth, email, password
    );
    const newUid = credential.user.uid;

    // Step 2 — Sign the secondary app out immediately
    await fbSignOut(secondaryAuth);

    // Step 3 — Write user doc to Firestore via PRIMARY app (still authenticated)
    await setDoc(doc(db, "users", newUid), {
      email,
      role,
      createdAt: new Date().toISOString()
    });

    // Clear form
    document.getElementById("new-user-email").value    = "";
    document.getElementById("new-user-password").value = "";
    document.getElementById("new-user-role").value     = "buyer";

    showToast(`User created: ${email}`);
    loadUsers();

  } catch (err) {
    console.error("Failed to create user:", err);
    errorEl.textContent   = friendlyAuthError(err.code);
    errorEl.style.display = "block";
  } finally {
    btn.disabled    = false;
    btn.textContent = "Create User";
  }
};

// ============================================================
//  FRIENDLY ERROR MESSAGES
// ============================================================
function friendlyAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    default:
      return "Failed to create user. Please try again.";
  }
}

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
