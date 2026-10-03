// i18n — voter/officer-facing strings in Arabic, Tamazight, French, English.
// English is the fallback for unknown locales and missing keys.
// The zgh (Tifinagh) bundle is provisional — it needs native-speaker review
// (see docs/accessibility/plan.md) before any real-world use.
// Privacy: bundles carry UI words only — never choices, voter IDs, or hashes.
export const LOCALES = ['en', 'ar', 'fr', 'zgh'] as const;
export type Locale = (typeof LOCALES)[number];

type Dict = Record<string, string>;

const en: Dict = {
  'station.opened': '{station} opened',
  'station.closed': '{station} closed. Counted {n}, hash {h}...',
  'vote.deposited': 'ballot {id} deposited. Participation receipt: {receipt} (keeps no record of your choice)',
  'vote.spoiled': 'SPOILED: {msg}',
  'close.refused': 'CLOSE REFUSED: {msg}',
  'err.missingStation': 'missing --station',
  'err.badEndorse': 'bad --endorse entry {entry} (want officer:sigfile)',
  'usage.open': 'usage: open --station X [--firmware H] --approvals presiding,observer',
  'usage.vote': 'usage: vote --station X --voter V --choice C [--spoil]',
  'usage.close': 'usage: close --station X --approvals presiding,deputy,observer [--endorse officer:sigfile,...]',
  'verify.valid': 'VALID',
  'verify.invalid': 'INVALID',
  'audit.match': 'MATCH',
  'audit.mismatch': 'MISMATCH',
  'status.open': 'open',
  'status.closed': 'closed',
  'dash.title': 'Polling station {station} — {state}',
  'dash.machine': 'Machine: {v}',
  'dash.firmware': 'Firmware: {v}',
  'dash.cert': 'Certificate: {v}',
  'dash.storage': 'Secure storage: {v}',
  'dash.network': 'Network: {v}',
  'dash.observers': 'Accredited observers: {n} ({o} officers)',
  'dash.ballots': 'Ballots — registered {r}, voted {v}, electronic {e}, paper {p}',
  'dash.quorum': 'To open: {o} approvals · To close: {c} approvals',
  'dash.v.ready': 'READY',
  'dash.v.notProvisioned': 'NOT PROVISIONED',
  'dash.v.verified': 'VERIFIED',
  'dash.v.mismatch': 'MISMATCH',
  'dash.v.unapproved': 'UNAPPROVED',
  'dash.v.unregistered': 'NOT REGISTERED',
  'dash.v.certified': 'CERTIFIED',
  'dash.v.uncertified': 'UNCERTIFIED',
  'dash.v.legacy': 'LEGACY (no election root)',
  'dash.v.missing': 'MISSING',
  'dash.v.disconnected': 'DISCONNECTED',
  'incident.open': 'open',
  'incident.triaged': 'triaged',
  'incident.investigating': 'investigating',
  'incident.resolved': 'resolved',
  'incident.dismissed': 'dismissed',
};

const ar: Dict = {
  'station.opened': 'تم فتح مكتب {station}',
  'station.closed': 'تم إغلاق مكتب {station}. تم فرز {n}، البصمة {h}...',
  'vote.deposited': 'تم إيداع الورقة {id}. إيصال المشاركة: {receipt} (لا يحتفظ بأي أثر لاختيارك)',
  'vote.spoiled': 'ملغاة: {msg}',
  'close.refused': 'رُفض الإغلاق: {msg}',
  'err.missingStation': 'المرجو تحديد --station',
  'err.badEndorse': 'مدخل --endorse غير صالح {entry} (المطلوب officer:sigfile)',
  'usage.open': 'الاستعمال: open --station X [--firmware H] --approvals presiding,observer',
  'usage.vote': 'الاستعمال: vote --station X --voter V --choice C [--spoil]',
  'usage.close': 'الاستعمال: close --station X --approvals presiding,deputy,observer [--endorse officer:sigfile,...]',
  'verify.valid': 'صالح',
  'verify.invalid': 'غير صالح',
  'audit.match': 'مطابق',
  'audit.mismatch': 'غير مطابق',
  'status.open': 'مفتوح',
  'status.closed': 'مغلق',
  'dash.title': 'مكتب الاقتراع {station} — {state}',
  'dash.machine': 'الجهاز: {v}',
  'dash.firmware': 'البرنامج الثابت: {v}',
  'dash.cert': 'الشهادة: {v}',
  'dash.storage': 'التخزين الآمن: {v}',
  'dash.network': 'الشبكة: {v}',
  'dash.observers': 'المراقبون المعتمدون: {n} (من أصل {o} من الأعوان)',
  'dash.ballots': 'الأوراق — مسجل {r}، صوّت {v}، إلكتروني {e}، ورقي {p}',
  'dash.quorum': 'للفتح: {o} توقيعات · للإغلاق: {c} توقيعات',
  'dash.v.ready': 'جاهز',
  'dash.v.notProvisioned': 'غير مهيأ',
  'dash.v.verified': 'تم التحقق',
  'dash.v.mismatch': 'عدم تطابق',
  'dash.v.unapproved': 'غير معتمد',
  'dash.v.unregistered': 'غير مسجل',
  'dash.v.certified': 'موثّقة',
  'dash.v.uncertified': 'غير موثّقة',
  'dash.v.legacy': 'قديم (بدون جذر انتخابي)',
  'dash.v.missing': 'مفقود',
  'dash.v.disconnected': 'غير متصلة',
  'incident.open': 'مفتوح',
  'incident.triaged': 'قيد الفرز',
  'incident.investigating': 'قيد التحقيق',
  'incident.resolved': 'محلول',
  'incident.dismissed': 'مرفوض',
};

const fr: Dict = {
  'station.opened': '{station} ouvert',
  'station.closed': '{station} fermé. {n} comptés, empreinte {h}...',
  'vote.deposited': 'bulletin {id} déposé. Reçu de participation : {receipt} (ne garde aucune trace de votre choix)',
  'vote.spoiled': 'ANNULÉ : {msg}',
  'close.refused': 'FERMETURE REFUSÉE : {msg}',
  'err.missingStation': '--station manquant',
  'err.badEndorse': 'entrée --endorse invalide {entry} (officer:sigfile attendu)',
  'usage.open': 'usage : open --station X [--firmware H] --approvals presiding,observer',
  'usage.vote': 'usage : vote --station X --voter V --choice C [--spoil]',
  'usage.close': 'usage : close --station X --approvals presiding,deputy,observer [--endorse officer:sigfile,...]',
  'verify.valid': 'VALIDE',
  'verify.invalid': 'INVALIDE',
  'audit.match': 'CONCORDANT',
  'audit.mismatch': 'NON CONCORDANT',
  'status.open': 'ouvert',
  'status.closed': 'fermé',
  'dash.title': 'Bureau de vote {station} — {state}',
  'dash.machine': 'Machine : {v}',
  'dash.firmware': 'Micrologiciel : {v}',
  'dash.cert': 'Certificat : {v}',
  'dash.storage': 'Stockage sécurisé : {v}',
  'dash.network': 'Réseau : {v}',
  'dash.observers': 'Observateurs accrédités : {n} ({o} agents)',
  'dash.ballots': 'Bulletins — inscrits {r}, votés {v}, électroniques {e}, papier {p}',
  'dash.quorum': 'Ouverture : {o} approbations · Fermeture : {c} approbations',
  'dash.v.ready': 'PRÊT',
  'dash.v.notProvisioned': 'NON PRÉPARÉ',
  'dash.v.verified': 'VÉRIFIÉ',
  'dash.v.mismatch': 'NON CONCORDANT',
  'dash.v.unapproved': 'NON APPROUVÉ',
  'dash.v.unregistered': 'NON ENREGISTRÉ',
  'dash.v.certified': 'CERTIFIÉ',
  'dash.v.uncertified': 'NON CERTIFIÉ',
  'dash.v.legacy': 'HÉRITÉ (pas de clé électorale)',
  'dash.v.missing': 'MANQUANT',
  'dash.v.disconnected': 'DÉCONNECTÉ',
  'incident.open': 'ouvert',
  'incident.triaged': 'trié',
  'incident.investigating': 'enquête en cours',
  'incident.resolved': 'résolu',
  'incident.dismissed': 'rejeté',
};

// Provisional Tamazight (Tifinagh) — native-speaker review required.
const zgh: Dict = {
  'station.opened': 'ⵜⴰⵏⴻⵖⵔⴰⴼⵜ {station} ⵜⴻⵍⴷⵉ',
  'station.closed': 'ⵜⴰⵏⴻⵖⵔⴰⴼⵜ {station} ⵜⴻⵎⴻⴷⴷⴻⵍ. ⵟⵟⵓⵏ ⵉⵜⵡⴰⵃⴻⵙⴱⴻⵏ {n}, ⴰⵣⵎⵓⵍ {h}...',
  'vote.deposited': 'ⵜⴰⴽⴰⵕⴹⴰ {id} ⵜⴻⵜⵜⵡⴰⴹⴻⴼ. ⴰⵎⴰⵡⴰⵍ ⵏ ⵜⴻⴽⴽⵉ: {receipt} (ⵓⵔ ⵉⵜⵜⴰⵃⴼⴰⵥ ⴰⵎ ⵓⵖⴻⵜⵜⴰⵙ ⵏⵏⴻⴽ)',
  'vote.spoiled': 'ⵜⴻⵜⵜⵡⴰⴳ ⵓⴳⴰⴷ: {msg}',
  'close.refused': 'ⵜⵓⴳⴳⴰ ⵜⴻⵎⴻⴷⴷⴻⵍⵜ: {msg}',
  'err.missingStation': 'ⵙⴻⴼⴽⴻⴷ --station',
  'err.badEndorse': 'ⴰⵏⴻⵔⵎⴰⴷ --endorse ⵎⴻⵛⵟⵓⵃ {entry} (ⵉⵅⴻⵚ officer:sigfile)',
  'usage.open': 'ⴰⵙⴻⵇⴷⴻⵛ: open --station X [--firmware H] --approvals presiding,observer',
  'usage.vote': 'ⴰⵙⴻⵇⴷⴻⵛ: vote --station X --voter V --choice C [--spoil]',
  'usage.close': 'ⴰⵙⴻⵇⴷⴻⵛ: close --station X --approvals presiding,deputy,observer [--endorse officer:sigfile,...]',
  'verify.valid': 'ⵉⵣⴷⴻⴳ',
  'verify.invalid': 'ⵓⵔ ⵉⵣⴷⵉⴳ ⴰⵔⴰ',
  'audit.match': 'ⵉⵎⵙⴰⵙⵙⴰ',
  'audit.mismatch': 'ⵓⵔ ⵉⵎⵙⴰⵙⵙⴰ ⴰⵔⴰ',
  'status.open': 'ⵢⴻⵍⴷⵉ',
  'status.closed': 'ⵢⴻⵎⴻⴷⴷⴻⵍ',
  'dash.title': 'ⵜⴰⵏⴻⵖⵔⴰⴼⵜ ⵏ ⵓⵙⵜⴻⵎ {station} — {state}',
  'dash.machine': 'ⴰⵎⴰⴽⴰⵏ: {v}',
  'dash.firmware': 'ⴰⵀⵉⵍ ⵏ ⵓⵙⴻⵍⴽⴻⵏ: {v}',
  'dash.cert': 'ⴰⵙⴻⵍⴽⴻⵏ: {v}',
  'dash.storage': 'ⴰⵃⵔⴰⵣ ⵓⵎⵏⵉⵏ: {v}',
  'dash.network': 'ⴰⵣⴻⵜⵜⴰ: {v}',
  'dash.observers': 'ⵉⵎⴻⵖⵏⴰⵙⴻⵏ ⵉⵜⵡⴰⵙⴻⵏⴷⴻⵏ: {n} (ⴷⴻⴳ {o} ⵢⴻⵎⵙⴻⵅⴷⴰⵎⴻⵏ)',
  'dash.ballots': 'ⵜⵉⴽⴰⵕⴹⵉⵡⵉⵏ — ⵉⵜⵡⴰⵙⴻⵊⵍⴻⵏ {r}, ⵙⴻⵡⵜⴻⵏ {v}, ⵜⵉⵍⵉⴽⵟⵔⵓⵏⵉⵢⵉⵏ {e}, ⵏ ⵍⴽⴰⵖⴻⴹ {p}',
  'dash.quorum': 'ⵉ ⵓⵍⴷⴰⵢ: {o} ⵉⵙⵓⵜⴻⵏ · ⵉ ⵜⵎⴻⴷⴷⴻⵍⵜ: {c} ⵉⵙⵓⵜⴻⵏ',
  'dash.v.ready': 'ⵉⵀⴻⴳⴳⴰ',
  'dash.v.notProvisioned': 'ⵓⵔ ⵉⵜⵜⵡⴰⵀⴻⴳⴳⴰ ⴰⵔⴰ',
  'dash.v.verified': 'ⵉⵜⵜⵡⴰⵙⴻⵏⴷⴻⵇ',
  'dash.v.mismatch': 'ⵓⵔ ⵉⵎⵙⴰⵙⵙⴰ ⴰⵔⴰ',
  'dash.v.unapproved': 'ⵓⵔ ⵉⵜⵜⵡⴰⵙⴻⵏⴷⴻⴳ ⴰⵔⴰ',
  'dash.v.unregistered': 'ⵓⵔ ⵉⵜⵜⵡⴰⵙⴻⵊⵍ ⴰⵔⴰ',
  'dash.v.certified': 'ⵉⵜⵜⵡⴰⵙⴻⵍⴽⴻⵏ',
  'dash.v.uncertified': 'ⵓⵔ ⵉⵜⵜⵡⴰⵙⴻⵍⴽⴻⵏ ⴰⵔⴰ',
  'dash.v.legacy': 'ⴰⵇⴷⵉⵎ (ⵓⵔ ⵉⵍⵍⵉ ⵓⵣⴰⵔ)',
  'dash.v.missing': 'ⵓⵔ ⵉⵍⵍⵉ ⴰⵔⴰ',
  'dash.v.disconnected': 'ⵓⵔ ⵉⵕⵛⴻⵎ ⴰⵔⴰ',
  'incident.open': 'ⵢⴻⵍⴷⵉ',
  'incident.triaged': 'ⵉⵜⵜⵡⴰⴼⴻⵔⵏⴻⵢ',
  'incident.investigating': 'ⴰⵏⴰⴷⵉ ⴷⴻⴳ ⵓⵙⵜⴻⵇⵙⵉ',
  'incident.resolved': 'ⵉⵜⵜⵡⴰⴼⵔⵓ',
  'incident.dismissed': 'ⵉⵜⵜⵡⴰⴳ ⵓⴳⴰⴷ',
};

const BUNDLES: Record<Locale, Dict> = { en, ar, fr, zgh };

export function resolveLocale(input: string | true | undefined): Locale {
  const v = String(input ?? process.env.MVE_LANG ?? 'en').toLowerCase();
  const short = v.split(/[-_]/)[0];
  return (LOCALES as readonly string[]).includes(short) ? (short as Locale) : 'en';
}

/** Translate with {var} interpolation; falls back to English, then the key. */
export function t(locale: Locale, key: string, vars: Record<string, string | number> = {}): string {
  const template = BUNDLES[locale]?.[key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Every non-English bundle must carry exactly the English key set. */
export function bundleKeys(locale: Locale): string[] {
  return Object.keys(BUNDLES[locale] ?? {}).sort();
}

export function englishKeys(): string[] {
  return Object.keys(en).sort();
}
