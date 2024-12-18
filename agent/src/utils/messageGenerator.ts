import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    composeContext,
    elizaLogger,
    generateText,
} from "@ai16z/eliza";
const messageTemplate = `You are {{agentName}}, speaking in your authentic voice.

Your core traits and background:
{{bio}}

Your deeper history and lore:
{{lore}}

Recent conversation history:
{{recentMessages}}

Translate this information into your natural way of speaking:
{{context}}

Important guidelines:
- Stay completely in character as {{agentName}}
- Express the information naturally in your unique voice and mannerisms
- Keep your response concise and to a single line
- Maintain your established personality traits and speech patterns
- Convey the key information clearly while staying true to your character
- Maintain conversational continuity with recent messages

Respond as {{agentName}} would genuinely speak.`;

export interface MessageOptions {
    success?: boolean;
    error?: string;
    data?: Record<string, unknown>;
    targetChannelId?: string;
    model?: ModelClass;
}

export async function generateActionResponse(
    runtime: IAgentRuntime,
    state: State,
    callback: HandlerCallback,
    context: string,
    options: MessageOptions = {}
): Promise<boolean> {
    try {
        elizaLogger.info("Generating action response");

        const messageContext = composeContext({
            state: {
                ...state,
                context,
            },
            template: messageTemplate,
        });

        const response = await generateText({
            runtime,
            context: messageContext,
            modelClass: ModelClass.SMALL,
        });

        callback({
            text: response,
            content: {
                success: options.success ?? !options.error,
                ...(options.data || {}),
            },
        });

        return !options.error;
    } catch (error) {
        callback({
            text: "An error occurred while generating response",
            content: { error: "Response generation failed" },
        });
        return false;
    }
}

export async function generateDirectResponse(
    runtime: IAgentRuntime,
    state: State,
    callback: (
        content: Content,
        files?: any[],
        options?: { targetChannelId?: string; model?: ModelClass }
    ) => Promise<Memory[]>,
    context: Record<string, unknown>,
    template: string,
    options: MessageOptions = {}
): Promise<boolean> {
    try {
        // Stringify all context values
        const stringifiedContext = Object.fromEntries(
            Object.entries(context).map(([key, value]) => [
                key,
                typeof value === "string"
                    ? value
                    : JSON.stringify(value, null, 2),
            ])
        );

        const composedContext = composeContext({
            state: {
                ...state,
                ...stringifiedContext,
            },
            template,
        });

        const response = await generateText({
            runtime,
            context: composedContext,
            modelClass: ModelClass.SMALL,
        });

        // If targetChannelId is provided, wrap the callback
        const wrappedCallback = options.targetChannelId
            ? (content: any, files?: any[]) =>
                  callback(content, files, {
                      targetChannelId: options.targetChannelId,
                  })
            : callback;

        wrappedCallback({
            text: response,
            content: {
                success: options.success ?? !options.error,
                ...(options.data || {}),
            },
        });

        return !options.error;
    } catch (error) {
        callback({
            text: "An error occurred while generating response",
            content: { error: "Response generation failed" },
        });
        return false;
    }
}
