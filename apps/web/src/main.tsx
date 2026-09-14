import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MLEAGUE_PRESET } from "@riichi/core";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="p-4 text-sm">立直麻将计分板 v2 骨架，默认规则 {MLEAGUE_PRESET.name}</main>
  </StrictMode>,
);
