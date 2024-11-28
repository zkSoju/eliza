import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { IAgentRuntime, Client, elizaLogger } from "@ai16z/eliza";
import { validateTwitterConfig } from "./enviroment.ts";
import { ClientBase } from "./base.ts";
import { imageGenerationPlugin } from "@ai16z/plugin-image-generation";

class TwitterManager {
    client: ClientBase;
    post: TwitterPostClient;
    search!: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    constructor(runtime: IAgentRuntime) {
        this.client = new ClientBase(runtime);
        this.post = new TwitterPostClient(this.client, runtime);
        // this.search = new TwitterSearchClient(runtime); // don't start the search client by default
        // this searches topics from character file, but kind of violates consent of random users
        // burns your rate limit and can get your account banned
        // use at your own risk
        this.interaction = new TwitterInteractionClient(this.client, runtime);
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime?: IAgentRuntime) {
        if (!runtime) throw new Error("Twitter client requires a runtime");
        
        await validateTwitterConfig(runtime);

        // Register image generation plugin
        runtime.plugins.push(imageGenerationPlugin);

        elizaLogger.log("Twitter client started");
        
        const minInterval = parseInt(runtime.getSetting("POST_INTERVAL_MIN") || "90");
        const maxInterval = parseInt(runtime.getSetting("POST_INTERVAL_MAX") || "180");
        elizaLogger.log(`Post interval configured for ${minInterval}-${maxInterval} minutes`);
        
        if (runtime.getSetting("IMAGE_GEN") === "TRUE") {
            elizaLogger.log("Image generation is ENABLED");
            const imageChance = runtime.getSetting("IMAGE_GEN_CHANCE") || "30";
            elizaLogger.log(`Image generation chance set to ${imageChance}%`);
        } else {
            elizaLogger.log("Image generation is DISABLED");
        }

        const manager = new TwitterManager(runtime);

        await manager.client.init();

        await manager.post.start();

        await manager.interaction.start();

        return manager;
    },
    async stop(_runtime?: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;
