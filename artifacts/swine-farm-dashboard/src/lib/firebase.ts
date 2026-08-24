import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
  type Database,
  type Unsubscribe,
  type DataSnapshot,
} from 'firebase/database';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(config).every(Boolean);

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let database: Database | undefined;

if (firebaseConfigured) {
  app = getApps()[0] ?? initializeApp(config);
  auth = getAuth(app);
  database = getDatabase(app);
}

export const firebaseAuth = auth;
export const firebaseDatabase = database;

export function subscribeToAuth(callback: (user: User | null) => void) {
  return auth ? onAuthStateChanged(auth, callback) : () => undefined;
}

export function signIn(email: string, password: string) {
  if (!auth) throw new Error('Firebase Authentication is not configured.');
  return signInWithEmailAndPassword(auth, email, password);
}

export function signOutUser() {
  if (auth) return signOut(auth);
  return Promise.resolve();
}

export function subscribeToPath<T>(
  path: string,
  callback: (value: T | null) => void,
): Unsubscribe {
  if (!database) return () => undefined;
  return onValue(ref(database, path), (snapshot) => callback(snapshot.val() as T | null));
}

export async function addAtPath<T>(path: string, value: T) {
  if (!database) throw new Error('Firebase Realtime Database is not configured.');
  const child = push(ref(database, path));
  await set(child, value);
  return child.key;
}

export async function addWithServerTimestamp<T extends Record<string, unknown>>(
  path: string,
  value: T,
  timestampField: 'createdAt' | 'timestamp',
) {
  if (!database) throw new Error('Firebase Realtime Database is not configured.');
  const child = push(ref(database, path));
  await set(child, { ...value, [timestampField]: { '.sv': 'timestamp' } });
  return child.key;
}

export function subscribeToCollection<T extends Record<string, unknown>>(
  path: string,
  callback: (value: Array<T & { id: string }>) => void,
): Unsubscribe {
  if (!database) return () => undefined;
  return onValue(ref(database, path), (snapshot: DataSnapshot) => {
    const value = snapshot.val() as Record<string, T> | null;
    callback(value ? Object.entries(value).map(([id, item]) => ({ ...item, id })) : []);
  });
}

export async function initializeDatabase() {
  if (!database) throw new Error('Firebase Realtime Database is not configured.');
  await update(ref(database), {
    'system/systemStatus': 'OFFLINE',
    'system/feederStatus': 'IDLE',
    'system/feederStatusReason': 'UNKNOWN',
    'system/rinseStatus': 'IDLE',
    'system/pumpStatus': 'OFF',
    'system/wifiStatus': 'DISCONNECTED',
    'system/firebaseStatus': 'CONNECTED',
    'system/gsmStatus': 'DISCONNECTED',
    'manualControl/feed': false,
    'manualControl/rinse': false,
    'settings/lowFeedThreshold': 20,
    'settings/containerHeightCm': 40,
    'settings/emptyDistanceCm': 45,
    'settings/fullDistanceCm': 5,
    'settings/feederMaxRuntimeSec': 15,
    'settings/pumpMaxRuntimeSec': 60,
    'settings/systemEnabled': true,
    'settings/timezone': 'Asia/Manila',
  });
}

export async function updateAtPath(path: string, value: Record<string, unknown>) {
  if (!database) throw new Error('Firebase Realtime Database is not configured.');
  await update(ref(database, path), value);
}

export async function removeAtPath(path: string) {
  if (!database) throw new Error('Firebase Realtime Database is not configured.');
  await remove(ref(database, path));
}