import { z } from "zod";

export const PickRec = z.object({
  player_id: z.string().describe("Sleeper player id exactly as given in the available list"),
  name: z.string(),
  position: z.string(),
  confidence: z.number().min(0).max(100).describe("0-100 how strongly this is the right pick now"),
  reasoning: z.string().describe("2-3 sentences: value vs ADP, roster fit, tier/scarcity, preference-file fit"),
});

export const RecommendationResponse = z.object({
  picks: z.array(PickRec).min(1).max(5).describe("Best picks right now, best first"),
  likelyGoneBeforeNextPick: z.array(z.string()).describe("Players to grab now if wanted; will not survive to your next turn"),
  targetsNextRound: z.array(z.string()).describe("Players likely still available at your following pick worth planning around"),
  rosterNotes: z.string().describe("One short paragraph on roster construction status and strategy for the next 2-3 picks"),
  warnings: z.array(z.string()).describe("Bye-week clashes, injury flags, reaches, preference-file conflicts"),
});
export type RecommendationResponse = z.infer<typeof RecommendationResponse>;

export const RecommendRequest = z.object({
  draftId: z.string(),
  effort: z.enum(["low", "medium", "high"]).default("high"),
  mySlot: z.number().int().positive().nullable(),
  rankings: z
    .array(
      z.object({
        playerId: z.string(),
        rank: z.number().nullable(),
        adp: z.number().nullable(),
        tier: z.number().nullable(),
        bye: z.number().nullable(),
        proj: z.number().nullable(),
        posRank: z.number().nullable(),
      }),
    )
    .nullable(),
  question: z.string().max(500).optional().describe("Optional user note, e.g. 'I want a QB this round'"),
});
export type RecommendRequest = z.infer<typeof RecommendRequest>;
