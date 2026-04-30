# CLAUDE.md — Kelz Hounds Division (KHD)
## Project Briefing for Claude Code

This file provides standing context for any Claude Code session working on KHD training materials, documents, tools, or infrastructure. Read this before beginning any task.

---

## The Org

**Kelz Hounds Division (KHD)** is a Star Citizen pirate organization. The moniker KHD is established and should not be changed. The org identity draws on wolf/hound pack themes and nautical pirate vocabulary. Primary objectives are:

1. Combat effectiveness across air, ground, and fleet domains
2. Engaging events and onboarding experiences for new players
3. Economically self-sustaining operations (mining, salvage, logistics)

---

## Training Program Overview

KHD operates a structured training and certification program. All training courses follow the established document format (see Course Format below). The program is designed around ~90 minute sessions with practical drills and course-independent certification options (allowing experienced players to test out).

### Guiding Philosophy
- Training is engineered, not improvised
- Doctrine is adapted from real-world sources to Star Citizen mechanics — never copied verbatim
- Brevity codes and terminology are introduced in context alongside their associated concepts, not as standalone vocabulary dumps
- Debrief is mandatory at the end of every session

---

## Full Course Structure

### Air Wing
| Code | Title | Prereqs |
|------|-------|---------|
| BFS-01 | First Time Pilot | None |
| BFS-02 | The Next Steps | BFS-01 |
| AWC-01 | Combat Basics | BFS-02 |
| AWC-02 | Element Tactics | AWC-01, COM-01 |
| AWC-03 | Escort and Overwatch | AWC-02 |

### Ground Forces
| Code | Title | Prereqs |
|------|-------|---------|
| GFC-01 | Formation and FPS Fundamentals | None |
| GVO-01 | Ground Vehicle Operations | GFC-01 |

### Marine Security Forces (MSF)
| Code | Title | Prereqs |
|------|-------|---------|
| MSF-01 | CQB and Shipboard Combat | GFC-01, FLT-01, COM-01 |
| MSF-02 | Boarding Operations | MSF-01 |

### Fleet
| Code | Title | Prereqs |
|------|-------|---------|
| ENG-01 | Ship Systems and Repair Fundamentals | BFS-01 |
| FLT-01 | Multicrew Fundamentals | ENG-01, COM-01 |
| FLT-02 | Capital Operations | FLT-01 |

### Comms
| Code | Title | Prereqs |
|------|-------|---------|
| COM-01 | Comms Fundamentals | None |
| COM-02 | SRS and Officer Comms | COM-01 + breadth across AWC, GFC, FLT tracks |

### Mining
| Code | Title | Prereqs |
|------|-------|---------|
| MNG-01 | Mining Fundamentals | None |
| MNG-02 | Ship Mining and Crew Roles | MNG-01 |

### Salvage
| Code | Title | Prereqs |
|------|-------|---------|
| SAL-01 | Salvage Fundamentals | BFS-01 |
| SAL-02 | Post-Engagement Recovery Operations | SAL-01 |

### Logistics
| Code | Title | Prereqs |
|------|-------|---------|
| LOG-01 | Cargo and Transport | BFS-01 |

### Combined Arms (Planned — pending recruitment)
| Code | Title | Prereqs |
|------|-------|---------|
| CAX-01 | Joint Operations Fundamentals | COM-02, AWC-01, GFC-01 |
| CAX-02 | Full Spectrum Operations | CAX-01 |
| MNG-03 | Mining Overwatch and Coordination | MNG-02, COM-02, AWC-01 |
| SAL-03 | Contested Salvage Operations | SAL-02, COM-02, AWC-01 |

---

## Key Design Decisions

- **MNG-01 has no prereqs** — an officer can fly for trainees; course focuses on hand mining, ROC, and prospecting
- **SAL-01 and LOG-01 require BFS-01** — Vulture/Salvor are solo ships; Hull C requires flight literacy
- **ENG-01 is the fleet entry point**, not a standalone engineering track — feeds into FLT-01
- **COM-01 is a base tier course alongside BFS-01 and GFC-01** — no prereqs, everyone takes it early
- **COM-02 is a leadership/officer course**, not a general progression course — gates CAX-01, MNG-03, SAL-03
- **Commodity selling and economic training lives in LOG-01**, not MNG courses
- **Resupply is out of scope for LOG-01** — better covered contextually in FLT-01
- **MSF replaces GFC-02 and GFC-03** — shipboard and boarding content now lives in its own track
- **GVO-01 covers ground vehicle operations** — Centurion, Storm AA, Cyclone AA and other relevant vehicles; content to be defined

---

## Course Document Format

All course documents follow this structure and should be modeled on existing docs (BFS-01, GFC-01):

```
[Course Code]: [Course Name]
[Subtitle]

| Class Objective: [ABCD method — Audience, Behavior, Condition, Degree] | Class Specs: Domain / Duration: 1hr 30mins / Size / Prerequisites / Certification [Code] |

| Element | Description | Possible Drills / Specific Skills | Estimated Time |
...table rows...

Course-independent Certification
[Description of how to test out without taking the course]
```

- Titles of new documents begin with CLAUDE
- Language should be precise and clear — avoid AI writing hallmarks
- Brevity codes introduced contextually within relevant course sections
- Debrief structure included in drill design

---

## Document Naming Convention

New documents created by Claude are prefixed: `CLAUDE_[course_code]_[descriptor]`

Example: `CLAUDE_MNG01_course_plan.md`

---

## Org Identity Notes

- Wolf and hound pack themes throughout
- Nautical pirate vocabulary welcomed — corsair, ketch, privateer etc.
- Avoid reusing existing internal terms: Howl (fireteam), Fang, Claw (buddy teams)
- Fire symbology is present but being de-emphasized
- Division naming ideas in progress — no final decisions made yet

---

## Tools and Platforms

- **Star Citizen** (game) — current patch context matters for mechanic accuracy, verify against latest patch notes
- **Simple Radio Standalone (SRS)** — org comms platform, covered in COM-02
- **Arena Commander** — primary training environment for controlled drills
- **Google Drive** — course documents stored here under KHD Operations

---

## Notes for Code Tasks

- When generating course documents, always follow the table format above
- When referencing game mechanics, flag anything that may have changed in recent patches
- The course map is the source of truth for prereq chains — do not invent prereqs
- Planned courses (CAX, MNG-03, SAL-03) are aspirational — do not build content for them without explicit instruction
- COM-01 brevity codes should be introduced gradually across the curriculum, not as a standalone list

---

*Last updated from training structure conversation — April 2026*
