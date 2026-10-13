---
name: PDF form data integrity
description: Validate stored PDF field data as well as visible appearances when clearing or changing forms.
---
Verify PDF form edits by reopening the generated PDF and checking stored values, not only the visible appearance or the in-memory widget.

**Why:** The local native engine accepted an empty field value and generated a blank appearance while retaining the previous stored value. A visually cleared field can still expose old data.

**How to apply:** For form-clearing and reset features, check stored values and inherited field dictionaries as well as appearances. Clearing forms is not a substitute for secure redaction.