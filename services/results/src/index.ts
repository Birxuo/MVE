import { generateKeyPairSync, sign, verify, createPrivateKey, createPublicKey } from 'node:crypto';
import type { Ballot, ResultPackage } from '../../election-core/src/types.js';
import { canonical, sha256Hex } from '../../election-core/src/crypto-utils.js';

export interface DeviceKeys { deviceId: string; publicKeyPem: string; privateKeyPem: string; }

export function generateDeviceKeys(deviceId: string): DeviceKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    deviceId,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

export function tally(ballots: Ballot[]): { results: Record<string, number>; counted: number } {
  const results: Record<string, number> = {};
  for (const b of ballots) results[b.choiceId] = (results[b.choiceId] ?? 0) + 1;
  return { results, counted: ballots.length };
}

/** Build + sign result package. Mutates copy, returns signed package. */
export function signResult(
  base: Omit<ResultPackage, 'result_hash' | 'signature'>,
  privateKeyPem: string,
): ResultPackage {
  const body = { ...base };
  const result_hash = sha256Hex(canonical(body));
  const sig = sign(null, Buffer.from(result_hash, 'hex'), createPrivateKey(privateKeyPem));
  return { ...body, result_hash, signature: sig.toString('hex') };
}

export function verifyResult(pkg: ResultPackage, publicKeyPem: string): { hashOk: boolean; sigOk: boolean } {
  const { result_hash, signature, ...body } = pkg;
  const recomputed = sha256Hex(canonical(body));
  const hashOk = recomputed === result_hash;
  let sigOk = false;
  try {
    sigOk = verify(
      null, Buffer.from(result_hash ?? '', 'hex'),
      createPublicKey(publicKeyPem), Buffer.from(signature ?? '', 'hex'),
    );
  } catch { sigOk = false; }
  return { hashOk, sigOk };
}

/** Tamper demo helper: changing 201->301 must break hash/sig. */
export function tamper(pkg: ResultPackage, choice: string, votes: number): ResultPackage {
  return { ...pkg, results: { ...pkg.results, [choice]: votes } };
}
