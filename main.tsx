import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { api } from "./lib/api";
import "./styles.css";

window.addEventListener("error", (e) => void api.logWrite("ERROR", `${e.message} @${e.filename}:${e.lineno}`).catch(() => {}));
window.addEventListener("unhandledrejection", (e) => void api.logWrite("ERROR", `Promise: ${String(e.reason)}`).catch(() => {}));

ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
