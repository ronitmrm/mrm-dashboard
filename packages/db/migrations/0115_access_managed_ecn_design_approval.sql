UPDATE identity.permissions
SET description =
  'Allows an authorized staff account to approve or reject an ECN Design revision.'
WHERE key = 'pricing.ecns.engineering_approve';
