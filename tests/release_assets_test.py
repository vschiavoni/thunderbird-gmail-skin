import importlib.util
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec=importlib.util.spec_from_file_location('release_assets',Path(__file__).resolve().parents[1]/'release_assets.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

class ReleaseAssetsTests(unittest.TestCase):
    def fixture(self,root,maximum="158.*"):
        manifest={'version':'0.12.1','browser_specific_settings':{'gecko':{
            'id':release.ADDON_ID,'update_url':release.UPDATE_URL,'strict_min_version':'153.0','strict_max_version':maximum}}}
        (root/'thunder-g').mkdir();(root/'thunder-g/manifest.json').write_text(json.dumps(manifest))
        xpi=root/'thunder-g-0.12.1.xpi'
        with ZipFile(xpi,'w') as z:z.writestr('manifest.json',json.dumps(manifest))
        return manifest,xpi

    def test_feed_matches_the_actual_xpi_hash_identity_tag_and_compatibility(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);manifest,xpi=self.fixture(root)
            result=release.generate(root,'v0.12.1');entry=result['addons'][release.ADDON_ID]['updates'][0]
            self.assertEqual(entry['version'],'0.12.1')
            self.assertEqual(entry['update_link'],'https://github.com/'+release.REPOSITORY+'/releases/download/v0.12.1/'+xpi.name)
            self.assertEqual(entry['update_hash'],'sha256:'+hashlib.sha256(xpi.read_bytes()).hexdigest())
            self.assertEqual(entry['applications']['gecko'],{'strict_min_version':'153.0','strict_max_version':'158.*'})
            self.assertEqual(json.loads((root/'updates.json').read_text()),result)
            self.assertTrue(xpi.with_suffix('.xpi.sha256').exists())

    def test_supported_update_ranges_preserve_the_153_minimum(self):
        for maximum in ['158.*', '159.*', '160.*']:
            with self.subTest(maximum=maximum), tempfile.TemporaryDirectory() as folder:
                root=Path(folder)
                self.fixture(root,maximum=maximum)
                result=release.generate(root,'v0.12.1')
                limits=result['addons'][release.ADDON_ID]['updates'][0]['applications']['gecko']
                self.assertEqual(limits,{'strict_min_version':'153.0','strict_max_version':maximum})

    def test_wrong_tag_or_stale_build_cannot_publish_a_mislabelled_update(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);manifest,xpi=self.fixture(root)
            for tag in ['v0.12.0','0.12.1','v0.12.1-beta','../v0.12.1']:
                with self.assertRaises(ValueError):release.generate(root,tag)
            self.assertFalse((root/'updates.json').exists())
            with ZipFile(xpi,'w') as z:z.writestr('manifest.json',json.dumps({'version':'0.12.0'}))
            with self.assertRaisesRegex(ValueError,'Rebuild'):release.generate(root,'v0.12.1')
            self.assertFalse((root/'updates.json').exists())

    def test_wrong_update_channel_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);manifest,_=self.fixture(root)
            manifest['browser_specific_settings']['gecko']['update_url']='https://example.org/updates.json'
            (root/'thunder-g/manifest.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError,'identity or update URL'):release.generate(root,'v0.12.1')

if __name__=='__main__':unittest.main()
