import { ClerkProvider } from "@clerk/react";
import { dark } from "@clerk/ui/themes";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const publishableKey = process.env.BUN_PUBLIC_CLERK_PUBLISHABLE_KEY;
const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    {publishableKey ? (
      <ClerkProvider
        publishableKey={publishableKey}
        afterSignOutUrl="/"
        appearance={{
          theme: dark,
        }}
      >
        <App />
      </ClerkProvider>
    ) : (
      <MissingClerkConfig />
    )}
  </StrictMode>
);

(import.meta.hot.data.root ??= createRoot(elem)).render(app);

function MissingClerkConfig() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#242424] p-8 text-[#fbf0df]">
      <section className="max-w-xl rounded-2xl border-2 border-[#fbf0df] bg-[#1a1a1a] p-6 text-center">
        <h1 className="text-3xl font-bold">Missing Clerk configuration</h1>
        <p className="mt-3">
          Set <code>BUN_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in your environment to start the
          authenticated app.
        </p>
      </section>
    </main>
  );
}
