"""Refuse to build updates with a different signing certificate."""
import argparse, hashlib, os, re, subprocess
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--apksigner',required=True)
p.add_argument('--previous')
p.add_argument('--apk')
p.add_argument('--keystore')
p.add_argument('--pin',default='ci/signing-cert.sha256')
a=p.parse_args()
def certs(apk):
    r=subprocess.run([a.apksigner,'verify','--print-certs',apk],check=True,capture_output=True,text=True)
    return set(re.findall(r'Signer #\d+ certificate SHA-256 digest: ([0-9a-fA-F]+)',r.stdout))
if Path(a.pin).exists():
    expected=Path(a.pin).read_text().strip().lower()
    if not re.fullmatch(r'[0-9a-f]{64}',expected):raise SystemExit('Invalid pinned certificate')
else:
    if not a.previous:raise SystemExit('No pinned certificate or previous APK; refusing to change signing identity')
    previous=certs(a.previous)
    if len(previous)!=1:raise SystemExit('Unexpected previous APK signing identity')
    expected=previous.pop().lower()
if a.keystore:
    r=subprocess.run(['keytool','-exportcert','-keystore',a.keystore,'-alias',os.environ['AEVUM_KEY_ALIAS'],'-storepass:env','AEVUM_STORE_PASSWORD'],check=True,capture_output=True)
    actual=hashlib.sha256(r.stdout).hexdigest()
    if actual!=expected:raise SystemExit('Signing key differs from the installed APK. Do not uninstall; restore the original key.')
if a.apk and {expected}!=certs(a.apk):raise SystemExit('Built APK signature differs from the original application')
Path('/tmp/aevum-signing-cert.sha256').write_text(expected+'\n')
print('Compatible signing certificate SHA-256: '+expected)
