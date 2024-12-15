import { Plugin } from "@ai16z/eliza";
import { marketDataRefreshAction } from "./actions/marketDataRefreshAction";
import { marketSummaryAction } from "./actions/marketSummaryAction";
import { strategicInsightAction } from "./actions/strategicInsightAction";
import { teamAlignmentAction } from "./actions/teamAlignmentAction";
import { simpleHashProvider } from "./providers/simpleHashProvider";

export const cyberneticPlugin: Plugin = {
    name: "CYBERNETIC",
    description:
        "Provides organizational intelligence and team alignment capabilities",
    evaluators: [],
    providers: [simpleHashProvider],
    actions: [
        teamAlignmentAction,
        strategicInsightAction,
        marketSummaryAction,
        marketDataRefreshAction,
    ],
};

export default cyberneticPlugin;
