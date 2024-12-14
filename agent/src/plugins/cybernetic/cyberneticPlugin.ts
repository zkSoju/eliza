import { Plugin } from "@ai16z/eliza";
import { analyticsInsightAction } from "./actions/analyticsInsightAction";
import { strategicInsightAction } from "./actions/strategicInsightAction";
import { teamAlignmentAction } from "./actions/teamAlignmentAction";
import { marketSummaryAction } from "./actions/marketSummaryAction";
import { marketTrendEvaluator } from "./evaluators/marketTrendEvaluator";
import { cyberneticProvider } from "./providers/cyberneticProvider";
import { openPanelProvider } from "./providers/openPanelProvider";
import { simpleHashProvider } from "./providers/simpleHashProvider";
export const cyberneticPlugin: Plugin = {
    name: "CYBERNETIC",
    description:
        "Provides organizational intelligence and team alignment capabilities",
    evaluators: [marketTrendEvaluator],
    providers: [cyberneticProvider, openPanelProvider, simpleHashProvider],
    actions: [
        teamAlignmentAction,
        analyticsInsightAction,
        strategicInsightAction,
        marketSummaryAction,
    ],
};

export default cyberneticPlugin;
