// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyACd-2HqEf_kNuOeCzhWHLQzUHFuMr5y30",
    authDomain: "kgf-gym-d841d.firebaseapp.com",
    projectId: "kgf-gym-d841d",
    storageBucket: "kgf-gym-d841d.firebasestorage.app",
    messagingSenderId: "770965053226",
    appId: "1:770965053226:web:1b31d5dfa41d96bfb60853",
    measurementId: "G-F8N78ZP8YB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
