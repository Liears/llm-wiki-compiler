# Initialize Knowledge Base Wiki

Interactive setup for a new knowledge base wiki in this project.

## Instructions

### Step 1: Check for existing configuration

Look for `.wiki-compiler.json` in the current project root. If it exists, show the current config and ask: "Wiki already configured. Want to reconfigure, or abort?"

### Step 2: Auto-detect knowledge directories

Scan the project for markdown-heavy directories. Look for:
- Directories named `Knowledge/`, `docs/`, `notes/`, `content/`
- Any directory containing 10+ `.md` files
- Exclude: `node_modules/`, `.git/`, `wiki/`, `build/`, `dist/`

Present findings: "I found X markdown files across Y directories:"
- List each directory with file count
- Suggest which ones to include as sources

### Step 3: Ask user to confirm sources

Ask the user:
1. "What's the name for this knowledge base?" (e.g., "My Research", "Project Alpha", "Team Wiki")
2. "Which directories should I compile from?" (show auto-detected with checkmarks, let them add/remove)
3. "Where should the wiki output live?" (suggest `{first_source}/wiki/` as default)

### Step 4: Sample source files to understand the domain

From the confirmed source directories:
1. Pick 10-15 representative `.md` files — spread across different subdirectories for breadth
2. Read the first ~500 characters + the title (first `#` heading) of each
3. Note what kinds of content you're seeing: meeting notes? research papers? journal entries? code documentation? strategy docs? personal reflections? technical specs?

This sampling is what makes the article structure fit the actual content, rather than forcing a generic template.

### Step 5: Propose article structure

Based on the sampled files, generate a list of 5-8 article sections that fit the domain. Rules:

- **Always include `Summary` as the first section** — a standalone briefing is universal
- **Always include `Sources` as the last section** — backlinks to contributing files are always needed
- **Middle sections are domain-specific** — propose sections that match the content patterns you observed
- Each section needs a name and a one-line description

Present to the user:

```
Based on your files, I'd suggest this article structure:

1. Summary — standalone briefing of the topic
2. {section} — {description}
3. {section} — {description}
...
N. Sources — backlinks to all contributing files

Want to add, remove, or rename any sections?
```

Examples of domain-specific sections the LLM might propose:
- **Product/growth content:** Timeline, Current State, Key Decisions, Experiments & Results, Gotchas & Known Issues, Open Questions
- **Research notes:** Key Findings, Methodology, Evidence, Gaps & Contradictions, Open Questions
- **Personal journal:** Themes & Patterns, Progress, Reflections, Action Items
- **Book notes:** Characters, Themes, Plot Threads, Connections, Quotes
- **Technical docs:** Architecture, API Surface, Dependencies, Known Issues, Migration Notes
- **Business/team:** Stakeholders, Decisions, Action Items, Meeting History, Open Threads

These are guidance for the LLM, not rigid presets — the LLM should generate sections that fit the actual content it sampled.

If the user wants changes:
- They can add, remove, or rename sections
- They can say "regenerate" to get a fresh proposal
- `Summary` and `Sources` cannot be removed (they are marked `required`)

### Step 6: Create configuration

Write `.wiki-compiler.json` to the project root:

```json
{
  "version": 1,
  "name": "{user's name}",
  "sources": [
    { "path": "{path1}/", "exclude": ["wiki/"] },
    { "path": "{path2}/" }
  ],
  "output": "{output_path}/",
  "mode": "staging",
  "article_sections": [
    { "name": "Summary", "description": "{description}", "required": true },
    { "name": "{section2}", "description": "{description}" },
    { "name": "{section3}", "description": "{description}" },
    { "name": "{section4}", "description": "{description}" },
    { "name": "{section5}", "description": "{description}" },
    { "name": "Sources", "description": "backlinks to all contributing source files", "required": true }
  ],
  "topic_hints": [],
  "link_style": "obsidian"
}
```

The `article_sections` array captures the user-approved structure from Step 5. Each entry has:
- `name` — the section heading
- `description` — what content belongs in this section (guides the compiler)
- `required` (optional) — if true, cannot be removed by the user. Only Summary and Sources are required.

### Step 7: Create output directory

Create the output directory structure:
- `{output}/` directory
- `{output}/topics/` directory
- `{output}/.compile-state.json` with initial empty state
- `{output}/compile-log.md` with initial empty log

### Step 8: Summary

Print:
```
Wiki initialized for "{name}"
- Sources: {count} directories, ~{file_count} markdown files
- Output: {output_path}
- Article structure: {count} sections ({list section names})
- Mode: staging (wiki supplements existing context)

Next steps:
1. Run /wiki-compile to build your first compilation
2. Open {output_path}/INDEX.md in Obsidian to browse
3. Edit article_sections in .wiki-compiler.json anytime to adjust structure
4. Change mode in .wiki-compiler.json when ready:
   staging → recommended → primary
```
