from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent
source = root / 'inline-labels'
version = json.loads((source / 'manifest.json').read_text())['version']
output = root / f'thunder-g-{version}.xpi'
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if not path.is_file():
            continue
        relative = path.relative_to(source).as_posix()
        data = path.read_bytes()
        if relative == 'experiments/api.js':
            # Package renderer into the experiment script. loadSubScript rejects
            # unsigned extension jar URIs as untrusted in Thunderbird 153.
            skin = '\n'.join((root / 'chrome' / name).read_text() for name in
                             ['gmail-inspired.css', 'gmail-columns.css'])
            data += ('\nvar GMAIL_SKIN_CSS = ' + json.dumps(skin) + ';\n').encode()
            data += ('\nvar GMAIL_CONVERSATIONS_CSS = ' + json.dumps((root / 'chrome/gmail-conversations.css').read_text()) + ';\n').encode()
            data += b'\n' + (source / 'gmail-import.js').read_bytes()
            data += b'\n' + (source / 'label-navigation.js').read_bytes()
            data += b'\n' + (source / 'labels.js').read_bytes()
            data += b'\n' + (source / 'label-menu.js').read_bytes()
            data += b'\n' + (source / 'nested-labels.js').read_bytes()
            data += b'\n' + (source / 'reading.js').read_bytes()
            data += b'\n' + (source / 'dates.js').read_bytes()
            data += b'\n' + (source / 'inbox.js').read_bytes()
            data += b'\n' + (source / 'conversation.js').read_bytes()
            data += b'\n' + (source / 'compose.js').read_bytes()
            data += b'\n' + (source / 'pagination.js').read_bytes()
            data += b'\n' + (source / 'independent-reader.js').read_bytes()
        info = ZipInfo(relative, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, data)
print(output)
