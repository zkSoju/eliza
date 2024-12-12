import { elizaLogger } from "@ai16z/eliza"
import { CommunityContext, CommunityRole } from "./types"

let currentContext: CommunityContext | null = null

export function setContext(context: CommunityContext) {
    currentContext = context
    elizaLogger.log("Community context updated:", context.name)
}

export function getContext(): CommunityContext | null {
    return currentContext
}

export function translateTerm(term: string): string {
    if (!currentContext?.customTerminology) return term
    return currentContext.customTerminology[term] || term
}

export function hasPermission(userRole: string, permission: string): boolean {
    if (!currentContext?.roles) return false
    const role = currentContext.roles.find(r => r.name === userRole)
    return role?.permissions.includes(permission) || false
}

// Helper to create a new context
export function createContext({
    name,
    description,
    terminology = {},
    roles = [],
    guidelines = []
}: {
    name: string
    description: string
    terminology?: Record<string, string>
    roles?: CommunityRole[]
    guidelines?: string[]
}): CommunityContext {
    return {
        name,
        description,
        customTerminology: terminology,
        roles,
        guidelines
    }
}

// New methods for dynamic updates
export function updateTerminology(newTerms: Record<string, string>) {
    if (!currentContext) throw new Error("Context not initialized")
    currentContext.customTerminology = {
        ...currentContext.customTerminology,
        ...newTerms
    }
    elizaLogger.log("Terminology updated:", newTerms)
}

export function addRole(role: CommunityRole) {
    if (!currentContext) throw new Error("Context not initialized")
    if (currentContext.roles.some(r => r.name === role.name)) {
        throw new Error(`Role ${role.name} already exists`)
    }
    currentContext.roles.push(role)
    elizaLogger.log("New role added:", role)
}

export function updateGuidelines(guidelines: string[]) {
    if (!currentContext) throw new Error("Context not initialized")
    currentContext.guidelines = guidelines
    elizaLogger.log("Guidelines updated")
}

export function addGuideline(guideline: string) {
    if (!currentContext) throw new Error("Context not initialized")
    currentContext.guidelines.push(guideline)
    elizaLogger.log("New guideline added:", guideline)
}

// Helper to check if context is initialized
export function isContextInitialized(): boolean {
    return currentContext !== null
}