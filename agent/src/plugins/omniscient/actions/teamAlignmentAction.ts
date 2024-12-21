import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";

export const teamAlignmentAction: Action = {
    name: "TEAM_ALIGNMENT",
    description: "Analyzes team communications and provides alignment insights",
    similes: ["ALIGN", "COORDINATE", "SYNC"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How aligned are our teams?",
                    action: "TEAM_ALIGNMENT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*studies team patterns* Frontend and backend streams flow in parallel...",
                },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        const provider = new OmniscientProvider(runtime);
        const data = await provider.getData();
        return !!data;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: unknown,
        callback: HandlerCallback
    ) => {
        const provider = new OmniscientProvider(runtime);
        const data = await provider.getData();

        if (!data) {
            return generateDirectResponse(
                runtime,
                state,
                callback,
                {},
                "No team data available",
                { error: "No data available" }
            );
        }

        // Analyze team alignment
        const teamProjects = data.teams.map((team) => ({
            team: team.name,
            projects: [
                ...new Set(
                    data.issues
                        .filter((i) => i.team?.id === team.id)
                        .map((i) => i.project?.name)
                        .filter(Boolean)
                ),
            ],
            criticalIssues: data.issues.filter(
                (i) => i.team?.id === team.id && i.priority >= 2
            ).length,
        }));

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                teamProjects,
                timestamp: new Date().toISOString(),
            },
            `Analyze team alignment and provide insights:

Current State:
{{teamProjects}}

Guidelines:
- Assess cross-team dependencies
- Identify collaboration opportunities
- Highlight resource sharing needs
- Note communication patterns
- Suggest alignment improvements`
        );
    },
};
