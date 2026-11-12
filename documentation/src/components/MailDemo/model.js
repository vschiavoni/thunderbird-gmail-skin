// Same color mixing as thunder-g/labels.js chipColors; native color drives icons.
function palette(base) {
  const rgb = [1,3,5].map(start => parseInt(base.slice(start,start+2),16));
  const mix = (other, weight) => `rgb(${rgb.map((value,index) => Math.round(value*weight+other[index]*(1-weight))).join(', ')})`;
  return {base, color: mix([0,0,0],.4), background: mix([255,255,255],.2), darkColor: mix([255,255,255],.25), darkBackground: mix([32,33,36],.28)};
}
export const LABEL_COLORS = {
  Projects: palette('#4285f4'),
  'Projects/Release': palette('#4285f4'),
  Personal: palette('#a142f4'),
  Reading: palette('#fbbc04'),
};
export const LABELS = ['Projects', 'Projects/Release', 'Personal', 'Reading'];
export function initialMail() {
  return [{
    id: 'release',
    sender: 'Release Team',
    address: 'release@example.invalid',
    subject: 'Release notes for Friday',
    labels: ['Projects/Release'],
    starred: false,
    unread: true,
    folder: 'Inbox',
    attachments: ['release-notes.pdf'],
    date: '10:42',
    messages: [{
      sender: 'Release Team',
      date: 'Yesterday, 16:10',
      body: 'The release notes are attached. Can you check the installation section before Friday?'
    }, {
      sender: 'You',
      date: 'Yesterday, 17:05',
      body: 'I will check the steps in Thunderbird and Betterbird and send you the result tomorrow.'
    }, {
      sender: 'Release Team',
      date: 'Today, 10:42',
      body: 'Thanks. Please include the client version in the notes. The screenshots can wait until the text is ready.'
    }]
  }, {
    id: 'train',
    sender: 'Travel Service',
    address: 'travel@example.invalid',
    subject: 'Train tickets — Saturday',
    labels: ['Personal'],
    starred: true,
    unread: false,
    folder: 'Inbox',
    attachments: ['tickets.pdf'],
    date: '09:18',
    messages: [{
      sender: 'Travel Service',
      date: 'Today, 09:18',
      body: 'Your sample booking is confirmed. The tickets are attached. Departure is at 09:12 on Saturday.'
    }]
  }, {
    id: 'reading',
    sender: 'Open Source Weekly',
    address: 'weekly@example.invalid',
    subject: 'This week: mail clients and local-first tools',
    labels: ['Reading'],
    starred: false,
    unread: false,
    folder: 'Inbox',
    attachments: [],
    date: 'Yesterday',
    messages: [{
      sender: 'Open Source Weekly',
      date: 'Yesterday, 18:00',
      body: 'This week’s reading list covers desktop mail clients, offline search, and tools that keep their data on your computer. You can file this message under Reading and come back to it later.'
    }]
  }, {
    id: 'review',
    sender: 'Project Team',
    address: 'project@example.invalid',
    subject: 'Review of the label backup format',
    labels: ['Projects'],
    starred: false,
    unread: false,
    folder: 'Inbox',
    attachments: [],
    date: 'Yesterday',
    messages: [{
      sender: 'Project Team',
      date: 'Yesterday, 14:20',
      body: 'The format includes label definitions and message identifiers, without message bodies or credentials. Could you review the example before we add it to the guide?'
    }, {
      sender: 'You',
      date: 'Yesterday, 15:00',
      body: 'Yes. I will check how it handles missing messages and duplicate identifiers.'
    }]
  }, {
    id: 'sent',
    sender: 'You',
    address: 'you@example.invalid',
    subject: 'Notes from the documentation review',
    labels: ['Projects'],
    starred: false,
    unread: false,
    folder: 'Sent',
    attachments: [],
    date: 'Monday',
    messages: [{
      sender: 'You',
      date: 'Monday, 11:00',
      body: 'The installation instructions are ready. The remaining screenshots are listed in the documentation checklist.'
    }]
  }, ...[
    ['receipt', 'Stationery Shop', 'Your receipt — order 1042', 'Personal', 'The order is ready for collection. You will find the receipt attached.', 'Yesterday'],
    ['planning', 'Planning Team', 'Next week’s planning', 'Projects', 'Tuesday afternoon works for me. Let’s use the same agenda as last time.', 'Nov 8'],
    ['library', 'City Library', 'Your reserved book is available', 'Personal', 'You can collect your reservation at the front desk before Saturday.', 'Nov 8'],
    ['build', 'Release Team', 'Build ready for testing', 'Projects/Release', 'The new package is ready. Please check it in both mail clients.', 'Nov 7'],
    ['meetup', 'Open Source Meetup', 'Thursday’s programme', 'Reading', 'Doors open at 18:30. The first talk starts at 19:00.', 'Nov 7'],
    ['photos', 'Travel Service', 'Sample photo collection', 'Personal', 'The sample photo collection is ready for review.', 'Nov 6'],
    ['translation', 'Project Team', 'Menu text — review', 'Projects', 'I have checked the menu entries. Two strings still need a shorter version.', 'Nov 6'],
    ['digest', 'Desktop Notes', 'November reading list', 'Reading', 'This month: keyboard navigation, local search and backing up your mail.', 'Nov 5'],
  ].map(([id,sender,subject,label,body,date])=>({id,sender,address:`${id}@example.invalid`,subject,labels:[label],starred:false,unread:false,folder:'Inbox',attachments:id==='receipt'?['receipt.pdf']:[],date,messages:[{sender,date,body}]}))];
}
export function searchMail(items, folder, query) {
  const tokens = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  return items.filter(item => {
    if (folder === 'Starred' ? !item.starred || item.folder === 'Trash' : LABELS.includes(folder) ? !item.labels.includes(folder) || item.folder === 'Trash' : item.folder !== folder) return false;
    return tokens.every(raw => {
      const token = raw.toLowerCase().replaceAll('"', '');
      if (token.startsWith('label:')) return item.labels.some(label => label.toLowerCase().includes(token.slice(6)));
      if (token.startsWith('from:')) return `${item.sender} ${item.address}`.toLowerCase().includes(token.slice(5));
      if (token === 'is:starred') return item.starred;
      if (token === 'is:unread') return item.unread;
      if (token === 'is:read') return !item.unread;
      if (token === 'has:attachment') return item.attachments.length > 0;
      return `${item.subject} ${item.sender} ${item.messages.map(message => message.body).join(' ')}`.toLowerCase().includes(token);
    });
  });
}
