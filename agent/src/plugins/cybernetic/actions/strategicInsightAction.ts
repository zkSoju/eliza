import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../../omniscient/providers/omniscientProvider";

export const strategicInsightAction: Action = {
    name: "STRATEGIC_INSIGHT",
    description: "Generates strategic insights from organizational data",
    similes: ["ANALYZE", "INSIGHT", "STRATEGY"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What strategic insights can you share?",
                    action: "STRATEGIC_INSIGHT",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*examines the patterns* Three key trends emerge in our project flow...",
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
                "No organizational data available",
                { error: "No data available" }
            );
        }

        // Analyze project trends
        const activeProjects = data.projects.filter(
            (p) => p.state === "active"
        );
        const criticalIssues = data.issues.filter((i) => i.priority >= 2);
        const teamWorkload = data.teams.map((team) => ({
            team: team.name,
            issues: data.issues.filter((i) => i.team?.id === team.id).length,
        }));

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                projects: activeProjects,
                issues: criticalIssues,
                teamWorkload,
                timestamp: new Date().toISOString(),
            },
            `Analyze the current organizational state and provide strategic insights:

Current State:
Active Projects: {{projects.length}}
Critical Issues: {{issues.length}}
Team Workload: {{teamWorkload}}

Guidelines:
- Identify key trends and patterns
- Highlight potential bottlenecks
- Suggest strategic priorities
- Note resource allocation needs
- Recommend actionable next steps`
        );
    },
};
