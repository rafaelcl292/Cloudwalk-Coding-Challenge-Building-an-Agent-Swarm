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
          variables: {
            colorPrimary: "#c8472b",
            colorBackground: "#0d0c0b",
            colorForeground: "#f1ead8",
            fontFamily: "'General Sans', system-ui, sans-serif",
            borderRadius: "0.125rem",
          },
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
    <main className="grid min-h-screen place-items-center p-8">
      <section className="max-w-xl border border-rule bg-ink-2 p-8">
        <div className="ornament text-3xl">❦</div>
        <div className="kicker mt-4">Configuration notice</div>
        <h1 className="display text-4xl mt-2">The masthead is empty.</h1>
        <p className="article-prose text-paper-dim mt-4">
          Set <code className="font-mono">BUN_PUBLIC_CLERK_PUBLISHABLE_KEY</code> in your
          environment to print today&rsquo;s edition.
        </p>
      </section>
    </main>
  );
}
