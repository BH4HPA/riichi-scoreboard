import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CORE_VERSION } from "@riichi/core";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="p-4 text-sm">立直麻将计分板 v2 骨架，core {CORE_VERSION}</main>
  </StrictMode>,
);
