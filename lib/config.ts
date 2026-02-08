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

  // New York Times (homepage + topic-specific)
  { name: "NYT - Home", url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", type: "mainstream" },
  { name: "NYT - Middle East", url: "https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml", type: "mainstream" },
  { name: "NYT - Politics", url: "https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml", type: "mainstream" },
  { name: "NYT - Education", url: "https://rss.nytimes.com/services/xml/rss/nyt/Education.xml", type: "mainstream" },
  { name: "NYT - Opinion", url: "https://rss.nytimes.com/services/xml/rss/nyt/Opinion.xml", type: "mainstream" },

  // Washington Post
  { name: "WaPo - National", url: "https://feeds.washingtonpost.com/rss/national", type: "mainstream" },
  { name: "WaPo - World", url: "https://feeds.washingtonpost.com/rss/world", type: "mainstream" },

  // CNN
  { name: "CNN - US", url: "http://rss.cnn.com/rss/cnn_us.rss", type: "mainstream" },
  { name: "CNN - World", url: "http://rss.cnn.com/rss/cnn_world.rss", type: "mainstream" },
  { name: "CNN - Politics", url: "http://rss.cnn.com/rss/cnn_allpolitics.rss", type: "mainstream" },

  // BBC News
  { name: "BBC - News", url: "https://feeds.bbci.co.uk/news/rss.xml", type: "mainstream" },
  { name: "BBC - Middle East", url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", type: "mainstream" },
  { name: "BBC - Education", url: "https://feeds.bbci.co.uk/news/education/rss.xml", type: "mainstream" },

  // NPR (new outlet)
  { name: "NPR - World", url: "https://feeds.npr.org/1004/rss.xml", type: "mainstream" },
  { name: "NPR - Politics", url: "https://feeds.npr.org/1014/rss.xml", type: "mainstream" },
  { name: "NPR - Middle East", url: "https://feeds.npr.org/1009/rss.xml", type: "mainstream" },
  { name: "NPR - Education", url: "https://feeds.npr.org/1013/rss.xml", type: "mainstream" },

  // The Guardian (new outlet)
  { name: "Guardian - US News", url: "https://www.theguardian.com/us-news/rss", type: "mainstream" },
  { name: "Guardian - Middle East", url: "https://www.theguardian.com/world/middleeast/rss", type: "mainstream" },
  { name: "Guardian - Education", url: "https://www.theguardian.com/education/rss", type: "mainstream" },

  // Wall Street Journal (new outlet)
  { name: "WSJ - World", url: "https://feeds.a.dj.com/rss/RSSWorldNews.xml", type: "mainstream" },
  { name: "WSJ - Opinion", url: "https://feeds.a.dj.com/rss/RSSOpinion.xml", type: "mainstream" },

  // Fox News (new outlet)
  { name: "Fox News - Politics", url: "https://moxie.foxnews.com/google-publisher/politics.xml", type: "mainstream" },
  { name: "Fox News - US", url: "https://moxie.foxnews.com/google-publisher/us.xml", type: "mainstream" },

  // NBC News (new outlet)
  { name: "NBC News - Top Stories", url: "https://feeds.nbcnews.com/feeds/topstories", type: "mainstream" },
  { name: "NBC News - World", url: "https://feeds.nbcnews.com/feeds/worldnews", type: "mainstream" },

  // ABC News (new outlet)
  { name: "ABC News - Top Stories", url: "https://feeds.abcnews.com/abcnews/topstories", type: "mainstream" },
  { name: "ABC News - Politics", url: "https://feeds.abcnews.com/abcnews/politicsheadlines", type: "mainstream" },

  // { name: "USA Today", url: "http://rssfeeds.usatoday.com/usatoday-NewsTopStories", type: "mainstream" }, // Malformed XML

  // Other mainstream
  { name: "NY Post", url: "https://nypost.com/feed/", type: "mainstream" },
  { name: "The Atlantic", url: "https://www.theatlantic.com/feed/all/", type: "mainstream" },

  // Opinion / Analysis
  { name: "Guardian - Opinion", url: "https://www.theguardian.com/commentisfree/rss", type: "analysis" },
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
