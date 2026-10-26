import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/heebo/hebrew-400.css";
import "@fontsource/heebo/hebrew-700.css";
import "@fontsource/heebo/hebrew-900.css";
import "@fontsource/heebo/latin-400.css";
import "@fontsource/heebo/latin-700.css";
import "@fontsource/anton/latin-400.css";
import App from "./App.jsx";
import "./style.css";
createRoot(document.getElementById("root")).render(<App />);
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  location.protocol.startsWith("http")
)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
