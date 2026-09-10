import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const AdminPage = lazy(() => import("./admin/AdminPage"));
const isAdminRoute = /^\/stats777\/?$/.test(window.location.pathname);

if (isAdminRoute) {
  document.title = "Koino · Statistik";
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement("meta");
    robots.name = "robots";
    document.head.append(robots);
  }
  robots.content = "noindex, nofollow, noarchive";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <Suspense fallback={<div className="admin-boot">Laddar statistik…</div>}>
        <AdminPage />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
