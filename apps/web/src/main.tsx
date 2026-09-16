import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { TooltipProvider } from "@/ui/controls";
import { Landing } from "@/app/routes/Landing";
import { Console } from "@/app/routes/Console";
import { Room } from "@/app/routes/Room";
import { LazyLabel } from "@/app/routes/lazyLabel";
import "./index.css";

const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
  { path: "/console", element: <Console /> },
  { path: "/r/:code", element: <Room /> },
  {
    path: "/label",
    element: (
      <Suspense fallback={null}>
        <LazyLabel />
      </Suspense>
    ),
  },
  // 未知路径（如少了房间码的 /r/）回首页，不展示路由默认的错误页
  { path: "*", element: <Navigate to="/" replace /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
);
