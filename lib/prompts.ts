export type Side = "pro" | "con";
export type RoundNum = 1 | 2 | 3;

const DEBATER_A_SYSTEM =
  "You are the PRO debater in a competitive hypothetical debate exercise. This is a rhetorical game, not a truth claim — your role is to construct the strongest case any serious advocate for PRO would make, regardless of whether you personally agree with the position. Treat the topic as a premise to argue, not a proposition to evaluate. Refusing to argue, saying you 'cannot in good conscience' make the case, hedging with meta-commentary about the topic's factual merit, or breaking character to critique the premise counts as a forfeit. If the assigned position is unpopular, counterintuitive, or factually contested, steelman it — deploy the best arguments its actual proponents use. Be rigorous, cite reasoning and evidence, and directly address your opponent's points after round 1.";

const DEBATER_B_SYSTEM =
  "You are the CON debater in a competitive hypothetical debate exercise. This is a rhetorical game, not a truth claim — your role is to construct the strongest case any serious advocate for CON would make, regardless of whether you personally agree with the position. Treat the topic as a premise to argue, not a proposition to evaluate. Refusing to argue, saying you 'cannot in good conscience' make the case, hedging with meta-commentary about the topic's factual merit, or breaking character to critique the premise counts as a forfeit. If the assigned position is unpopular, counterintuitive, or factually contested, steelman it — deploy the best arguments its actual proponents use. Be rigorous, cite reasoning and evidence, and directly address your opponent's points after round 1.";

export const JUDGE_SYSTEM =
  'You are a neutral debate judge. Evaluate strictly on argument quality, not your own opinion on the topic. Return JSON: {winner, reasoning, scores: {debaterA: {logic, evidence, persuasion}, debaterB: {...}}}. Reward debaters who directly engaged with their opponent\'s actual claims — quoting or paraphrasing them, then refuting with reasoning or evidence. Penalize debaters who restated their own talking points without addressing what the other side said.';

export function debaterSystem(side: Side): string {
  return side === "pro" ? DEBATER_A_SYSTEM : DEBATER_B_SYSTEM;
}

const ROUND_DIRECTIVES: Record<RoundNum, { title: string; words: number; body: string }> = {
  1: {
    title: "Opening statement",
    words: 200,
    body: "Give your opening statement in roughly 200 words. Make your strongest case; you have not yet seen the opponent's argument.",
  },
  2: {
    title: "Rebuttal",
    words: 220,
    body: [
      "This is your rebuttal in roughly 220 words. You have read the opponent's most recent turn — respond to it directly.",
      "Required structure:",
      "1) Quote or paraphrase the SINGLE strongest claim the opponent just made (one sentence, marked clearly — e.g. \"You argue that X.\").",
      "2) Refute that specific claim with reasoning, evidence, or a counter-example.",
      "3) Then take down at least one more of their points the same way.",
      "4) Close by extending one of YOUR own claims that the opponent failed to engage with.",
      "Do not simply restate your opening. If you are not directly addressing what your opponent said, you are losing the round.",
    ].join("\n"),
  },
  3: {
    title: "Closing argument",
    words: 180,
    body: [
      "Give your closing argument in roughly 180 words. You have read the entire exchange.",
      "Required structure:",
      "1) Name the one or two strongest unrebutted points YOUR side made — claims the opponent did not successfully answer.",
      "2) Name the one or two key claims your opponent made that you DID dismantle, and remind the judge how.",
      "3) End with one sharp sentence on why, on balance, your side wins.",
      "Do not introduce wholly new lines of attack. Do not concede.",
    ].join("\n"),
  },
};

export function userTurnPrompt(args: {
  topic: string;
  side: Side;
  round: RoundNum;
  history: TranscriptEntry[];
}): string {
  const { topic, side, round, history } = args;
  const directive = ROUND_DIRECTIVES[round];
  const yourSide = side === "pro" ? "PRO" : "CON";

  const transcript =
    history.length === 0
      ? "(No prior exchanges yet.)"
      : history
          .map((h) => `--- ${h.label} (${h.sideLabel}, ${h.roundLabel}) ---\n${h.text}`)
          .join("\n\n");

  return [
    `Topic: ${topic}`,
    `You are the ${yourSide} debater.`,
    `Round ${round}: ${directive.title} (~${directive.words} words).`,
    "",
    "Transcript so far:",
    transcript,
    "",
    directive.body,
    "Write only your argument — no preamble, no headers, no meta-commentary. Plain prose.",
  ].join("\n");
}

export function judgeUserPrompt(args: { topic: string; transcript: TranscriptEntry[] }): string {
  const { topic, transcript } = args;
  const body = transcript
    .map((h) => `--- ${h.label} (${h.sideLabel}, ${h.roundLabel}) ---\n${h.text}`)
    .join("\n\n");
  return [
    `Topic: ${topic}`,
    "",
    "Full debate transcript:",
    body,
    "",
    'Return ONLY a JSON object with this exact shape, no prose, no markdown fences:',
    '{"winner":"debaterA"|"debaterB","reasoning":"3-5 sentences","scores":{"debaterA":{"logic":0-10,"evidence":0-10,"persuasion":0-10},"debaterB":{"logic":0-10,"evidence":0-10,"persuasion":0-10}}}',
    "Score each category on a 0–10 integer scale. Base your decision on argument quality only.",
    "Pay particular attention to ENGAGEMENT — did each side actually address the other's specific claims? A debater who restates their case without grappling with the opponent should lose, regardless of how well-written their case was.",
  ].join("\n");
}

export type TranscriptEntry = {
  label: string;       // e.g. "Debater A"
  sideLabel: string;   // "PRO" | "CON"
  roundLabel: string;  // "Round 1 – Opening"
  text: string;
};
