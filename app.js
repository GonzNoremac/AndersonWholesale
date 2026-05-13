// ============================================================
//  app.js — Anderson Auto Group Auction
//  Depends on: Firebase Firestore (loaded via CDN in index.html)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ============================================================
//  FIREBASE CONFIG
//  Replace these values with your project's config
// ============================================================
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ============================================================
//  STATE
// ============================================================
let allVehicles   = [];   // Full vehicle list from Firestore
let activeFilter  = "all"; // Currently selected store filter
let submittedBids = {};   // { stockNumber: true } — session only, no amounts shown

// ============================================================
//  INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadAuctionMeta();
  await loadVehicles();
});

// ============================================================
//  LOAD AUCTION META
//  Reads auction open/close status from Firestore
//  Expected document: auctions/current { status, closesAt }
// ============================================================
async function loadAuctionMeta() {
  try {
    const snap = await getDoc(doc(db, "auctions", "current"));
    if (!snap.exists()) return;

    const { status, closesAt } = snap.data();

    // Status badge
    const statusEl = document.getElementById("auction-status");
    statusEl.textContent = status === "open" ? "Auction Open" : "Auction Closed";
    statusEl.className   = `auction-status ${status === "open" ? "open" : "closed"}`;

    // Close date
    if (closesAt) {
      const date = closesAt.toDate ? closesAt.toDate() : new Date(closesAt);
      document.getElementById("auction-close").textContent =
        "Closes " + date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      document.getElementById("stat-closes").textContent =
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }

  } catch (err) {
    console.error("Failed to load auction meta:", err);
  }
}

// ============================================================
//  LOAD VEHICLES
//  Reads all vehicles from Firestore collection: vehicles
//  Reserve field is present in Firestore but never rendered
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

    // Map Firestore docs to plain objects — strip reserve from rendering layer
    allVehicles = snapshot.docs.map(d => {
      const data = d.data();
      return {
        id:    d.id,
        stock: data["Stock #"]  || "",
        store: data["Store"]    || "",
        year:  data["Year"]     || "",
        make:  data["Make"]     || "",
        model: data["Model"]    || "",
        color: data["Color"]    || "",
        vin:   data["VIN"]      || "",
        miles: data["Miles"]    || "",
        // reserve intentionally omitted here
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
//  UPDATE STATS BAR
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
//  BUILD STORE FILTER BUTTONS
//  Dynamically creates one button per unique store
// ============================================================
function buildStoreFilters() {
  const stores  = ["all", ...new Set(allVehicles.map(v => v.store))];
  const container = document.getElementById("filter-buttons");

  container.innerHTML = stores.map(store => {
    const label  = store === "all" ? "All" : store.replace("Anderson ", "");
    const active = store === "all" ? "active" : "";
    return `<button class="filter-btn ${active}" data-store="${store}" onclick="setFilter('${store}', this)">${label}</button>`;
  }).join("");
}

// ============================================================
//  SET STORE FILTER
// ============================================================
window.setFilter = function(store, btn) {
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
//  BUILD VEHICLE ROW HTML
// ============================================================
function buildVehicleRow(v) {
  const hasSubmitted = submittedBids[v.stock];
  const displayColor = (!v.color || v.color === "0") ? "—" : v.color;
  const displayMiles = (!v.miles || v.miles === "0") ? "—" : Number(v.miles).toLocaleString();
  const storeName    = v.store.replace("Anderson ", "");

  const bidColumn = hasSubmitted
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
        >
          Submit
        </button>
      </div>
    `;

  return `
    <div class="vehicle-row ${hasSubmitted ? "bid-submitted" : ""}" id="row-${v.stock}">

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
//  Enables / disables submit button based on input value
// ============================================================
window.onBidInput = function(stock) {
  const input = document.getElementById(`input-${stock}`);
  const btn   = document.getElementById(`btn-${stock}`);
  const val   = parseInt(input.value);
  btn.disabled = !val || val < 1;
};

// ============================================================
//  SUBMIT BID
//  Writes bid to Firestore: bids/{stock}_{buyerId}
//  Amount stored server-side; never rendered back to buyer
// ============================================================
window.submitBid = async function(stock) {
  const input  = document.getElementById(`input-${stock}`);
  const amount = parseInt(input.value);
  if (!amount || amount < 1) return;

  const btn = document.getElementById(`btn-${stock}`);
  btn.disabled   = true;
  btn.textContent = "Saving...";

  try {
    // TODO: replace "guest" with actual authenticated buyer ID
    const buyerId = "guest";
    const bidRef  = doc(db, "bids", `${stock}_${buyerId}`);

    await setDoc(bidRef, {
      stock:     stock,
      buyerId:   buyerId,
      amount:    amount,
      timestamp: new Date().toISOString()
    });

    // Mark as submitted in session state — no amount displayed
    submittedBids[stock] = true;
    updateBidStat();

    // Re-render just this row
    const vehicle = allVehicles.find(v => v.stock === stock);
    const rowEl   = document.getElementById(`row-${stock}`);
    if (rowEl && vehicle) rowEl.outerHTML = buildVehicleRow(vehicle);

    showToast(`Bid submitted for ${stock}`);

  } catch (err) {
    console.error("Bid submission failed:", err);
    btn.disabled    = false;
    btn.textContent = "Submit";
    showToast("Something went wrong. Please try again.");
  }
};

// ============================================================
//  TOAST NOTIFICATION
// ============================================================
let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3000);
}
