export interface FeedSource {
  name: string;
  url: string;
  type: "jewish_media" | "mainstream" | "analysis";
}

export const RSS_FEEDS: FeedSource[] = [
  // Jewish and Israel media
  { name: "Jewish Insider", url: "https://jewishinsider.com/feed/", type: "jewish_media" },
  { name: "JTA", url: "https://www.jta.org/feed", type: "jewish_media" },
  { name: "Forward", url: "https://forward.com/feed/", type: "jewish_media" },
  // { name: "Times of Israel", url: "https://www.timesofisrael.com/feed/", type: "jewish_media" }, // Feed returns 403
  { name: "Jerusalem Post", url: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx", type: "jewish_media" },
  // { name: "Haaretz", url: "https://www.haaretz.com/cmlink/1.628752", type: "jewish_media" }, // Feed returns 405

  { name: "Algemeiner", url: "https://www.algemeiner.com/feed/", type: "jewish_media" },
  // { name: "Tablet Magazine", url: "https://www.tabletmag.com/feed", type: "jewish_media" }, // Feed returns 403


  // Mainstream US
  { name: "New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", type: "mainstream" },
  { name: "NY Post", url: "https://nypost.com/feed/", type: "mainstream" },
  { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/", type: "mainstream" },
  { name: "Washington Post", url: "https://feeds.washingtonpost.com/rss/national", type: "mainstream" },
  { name: "CNN", url: "http://rss.cnn.com/rss/cnn_us.rss", type: "mainstream" },
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/rss.xml", type: "mainstream" },
  // { name: "Reuters", url: "https://www.reutersagency.com/feed/", type: "mainstream" }, // Feed returns 404
  // { name: "AP News", url: "https://rsshub.app/apnews/topics/apf-topnews", type: "mainstream" }, // Feed returns 403


  // Opinion / Analysis
  { name: "The Intercept", url: "https://theintercept.com/feed/?rss", type: "analysis" },
  { name: "Vox", url: "https://www.vox.com/rss/index.xml", type: "analysis" },
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

export function getArticleAgeCutoff(): string {
  const hours = parseInt(process.env.MAX_ARTICLE_AGE_HOURS || "24", 10);
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
