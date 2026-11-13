import React from 'react';

const iconPaths = {
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z',
  sun: 'M12 3V1m0 22v-2M3 12H1m22 0h-2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  minimize: 'M5 18h14',
  expand: 'M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5',
  detach: 'M3 5h18v14H3ZM3 9h18M13 12h6v5h-6Z',
  close: 'm6 6 12 12M18 6 6 18',
  save: 'M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8',
  move: 'M3 6h7l2 2h9v12H3ZM12 10v7m-3-3 3 3 3-3',
  Spam: 'M8 3h8l5 5v8l-5 5H8l-5-5V8ZM12 7v7m0 3v1',
  chevron: 'm8 10 4 4 4-4',
  more: 'M12 5v.01M12 12v.01M12 19v.01',
  forward: 'm15 5 7 7-7 7M22 12H11c-6 0-9 3-9 8',
  menu: 'M3 6h18M3 12h18M3 18h18',
  compose: 'm4 16-1 5 5-1L21 7l-4-4Z M14 6l4 4',
  Inbox: 'M4 4h16l2 12v4H2v-4ZM2 15h6l2 3h4l2-3h6',
  Starred: 'm12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z',
  Snoozed: 'M12 7v5l4 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  Sent: 'm3 3 19 9-19 9 4-9Zm4 9h15',
  Archive: 'M3 3h18v5H3Z M5 8v13h14V8 M9 12h6m-3 0v5m-3-3 3 3 3-3',
  Trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  Drafts: 'M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8m-8 4h6',
  label: 'M3 4h9l9 8-9 8H3ZM7 9h.01',
  back: 'm12 4-8 8 8 8M4 12h17',
  unread: 'M3 5h18v15H3ZM3 6l9 7 9-7',
  refresh: 'M20 8a9 9 0 1 0 1 7M20 3v6h-6',
  reply: 'm9 5-7 7 7 7M2 12h11c6 0 9 3 9 8',
  attachment: 'm21 11-9 9a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 0 1-2.8-2.8l9-9',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',
};
export default function DemoIcon({name}) {
  if (name === 'label') return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 5h11l7 7-7 7H3Z"/></svg>;
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name] || iconPaths.label}/></svg>; }
