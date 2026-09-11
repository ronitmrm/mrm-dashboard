# Google Cloud Artifact configuration

Configured and inspected on 2026-09-11 using the authenticated gcloud and
Vercel CLIs. Production is the only hosted environment; the GitHub staging
branch has no separate deployment. This records cloud configuration, not a
completed application deployment or live Artifact migration.

## Production environment

These six server-side Config variables are saved on Vercel team `mrm-general`,
project `mrm-dashboard` (`prj_ea1yAUKnHOV8uyGiOaVTLDRzwRol`), for **Production**:

| Variable | Value |
| --- | --- |
| `GCS_PROJECT_ID` | `project-b3e69f72-3e13-4f13-98b` |
| `GCS_PROJECT_NUMBER` | `185282230283` |
| `GCS_BUCKET_NAME` | `mrm-erp-gcp-1` |
| `GCS_WORKLOAD_IDENTITY_POOL_ID` | `mrm-vercel` |
| `GCS_WORKLOAD_IDENTITY_PROVIDER_ID` | `mrm-dashboard` |
| `GCS_SERVICE_ACCOUNT_EMAIL` | `mrm-artifacts@project-b3e69f72-3e13-4f13-98b.iam.gserviceaccount.com` |

These identifiers are not long-lived credentials. No service-account JSON key,
private key, copied OIDC token, or ADC login is required for the deployed app.
Vercel supplies short-lived OIDC tokens. Keep the variables server-side without
`NEXT_PUBLIC_` prefixes. They take effect in a subsequent deployment; existing
database/auth configuration remains required.

## Identity and permissions

Vercel project settings confirm OIDC enabled with `issuerMode: team`. The active
GCP provider uses issuer `https://oidc.vercel.com/mrm-general`, maps
`google.subject` to `assertion.sub`, and applies this condition:

```text
assertion.sub == 'owner:mrm-general:project:mrm-dashboard:environment:production'
```

The provider uses the default audience. The application derives and requests:

```text
https://iam.googleapis.com/projects/185282230283/locations/global/workloadIdentityPools/mrm-vercel/providers/mrm-dashboard
```

The user-created `mrm-artifacts` account grants Workload Identity User to this
exact principal:

```text
principal://iam.googleapis.com/projects/185282230283/locations/global/workloadIdentityPools/mrm-vercel/subject/owner:mrm-general:project:mrm-dashboard:environment:production
```

The account has `roles/storage.objectUser` on `mrm-erp-gcp-1`. Its redundant
project-wide grant was removed and the absence of project role bindings was
verified. Cloud Storage, IAM, IAM Credentials, and Security Token Service APIs
are enabled. No preview/development principal or signing role was added.

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
No deployed application token exchange, real Artifact byte traffic, retained
source migration, or application deployment has been performed by this task.
The operator's normal gcloud login is distinct from local ADC; no ADC was set up.

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
