export function websiteData(siteConfig) {
  const url = new URL(siteConfig.baseUrl, siteConfig.url).href;
  return {
    '@type': 'WebSite',
    '@id': `${url}#website`,
    url,
    name: 'Thunder-G',
    description: siteConfig.tagline,
    inLanguage: 'en',
  };
}

export function softwareData(siteConfig) {
  const url = new URL(siteConfig.baseUrl, siteConfig.url).href;
  return {
    '@type': 'SoftwareApplication',
    '@id': `${url}#software`,
    name: 'Thunder-G',
    url,
    description: 'A Gmail-inspired interface for Thunderbird and Betterbird, using existing mail accounts with native labels and optional conversation reading and in-window writing.',
    applicationCategory: 'CommunicationApplication',
    softwareVersion: siteConfig.customFields.extensionVersion,
    downloadUrl: 'https://github.com/vschiavoni/thunderbird-gmail-skin/releases/latest',
    license: 'https://github.com/vschiavoni/thunderbird-gmail-skin/blob/main/LICENSE',
    sameAs: ['https://github.com/vschiavoni/thunderbird-gmail-skin'],
  };
}

export function serializeStructuredData(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
