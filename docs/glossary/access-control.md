# Access Control Glossary

**Application Role**: A reusable access profile assigned directly to a Staff
Account or inherited from an Approved Post. Its access can be changed after the
role is created.

**Administrative Role**: The assignable, non-system Application Role for staff
who manage application access and administration. It remains separate from the
protected System Administrator identity so it can be assigned to Staff Accounts
and Approved Posts without granting unrelated operational capabilities.

**Sales & Marketing Role**: The assignable Application Role for the sales team.
It can read Commercial Pricing Masters and add or update the Buyer, Incoterms,
Payment Terms, Shipment Mode, and Packaging Terms used by Customer Commercial
Defaults. It can also open the Sales workspace and complete its own follow-ups.
It does not receive master deletion, renaming, or workbook import.

**Page Access**: Permission to open one named software page or workspace. No
Access hides and blocks it; View Only opens it without changing actions; Full
Access includes every applicable action for that row; Custom allows the
applicable actions to be selected individually. A modifying action requires
View when that row has a View action. Removing View removes its dependent
actions.

**Access Module Name**: The module shown in Access Administration uses the same
business-facing name as the left sidebar. Internal permission namespaces such
as `pricing`, `operations`, and `hr` are never displayed as module names.

**Access Hierarchy**: Access Administration presents every grant as Main
Module, Sub Module, then Page or Task. Main Module and Sub Module names match
the left sidebar exactly. The Page or Task name matches the visible page tab or
action button that the grant controls; internal permission keys and database
permission descriptions are never displayed there. A command name is never
used as a Sub Module. A PPAC
page grant is scoped to one Production Floor;
granting a page under PPAC Conventional-01 does not grant the same page under
PPAC Conventional-02, PPAC CNC-01, or PPAC Forging. PPAC Task Access is scoped
the same way: granting a production command for one floor never authorizes that
command on another floor.

**Task Access**: Permission for one independently assignable business command,
such as requesting stock, making a purchase order, issuing a Store request, or
moving an asset. Task Access is independent of Page Access: the page controls
whether the workspace can be opened, while each Task Access grant controls its
button or function. The interface hides an unavailable command and the server
rejects it. Search, filter, navigation, download, and cancel controls do not need
Task Access unless they change business data.

**Access Preset**: A UI convenience that derives permission keys for one Page
or Task row. No Access, View Only, Full Access, and Custom are not stored as
permissions and never grant access to sibling rows.

**Design Team Profile**: The Application Role for staff who review commercial
context and maintain design work and drawing history without costing,
commercial-order, Store, HR, or Production access.

**User Override**: An exceptional permission change applied to one Staff
Account after its Application Roles. A deny override wins over a role grant.

**Artifact Read Access**: The `artifacts.read` capability allows an authorized
user to discover Artifact metadata and public URLs in the Organization-scoped
Administration ledger. It does not make the bytes private; anyone who already
possesses an UploadThing `public-read` URL can read them.

**Artifact Delete Access**: The separate `artifacts.delete` capability permits
audited manual deletion with exact-target confirmation and a reason. Read access
never implies delete access. Administrators receive both capabilities by
default; normal module permissions continue governing routine file discovery.
