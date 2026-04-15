import type {
  TopicCandidate,
  TopicArticle,
  ConceptArticle,
} from "@llm-wiki-compiler/types";
import { createLogger } from "@llm-wiki-compiler/shared";

// ============================================================================
// Topic Compiler
// ============================================================================

export interface TopicCompiler {
  compile(topic: TopicCandidate): Promise<TopicArticle>;
}

export abstract class BaseTopicCompiler implements TopicCompiler {
  protected logger = createLogger("TopicCompiler");

  abstract compile(topic: TopicCandidate): Promise<TopicArticle>;

  protected validateArticle(article: TopicArticle): boolean {
    // Check frontmatter
    if (!article.frontmatter) {
      this.logger.warn(`Article ${article.slug} missing frontmatter`);
      return false;
    }

    // Check required fields
    if (!article.content || article.content.trim().length === 0) {
      this.logger.warn(`Article ${article.slug} has empty content`);
      return false;
    }

    return true;
  }
}

// ============================================================================
// Concept Compiler
// ============================================================================

export interface ConceptCompiler {
  compile(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>>;
}

export abstract class BaseConceptCompiler implements ConceptCompiler {
  protected logger = createLogger("ConceptCompiler");

  abstract compile(topicSlugs: string[]): Promise<Array<{ slug: string; isNew: boolean }>>;

  protected validateArticle(article: ConceptArticle): boolean {
    if (!article.frontmatter) {
      this.logger.warn(`Concept ${article.slug} missing frontmatter`);
      return false;
    }

    if (article.topicSlugs.length < 2) {
      this.logger.warn(`Concept ${article.slug} connects to fewer than 2 topics`);
      return false;
    }

    return true;
  }
}
