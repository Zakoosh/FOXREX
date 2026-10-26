# FOXREX search quality and publishing requirements

Every EN/AR/TR public article must have original useful content, one descriptive H1,
unique localized title and description, a self canonical, correct reciprocal language
alternates, publication/update timestamps, descriptive chart/image alt text, visible
truthful authorship, Article/NewsArticle and BreadcrumbList structured data, crawlable
navigation, related articles and working local links. Keep source disclosure at the end.
Preserve permanent URLs and first publication; update only substantive content updates.
Do not add repeated forex keywords, fabricated FAQs, ratings, credentials, trading wins,
or near-identical hourly articles to manipulate rankings. AI analysis uses stable URLs.

Required publishing checks after `node tools/site/build.mjs`:

- `node tools/site/check-feed.mjs`
- `python tools/site/audit-seo.py`
- `node tools/site/build.mjs --check`
- Relevant regression tests.

A technical audit pass does not establish Google indexing, rich-result eligibility or
first-page ranking. Search Console access is not configured in this repository. Do not
claim sitemap submission, indexing or search traffic without verified account evidence.
Follow Google Search Central's SEO Starter Guide, localized versions, Article structured
data and AI content guidance. Monitor actual impressions/queries/CTR when authorized
Search Console access becomes available; do not promise a rank or a timeline.
