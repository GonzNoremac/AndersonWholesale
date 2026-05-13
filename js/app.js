// ============================================================
//  app.js — Buyer-facing auction SRP
// ============================================================

import { auth, db }                          from "./firebase.js";
import { onAuthStateChanged, signOut
         as fbSignOut }                      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs, doc,
         setDoc, getDoc, query,
         where }                             from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  STATE
// ============================================================
let allVehicles   = [];
let activeFilter  = "all";
let submittedBids = {};
let currentUser   = null;
let activeSession = null;

// ============================================================
//  AUTH GATE
//  Wait for Firebase to confirm auth state before doing anything.
//  Redirects to login if no user. Does not redirect if user exists.
// ============================================================
let authResolved = false;

onAuthStateChanged(auth, async user => {
  if (authResolved) return;   // Ignore subsequent fires
  authResolved = true;

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  // Show user menu
  document.getElementById("header-user").textContent = user.email;
  document.getElementById("user-menu").style.display = "block";

  // Check admin role — show Admin Panel link if applicable
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists() && userSnap.data().role === "admin") {
      document.getElementById("menu-admin-link").style.display = "block";
    }
  } catch (err) {
    console.error("Could not read user role:", err);
  }

  document.getElementById("main-content").style.display = "block";
  loadAuctionMeta();
  loadVehicles();
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

window.signOut = async function () {
  authResolved = false;
  await fbSignOut(auth);
  window.location.href = "login.html";
};

// ============================================================
//  LOAD AUCTION META — reads the active session
// ============================================================
async function loadAuctionMeta() {
  try {
    const snapshot = await getDocs(
      query(collection(db, "sessions"), where("status", "==", "active"))
    );

    if (snapshot.empty) {
      const statusEl = document.getElementById("auction-status");
      statusEl.textContent = "No Active Auction";
      statusEl.className   = "auction-status closed";
      return;
    }

    activeSession = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };

    const statusEl = document.getElementById("auction-status");
    statusEl.textContent = "Auction Open";
    statusEl.className   = "auction-status open";

    if (activeSession.closesAt) {
      const date = activeSession.closesAt.toDate
        ? activeSession.closesAt.toDate()
        : new Date(activeSession.closesAt);
      const fmt = date.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
      });
      document.getElementById("auction-close").textContent = `Closes ${fmt}`;
      document.getElementById("stat-closes").textContent   =
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

  } catch (err) {
    console.error("Failed to load auction meta:", err);
  }
}

// ============================================================
//  LOAD VEHICLES — from active session subcollection
// ============================================================
async function loadVehicles() {
  const listEl = document.getElementById("vehicle-list");
  listEl.innerHTML = `<div class="state-message"><strong>Loading inventory...</strong>Please wait.</div>`;

  try {
    // Find active session if not already loaded
    if (!activeSession) {
      const snapshot = await getDocs(
        query(collection(db, "sessions"), where("status", "==", "active"))
      );
      if (snapshot.empty) {
        listEl.innerHTML = `<div class="state-message"><strong>No active auction.</strong>Check back when the next auction opens.</div>`;
        return;
      }
      activeSession = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }

    const vehicleSnap = await getDocs(
      collection(db, "sessions", activeSession.id, "vehicles")
    );

    if (vehicleSnap.empty) {
      listEl.innerHTML = `<div class="state-message"><strong>No vehicles listed yet.</strong>Check back soon.</div>`;
      return;
    }

    allVehicles = vehicleSnap.docs.map(d => {
      const v = d.data();
      return {
        id:    d.id,
        stock: v["Stock #"] || "",
        store: v["Store"]   || "",
        year:  v["Year"]    || "",
        make:  v["Make"]    || "",
        model: v["Model"]   || "",
        color: v["Color"]   || "",
        vin:   v["VIN"]     || "",
        miles: v["Miles"]   || "",
        // reserve intentionally excluded
      };
    });

    updateStats();
    buildStoreFilters();
    renderVehicles();

  } catch (err) {
    console.error("Failed to load vehicles:", err);
    listEl.innerHTML = `<div class="state-message"><strong>Could not load inventory.</strong>Please refresh.</div>`;
  }
}

// ============================================================
//  STATS BAR
// ============================================================
function updateStats() {
  const stores = new Set(allVehicles.map(v => v.store)).size;
  document.getElementById("stat-total").textContent  = allVehicles.length;
  document.getElementById("stat-stores").textContent = stores;
  updateBidStat();
}

function updateBidStat() {
  document.getElementById("stat-bids").textContent = Object.keys(submittedBids).length;
}

// ============================================================
//  STORE FILTERS
// ============================================================
function buildStoreFilters() {
  const stores = ["all", ...new Set(allVehicles.map(v => v.store))];
  document.getElementById("filter-buttons").innerHTML = stores.map(store => {
    const label  = store === "all" ? "All" : store.replace("Anderson ", "");
    const active = store === "all" ? "active" : "";
    return `<button class="filter-btn ${active}" onclick="setFilter('${store}', this)">${label}</button>`;
  }).join("");
}

window.setFilter = function (store, btn) {
  activeFilter = store;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderVehicles();
};

// ============================================================
//  RENDER VEHICLES
// ============================================================
function renderVehicles() {
  const filtered = activeFilter === "all"
    ? allVehicles
    : allVehicles.filter(v => v.store === activeFilter);

  document.getElementById("showing-label").textContent =
    `Showing ${filtered.length} vehicle${filtered.length !== 1 ? "s" : ""}`;

  const listEl = document.getElementById("vehicle-list");

  if (!filtered.length) {
    listEl.innerHTML = `<div class="state-message"><strong>No vehicles found.</strong>Try a different store filter.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(v => buildVehicleRow(v)).join("");
}

// ============================================================
//  VEHICLE ROW
// ============================================================
function buildVehicleRow(v) {
  const isSubmitted  = submittedBids[v.stock];
  const displayColor = (!v.color || v.color === "0") ? "—" : v.color;
  const displayMiles = (!v.miles || Number(v.miles) === 0)
    ? "—" : Number(v.miles).toLocaleString();

  const bidColumn = isSubmitted
    ? `<span class="bid-submitted-tag">&#10003; Bid Submitted</span>`
    : `
      <div class="bid-input-group">
        <div class="bid-input-wrap">
          <span class="bid-dollar">$</span>
          <input
            class="bid-input"
            type="number"
            id="input-${v.stock}"
            placeholder="Your bid"
            min="1"
            step="100"
            aria-label="Bid amount for ${v.year} ${v.make} ${v.model}"
            oninput="onBidInput('${v.stock}')"
            onkeydown="if(event.key==='Enter') submitBid('${v.stock}')"
          />
        </div>
        <button
          class="bid-submit-btn"
          id="btn-${v.stock}"
          disabled
          onclick="submitBid('${v.stock}')"
        >Submit</button>
      </div>
    `;

  return `
    <div class="vehicle-row ${isSubmitted ? "bid-submitted" : ""}" id="row-${v.stock}">
      <div class="col-lot">
        <span class="stock-badge">${v.stock}</span>
        <span class="store-name">${v.store.replace("Anderson ", "")}</span>
      </div>
      <div class="col-info">
        <p class="vehicle-title">${v.year} ${v.make} ${v.model}</p>
        <div class="vehicle-fields">
          <div class="field">
            <span class="field-label">Color</span>
            <span class="field-value">${displayColor}</span>
          </div>
          <div class="field">
            <span class="field-label">Miles</span>
            <span class="field-value">${displayMiles}</span>
          </div>
          <div class="field">
            <span class="field-label">Store</span>
            <span class="field-value">${v.store}</span>
          </div>
        </div>
        <p class="vehicle-vin">VIN: ${v.vin}</p>
      </div>
      <div class="col-bid">${bidColumn}</div>
    </div>
  `;
}

// ============================================================
//  BID INPUT
// ============================================================
window.onBidInput = function (stock) {
  const val = parseInt(document.getElementById(`input-${stock}`).value);
  document.getElementById(`btn-${stock}`).disabled = !val || val < 1;
};

// ============================================================
//  SUBMIT BID — writes to sessions/{id}/bids/{stock}_{uid}
// ============================================================
window.submitBid = async function (stock) {
  if (!activeSession) return;
  const input  = document.getElementById(`input-${stock}`);
  const amount = parseInt(input.value);
  if (!amount || amount < 1) return;

  const btn = document.getElementById(`btn-${stock}`);
  btn.disabled    = true;
  btn.textContent = "Saving...";

  try {
    await setDoc(
      doc(db, "sessions", activeSession.id, "bids", `${stock}_${currentUser.uid}`),
      {
        stock,
        buyerId:    currentUser.uid,
        buyerEmail: currentUser.email,
        amount,
        timestamp:  new Date().toISOString()
      }
    );

    submittedBids[stock] = true;
    updateBidStat();

    const vehicle = allVehicles.find(v => v.stock === stock);
    const rowEl   = document.getElementById(`row-${stock}`);
    if (rowEl && vehicle) rowEl.outerHTML = buildVehicleRow(vehicle);

    showToast(`Bid submitted — ${stock}`);

  } catch (err) {
    console.error("Bid failed:", err);
    btn.disabled    = false;
    btn.textContent = "Submit";
    showToast("Something went wrong. Please try again.");
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
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
