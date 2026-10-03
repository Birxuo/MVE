import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bundleKeys, englishKeys, LOCALES, localeStatus, resolveLocale, t } from '../services/election-core/src/i18n.js';

describe('i18n: bundle parity', () => {
  it('every locale carries exactly the English key set', () => {
    const en = englishKeys();
    assert.ok(en.length >= 15);
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      assert.deepEqual(bundleKeys(locale), en, `locale ${locale}`);
    }
  });

  it('no bundle leaks vote content or identity fields', () => {
    for (const locale of LOCALES) {
      for (const key of englishKeys()) {
        const s = t(locale, key, { station: 'S', n: 1, h: 'abc', id: 'x', receipt: 'y', msg: 'z', entry: 'e' });
        assert.doesNotMatch(s, /party_a|CIN|voterId/i);
      }
    }
  });
});

describe('i18n: fallback and interpolation', () => {
  it('unknown locale falls back to English; missing vars stay visible', () => {
    assert.equal(resolveLocale('xx'), 'en');
    assert.equal(resolveLocale('ar-MA'), 'ar');
    assert.equal(resolveLocale(undefined), 'en');
    assert.equal(t('en', 'no.such.key'), 'no.such.key');
    assert.match(t('ar', 'station.opened', { station: 'S1' }), /S1/);
    assert.match(t('fr', 'vote.spoiled', { msg: 'x' }), /x/);
    assert.notEqual(t('ar', 'station.opened', { station: 'S' }), t('en', 'station.opened', { station: 'S' }));
  });

  it('flags bundle maturity: zgh provisional, rest stable', () => {
    assert.equal(localeStatus('zgh'), 'provisional');
    for (const l of ['en', 'ar', 'fr'] as const) assert.equal(localeStatus(l), 'stable');
  });
});
