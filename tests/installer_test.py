"""Exercise real installer file writes in temporary profiles; no live profile access."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).resolve().parents[1] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallerTests(unittest.TestCase):
    def test_round_trip_with_existing_customization(self):
        with tempfile.TemporaryDirectory() as folder:
            profile = Path(folder)
            (profile / 'chrome').mkdir()
            (profile / 'prefs.js').write_text('user_pref("' + installer.PREF + '", false);\nuser_pref("other", 7);\n')
            (profile / 'user.js').write_text('user_pref("existing", true);\n')
            (profile / 'chrome/userChrome.css').write_text('@charset "UTF-8";\n/* custom */\n')
            originals={name:(profile/name).read_bytes() if (profile/name).exists() else None for name in installer.FILES}
            installer.install(profile)
            self.assertTrue((profile/installer.ADDON).exists())
            loader=(profile/'chrome/userChrome.css').read_text()
            self.assertTrue(loader.startswith('@charset "UTF-8";'))
            self.assertLess(loader.index('@import'),loader.index('/* custom */'))
            with self.assertRaises(RuntimeError): installer.install(profile)
            # Simulate Thunderbird persisting the installed setting and other changes.
            (profile/'prefs.js').write_text('user_pref("' + installer.PREF + '", true);\nuser_pref("other", 8);\n')
            installer.uninstall(profile)
            for name, data in originals.items():
                self.assertEqual((profile/name).read_bytes() if (profile/name).exists() else None,data)
            self.assertIn('false', (profile/'prefs.js').read_text())
            self.assertIn('"other", 8', (profile/'prefs.js').read_text())

    def test_new_profile_and_conflict_protection(self):
        with tempfile.TemporaryDirectory() as folder:
            profile=Path(folder); (profile/'prefs.js').write_text('')
            installer.install(profile)
            loader=profile/'chrome/userChrome.css'; installed=loader.read_text()
            loader.write_text(installed+'/* later edit */')
            with self.assertRaises(RuntimeError): installer.uninstall(profile)
            self.assertIn('later edit',loader.read_text())
            loader.write_text(installed)
            installer.uninstall(profile)
            self.assertFalse((profile/installer.ADDON).exists())
            self.assertNotIn(installer.PREF,(profile/'prefs.js').read_text())

    def test_updated_addon_is_backed_up_before_explicit_uninstall(self):
        with tempfile.TemporaryDirectory() as folder:
            profile=Path(folder); (profile/'prefs.js').write_text('')
            installer.install(profile)
            (profile/installer.ADDON).write_bytes(b'updated companion')
            with self.assertRaises(RuntimeError): installer.uninstall(profile)
            loader=profile/'chrome/userChrome.css'
            original=loader.read_text(); loader.write_text(original+'/* user edit */')
            with self.assertRaises(RuntimeError): installer.uninstall(profile, allow_addon_change=True)
            loader.write_text(original)
            installer.uninstall(profile, allow_addon_change=True)
            self.assertFalse((profile/installer.ADDON).exists())
            backups=list(profile.glob(installer.STATE+'-restored-*/before-uninstall/'+installer.ADDON))
            self.assertEqual(len(backups),1)
            self.assertEqual(backups[0].read_bytes(),b'updated companion')

    def test_repeated_uninstall_and_missing_state_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            profile=Path(folder); (profile/'prefs.js').write_text('user_pref("other", 7);')
            installer.uninstall(profile)
            self.assertFalse((profile/installer.STATE).exists())
            (profile/'chrome').mkdir()
            loader=profile/'chrome/userChrome.css'
            loader.write_text('@import url("gmail-header-polish.css");\n/* personal */\n')
            addon=profile/installer.ADDON; addon.parent.mkdir(); addon.write_bytes(b'updated')
            installer.uninstall(profile, allow_addon_change=True)
            self.assertEqual(loader.read_text(),'/* personal */\n')
            self.assertFalse(addon.exists())
            self.assertEqual((profile/'prefs.js').read_text(),'user_pref("other", 7);')
            backup=list(profile.glob(installer.STATE+'-cleanup-*/'+installer.ADDON))
            self.assertEqual(backup[0].read_bytes(),b'updated')
            installer.uninstall(profile)

if __name__ == '__main__': unittest.main()
