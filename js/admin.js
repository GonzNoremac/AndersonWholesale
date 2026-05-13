// ============================================================
//  admin.js — Admin dashboard logic
//  Handles: auth gate, auction settings, CSV upload, inventory
// ============================================================

import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as fbSignOut }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc, writeBatch, deleteDoc }
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
let parsedVehicles = [];   // Vehicles parsed from CSV, awaiting upload
let currentUser    = null;

// ============================================================
//  ADMIN ROLE CHECK
//  Reads users/{uid} { role: "admin" } to verify access
// ============================================================
onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  // Check admin role in Firestore
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists() || userSnap.data().role !== "admin") {
    alert("Access denied. Admin accounts only.");
    await fbSignOut(auth);
    window.location.href = "../login.html";
    return;
  }

  currentUser = user;
  document.getElementById("header-user").textContent    = user.email;
  document.getElementById("btn-signout").style.display  = "inline-block";
  document.getElementById("admin-content").style.display = "block";

  loadAuctionSettings();
  loadInventory();
});

// ============================================================
//  SIGN OUT
// ============================================================
window.adminSignOut = async function () {
  await fbSignOut(auth);
  window.location.href = "../login.html";
};

// ============================================================
//  AUCTION SETTINGS
// ============================================================
async function loadAuctionSettings() {
  try {
    const snap = await getDoc(doc(db, "auctions", "current"));
    if (!snap.exists()) return;

    const { status, closesAt } = snap.data();
    document.getElementById("auction-status-select").value = status || "open";

    if (closesAt) {
      const date = closesAt.toDate ? closesAt.toDate() : new Date(closesAt);
      // Format as YYYY-MM-DD for date input
      document.getElementById("auction-close-date").value =
        date.toISOString().split("T")[0];
    }
  } catch (err) {
    console.error("Failed to load auction settings:", err);
  }
}

window.saveAuctionSettings = async function () {
  const status    = document.getElementById("auction-status-select").value;
  const dateVal   = document.getElementById("auction-close-date").value;

  if (!dateVal) {
    showToast("Please set a close date.");
    return;
  }

  try {
    await setDoc(doc(db, "auctions", "current"), {
      status,
      closesAt: new Date(dateVal + "T23:59:59")
    });
    showToast("Auction settings saved.");
  } catch (err) {
    console.error("Failed to save auction settings:", err);
    showToast("Failed to save settings.");
  }
};

// ============================================================
//  CSV PARSE
//  Reads the file client-side — no server needed
// ============================================================
window.handleFileSelect = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById("upload-filename").textContent = file.name;

  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    parseCSV(text);
  };
  reader.readAsText(file);
};

function parseCSV(text) {
  const lines = text.trim().split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    showToast("CSV appears empty or missing headers.");
    return;
  }

  const headers = lines[0].split(",").map(h => h.trim());
  const required = ["Stock #", "Store", "Year", "Make", "Model", "Color", "VIN", "Miles", "Reserve"];
  const missing  = required.filter(r => !headers.includes(r));

  if (missing.length > 0) {
    showToast(`Missing columns: ${missing.join(", ")}`);
    return;
  }

  parsedVehicles = lines.slice(1).map(line => {
    const values = line.split(",").map(v => v.trim());
    const obj    = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  }).filter(v => v["Stock #"]);  // Skip rows without a stock number

  showPreview(headers, parsedVehicles);
}

// ============================================================
//  PREVIEW TABLE
//  Reserve column is shown in admin preview (it IS admin)
// ============================================================
function showPreview(headers, vehicles) {
  const label = document.getElementById("preview-label");
  label.textContent = `${vehicles.length} vehicles ready to upload`;

  const table = document.getElementById("preview-table");
  table.innerHTML = `
    <thead>
      <tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${vehicles.slice(0, 10).map(v =>
        `<tr>${headers.map(h => `<td>${v[h] || "—"}</td>`).join("")}</tr>`
      ).join("")}
      ${vehicles.length > 10
        ? `<tr><td colspan="${headers.length}" style="text-align:center; color:var(--color-text-muted); font-style:italic;">
            ...and ${vehicles.length - 10} more rows
           </td></tr>`
        : ""}
    </tbody>
  `;

  document.getElementById("upload-preview").style.display = "block";
  document.getElementById("upload-actions").style.display = "flex";
}

window.clearUpload = function () {
  parsedVehicles = [];
  document.getElementById("csv-file").value             = "";
  document.getElementById("upload-filename").textContent = "No file selected";
  document.getElementById("upload-preview").style.display = "none";
  document.getElementById("upload-actions").style.display = "none";
  document.getElementById("upload-progress").style.display = "none";
};

// ============================================================
//  UPLOAD VEHICLES TO FIRESTORE
//  Uses batched writes — Firestore limit is 500 per batch
// ============================================================
window.uploadVehicles = async function () {
  if (!parsedVehicles.length) return;

  const progressWrap = document.getElementById("upload-progress");
  const progressBar  = document.getElementById("progress-bar");
  const progressLbl  = document.getElementById("progress-label");
  const uploadBtn    = document.getElementById("upload-btn");

  document.getElementById("upload-actions").style.display = "none";
  progressWrap.style.display = "block";
  uploadBtn.disabled = true;

  const BATCH_SIZE = 499;
  const total      = parsedVehicles.length;
  let   uploaded   = 0;

  try {
    // Process in chunks of 499
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const chunk = parsedVehicles.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach(vehicle => {
        const stockId = vehicle["Stock #"].replace(/[^a-zA-Z0-9]/g, "_");
        const ref     = doc(db, "vehicles", stockId);
        batch.set(ref, vehicle);
      });

      await batch.commit();
      uploaded += chunk.length;

      const pct = Math.round((uploaded / total) * 100);
      progressBar.style.width  = `${pct}%`;
      progressLbl.textContent  = `Uploading... ${uploaded} of ${total}`;
    }

    progressBar.style.width = "100%";
    progressLbl.textContent = `Done — ${total} vehicles uploaded.`;
    showToast(`${total} vehicles uploaded successfully.`);

    // Refresh inventory display
    loadInventory();
    setTimeout(() => clearUpload(), 2000);

  } catch (err) {
    console.error("Upload failed:", err);
    progressLbl.textContent = "Upload failed. Check console for details.";
    showToast("Upload failed. Please try again.");
  }
};

// ============================================================
//  LOAD CURRENT INVENTORY
// ============================================================
async function loadInventory() {
  const listEl = document.getElementById("inventory-list");
  listEl.innerHTML = `<p class="inventory-empty">Loading...</p>`;

  try {
    const snapshot = await getDocs(collection(db, "vehicles"));

    document.getElementById("inventory-count").textContent =
      snapshot.empty ? "" : `(${snapshot.size})`;

    if (snapshot.empty) {
      listEl.innerHTML = `<p class="inventory-empty">No vehicles in Firestore. Upload a CSV to get started.</p>`;
      return;
    }

    const vehicles = snapshot.docs.map(d => d.data());

    // Sort by stock number
    vehicles.sort((a, b) => (a["Stock #"] || "").localeCompare(b["Stock #"] || ""));

    listEl.innerHTML = `
      <div class="inventory-table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Store</th>
              <th>Year</th>
              <th>Make</th>
              <th>Model</th>
              <th>Color</th>
              <th>Miles</th>
              <th>VIN</th>
              <th>Reserve</th>
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
                <td style="font-family:var(--font-mono); font-size:11px;">${v["VIN"] || "—"}</td>
                <td>$${Number(v["Reserve"] || 0).toLocaleString()}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

  } catch (err) {
    console.error("Failed to load inventory:", err);
    listEl.innerHTML = `<p class="inventory-empty">Failed to load inventory.</p>`;
  }
}

// ============================================================
//  CLEAR ALL VEHICLES
// ============================================================
window.confirmClearInventory = function () {
  if (!confirm("Are you sure you want to delete ALL vehicles from Firestore? This cannot be undone.")) return;
  clearInventory();
};

async function clearInventory() {
  try {
    const snapshot = await getDocs(collection(db, "vehicles"));
    const BATCH_SIZE = 499;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    showToast("All vehicles cleared.");
    loadInventory();
  } catch (err) {
    console.error("Failed to clear inventory:", err);
    showToast("Failed to clear inventory.");
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
