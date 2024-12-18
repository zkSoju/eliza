import { IAgentRuntime, Memory, Provider, State } from "@ai16z/eliza";

interface Strategy {
    id: string;
    title: string;
    description: string;
    category: string;
    timestamp: string;
    impact: string;
    relatedIssues?: string[];
}

interface LinearIssue {
    id: string;
    title: string;
    description: string;
    priority: number;
    status: string;
    assignee?: string;
    team?: string;
    dueDate?: string;
}

export const projectDataProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        try {
            // Get existing strategies from cache
            const existingStrategies =
                await runtime.cacheManager?.get<string>("weekly_strategies");
            const strategies: Strategy[] = existingStrategies
                ? JSON.parse(existingStrategies)
                : [];

            // Get Linear issues if available
            const linearData =
                await runtime.cacheManager?.get<string>("linear_issues");
            const linearIssues: LinearIssue[] = linearData
                ? JSON.parse(linearData)
                : [];

            // Add new strategy if message contains relevant information
            const text = message.content.text.toLowerCase();
            if (text.includes("strategy") || text.includes("initiative")) {
                const newStrategy: Strategy = {
                    id: Date.now().toString(),
                    title:
                        message.content.text.split("\n")[0] ||
                        "Untitled Strategy",
                    description: message.content.text,
                    category: detectCategory(message.content.text),
                    timestamp: new Date().toISOString(),
                    impact: detectImpact(message.content.text),
                    relatedIssues: findRelatedIssues(
                        message.content.text,
                        linearIssues
                    ),
                };

                strategies.push(newStrategy);

                // Update cache with new strategies
                await runtime.cacheManager?.set(
                    "weekly_strategies",
                    JSON.stringify(strategies),
                    {
                        expires: getWeeklyExpiration(),
                    }
                );
            }

            // Format strategies for display
            return formatStrategies(strategies, linearIssues);
        } catch (error) {
            console.error("Error in projectDataProvider:", error);
            return "Error processing strategies. Please try again.";
        }
    },
};

function findRelatedIssues(
    text: string,
    linearIssues: LinearIssue[]
): string[] {
    const relatedIssues: string[] = [];

    for (const issue of linearIssues) {
        // Check if issue title or keywords appear in the strategy text
        if (
            text.toLowerCase().includes(issue.title.toLowerCase()) ||
            (issue.description &&
                text.toLowerCase().includes(issue.description.toLowerCase()))
        ) {
            relatedIssues.push(issue.id);
        }
    }

    return relatedIssues;
}

function detectCategory(text: string): string {
    const categories = {
        technical: ["architecture", "code", "development", "infrastructure"],
        process: ["workflow", "methodology", "process", "organization"],
        business: ["revenue", "customer", "market", "growth"],
        people: ["team", "hiring", "culture", "training"],
    };

    for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some((keyword) => text.toLowerCase().includes(keyword))) {
            return category;
        }
    }
    return "other";
}

function detectImpact(text: string): string {
    const impactKeywords = {
        high: ["critical", "essential", "major", "significant"],
        medium: ["important", "moderate", "helpful"],
        low: ["minor", "small", "minimal"],
    };

    for (const [impact, keywords] of Object.entries(impactKeywords)) {
        if (keywords.some((keyword) => text.toLowerCase().includes(keyword))) {
            return impact;
        }
    }
    return "medium";
}

function formatStrategies(
    strategies: Strategy[],
    linearIssues: LinearIssue[]
): string {
    if (strategies.length === 0) {
        return "No strategies recorded for this week.";
    }

    const categorizedStrategies = strategies.reduce(
        (acc, strategy) => {
            if (!acc[strategy.category]) {
                acc[strategy.category] = [];
            }
            acc[strategy.category].push(strategy);
            return acc;
        },
        {} as Record<string, Strategy[]>
    );

    let summary = "📊 Weekly Strategy Summary\n\n";

    for (const [category, items] of Object.entries(categorizedStrategies)) {
        summary += `${category.toUpperCase()}\n`;
        items.forEach((strategy) => {
            summary += `• ${strategy.title} (Impact: ${strategy.impact})\n`;
            summary += `  ${strategy.description.substring(0, 100)}...\n`;

            // Add related Linear issues if any
            if (strategy.relatedIssues && strategy.relatedIssues.length > 0) {
                summary += "  📎 Related Issues:\n";
                strategy.relatedIssues.forEach((issueId) => {
                    const issue = linearIssues.find((i) => i.id === issueId);
                    if (issue) {
                        const priority = "🔥".repeat(issue.priority || 0);
                        summary += `    - ${priority} ${issue.title} (${issue.status})\n`;
                    }
                });
            }
            summary += "\n";
        });
    }

    return summary;
}

function getWeeklyExpiration(): number {
    const now = new Date();
    const endOfWeek = new Date();
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()));
    endOfWeek.setHours(23, 59, 59, 999);
    return endOfWeek.getTime();
}
