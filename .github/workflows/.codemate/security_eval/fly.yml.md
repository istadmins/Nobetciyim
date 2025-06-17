# Security Vulnerability Report

## Workflow File: Fly Deploy (GitHub Actions)

---

### 1. Using Action from an Unpinned Branch

**Code:**
```yaml
- uses: superfly/flyctl-actions/setup-flyctl@master
```
**Issue:**
- Referencing the action via the master branch (or any mutable branch) is insecure.
- The code pulled from master can change at any time, potentially introducing malicious code without notice.
- This exposes your CI pipeline to potential supply chain attacks.

**Recommendation:**
- Pin the action to a specific commit hash or a version tag (e.g., `@v1.2.3`) rather than a branch.
- Example:
  ```yaml
  - uses: superfly/flyctl-actions/setup-flyctl@v1.3.0
  ```

---

### 2. Secrets Exposure Risk

**Code:**
```yaml
env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```
**Issue:**
- While the token is taken securely from GitHub Secrets, it's vital to ensure the following:
  - No subsequent steps in the workflow reveal this secret via logs or outputs.
  - The secrets are used only in trusted actions and scripts.
- If any dependency (like self-hosted actions or arbitrary scripts) is untrusted, secrets may be exfiltrated.

**Recommendation:**
- Use "secrets" only with trusted actions and code.
- Avoid using shell commands that could inadvertently echo/print secrets.
- Consider adding a restriction to prevent PRs from forks (which could be malicious) from running deployment jobs that access secrets.

---

### 3. Actions/Checkout Version Used

**Code:**
```yaml
- uses: actions/checkout@v4
```
**Issue:**
- `actions/checkout@v4` is a valid, widely used version.
- However, not pinning to a minor or patch version (e.g., `v4.1.1`) can potentially result in pulling unexpected updates with unforeseen vulnerabilities.

**Recommendation:**
- Pin to a full release version (commit or `v4.X.X` tag) for added security:
  ```yaml
  - uses: actions/checkout@v4.1.1
  ```

---

### 4. Absence of Workflow Permissions Restrictions

**Issue:**
- By default, GitHub Actions workflows get broad permissions (read/write) for workflow tokens.
- Excessive permissions can increase the blast radius if a workflow or dependency is compromised.

**Recommendation:**
- Restrict permissions explicitly in the workflow:
  ```yaml
  permissions:
    contents: read
    id-token: write
  ```
- Only grant permissions minimally needed for the deployment process.

---

### 5. General Recommendations

- **Dependency Trust:** Always audit 3rd-party actions and be cautious running them with secrets.
- **Pull Requests from Forks:** Ensure deployments are not triggered by PRs from forks to prevent secret leakage.
- **Environment Protection:** Consider enabling required reviewers/environment protection rules in GitHub for deployment jobs that touch production.

---

# Summary Table

| Issue                                         | Risk Level | Remediation                                            |
|-----------------------------------------------|------------|--------------------------------------------------------|
| Actions used from mutable (branch) references | High       | Pin to commit or stable version tag                    |
| Secrets exposure via environment variables    | High       | Use secrets only with trusted actions, limit exposure  |
| Broad default permissions                     | Medium     | Explicitly set least-privilege workflow permissions    |
| PRs from forks with access to secrets         | High       | Limit deployment triggers to non-fork workflows        |
| Unpinned minor/patch version of "checkout"    | Low        | Pin to full release tag or commit                      |

---

**Please address the high-priority issues above to mitigate supply chain and secrets leakage attacks in your GitHub Actions workflow.**