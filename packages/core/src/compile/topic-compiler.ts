import type { TopicCandidate, TopicArticle, ArticleKind, ProjectConfig } from "@llm-wiki-compiler/types";
import { type AgentAdapter, type AgentRunInput } from "@llm-wiki-compiler/types";
import type { AgentProviderConfig } from "@llm-wiki-compiler/types";
import { BaseTopicCompiler } from "./base";
import { createPromptLoader, PromptNames } from "@llm-wiki-compiler/prompts";
import { createArticleRenderer, ArticleSectionBuilder } from "@llm-wiki-compiler/templates";
import { createLogger } from "@llm-wiki-compiler/shared";

export class AgentTopicCompiler extends BaseTopicCompiler {
  private promptLoader = createPromptLoader();

  constructor(
    private agentAdapter: AgentAdapter,
    private agentConfig: AgentProviderConfig,
    private templatePath: string
  ) {
    super();
  }

  async compile(topic: TopicCandidate): Promise<TopicArticle> {
    this.logger.info(`Compiling topic: ${topic.slug}`);

    try {
      // Build the system prompt for topic compilation
      const systemPrompt = await this.buildSystemPrompt(topic);

      // Build the user prompt with source files content
      const userPrompt = await this.buildUserPrompt(topic);

      // Prepare agent input
      const agentInput: AgentRunInput = {
        cwd: process.cwd(),
        systemPrompt,
        userPrompt,
        expectJson: true, // Request structured JSON output
        timeoutMs: this.agentConfig.timeout_ms || 120000,
        metadata: {
          task: "topic-compile",
          topicSlug: topic.slug,
        },
      };

      // Execute agent
      const result = await this.agentAdapter.run(agentInput);

      if (!result.success) {
        throw new Error(`Agent execution failed: ${result.error}`);
      }

      // Parse and validate the result
      const article = this.parseAgentResult(result.text, topic);

      if (!this.validateArticle(article)) {
        throw new Error(`Generated article failed validation for topic: ${topic.slug}`);
      }

      this.logger.info(`Successfully compiled topic: ${topic.slug}`);
      return article;
    } catch (error) {
      this.logger.error(`Failed to compile topic ${topic.slug}:`, error);
      throw error;
    }
  }

  private async buildSystemPrompt(topic: TopicCandidate): Promise<string> {
    // Load the wiki-compiler skill for core instructions
    const skillPrompt = await this.promptLoader.load(PromptNames.WIKI_COMPILER);

    // Build system prompt with skill instructions + topic-specific context
    const systemPrompt = `${skillPrompt}

## Current Task

You are compiling topic article: ${topic.slug}

**Topic Kind:** ${topic.kind}

**Source Files (${topic.sourceFiles.length}):**
${topic.sourceFiles.map(f => `- ${f}`).join("\n")}

Your task is to:
1. Read all source file contents
2. Synthesize a comprehensive topic article
3. Output as structured JSON (see user prompt for format)
`;

    return systemPrompt;
  }

  private async buildUserPrompt(topic: TopicCandidate): Promise<string> {
    const sourcesPrompt = topic.sourceFiles.map(path => {
      return `
\`\`\`
FILE: ${path}
\`\`\`
`;
    }).join("\n");

    return `## Source Files Content

Read the following source files and compile them into a topic article:

${sourcesPrompt}

## Output Format

Respond with a JSON object in this exact format:

\`\`\`json
{
  "title": "Comprehensive Article Title",
  "summary_section": "2-3 paragraph summary...",
  "timeline_section": "This section should contain key events...",
  "current_state_section": "What's true right now...",
  "key_decisions_section": "Decisions with rationale...",
  "experiments_section": "| Experiment | Status | Finding | |",
  "gotchas_section": "Known issues and workarounds...",
  "open_questions_section": "Unresolved questions...",
  "sources_section": "List all source files that contributed...",
  "coverage_tags": {
    "summary": "high|medium|low",
    "current_state": "high|medium|low",
    ...
  }
}
\`\`\`

## Guidelines

1. **Be specific and factual** - Include actual data, numbers, dates, decisions
2. **Mark coverage** - Frontmatter sections with [coverage: level] indicator in your mind
3. **No placeholders** - Fill every section with actual content
4. **Cite sources** - In the sources_section, list ALL files used
5. **Use section names as keys** - Your JSON should match the structure above

Start your response with valid JSON only, no additional text.`;
  }

  private parseAgentResult(text: string, topic: TopicCandidate): TopicArticle {
    // Try to parse JSON from agent output
    let jsonText = text.trim();

    // Handle markdown code blocks
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const data = JSON.parse(jsonText);

    // Build article content from JSON
    const sections = [
      { name: "Summary", content: data.summary_section || "" },
      { name: "Timeline", content: data.timeline_section || "" },
      { name: "Current State", content: data.current_state_section || "" },
      { name: "Key Decisions", content: data.key_decisions_section || "" },
      { name: "Experiments & Results", content: data.experiments_section || "" },
      { name: "Gotchas & Known Issues", content: data.gotchas_section || "" },
      { name: "Open Questions", content: data.open_questions_section || "" },
    ];

    let content = "";
    for (const section of sections) {
      if (section.content.trim()) {
        const coverage = data.coverage_tags?.[this.sectionToKey(section.name)] || "low";
        content += `## ${section.name} [coverage: ${coverage}]\n\n${section.content.trim()}\n\n`;
      } else {
        content += `## ${section.name} [coverage: low]\n\n*This section needs content from source files.*\n\n`;
      }
    }

    content += `## Sources\n\n`;
    content += topic.sourceFiles.map(file => `- ${file}`).join("\n");

    return {
      slug: topic.slug,
      title: data.title || topic.title,
      content,
      frontmatter: {
        topic: data.title || topic.title,
        last_compiled: new Date().toISOString().split("T")[0],
        source_count: topic.sourceFiles.length,
        status: "active",
        coverage: data.coverage_tags || {},
      },
      sourceFiles: topic.sourceFiles,
      kind: topic.kind,
    };
  }

  private sectionToKey(sectionName: string): string {
    return sectionName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  }
}

export function createAgentTopicCompiler(
  agentAdapter: AgentAdapter,
  agentConfig: AgentProviderConfig,
  templatePath: string
): AgentTopicCompiler {
  return new AgentTopicCompiler(agentAdapter, agentConfig, templatePath);
}
