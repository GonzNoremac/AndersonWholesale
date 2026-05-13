// ============================================================
//  admin.js — Admin dashboard
//  Firestore structure:
//    sessions/{sessionId}                 — auction session meta
//    sessions/{sessionId}/vehicles/{id}  — vehicles for that auction
//    sessions/{sessionId}/bids/{id}      — bids placed in that auction
//    users/{uid}                          — user accounts + roles
// ============================================================

import { initializeApp }           from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as fbSignOut,
         createUserWithEmailAndPassword }
                                    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc,
         getDoc, writeBatch, query, orderBy, updateDoc, serverTimestamp }
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

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ============================================================
//  STATE
// ============================================================
let currentUser       = null;
let activeSessionId   = null;   // Firestore doc ID of the active session
let parsedVehicles    = [];

// ============================================================
//  AUTH GATE
// ============================================================
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    alert("Access denied. Admin accounts only.");
    await fbSignOut(auth);
    window.location.href = "../login.html";
    return;
  }

  currentUser = user;
  document.getElementById("header-user").textContent     = user.email;
  document.getElementById("user-menu").style.display     = "block";
  document.getElementById("admin-content").style.display = "block";

  loadSessions();
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
  await fbSignOut(auth);
  window.location.href = "../login.html";
};

// ============================================================
//  SESSIONS — Load active + archived
// ============================================================
async function loadSessions() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "sessions"), orderBy("createdAt", "desc"))
    );

    const sessions  = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const active    = sessions.find(s => s.status === "active");
    const archived  = sessions.filter(s => s.status === "archived");

    // Render active session
    if (active) {
      activeSessionId = active.id;
      showActiveSession(active);
      loadInventory();
    } else {
      activeSessionId = null;
      document.getElementById("no-session-state").style.display    = "block";
      document.getElementById("active-session-state").style.display = "none";
    }

    // Render archived sessions
    renderArchivedSessions(archived);

  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

function showActiveSession(session) {
  document.getElementById("no-session-state").style.display    = "none";
  document.getElementById("active-session-state").style.display = "block";
  document.getElementById("active-session-name").textContent   = session.name;

  if (session.closesAt) {
    const date = session.closesAt.toDate
      ? session.closesAt.toDate()
      : new Date(session.closesAt);
    document.getElementById("auction-close-date").value = date.toISOString().split("T")[0];
  }
}

// ============================================================
//  CREATE SESSION
// ============================================================
window.createSession = async function () {
  const name = document.getElementById("new-session-name").value.trim();
  if (!name) { showToast("Please enter a name for the auction."); return; }

  try {
    const sessionRef = doc(collection(db, "sessions"));
    await setDoc(sessionRef, {
      name,
      status:    "active",
      createdAt: serverTimestamp(),
      closedAt:  null,
      closesAt:  null
    });

    showToast(`Auction "${name}" created.`);
    document.getElementById("new-session-name").value = "";
    loadSessions();

  } catch (err) {
    console.error("Failed to create session:", err);
    showToast("Failed to create auction. Please try again.");
  }
};

// ============================================================
//  SAVE AUCTION SETTINGS (close date)
// ============================================================
window.saveAuctionSettings = async function () {
  if (!activeSessionId) return;
  const dateVal = document.getElementById("auction-close-date").value;
  if (!dateVal) { showToast("Please set a close date."); return; }

  try {
    await updateDoc(doc(db, "sessions", activeSessionId), {
      closesAt: new Date(dateVal + "T23:59:59")
    });
    showToast("Auction settings saved.");
  } catch (err) {
    console.error("Failed to save settings:", err);
    showToast("Failed to save settings.");
  }
};

// ============================================================
//  CLOSE & ARCHIVE SESSION
// ============================================================
window.confirmCloseSession = function () {
  if (!confirm("Close this auction and move it to the archive? Buyers will no longer be able to bid. This cannot be undone.")) return;
  closeSession();
};

async function closeSession() {
  if (!activeSessionId) return;

  try {
    await updateDoc(doc(db, "sessions", activeSessionId), {
      status:   "archived",
      closedAt: serverTimestamp()
    });

    showToast("Auction closed and archived.");
    activeSessionId = null;
    loadSessions();

  } catch (err) {
    console.error("Failed to close session:", err);
    showToast("Failed to close auction.");
  }
}

// ============================================================
//  ARCHIVED SESSIONS LIST
// ============================================================
function renderArchivedSessions(archived) {
  const listEl = document.getElementById("archive-list");
  document.getElementById("archive-count").textContent =
    archived.length ? `(${archived.length})` : "";

  if (!archived.length) {
    listEl.innerHTML = `<div class="archive-empty">No past auctions yet. Closed auctions will appear here.</div>`;
    return;
  }

  listEl.innerHTML = `<div class="archive-grid">${archived.map(s => {
    const createdAt = s.createdAt?.toDate
      ? s.createdAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";
    const closedAt = s.closedAt?.toDate
      ? s.closedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

    return `
      <div class="archive-card">
        <div class="archive-card-info">
          <span class="session-name" style="font-size:15px;">${s.name}</span>
          <span class="session-badge archived">Archived</span>
        </div>
        <div class="archive-card-meta">
          <span>Opened ${createdAt}</span>
          <span>Closed ${closedAt}</span>
        </div>
        <button class="btn-secondary" onclick="viewArchive('${s.id}', '${s.name}')">View Results</button>
      </div>
    `;
  }).join("")}</div>`;
}

// ============================================================
//  VIEW ARCHIVED RESULTS (modal)
// ============================================================
window.viewArchive = async function (sessionId, sessionName) {
  document.getElementById("modal-title").textContent = `${sessionName} — Results`;
  document.getElementById("modal-body").innerHTML    = `<p style="color:var(--color-text-muted);text-align:center;padding:24px;">Loading results...</p>`;
  document.getElementById("modal-overlay").style.display = "block";
  document.getElementById("archive-modal").style.display = "flex";
  document.getElementById("archive-modal").style.flexDirection = "column";

  try {
    // Load vehicles and bids for this session in parallel
    const [vehicleSnap, bidSnap] = await Promise.all([
      getDocs(collection(db, "sessions", sessionId, "vehicles")),
      getDocs(collection(db, "sessions", sessionId, "bids"))
    ]);

    const vehicles = vehicleSnap.docs.map(d => d.data());
    const bids     = bidSnap.docs.map(d => d.data());

    // Group bids by stock — find highest bid per vehicle
    const bidsByStock = {};
    bids.forEach(bid => {
      if (!bidsByStock[bid.stock] || bid.amount > bidsByStock[bid.stock].amount) {
        bidsByStock[bid.stock] = bid;
      }
    });

    const soldCount   = vehicles.filter(v => bidsByStock[v["Stock #"]]).length;
    const totalBids   = bids.length;
    const totalValue  = Object.values(bidsByStock)
      .reduce((sum, b) => sum + (b.amount || 0), 0);

    document.getElementById("modal-body").innerHTML = `
      <div class="modal-stats">
        <div class="modal-stat">
          <div class="lbl">Vehicles</div>
          <div class="val">${vehicles.length}</div>
        </div>
        <div class="modal-stat">
          <div class="lbl">Sold</div>
          <div class="val">${soldCount}</div>
        </div>
        <div class="modal-stat">
          <div class="lbl">Total Bids</div>
          <div class="val">${totalBids}</div>
        </div>
      </div>

      <div class="results-table-wrap">
        <table class="results-table">
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Vehicle</th>
              <th>Store</th>
              <th>Miles</th>
              <th>Reserve</th>
              <th>Winning Bid</th>
              <th>Buyer</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${vehicles.sort((a,b) => (a["Stock #"]||"").localeCompare(b["Stock #"]||""))
              .map(v => {
                const winner     = bidsByStock[v["Stock #"]];
                const reserve    = Number(v["Reserve"] || 0);
                const hasBid     = !!winner;
                const metReserve = hasBid && winner.amount >= reserve;

                return `
                  <tr class="${hasBid ? "winner-row" : ""}">
                    <td>${v["Stock #"] || "—"}</td>
                    <td>${v["Year"] || ""} ${v["Make"] || ""} ${v["Model"] || ""}</td>
                    <td>${(v["Store"] || "—").replace("Anderson ", "")}</td>
                    <td>${(!v["Miles"] || Number(v["Miles"]) === 0) ? "—" : Number(v["Miles"]).toLocaleString()}</td>
                    <td>$${reserve.toLocaleString()}</td>
                    <td>${hasBid ? `$${Number(winner.amount).toLocaleString()}` : `<span class="no-bid-tag">No bids</span>`}</td>
                    <td>${hasBid ? (winner.buyerEmail || winner.buyerId) : "—"}</td>
                    <td>${hasBid
                      ? `<span class="sold-tag">${metReserve ? "Sold" : "Reserve not met"}</span>`
                      : "—"}</td>
                  </tr>
                `;
              }).join("")}
          </tbody>
        </table>
      </div>
    `;

  } catch (err) {
    console.error("Failed to load archive results:", err);
    document.getElementById("modal-body").innerHTML =
      `<p style="color:#A32D2D;text-align:center;padding:24px;">Failed to load results.</p>`;
  }
};

window.closeModal = function () {
  document.getElementById("modal-overlay").style.display = "none";
  document.getElementById("archive-modal").style.display = "none";
};

// ============================================================
//  CSV PARSE
// ============================================================
window.handleFileSelect = function (event) {
  const file = event.target.files[0];
  if (!file) return;
  document.getElementById("upload-filename").textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result);
  reader.readAsText(file);
};

function parseCSV(text) {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) { showToast("File appears empty or missing headers."); return; }

  const headers  = lines[0].split(",").map(h => h.trim());
  const required = ["Stock #", "Store", "Year", "Make", "Model", "Color", "VIN", "Miles", "Reserve"];
  const missing  = required.filter(r => !headers.includes(r));

  if (missing.length > 0) { showToast(`Missing columns: ${missing.join(", ")}`); return; }

  parsedVehicles = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj    = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  }).filter(v => v["Stock #"]);

  showPreview(headers, parsedVehicles);
}

function showPreview(headers, vehicles) {
  document.getElementById("preview-label").textContent = `${vehicles.length} vehicles ready to publish`;

  document.getElementById("preview-table").innerHTML = `
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${vehicles.slice(0, 10).map(v =>
        `<tr>${headers.map(h => `<td>${v[h] || "—"}</td>`).join("")}</tr>`
      ).join("")}
      ${vehicles.length > 10
        ? `<tr><td colspan="${headers.length}" style="text-align:center;color:var(--color-text-muted);font-style:italic;">
            ...and ${vehicles.length - 10} more vehicles
           </td></tr>`
        : ""}
    </tbody>
  `;

  document.getElementById("upload-preview").style.display = "block";
  document.getElementById("upload-actions").style.display = "flex";
}

window.clearUpload = function () {
  parsedVehicles = [];
  document.getElementById("csv-file").value              = "";
  document.getElementById("upload-filename").textContent = "No file selected";
  document.getElementById("upload-preview").style.display  = "none";
  document.getElementById("upload-actions").style.display  = "none";
  document.getElementById("upload-progress").style.display = "none";
};

// ============================================================
//  PUBLISH VEHICLES to sessions/{id}/vehicles
// ============================================================
window.uploadVehicles = async function () {
  if (!parsedVehicles.length || !activeSessionId) return;

  const progressBar = document.getElementById("progress-bar");
  const progressLbl = document.getElementById("progress-label");

  document.getElementById("upload-actions").style.display  = "none";
  document.getElementById("upload-progress").style.display = "block";

  const BATCH_SIZE = 499;
  const total      = parsedVehicles.length;
  let   uploaded   = 0;

  try {
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = parsedVehicles.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(vehicle => {
        const stockId = vehicle["Stock #"].replace(/[^a-zA-Z0-9]/g, "_");
        batch.set(doc(db, "sessions", activeSessionId, "vehicles", stockId), vehicle);
      });
      await batch.commit();
      uploaded += chunk.length;
      progressBar.style.width = `${Math.round((uploaded / total) * 100)}%`;
      progressLbl.textContent = `Publishing... ${uploaded} of ${total}`;
    }

    progressBar.style.width = "100%";
    progressLbl.textContent = `Done — ${total} vehicles published.`;
    showToast(`${total} vehicles published to the auction.`);
    loadInventory();
    setTimeout(() => clearUpload(), 2000);

  } catch (err) {
    console.error("Publish failed:", err);
    progressLbl.textContent = "Publish failed. Please try again.";
    showToast("Something went wrong. Please try again.");
  }
};

// ============================================================
//  LOAD CURRENT INVENTORY from active session
// ============================================================
async function loadInventory() {
  if (!activeSessionId) return;
  const listEl = document.getElementById("inventory-list");
  listEl.innerHTML = `<p class="inventory-empty">Loading...</p>`;

  try {
    const snapshot = await getDocs(
      collection(db, "sessions", activeSessionId, "vehicles")
    );

    document.getElementById("inventory-count").textContent =
      snapshot.empty ? "" : `(${snapshot.size})`;

    if (snapshot.empty) {
      listEl.innerHTML = `<p class="inventory-empty">No vehicles yet. Upload a CSV to publish inventory.</p>`;
      return;
    }

    const vehicles = snapshot.docs.map(d => d.data())
      .sort((a, b) => (a["Stock #"] || "").localeCompare(b["Stock #"] || ""));

    listEl.innerHTML = `
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Stock #</th><th>Store</th><th>Year</th><th>Make</th>
              <th>Model</th><th>Color</th><th>Miles</th><th>VIN</th><th>Reserve</th>
            </tr>
          </thead>
          <tbody>
            ${vehicles.map(v => `
              <tr>
                <td>${v["Stock #"] || "—"}</td>
                <td>${(v["Store"] || "—").replace("Anderson ", "")}</td>
                <td>${v["Year"]  || "—"}</td>
                <td>${v["Make"]  || "—"}</td>
                <td>${v["Model"] || "—"}</td>
                <td>${(!v["Color"] || v["Color"] === "0") ? "—" : v["Color"]}</td>
                <td>${(!v["Miles"] || Number(v["Miles"]) === 0) ? "—" : Number(v["Miles"]).toLocaleString()}</td>
                <td style="font-family:var(--font-mono);font-size:11px;">${v["VIN"] || "—"}</td>
                <td>$${Number(v["Reserve"] || 0).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load inventory:", err);
    listEl.innerHTML = `<p class="inventory-empty">Failed to load vehicles.</p>`;
  }
}

window.confirmClearInventory = function () {
  if (!confirm("Remove all vehicles from this auction? This cannot be undone.")) return;
  clearInventory();
};

async function clearInventory() {
  if (!activeSessionId) return;
  try {
    const snapshot = await getDocs(
      collection(db, "sessions", activeSessionId, "vehicles")
    );
    for (let i = 0; i < snapshot.docs.length; i += 499) {
      const batch = writeBatch(db);
      snapshot.docs.slice(i, i + 499).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }
    showToast("All vehicles removed.");
    loadInventory();
  } catch (err) {
    console.error("Failed to remove vehicles:", err);
    showToast("Failed to remove vehicles.");
  }
}

// ============================================================
//  USER MANAGEMENT
// ============================================================
async function loadUsers() {
  const listEl = document.getElementById("users-list");
  listEl.innerHTML = `<p class="users-empty">Loading...</p>`;

  try {
    const snapshot = await getDocs(collection(db, "users"));
    document.getElementById("users-count").textContent =
      snapshot.empty ? "" : `(${snapshot.size})`;

    if (snapshot.empty) {
      listEl.innerHTML = `<p class="users-empty">No users found.</p>`;
      return;
    }

    const users = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }))
      .sort((a, b) => (a.email || "").localeCompare(b.email || ""));

    listEl.innerHTML = `
      <div class="users-table-wrap">
        <table class="users-table">
          <thead>
            <tr>
              <th>Email</th><th>Role</th><th>Created</th><th>UID</th>
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
                  ? new Date(u.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"}</td>
                <td style="font-family:var(--font-mono);font-size:11px;color:var(--color-text-muted);">${u.uid}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error("Failed to load users:", err);
    listEl.innerHTML = `<p class="users-empty">Failed to load users.</p>`;
  }
}

window.createUser = async function () {
  const email    = document.getElementById("new-user-email").value.trim();
  const password = document.getElementById("new-user-password").value;
  const role     = document.getElementById("new-user-role").value;
  const errorEl  = document.getElementById("create-user-error");

  errorEl.style.display = "none";

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

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", credential.user.uid), {
      email,
      role,
      createdAt: new Date().toISOString()
    });

    document.getElementById("new-user-email").value    = "";
    document.getElementById("new-user-password").value = "";
    document.getElementById("new-user-role").value     = "buyer";

    showToast(`User created: ${email}`);
    loadUsers();

  } catch (err) {
    console.error("Failed to create user:", err);
    errorEl.textContent   = friendlyAuthError(err.code);
    errorEl.style.display = "block";
  }
};

function friendlyAuthError(code) {
  switch (code) {
    case "auth/email-already-in-use": return "An account with that email already exists.";
    case "auth/invalid-email":        return "Please enter a valid email address.";
    case "auth/weak-password":        return "Password must be at least 6 characters.";
    default:                          return "Failed to create user. Please try again.";
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
