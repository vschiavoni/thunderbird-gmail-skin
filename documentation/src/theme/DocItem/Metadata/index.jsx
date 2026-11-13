import React from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import OriginalMetadata from '@theme-original/DocItem/Metadata';
import {websiteData, softwareData, serializeStructuredData} from '../../../utils/structuredData';

export default function DocMetadata(props) {
  const {metadata} = useDoc();
  const {siteConfig} = useDocusaurusContext();
  const data = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${new URL(metadata.permalink, siteConfig.url).href}#article`,
    url: new URL(metadata.permalink, siteConfig.url).href,
    headline: metadata.title,
    description: metadata.description,
    inLanguage: 'en',
    version: siteConfig.customFields.extensionVersion,
    isPartOf: websiteData(siteConfig),
    about: softwareData(siteConfig),
  };
  return <><OriginalMetadata {...props}/><Head><meta property="og:type" content="article"/><meta name="twitter:title" content={metadata.title === siteConfig.title ? metadata.title : `${metadata.title} | ${siteConfig.title}`}/><meta name="twitter:description" content={metadata.description}/><script type="application/ld+json">{serializeStructuredData(data)}</script></Head></>;
}
