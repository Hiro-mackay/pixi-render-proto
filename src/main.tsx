import { createRoot } from "react-dom/client";
import { App } from "./App";

// StrictMode disabled: it double-mounts effects which conflicts with the
// imperative PixiJS canvas lifecycle (async app.init vs sync cleanup races).
const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found in document");
createRoot(root).render(<App />);
