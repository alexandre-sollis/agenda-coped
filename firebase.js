// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";

import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBrPfO6hA9xQ3CaTXHjhbH_dmmYh4e_AOE",
  authDomain: "drecac-3daaf.firebaseapp.com",
  projectId: "drecac-3daaf",
  storageBucket: "drecac-3daaf.firebasestorage.app",
  messagingSenderId: "566097625331",
  appId: "1:566097625331:web:9c3148348c86a688a0b786",
  measurementId: "G-PLX8GNWN7B"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const agendaRef = doc(db, "agenda", "principal");

export {
    db,
    agendaRef,
    getDoc,
    setDoc,
    onSnapshot
};
