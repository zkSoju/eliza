import {
    Evaluator,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    generateObject,
} from "@ai16z/eliza";
import { z } from "zod";
import { DiscordContent } from "../../../types";

// Define schema for role analysis
const RoleSchema = z.object({
    primaryRole: z.enum([
        "engineering_lead",
        "product_manager",
        "qa",
        "stakeholder",
        "engineer",
        "community_manager",
        "designer",
        "content_creator",
        "support",
        "admin",
    ]),
    focusAreas: z.array(z.string()).min(1),
    responsibilities: z.array(z.string()).min(1),
    accessLevel: z.enum(["admin", "member", "guest"]).default("member"),
});

export type RoleContent = z.infer<typeof RoleSchema>;

const roleTemplate = `Respond with a JSON markdown block containing only the extracted role information.

Example response:
\`\`\`json
{
    "primaryRole": "engineering_lead",
    "focusAreas": ["architecture", "scalability", "team_coordination"],
    "responsibilities": ["technical_oversight", "code_review", "architecture_decisions"],
    "accessLevel": "admin"
}
\`\`\`

Discord Roles: {{roles}}
Recent Messages: {{recentMessages}}

Given the user's Discord roles and recent messages, determine:

1. Primary Role:
- engineering_lead: Technical leadership and architecture focus
- product_manager: Product strategy and roadmap
- qa: Quality assurance and testing
- stakeholder: Business oversight and requirements
- engineer: Development and implementation
- community_manager: Community engagement
- designer: UI/UX design
- content_creator: Documentation/content
- support: User assistance
- admin: System administration

2. Focus Areas:
- Technical: architecture, scalability, performance, security
- Product: features, roadmap, user_experience, market_fit
- Process: workflow, automation, documentation, standards
- Team: coordination, mentoring, knowledge_sharing
- Business: metrics, growth, strategy, partnerships

3. Responsibilities:
- Leadership: team_leadership, decision_making, strategy
- Technical: code_review, architecture, implementation
- Process: quality_assurance, deployment, monitoring
- Communication: documentation, reporting, coordination

4. Access Level:
- admin: Full system access and configuration
- member: Standard team member access
- guest: Limited access for external collaborators

Guidelines:
- Use role names exactly as listed
- Include at least 2-3 focus areas
- Include at least 2-3 responsibilities
- Default to "member" access if unclear
- Consider both explicit roles and implied responsibilities
- Look for leadership indicators in messages

Respond with a JSON markdown block containing only the extracted values.`;

export interface RoleGuidance {
    suggestedUpdates: string[];
    guidance: {
        aspect: string;
        suggestion: string;
        reason: string;
    }[];
}

function generateRoleGuidance(content: RoleContent): RoleGuidance {
    const guidance: RoleGuidance = {
        suggestedUpdates: [],
        guidance: [],
    };

    if (content.focusAreas.length < 2) {
        guidance.suggestedUpdates.push("expand_focus_areas");
        guidance.guidance.push({
            aspect: "focusAreas",
            suggestion: "Consider adding more focus areas",
            reason: "Broader context helps in priority filtering",
        });
    }

    if (content.responsibilities.length < 2) {
        guidance.suggestedUpdates.push("expand_responsibilities");
        guidance.guidance.push({
            aspect: "responsibilities",
            suggestion: "Add more specific responsibilities",
            reason: "Detailed responsibilities improve task filtering",
        });
    }

    return guidance;
}

export const roleEvaluator: Evaluator = {
    name: "ANALYZE_USER_ROLE",
    description: "Analyzes and caches user roles and responsibilities",
    similes: ["DETERMINE_ROLE", "CHECK_ACCESS", "ASSESS_RESPONSIBILITIES"],
    handler: async (runtime: IAgentRuntime, message: Memory) => {
        return [];
    },
    validate: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State
    ): Promise<boolean> => {
        try {
            const cacheKey = `${runtime.character.name}/user-role/${message.userId}`;
            const existingData = await runtime.cacheManager?.get<
                RoleContent & { guidance: RoleGuidance }
            >(cacheKey);

            // Get user's Discord roles from message
            const content = message.content as DiscordContent;
            const roles = content.roles || [];

            // Get recent messages for context
            const recentMessages = await runtime.messageManager.getMemories({
                roomId: message.roomId,
                count: 50,
                unique: false,
            });

            const userMessages = recentMessages.filter(
                (m) => m.userId === message.userId
            );

            const roleContext = composeContext({
                state: {
                    ...state,
                    roles: roles.map((r) => r.name).join(", "),
                    userMessages: userMessages
                        .map((m) => m.content.text)
                        .join("\n"),
                },
                template: roleTemplate,
            });

            const result = await generateObject({
                runtime,
                context: roleContext,
                modelClass: ModelClass.SMALL,
                schema: RoleSchema,
            });

            const roleContent = result.object as RoleContent;

            // Merge with existing data if available
            const mergedContent = {
                primaryRole:
                    roleContent.primaryRole || existingData?.primaryRole,
                focusAreas: [
                    ...new Set([
                        ...(roleContent.focusAreas || []),
                        ...(existingData?.focusAreas || []),
                    ]),
                ],
                responsibilities: [
                    ...new Set([
                        ...(roleContent.responsibilities || []),
                        ...(existingData?.responsibilities || []),
                    ]),
                ],
                accessLevel:
                    roleContent.accessLevel ||
                    existingData?.accessLevel ||
                    "member",
            };

            const guidance = generateRoleGuidance(mergedContent);

            // Store merged content and guidance
            await runtime.cacheManager?.set(cacheKey, {
                ...mergedContent,
                guidance,
                timestamp: Date.now(),
            });

            // Consider validation successful if we have basic role info
            return (
                !!mergedContent.primaryRole &&
                mergedContent.focusAreas.length > 0 &&
                mergedContent.responsibilities.length > 0
            );
        } catch (error) {
            console.error("Error in role evaluator:", error);
            return false;
        }
    },
    examples: [
        {
            context: "User with engineering lead role discussing architecture",
            messages: [
                {
                    user: "{{user1}}",
                    content: {
                        text: "We need to review the system architecture for scalability.",
                    },
                },
            ],
            outcome: `{
                "primaryRole": "engineering_lead",
                "focusAreas": ["architecture", "scalability", "technical_planning"],
                "responsibilities": ["technical_oversight", "team_leadership", "architecture_decisions"],
                "accessLevel": "admin"
            }`,
        },
    ],
};
