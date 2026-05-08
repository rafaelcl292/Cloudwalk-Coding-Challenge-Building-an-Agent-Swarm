import { runSwarm } from "../src/server/agents/orchestrator";
import { challengeScenarios } from "../src/server/agents/challenge-scenarios";

const usePersistence = process.argv.includes("--persist");
const failures: string[] = [];

for (const scenario of challengeScenarios) {
  try {
    const result = await runSwarm(
      {
        message: scenario.message,
        challengeUserId: scenario.userId,
        authenticatedUserId: "challenge_e2e_user",
        requestId: `challenge_${crypto.randomUUID()}`,
      },
      {
        persist: usePersistence,
      },
    );

    const scenarioFailures = validateScenarioResult(scenario, result);
    failures.push(...scenarioFailures);

    console.log(
      JSON.stringify(
        {
          status: scenarioFailures.length === 0 ? "pass" : "fail",
          message: scenario.message,
          expectedCategory: scenario.expectedCategory,
          route: result.route,
          handoffRequired: result.handoffRequired,
          sources: result.sources,
          response: result.response,
          failures: scenarioFailures,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown challenge scenario error";
    failures.push(`${scenario.message}: ${message}`);

    console.log(
      JSON.stringify(
        {
          status: "error",
          message: scenario.message,
          error: message,
        },
        null,
        2,
      ),
    );
  }
}

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        failures,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "passed",
      checkedScenarios: challengeScenarios.length,
      note: "Read the responses above for qualitative review.",
    },
    null,
    2,
  ),
);

function validateScenarioResult(
  scenario: (typeof challengeScenarios)[number],
  result: Awaited<ReturnType<typeof runSwarm>>,
) {
  const scenarioFailures: string[] = [];

  if (result.route.category !== scenario.expectedCategory) {
    scenarioFailures.push(
      `Expected category ${scenario.expectedCategory}, got ${result.route.category}.`,
    );
  }

  if (JSON.stringify(result.route.selectedAgents) !== JSON.stringify(scenario.expectedAgents)) {
    scenarioFailures.push(
      `Expected agents ${scenario.expectedAgents.join(",")}, got ${result.route.selectedAgents.join(",")}.`,
    );
  }

  for (const toolName of scenario.expectedTools) {
    if (!result.route.requiredTools.includes(toolName)) {
      scenarioFailures.push(`Expected required tool ${toolName}.`);
    }
  }

  if (
    scenario.expectedHandoffRequired !== undefined &&
    result.handoffRequired !== scenario.expectedHandoffRequired
  ) {
    scenarioFailures.push(
      `Expected handoffRequired ${scenario.expectedHandoffRequired}, got ${result.handoffRequired}.`,
    );
  }

  if (scenario.minSources !== undefined && result.sources.length < scenario.minSources) {
    scenarioFailures.push(`Expected at least ${scenario.minSources} source(s).`);
  }

  if (result.response.trim().length <= 20) {
    scenarioFailures.push("Response is too short.");
  }

  for (const forbiddenText of scenario.forbiddenResponseSubstrings ?? []) {
    if (result.response.toLowerCase().includes(forbiddenText.toLowerCase())) {
      scenarioFailures.push(`Response contains forbidden text: ${forbiddenText}.`);
    }
  }

  return scenarioFailures;
}
