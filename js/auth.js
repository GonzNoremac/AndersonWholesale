// ============================================================
//  auth.js — Login page logic
// ============================================================

import { auth }                              from "./firebase.js";
import { signInWithEmailAndPassword,
         onAuthStateChanged }                from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// If already signed in, skip login page entirely
onAuthStateChanged(auth, user => {
  if (user) window.location.href = "index.html";
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
    errorEl.textContent   = "Please enter your email and password.";
    errorEl.style.display = "block";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged fires and redirects
  } catch (err) {
    btn.disabled    = false;
    btn.textContent = "Sign In";
    errorEl.textContent   = friendlyAuthError(err.code);
    errorEl.style.display = "block";
  }
};

function friendlyAuthError(code) {
  switch (code) {
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":  return "Incorrect email or password.";
    case "auth/too-many-requests":   return "Too many attempts. Please try again later.";
    case "auth/invalid-email":       return "Please enter a valid email address.";
    default:                         return "Sign in failed. Please try again.";
  }
}
