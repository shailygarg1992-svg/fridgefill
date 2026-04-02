import { useState, useEffect, useRef } from "react";
import { auth, googleProvider } from "../lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { sendCartRequest, watchCartRequest } from "../lib/cartService";

export default function FillCartButton({ restockList }) {
  const [state, setState] = useState("idle"); // idle | signing_in | sending | waiting | in_progress | completed | failed
  const [progress, setProgress] = useState({ total: 0, added: 0, failed: 0 });
  const [items, setItems] = useState([]);
  const unsubRef = useRef(null);

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current();
    };
  }, []);

  async function handleClick() {
    if (!restockList || restockList.length === 0) return;

    try {
      // Sign in if needed
      if (!auth.currentUser) {
        setState("signing_in");
        await signInWithPopup(auth, googleProvider);
      }

      setState("sending");
      const requestId = await sendCartRequest(restockList);

      setState("waiting");
      unsubRef.current = watchCartRequest(requestId, (data) => {
        setProgress(data.progress || { total: 0, added: 0, failed: 0 });
        setItems(data.items || []);

        if (data.status === "in_progress") setState("in_progress");
        else if (data.status === "completed") setState("completed");
        else if (data.status === "failed") setState("failed");
      });
    } catch (err) {
      console.error("FillCartButton error:", err);
      setState("failed");
    }
  }

  function reset() {
    if (unsubRef.current) unsubRef.current();
    setState("idle");
    setProgress({ total: 0, added: 0, failed: 0 });
    setItems([]);
  }

  if (state === "idle") {
    return (
      <button
        onClick={handleClick}
        className="w-full bg-blue-600 text-white py-3 px-4 rounded-xl font-semibold text-lg"
      >
        Fill My Walmart Cart
      </button>
    );
  }

  if (state === "signing_in") {
    return (
      <div className="w-full bg-gray-100 py-3 px-4 rounded-xl text-center text-gray-600">
        Signing in with Google...
      </div>
    );
  }

  if (state === "sending") {
    return (
      <div className="w-full bg-yellow-50 py-3 px-4 rounded-xl text-center text-yellow-700">
        Sending cart request...
      </div>
    );
  }

  if (state === "waiting") {
    return (
      <div className="w-full bg-yellow-50 py-3 px-4 rounded-xl text-center">
        <p className="text-yellow-700 font-medium">Waiting for extension...</p>
        <p className="text-xs text-yellow-600 mt-1">
          Make sure the FridgeFill extension is active and you're logged into walmart.com
        </p>
      </div>
    );
  }

  if (state === "in_progress") {
    const pct = progress.total > 0 ? Math.round(((progress.added + progress.failed) / progress.total) * 100) : 0;
    return (
      <div className="w-full bg-blue-50 py-3 px-4 rounded-xl">
        <div className="flex justify-between text-sm text-blue-700 mb-2">
          <span>Adding to Walmart cart...</span>
          <span>{progress.added + progress.failed}/{progress.total}</span>
        </div>
        <div className="w-full bg-blue-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-2 space-y-1">
          {items.map((item, i) => (
            <div key={i} className="flex items-center text-xs gap-1">
              <span className={
                item.status === "added" ? "text-green-600" :
                item.status === "failed" || item.status === "not_found" ? "text-red-500" :
                "text-gray-400"
              }>
                {item.status === "added" ? "+" : item.status === "failed" || item.status === "not_found" ? "x" : "-"}
              </span>
              <span className={item.status === "pending" ? "text-gray-400" : "text-gray-700"}>
                {item.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state === "completed") {
    return (
      <div className="w-full bg-green-50 py-3 px-4 rounded-xl text-center">
        <p className="text-green-700 font-semibold">
          Cart filled! {progress.added} of {progress.total} items added.
        </p>
        {progress.failed > 0 && (
          <p className="text-red-500 text-xs mt-1">{progress.failed} item(s) could not be added.</p>
        )}
        <button onClick={reset} className="mt-2 text-sm text-blue-600 underline">Done</button>
      </div>
    );
  }

  // failed state
  return (
    <div className="w-full bg-red-50 py-3 px-4 rounded-xl text-center">
      <p className="text-red-600 font-medium">Something went wrong.</p>
      <button onClick={reset} className="mt-2 text-sm text-blue-600 underline">Try Again</button>
    </div>
  );
}
