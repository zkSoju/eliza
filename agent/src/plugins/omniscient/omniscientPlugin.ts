import { Plugin } from "@ai16z/eliza";
import { contextSummaryAction } from "./actions/contextSummaryAction";
import { projectSummaryAction } from "./actions/projectSummaryAction";
import { summaryAction } from "./actions/summaryAction";
import { importanceEvaluator } from "./evaluators/importanceEvaluator";
import { projectEvaluator } from "./evaluators/projectEvaluator";
import { roleEvaluator } from "./evaluators/roleEvaluator";
import { omniscientProvider } from "./providers/omniscientProvider";

export const omniscientPlugin: Plugin = {
    name: "OMNISCIENT",
    description: "Strategic intelligence and market analysis capabilities",
    evaluators: [projectEvaluator, importanceEvaluator, roleEvaluator],
    providers: [omniscientProvider],
    actions: [summaryAction, projectSummaryAction, contextSummaryAction],
};

export default omniscientPlugin;
