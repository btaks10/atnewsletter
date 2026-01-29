export interface FeedSource {
  name: string;
  url: string;
}

export const RSS_FEEDS: FeedSource[] = [
  { name: "Jewish Insider", url: "https://jewishinsider.com/feed/" },
  { name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml" },
  { name: "NY Post", url: "https://nypost.com/feed/" },
  { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/" },
  { name: "Forward", url: "https://forward.com/feed/" },
  { name: "JTA", url: "https://www.jta.org/feed" },
];

export const CATEGORY_ORDER = [
  "Hate Crimes & Violence",
  "Government & Policy",
  "Campus & Academia",
  "Legal & Civil Rights",
  "Media & Public Discourse",
  "Organizational Response",
  "International",
  "Other",
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];
