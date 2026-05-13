// ============================================================
//  firebase.js — Single shared Firebase initialization
//  Import from this file everywhere. Never call initializeApp
//  anywhere else. One app instance, no conflicts.
// ============================================================

import { initializeApp }    from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }          from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }     from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBUYsfVLBF6kF9pcnOguREn3dQQBvGfVbo",
  authDomain:        "andersonwholesale-2d4f4.firebaseapp.com",
  projectId:         "andersonwholesale-2d4f4",
  storageBucket:     "andersonwholesale-2d4f4.firebasestorage.app",
  messagingSenderId: "869988074727",
  appId:             "1:869988074727:web:f1b141289ba41d3d440e42"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
