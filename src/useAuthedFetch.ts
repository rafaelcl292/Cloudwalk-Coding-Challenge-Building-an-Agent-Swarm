import { useAuth } from "@clerk/react";
import { useCallback } from "react";

export type AuthedFetchOptions = RequestInit & {
  skipAuth?: boolean;
};

export function useAuthedFetch() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  return useCallback(
    async (input: string | URL, init: AuthedFetchOptions = {}) => {
      if (!isLoaded) {
        throw new Error("Authentication is still loading.");
      }
      if (!isSignedIn && !init.skipAuth) {
        throw new Error("Not signed in.");
      }

      const doFetch = async () => {
        const token = init.skipAuth ? null : await getToken();
        const headers = new Headers(init.headers);
        if (token) headers.set("authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      };

      let res = await doFetch();
      if (res.status === 401 && !init.skipAuth) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        res = await doFetch();
      }
      return res;
    },
    [getToken, isLoaded, isSignedIn],
  );
}
