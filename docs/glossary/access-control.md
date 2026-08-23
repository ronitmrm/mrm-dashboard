# Access Control Glossary

**Application Role**: A reusable access profile assigned directly to a Staff
Account or inherited from an Approved Post. Its access can be changed after the
role is created.

**Administrative Role**: The assignable, non-system Application Role for staff
who manage application access and administration. It remains separate from the
protected System Administrator identity so it can be assigned to Staff Accounts
and Approved Posts without granting unrelated operational capabilities.

**Page Access**: Permission to open one named software page or workspace. No
Access hides and blocks it; Read Only opens it without its changing actions;
Full Access includes its applicable changing actions.

**Task Access**: Permission for one independently assignable business command,
such as requesting stock, making a purchase order, issuing a Store request, or
moving an asset. Task Access is independent of Page Access: the page controls
whether the workspace can be opened, while each Task Access grant controls its
button or function. The interface hides an unavailable command and the server
rejects it. Search, filter, navigation, download, and cancel controls do not need
Task Access unless they change business data.

**Design Team Profile**: The Application Role for staff who review commercial
context and maintain design work and drawing history without costing,
commercial-order, Store, HR, or Production access.

**User Override**: An exceptional permission change applied to one Staff
Account after its Application Roles. A deny override wins over a role grant.
