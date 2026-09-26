Yes. If the objective is to modernize Morocco’s elections and reduce opportunities for fraud, vote-buying, intimidation, ballot manipulation, and opaque counting, I would not start by simply replacing paper ballots with an app.

I would design a verifiable national election infrastructure where digital technology makes manipulation harder while preserving a voter-verifiable paper audit trail.

This is especially relevant in Tangier right now: Morocco’s 2026 legislative election was held on 23 September 2026, and reporting this week described a controversy at a polling station in Tangier-Asilah involving an alleged ballot-box irregularity. At the same time, the Ministry of Interior characterized the national process as generally normal apart from isolated incidents. 

Morocco already has important digital pieces: the official electoral-list portal allows citizens to verify registration and polling-office information, and the 2026 election process already used electronic platforms for some administrative procedures. 

1. The system I would build

Call it something like Morocco Verifiable Elections — MVE.

The fundamental principle:

Digital for identification, administration, transmission and verification. Paper or another voter-verifiable independent record for the final audit.

Not:

“Trust the government server.”

And not:

“Trust the voting machine.”

Instead:

Every important election event should produce independently verifiable evidence.

⸻

2. Architecture

I’d divide it into 9 independent systems.

A. National Electoral Register

Central authoritative register containing:

* voter registration status
* electoral district
* polling station
* voter eligibility
* administrative identifiers

But the voting system should not expose political preferences.

The system must make it mathematically impossible for:

Voter identity → candidate selected

to be reconstructed.

That’s absolutely fundamental.

⸻

B. Voter Verification

At the polling station:

1. Citizen arrives.
2. Presents national identity document.
3. Election officer verifies eligibility.
4. System confirms:
    * registered
    * correct district
    * has not already voted
5. Voter receives authorization to vote.

The identity system and ballot system should be cryptographically separated.

For example:

VOTER DATABASE
      │
      │ eligibility confirmation
      ▼
VOTING AUTHORIZATION
      │
      │ anonymous token
      ▼
BALLOT SYSTEM
      │
      ▼
VOTE

The ballot system should never receive:

CIN = XXXXXXXXX
Vote = Candidate Y

Instead:

Anonymous voting token
        ↓
Valid ballot
        ↓
Encrypted vote

⸻

3. Do NOT eliminate paper initially

This is probably the most important design decision.

A purely electronic voting system creates a different problem:

How does the citizen independently know the machine recorded the vote correctly?

So I would use:

Electronic ballot + physical voter-verifiable record.

Example:

The voter selects:

Party / candidate

The machine produces a paper ballot showing the selection.

The voter checks it.

Then:

Voter → confirms → paper goes into sealed ballot box

The electronic system also records the encrypted vote.

At the end:

Electronic result
       +
Paper result
       +
Cryptographic audit
       =
Official result

If they disagree beyond an established tolerance, automatically trigger a recount/audit.

⸻

4. Why this matters in Tangier

The current controversy illustrates why the system should preserve an independent physical record rather than relying exclusively on a digital database.

The 2026 Tangier-Asilah incident has been reported as involving an alleged ballot-box manipulation at École Al-Qods in Casabarata. Authorities’ characterization of the wider election was different, describing the incident as isolated rather than systemic. 

A properly designed system would make an incident much easier to investigate because you could reconstruct:

Polling station
       ↓
Machine ID
       ↓
Officer authentication
       ↓
Opening event
       ↓
Ballot issuance
       ↓
Vote
       ↓
Ballot deposited
       ↓
Scanner event
       ↓
Closing event
       ↓
Result
       ↓
Transmission

without revealing who voted for whom.

⸻

5. Every election machine gets a cryptographic identity

Each voting device gets:

DEVICE_ID
PUBLIC_KEY
CERTIFICATE
FIRMWARE_HASH
POLLING_STATION_ID

Before election day:

Firmware
   ↓
Hash
   ↓
Independent verification
   ↓
Signed release

The machine refuses to operate if the firmware has changed.

This prevents someone from secretly installing:

modified-voting-software.exe

the night before the election.

⸻

6. Secure boot

Voting machines should use:

* Secure Boot
* TPM
* signed firmware
* encrypted storage
* no normal USB access
* disabled Wi-Fi unless specifically required
* disabled Bluetooth
* restricted administrative interfaces
* hardware tamper detection
* cryptographic logging

And importantly:

the election machine should not be a normal Windows PC.

Use a minimal hardened operating environment.

⸻

7. No permanent Internet connection

I would actually avoid having voting machines continuously connected to the Internet.

Instead:

During voting

OFFLINE

After polls close

Results are encrypted and signed.

Then transferred through a controlled transmission system.

For example:

Voting machine
       ↓
Encrypted result package
       ↓
Election transmission terminal
       ↓
National election network

And the original machine retains the signed result.

⸻

8. Multiple independent result channels

This is where the system becomes much stronger.

Suppose Tangier has:

Polling station 0001

At closing, generate:

RESULT PACKAGE
Station: 0001
Machine: M-001
Election: 2026-L
Ballots: 487
Candidate A: 201
Candidate B: 176
Candidate C: 110
Invalid: 0

Then cryptographically sign it.

The package gets:

SHA-256 hash
+
digital signature
+
timestamp

Now publish the hash.

If somebody changes:

201 → 301

the hash changes.

⸻

9. Public election ledger

This is where your idea gets really interesting.

I would create a public append-only election transparency ledger.

Not a blockchain for the sake of saying “blockchain.”

You don’t need cryptocurrency.

You need tamper-evident publication.

For every polling station:

Station ID
Opening status
Machine ID hash
Ballots issued
Ballots cast
Invalid ballots
Final totals
Result hash
Observer signatures
Audit status

Publicly accessible.

Example:

elections.ma/results
TANGIER-ASILAH
Station 010283
Registered:      612
Ballots issued:  487
Ballots counted: 487
Party A          201
Party B          176
Party C          110
Result hash:
8A7F...91C
Audit:
PASSED

Anyone could download the dataset.

⸻

10. Citizen verification

This could become one of the strongest features.

After voting, the citizen receives a receipt confirming participation, but NOT their vote.

For example:

Your vote has been accepted.
Election: 2026
Station: 010283
Verification code:
7K9M-42PX
Keep this code.

But there is a crucial cryptographic requirement:

The code must not allow the voter to prove to someone else which candidate they selected.

Otherwise vote buying becomes easier.

The voter should be able to verify:

“My ballot was included.”

but not:

“Here is proof that I voted for Candidate X.”

That distinction is essential.

⸻

11. Preventing vote buying

Digital elections cannot solve vote buying by themselves.

You need an anti-coercion architecture.

The system should make it impossible to generate a receipt saying:

“Bilal voted for Party X.”

Instead:

Participation proof
       ≠
Vote proof

That means someone cannot say:

“I’ll give you 500 DH if you send me proof you voted for X.”

There is no cryptographic proof available to sell.

⸻

12. Preventing double voting

The election authorization system maintains:

Voter
   ↓
Eligibility
   ↓
Vote authorization issued
   ↓
Authorization consumed

After the first valid ballot:

STATUS = VOTED

The voter cannot receive another authorization.

But again:

the voting record must not reveal the vote.

⸻

13. Polling-station dashboard

Election officers get a dedicated interface.

Before opening

Station: Tanger 010283
Machine: READY
Firmware: VERIFIED
Ballot inventory: VERIFIED
Secure storage: VERIFIED
Network: DISCONNECTED
Observers: 4

Then:

Open polls

Requires multiple authorized people.

For example:

Presiding Officer
+
Party representative
+
Independent observer

Each authenticates.

The station becomes:

OPEN

This is much better than allowing one person to control everything.

⸻

14. Multi-person control

This is critical for corruption prevention.

Sensitive operations should require 2-of-3 or 3-of-5 authorization.

For example:

Opening polling station

2 signatures required.

Closing polling station

3 signatures required.

Exporting results

2 signatures required.

Modifying election configuration

3 signatures required.

Recount authorization

independent authority required.

Therefore:

One corrupt official cannot silently change the election.

⸻

15. Immutable audit logs

Every sensitive action generates an event:

2026-09-23 07:01
OFFICER_LOGIN
2026-09-23 07:04
POLL_OPENED
2026-09-23 08:31
BALLOT_000001
2026-09-23 08:32
BALLOT_000002
...
2026-09-23 19:01
POLL_CLOSED
2026-09-23 19:05
RESULT_GENERATED
2026-09-23 19:06
RESULT_SIGNED
2026-09-23 19:07
RESULT_TRANSMITTED

Logs should be:

* append-only
* cryptographically chained
* independently replicated

⸻

16. Independent observers

Create an Observer Portal.

Authorized observers can see:

Polling station
        ↓
Opening
        ↓
Voting period
        ↓
Closing
        ↓
Counting
        ↓
Transmission

They shouldn’t have unrestricted access to voter personal data.

They should be able to report:

Incident

Station: 010283
Category:
☑ intimidation
☐ ballot issue
☐ machine failure
☐ officer issue
☐ counting discrepancy
Evidence:
Photo/video/document
Timestamp:
19:42
Submitted by:
Observer ID

Then the incident receives a case number.

⸻

17. Citizen incident reporting

Create:

Report an Election Issue

Available through:

* web
* mobile
* SMS
* hotline
* polling station QR

But do not allow anonymous accusations to automatically modify results.

Instead:

Citizen report
      ↓
Case management
      ↓
Evidence
      ↓
Investigation
      ↓
Decision

This prevents the reporting system itself becoming an attack vector.

⸻

18. AI should NOT decide election disputes

You can use AI for:

* duplicate detection
* anomaly detection
* document classification
* translation
* OCR
* identifying suspicious statistical patterns

But:

AI should never decide that an election was fraudulent.

Instead:

AI detects anomaly
       ↓
Human investigators
       ↓
Evidence
       ↓
Legal process
       ↓
Decision

⸻

19. Fraud/anomaly detection

This is where the digital system can be extremely powerful.

For every station calculate:

turnout
invalid-ballot percentage
ballots issued
ballots counted
opening/closing times
machine events
result transmission timing
observer reports
recount discrepancies

Then detect unusual patterns.

Example:

Station A
Turnout: 54%
Station B
Turnout: 57%
Station C
Turnout: 56%
Station D
Turnout: 98%

That doesn’t mean fraud.

It means:

Investigate Station D.

This distinction is extremely important.

⸻

20. Physical ballot reconciliation

At closing:

Registered voters
        ↓
Ballots authorized
        ↓
Ballots cast
        ↓
Paper ballots
        ↓
Electronic ballots

They should reconcile.

For example:

Authorized: 512
Electronic votes: 509
Paper ballots: 509
Unused ballots: 103

Everything makes sense.

But:

Authorized: 512
Electronic: 509
Paper: 495

→ automatic exception.

⸻

21. Risk-limiting audits

This is probably the most important election-security mechanism after the paper record.

Don’t manually recount every station.

Instead, randomly select polling stations for audit.

For example:

100% electronic count
        ↓
Random statistical sample
        ↓
Physical paper verification
        ↓
Compare
        ↓
If discrepancy:
expanded audit
        ↓
possibly full recount

The sample size and escalation rules should be determined before the election, not after seeing the results.

That prevents selective auditing.

⸻

22. Tangier pilot

I would not deploy nationally first.

Start with:

Phase 1 — Tangier pilot

Choose several different environments:

* urban Tangier
* dense neighborhoods
* suburban areas
* rural/remote areas
* high-turnout stations
* low-turnout stations

Run the technology alongside the existing process.

Not as the legally decisive election initially.

⸻

23. Pilot architecture

For example:

               NATIONAL TEST ENVIRONMENT
                       │
                       ▼
              ┌─────────────────┐
              │ Election Server │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Tangier       Tangier      Tangier
       Station A     Station B    Station C
          │            │            │
       Machine       Machine      Machine
          │            │            │
       Scanner       Scanner      Scanner
          │            │            │
          └────────────┼────────────┘
                       ▼
               Audit Infrastructure

⸻

24. Technology stack

Given the type of systems you’ve been building, I’d separate the architecture heavily.

Frontend

Citizen:

Next.js / TypeScript

Admin:

React / TypeScript

Mobile:

Flutter

But polling-station voting software should not depend on a browser.

⸻

Voting machine

I’d use:

Rust
+
Linux
+
secure boot
+
TPM

or:

C++
+
hardened Linux

Rust would be attractive for new security-critical components because memory-safety bugs are a major class of vulnerabilities.

⸻

25. Backend

Potential architecture:

API Gateway
      │
      ├── Election Registry
      ├── Voter Eligibility
      ├── Polling Stations
      ├── Candidate Registry
      ├── Ballot Service
      ├── Result Service
      ├── Audit Service
      ├── Observer Service
      ├── Incident Service
      └── Transparency Service

⸻

26. Database architecture

Don’t put everything into one database.

Use separation.

Identity DB

voter_id
registration
district
eligibility

Election DB

election
district
polling_station
candidates

Voting DB

anonymous_ballot_id
encrypted_vote
timestamp
station

Audit DB

event_id
device
event
signature
timestamp

Public transparency DB

Only sanitized/public information.

⸻

27. Cryptography

I’d use modern standard cryptography rather than inventing your own.

For example:

Ed25519
SHA-256 / SHA-3
AES-256
TLS 1.3
X25519

For stronger election privacy:

Homomorphic encryption / mixnets

Potentially allow:

encrypted votes
       ↓
aggregation
       ↓
result

without decrypting every individual vote.

But don’t make advanced cryptography a prerequisite for version 1.

The first system needs to be auditable and understandable.

⸻

28. Zero-knowledge proofs

This is where a future version could become extremely powerful.

You could prove:

The published result was generated from the set of valid encrypted ballots.

without revealing individual votes.

Conceptually:

Encrypted ballots
       ↓
Cryptographic computation
       ↓
Result
       +
Zero-knowledge proof
       ↓
Anyone can verify

This would make the public transparency layer much stronger.

⸻

29. Public source code

For election-critical software, I would strongly consider making the source code publicly auditable.

Not necessarily every government infrastructure secret.

But:

Voting client
Cryptographic protocol
Result verification software
Audit software
Public verification tools

should be open to independent examination.

A national election shouldn’t rely on:

“Trust our proprietary algorithm.”

⸻

30. Independent security testing

Before deployment:

Red team

Try to:

* alter votes
* duplicate votes
* erase votes
* modify firmware
* impersonate officers
* steal credentials
* manipulate results
* compromise servers
* attack networks
* compromise physical machines

Then publish the findings and fixes.

⸻

31. Bug bounty

Create a national election security bounty.

Example:

Critical vulnerability
→ 100,000 DH
High
→ 50,000 DH
Medium
→ 15,000 DH
Low
→ 2,000 DH

Exact amounts would depend on government policy.

But researchers worldwide should be encouraged to attack the system before criminals do.

⸻

32. Disaster recovery

Assume:

The central election server is destroyed.

The election must continue.

Therefore:

Tangier
   ↓
Regional data center
Rabat
   ↓
National data center
Backup
   ↓
Offline archival storage

Three independent copies.

But again, copies should be cryptographically linked.

⸻

33. Internet outage

A polling station must continue working without Internet.

Internet = DOWN
Voting = CONTINUES

This is essential for Morocco’s geography.

The machine can synchronize later.

⸻

34. Electricity failure

Every polling station needs:

* UPS
* battery
* optional generator
* offline operation

A power outage cannot stop voting.

⸻

35. Cyberattack

Suppose someone attacks the national server.

The system should still have:

Local signed results
+
Paper ballots
+
Independent observer records
+
Cryptographic hashes

Therefore:

Cyberattack ≠ ability to rewrite election results.

⸻

36. Privacy architecture

This is particularly important in Morocco.

Morocco’s Law 09-08 regulates personal-data processing, and CNDP explicitly identifies political opinions as sensitive personal data. CNDP’s current election guidance says election-related processing must comply with Law 09-08, respect purpose limitation and retention, and requires authorization for sensitive data, CIN numbers, and certain data interconnections. 

Therefore:

Never create:

CIN
   ↓
Candidate voted for

Even administrators shouldn’t be able to query that relationship.

⸻

37. Biometrics

You could use:

* fingerprint
* facial recognition
* ID verification

but I would not make biometric voting mandatory in V1.

Biometric data introduces additional privacy and security risks, and CNDP specifically treats biometric processing as regulated personal-data processing. 

Use the minimum data necessary.

⸻

38. Legal layer

Technology is only ~50% of this project.

You need legislation covering:

Digital ballot validity

Electronic signatures

Digital election records

Audit requirements

Cybersecurity standards

Observer access

Public result publication

Recount procedures

Machine certification

Software certification

Incident response

Evidence preservation

Criminal penalties

Data protection

Accessibility

⸻

39. Institutional separation

I would avoid giving one institution complete control.

For example:

Election Authority
      │
      ├── Election administration
      │
Independent Cybersecurity Authority
      │
      ├── Security certification
      │
CNDP
      │
      ├── Privacy oversight
      │
Courts
      │
      ├── Electoral disputes
      │
Independent Observers
      │
      └── Monitoring

The Constitution already establishes elections as free, sincere and transparent and provides for independent observation, while assigning electoral organization to the relevant authorities under law. 

⸻

40. Public transparency portal

Build something similar in spirit to:

elections.ma

but much deeper.

Homepage

2026 LEGISLATIVE ELECTION
Participation
38.02%
Polling stations
████████████████
Results
LIVE / VERIFIED
Audit status
████████████

Morocco’s official 2026 election information already reports national participation and publishes the election framework, including 395 seats and 27 participating parties. 

⸻

41. Public API

This is extremely important.

Provide:

GET /elections
GET /districts
GET /polling-stations
GET /results
GET /audits
GET /incidents
GET /transparency

Researchers could build:

* election maps
* statistical analysis
* independent dashboards
* media applications
* academic studies

No need for everyone to trust the government’s frontend.

⸻

42. Open election dataset

After the election:

results.csv
stations.csv
districts.csv
audit-results.csv
incidents.csv

with personal information removed.

Researchers can independently reproduce the published totals.

⸻

43. Accessibility

The system must support:

🇲🇦 Arabic
🇲🇦 Amazigh
🇫🇷 French

And accessibility features:

* large text
* screen reader
* high contrast
* audio instructions
* wheelchair-accessible stations
* assisted voting procedures

⸻

44. What the citizen experience should look like

Very simple.

Before election

Check my registration
        ↓
Find my polling station
        ↓
View election information

Election day

Arrive
 ↓
Verify identity
 ↓
Receive ballot authorization
 ↓
Vote privately
 ↓
Verify paper record
 ↓
Deposit ballot
 ↓
Receive participation confirmation

After election

Check result
 ↓
Check polling station
 ↓
Check audit status
 ↓
Verify published result

⸻

45. The anti-corruption model

I’d design the system around six independent barriers:

             CORRUPTION / FRAUD
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
   Identity       Ballot       Physical
   controls       privacy      record
       │             │             │
       └─────────────┼─────────────┘
                     ▼
                Audit system
                     │
              ┌──────┴──────┐
              ▼             ▼
        Cryptographic     Independent
        verification      observers

A corrupt actor would need to defeat multiple independent systems, rather than simply manipulating a box of paper.

⸻

46. Development roadmap

Phase 0 — Research

3 months

Study:

* Moroccan electoral law
* Constitution
* CNDP requirements
* existing election infrastructure
* polling-station procedures
* accessibility
* cybersecurity
* international election technology standards

Output:

Technical + legal specification.

⸻

Phase 1 — Prototype

3–6 months

Build:

Election backend
+
Voting machine prototype
+
Paper verification
+
Observer portal
+
Public results portal
+
Audit engine

No real election data.

⸻

Phase 2 — Security testing

3 months

Red-team everything.

Try:

vote manipulation
identity attacks
insider attacks
network attacks
physical attacks
database attacks
supply-chain attacks

⸻

Phase 3 — Tangier controlled pilot

6–12 months

Run simulated elections.

For example:

10 stations
→ 50 stations
→ 200 stations

Compare:

electronic results
vs
paper results
vs
manual count

⸻

47. Phase 4 — Shadow election

The system operates during an actual election but does not determine the legal result.

You compare:

Existing official process
           VS
Digital verification system

This gives you real operational data without making the first deployment responsible for the legal outcome.

⸻

48. Phase 5 — Legal pilot

Once independently audited:

Tangier
        ↓
selected districts
        ↓
legally recognized electronic component

while retaining physical auditability.

⸻

49. Phase 6 — National deployment

Only after:

* multiple successful pilots
* independent security audits
* legal authorization
* public testing
* observer acceptance
* accessibility testing
* disaster recovery tests
* successful recount exercises

Then expand nationally.

⸻

50. What I would NOT build

I would explicitly reject:

❌ “Vote from your phone”

Too many unresolved coercion and device-security problems for a first national system.

❌ Fully online election

A citizen voting from an uncontrolled environment can be coerced.

❌ Blockchain-only election

Blockchain doesn’t magically solve:

* voter authentication
* malware
* coercion
* compromised devices
* physical attacks
* bad election procedures

❌ Facial recognition everywhere

Unnecessary privacy risk.

❌ Central database containing votes + identities

Fundamentally bad architecture.

❌ Closed-source black-box voting

Poor independent verification.

❌ AI deciding fraud

AI should flag anomalies, not adjudicate elections.

⸻

51. The most important principle

If your actual goal is reducing corruption, don’t build:

“A digital version of the current paper election.”

Build:

A publicly auditable election system in which no single person, machine, database, party, administrator, or software vendor can independently change the outcome without detection.

That’s a much stronger objective.

⸻

52. Proposed complete architecture

                    ┌──────────────────────┐
                    │   PUBLIC PORTAL      │
                    │ results / audits /   │
                    │ statistics / API     │
                    └──────────┬───────────┘
                               │
                               ▼
                 ┌─────────────────────────┐
                 │ TRANSPARENCY LEDGER     │
                 │ hashes / signatures /   │
                 │ public election records │
                 └────────────┬────────────┘
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
       ┌────────────────┐          ┌────────────────┐
       │ RESULT SYSTEM  │          │ AUDIT SYSTEM   │
       └───────┬────────┘          └───────┬────────┘
               │                           │
               └────────────┬──────────────┘
                            ▼
                  ┌──────────────────┐
                  │ ELECTION CORE    │
                  │ districts        │
                  │ stations          │
                  │ eligibility       │
                  └────────┬─────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     Tangier A         Tangier B        Tangier C
          │                │                │
     ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
     │ VOTING  │      │ VOTING  │      │ VOTING  │
     │ MACHINE │      │ MACHINE │      │ MACHINE │
     └────┬────┘      └────┬────┘      └────┬────┘
          │                │                │
          ▼                ▼                ▼
      PAPER           PAPER            PAPER
      BALLOT          BALLOT           BALLOT
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                    PHYSICAL AUDIT

And I’d make one rule non-negotiable:

The electronic result can never be the only evidence of the election.

That gives Morocco a path from today’s paper system toward a modern digital system without replacing one trust problem with another.

One other important point: the project would need to be developed as a civic/technical proposal, not as a tool for helping one party or candidate. The constitutional framework explicitly treats free, sincere and transparent elections as foundational and provides for neutral observation. 

If this were being turned into a real engineering project, the next document I’d produce would be a full technical specification: database schema, cryptographic protocol, polling-station hardware, API endpoints, threat model, zero-trust architecture, audit algorithm, election-day workflow, and a Tangier pilot deployment plan.