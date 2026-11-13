"""Run Docusaurus with live repository imports and manifest-aware restarts."""
import hashlib
import os
import signal
import subprocess
import sys
import time

from generate_pages import generate, repo, site

sources = [repo / 'README.md', repo / 'CHANGELOG.md', repo / 'thunder-g/manifest.json']
child = None


def snapshot():
    return tuple(hashlib.sha256(path.read_bytes()).digest() for path in sources)


def stop():
    if child is not None and child.poll() is None:
        try:
            if os.name == 'nt':
                child.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            if os.name == 'nt':
                child.kill()
            else:
                os.killpg(child.pid, signal.SIGKILL)
            child.wait()


def interrupted(signum, frame):
    raise KeyboardInterrupt


def start():
    return subprocess.Popen(
        ['bun', '--bun', 'node_modules/@docusaurus/core/bin/docusaurus.mjs', 'start', *sys.argv[1:]],
        cwd=site, start_new_session=os.name != 'nt',
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0,
    )


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        previous = snapshot()
        generate()
        child = start()
        while child.poll() is None:
            time.sleep(0.5)
            try:
                current = snapshot()
                if current == previous:
                    continue
                generate()
                if current[2] != previous[2]:
                    print('Manifest changed; restarting Docusaurus to reload version metadata.', flush=True)
                    stop()
                    child = start()
                previous = current
            except (OSError, ValueError) as error:
                # Editors may briefly leave an absent file or incomplete JSON.
                print(f'Waiting for valid repository sources: {error}', file=sys.stderr, flush=True)
        sys.exit(child.returncode)
    except KeyboardInterrupt:
        pass
    finally:
        stop()
