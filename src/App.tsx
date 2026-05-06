import { Show, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/react";
import { APITester } from "./APITester";
import "./index.css";

export function App() {
  return (
    <div className="w-full max-w-7xl mx-auto p-8 relative z-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
        <div>
          <h1 className="text-5xl font-bold my-4 leading-tight">CloudWalk Agent Swarm</h1>
          <p>Authenticated API foundation for the multi-agent challenge implementation.</p>
        </div>
        <AuthControls />
      </header>
      <main className="mt-8">
        <Show when="signed-out">
          <SignedOutPanel />
        </Show>
        <Show when="signed-in">
          <AuthenticatedApp />
        </Show>
      </main>
    </div>
  );
}

function AuthControls() {
  return (
    <div className="flex items-center justify-center gap-3">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="bg-[#fbf0df] text-[#1a1a1a] border-0 px-5 py-2 rounded-lg font-bold transition-all duration-100 hover:bg-[#f3d5a3] hover:-translate-y-px cursor-pointer">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="bg-transparent text-[#fbf0df] border-2 border-[#fbf0df] px-5 py-2 rounded-lg font-bold transition-all duration-100 hover:border-[#f3d5a3] hover:text-[#f3d5a3] hover:-translate-y-px cursor-pointer">
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  );
}

function SignedOutPanel() {
  return (
    <section className="mx-auto max-w-2xl rounded-2xl border-2 border-[#fbf0df] bg-[#1a1a1a] p-6 text-center">
      <h2 className="text-2xl font-bold">Sign in to use the swarm API</h2>
      <p className="mt-3 text-[#fbf0df]/80">
        Chat, swarm, conversation, dashboard, and ingestion endpoints now require a Clerk session
        token. Health checks remain public.
      </p>
    </section>
  );
}

function AuthenticatedApp() {
  const { user } = useUser();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-2xl border-2 border-[#fbf0df] bg-[#1a1a1a] p-5">
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-2xl font-bold">Protected API tester</h2>
          <p className="text-[#fbf0df]/80">
            Requests from this panel include the signed-in user's Clerk bearer token.
          </p>
        </div>
        <APITester />
      </section>
      <aside className="rounded-2xl border-2 border-[#fbf0df] bg-[#1a1a1a] p-5">
        <h2 className="text-2xl font-bold">Session</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-[#fbf0df]/60">User</dt>
            <dd className="break-all">{user?.primaryEmailAddress?.emailAddress ?? user?.id}</dd>
          </div>
          <div>
            <dt className="text-[#fbf0df]/60">Protected areas</dt>
            <dd>Chat, API testing, and operator dashboard placeholders</dd>
          </div>
          <div>
            <dt className="text-[#fbf0df]/60">Admin-only API</dt>
            <dd>
              <code>/api/dashboard</code> and <code>/api/admin/ingest</code>
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}

export default App;
