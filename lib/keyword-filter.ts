// Keyword Pre-Filter for Article Analysis
// Eliminates obviously irrelevant articles before sending to Claude API

// --- Keyword Tiers ---

const PRIMARY_KEYWORDS = [
  "antisemitism",
  "antisemitic",
  "anti-semitism",
  "anti-semitic",
  "anti-jewish",
  "jew-hatred",
  "judeophobia",
];

const SECONDARY_KEYWORDS = [
  "jewish",
  "jews",
  "synagogue",
  "rabbi",
  "torah",
  "kosher",
  "yeshiva",
  "hebrew",
  "zionist",
  "zionism",
  "israel",
  "israeli",
  "palestinian",
  "holocaust",
  "shoah",
  "pogrom",
  "blood libel",
  "adl",
  "anti-defamation league",
  "ajc",
  "american jewish committee",
  "swastika",
  "neo-nazi",
  "white supremacist",
  "white nationalist",
  "bds",
  "boycott divestment",
];

const CONTEXT_KEYWORDS = [
  "hate crime",
  "hate incident",
  "vandalism",
  "attack",
  "threat",
  "discrimination",
  "campus",
  "university",
  "protest",
  "activism",
  "legislation",
  "bill",
  "executive order",
  "policy",
  "controversy",
  "backlash",
  "condemned",
  "denounced",
  "report",
  "study",
  "research",
  "survey",
  "data",
];

// --- Types ---

export interface FilterResult {
  passFilter: boolean;
  matchedKeywords: string[];
  confidence: "high" | "medium" | "skip";
  reason: string;
}

interface ArticleForFilter {
  title: string;
  raw_content: string | null;
}

// --- Matching Logic ---

function buildWordBoundaryPattern(keyword: string): RegExp {
  // Escape regex special characters in the keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Use word boundaries for whole-word matching
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function findMatchingKeywords(
  text: string,
  keywords: string[]
): string[] {
  const matches: string[] = [];
  for (const keyword of keywords) {
    const pattern = buildWordBoundaryPattern(keyword);
    if (pattern.test(text)) {
      matches.push(keyword);
    }
  }
  return matches;
}

// --- Main Filter Function ---

export function filterArticleByKeywords(
  article: ArticleForFilter
): FilterResult {
  // Combine title and content for searching
  const searchText = [
    article.title || "",
    article.raw_content || "",
  ].join(" ");

  // Check primary keywords first (any match = high confidence pass)
  const primaryMatches = findMatchingKeywords(searchText, PRIMARY_KEYWORDS);
  if (primaryMatches.length > 0) {
    return {
      passFilter: true,
      matchedKeywords: primaryMatches,
      confidence: "high",
      reason: `Primary keyword match: ${primaryMatches.join(", ")}`,
    };
  }

  // Check secondary and context keywords
  const secondaryMatches = findMatchingKeywords(searchText, SECONDARY_KEYWORDS);
  const contextMatches = findMatchingKeywords(searchText, CONTEXT_KEYWORDS);

  // Medium confidence: 2+ secondary matches, or 1 secondary + 1 context
  if (secondaryMatches.length >= 2) {
    return {
      passFilter: true,
      matchedKeywords: [...secondaryMatches, ...contextMatches],
      confidence: "medium",
      reason: `Multiple secondary keyword matches: ${secondaryMatches.join(", ")}`,
    };
  }

  if (secondaryMatches.length >= 1 && contextMatches.length >= 1) {
    return {
      passFilter: true,
      matchedKeywords: [...secondaryMatches, ...contextMatches],
      confidence: "medium",
      reason: `Secondary + context match: ${secondaryMatches.join(", ")} + ${contextMatches.join(", ")}`,
    };
  }

  // Skip: no meaningful matches
  const allMatches = [...secondaryMatches, ...contextMatches];
  return {
    passFilter: false,
    matchedKeywords: allMatches,
    confidence: "skip",
    reason:
      allMatches.length > 0
        ? `Insufficient matches (${secondaryMatches.length} secondary, ${contextMatches.length} context)`
        : "No keyword matches found",
  };
}
