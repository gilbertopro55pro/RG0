#!/usr/bin/env python3
# Fresh one-session password for the test account ("סטודיו אור"). Nobody keeps its password;
# each session sets a new random one instead (owner's decision, 2026-09-28):
#   PYTHONPATH=<scratchpad>/pylib python3 test-password.py <scratchpad>/gf-pass
# writes a random password to that file (mode 600, OUTSIDE the repo) and prints ONLY its bcrypt
# hash. Put the hash on the test account through the Supabase connector:
#   update auth.users set encrypted_password = '<hash>' where id = '631b740d-9f78-4e6b-9daa-ace853329cfc';
# then log in: GF_EMAIL=<test account email> GF_PASSWORD="$(cat <file>)" GF_STATE=… node login.js
# Never print, commit or message the password, and never run this for any other account.
# Needs bcrypt: pip install bcrypt --target <scratchpad>/pylib
import os, secrets, sys

import bcrypt

out = sys.argv[1]
repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
if os.path.abspath(out).startswith(repo):
    sys.exit("the password file must be outside the repo")
pw = secrets.token_urlsafe(18)
fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, "w") as f:
    f.write(pw)
print(bcrypt.hashpw(pw.encode(), bcrypt.gensalt(10)).decode())
