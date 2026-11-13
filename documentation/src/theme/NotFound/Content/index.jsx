import React from 'react';
import Head from '@docusaurus/Head';
import OriginalNotFoundContent from '@theme-original/NotFound/Content';

// Also covers missing routes handled by the docs root at routeBasePath '/'.
export default function NotFoundContent(props) {
  return <><OriginalNotFoundContent {...props}/><Head><meta name="robots" content="noindex,follow"/></Head></>;
}
