# Website Catalogue

Website Product Data enriches existing Products for the website. UID identifies
the Product. Grade, Size, Category and Subcategory are read-only Product Portfolio
values; neither manual catalogue saves nor CSV imports can override them.
Current Product classification and material grade take precedence, with existing
profile values retained as a fallback for legacy Products.

The catalogue table, CSV template and Excel export use these fields in order:
UID, Description, Grade, Material, Size, Category, Subcategory, Applications,
Certifications, Connections, Material Construction, Final Assemblies Code,
Dimensions, Drawing Category, Finish Plating, Pressure, Sealant, Temperature,
Thread Standard, Thread Size 1–4, Website Active, Created At, Remark, Additional
Notes. Website Category and Website Subcategory are excluded. Existing stored
values for those excluded fields are preserved.

The master table loads the complete catalogue for its persisted column filters.
There is no separate page filter panel. Clear All Filters sits above the table's
scrolling boundary.

Material Construction, Final Assemblies Code and Thread Standard retain their
existing derivation from Product production type, BOM and thread sizes. “Included”
does not mean every field must be nonblank. Existing completion rules still apply.
