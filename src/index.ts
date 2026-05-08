import { serve } from "bun";
import index from "./index.html";
import {
  apiRoute,
  chatRoute,
  conversationMessagesRoute,
  conversationsRoute,
  dashboardRoute,
  healthRoute,
  ingestRoute,
  knowledgeSourcesRoute,
  swarmRoute,
  unknownApiRoute,
} from "./server/api/routes";

const server = serve({
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  routes: {
    "/api/health": apiRoute({ GET: healthRoute }),
    "/api/v1/health": apiRoute({ GET: healthRoute }),

    "/api/chat": apiRoute({ POST: chatRoute }),
    "/api/v1/chat": apiRoute({ POST: chatRoute }),

    "/api/swarm": apiRoute({ POST: swarmRoute }),
    "/api/v1/swarm": apiRoute({ POST: swarmRoute }),

    "/api/conversations": apiRoute({ GET: conversationsRoute }),
    "/api/v1/conversations": apiRoute({ GET: conversationsRoute }),

    "/api/conversations/:id/messages": apiRoute({ GET: conversationMessagesRoute }),
    "/api/v1/conversations/:id/messages": apiRoute({ GET: conversationMessagesRoute }),

    "/api/dashboard": apiRoute({ GET: dashboardRoute }),
    "/api/v1/dashboard": apiRoute({ GET: dashboardRoute }),

    "/api/knowledge/sources": apiRoute({ GET: knowledgeSourcesRoute }),
    "/api/v1/knowledge/sources": apiRoute({ GET: knowledgeSourcesRoute }),

    "/api/admin/ingest": apiRoute({ POST: ingestRoute }),
    "/api/v1/admin/ingest": apiRoute({ POST: ingestRoute }),

    "/api/*": unknownApiRoute,
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
