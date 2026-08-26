# Pricing source-retirement exception register

Date: 2026-07-22  
Decision basis: the user-approved LM-00 no-functional-change precedence and
scope decisions recorded in `migration.json` on 2026-07-21  
Status: accepted migration exceptions; source destruction remains separately
blocked on retention approval

This register closes the Pricing logic-migration exception gate. It does not
authorize deletion of the sealed SQLite archive or the adjacent HR service.

| Evidence                                                                                                    | Classification                              | Retirement disposition                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three orphan `enquiry_import_reviews` / `enquiry_import_review_rows` relationships in the immutable archive | Accepted source-data exception              | Preserve all three as visible relationship-conflict evidence. Do not invent enquiry or line parents and do not silently repair them.              |
| Customer code `32046` appears across multiple product lineages                                              | Accepted executable-behavior decision       | Supersede by organization, customer, and normalized nonblank code; preserve the LM-00 collision fixture and deterministic source-ranked PO match. |
| Active blank-code child quote rows are not attached to active parents                                       | Accepted historical exception               | Retain the rows and use the source enquiry-plus-product lineage rule. Do not attach or supersede them outside a separately audited correction.    |
| Quote rows 17–20 inherit sent timestamps                                                                    | Accepted historical marker                  | Keep the timestamps; historical PDFs select the original sent row while current-price queries use active-price precedence.                        |
| Legacy `price_master` table exists                                                                          | Intentional runtime exclusion               | Preserve only in sealed evidence. Runtime tests forbid application writes or reads from it.                                                       |
| HR Recruitment UI proxies a repository/service not supplied to this migration                               | Approved external dependency boundary       | Preserve the proxy and capability boundary. Do not claim its external data was migrated.                                                          |
| Derived Product Base previously stored only machining price per piece                                       | Approved functional correction (2026-08-26) | Derive full Product-owned process cost per piece. Customer workbook calculated cells remain evidence only and are never migration inputs.         |
| Westmetall and Frankfurter are operationally unstable                                                       | Accepted operational dependency             | Keep live no-store calls and deterministic source-compatible fallbacks; never block quote generation on either service.                           |

The 2026-07-18 Pricing archive remains immutable and checksummed. Its 628
canonical rows reconcile, all 57 workflow checks report zero findings, and the
three relationship conflicts above remain the only Pricing migration warning.
Retention duration and physical destruction still require the business
approval defined in `docs/data-classification-retention.md`.
