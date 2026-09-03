import type { LeadInsertRow } from "@/lib/ingest/parse";
import { CAMPAIGNS, DAYS, type CampaignConfig } from "./config";

export const SAMPLE_SEED = 20260702;
export const SAMPLE_DATASET_NAME = "Sample media buys — last 30 days";
const CANONICAL_ANCHOR = new Date("2026-06-30T00:00:00Z");

/** Anchor for app usage: midnight UTC today, so the window is the last 30 full days. */
export function defaultAnchor(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Tiny deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "ava", "ben", "carla", "dan", "elena", "felix", "gina", "hugo", "iris",
  "jonas", "kara", "liam", "mara", "nate", "oliv", "priya", "quinn", "rosa",
  "sam", "tina", "umar", "vera", "wes", "yara",
];
const LAST = [
  "adams", "brooks", "chen", "diaz", "evans", "fischer", "garcia", "hall",
  "ito", "jones", "kim", "lopez", "moore", "nolan", "ortiz", "patel",
  "quist", "reyes", "silva", "tran", "usman", "vogel", "walsh", "young",
];
const DOMAINS = [
  "gmail.com", "gmail.com", "gmail.com", "yahoo.com", "outlook.com",
  "icloud.com", "protonmail.com", "companymail.com", "worklane.io",
];
const DISPOSABLES = [
  "mailinator.com", "tempmail.com", "yopmail.com", "guerrillamail.com",
  "sharklasers.com", "getnada.com",
];
const BAD_PHONES = ["555-0100", "0000000000", "123456", "n/a", "+1999999", ""];
const AREA_CODES = ["415", "510", "628", "206", "303", "512", "917", "702"];

function box(rng: () => number, mean: number, std: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + std * z;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

interface GenState {
  rng: () => number;
  emailCounter: number;
  phoneCounter: number;
  externalCounter: number;
}

function freshEmail(state: GenState, domain: string): string {
  state.emailCounter++;
  const name = `${pick(state.rng, FIRST)}.${pick(state.rng, LAST)}${state.emailCounter}`;
  return `${name}@${domain}`;
}

function freshPhone(state: GenState): string {
  const c = state.phoneCounter++;
  const area = AREA_CODES[Math.floor(c / 10000) % AREA_CODES.length];
  const line = String(c % 10000).padStart(4, "0");
  return `+1${area}555${line}`;
}

function activeLandingPages(config: CampaignConfig, day: number) {
  return config.landingPages.filter(
    (lp) => day >= (lp.fromDay ?? 0) && day <= (lp.toDay ?? DAYS - 1),
  );
}

/**
 * Generate the deterministic sample dataset: same seed + anchor → identical
 * output. `anchor` is the exclusive end of the 30-day window.
 */
export function generateSampleLeads(
  seed: number,
  anchor: Date,
): LeadInsertRow[] {
  const offsetMs = anchor.getTime() - CANONICAL_ANCHOR.getTime();
  return generateCanonicalScenario(seed).map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt.getTime() + offsetMs),
  }));
}

/**
 * Generate the canonical business scenario independent of the requested
 * presentation date. Callers receive timestamp-shifted copies above.
 */
function generateCanonicalScenario(seed: number): LeadInsertRow[] {
  const state: GenState = {
    rng: mulberry32(seed),
    emailCounter: 0,
    phoneCounter: 1000,
    externalCounter: 0,
  };
  const { rng } = state;
  const windowStart = CANONICAL_ANCHOR.getTime() - DAYS * 86_400_000;
  const rows: LeadInsertRow[] = [];

  for (const config of Object.values(CAMPAIGNS)) {
    // Pool of reusable identities for duplicate generation.
    const identityPool: Array<{ email: string | null; phone: string | null }> =
      [];

    for (let day = 0; day < DAYS; day++) {
      const dayStart = windowStart + day * 86_400_000;
      const weekday = new Date(dayStart).getUTCDay();
      const isWeekend = weekday === 0 || weekday === 6;
      const volume = Math.max(
        1,
        Math.round(
          config.dailyBase *
            (isWeekend ? config.weekendFactor : 1) *
            (0.85 + rng() * 0.3),
        ),
      );

      const lps = activeLandingPages(config, day);
      const totalShare = lps.reduce((acc, lp) => acc + lp.share, 0);

      for (let n = 0; n < volume; n++) {
        // Landing page pick (weighted among active pages).
        let draw = rng() * totalShare;
        let lp = lps[0];
        for (const candidate of lps) {
          draw -= candidate.share;
          if (draw <= 0) {
            lp = candidate;
            break;
          }
        }
        const engFactor = lp.engagementFactor ?? 1;
        const invFactor = lp.invalidFactor ?? 1;

        // Identity
        const isDup = identityPool.length > 3 && rng() < config.duplicateRate;
        let email: string | null;
        let phone: string | null;
        if (isDup) {
          const source = identityPool[Math.floor(rng() * identityPool.length)];
          email = source.email;
          phone = source.phone;
        } else {
          const missingEmail = rng() < config.missingEmailRate * invFactor;
          const disposable = rng() < config.disposableRate * invFactor;
          email = missingEmail
            ? null
            : freshEmail(
                state,
                disposable ? pick(rng, DISPOSABLES) : pick(rng, DOMAINS),
              );
          const invalidPhone = rng() < config.invalidPhoneRate * invFactor;
          phone = invalidPhone ? pick(rng, BAD_PHONES) || null : freshPhone(state);
          identityPool.push({ email, phone });
        }

        // Junk identities behave junky: engagement crushed.
        const junky =
          isDup ||
          email === null ||
          DISPOSABLES.some((d) => email?.endsWith(`@${d}`)) ||
          phone === null ||
          !phone.startsWith("+1");
        const junkFactor = junky ? 0.12 : 1;

        const opened = rng() < config.openRate * engFactor * junkFactor;
        const clicked = opened && rng() < config.clickGivenOpen;
        const sms = rng() < config.smsRate * engFactor * junkFactor;
        const engaged = clicked || sms;
        const converted = engaged && rng() < config.convGivenEngaged;
        const revenueCents = converted
          ? Math.max(500, Math.round(box(rng, config.revMeanCents, config.revStdCents)))
          : 0;

        state.externalCounter++;
        rows.push({
          leadExternalId: `S-${String(state.externalCounter).padStart(5, "0")}`,
          createdAt: new Date(
            dayStart + Math.floor((8 * 3600 + rng() * 13 * 3600) * 1000) / 1000 * 1000,
          ),
          email,
          phone,
          campaign: config.name,
          adSet: pick(rng, config.adSets),
          creative: pick(rng, config.creatives),
          platform: config.platform,
          landingPage: lp.id,
          costCents: Math.max(30, Math.round(box(rng, config.costMeanCents, config.costStdCents))),
          emailOpened: opened,
          emailClicked: clicked,
          smsClicked: sms,
          converted,
          revenueCents,
        });
      }
    }

    // Burst events: bot-like junk hammering one landing page within minutes.
    for (const burst of config.bursts) {
      const dayStart = windowStart + burst.day * 86_400_000;
      const burstStart = dayStart + (10 * 3600 + Math.floor(rng() * 4 * 3600)) * 1000;
      let t = burstStart;
      for (let k = 0; k < burst.size; k++) {
        t += (3 + Math.floor(rng() * 15)) * 1000;
        const disposable = rng() < 0.5;
        state.externalCounter++;
        rows.push({
          leadExternalId: `S-${String(state.externalCounter).padStart(5, "0")}`,
          createdAt: new Date(t),
          email: freshEmail(
            state,
            disposable ? pick(rng, DISPOSABLES) : pick(rng, DOMAINS),
          ),
          phone: rng() < 0.4 ? pick(rng, BAD_PHONES) || null : freshPhone(state),
          campaign: config.name,
          adSet: config.adSets[0],
          creative: config.creatives[0],
          platform: config.platform,
          landingPage: burst.landingPage,
          costCents: Math.max(30, Math.round(box(rng, config.costMeanCents, config.costStdCents))),
          emailOpened: false,
          emailClicked: false,
          smsClicked: false,
          converted: false,
          revenueCents: 0,
        });
      }
    }
  }

  return rows;
}
