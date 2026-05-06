import { APITester } from "./APITester";
import "./index.css";

export function App() {
  return (
    <div className="max-w-7xl mx-auto p-8 text-center relative z-10">
      <h1 className="text-5xl font-bold my-4 leading-tight">CloudWalk Agent Swarm</h1>
      <p>API foundation for the authenticated multi-agent challenge implementation.</p>
      <APITester />
    </div>
  );
}

export default App;
