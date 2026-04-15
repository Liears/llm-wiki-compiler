import type {
  TopicCandidate,
  ConceptCandidate,
  ScanResult,
  ProjectConfig,
  CompileState,
  TopicState,
  ConceptState,
  ArticleKind,
} from "@llm-wiki-compiler/types";
import { slugify, createLogger } from "@llm-wiki-compiler/shared";

// ============================================================================
// Topic Discovery
// ============================================================================

export interface TopicDiscoveryInput {
  scanResult: ScanResult;
  config: ProjectConfig;
  existingState?: CompileState;
}

export interface TopicDiscoveryService {
  discover(input: TopicDiscoveryInput): Promise<TopicCandidate[]>;
}

export class TopicDiscovery implements TopicDiscoveryService {
  private logger = createLogger("TopicDiscovery");

  async discover(input: TopicDiscoveryInput): Promise<TopicCandidate[]> {
    const { scanResult, config, existingState } = input;
    const { files } = scanResult;

    if (config.mode === "knowledge") {
      return this.discoverKnowledgeTopics(files, config, existingState);
    } else {
      return this.discoverCodebaseTopics(files, scanResult, config, existingState);
    }
  }

  private async discoverKnowledgeTopics(
    files: any[],
    config: ProjectConfig,
    existingState?: CompileState
  ): Promise<TopicCandidate[]> {
    const topicMap = new Map<string, TopicCandidate>();

    // Get existing topic slugs from state
    const existingTopicSlugs = new Set(existingState?.topics.map((t) => t.slug) || []);

    for (const file of files) {
      const topics = this.classifyFile(file, config, existingTopicSlugs);

      for (const topic of topics) {
        const existing = topicMap.get(topic.slug);

        if (existing) {
          existing.sourceFiles.push(file.path);
        } else {
          topicMap.set(topic.slug, topic);
        }
      }
    }

    // Check for unclassified files that could form new topics
    const unclassifiedFiles = files.filter((file) => {
      return !Array.from(topicMap.values()).some((topic) =>
        topic.sourceFiles.includes(file.path)
      );
    });

    const groupedUnclassified = this.groupUnclassifiedFiles(unclassifiedFiles);
    for (const group of groupedUnclassified) {
      if (group.files.length >= 3) {
        const slug = slugify(group.theme);
        topicMap.set(slug, {
          slug,
          title: this.toTitleCase(group.theme),
          sourceFiles: group.files.map((f) => f.path),
          kind: "knowledge-topic",
        });
      }
    }

    this.logger.info(`Discovered ${topicMap.size} topics from ${files.length} files`);
    return Array.from(topicMap.values());
  }

  private async discoverCodebaseTopics(
    files: any[],
    scanResult: any,
    config: ProjectConfig,
    existingState?: CompileState
  ): Promise<TopicCandidate[]> {
    const topicMap = new Map<string, TopicCandidate>();
    const projectRoot = scanResult.projectRoot;

    // Use service discovery
    if (config.service_discovery === "auto" || !config.service_discovery) {
      const serviceTopics = this.discoverServices(files, projectRoot, config);
      for (const topic of serviceTopics) {
        topicMap.set(topic.slug, topic);
      }

      // Add cross-cutting topics for common infrastructure
      const crossCuttingTopics = this.discoverCrossCuttingTopics(files, projectRoot);
      for (const topic of crossCuttingTopics) {
        const existing = topicMap.get(topic.slug);
        if (existing) {
          existing.sourceFiles.push(...topic.sourceFiles);
        } else {
          topicMap.set(topic.slug, topic);
        }
      }
    }

    this.logger.info(`Discovered ${topicMap.size} codebase topics`);
    return Array.from(topicMap.values());
  }

  private classifyFile(
    file: any,
    config: ProjectConfig,
    existingTopicSlugs: Set<string>
  ): TopicCandidate[] {
    const topics: TopicCandidate[] = [];

    // Check topic hints first
    for (const hint of config.topic_hints || []) {
      if (this.matchesHint(file, hint)) {
        const slug = slugify(hint);
        if (existingTopicSlugs.has(slug)) {
          topics.push({
            slug,
            title: this.toTitleCase(hint),
            sourceFiles: [file.path],
            kind: "knowledge-topic",
          });
        }
      }
    }

    // Use directory structure as hint
    const dirParts = file.path.split("/");
    for (let i = 0; i < dirParts.length - 1; i++) {
      const dirName = dirParts[i];
      const slug = slugify(dirName);

      if (existingTopicSlugs.has(slug) || i === dirParts.length - 2) {
        // Check if not already added
        if (!topics.find((t) => t.slug === slug)) {
          topics.push({
            slug,
            title: this.toTitleCase(dirName),
            sourceFiles: [file.path],
            kind: "knowledge-topic",
          });
        }
      }
    }

    // If no topics found yet, use hints as fallback
    if (topics.length === 0 && config.topic_hints && config.topic_hints.length > 0) {
      const slug = slugify(config.topic_hints[0]);
      topics.push({
        slug,
        title: this.toTitleCase(config.topic_hints[0]),
        sourceFiles: [file.path],
        kind: "knowledge-topic",
      });
    }

    return topics;
  }

  private discoverServices(files: any[], projectRoot: string, config: ProjectConfig): TopicCandidate[] {
    const topicMap = new Map<string, TopicCandidate>();

    // Group files by service directory
    for (const file of files) {
      const relativePath = file.path;
      const parts = relativePath.split("/");

      // Try to identify service boundary
      let serviceDir: string | null = null;
      for (let i = 0; i < parts.length - 1; i++) {
        const potentialDir = parts.slice(0, i + 1).join("/");
        if (this.isServiceDirectory(potentialDir, files)) {
          serviceDir = potentialDir;
          break;
        }
      }

      if (serviceDir) {
        const slug = slugify(serviceDir.replace(/\//g, "-"));
        const existing = topicMap.get(slug);

        if (existing) {
          existing.sourceFiles.push(file.path);
        } else {
          topicMap.set(slug, {
            slug,
            title: this.toTitleCase(serviceDir.replace(/\//g, " ")),
            sourceFiles: [file.path],
            kind: "service",
          });
        }
      }
    }

    return Array.from(topicMap.values());
  }

  private isServiceDirectory(dirPath: string, files: any[]): boolean {
    const dirFiles = files.filter((f) => f.path.startsWith(dirPath + "/"));

    // Look for service indicators (package.json, go.mod, etc.)
    const hasManifest = dirFiles.some((f) => {
      const baseName = f.path.split("/").pop();
      return (
        baseName === "package.json" ||
        baseName === "go.mod" ||
        baseName === "Cargo.toml" ||
        baseName === "pyproject.toml"
      );
    });

    return hasManifest && dirFiles.length >= 3;
  }

  private discoverCrossCuttingTopics(files: any[], projectRoot: string): TopicCandidate[] {
    const topics: TopicCandidate[] = [];

    // Look for infrastructure files
    const infraFiles = files.filter((f) =>
      f.path.includes("docker-compose") ||
      f.path.includes("Dockerfile") ||
      f.path.includes("k8s/") ||
      f.path.includes(".github/workflows")
    );

    if (infraFiles.length > 0) {
      topics.push({
        slug: "infrastructure",
        title: "Infrastructure",
        sourceFiles: infraFiles.map((f) => f.path),
        kind: "cross-cutting",
      });
    }

    // Look for test files
    const testFiles = files.filter((f) =>
      f.path.includes("test/") ||
      f.path.includes("tests/") ||
      f.path.includes("__tests__/") ||
      f.path.includes("spec/")
    );

    if (testFiles.length > 0) {
      topics.push({
        slug: "testing",
        title: "Testing",
        sourceFiles: testFiles.map((f) => f.path),
        kind: "cross-cutting",
      });
    }

    return topics;
  }

  private matchesHint(file: any, hint: string): boolean {
    const lowerHint = hint.toLowerCase();
    return (
      file.path.toLowerCase().includes(lowerHint) ||
      (file.title && file.title.toLowerCase().includes(lowerHint)) ||
      (file.content && file.content.toLowerCase().includes(lowerHint))
    );
  }

  private groupUnclassifiedFiles(files: any[]): Array<{ theme: string; files: any[] }> {
    const groups = new Map<string, any[]>();

    for (const file of files) {
      const keywords = this.extractKeywords(file);
      let bestGroup = null;
      let bestScore = 0;

      for (const [keyword, keywordFiles] of groups.entries()) {
        const score = this.computeSimilarity(keywords, keyword);
        if (score > bestScore && score > 0.3) {
          bestScore = score;
          bestGroup = keyword;
        }
      }

      if (bestGroup) {
        groups.get(bestGroup)!.push(file);
      } else if (keywords.length > 0) {
        groups.set(keywords[0], [file]);
      }
    }

    return Array.from(groups.entries()).map(([theme, files]) => ({ theme, files }));
  }

  private extractKeywords(file: any): string[] {
    const keywords: string[] = [];

    // From filename
    const filename = file.path.split("/").pop() || "";
    keywords.push(...filename.split(/[\-_\.]/).filter(Boolean));

    // From title
    if (file.title) {
      keywords.push(...file.title.split(/\s+/).filter(Boolean));
    }

    return keywords.map((k) => k.toLowerCase()).slice(0, 3);
  }

  private computeSimilarity(keywords1: string[], keywords2: string[]): number {
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);

    let intersection = 0;
    for (const kw of set1) {
      if (set2.has(kw)) intersection++;
    }

    const union = new Set([...set1, ...set2]);
    return intersection / union.size;
  }

  private toTitleCase(str: string): string {
    return str
      .split(/[\s\-_]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}

// ============================================================================
// Concept Discovery
// ============================================================================

export interface ConceptDiscoveryInput {
  topicArticles: Array<{ slug: string; title: string; content: string }>;
  existingConcepts?: ConceptState[];
}

export interface ConceptDiscoveryService {
  discover(input: ConceptDiscoveryInput): Promise<ConceptCandidate[]>;
}

export class ConceptDiscovery implements ConceptDiscoveryService {
  private logger = createLogger("ConceptDiscovery");

  async discover(input: ConceptDiscoveryInput): Promise<ConceptCandidate[]> {
    const { topicArticles, existingConcepts } = input;

    if (topicArticles.length < 3) {
      this.logger.info("Not enough topics to discover concepts");
      return [];
    }

    const concepts: ConceptCandidate[] = [];

    // Look for patterns across multiple topics
    const patterns = this.identifyCrossCuttingPatterns(topicArticles);

    for (const pattern of patterns) {
      const slug = slugify(pattern.name);
      const existing = existingConcepts?.find((c) => c.slug === slug);

      if (existing) {
        concepts.push({
          slug: existing.slug,
          title: existing.title,
          topicSlugs: pattern.topicSlugs,
        });
      } else {
        concepts.push({
          slug,
          title: this.toTitleCase(pattern.name),
          topicSlugs: pattern.topicSlugs,
        });
      }
    }

    this.logger.info(`Discovered ${concepts.length} concepts from ${topicArticles.length} topics`);
    return concepts;
  }

  private identifyCrossCuttingPatterns(
    topicArticles: Array<{ slug: string; title: string; content: string }>
  ): Array<{ name: string; topicSlugs: string[] }> {
    const patterns: Map<string, Set<string>> = new Map();

    // Simple pattern detection using common terms
    const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to"]);

    for (const topic of topicArticles) {
      const words = this.extractWords(topic.content);

      for (const word of words) {
        if (stopWords.has(word) || word.length < 4) continue;

        let topicSet = patterns.get(word);
        if (!topicSet) {
          topicSet = new Set();
          patterns.set(word, topicSet);
        }
        topicSet.add(topic.slug);
      }
    }

    // Find patterns that appear in 3+ topics
    const result: Array<{ name: string; topicSlugs: string[] }> = [];

    for (const [word, topicSet] of patterns.entries()) {
      if (topicSet.size >= 3) {
        result.push({
          name: word,
          topicSlugs: Array.from(topicSet),
        });
      }
    }

    return result.sort((a, b) => b.topicSlugs.length - a.topicSlugs.length);
  }

  private extractWords(content: string): string[] {
    const text = content
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text.split(" ").filter((w) => w.length > 3);
  }

  private toTitleCase(str: string): string {
    return str
      .split(/[\s\-_]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}

// ============================================================================
// Factories
// ============================================================================

export function createTopicDiscovery(): TopicDiscoveryService {
  return new TopicDiscovery();
}

export function createConceptDiscovery(): ConceptDiscoveryService {
  return new ConceptDiscovery();
}
