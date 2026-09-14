import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { TooltipProvider } from "@/ui/controls";
import { Landing } from "@/app/routes/Landing";
import { Console } from "@/app/routes/Console";
import { Room } from "@/app/routes/Room";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/console", element: <Console /> },
  { path: "/r/:code", element: <Room /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
);
