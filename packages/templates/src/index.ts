import * as path from "path";
import * as fs from "fs/promises";
import { ArticleSectionConfig, LinkStyle } from "@llm-wiki-compiler/types";

// ============================================================================
// Template Types
// ============================================================================

export interface TemplateContext {
  name: string;
  project_name?: string;
  date?: string;
  coverage?: string;
  source_count?: number;
  sources?: string[];
  sections?: ArticleSectionConfig[];
  link_style?: LinkStyle;
  [key: string]: unknown;
}

export interface ArticleTemplate {
  name: string;
  type: "topic" | "concept" | "index" | "schema" | "codebase-topic";
  defaultSections?: ArticleSectionConfig[];
  content: string;
}

export interface TemplateLoader {
  loadTemplate(name: string): Promise<string>;
  loadTemplateNamed(name: string): Promise<ArticleTemplate>;
  renderTemplate(name: string, context: TemplateContext): Promise<string>;
}

// ============================================================================
// Asset Template Loader
// ============================================================================

export class AssetTemplateLoader implements TemplateLoader {
  private assetsPath: string;
  private cache = new Map<string, string>();

  constructor(assetsPath: string) {
    this.assetsPath = path.resolve(assetsPath);
  }

  private resolveAssetPath(name: string): string {
    const possiblePaths = [
      path.join(this.assetsPath, `${name}.md`),
      path.join(this.assetsPath, `${name}-template.md`),
      path.join(this.assetsPath, name),
      path.join(this.assetsPath, `${name.toLowerCase()}.md`),
      path.join(this.assetsPath, `${name.toLowerCase()}-template.md`),
    ];

    return possiblePaths.find((p) => p.endsWith(".md")) || possiblePaths[0];
  }

  async loadTemplate(name: string): Promise<string> {
    // Check cache first
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    const assetPath = this.resolveAssetPath(name);

    try {
      const content = await fs.readFile(assetPath, "utf-8");
      this.cache.set(name, content);
      return content;
    } catch (error) {
      throw new Error(`Failed to load template "${name}" from ${assetPath}: ${error}`);
    }
  }

  async loadTemplateNamed(name: string): Promise<ArticleTemplate> {
    const content = await this.loadTemplate(name);
    const type = this.detectTemplateType(name);

    return {
      name,
      type,
      content,
    };
  }

  async renderTemplate(name: string, context: TemplateContext): Promise<string> {
    const template = await this.loadTemplate(name);
    return this.render(template, context);
  }

  private render(template: string, context: TemplateContext): string {
    let rendered = template;

    // Replace specific template variables
    const defaultContext: TemplateContext = {
      date: new Date().toISOString().split("T")[0],
      ...context,
    };

    // First pass: {{variable}} - for user-defined context
    for (const [key, value] of Object.entries(defaultContext)) {
      if (value !== undefined) {
        const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
        rendered = rendered.replace(pattern, String(value));
      } else if (rendered.includes(`{{${key}}}`)) {
        // If variable is required but not provided, leave placeholder
        rendered = rendered.replace(
          new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"),
          `{{${key}}}`
        );
      }
    }

    return rendered;
  }

  private detectTemplateType(name: string): ArticleTemplate["type"] {
    const lowerName = name.toLowerCase();

    if (lowerName.includes("codebase")) {
      return "codebase-topic";
    }
    if (lowerName.includes("concept")) {
      return "concept";
    }
    if (lowerName.includes("index")) {
      return "index";
    }
    if (lowerName.includes("schema")) {
      return "schema";
    }

    return "topic";
  }

  clearCache(): void {
    this.cache.clear();
  }

  listAvailableTemplates(): Promise<string[]> {
    return (async () => {
      try {
        const files = await fs.readdir(this.assetsPath);
        return files
          .filter((file) => file.endsWith(".md"))
          .map((file) => file.replace(/-template\.md$/, ".md").replace(".md", ""));
      } catch {
        return [];
      }
    })();
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createTemplateLoader(): TemplateLoader {
  // Resolve path relative to this package
  const packagePath = __dirname;
  const assetsPath = path.join(packagePath, "..", "assets");
  return new AssetTemplateLoader(assetsPath);
}

// ============================================================================
// Template Names (constants for type safety)
// ============================================================================

export const TemplateNames = {
  TOPIC: "article-template",
  CODEBASE_TOPIC: "codebase-article-template",
  INDEX: "index-template",
  SCHEMA: "schema-template",
} as const;

export type TemplateName = (typeof TemplateNames)[keyof typeof TemplateNames];

// ============================================================================
// Article Section Builder
// ============================================================================

export class ArticleSectionBuilder {
  private sections: ArticleSectionConfig[] = [];

  addSection(section: ArticleSectionConfig): this {
    this.sections.push(section);
    return this;
  }

  addStandardTopicSections(): this {
    const standardSections: ArticleSectionConfig[] = [
      { name: "Summary", description: "2-3 paragraph synthesis of everything known about this topic", required: true },
      { name: "Timeline", description: "Key events in chronological order" },
      { name: "Current State", description: "What's true RIGHT NOW: active metrics, live experiments, open questions" },
      { name: "Key Decisions", description: "Decisions that shaped current approach, with rationale" },
      { name: "Experiments & Results", description: "Table of experiments with status and findings" },
      { name: "Gotchas & Known Issues", description: "Relevant known issues, traps, and workarounds" },
      { name: "Open Questions", description: "Unresolved threads, gaps in knowledge, suggested next investigations" },
    ];

    standardSections.forEach((section) => this.addSection(section));
    return this;
  }

  addCodebaseSections(): this {
    const codebaseSections: ArticleSectionConfig[] = [
      { name: "Summary", description: "2-3 paragraph standalone briefing of this module/service", required: true },
      { name: "Architecture", description: "High-level design, data flow, key abstractions" },
      { name: "API Surface", description: "Public interfaces, endpoints, and contracts" },
      { name: "Data Models", description: "Schemas, types, and data structures" },
      { name: "Dependencies", description: "External services, libraries, and internal dependencies" },
      { name: "Key Implementation Details", description: "Notable algorithms, patterns, and design choices" },
      { name: "Testing Strategy", description: "How this is tested, coverage considerations" },
    ];

    codebaseSections.forEach((section) => this.addSection(section));
    return this;
  }

  addRequiredSection(name: string, description: string): this {
    this.addSection({ name, description, required: true });
    return this;
  }

  build(): ArticleSectionConfig[] {
    return [...this.sections];
  }

  static createDefaultTopicSections(): ArticleSectionConfig[] {
    return new ArticleSectionBuilder().addStandardTopicSections().build();
  }

  static createDefaultCodebaseSections(): ArticleSectionConfig[] {
    return new ArticleSectionBuilder().addCodebaseSections().build();
  }
}

// ============================================================================
// Renders for specific article types
// ============================================================================

export class ArticleRenderer {
  constructor(private templateLoader: TemplateLoader) {}

  async renderTopicArticle(
    context: TemplateContext
  ): Promise<string> {
    const templateName =
      context.mode === "codebase" ? TemplateNames.CODEBASE_TOPIC : TemplateNames.TOPIC;
    return this.templateLoader.renderTemplate(templateName, context);
  }

  async renderConceptArticle(context: TemplateContext): Promise<string> {
    return this.templateLoader.renderTemplate("concept-template", context);
  }

  async renderIndex(context: TemplateContext): Promise<string> {
    return this.templateLoader.renderTemplate(TemplateNames.INDEX, context);
  }

  async renderSchema(context: TemplateContext): Promise<string> {
    return this.templateLoader.renderTemplate(TemplateNames.SCHEMA, context);
  }

  async renderFromCustomSections(
    context: TemplateContext,
    sections: ArticleSectionConfig[]
  ): Promise<string> {
    const templateLoader = this.templateLoader as AssetTemplateLoader;
    const baseTemplate = await templateLoader.loadTemplate("article-template");

    // Build custom section content
    let sectionsContent = "";
    for (const section of sections) {
      sectionsContent += `\n## ${section.name}\n{${section.name.toLowerCase().replace(/ /g, "_")}_content}\n`;
    }

    return sectionsContent;
  }
}

export function createArticleRenderer(loader?: TemplateLoader): ArticleRenderer {
  return new ArticleRenderer(loader || createTemplateLoader());
}
