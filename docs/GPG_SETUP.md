# GPG commit signing (for GitHub “Require signed commits”)

Signed commits prove that commits came from someone who controls a key you trust. GitHub shows **Verified** when the commit signing key is added to your GitHub account.

## 1. Install GnuPG

- **Windows:** Install [Gpg4win](https://www.gpg4win.org/) or use `winget install GnuPG.GnuPG`.
- **macOS:** `brew install gnupg`
- **Linux:** `sudo apt install gnupg` (Debian/Ubuntu) or your distro equivalent.

Confirm:

```bash
gpg --version
```

## 2. Create a signing key

```bash
gpg --full-generate-key
```

Choose:

- Kind: **RSA and RSA** (or **ed25519** if offered and your Git version supports it).
- Key size: **4096** for RSA (or default for Ed25519).
- Expiry: your policy (e.g. **1y**); you can extend later.
- Real name and email: use the **same email** as your GitHub account (or a GitHub-verified email).

Note the **key id** (short form), e.g. `A1B2C3D4`, from:

```bash
gpg --list-secret-keys --keyid-format=long
```

## 3. Tell Git to sign commits by default

Replace `YOUR_KEY_ID` with the long or short id from the list above.

```bash
git config --global user.signingkey YOUR_KEY_ID
git config --global commit.gpgsign true
git config --global tag.gpgSign true
```

**Windows:** if `gpg` is not found when Git runs:

```bash
git config --global gpg.program "C:/Program Files (x86)/GnuPG/bin/gpg.exe"
```

(Adjust path to your `gpg.exe`.)

Test:

```bash
echo "test" > gpg-test.txt
git add gpg-test.txt
git commit -m "chore: test gpg signing"
gpg --verify $(git rev-parse --git-path ../.git/objects/$(git rev-parse HEAD | cut -c1-2)/$(git rev-parse HEAD | cut -c3-))
```

Or push a branch and confirm the commit shows **Verified** on GitHub after step 4.

Remove the test commit before opening a real PR if you prefer:

```bash
git reset --hard HEAD~1
```

## 4. Add the public key to GitHub

Export ASCII-armored public key:

```bash
gpg --armor --export YOUR_KEY_ID
```

Copy the block from `-----BEGIN PGP PUBLIC KEY BLOCK-----` to `-----END PGP PUBLIC KEY BLOCK-----`.

On GitHub: **Settings** (your profile) → **SSH and GPG keys** → **New GPG key** → paste → save.

Use the **same email** on commits as associated with that key (see `git config user.email`).

## 5. Signing with SSH (optional alternative)

If your org uses **SSH commit signing** instead of GPG:

1. Generate or reuse an SSH key (Ed25519 recommended).
2. GitHub → **SSH and GPG keys** → **Signing Key** → add public key.
3. Configure Git:

   ```bash
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   ```

GitHub treats verified SSH-signed commits similarly for branch protection.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `error: gpg failed to sign the data` | Set `gpg.program`, ensure `gpg-agent` is running (`gpgconf --launch gpg-agent`), try `export GPG_TTY=$(tty)` on macOS/Linux. |
| Commit not **Verified** on GitHub | Email on commit must match GitHub verified email; key must be uploaded; use `git log --show-signature -1`. |
| CI / squash merges | Squashed commits on `main` are attributed to the merger unless you use **Co-authored-by** and signing rules your org defines — align with your release process. |

## References

- [GitHub: Signing commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)
- [Git: git-config user.signingkey](https://git-scm.com/docs/git-config#Documentation/git-config.txt-usersigningKey)
