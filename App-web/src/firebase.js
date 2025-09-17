// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

import { getMessaging } from "firebase/messaging"; // แจ้งเตือน Firebase

import { getAuth, GoogleAuthProvider, FacebookAuthProvider, connectAuthEmulator } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDV5NWCWi52L3SvBM572k4rjPnaBfhTi1I",
  authDomain: "iot2-4910c.firebaseapp.com",
  databaseURL: "https://iot2-4910c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "iot2-4910c",
  storageBucket: "iot2-4910c.firebasestorage.app",
  messagingSenderId: "747687773927",
  appId: "1:747687773927:web:88b9b3c52dbdd76796c442"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

const messaging = getMessaging(app); // สำหรับการแจ้งเตือน Firebase

export { db, rtdb , messaging};
