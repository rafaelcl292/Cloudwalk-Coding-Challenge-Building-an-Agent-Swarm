import type { AgentName, RouteCategory, RouteToolName } from "./schemas";

export type ChallengeScenario = {
  message: string;
  userId: string;
  expectedCategory: RouteCategory;
  expectedAgents: AgentName[];
  expectedTools: RouteToolName[];
  expectedHandoffRequired?: boolean;
  minSources?: number;
  forbiddenResponseSubstrings?: string[];
};

export const challengeScenarios: ChallengeScenario[] = [
  {
    message: "What are the fees of the Maquininha Smart",
    userId: "client789",
    expectedCategory: "knowledge",
    expectedAgents: ["knowledge"],
    expectedTools: ["retrieveKnowledge"],
    minSources: 1,
    forbiddenResponseSubstrings: [
      "not have enough grounded context",
      "não tem contexto suficiente",
    ],
  },
  {
    message: "What is the cost of the Maquininha Smart?",
    userId: "client789",
    expectedCategory: "knowledge",
    expectedAgents: ["knowledge"],
    expectedTools: ["retrieveKnowledge"],
    minSources: 1,
    forbiddenResponseSubstrings: [
      "not have enough grounded context",
      "não tem contexto suficiente",
    ],
  },
  {
    message: "What are the rates for debit and credit card transactions?",
    userId: "client789",
    expectedCategory: "knowledge",
    expectedAgents: ["knowledge"],
    expectedTools: ["retrieveKnowledge"],
    minSources: 1,
    forbiddenResponseSubstrings: [
      "not have enough grounded context",
      "não tem contexto suficiente",
    ],
  },
  {
    message: "How can I use my phone as a card machine?",
    userId: "client789",
    expectedCategory: "knowledge",
    expectedAgents: ["knowledge"],
    expectedTools: ["retrieveKnowledge"],
    minSources: 1,
    forbiddenResponseSubstrings: [
      "not have enough grounded context",
      "não tem contexto suficiente",
    ],
  },
  {
    message: "Quando foi o último jogo do Palmeiras?",
    userId: "client789",
    expectedCategory: "general_web",
    expectedAgents: ["knowledge"],
    expectedTools: ["webSearch"],
  },
  {
    message: "Why I am not able to make transfers?",
    userId: "client789",
    expectedCategory: "support",
    expectedAgents: ["support"],
    expectedTools: ["getCustomerProfile", "getRecentTransactions"],
    expectedHandoffRequired: true,
    forbiddenResponseSubstrings: [
      "no customer profile",
      "no profile found",
      "não encontrei um perfil",
    ],
  },
  {
    message: "I can't sign in to my account.",
    userId: "client789",
    expectedCategory: "support",
    expectedAgents: ["support"],
    expectedTools: ["getCustomerProfile", "getRecentTransactions"],
    expectedHandoffRequired: true,
    forbiddenResponseSubstrings: [
      "no customer profile",
      "no profile found",
      "não encontrei um perfil",
    ],
  },
];
