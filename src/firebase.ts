import { initializeApp, getApps } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCMC0bKqZY9vVxC2a_yGWV1fGnmNSGTYlo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "karak-pos-v4.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://karak-pos-v4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "karak-pos-v4",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "karak-pos-v4.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "149652853063",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:149652853063:web:d8f6e223aa76a6aa503c62",
}

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const db = getDatabase(app)
