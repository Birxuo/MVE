import { randomUUID } from 'node:crypto';
import type { Ballot } from '../../election-core/src/types.js';
import { sha256Hex } from '../../election-core/src/crypto-utils.js';
import type { EligibilityService } from '../../eligibility/src/index.js';

// Ballot store holds NO voterId — enforced by type (see Ballot).
export class BallotService {
  private ballots: Ballot[] = [];
  private seenTokenHash = new Set<string>();

  constructor(private eligibility: EligibilityService) {}

  cast(token: string, stationId: string, choiceId: string, validChoices: Set<string>): Ballot {
    if (!validChoices.has(choiceId)) throw new Error(`invalid choice ${choiceId}`);
    const tokenHash = sha256Hex(token);
    if (this.seenTokenHash.has(tokenHash)) throw new Error('duplicate ballot (token reuse)');
    this.eligibility.consumeToken(token, stationId); // throws on replay/invalid
    const b: Ballot = {
      ballotId: randomUUID(), tokenHash, stationId, choiceId, ts: new Date().toISOString(),
    };
    this.seenTokenHash.add(tokenHash);
    this.ballots.push(b);
    return b;
  }

  forStation(stationId: string): Ballot[] {
    return this.ballots.filter((b) => b.stationId === stationId);
  }

  all(): Ballot[] { return [...this.ballots]; }
}
