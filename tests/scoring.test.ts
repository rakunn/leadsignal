import { describe, expect, test } from "vitest";
import { scoreLeads } from "@/lib/scoring/score";
import { buildValueNorms } from "@/lib/scoring/value";
import {
  isHighQuality,
  qualifiedCplCents,
  SCORING_VERSION,
  WEIGHTS,
} from "@/lib/scoring/constants";
import type { RawLead } from "@/lib/scoring/types";

let seq = 0;
function lead(overrides: Partial<RawLead> = {}): RawLead {
  seq++;
  return {
    createdAt: new Date(Date.parse("2026-06-01T10:00:00Z") + seq * 600_000),
    email: `person${seq}@example.com`,
    phone: `+1415555${2671 + seq}`,
    campaign: "Campaign X",
    adSet: "as-1",
    creative: "cr-1",
    platform: "Meta",
    landingPage: `lp-${seq}`,
    costCents: 200,
    emailOpened: false,
    emailClicked: false,
    smsClicked: false,
    converted: false,
    revenueCents: 0,
    ...overrides,
  };
}

describe("validity sub-score", () => {
  test("a fully valid, non-duplicate lead scores 100", () => {
    const [s] = scoreLeads([lead()]);
    expect(s.validityScore).toBe(100);
  });

  test("disposable email domain loses 15 points and is flagged", () => {
    const [s] = scoreLeads([lead({ email: "x@mailinator.com" })]);
    expect(s.validityScore).toBe(85);
    expect(s.riskFlags).toContain("disposable_email");
  });

  test("invalid phone loses 25 points and is flagged", () => {
    const [s] = scoreLeads([lead({ phone: "555-0100" })]);
    expect(s.validityScore).toBe(75);
    expect(s.riskFlags).toContain("invalid_phone");
  });

  test("missing email loses both email points (50) and is flagged", () => {
    const [s] = scoreLeads([lead({ email: null })]);
    expect(s.validityScore).toBe(50);
    expect(s.riskFlags).toContain("invalid_email");
  });

  test("syntactically broken email is treated as invalid", () => {
    const [s] = scoreLeads([lead({ email: "not-an-email" })]);
    expect(s.riskFlags).toContain("invalid_email");
    expect(s.validityScore).toBe(50);
  });
});

describe("duplicate detection", () => {
  test("gmail dot/plus variants are duplicates; first by time wins", () => {
    const first = lead({
      email: "anna.b@gmail.com",
      phone: "+14155550001",
      createdAt: new Date("2026-06-01T09:00:00Z"),
    });
    const second = lead({
      email: "annab+promo@gmail.com",
      phone: "+14155550002",
      createdAt: new Date("2026-06-01T11:00:00Z"),
    });
    const [a, b] = scoreLeads([first, second]);
    expect(a.isDuplicate).toBe(false);
    expect(b.isDuplicate).toBe(true);
    expect(b.duplicateOfIndex).toBe(0);
    expect(b.riskFlags).toContain("duplicate");
    expect(b.segment).toBe("suppress");
    expect(b.compositeScore).toBeLessThanOrEqual(15);
  });

  test("same phone with different emails is a duplicate", () => {
    const [, b] = scoreLeads([
      lead({ email: "one@corp.com", phone: "+14155550009" }),
      lead({ email: "two@corp.com", phone: "+14155550009" }),
    ]);
    expect(b.isDuplicate).toBe(true);
  });

  test("earliest lead wins even when it appears later in the array", () => {
    const later = lead({
      email: "same@corp.com",
      createdAt: new Date("2026-06-02T10:00:00Z"),
    });
    const earlier = lead({
      email: "same@corp.com",
      createdAt: new Date("2026-06-01T08:00:00Z"),
    });
    const [a, b] = scoreLeads([later, earlier]);
    expect(a.isDuplicate).toBe(true);
    expect(a.duplicateOfIndex).toBe(1);
    expect(b.isDuplicate).toBe(false);
  });

  test("retains aliases learned from duplicate rows for later duplicate detection", () => {
    const rows = [
      lead({ email: "a@example.com", phone: "+14155550001" }),
      lead({ email: "a@example.com", phone: "+14155550002" }),
      lead({ email: "b@example.com", phone: "+14155550002" }),
    ];
    const scores = scoreLeads(rows);

    expect(scores.map((score) => score.isDuplicate)).toEqual([false, true, true]);
    expect(scores[2].duplicateOfIndex).toBe(0);
    expect(scores[2].compositeScore).toBeLessThanOrEqual(15);
  });

  test("retains a duplicate's email alias after its phone matched first", () => {
    const scores = scoreLeads([
      lead({ email: "a@example.com", phone: "+14155550001" }),
      lead({ email: "b@example.com", phone: "+14155550001" }),
      lead({ email: "b@example.com", phone: "+14155550002" }),
    ]);

    expect(scores.map((score) => score.duplicateOfIndex)).toEqual([null, 0, 0]);
  });

  test("uses original-index tie order and never merges conflicting representatives", () => {
    const at = new Date("2026-06-01T12:00:00Z");
    const scores = scoreLeads([
      lead({
        email: "alpha@example.com",
        phone: "+14155550001",
        createdAt: at,
      }),
      lead({
        email: "bravo@example.com",
        phone: "+14155550002",
        createdAt: at,
      }),
      lead({
        email: "alpha@example.com",
        phone: "+14155550002",
        createdAt: new Date(at.getTime() + 1),
      }),
      lead({
        email: "charlie@example.com",
        phone: "+14155550002",
        createdAt: new Date(at.getTime() + 2),
      }),
    ]);

    expect(scores.map((score) => score.duplicateOfIndex)).toEqual([null, null, 0, 1]);
  });

  test("does not treat invalid identifier text as a duplicate alias", () => {
    const scores = scoreLeads([
      lead({ email: "not an email", phone: "invalid" }),
      lead({ email: "not an email", phone: "invalid" }),
    ]);

    expect(scores.map((score) => score.isDuplicate)).toEqual([false, false]);
  });
});

describe("burst detection", () => {
  function burstLeads(count: number, spacingSeconds: number): RawLead[] {
    return Array.from({ length: count }, (_, i) =>
      lead({
        landingPage: "lp-burst",
        createdAt: new Date(
          Date.parse("2026-06-01T12:00:00Z") + i * spacingSeconds * 1000,
        ),
      }),
    );
  }

  test("5+ leads on one landing page within 120s are all flagged", () => {
    const scored = scoreLeads(burstLeads(5, 20));
    for (const s of scored) {
      expect(s.riskFlags).toContain("burst_submission");
      expect(s.validityScore).toBe(90);
    }
  });

  test("4 leads in the window are not flagged", () => {
    const scored = scoreLeads(burstLeads(4, 20));
    for (const s of scored) {
      expect(s.riskFlags).not.toContain("burst_submission");
    }
  });

  test("5 leads spread over 10 minutes are not flagged", () => {
    const scored = scoreLeads(burstLeads(5, 150));
    for (const s of scored) {
      expect(s.riskFlags).not.toContain("burst_submission");
    }
  });

  test("matches the brute-force window oracle across overlapping boundaries and landing pages", () => {
    const at = (milliseconds: number) =>
      new Date(Date.parse("2026-06-01T12:00:00Z") + milliseconds);
    const fixture: Array<{ landingPage: string; milliseconds: number }> = [
      // Five rows at the exact inclusive 120-second boundary, then an
      // overlapping qualifying window. All six must be marked.
      { landingPage: "lp-overlap", milliseconds: 0 },
      { landingPage: "lp-overlap", milliseconds: 30_000 },
      { landingPage: "lp-overlap", milliseconds: 60_000 },
      { landingPage: "lp-overlap", milliseconds: 90_000 },
      { landingPage: "lp-overlap", milliseconds: 120_000 },
      { landingPage: "lp-overlap", milliseconds: 150_000 },
      // A one-millisecond gap beyond the boundary leaves this group short.
      { landingPage: "lp-gap", milliseconds: 0 },
      { landingPage: "lp-gap", milliseconds: 30_000 },
      { landingPage: "lp-gap", milliseconds: 60_000 },
      { landingPage: "lp-gap", milliseconds: 90_000 },
      { landingPage: "lp-gap", milliseconds: 120_001 },
      // Timestamp ties qualify independently of the other landing pages.
      { landingPage: "lp-ties", milliseconds: 10_000 },
      { landingPage: "lp-ties", milliseconds: 10_000 },
      { landingPage: "lp-ties", milliseconds: 10_000 },
      { landingPage: "lp-ties", milliseconds: 10_000 },
      { landingPage: "lp-ties", milliseconds: 10_000 },
      // A fourth landing page with fewer rows cannot borrow a window.
      { landingPage: "lp-separate", milliseconds: 0 },
      { landingPage: "lp-separate", milliseconds: 20_000 },
      { landingPage: "lp-separate", milliseconds: 40_000 },
      { landingPage: "lp-separate", milliseconds: 60_000 },
    ];
    const rows = fixture.map(({ landingPage, milliseconds }, i) =>
      lead({
        landingPage,
        createdAt: at(milliseconds),
        email: `burst${i}@example.com`,
        phone: `+1415555${String(6000 + i)}`,
      }),
    );

    const expected = new Set<number>();
    for (const landingPage of new Set(rows.map((row) => row.landingPage))) {
      const indices = rows
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => row.landingPage === landingPage)
        .sort(
          (a, b) =>
            a.row.createdAt.getTime() - b.row.createdAt.getTime() || a.i - b.i,
        )
        .map(({ i }) => i);
      for (let start = 0; start < indices.length; start++) {
        for (let end = start + 4; end < indices.length; end++) {
          if (
            rows[indices[end]].createdAt.getTime() -
              rows[indices[start]].createdAt.getTime() <=
            120_000
          ) {
            for (let marked = start; marked <= end; marked++) {
              expected.add(indices[marked]);
            }
          }
        }
      }
    }

    const actual = scoreLeads(rows)
      .map((score, i) => (score.riskFlags.includes("burst_submission") ? i : -1))
      .filter((i) => i >= 0);
    expect(actual).toEqual([...expected].sort((a, b) => a - b));
  });
});

describe("intent sub-score", () => {
  test("open + click + sms = 100", () => {
    const [s] = scoreLeads([
      lead({ emailOpened: true, emailClicked: true, smsClicked: true }),
    ]);
    expect(s.intentScore).toBe(100);
  });

  test("open only = 30", () => {
    const [s] = scoreLeads([lead({ emailOpened: true })]);
    expect(s.intentScore).toBe(30);
  });

  test("no engagement = 0 with no_engagement flag", () => {
    const [s] = scoreLeads([lead()]);
    expect(s.intentScore).toBe(0);
    expect(s.riskFlags).toContain("no_engagement");
  });
});

describe("value sub-score", () => {
  test("leads from a high-revenue campaign outrank a zero-revenue campaign", () => {
    const rich = Array.from({ length: 10 }, (_, i) =>
      lead({
        campaign: "Rich",
        landingPage: "lp-rich",
        revenueCents: 5000,
        converted: true,
        email: `rich${i}@corp.com`,
        phone: `+1415555${String(1000 + i)}`,
      }),
    );
    const poor = Array.from({ length: 10 }, (_, i) =>
      lead({
        campaign: "Poor",
        landingPage: "lp-poor",
        revenueCents: 0,
        email: `poor${i}@corp.com`,
        phone: `+1415555${String(2000 + i)}`,
      }),
    );
    const scored = scoreLeads([...rich, ...poor]);
    const richScore = scored[0].valueScore;
    const poorScore = scored[10].valueScore;
    expect(richScore).toBeGreaterThan(poorScore);
    expect(richScore).toBeGreaterThan(60);
    expect(poorScore).toBeLessThan(40);
    expect(scored[10].riskFlags).toContain("low_value_source");
  });

  test("uses ceiling percentile ranks across empty, tied, and in-between source values", () => {
    expect(buildValueNorms([]).percentileOf(500)).toBe(50);
    expect(buildValueNorms([lead({ revenueCents: 100 })]).percentileOf(999)).toBe(50);

    const norms = buildValueNorms([
      lead({ campaign: "Low", landingPage: null, revenueCents: 100 }),
      lead({ campaign: "Tied", landingPage: null, revenueCents: 200 }),
      lead({ campaign: "Tied", landingPage: null, revenueCents: 200 }),
      lead({ campaign: "High", landingPage: null, revenueCents: 300 }),
    ]);

    expect(norms.percentileOf(100)).toBe(0);
    expect(norms.percentileOf(200)).toBe(50);
    expect(norms.percentileOf(250)).toBe(100);
    expect(norms.percentileOf(300)).toBe(100);
    expect(norms.percentileOf(999)).toBe(100);
  });
});

describe("composite score", () => {
  test("composite equals the weighted, rounded sum of sub-scores", () => {
    const scored = scoreLeads([
      lead({ emailOpened: true }),
      lead({ email: "x@mailinator.com", emailClicked: true }),
      lead(),
    ]);
    for (const s of scored) {
      const expected = Math.round(
        WEIGHTS.validity * s.validityScore +
          WEIGHTS.intent * s.intentScore +
          WEIGHTS.value * s.valueScore,
      );
      expect(s.compositeScore).toBe(expected);
    }
  });

  test("missing email AND invalid phone caps composite at 20", () => {
    const [s] = scoreLeads([
      lead({
        email: null,
        phone: "banana",
        emailOpened: true,
        emailClicked: true,
        smsClicked: true,
      }),
    ]);
    expect(s.riskFlags).toContain("invalid_email");
    expect(s.riskFlags).toContain("invalid_phone");
    expect(s.compositeScore).toBeLessThanOrEqual(20);
    expect(s.segment).toBe("suppress");
  });
});

describe("conversion probability", () => {
  test("is calibrated: mean(p) tracks the observed conversion rate", () => {
    const leadsIn = Array.from({ length: 100 }, (_, i) =>
      lead({
        converted: i < 20,
        revenueCents: i < 20 ? 4000 : 0,
        emailOpened: i % 2 === 0,
        emailClicked: i % 3 === 0,
        email: `cal${i}@corp.com`,
        phone: `+1415555${String(3000 + i)}`,
      }),
    );
    const scored = scoreLeads(leadsIn);
    const mean =
      scored.reduce((acc, s) => acc + s.conversionProbability, 0) /
      scored.length;
    expect(Math.abs(mean - 0.2)).toBeLessThan(0.03);
  });

  test("zero conversions stays finite and non-negative", () => {
    const scored = scoreLeads([lead(), lead(), lead()]);
    for (const s of scored) {
      expect(Number.isFinite(s.conversionProbability)).toBe(true);
      expect(s.conversionProbability).toBeGreaterThanOrEqual(0);
    }
  });

  test("higher intent means higher probability, all else equal", () => {
    const [low, high] = scoreLeads([
      lead({ email: "a@corp.com", phone: "+14155550021" }),
      lead({
        email: "b@corp.com",
        phone: "+14155550022",
        emailOpened: true,
        emailClicked: true,
        smsClicked: true,
      }),
    ]);
    expect(high.conversionProbability).toBeGreaterThan(
      low.conversionProbability,
    );
  });
});

describe("segments", () => {
  test("burst-flagged lead with otherwise good signals goes to review", () => {
    const burst = Array.from({ length: 5 }, (_, i) =>
      lead({
        landingPage: "lp-burst",
        createdAt: new Date(Date.parse("2026-06-01T12:00:00Z") + i * 1000),
        emailOpened: true,
        emailClicked: true,
        email: `b${i}@corp.com`,
        phone: `+1415555${String(4000 + i)}`,
      }),
    );
    const scored = scoreLeads(burst);
    for (const s of scored) expect(s.segment).toBe("review");
  });

  test("one invalid contact channel with decent engagement goes to review", () => {
    const [s] = scoreLeads([
      lead({ phone: "nope", emailOpened: true, emailClicked: true }),
    ]);
    expect(s.segment).toBe("review");
  });

  test("high composite + high probability lands high_value", () => {
    // High-conversion dataset so calibration pushes probabilities up.
    const winners = Array.from({ length: 10 }, (_, i) =>
      lead({
        campaign: "Winners",
        landingPage: "lp-win",
        emailOpened: true,
        emailClicked: true,
        smsClicked: true,
        converted: i < 4,
        revenueCents: i < 4 ? 9000 : 0,
        email: `w${i}@corp.com`,
        phone: `+1415555${String(5000 + i)}`,
      }),
    );
    const scored = scoreLeads(winners);
    expect(scored[0].segment).toBe("high_value");
  });

  test("clean lead with mild engagement is nurture", () => {
    const [s] = scoreLeads([
      lead({ emailOpened: true, emailClicked: true }),
      // companion so the value percentile isn't degenerate
      lead({ revenueCents: 1000, converted: true }),
    ]);
    expect(s.segment).toBe("nurture");
  });

  test("clean lead with no engagement and weak source is test", () => {
    const scored = scoreLeads([
      lead(),
      lead({ revenueCents: 8000, converted: true }),
    ]);
    expect(scored[0].segment).toBe("test");
  });
});

describe("cost flags", () => {
  test("expensive low-quality lead is flagged high_cost_low_quality", () => {
    const scored = scoreLeads([
      lead({ costCents: 2000, email: null, phone: "junk" }),
      ...Array.from({ length: 9 }, (_, i) =>
        lead({ costCents: 200, email: `c${i}@corp.com` }),
      ),
    ]);
    expect(scored[0].riskFlags).toContain("high_cost_low_quality");
    expect(scored[1].riskFlags).not.toContain("high_cost_low_quality");
  });
});

describe("breakdown receipt", () => {
  test("every scored lead carries a non-empty breakdown that sums to its sub-scores", () => {
    const [s] = scoreLeads([lead({ emailOpened: true })]);
    expect(s.breakdown.length).toBeGreaterThan(0);
    const validityPoints = s.breakdown
      .filter((b) => b.scope === "validity")
      .reduce((acc, b) => acc + b.points, 0);
    expect(validityPoints).toBe(s.validityScore);
    const intentPoints = s.breakdown
      .filter((b) => b.scope === "intent")
      .reduce((acc, b) => acc + b.points, 0);
    expect(intentPoints).toBe(s.intentScore);
  });
});

describe("HQ definition", () => {
  test("HQ = composite ≥ 70 and not suppress", () => {
    expect(isHighQuality(70, "nurture")).toBe(true);
    expect(isHighQuality(69, "high_value")).toBe(false);
    expect(isHighQuality(90, "suppress")).toBe(false);
  });

  test("qualified CPL divides spend by HQ leads and is null with none", () => {
    expect(qualifiedCplCents(84000, 10)).toBe(8400);
    expect(qualifiedCplCents(84000, 0)).toBeNull();
  });

  test("scoring version is stamped", () => {
    expect(SCORING_VERSION).toMatch(/v\d/);
  });
});
