# MVE

## Morocco Verifiable Elections
### A research project for building a secure, transparent, auditable and voter-verifiable digital election infrastructure for Morocco.
[![Status](https://img.shields.io/badge/status-research%20%2F%20prototype-orange)](#project-status)
[![License](https://img.shields.io/badge/license-personal%20%26%20non--commercial-blue)](#license)
[![Security](https://img.shields.io/badge/security-security--first-red)](#security)
[![Privacy](https://img.shields.io/badge/privacy-voter--verifiable-green)](#privacy)
[![Country](https://img.shields.io/badge/country-Morocco-red)](#)
---
## Overview
**Morocco Verifiable Elections (MVE)** is an independent civic-technology research project exploring how Morocco could modernize election infrastructure through secure digital systems while preserving:
- voter privacy
- ballot secrecy
- physical auditability
- public transparency
- independent verification
- election integrity
- operational resilience
- accessibility
- democratic participation
The project does **not** assume that simply replacing paper with computers makes elections more secure.
Instead, it explores a **hybrid, verifiable election model** in which digital infrastructure is combined with voter-verifiable physical records, cryptographic verification, independent auditing and public transparency.
> **The objective is not to replace trust with technology.**
>
> **The objective is to reduce the amount of trust required.**
---
# Project Status
> **RESEARCH | PROTOTYPE NOT FOR REAL ELECTIONS**
This repository is an experimental and research project.
It is **not currently certified, approved, authorized or intended for use in an official Moroccan election**.
Do not deploy this software for a real election, polling station, voter registration system, political campaign, governmental election infrastructure or other high-stakes electoral process.
The architecture, cryptographic protocols, software, hardware integrations, legal framework and operational procedures require extensive independent review before any real-world deployment could be considered.
---
## What the prototype demonstrates today (2026-10-03)

#### A zero-dependency TypeScript prototype runs the full election loop end to end:
`seed-demo → booth open (2 approvals, firmware + certificate gates) → vote
(anonymous token, paper slip, commitment-bound receipt) → close (3 approvals,
reconcile-or-refuse, dual signatures) → sealed offline transmission →
public portal/API/open dataset → independent verification → risk-limiting audit
sampling → disaster-recovery rebuild`. Proven by **91 automated tests**
(`npm test`), `tsc --strict`, `npm audit 0 vulnerabilities`, and a
`lint:privacy` gate that forbids voter↔vote joins. Scale evidence: 10,000
simulated stations / 449,898 ballots with full paper trail in ~12.5 min,
recounted 10,000/10,000 MATCH (see `docs/security/baseline.md`).
Run guide: [`PROTOTYPE.md`](PROTOTYPE.md).
---
# Why This Project Exists
Modern election systems involve much more than casting a ballot.
A trustworthy election requires confidence in:
```text
Voter eligibility
       ↓
Ballot authorization
       ↓
Ballot secrecy
       ↓
Vote recording
       ↓
Ballot counting
       ↓
Result transmission
       ↓
Result aggregation
       ↓
Auditing
       ↓
Publication
       ↓
Dispute resolution

A weakness in any one of these stages can undermine confidence in the entire process.

MVE therefore approaches elections as a complete security and verification system, rather than simply as a voting application.

⸻

Core Principles

1. Voter Privacy

The system must never create a recoverable relationship between:

Voter identity
        ↓
Political choice

A system administrator should not be able to query:

"CIN X voted for Candidate Y"

The architecture must maintain strict separation between voter eligibility and anonymous ballots.

⸻

2. Ballot Secrecy

A voter must be able to cast a ballot privately.

The system should allow verification that a ballot was accepted without creating a transferable proof of which candidate or party the voter selected.

This is important because a voting system should not make it easier to:

* buy votes
* sell votes
* coerce voters
* prove political preferences to another person

⸻

3. Voter-Verifiable Records

Digital records should not be the only evidence of an election.

The proposed architecture uses a voter-verifiable physical record that can be independently audited.

Conceptually:

                 Voter
                   │
                   ▼
             Digital ballot
                   │
                   ▼
          Voter verifies record
                   │
                   ▼
             Physical ballot
                   │
                   ▼
             Secure ballot box

The physical record provides an independent audit mechanism.

⸻

4. Cryptographic Verification

Election records should be digitally signed and tamper-evident.

A simplified result package could contain:

Election ID
Polling Station ID
Device ID
Ballot Count
Result Data
Timestamp
Software/Firmware Hash
Digital Signature

Changing the result after signing should invalidate the cryptographic verification.

⸻

5. No Single Point of Trust

The system should not depend on a single:

* administrator
* server
* database
* machine
* software vendor
* government employee
* network
* cryptographic key

Critical operations should use multiple authorized parties and independent verification.

⸻

6. Offline-First Polling

A polling station must not stop functioning simply because an Internet connection fails.

The voting infrastructure should be capable of:

Internet unavailable
        ↓
Voting continues
        ↓
Records remain locally protected
        ↓
Connection restored
        ↓
Signed synchronization

⸻

7. Public Transparency

After legally permitted publication, election data should be independently verifiable.

The public transparency layer could expose:

* polling-station results
* district results
* election totals
* audit status
* result hashes
* verification information
* statistical datasets
* published incidents
* audit outcomes

Personal voter information must never be exposed.

⸻

System Architecture

The proposed architecture is divided into independent components.

                         ┌─────────────────────┐
                         │   PUBLIC PORTAL     │
                         │                     │
                         │ Results             │
                         │ Audits              │
                         │ Statistics          │
                         │ Verification        │
                         │ Public API          │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ TRANSPARENCY LAYER │
                         │                     │
                         │ Hashes              │
                         │ Signatures          │
                         │ Public records      │
                         └──────────┬──────────┘
                                    │
                   ┌────────────────┴────────────────┐
                   │                                 │
                   ▼                                 ▼
          ┌──────────────────┐              ┌──────────────────┐
          │ RESULT SERVICE   │              │ AUDIT SERVICE    │
          └────────┬─────────┘              └────────┬─────────┘
                   │                                 │
                   └────────────────┬────────────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ ELECTION CORE       │
                         │                     │
                         │ Elections           │
                         │ Districts           │
                         │ Polling stations    │
                         │ Eligibility         │
                         └──────────┬──────────┘
                                    │
               ┌────────────────────┼────────────────────┐
               │                    │                    │
               ▼                    ▼                    ▼
        ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
        │ POLLING     │      │ POLLING     │      │ POLLING     │
        │ STATION A   │      │ STATION B   │      │ STATION C   │
        └──────┬──────┘      └──────┬──────┘      └──────┬──────┘
               │                    │                    │
               ▼                    ▼                    ▼
           VOTING               VOTING               VOTING
           DEVICE               DEVICE               DEVICE
               │                    │                    │
               ▼                    ▼                    ▼
            PAPER                PAPER                PAPER
            RECORD               RECORD               RECORD
               │                    │                    │
               └────────────────────┼────────────────────┘
                                    ▼
                             PHYSICAL AUDIT

⸻

Major Components

Election Core

Responsible for:

* election configuration
* electoral districts
* polling stations
* candidates
* parties
* election schedules
* station configuration
* authorized election personnel

⸻

Voter Eligibility Service

Responsible only for determining whether a person is authorized to vote.

It must remain logically and cryptographically separated from the anonymous ballot system.

Conceptually:

Voter Identity
      │
      ▼
Eligibility Check
      │
      ▼
Anonymous Authorization
      │
      ▼
Ballot System

⸻

Voting Client

The polling-station voting application handles:

* ballot presentation
* voter interaction
* ballot authorization
* vote recording
* physical record generation
* local cryptographic operations
* secure local storage
* audit logging

The voting client should operate on hardened dedicated hardware rather than an ordinary consumer computer.

⸻

Polling Station Workflow

Before Opening

The station verifies:

Device identity
Firmware integrity
Election configuration
Ballot configuration
Secure storage
Cryptographic keys
Hardware state

The system should produce an auditable opening record.

⸻

Opening

Critical opening operations should require multiple authorized participants.

Example:

Presiding Officer
       +
Authorized Observer
       +
Second Authorized Officer
       ↓
Polling Station Opens

The exact authorization model would be determined by the applicable legal and operational framework.

⸻

During Voting

A simplified flow:

1. Verify voter eligibility
2. Confirm voter has not already voted
3. Issue anonymous voting authorization
4. Enter private voting environment
5. Select candidate/party
6. Generate voter-verifiable record
7. Voter verifies the record
8. Deposit physical record
9. Secure encrypted electronic ballot
10. Record audit event

⸻

Closing the Poll

At closing, the system performs reconciliation.

Example:

Registered voters
        ↓
Authorized voters
        ↓
Ballots issued
        ↓
Electronic ballots
        ↓
Physical ballots
        ↓
Unused ballots

The numbers should reconcile according to predefined election rules.

Any unexplained discrepancy should automatically generate an exception requiring investigation.

⸻

Results

Each polling station generates a signed result package.

Example:

{
  "election": "ELECTION-ID",
  "polling_station": "STATION-ID",
  "device": "DEVICE-ID",
  "ballots_issued": 487,
  "ballots_counted": 487,
  "invalid_ballots": 0,
  "results": {
    "candidate_a": 201,
    "candidate_b": 176,
    "candidate_c": 110
  },
  "timestamp": "SIGNED-TIMESTAMP",
  "result_hash": "HASH",
  "signature": "DIGITAL-SIGNATURE"
}

The exact production format is still under development.

⸻

Cryptographic Verification

The project intends to use established cryptographic standards rather than inventing proprietary cryptography.

Potential technologies include:

* SHA-256 / SHA-3
* Ed25519
* X25519
* AES-256
* TLS 1.3
* hardware-backed key storage
* secure boot
* TPM
* cryptographic signatures
* authenticated encryption

Advanced protocols such as:

* mixnets
* homomorphic encryption
* zero-knowledge proofs

may be evaluated in later research phases.

Cryptographic protocols must undergo independent expert review before being considered production-ready.

⸻

Audit System

The audit system is a core component of MVE.

The objective is not simply:

“The computer says these are the results.”

Instead:

Electronic result
       +
Physical ballot evidence
       +
Cryptographic verification
       +
Independent audit
       =
Verifiable result

⸻

Risk-Limiting Audit Research

The project will investigate statistical audit mechanisms in which a predefined sample of physical ballots is manually checked against reported results.

Conceptually:

Election complete
      ↓
Electronic result
      ↓
Random audit sample
      ↓
Physical verification
      ↓
Compare results
      ↓
Discrepancy?
   /       \
 No         Yes
 │           │
 ▼           ▼
Pass      Expanded audit
             │
             ▼
        Further review

The exact methodology must be independently designed, tested and legally established before deployment.

⸻

Observer System

MVE proposes an independent observer interface.

Observers could monitor authorized events such as:

Polling station opened
Voting started
Voting ended
Counting started
Result generated
Result transmitted
Audit initiated
Audit completed

Observers should not receive access to confidential voter information.

⸻

Incident Reporting

The platform may provide a structured incident-reporting system.

Example:

Incident ID
Polling Station
Timestamp
Category
Description
Evidence
Reporter
Status
Investigation
Resolution

Possible categories:

* voting equipment issue
* ballot issue
* counting discrepancy
* unauthorized access
* intimidation
* procedural violation
* accessibility issue
* network failure
* power failure
* other

Reports should enter an investigation workflow rather than automatically changing election results.

⸻

Anomaly Detection

Statistical tools may be used to identify events requiring human review.

Potential indicators include:

* unusual turnout
* unusual invalid-ballot rates
* ballot-count discrepancies
* unexpected timing patterns
* repeated device failures
* unusual transmission behavior
* audit discrepancies
* inconsistent station records

An anomaly is not automatically evidence of fraud.

The correct workflow is:

Anomaly
   ↓
Flag
   ↓
Human investigation
   ↓
Evidence
   ↓
Established procedure
   ↓
Decision

⸻

AI

Artificial intelligence may be used as an analytical tool.

Potential uses:

* anomaly detection
* document classification
* OCR
* translation
* accessibility
* log analysis
* cybersecurity analysis

AI must not independently determine:

* whether fraud occurred
* whether a vote is valid
* whether an election result should be changed
* whether a candidate should be disqualified

AI-generated alerts should remain reviewable by humans.

⸻

Security Model

MVE follows a security-first approach.

Threat Model

The system should assume potential attacks from:

External attackers

* network attackers
* malware operators
* botnets
* ransomware
* denial-of-service attacks
* supply-chain attackers

Insider threats

* compromised officials
* compromised administrators
* malicious contractors
* stolen credentials

Physical attackers

* device theft
* hardware tampering
* unauthorized USB devices
* physical access to polling equipment

Social engineering

* phishing
* credential theft
* impersonation
* coercion

Software attacks

* malicious updates
* compromised dependencies
* vulnerable libraries
* firmware modification
* supply-chain compromise

⸻

Security Requirements

The production architecture should consider:

* secure boot
* hardware-backed keys
* signed firmware
* signed software releases
* reproducible builds
* encrypted storage
* role-based access control
* multi-factor authentication
* multi-party authorization
* immutable audit logs
* network segmentation
* offline operation
* encrypted synchronization
* key rotation
* disaster recovery
* intrusion detection
* independent security monitoring

⸻

Zero-Trust Architecture

No component should automatically trust another component.

Conceptually:

Device
  ↓
Authenticate
  ↓
Authorize
  ↓
Verify integrity
  ↓
Perform operation
  ↓
Sign event
  ↓
Record audit trail

Every sensitive operation should be authenticated and authorized.

⸻

Key Management

Election cryptographic keys are among the most sensitive assets in the system.

The architecture should investigate:

* hardware security modules
* hardware-backed keys
* key rotation
* threshold authorization
* offline root keys
* secure key ceremonies
* emergency key revocation
* disaster recovery keys

No single administrator should possess unrestricted control over the entire election cryptographic infrastructure.

⸻

Privacy

Privacy is a fundamental requirement.

The system must avoid storing unnecessary personal information.

The architecture should enforce separation between:

IDENTITY DOMAIN
Voter
   ↓
Eligibility
   ↓
Authorization
BALLOT DOMAIN
Anonymous ballot
   ↓
Encrypted vote
   ↓
Counting
AUDIT DOMAIN
Device
   ↓
Event
   ↓
Signature

These domains must not become a hidden mechanism for reconstructing voter choices.

⸻

Personal Data

Any real-world implementation in Morocco would require detailed legal and privacy review.

This project does not claim that the current prototype satisfies Moroccan electoral law or data-protection requirements.

Before deployment, the system would need review against applicable:

* constitutional requirements
* electoral legislation
* data-protection requirements
* cybersecurity requirements
* accessibility requirements
* electronic-signature requirements
* electoral dispute procedures
* election-observation rules

⸻

Accessibility

A national election system must be usable by citizens with different abilities and levels of digital literacy.

The project will investigate:

* Arabic interface
* Amazigh interface
* French interface
* large text
* high contrast
* screen-reader compatibility
* audio guidance
* accessible physical interfaces
* assisted voting procedures
* offline instructions
* simple user flows

⸻

Language Support

Initial interface targets:

العربية
Tamazight
Français
English

English is primarily intended for technical documentation and international research.

⸻

Public Verification

A long-term objective is to allow independent parties to verify published results.

A researcher should be able to obtain:

Election data
+
Polling station data
+
Published result hashes
+
Audit records
+
Verification software

and independently verify the published election record.

⸻

Public API

A future public API may expose non-sensitive election information.

Potential endpoints:

GET /api/elections
GET /api/elections/{id}
GET /api/districts
GET /api/polling-stations
GET /api/results
GET /api/audits
GET /api/incidents
GET /api/verification

No endpoint should expose voter identities or individual political choices.

⸻

Proposed Repository Structure

morocco-verifiable-elections/
│
├── README.md
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
│
├── docs/
│   ├── architecture/
│   ├── security/
│   ├── cryptography/
│   ├── privacy/
│   ├── elections/
│   ├── auditing/
│   ├── accessibility/
│   └── legal/
│
├── apps/
│   ├── public-portal/
│   ├── observer-portal/
│   ├── administration/
│   └── verification/
│
├── services/
│   ├── election-core/
│   ├── eligibility/
│   ├── ballot/
│   ├── results/
│   ├── audit/
│   ├── incidents/
│   └── transparency/
│
├── voting/
│   ├── client/
│   ├── hardware/
│   ├── firmware/
│   └── verification/
│
├── cryptography/
│   ├── protocols/
│   ├── signatures/
│   └── proofs/
│
├── infrastructure/
│   ├── deployment/
│   ├── security/
│   └── monitoring/
│
├── research/
│   ├── threat-model/
│   ├── simulations/
│   ├── audits/
│   └── experiments/
│
└── tests/
    ├── unit/
    ├── integration/
    ├── security/
    └── simulations/

⸻

Development Roadmap

> Progress note (2026-10-03): checked boxes are *research-prototype* done —
> implemented, tested, and drilled in this repo. They are not certifications;
> Phases 5–6 (controlled pilot, independent review) remain fully open.

Phase 0 — Research

* [ ]	Analyze Moroccan election procedures
* [ ]	Analyze applicable legal requirements
* [ ]	Analyze privacy requirements
* [x]	Document threat model
* [ ]	Define security assumptions
* [ ]	Define trust boundaries
* [x]	Define election workflow
* [x]	Define audit requirements
* [x]	Define accessibility requirements

⸻

Phase 1 — Architecture

* [x]	Election core specification
* [x]	Identity/eligibility architecture
* [x]	Anonymous ballot architecture
* [x]	Cryptographic architecture
* [x]	Polling-station architecture
* [x]	Audit architecture
* [x]	Observer architecture
* [x]	Public transparency architecture

⸻

Phase 2 — Prototype

* [x]	Election management API
* [x]	Mock election environment
* [x]	Polling-station simulator
* [x]	Anonymous ballot prototype
* [x]	Result signing
* [x]	Result verification
* [x]	Audit simulator
* [x]	Public results interface

⸻

Phase 3 — Security

* [x]	Threat modeling
* [x]	Dependency auditing
* [ ]	Static analysis
* [ ]	Dynamic analysis
* [x]	Fuzzing
* [ ]	Penetration testing
* [ ]	Cryptographic review
* [ ]	Supply-chain review
* [ ]	Hardware security review

⸻

Phase 4 — Simulation

Run large-scale simulated elections.

Example:

10 polling stations
        ↓
100 polling stations
        ↓
1,000 polling stations
        ↓
10,000+ simulated stations

Test (all drilled in code — `tests/`, `research/simulations/`):

* [x] network failures
* [x] power failures
* [x] corrupted devices
* [x] malicious devices
* [x] duplicate ballots
* [x] missing ballots
* [x] result manipulation
* [x] server failure
* [x] database corruption
* [x] disaster recovery

⸻

Phase 5 — Controlled Pilot

Status: SIMULATION ONLY — no pilot authorized, staffed, or scheduled.
Gated entry criteria (10 → 50 → 200 stations, shadow rules, promotion rule):
`docs/elections/tangier-pilot.md`. Gate 0 (simulation) is partial; Gates 1–3
are fully unmet.

A future pilot could be conducted in a controlled environment, potentially beginning with a limited number of polling stations in Tangier.

The pilot must not be treated as an official election unless and until the appropriate authorities establish a legal framework permitting it.

⸻

Phase 6 — Independent Review

Before any consideration of real deployment:

* independent cybersecurity audit
* independent cryptographic review
* privacy review
* legal review
* accessibility review
* election-procedure review
* hardware review
* supply-chain review
* public documentation
* adversarial testing

⸻

Why Tangier?

Tangier is a useful potential research environment because it combines:

* dense urban areas
* different neighborhood environments
* high population mobility
* tourism
* metropolitan infrastructure
* suburban areas
* surrounding rural communities

A controlled research deployment could therefore test the system under different operational conditions.

Tangier is a proposed research location, not an indication that this project is currently authorized for deployment there.

⸻

Technology Direction

The final technology stack has not been fixed.

Potential technologies include:

Frontend

TypeScript
React
Next.js

Backend

Rust
Go
TypeScript

Security-critical components

Rust
C/C++
Hardened Linux
TPM
Secure Boot

Database

Potential candidates:

PostgreSQL

with additional append-only/audit infrastructure where required.

Infrastructure

The project may evaluate:

Cloud infrastructure
Dedicated infrastructure
Offline infrastructure
Regional infrastructure
Hardware security modules

Technology choices will be driven by security requirements rather than popularity.

⸻

What This Project Will NOT Do

x No remote phone voting in V1

Voting from an uncontrolled personal environment introduces difficult issues involving coercion, device compromise and voter privacy.

⸻

x No “blockchain solves elections” approach

Blockchain does not automatically solve:

* voter authentication
* malware
* compromised devices
* coercion
* physical ballot manipulation
* bad election procedures

Distributed ledgers may be evaluated only where they provide a concrete security or transparency benefit.

⸻

❌ No voter identity → vote database

The system must never intentionally create a searchable mapping between voter identity and political choice.

⸻

❌ No AI-controlled election decisions

AI may identify anomalies.

AI does not determine electoral validity.

⸻

❌ No proprietary cryptography

The project should use established, independently reviewed cryptographic primitives and protocols wherever possible.

⸻

Open Research Questions

Important questions remain unresolved.

Privacy

How can a voter verify ballot inclusion without creating a transferable proof of their political choice?

Cryptography

Which combination of encryption, mixnets, commitments and proofs provides the appropriate balance between security, performance and auditability?

Hardware

What hardware architecture provides the strongest protection while remaining affordable and maintainable?

Offline operation

How can stations operate for extended periods without connectivity while preventing replay or synchronization attacks?

Auditing

What audit methodology provides statistically meaningful confidence while remaining operationally practical?

Accessibility

How can the system provide equal access without compromising ballot secrecy?

Key management

How should national election cryptographic keys be generated, stored, rotated and recovered?

Governance

Who should control each component?

Transparency

What information should be publicly verifiable without exposing personal information?

⸻

Design Philosophy

The system follows a simple principle:

Don’t ask citizens to trust the machine. Give them a way to verify the election.

The architecture therefore attempts to create multiple independent layers:

                ┌─────────────────┐
                │ VOTER           │
                │ VERIFICATION    │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ PAPER RECORD    │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ DIGITAL RECORD  │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ CRYPTOGRAPHIC   │
                │ VERIFICATION    │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ INDEPENDENT     │
                │ AUDIT           │
                └────────┬────────┘
                         │
                ┌────────▼────────┐
                │ PUBLIC          │
                │ TRANSPARENCY    │
                └─────────────────┘

⸻

Security Disclosure

If you discover a security vulnerability, do not open a public GitHub issue containing exploit details.

Please follow the project’s security disclosure process documented in:

SECURITY.md

Security researchers should be given a responsible way to report vulnerabilities privately.

⸻

Contributions

Contributions are welcome for:

* research
* threat modeling
* security analysis
* cryptography research
* accessibility
* software engineering
* hardware research
* election auditing
* documentation
* simulations
* testing

Because this is election-related infrastructure, contributions affecting security-critical components require additional review.

Please read:

CONTRIBUTING.md

before submitting a pull request.

⸻

Development Rules

Security-sensitive code should not be merged solely because it works.

Changes should be evaluated for:

Correctness
Security
Privacy
Auditability
Maintainability
Accessibility
Failure behavior

Critical components should require review by more than one contributor.

⸻

Testing Philosophy

Tests should cover both normal and adversarial behavior.

Examples:

Valid vote
Invalid vote
Duplicate authorization
Duplicate ballot
Missing ballot
Modified ballot
Modified result
Modified firmware
Compromised device
Network failure
Power failure
Server failure
Database corruption
Replay attack
Credential compromise

⸻

Research Ethics

This project concerns democratic infrastructure.

Researchers must not:

* interfere with real elections
* attack real election systems
* collect real voter information
* test against real polling infrastructure without explicit authorization
* attempt to identify individual voters’ political choices
* publish sensitive information that could endanger election security

All security testing should be conducted against controlled environments.

⸻

Disclaimer

This project is an independent research and software-development initiative.

It is not an official project of:

* the Kingdom of Morocco
* the Moroccan Ministry of Interior
* the Moroccan Parliament
* the Constitutional Court
* any Moroccan political party
* any Moroccan electoral authority

Unless explicitly stated otherwise, references to Morocco’s election infrastructure are made for research and design purposes only.

This repository does not constitute legal advice, electoral advice, cybersecurity certification or governmental authorization.

⸻

License

This project is not released under MIT, Apache, GPL, BSD or another standard permissive open-source software license.

The project is distributed under the accompanying:

LICENSE

Permitted

Subject to the LICENSE:

* personal use
* educational use
* academic research
* non-commercial experimentation
* security research
* modification for non-commercial purposes

Restricted

Without separate written permission:

* commercial use
* commercial deployment
* selling the software
* licensing the software commercially
* incorporating the software into a commercial product
* offering the software as a paid service
* commercial election-technology services
* commercial redistribution

Government or public-sector deployment should be governed by a separate written agreement and authorization.

The README summarizes the license. The LICENSE file is the controlling document.

⸻

Roadmap

Research
   │
   ▼
Threat Model
   │
   ▼
Architecture
   │
   ▼
Prototype
   │
   ▼
Simulation
   │
   ▼
Security Testing
   │
   ▼
Independent Review
   │
   ▼
Controlled Pilot
   │
   ▼
Legal / Institutional Review
   │
   ▼
Potential Future Deployment

No stage should be skipped simply to accelerate deployment.

⸻

Project Goals

The long-term research goals are to investigate whether election infrastructure can become:

More verifiable
More transparent
More private
More resilient
More auditable
More accessible
More secure
Less dependent on individual trust

without compromising the fundamental secrecy and integrity of the ballot.

⸻

Final Principle

An election system should not ask people to believe that the result is correct.

It should provide enough independent evidence for people to verify why the result is correct.

⸻

Project

Morocco Verifiable Elections

MVE

🇲🇦 Built as an independent civic-technology research project.

Status: Research / Prototype

License: Personal & Non-Commercialclaim that the system is ready for Moroccan elections. 
