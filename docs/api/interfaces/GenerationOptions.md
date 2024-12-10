[@ai16z/eliza v0.1.5-alpha.5](../index.md) / GenerationOptions

# Interface: GenerationOptions

Configuration options for generating objects with a model.

## Properties

### runtime

> **runtime**: [`IAgentRuntime`](IAgentRuntime.md)

#### Defined in

[packages/core/src/generation.ts:1091](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1091)

***

### context

> **context**: `string`

#### Defined in

[packages/core/src/generation.ts:1092](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1092)

***

### modelClass

> **modelClass**: [`ModelClass`](../enumerations/ModelClass.md)

#### Defined in

[packages/core/src/generation.ts:1093](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1093)

***

### schema?

> `optional` **schema**: `ZodType`\<`any`, `ZodTypeDef`, `any`\>

#### Defined in

[packages/core/src/generation.ts:1094](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1094)

***

### schemaName?

> `optional` **schemaName**: `string`

#### Defined in

[packages/core/src/generation.ts:1095](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1095)

***

### schemaDescription?

> `optional` **schemaDescription**: `string`

#### Defined in

[packages/core/src/generation.ts:1096](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1096)

***

### stop?

> `optional` **stop**: `string`[]

#### Defined in

[packages/core/src/generation.ts:1097](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1097)

***

### mode?

> `optional` **mode**: `"auto"` \| `"json"` \| `"tool"`

#### Defined in

[packages/core/src/generation.ts:1098](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1098)

***

### experimental\_providerMetadata?

> `optional` **experimental\_providerMetadata**: `Record`\<`string`, `unknown`\>

#### Defined in

[packages/core/src/generation.ts:1099](https://github.com/0xHoneyJar/thj-agents/blob/main/packages/core/src/generation.ts#L1099)
