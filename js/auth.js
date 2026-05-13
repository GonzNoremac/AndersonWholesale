// ============================================================
//  auth.js — Shared Firebase Auth logic
//  Used by: login.html
// ============================================================

import { initializeApp }         from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged }
                                  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

// ============================================================
//  ON LOAD — If already signed in, redirect to auction
// ============================================================
onAuthStateChanged(auth, user => {
  if (user) {
    window.location.href = "index.html";
  }
});

// ============================================================
//  LOGIN
// ============================================================
window.login = async function () {
  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl  = document.getElementById("login-error");
  const btn      = document.getElementById("login-btn");

  errorEl.style.display = "none";

  if (!email || !password) {
    errorEl.textContent    = "Please enter your email and password.";
    errorEl.style.display  = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged will fire and redirect
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "Sign In";
    errorEl.textContent   = friendlyAuthError(err.code);
    errorEl.style.display = "block";
  }
};

// ============================================================
//  FRIENDLY ERROR MESSAGES
// ============================================================
function friendlyAuthError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    default:
      return "Sign in failed. Please try again.";
  }
}
