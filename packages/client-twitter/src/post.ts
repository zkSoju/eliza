import { Tweet } from "agent-twitter-client";
import {
    composeContext,
    generateText,
    embeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    ModelProviderName,
    stringToUuid,
    elizaLogger,
} from "@ai16z/eliza";
import { ClientBase } from "./base.ts";
import * as fs from 'fs/promises';

const twitterPostTemplate = `{{timeline}}

# Knowledge
{{knowledge}}

About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{postDirections}}

{{providers}}

{{recentPosts}}

{{characterPostExamples}}

# Task: Generate a post in the voice and style of {{agentName}}, aka @{{twitterUserName}}
Write a single sentence post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Try to write something totally different than previous posts. Do not add commentary or acknowledge this request, just write the post.
Your response should not contain any questions. Brief, concise statements only. No emojis. Use \\n\\n (double spaces) between statements.`;

const MAX_TWEET_LENGTH = 280;

/**
 * Truncate text to fit within the Twitter character limit, ensuring it ends at a complete sentence.
 */
function truncateToCompleteSentence(text: string): string {
    if (text.length <= MAX_TWEET_LENGTH) {
        return text;
    }

    // Attempt to truncate at the last period within the limit
    const truncatedAtPeriod = text.slice(
        0,
        text.lastIndexOf(".", MAX_TWEET_LENGTH) + 1
    );
    if (truncatedAtPeriod.trim().length > 0) {
        return truncatedAtPeriod.trim();
    }

    // If no period is found, truncate to the nearest whitespace
    const truncatedAtSpace = text.slice(
        0,
        text.lastIndexOf(" ", MAX_TWEET_LENGTH)
    );
    if (truncatedAtSpace.trim().length > 0) {
        return truncatedAtSpace.trim() + "...";
    }

    // Fallback: Hard truncate and add ellipsis
    return text.slice(0, MAX_TWEET_LENGTH - 3).trim() + "...";
}

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;

    async start(postImmediately: boolean = false) {
        if (!this.client.profile) {
            await this.client.init();
        }

        const generateNewTweetLoop = async () => {
            const lastPost = await this.runtime.cacheManager.get<{
                timestamp: number;
            }>(
                "twitter/" +
                    this.runtime.getSetting("TWITTER_USERNAME") +
                    "/lastPost"
            );

            const lastPostTimestamp = lastPost?.timestamp ?? 0;
            const minMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MIN")) || 90;
            const maxMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MAX")) || 180;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;
            const nextTweetTime = lastPostTimestamp + delay;
            
            // Store the next tweet time using cacheManager
            await this.runtime.cacheManager.set(
                "twitter/" + this.runtime.getSetting("TWITTER_USERNAME") + "/nextTweetTime",
                { timestamp: nextTweetTime }
            );
            elizaLogger.log(`Next tweet scheduled in ${randomMinutes} minutes`);

            if (Date.now() > nextTweetTime) {
                await this.generateNewTweet();
            }

            setTimeout(() => {
                generateNewTweetLoop(); // Set up next iteration
            }, delay);
        };

        if (postImmediately) {
            this.generateNewTweet();
        }

        generateNewTweetLoop();
    }

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
    }

    /**
     * Convert a data URL or file path to a Buffer
     * @param input The data URL string or file path
     * @returns Buffer containing the image data
     */
    private async imageToBuffer(input: string): Promise<Buffer> {
        // Check if it's a data URL
        if (input.startsWith('data:')) {
            const matches = input.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                throw new Error('Invalid data URL');
            }
            return Buffer.from(matches[2], 'base64');
        }
        
        // Otherwise treat it as a file path
        return fs.readFile(input);
    }

    private async generateNewTweet() {
        elizaLogger.log("Generating new tweet...");
        elizaLogger.log(`Environment variables: ${JSON.stringify(process.env)}`);
        const rawChance = this.runtime.getSetting("IMAGE_GEN_CHANCE") || "30";
        const imageGenChancePercent = parseFloat(rawChance.replace(/[^0-9.]/g, '')) || 30;
        elizaLogger.log(`Image generation chance set to ${imageGenChancePercent}%`);
        
        const shouldGenerateImage = Math.random() < (Math.max(0, Math.min(100, imageGenChancePercent)) / 100);
        elizaLogger.log(`Will ${shouldGenerateImage ? '' : 'not '}generate image for this tweet`);

        try {
            const content = await this.generateTweetText();
            if (!content) {
                elizaLogger.error("Failed to generate tweet text");
                return;
            }

            // Check for dry run mode
            if (this.runtime.getSetting("TWITTER_DRY_RUN") === "true") {
                elizaLogger.info(`Dry run: would have posted tweet: ${content}`);
                if (shouldGenerateImage) {
                    elizaLogger.info("Dry run: would have generated an image");
                }
                return;
            }

            if (shouldGenerateImage) {
                const imagePrompt = `Generate an image that represents this tweet: ${content}`;
                
                try {
                    // Generate image using the plugin
                    const imageAction = this.runtime.plugins.find(p => p.name === "imageGeneration")?.actions?.[0];
                    if (!imageAction?.handler) {
                        elizaLogger.error("Image generation plugin not found or handler not available");
                        return;
                    }

                    // Temporarily set modelProvider to HEURIST for image generation
                    const originalProvider = this.runtime.character.modelProvider;
                    this.runtime.character.modelProvider = ModelProviderName.HEURIST;

                    const imageMessage = {
                        userId: this.runtime.agentId,
                        roomId: stringToUuid("twitter_image_generation"),
                        agentId: this.runtime.agentId,
                        content: {
                            text: imagePrompt,
                            action: "GENERATE_IMAGE",
                            payload: {
                                prompt: imagePrompt,
                                model: this.runtime.getSetting("HEURIST_IMAGE_MODEL") || "FLUX.1-dev",
                                width: 1024,
                                height: 1024,
                                steps: 30
                            }
                        }
                    };

                    try {
                        // Create state for image generation
                        const state = await this.runtime.composeState(imageMessage, {
                            type: "GENERATE_IMAGE",
                            payload: {
                                prompt: imagePrompt,
                                model: this.runtime.getSetting("HEURIST_IMAGE_MODEL") || "FLUX.1-dev",
                                width: 1024,
                                height: 1024,
                                steps: 30
                            }
                        });

                        const result = await imageAction.handler(
                            this.runtime,
                            imageMessage,
                            state
                        ) as { success: boolean; data?: string } | undefined;

                        // Restore original modelProvider
                        this.runtime.character.modelProvider = originalProvider;

                        if (result?.success && result.data) {
                            // Convert file path or data URL to Buffer
                            const imageBuffer = await this.imageToBuffer(result.data);
                            
                            // Send tweet with image using new API
                            await this.client.twitterClient.sendTweetWithMedia(content, [imageBuffer]);
                            elizaLogger.log("Posted tweet with generated image:", content);
                        } else {
                            // Fallback to text-only tweet if image generation fails
                            await this.client.twitterClient.sendTweet(content);
                            elizaLogger.log("Posted text-only tweet (image generation failed):", content);
                        }
                    } catch (error) {
                        // Restore original modelProvider in case of error
                        this.runtime.character.modelProvider = originalProvider;
                        elizaLogger.error("Error details:", {
                            name: error?.name,
                            message: error?.message,
                            stack: error?.stack,
                            cause: error?.cause
                        });
                        throw error;
                    }
                } catch (error) {
                    // Fallback to text-only tweet if image generation fails
                    elizaLogger.error("Error generating image:", {
                        name: error?.name,
                        message: error?.message,
                        stack: error?.stack,
                        cause: error?.cause
                    });
                    await this.client.twitterClient.sendTweet(content);
                    elizaLogger.log("Posted text-only tweet (after image error):", content);
                }
            } else {
                // Post text-only tweet
                await this.client.twitterClient.sendTweet(content);
                elizaLogger.log("Posted tweet:", content);
            }

            await this.runtime.cacheManager.set(
                "twitter/" +
                    this.runtime.getSetting("TWITTER_USERNAME") +
                    "/lastPost",
                {
                    timestamp: Date.now(),
                }
            );
        } catch (error) {
            elizaLogger.error("Error generating/posting tweet:", error);
        }
    }

    /**
     * Post a tweet with one or more images
     * @param text The tweet text
     * @param images Array of image data as Buffer or data URL strings
     * @param replyToTweetId Optional tweet ID to reply to
     */
    async postTweetWithImages(text: string, images: (Buffer | string)[], replyToTweetId?: string) {
        try {
            // Convert any data URLs to Buffers
            const imageBuffers = await Promise.all(images.map(async img => {
                if (Buffer.isBuffer(img)) {
                    return img;
                }
                if (typeof img === 'string' && img.startsWith('data:')) {
                    return await this.imageToBuffer(img);
                }
                throw new Error('Invalid image format. Must be Buffer or data URL string.');
            }));

            await this.client.twitterClient.sendTweetWithMedia(text, imageBuffers, replyToTweetId);
            elizaLogger.log("Posted tweet with custom images:", text);
        } catch (error) {
            elizaLogger.error("Error posting tweet with images:", error);
            throw error;
        }
    }

    private async generateTweetText(): Promise<string | undefined> {
        try {
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                this.client.profile.username,
                this.runtime.character.name,
                "twitter"
            );

            let homeTimeline: Tweet[] = [];

            const cachedTimeline = await this.client.getCachedTimeline();

            if (cachedTimeline) {
                homeTimeline = cachedTimeline;
            } else {
                homeTimeline = await this.client.fetchHomeTimeline(10);
                await this.client.cacheTimeline(homeTimeline);
            }
            const formattedHomeTimeline =
                `# ${this.runtime.character.name}'s Home Timeline\n\n` +
                homeTimeline
                    .map((tweet) => {
                        return `#${tweet.id}\n${tweet.name} (@${tweet.username})${tweet.inReplyToStatusId ? `\nIn reply to: ${tweet.inReplyToStatusId}` : ""}\n${new Date(tweet.timestamp).toDateString()}\n\n${tweet.text}\n---\n`;
                    })
                    .join("\n");

            const topics = this.runtime.character.topics.join(", ");

            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: stringToUuid("twitter_generate_room"),
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics,
                        action: "",
                    },
                },
                {
                    twitterUserName: this.client.profile.username,
                    timeline: formattedHomeTimeline,
                }
            );

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.twitterPostTemplate ||
                    twitterPostTemplate,
            });

            elizaLogger.debug("generate post prompt:\n" + context);

            const newTweetContent = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // Replace \n with proper line breaks and trim excess spaces
            const formattedTweet = newTweetContent
                .replaceAll(/\\n/g, "\n")
                .trim();

            // Use the helper function to truncate to complete sentence
            return truncateToCompleteSentence(formattedTweet);

        } catch (error) {
            elizaLogger.error("Error generating tweet text:", error);
            return undefined;
        }
    }
}
