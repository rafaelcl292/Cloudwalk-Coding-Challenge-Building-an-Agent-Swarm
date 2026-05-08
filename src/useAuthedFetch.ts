import { useAuth } from "@clerk/react";
import { useCallback } from "react";

export type AuthedFetchOptions = RequestInit & {
  skipAuth?: boolean;
};

const tokenRetryDelaysMs = [0, 100, 250, 500, 1000];
const unauthorizedRetryDelaysMs = [250, 750];

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

      const getReadyToken = async (skipCache = false) => {
        for (const [index, delayMs] of tokenRetryDelaysMs.entries()) {
          if (delayMs > 0) await sleep(delayMs);
          const token = await getToken({ skipCache });
          if (token) return token;
          if (index === tokenRetryDelaysMs.length - 1) {
            throw new Error("Authentication token is not ready. Try again in a moment.");
          }
        }
        throw new Error("Authentication token is not ready. Try again in a moment.");
      };

      const doFetch = async (skipTokenCache = false) => {
        const headers = new Headers(init.headers);
        if (!init.skipAuth) {
          headers.set("authorization", `Bearer ${await getReadyToken(skipTokenCache)}`);
        }
        return fetch(input, { ...init, headers });
      };

      let res = await doFetch();
      for (const delayMs of unauthorizedRetryDelaysMs) {
        if (res.status !== 401 || init.skipAuth) break;
        await sleep(delayMs);
        res = await doFetch(true);
      }
      return res;
    },
    [getToken, isLoaded, isSignedIn],
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
