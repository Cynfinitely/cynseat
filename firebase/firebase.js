// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyB9VrEGun4A7gBAbFP5b3Qx50_0fGTNTdI",
  authDomain: "cynseat-e0a85.firebaseapp.com",
  projectId: "cynseat-e0a85",
  storageBucket: "cynseat-e0a85.appspot.com",
  messagingSenderId: "870414365194",
  appId: "1:870414365194:web:45ca042bde3f75185425f3",
  measurementId: "G-X88BM7F3JN",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
