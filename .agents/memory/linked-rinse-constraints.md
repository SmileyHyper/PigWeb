---
name: Linked-rinse constraints
description: User's constraints for implementing rinse-after-feeding behavior in the swine-farm project.
---

For linked-rinse work, keep the deployed Firebase schema and Security Rules unchanged. Do not add database fields or paths, server credentials, or a new scheduler. Implement the behavior only in the existing controller or Cloud Functions code, using existing data paths.

**Why:** The user explicitly requires the existing Firebase contract and rules to remain unchanged.

**How to apply:** Before changing schedule execution, read the actual controller source and summarize its current trigger behavior for user confirmation. If the current schema cannot express a required link or delay, state exactly what is missing instead of inventing fields.
