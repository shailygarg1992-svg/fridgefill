import { db, auth } from "./firebase";
import {
  collection,
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Sends a cart request to Firestore for the Chrome extension to process.
 * @param {Array} shoppingList - Array of { name, quantity, walmart_search }
 * @returns {string} requestId
 */
export async function sendCartRequest(shoppingList) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not signed in");

  const items = shoppingList.map((item) => ({
    name: item.name || item.item,
    quantity: item.quantity || item.qty || 1,
    walmart_query: item.walmart_search || item.name || item.item,
    walmart_product_id: null,
    status: "pending",
  }));

  const cartRequestsRef = collection(db, "users", user.uid, "cart_requests");
  const docRef = await addDoc(cartRequestsRef, {
    status: "pending",
    created_at: serverTimestamp(),
    items,
    progress: { total: items.length, added: 0, failed: 0 },
  });

  return docRef.id;
}

/**
 * Watches a cart request in real-time for progress updates.
 * @param {string} requestId
 * @param {function} callback - Called with updated request data
 * @returns {function} unsubscribe function
 */
export function watchCartRequest(requestId, callback) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not signed in");

  const docRef = doc(db, "users", user.uid, "cart_requests", requestId);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ id: snapshot.id, ...snapshot.data() });
    }
  });
}
