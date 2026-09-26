import type { Voter } from '../../election-core/src/types.js';
import { randomToken, sha256Hex } from '../../election-core/src/crypto-utils.js';

// In-memory identity store (prototype). Prod: isolated Postgres schema.
export class EligibilityService {
  private voters = new Map<string, Voter>();
  // tokenHash -> issuedAt (single-use). No voter link stored alongside ballot.
  private issuedTokens = new Map<string, { stationId: string; consumed: boolean }>();

  register(v: Voter): void {
    this.voters.set(v.voterId, { ...v });
  }

  /** Returns anonymous single-use token, marks voter VOTED. Throws on double-vote. */
  authorize(voterId: string): { token: string; stationId: string } {
    const v = this.voters.get(voterId);
    if (!v) throw new Error(`unknown voter ${voterId}`);
    if (!v.eligible) throw new Error(`ineligible voter ${voterId}`);
    if (v.status === 'VOTED') throw new Error(`double vote blocked for ${voterId}`);
    v.status = 'VOTED';
    const token = randomToken();
    this.issuedTokens.set(sha256Hex(token), { stationId: v.stationId, consumed: false });
    return { token, stationId: v.stationId };
  }

  consumeToken(token: string, expectedStation: string): void {
    const h = sha256Hex(token);
    const rec = this.issuedTokens.get(h);
    if (!rec) throw new Error('invalid voting token');
    if (rec.consumed) throw new Error('token already consumed (replay blocked)');
    if (rec.stationId !== expectedStation) throw new Error('token station mismatch');
    rec.consumed = true;
  }

  stats(): { registered: number; voted: number } {
    let voted = 0;
    for (const v of this.voters.values()) if (v.status === 'VOTED') voted++;
    return { registered: this.voters.size, voted };
  }
}
