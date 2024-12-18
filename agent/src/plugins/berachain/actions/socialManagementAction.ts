import {
    Action,
    composeContext,
    elizaLogger,
    generateObject,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@ai16z/eliza";
import { z } from "zod";
import { BerachainSocialProvider } from "../providers/socialProvider";

const socialTemplate = `Given a conversation about managing community roles and settings, extract the relevant information.

Example request: "add @alice as a community manager who can pin messages and moderate chat"
Example response:
\`\`\`json
{
    "action": "addRole",
    "data": {
        "name": "community_manager",
        "description": "Community management role with moderation abilities",
        "permissions": ["pin_messages", "moderate_chat"],
        "user": "@alice"
    }
}
\`\`\`

Example request: "update HONEY token to show as Sweet Honey with a honey pot emoji"
Example response:
\`\`\`json
{
    "action": "updateTerminology",
    "data": {
        "HONEY": "🍯 Sweet Honey"
    }
}
\`\`\`

Look for:
1. User mentions (@username)
2. Role assignments (manager, moderator, etc.)
3. Permissions (pin messages, moderate chat, etc.)
4. Token terminology updates
5. Guideline additions

Common patterns:
- "add @user as role"
- "make @user a role"
- "let @user be role"
- "update token to show as"
- "add guideline about"

{{recentMessages}}

Extract the social management request details and respond with a JSON markdown block.`;

const SocialActionSchema = z.object({
    action: z.enum([
        "updateTerminology",
        "addRole",
        "updateGuidelines",
        "addGuideline",
    ]),
    data: z.record(z.any()),
});

export const socialManagementAction: Action = {
    name: "MANAGE_SOCIAL",
    description: "Manage social context and community features",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback: HandlerCallback
    ): Promise<boolean> => {
        try {
            elizaLogger.log("Starting MANAGE_SOCIAL handler...");

            // Compose social context
            const context = composeContext({
                state,
                template: socialTemplate,
            });

            // Generate and validate social content
            const content = await generateObject({
                runtime,
                context,
                modelClass: ModelClass.SMALL,
                schema: SocialActionSchema,
            });

            if (
                !content.object ||
                !SocialActionSchema.safeParse(content.object).success
            ) {
                callback({
                    text: "ser, i'm not quite sure what you want me to do with the community settings... *confused bear noises* 🐻",
                    content: {
                        error: "Invalid social management action format",
                    },
                });
                return false;
            }

            const socialProvider = new BerachainSocialProvider(runtime);

            const socialContent = content.object as z.infer<
                typeof SocialActionSchema
            >;

            switch (socialContent.action) {
                case "updateTerminology":
                    await socialProvider.updateTerminology(
                        socialContent.data as Record<string, string>
                    );
                    callback({
                        text: "ser, i've updated those token names! keeping it fresh! *happy bear noises* 🐻✨",
                        content: { success: true, action: "updateTerminology" },
                    });
                    return true;

                case "addRole":
                    const roleData = socialContent.data;
                    socialProvider.addRole({
                        name: roleData.name,
                        description: roleData.description,
                        permissions: roleData.permissions,
                    });
                    callback({
                        text: `ser, adding ${roleData.user} as ${roleData.name} is a great play. we need all hands on deck! *excited bear noises* 🐻✨`,
                        content: {
                            success: true,
                            action: "addRole",
                            user: roleData.user,
                        },
                    });
                    return true;

                case "updateGuidelines":
                    socialProvider.updateGuidelines(
                        socialContent.data as string[]
                    );
                    callback({
                        text: "ser, guidelines updated! keeping the community degen but respectful! *proud bear noises* 🐻📜",
                        content: { success: true, action: "updateGuidelines" },
                    });
                    return true;

                case "addGuideline":
                    socialProvider.updateGuidelines([
                        socialContent.data.toString(),
                    ]);
                    callback({
                        text: "ser, added that guideline! helping the community stay based! *helpful bear noises* 🐻📝",
                        content: { success: true, action: "addGuideline" },
                    });
                    return true;

                default:
                    callback({
                        text: "ser, i'm not sure what you want me to do with the community... *confused bear noises* 🐻❓",
                        content: { error: "Unknown social management action" },
                    });
                    return false;
            }
        } catch (error) {
            elizaLogger.error("Social management action error:", error);
            callback({
                text: `ser, something went wrong... probably got liquidated... *sad bear noises* 🐻\nerror: ${error instanceof Error ? error.message : "Unknown error"}`,
                content: {
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                },
            });
            return false;
        }
    },
    validate: async (runtime: IAgentRuntime) => {
        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "ser, adding a community manager sounds like a solid move. always good to have someone to pin those important messages while we're all getting rekt. let's keep this degen ship sailing!",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "add <@393235772708225035> as a community manager who can pin messages and moderate chat",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "ser, adding alice is a great play. we need all hands on deck while we're liquidating our portfolios. let's keep the vibes high!",
                    action: "MANAGE_SOCIAL",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "ser, can we make the HONEY token look more sweet?",
                },
            },
            {
                user: "{{user1}}",
                content: {
                    text: "update HONEY to show as Sweet Honey with a honey pot emoji",
                },
            },
            {
                user: "{{user2}}",
                content: {
                    text: "ser, updating HONEY to 🍯 Sweet Honey... making it look as sweet as our gains! *excited bear noises* 🐻",
                    action: "MANAGE_SOCIAL",
                },
            },
        ],
    ],
    similes: [
        "MANAGE_SOCIAL",
        "UPDATE_COMMUNITY",
        "MODIFY_SETTINGS",
        "CHANGE_TERMINOLOGY",
        "ADD_TEAM_MEMBER",
        "UPDATE_ROLE",
    ],
};
