// firebaseAuth.js — Firebase #1 (para autenticação)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD27OrBtrUCzyZzC8hAlfpTH7aPAYplOUg",
  authDomain: "delibery-auth.firebaseapp.com",
  databaseURL: "https://delibery-auth-default-rtdb.firebaseio.com",
  projectId: "delibery-auth",
  storageBucket: "delibery-auth.firebasestorage.app",
  messagingSenderId: "67540689774",
  appId: "1:67540689774:web:36e7f883f9ec7941bad77f",
  measurementId: "G-6VSRFRQ9MQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

export default auth;
