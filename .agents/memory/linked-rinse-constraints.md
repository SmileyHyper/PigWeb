---
name: Linked-rinse constraints
description: User's constraints for implementing rinse-after-feeding behavior in the swine-farm project.
---

For linked-rinse work, keep the deployed Firebase schema and Security Rules unchanged. Dashboard-only sync is allowed: pair feed and rinse records by the same key under the existing schedule nodes, and derive rinse time from feeding time + feeding duration + delay (default 30 minutes). Do not add database fields or paths, server credentials, or a scheduler, and do not claim dashboard scheduling means the equipment physically ran.

**Why:** The user approved dashboard-only schedule synchronization while deferring physical execution until actual controller source is available.

**How to apply:** Before changing controller or Cloud Functions execution, read the actual source and summarize its trigger behavior for user confirmation. Use only existing schedule paths and fields; list legacy standalone rinses and get an explicit keep/link or remove choice before migration writes. If the schema cannot express a requirement, state exactly what is missing instead of inventing fields.
