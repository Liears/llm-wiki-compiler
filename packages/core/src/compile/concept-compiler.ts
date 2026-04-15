import type { ConceptArticle, ConceptState, TopicCandidate } from "@llm-wiki-compiler/types";
import { type AgentAdapter } from "@llm-wiki-compiler/types";
import type { AgentRunInput, AgentProviderConfig } from "@llm-wiki-compiler/types";
import { BaseConceptCompiler } from "./base";
import { createPromptLoader } from "@llm-wiki-compiler/prompts";
import { createLogger, slugify } from "@llm-wiki-compiler/shared";

export interface ConceptInput {
  concepts: Array<{
    slug: string;
    title: string;
    pattern: string;
    instances: Array<{ date: string; topicSlug: string; description: string }>;
    meaning: string;
  }>;
  topicArticles: Record<string, { content: string; title: string }>;
}

export class AgentConceptCompiler extends BaseConceptCompiler {
  private promptLoader = createPromptLoader();

  constructor(
    private agentAdapter: AgentAdapter,
    private agentConfig: AgentProviderConfig
  ) {
    super();
  }

  async compile(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>> {
    this.logger.info(`Compiling concepts from ${topicSlugs.length} topics`);

    const results: Array<{ slug: string; isNew: boolean }> = [];

    // Group topics into batches for concept discovery
    // For efficiency with LLM, process in groups
    const batchSize = 5;
    for (let i = 0; i < topicSlugs.length; i += batchSize) {
      const batch = topicSlugs.slice(i, i + batchSize);

      try {
        const batchResults = await this.compileConceptBatch(batch);
        results.push(...batchResults);
      } catch (error) {
        this.logger.error(`Failed to compile concept batch:`, error);
        // Continue with next batch
      }
    }

    this.logger.info(`Compiled ${results.length} concept(s)`);
    return results;
  }

  private async compileConceptBatch(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>> {
    if (topicSlugs.length < 3) {
      // Need at least 3 topics for pattern detection
      return [];
    }

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(topicSlugs);

    const agentInput: AgentRunInput = {
      cwd: process.cwd(),
      systemPrompt,
      userPrompt,
      expectJson: true,
      timeoutMs: this.agentConfig.timeout_ms || 120000,
      metadata: {
        task: "concept-compile",
        topicSlugs: topicSlugs.join(","),
      },
    };

    const result = await this.agentAdapter.run(agentInput);

    if (!result.success) {
      throw new Error(`Agent execution failed: ${result.error}`);
    }

    return this.parseConceptResult(result.text, topicSlugs);
  }

  private buildSystemPrompt(): string {
    return `You are an expert identifying cross-cutting patterns across multiple wiki articles.

Your task is to:
1. Read multiple topic articles
2. Identify patterns, themes, or concepts that appear across 3+ topics
3. For each significant pattern, create a "concept" article

**A concept article:**
- Synthesizes a pattern that appears across multiple topics
- Is interpretive, not factual - it answers "what does this mean?"
- Connects at least 3 different topics with a non-obvious insight
- Examples: "speed vs quality tradeoffs", "JSON-first architecture", "experiment measurement bias"

**Good candidate concepts:**
- A decision/issue appearing in 3+ contexts
- A relationship or stakeholder dynamic that recurs
- A methodology that evolves across topics
- A recurring failure mode or pitfall
- An architectural principle that plays out differently in different contexts

**Bad candidates (skip these):**
- Generic common terms (e.g., "user", "data", "service")
- Single-occurrence patterns
- Topic-specific details without cross-cutting value
- Concepts that are just lists of things

Return a JSON array of valid concept definitions.`;
  }

  private buildUserPrompt(topicSlugs: string[]): string {
    return `## Task

Analyze the following ${topicSlugs.length} topic articles (${topicSlugs.join(
      ", "
    )}) to identify cross-cutting concepts.

## Input

Topic article slugs to analyze:
${topicSlugs.map((s) => `- ${s}`).join("\n")}

## Output Format

Respond with a JSON array. For each concept found:

\`\`\`json
[
  {
    "slug": "short-kebab-case-name",
    "title": "Human-Readable Title",
    "pattern_description": "1-2 paragraphs explaining what this pattern is and why it keeps recurring...",
    "instances": [
      {
        "date": "YYYY-MM-DD",
        "topic_slug": "x",
        "description": "What happened in this topic, specific context"
      }
    ],
    "meaning": "Synthesis - what does this pattern tell us about our work, decisions, or blind spots? This is the interpretive part."
  }
]
\`\`\`

## Process

1. For each topic slug, look for patterns that also appear in 2+ other topics
2. For each pattern found, collect specific instances with dates and context from each topic
3. Write a synthesis in the "meaning" field answering "so what?"
4. ONLY include concepts that genuinely connect 3+ topics
5. Skip obvious/generic patterns. Focus on non-trivial insights.

Return valid JSON only, no introductory text.`;
  }

  private parseConceptResult(
    text: string,
    topicSlugs: string[]
  ): Array<{ slug: string; isNew: boolean }> {
    let jsonText = text.trim();

    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const concepts = JSON.parse(jsonText) as Array<any>;

    return concepts.map((concept) => ({
      slug: concept.slug || slugify(concept.title),
      isNew: true, // All concepts from compilation are considered new
    }));
  }

  // Generate full concept article content
  async generateFullArticle(
    concept: {
      slug: string;
      title: string;
      pattern: string;
      instances: Array<{ date: string; topicSlug: string; description: string }>;
      meaning: string;
    },
    topicArticles: Record<string, { content: string; title: string }>
  ): Promise<ConceptArticle> {
    this.logger.info(`Generating full article for concept: ${concept.slug}`);

    const systemPrompt = `You are compiling a "concept" article for a wiki.

A concept article:
- Is interpretive, not just factual
- Synthesizes a cross-cutting pattern across multiple topics
- Answers "what does this mean?" not just "what happened?"
- Has 3 sections: Pattern, Instances, What This Means

Write in markdown with proper frontmatter.`;

    const instancesMarkdown = concept.instances
      .map(
        (instance) =>
          `- **${instance.date}** in [[../topics/${instance.topicSlug}]]: ${instance.description}`
      )
      .join("\n");

    const content = `## Pattern

${concept.pattern}

## Instances

${instancesMarkdown}

## What This Means

${concept.meaning}
`;

    return {
      slug: concept.slug,
      title: concept.title,
      content,
      frontmatter: {
        concept: concept.title,
        last_compiled: new Date().toISOString().split("T")[0],
        topics_connected: concept.instances.map((i) => i.topicSlug),
        status: "active",
      },
      topicSlugs: concept.instances.map((i) => i.topicSlug),
      pattern: concept.pattern,
      instances: concept.instances,
      meaning: concept.meaning,
    };
  }
}

export function createAgentConceptCompiler(
  agentAdapter: AgentAdapter,
  agentConfig: AgentProviderConfig
): AgentConceptCompiler {
  return new AgentConceptCompiler(agentAdapter, agentConfig);
}
