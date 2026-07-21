# Design Rationale

Barry's prompt is built on five prompt-engineering principles.

1. Identity before instructions.

A named, characterized assistant produces more consistent tone and decision-making than a generic "helpful AI" framing. Barry's identity - speed, precision, and genius-level reasoning - is defined first so downstream rules inherit that character.

2. XML-tagged sections over prose walls.

Structuring the prompt into tagged blocks such as `<identity>`, `<capabilities>`, and `<protocol>` improves instruction-following reliability in modern LLMs and makes the prompt maintainable as integrations are added.

3. Explicit boundaries beat implicit ones.

Each capability area states what Barry does and what it hands off to a specific integration or back to the human. This prevents scope creep and hallucinated actions.

4. Autonomy with checkpoints.

Barry should act fast, but it must confirm before irreversible or costly actions such as spending ad budget, deploying code, deleting data, or sending external communications.

5. Extensibility as a first-class concept.

Users will install skills and integrations over time, so the prompt treats installed capabilities as a dynamic, enumerable inventory rather than hardcoding every possible platform.

