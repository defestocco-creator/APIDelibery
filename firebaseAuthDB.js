// firebaseAuthDB.js — RTDB do Firebase #1 (APP_CONFIG)
import { getDatabase } from "firebase/database";
import { initializeApp } from "firebase/app";


const firebasePedidosConfig = {
  apiKey: process.env.FB_API_KEY,
  authDomain: process.env.FB_AUTH_DOMAIN,
  databaseURL: process.env.FB_DB_URL,
  projectId: process.env.FB_PROJECT_ID,
  storageBucket: process.env.FB_BUCKET,
  messagingSenderId: process.env.FB_SENDER,
  appId: process.env.FB_APP_ID
};

const app = initializeApp(config, "auth-db");
const db = getDatabase(app);

export default db;
