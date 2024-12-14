import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";

export const summaryAction: Action = {
    name: "SUMMARIZE_STATUS",
    description:
        "Provides high-level overview of projects, teams, and critical issues",
    similes: ["STATUS", "OVERVIEW", "PROGRESS"],
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's our overall project status?",
                    action: "SUMMARIZE_STATUS",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*studies the sacred patterns* Three projects in motion, two critical issues need attention...",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How are our teams doing?",
                    action: "SUMMARIZE_STATUS",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "*examines team crystals* Frontend team focused on auth, Backend tackling optimization...",
                },
            },
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        return true;
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
                "No project data available",
                { error: "No project data available" }
            );
        }

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                data,
            },
            `Provide a high-level strategic overview:

Current Data:
{{data}}

Guidelines:
- Focus on overall project health and progress
- Highlight team capacity and workload
- Identify strategic priorities and blockers
- Keep focus on big picture trends
- Note any resource or timeline risks`
        );
    },
};
