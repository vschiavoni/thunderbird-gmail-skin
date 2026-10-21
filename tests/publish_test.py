"""Release-note migration tests; no live profile or release artifacts."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish', Path(__file__).resolve().parents[1] / 'publish.py')
publish = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publish)

class PublishTests(unittest.TestCase):
    def test_plan_preserves_previous_release_and_does_not_write(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); (root/'inline-labels').mkdir()
            (root/'inline-labels/manifest.json').write_text('{"version":"0.5.0"}')
            original='# Changelog\n\n## Unreleased\n\nNew chips.\n\n## 0.5.0\n\nOriginal dates.\n'
            (root/'CHANGELOG.md').write_text(original)
            (root/'README.md').write_text('Current version: **0.5.0** thunder-g-0.5.0.xpi `v0.5.0`')
            edits=publish.plan_release(root,'0.5.1')
            self.assertIn('## Unreleased\n\n## 0.5.1\n\nNew chips.',edits[root/'CHANGELOG.md'])
            self.assertTrue(edits[root/'CHANGELOG.md'].endswith('## 0.5.0\n\nOriginal dates.\n'))
            self.assertEqual((root/'CHANGELOG.md').read_text(),original)
            self.assertEqual(json.loads(edits[root/'inline-labels/manifest.json'])['version'],'0.5.1')
            with self.assertRaises(ValueError): publish.plan_release(root,'0.5.0')
            (root/'CHANGELOG.md').write_text('## Unreleased\n\n## 0.5.0\nOld')
            with self.assertRaises(ValueError): publish.plan_release(root,'0.5.1')

if __name__ == '__main__': unittest.main()
