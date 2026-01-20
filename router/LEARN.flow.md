# Router flow: Learn / knowledge

## Entry signals
- "learn", "teach me", "explain", "what is", "history of"

## Steps
1) Interview for depth, format, purpose, and constraints.
2) Build a research plan and scope boundaries.
3) Run multi-agent synthesis and critique.
4) Deliver layered outputs (brief, deep-dive, reading list, QA).

## Required questions
- Why do you want this knowledge?
- What depth and format do you want?
- What focus areas matter most?
- Time available to read or study?

## Required outputs
- `brief.md`
- `deep-dive.md`
- `reading-list.md`
- `qa.md`
- `progress-log.md`

## Scripted Q/A tree

### Q1: Motivation
Q: "Why do you want to learn this topic?"  
A: capture intent (curiosity, work, study)

### Q2: Depth and format
Q: "What depth and format do you want (overview, academic, expert)?"  
A: select depth and output format

### Q3: Focus areas
Q: "Any specific aspects to emphasize?"  
A: capture focus areas

### Q4: Time budget
Q: "How much time do you have to read or study?"  
A: capture time window

### Q5: Approval gate
Q: "Approve research plan and scope?"  
A: Yes -> run synthesis  
A: No -> refine scope

## Gates
- Scope must be defined before deep-dive generation

## Agents
- Researcher, Critic, Synthesizer
