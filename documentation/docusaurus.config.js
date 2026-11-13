const manifest = require('../thunder-g/manifest.json');
const baseUrl = process.env.BASE_URL || '/';

// Set SITE_URL and BASE_URL to the final hosting destination before publishing.
module.exports = {
  title: 'Thunder-G',
  tagline: 'A Gmail-inspired interface for Thunderbird and Betterbird',
  url: process.env.SITE_URL || 'https://vschiavoni.github.io',
  baseUrl,
  favicon: 'img/logo.png',
  // Only fork deployments request a site-wide noindex policy.
  noIndex: process.env.DOCS_NOINDEX === 'true',
  customFields: {extensionVersion: manifest.version},
  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {format: 'detect', hooks: {onBrokenMarkdownLinks: 'throw'}},
  i18n: {defaultLocale: 'en', locales: ['en']},
  presets: [['classic', {
    docs: {path: 'content', routeBasePath: '/', sidebarPath: require.resolve('./sidebars.js')},
    blog: false,
    sitemap: {ignorePatterns: [`${baseUrl}search/**`, `${baseUrl}search`, `${baseUrl}404.html`], changefreq: null, priority: null},
    pages: {path: 'src/pages'},
    theme: {customCss: require.resolve('./src/css/custom.css')},
  }]],
  themes: [[require.resolve('@easyops-cn/docusaurus-search-local'), {
    hashed: true,
    language: 'en',
    docsRouteBasePath: '/',
    docsDir: 'content',
    indexDocs: true,
    indexBlog: false,
    indexPages: false,
    searchBarShortcut: true,
    searchBarShortcutKeymap: 'mod+k',
    highlightSearchTermsOnTargetPage: true,
  }]],
  themeConfig: {
    image: 'img/thunder-g-social.png',
    metadata: [
      {name: 'twitter:card', content: 'summary_large_image'},
      {property: 'og:site_name', content: 'Thunder-G'},
      {property: 'og:type', content: 'website'},
      {property: 'og:image:alt', content: 'Thunder-G inbox with colored labels and a floating reply composer'},
      {name: 'twitter:image:alt', content: 'Thunder-G inbox with colored labels and a floating reply composer'},
      {property: 'og:image:type', content: 'image/png'},
      {property: 'og:image:width', content: '1280'},
      {property: 'og:image:height', content: '640'},
    ],
    navbar: {title: 'Thunder-G', logo: {alt: 'Thunder-G', src: 'img/logo.png'}, items: [
      {type: 'docSidebar', sidebarId: 'documentation', label: 'Documentation', position: 'left'},
      {href: 'https://github.com/vschiavoni/thunderbird-gmail-skin', label: 'GitHub', position: 'right'},
    ]},
    footer: {style: 'dark', copyright: 'Thunder-G · Independent project, unaffiliated with Google.'},
    colorMode: {respectPrefersColorScheme: true},
  },
};
