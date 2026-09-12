# Google Cloud Artifact configuration

Production was configured and inspected on 2026-09-11. On 2026-09-12, Google
trust was expanded to the exact Vercel Development subject for local web use.
Production remains the only hosted environment; the GitHub staging branch has
no separate deployment. Configuration and local provider verification are
complete; deployed application and browser acceptance remain separate.

## Production environment

These six server-side Config variables are saved on Vercel team `mrm-general`,
project `mrm-dashboard` (`prj_ea1yAUKnHOV8uyGiOaVTLDRzwRol`), for **Production**:

| Variable                            | Value                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `GCS_PROJECT_ID`                    | `project-b3e69f72-3e13-4f13-98b`                                       |
| `GCS_PROJECT_NUMBER`                | `185282230283`                                                         |
| `GCS_BUCKET_NAME`                   | `mrm-erp-gcp-1`                                                        |
| `GCS_WORKLOAD_IDENTITY_POOL_ID`     | `mrm-vercel`                                                           |
| `GCS_WORKLOAD_IDENTITY_PROVIDER_ID` | `mrm-dashboard`                                                        |
| `GCS_SERVICE_ACCOUNT_EMAIL`         | `mrm-artifacts@project-b3e69f72-3e13-4f13-98b.iam.gserviceaccount.com` |

These identifiers are not long-lived credentials. No service-account JSON key,
private key, or ADC login is required. Vercel supplies short-lived OIDC tokens
to the deployed app. Keep the variables server-side without `NEXT_PUBLIC_`
prefixes. They take effect in a subsequent deployment; existing database/auth
configuration remains required.

## Local Development environment

Local web processes use the same six identifiers plus a Vercel **Development**
`VERCEL_OIDC_TOKEN`. From `apps/web`, an authorized team member runs:

```bash
pnpm artifact:auth:refresh
```

The helper invokes the installed Vercel CLI for team `mrm-general`, project
`mrm-dashboard`, and environment `development`; it never requests Preview or
Production values. It validates and merges only the six identifiers and token
into `.env.local`, without setting `VERCEL=1`. The token expires after 12 hours;
rerun the command and restart the dev server after refresh. No developer gcloud
login, ADC, or static Google credential is used.

The Google Development trust and all six Vercel Development variables are
configured. An independent real-token probe passed the shared provider path
without gcloud, ADC, or an injected storage client: it wrote and exactly read 67
synthetic bytes, received 403 anonymously, deleted the object, and confirmed it
missing. No business object or database row changed.

The real `pnpm artifact:auth:refresh` command also passed on this checkout. It
saved the Development token, preserved unrelated environment values and hosted
mode, and retained mode 0600. Focused provider/delivery/deletion tests passed
13/13, web typecheck and affected lint/format passed. Windows command dispatch
is implemented; this verification ran on Linux.

## Identity and permissions

Vercel project settings confirm OIDC enabled with `issuerMode: team`. The active
GCP provider uses issuer `https://oidc.vercel.com/mrm-general`, maps
`google.subject` to `assertion.sub`, and accepts only these two subjects:

```text
assertion.sub in ['owner:mrm-general:project:mrm-dashboard:environment:production', 'owner:mrm-general:project:mrm-dashboard:environment:development']
```

The provider uses the default audience. The application derives and requests:

```text
https://iam.googleapis.com/projects/185282230283/locations/global/workloadIdentityPools/mrm-vercel/providers/mrm-dashboard
```

The user-created `mrm-artifacts` account grants Workload Identity User to these
exact principals:

```text
principal://iam.googleapis.com/projects/185282230283/locations/global/workloadIdentityPools/mrm-vercel/subject/owner:mrm-general:project:mrm-dashboard:environment:production
principal://iam.googleapis.com/projects/185282230283/locations/global/workloadIdentityPools/mrm-vercel/subject/owner:mrm-general:project:mrm-dashboard:environment:development
```

The account has `roles/storage.objectUser` on `mrm-erp-gcp-1`. Its redundant
project-wide grant was removed and the absence of project role bindings was
verified. Cloud Storage, IAM, IAM Credentials, and Security Token Service APIs
are enabled. No Preview principal or signing role was added.

## Bucket settings

Verified: Standard storage in `US-CENTRAL1`, uniform bucket-level access,
Public Access Prevention enforced, Object Versioning disabled, and soft-delete
retention zero. The user explicitly approved disabling the previous 15-day
soft-delete window. Future deletions have no soft-delete recovery window.

Google-managed encryption is allowed; Cloud KMS and customer-supplied encryption
keys are restricted. No object lifecycle expiration or bucket CORS setup was
added. Public Access Prevention alone does not prohibit signed URLs; the
application implements private delivery without signing.

## Remaining verification

CLI configuration reads and the application's pure configuration check passed.
Google's exact Development condition and service-account binding, the six Vercel
Development variables, and real local provider traffic are verified. The probe
used a fresh 12-hour Development token and the provider's existing custom-
audience exchange; it did not use gcloud, ADC, or an injected client. No deployed
application token exchange or application deployment has been performed by this
task. Browser workflow acceptance remains pending.

Before cutover, verify production federation, exact private write/read bytes,
unauthorized application access denial, anonymous object denial, the permitted
25 MiB upload, a ZIP larger than 4.5 MB, multipage PDF preview, and controlled
final-reference deletion. Keep source cleanup and compatibility removal gated
by the migration runbook and agreed zero-active-users window.

## References

- [Vercel GCP federation and custom audience](https://vercel.com/docs/oidc/gcp)
- [Vercel token claims](https://vercel.com/docs/oidc/reference)
- [Google workload identity federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-providers)
- [Cloud Storage IAM roles](https://docs.cloud.google.com/storage/docs/access-control/iam-roles)
- [Storage encryption enforcement](https://docs.cloud.google.com/storage/docs/encryption/enforce-encryption-types)
- [Cloud Storage soft delete](https://docs.cloud.google.com/storage/docs/soft-delete)
