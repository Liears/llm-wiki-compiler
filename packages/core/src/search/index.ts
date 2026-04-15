import type {
  SearchInput,
  SearchResult,
  SearchSection,
  SourceFile,
} from "@llm-wiki-compiler/types";
import { createLogger } from "@llm-wiki-compiler/shared";

// ============================================================================
// Search Service
// ============================================================================

export interface SearchService {
  search(input: SearchInput): Promise<SearchResult[]>;
  searchInFiles(query: string, files: SourceFile[]): Promise<SearchResult[]>;
}

export class SearchService {
  private logger = createLogger("SearchService");

  async search(input: SearchInput): Promise<SearchResult[]> {
    const { query, limit = 10, types = ["topic", "concept"] } = input;

    this.logger.info(`Searching for: ${query}`);

    // Implementation would load INDEX.md and topic files
    // For now, return empty results
    return [];
  }

  async searchInFiles(query: string, files: SourceFile[]): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const file of files) {
      const content = file.content.toLowerCase();
      const title = file.title?.toLowerCase() || path.basename(file.path).toLowerCase();

      // Check if query matches title or content
      if (title.includes(queryLower) || content.includes(queryLower)) {
        const sections = this.findMatchingSections(file.content, queryLower);

        results.push({
          type: "topic", // Default to topic for file searches
          slug: file.path,
          title: file.title || path.basename(file.path),
          summary: this.createSummary(file.content, query),
          relevance: this.calculateRelevance(title, content, queryLower),
          sections,
        });
      }
    }

    // Sort by relevance and limit results
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, 10);
  }

  private findMatchingSections(content: string, query: string): SearchSection[] {
    const sections: SearchSection[] = [];
    const lines = content.split("\n");
    let currentSection = "";
    let sectionHeading = "";
    let sectionMatches = 0;

    for (const line of lines) {
      // Check if this is a heading
      if (line.startsWith("#")) {
        // Save previous section if it had matches
        if (sectionMatches > 0) {
          sections.push({
            heading: sectionHeading,
            snippet: this.createSnippet(currentSection),
            coverage: this.determineCoverage(sectionMatches, currentSection),
          });
        }

        // Start new section
        sectionHeading = line.replace(/^#+\s*/, "");
        currentSection = line + "\n";
        sectionMatches = 0;
      } else {
        currentSection += line + "\n";
        if (line.toLowerCase().includes(query)) {
          sectionMatches++;
        }
      }
    }

    // Don't forget the last section
    if (sectionMatches > 0) {
      sections.push({
        heading: sectionHeading,
        snippet: this.createSnippet(currentSection),
        coverage: this.determineCoverage(sectionMatches, currentSection),
      });
    }

    return sections;
  }

  private createSummary(content: string, query: string): string {
    const queryLower = query.toLowerCase();
    const sentences = content
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && s.toLowerCase().includes(queryLower));

    if (sentences.length === 0) {
      return content.substring(0, 200) + "...";
    }

    return sentences.slice(0, 2).join(". ") + ".";
  }

  private createSnippet(content: string): string {
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return lines.slice(0, 3).join(" ");
  }

  private calculateRelevance(title: string, content: string, query: string): number {
    let score = 0;

    // Exact match in title is worth more
    if (title.includes(query)) {
      score += 10;
    }

    // Count occurrences in content
    const matches = content.split(query).length - 1;
    score += matches * 0.5;

    // Penalize very long content (likely less relevant)
    const lengthPenalty = Math.min(content.length / 1000, 5);
    score -= lengthPenalty;

    return Math.max(0, score);
  }

  private determineCoverage(matches: number, content: string): "high" | "medium" | "low" {
    const wordCount = content.split(/\s+/).length;

    if (matches >= 5 || matches / wordCount > 0.01) {
      return "high";
    } else if (matches >= 2 || matches / wordCount > 0.005) {
      return "medium";
    }
    return "low";
  }
}

export function createSearchService(): SearchService {
  return new SearchService();
}
