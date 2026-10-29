"""Exercise the uploaded standalone APK via Android UIAutomator, without Metro/backend."""
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

OUT = Path('artifacts/emulator')
OUT.mkdir(parents=True, exist_ok=True)
PACKAGE = 'com.helperday.app'
checks = []


def adb(*args):
    return subprocess.check_output(['adb', *args], timeout=40)


def screenshot(name):
    (OUT / f'{name}.png').write_bytes(adb('exec-out', 'screencap', '-p'))


def dump():
    adb('shell', 'uiautomator', 'dump', '/sdcard/helperday-ui.xml')
    xml = adb('shell', 'cat', '/sdcard/helperday-ui.xml')
    (OUT / 'last-ui.xml').write_bytes(xml)
    return ET.fromstring(xml)


def find(label, *, timeout=30, scroll=False):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        root = dump()
        for node in root.iter('node'):
            if label in (node.get('text'), node.get('content-desc'), node.get('resource-id')):
                bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
                if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                    return bounds
        if scroll:
            # Keep swipes above the fixed bottom navigation.
            adb('shell', 'input', 'swipe', '500', '1600', '500', '650', '350')
        time.sleep(0.5)
    raise AssertionError(f'Android UI did not show {label!r}')


def tap(label, **kwargs):
    x1, y1, x2, y2 = find(label, **kwargs)
    adb('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))


def launch():
    adb('shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')


try:
    adb('logcat', '-c')
    adb('install', '-r', 'artifacts/helperday-demo.apk')
    # Keep radio/network unavailable for the entire test, including cold restarts.
    adb('shell', 'svc', 'wifi', 'disable')
    adb('shell', 'svc', 'data', 'disable')
    launch()
    tap('start-demo')
    find('A good day starts together.')
    checks.append('APK installs and Demo launches offline with embedded JS; no Metro')
    screenshot('01-demo-today')
    tap('Settings')
    find('Make it feel like home.')
    tap('Choose Minimal', scroll=True)
    # A selected Minimal style offers the other choice. This is also checked after restart.
    find('Choose Peranakan', scroll=True)
    screenshot('02-minimal-settings')
    checks.append('Native navigation and changing appearance work')
    adb('shell', 'am', 'force-stop', PACKAGE)
    launch()
    tap('start-demo')
    tap('Settings')
    find('Choose Peranakan', scroll=True)
    screenshot('03-restarted-settings')
    checks.append('Appearance saved in native AsyncStorage survives process restart')
    # Persist a role change in the Demo household snapshot, separately from preferences.
    tap('Switch to helper view', scroll=True)
    find('Switch to employer view', scroll=True)
    adb('shell', 'am', 'force-stop', PACKAGE)
    launch()
    tap('start-demo')
    tap('Settings')
    find('Switch to employer view', scroll=True)
    screenshot('04-restarted-helper')
    checks.append('Demo household snapshot/role survives a second process restart')
    result = {'status': 'passed', 'checks': checks, 'device': 'Android API 35 x86_64 emulator',
              'physicalDevice': 'UNVERIFIED', 'realSupabase': 'not connected'}
except Exception as error:
    result = {'status': 'failed', 'checks': checks, 'error': str(error), 'physicalDevice': 'UNVERIFIED'}
    try:
        screenshot('failure')
    except Exception:
        pass
    raise
finally:
    (OUT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    (OUT / 'logcat.txt').write_bytes(adb('logcat', '-d'))
