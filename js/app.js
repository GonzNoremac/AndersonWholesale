// ============================================================
//  app.js — Buyer-facing auction SRP
//  Requires: Firebase Auth + Firestore
// ============================================================

import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut as fbSignOut }
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

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ============================================================
//  STATE
// ============================================================
let allVehicles   = [];
let activeFilter  = "all";
let submittedBids = {};   // { stockNumber: true } — amounts never stored client-side
let currentUser   = null;

// ============================================================
//  AUTH GATE
//  Page stays hidden until Firebase confirms a logged-in user
// ============================================================
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUser = user;

  // Show header user info and sign out button
  document.getElementById("header-user").textContent = user.email;
  document.getElementById("btn-signout").style.display = "inline-block";

  // Reveal main content and load data
  document.getElementById("main-content").style.display = "block";
  loadAuctionMeta();
  loadVehicles();
});

// ============================================================
//  SIGN OUT
// ============================================================
window.signOut = async function () {
  await fbSignOut(auth);
  window.location.href = "login.html";
};

// ============================================================
//  LOAD AUCTION META
//  Document: auctions/current { status, closesAt }
// ============================================================
async function loadAuctionMeta() {
  try {
    const snap = await getDoc(doc(db, "auctions", "current"));
    if (!snap.exists()) return;

    const { status, closesAt } = snap.data();

    const statusEl = document.getElementById("auction-status");
    statusEl.textContent = status === "open" ? "Auction Open" : "Auction Closed";
    statusEl.className   = `auction-status ${status === "open" ? "open" : "closed"}`;

    if (closesAt) {
      const date = closesAt.toDate ? closesAt.toDate() : new Date(closesAt);
      const fmt  = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      document.getElementById("auction-close").textContent  = `Closes ${fmt}`;
      document.getElementById("stat-closes").textContent    =
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

  } catch (err) {
    console.error("Failed to load auction meta:", err);
  }
}

// ============================================================
//  LOAD VEHICLES
//  Collection: vehicles — reserve field never rendered
// ============================================================
async function loadVehicles() {
  const listEl = document.getElementById("vehicle-list");
  listEl.innerHTML = `<div class="state-message"><strong>Loading inventory...</strong>Please wait.</div>`;

  try {
    const snapshot = await getDocs(collection(db, "vehicles"));

    if (snapshot.empty) {
      listEl.innerHTML = `<div class="state-message"><strong>No vehicles listed.</strong>Check back when the next auction opens.</div>`;
      return;
    }

    allVehicles = snapshot.docs.map(d => {
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
        // reserve intentionally excluded from client state
      };
    });

    updateStats();
    buildStoreFilters();
    renderVehicles();

  } catch (err) {
    console.error("Failed to load vehicles:", err);
    listEl.innerHTML = `<div class="state-message"><strong>Could not load inventory.</strong>Please refresh or contact support.</div>`;
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
//  RENDER VEHICLE LIST
// ============================================================
function renderVehicles() {
  const filtered = activeFilter === "all"
    ? allVehicles
    : allVehicles.filter(v => v.store === activeFilter);

  document.getElementById("showing-label").textContent =
    `Showing ${filtered.length} vehicle${filtered.length !== 1 ? "s" : ""}`;

  const listEl = document.getElementById("vehicle-list");

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="state-message"><strong>No vehicles found.</strong>Try a different store filter.</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(v => buildVehicleRow(v)).join("");
}

// ============================================================
//  BUILD VEHICLE ROW
// ============================================================
function buildVehicleRow(v) {
  const isSubmitted  = submittedBids[v.stock];
  const displayColor = (!v.color || v.color === "0") ? "—" : v.color;
  const displayMiles = (!v.miles || Number(v.miles) === 0)
    ? "—"
    : Number(v.miles).toLocaleString();
  const storeName = v.store.replace("Anderson ", "");

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
        <span class="store-name">${storeName}</span>
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
      <div class="col-bid">
        ${bidColumn}
      </div>
    </div>
  `;
}

// ============================================================
//  BID INPUT HANDLER
// ============================================================
window.onBidInput = function (stock) {
  const val = parseInt(document.getElementById(`input-${stock}`).value);
  document.getElementById(`btn-${stock}`).disabled = !val || val < 1;
};

// ============================================================
//  SUBMIT BID
//  Writes to: bids/{stock}_{userId}
//  Amount stored in Firestore — never rendered back to buyer
// ============================================================
window.submitBid = async function (stock) {
  const input  = document.getElementById(`input-${stock}`);
  const amount = parseInt(input.value);
  if (!amount || amount < 1) return;

  const btn = document.getElementById(`btn-${stock}`);
  btn.disabled    = true;
  btn.textContent = "Saving...";

  try {
    const bidRef = doc(db, "bids", `${stock}_${currentUser.uid}`);
    await setDoc(bidRef, {
      stock:     stock,
      buyerId:   currentUser.uid,
      buyerEmail: currentUser.email,
      amount:    amount,
      timestamp: new Date().toISOString()
    });

    submittedBids[stock] = true;
    updateBidStat();

    // Re-render just this row
    const vehicle = allVehicles.find(v => v.stock === stock);
    const rowEl   = document.getElementById(`row-${stock}`);
    if (rowEl && vehicle) rowEl.outerHTML = buildVehicleRow(vehicle);

    showToast(`Bid submitted — ${stock}`);

  } catch (err) {
    console.error("Bid submission failed:", err);
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
