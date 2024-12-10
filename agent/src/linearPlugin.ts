import { IAgentRuntime, Memory, Plugin, Provider, State } from "@ai16z/eliza";
import { LinearClient, LinearDocument } from "@linear/sdk";

interface LinearContext {
    projects: LinearProject[];
    teams: LinearTeam[];
    members: LinearMember[];
    issues: LinearIssue[];
    lastUpdated: string;
}

interface LinearProject {
    id: string;
    name: string;
    description: string;
    status: string;
    teamIds: string[];
    startDate?: string;
    targetDate?: string;
}

interface LinearTeam {
    id: string;
    name: string;
    description: string;
    key: string;
    members: string[]; // member IDs
}

interface LinearMember {
    id: string;
    name: string;
    email: string;
    displayName?: string;
    active: boolean;
    teams: string[]; // team IDs
}

interface LinearIssue {
    id: string;
    title: string;
    description: string;
    priority: number;
    status: string;
    assignee?: string;
    team?: string;
    project?: string;
    dueDate?: string;
    labels: string[];
}

const linearProvider: Provider = {
    get: async (runtime: IAgentRuntime, message: Memory, state: State) => {
        try {
            const linearApiKey =
                runtime.character.settings?.secrets?.LINEAR_API_KEY;
            if (!linearApiKey) {
                return "Linear API key not configured";
            }

            // Check cache first
            const cachedData =
                await runtime.cacheManager?.get<string>("linear_context");
            if (cachedData) {
                const parsedData: LinearContext = JSON.parse(cachedData);
                const lastUpdate = new Date(parsedData.lastUpdated);
                const oneWeekAgo = new Date(
                    Date.now() - 7 * 24 * 60 * 60 * 1000
                );

                if (lastUpdate > oneWeekAgo) {
                    return formatContextResponse(parsedData, message);
                }
            }

            // Fetch fresh data
            const client = new LinearClient({ apiKey: linearApiKey });

            // Fetch all data in parallel
            const [projectsData, teamsData, membersData, issuesData] =
                await Promise.all([
                    client.projects({ first: 100 }),
                    client.teams({ first: 100 }),
                    client.users({ first: 100 }),
                    client.issues({
                        first: 100,
                        orderBy: LinearDocument.PaginationOrderBy.CreatedAt,
                    }),
                ]);

            const context: LinearContext = {
                projects: await Promise.all(
                    projectsData.nodes.map(async (p) => {
                        const teams = await p.teams();
                        return {
                            id: p.id,
                            name: p.name,
                            description: p.description || "",
                            status: p.state,
                            teamIds: teams.nodes.map((t) => t.id),
                            startDate: p.startDate,
                            targetDate: p.targetDate,
                        };
                    })
                ),
                teams: await Promise.all(
                    teamsData.nodes.map(async (t) => {
                        const members = await t.members();
                        return {
                            id: t.id,
                            name: t.name,
                            description: t.description || "",
                            key: t.key,
                            members: members.nodes.map((m) => m.id),
                        };
                    })
                ),
                members: await Promise.all(
                    membersData.nodes.map(async (m) => {
                        const teams = await m.teams();
                        return {
                            id: m.id,
                            name: m.name,
                            email: m.email,
                            displayName: m.displayName,
                            active: m.active,
                            teams: teams.nodes.map((t) => t.id),
                        };
                    })
                ),
                issues: await Promise.all(
                    issuesData.nodes.map(async (i) => {
                        const [state, assignee, team, project, labels] =
                            await Promise.all([
                                i.state,
                                i.assignee,
                                i.team,
                                i.project,
                                i.labels(),
                            ]);
                        return {
                            id: i.id,
                            title: i.title,
                            description: i.description || "",
                            priority: i.priority,
                            status: state ? state.name : "No Status",
                            assignee: assignee ? assignee.name : undefined,
                            team: team ? team.name : undefined,
                            project: project ? project.name : undefined,
                            dueDate: i.dueDate,
                            labels: labels.nodes.map((l) => l.name),
                        };
                    })
                ),
                lastUpdated: new Date().toISOString(),
            };

            // Cache the context
            await runtime.cacheManager?.set(
                "linear_context",
                JSON.stringify(context),
                {
                    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 1 week cache
                }
            );

            return formatContextResponse(context, message);
        } catch (error) {
            console.error("Error in Linear provider:", error);
            return "Error fetching Linear data. Please check your API key and try again.";
        }
    },
};

function formatContextResponse(
    context: LinearContext,
    message: Memory
): string {
    const text = message.content.text.toLowerCase();

    // Format response based on the query type
    if (text.includes("project") || text.includes("projects")) {
        return formatProjectsSummary(context);
    } else if (text.includes("team") || text.includes("teams")) {
        return formatTeamsSummary(context);
    } else if (text.includes("member") || text.includes("people")) {
        return formatMembersSummary(context);
    } else if (text.includes("issue") || text.includes("task")) {
        return formatIssuesSummary(context);
    }

    // Default to overview
    return formatOverview(context);
}

function formatProjectsSummary(context: LinearContext): string {
    let summary = "🚀 Projects Overview\n\n";

    context.projects.forEach((project) => {
        const teamNames = project.teamIds
            .map((id) => context.teams.find((t) => t.id === id)?.name)
            .filter(Boolean)
            .join(", ");

        summary += `## ${project.name}\n`;
        summary += `Status: ${project.status}\n`;
        if (project.description)
            summary += `Description: ${project.description}\n`;
        summary += `Teams: ${teamNames || "No teams assigned"}\n`;
        if (project.startDate)
            summary += `Started: ${new Date(project.startDate).toLocaleDateString()}\n`;
        if (project.targetDate)
            summary += `Target: ${new Date(project.targetDate).toLocaleDateString()}\n`;
        summary += "\n";
    });

    return summary;
}

function formatTeamsSummary(context: LinearContext): string {
    let summary = "👥 Teams Overview\n\n";

    context.teams.forEach((team) => {
        const memberCount = team.members.length;
        const activeIssues = context.issues.filter(
            (i) => i.team === team.name
        ).length;

        summary += `## ${team.name} (${team.key})\n`;
        if (team.description) summary += `Description: ${team.description}\n`;
        summary += `Members: ${memberCount}\n`;
        summary += `Active Issues: ${activeIssues}\n\n`;
    });

    return summary;
}

function formatMembersSummary(context: LinearContext): string {
    let summary = "👤 Team Members\n\n";

    const activeMembers = context.members.filter((m) => m.active);
    activeMembers.forEach((member) => {
        const teamNames = member.teams
            .map((id) => context.teams.find((t) => t.id === id)?.name)
            .filter(Boolean)
            .join(", ");

        const assignedIssues = context.issues.filter(
            (i) => i.assignee === member.name
        ).length;

        summary += `## ${member.displayName || member.name}\n`;
        summary += `Teams: ${teamNames || "No teams"}\n`;
        summary += `Active Issues: ${assignedIssues}\n\n`;
    });

    return summary;
}

function formatIssuesSummary(context: LinearContext): string {
    let summary = "📋 Issues Overview\n\n";

    // Group issues by status
    const issuesByStatus = context.issues.reduce(
        (acc, issue) => {
            if (!acc[issue.status]) acc[issue.status] = [];
            acc[issue.status].push(issue);
            return acc;
        },
        {} as Record<string, LinearIssue[]>
    );

    Object.entries(issuesByStatus).forEach(([status, issues]) => {
        summary += `## ${status} (${issues.length})\n`;
        issues.forEach((issue) => {
            const priority = "🔥".repeat(issue.priority || 0);
            summary += `- ${priority} ${issue.title}`;
            if (issue.assignee) summary += ` (${issue.assignee})`;
            if (issue.project) summary += ` [${issue.project}]`;
            summary += "\n";
        });
        summary += "\n";
    });

    return summary;
}

function formatOverview(context: LinearContext): string {
    const activeProjects = context.projects.length;
    const activeTeams = context.teams.length;
    const activeMembers = context.members.filter((m) => m.active).length;
    const totalIssues = context.issues.length;

    let summary = "🎯 Linear Overview\n\n";
    summary += `Active Projects: ${activeProjects}\n`;
    summary += `Teams: ${activeTeams}\n`;
    summary += `Active Members: ${activeMembers}\n`;
    summary += `Total Issues: ${totalIssues}\n\n`;

    // Add recent activity
    summary += "Recent Updates:\n";
    const recentIssues = context.issues
        .sort(
            (a, b) =>
                new Date(b.dueDate || "").getTime() -
                new Date(a.dueDate || "").getTime()
        )
        .slice(0, 5);

    recentIssues.forEach((issue) => {
        const priority = "🔥".repeat(issue.priority || 0);
        summary += `- ${priority} ${issue.title} (${issue.status})`;
        if (issue.assignee) summary += ` - ${issue.assignee}`;
        summary += "\n";
    });

    return summary;
}

export const linearPlugin: Plugin = {
    name: "LINEAR_PLUGIN",
    description: "Linear integration plugin for project management",
    providers: [linearProvider],
};
