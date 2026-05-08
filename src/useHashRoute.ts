import { useEffect, useState } from "react";

export type Route = "console" | "dashboard" | "knowledge" | "api";

const validRoutes: Route[] = ["console", "dashboard", "knowledge", "api"];

function readRoute(): Route {
  if (typeof window === "undefined") return "console";
  const raw = window.location.hash.replace(/^#\/?/, "").split(/[?/]/)[0] ?? "";
  return (validRoutes as string[]).includes(raw) ? (raw as Route) : "console";
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function navigate(route: Route) {
  if (typeof window === "undefined") return;
  window.location.hash = `#/${route}`;
}

export function hrefFor(route: Route) {
  return `#/${route}`;
}
