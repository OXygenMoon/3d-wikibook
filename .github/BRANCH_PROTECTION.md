# Branch protection

The CI workflow is committed at `.github/workflows/ci.yml`. Branch protection is
a GitHub repository setting and cannot be enforced from a local checkout, so
enable it once after the first push:

1. Push `main` (or `master`) and let the CI workflow pass once.
2. Open **Settings → Branches → Add branch protection rule**.
3. Protect `main` and `master`.
4. Enable:
   - Require a pull request before merging.
   - Require status checks to pass before merging.
   - Select the `verify` check from the CI workflow.
   - Require branches to be up to date before merging.
   - Do not allow force pushes.
   - Do not allow deletions.
5. For a small team, allow administrators to bypass only during an incident.

Equivalent `gh` CLI setup (replace `OWNER/REPO`):

```sh
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  repos/OWNER/REPO/branches/main/protection \
  -f required_status_checks='{"strict":true,"checks":[{"context":"verify"}]}' \
  -f enforce_admins=false \
  -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f restrictions=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

Until a remote exists, the local contract is: run `npm run check`, `npm test`,
`npm run build`, and `npm run test:e2e` before creating a release tag.
