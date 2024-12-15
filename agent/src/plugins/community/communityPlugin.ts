import { Plugin } from "@ai16z/eliza";
import { communityInsightAction } from "./actions/communityInsightAction";
import { conversationAnalysisEvaluator } from "./evaluators/conversationAnalysisEvaluator";

export const communityPlugin: Plugin = {
    name: "COMMUNITY",
    description: "Analyzes community conversations and provides actionable insights",
    evaluators: [conversationAnalysisEvaluator],
    providers: [],
    actions: [communityInsightAction],
};

export default communityPlugin;