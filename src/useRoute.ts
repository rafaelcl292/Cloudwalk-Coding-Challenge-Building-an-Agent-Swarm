import { useEffect, useState } from "react";

export type Route = "landing" | "console" | "support" | "dashboard" | "knowledge" | "api";

const validRoutes: Route[] = ["landing", "console", "support", "dashboard", "knowledge", "api"];

function readRoute(): Route {
  if (typeof window === "undefined") return "landing";
  const path = window.location.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
  if (path === "") return "landing";
  return (validRoutes as string[]).includes(path) ? (path as Route) : "landing";
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("popstate", onChange);
    window.addEventListener("swarm:navigate", onChange as EventListener);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("swarm:navigate", onChange as EventListener);
    };
  }, []);

  return route;
}

export function navigate(route: Route, options: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const target = hrefFor(route);
  if (window.location.pathname === target) return;
  if (options.replace) {
    window.history.replaceState({}, "", target);
  } else {
    window.history.pushState({}, "", target);
  }
  window.dispatchEvent(new Event("swarm:navigate"));
}

export function hrefFor(route: Route) {
  return route === "landing" ? "/" : `/${route}`;
}
