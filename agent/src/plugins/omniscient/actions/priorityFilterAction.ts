import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateText,
} from "@ai16z/eliza";
import { generateDirectResponse } from "../../../utils/messageGenerator";
import { OmniscientProvider } from "../providers/omniscientProvider";

interface UserRole {
    role:
        | "engineering_lead"
        | "product_manager"
        | "qa"
        | "stakeholder"
        | "engineer";
    focus: string[];
}

const ROLE_CONTEXTS: Record<UserRole["role"], UserRole> = {
    engineering_lead: {
        role: "engineering_lead",
        focus: [
            "technical_debt",
            "architecture",
            "team_capacity",
            "dependencies",
        ],
    },
    product_manager: {
        role: "product_manager",
        focus: ["feature_requests", "timelines", "priorities", "roadmap"],
    },
    qa: {
        role: "qa",
        focus: ["test_coverage", "bugs", "releases", "stability"],
    },
    stakeholder: {
        role: "stakeholder",
        focus: ["progress", "metrics", "risks", "outcomes"],
    },
    engineer: {
        role: "engineer",
        focus: ["tasks", "blockers", "code_reviews", "specifications"],
    },
};

const priorityTemplate = `Given the user's role and project data, provide a focused priority list:

Role Context:
{{roleContext}}

Recent Messages:
{{recentMessages}}

Project Data:
{{projectData}}

Guidelines:
- Focus on {{role}}'s key areas: {{focus}}
- Prioritize based on impact and urgency
- Include relevant metrics and progress
- Highlight dependencies and blockers
- Keep it actionable and concise
- Filter out noise unrelated to role`;

export const priorityFilterAction: Action = {
    name: "FILTER_PRIORITIES",
    description: "Provides role-based priority filtering and insights",
    similes: ["GET_PRIORITIES", "CHECK_FOCUS", "VIEW_TASKS"],
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
                "Unable to access project data",
                {
                    error: "No project data available",
                }
            );
        }

        // Get user's role from Discord or default to engineer
        const userRole = runtime.getSetting("DISCORD_ROLE") || "engineer";
        const roleContext = ROLE_CONTEXTS[userRole as UserRole["role"]];

        const priorityContext = composeContext({
            state: {
                ...state,
                role: roleContext.role,
                focus: roleContext.focus.join(", "),
                roleContext: JSON.stringify(roleContext, null, 2),
                projectData: JSON.stringify(
                    {
                        criticalIssues: data.issues.filter(
                            (i) => i.priority >= 2
                        ),
                        activeProjects: data.projects.filter(
                            (p) => p.state === "active"
                        ),
                        recentUpdates: data.issues
                            .filter(
                                (i) =>
                                    new Date(i.updatedAt) >
                                    new Date(Date.now() - 24 * 60 * 60 * 1000)
                            )
                            .sort((a, b) => b.priority - a.priority),
                        teams: data.teams,
                    },
                    null,
                    2
                ),
            },
            template: priorityTemplate,
        });

        const priorities = await generateText({
            runtime,
            context: priorityContext,
            modelClass: ModelClass.SMALL,
        });

        return generateDirectResponse(
            runtime,
            state,
            callback,
            {
                success: true,
                data: {
                    role: roleContext.role,
                    lastUpdated: data.lastUpdated,
                },
            },
            priorityTemplate
        );
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What should I focus on today?",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Based on your role as an engineering lead, here are your priorities...",
                    action: "FILTER_PRIORITIES",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show me the most important items for my team",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "Looking at the priorities for product management...",
                    action: "FILTER_PRIORITIES",
                },
            },
        ],
    ],
};
