import React from 'react';
import Head from '@docusaurus/Head';
import OriginalSearchPage from '@theme-original/SearchPage';

export default function SearchPage(props) {
  return <><OriginalSearchPage {...props}/><Head><meta name="robots" content="noindex,follow"/></Head></>;
}
