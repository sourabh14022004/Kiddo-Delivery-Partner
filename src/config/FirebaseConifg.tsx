// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAfdCHr6Du2NFBw07d9J4n4TPtEdOAZJZg",
  authDomain: "kiddo-delivery-partners.firebaseapp.com",
  projectId: "kiddo-delivery-partners",
  storageBucket: "kiddo-delivery-partners.firebasestorage.app",
  messagingSenderId: "946155341358",
  appId: "1:946155341358:web:db5fb94602baf0964841bf"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);