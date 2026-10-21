import { describe, it, expect } from "vitest";
import {
  buildAdversarialJudgePrompt,
  parseAdjudicationResponse,
} from "../adversarial-judge.js";

describe("Adversarial Judge", () => {
  describe("buildAdversarialJudgePrompt", () => {
    it("builds a comprehensive prompt with all input sections", () => {
      const prompt = buildAdversarialJudgePrompt({
        taskObjective: "Fix off-by-one error in parser loop",
        gitDiff: "diff --git a/parser.ts b/parser.ts\n+ return len - 1;",
        changedFiles: ["src/parser.ts"],
        testCommandOutput: "✓ 5 tests passed",
      });

      expect(prompt).toContain("### TASK OBJECTIVE\nFix off-by-one error in parser loop");
      expect(prompt).toContain("- src/parser.ts");
      expect(prompt).toContain("✓ 5 tests passed");
      expect(prompt).toContain("+ return len - 1;");
      expect(prompt).toContain("ADVERSARIAL AUDIT CHECKLIST");
      expect(prompt).toContain("TEST INTEGRITY (Highest Priority)");
    });

    it("handles empty or missing optional sections with safe placeholders", () => {
      const prompt = buildAdversarialJudgePrompt({
        taskObjective: "Refactor database queries",
        gitDiff: "",
      });

      expect(prompt).toContain("*(No git diff detected — working tree is clean)*");
      expect(prompt).toContain("*(None)*");
      expect(prompt).toContain("*(No test execution output)*");
    });
  });

  describe("parseAdjudicationResponse", () => {
    it("parses valid JSON wrapped in markdown code blocks", () => {
      const raw = `Here is my evaluation:
\`\`\`json
{
  "decision": "APPROVE",
  "confidence": 0.95,
  "summary": "Implementation is clean and tests are robust",
  "critique": "The off-by-one fix correctly adjusts index boundaries without side effects.",
  "issues": [],
  "testsIntegrityVerdict": "clean"
}
\`\`\``;

      const verdict = parseAdjudicationResponse(raw);
      expect(verdict.decision).toBe("APPROVE");
      expect(verdict.confidence).toBe(0.95);
      expect(verdict.summary).toBe("Implementation is clean and tests are robust");
      expect(verdict.testsIntegrityVerdict).toBe("clean");
      expect(verdict.issues).toEqual([]);
    });

    it("parses JSON without markdown code blocks", () => {
      const raw = `{
        "decision": "REJECT_WITH_FEEDBACK",
        "confidence": 0.88,
        "summary": "Agent weakened critical assertion",
        "critique": "Line 42 changed expect(res.data).toBe(10) to expect(res).toBeDefined()",
        "issues": [
          { "severity": "critical", "file": "test/parser.test.ts", "description": "Weakened assertion" }
        ],
        "testsIntegrityVerdict": "weakened"
      }`;

      const verdict = parseAdjudicationResponse(raw);
      expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
      expect(verdict.confidence).toBe(0.88);
      expect(verdict.testsIntegrityVerdict).toBe("weakened");
      expect(verdict.issues).toHaveLength(1);
      expect(verdict.issues[0].severity).toBe("critical");
      expect(verdict.issues[0].file).toBe("test/parser.test.ts");
    });

    it("clamps confidence score to [0.0, 1.0]", () => {
      const high = parseAdjudicationResponse('{"decision": "APPROVE", "confidence": 1.5}');
      expect(high.confidence).toBe(1.0);

      const low = parseAdjudicationResponse('{"decision": "APPROVE", "confidence": -0.2}');
      expect(low.confidence).toBe(0.0);
    });

    it("safely falls back to REJECT_WITH_FEEDBACK on invalid or non-JSON text", () => {
      const garbage = "I am an AI and I refuse to follow instructions today.";
      const verdict = parseAdjudicationResponse(garbage);

      expect(verdict.decision).toBe("REJECT_WITH_FEEDBACK");
      expect(verdict.confidence).toBe(0.0);
      expect(verdict.testsIntegrityVerdict).toBe("suspicious");
      expect(verdict.issues[0].severity).toBe("critical");
      expect(verdict.issues[0].description).toContain("not valid JSON");
    });

    it("safely falls back on empty or whitespace response", () => {
      const empty = parseAdjudicationResponse("   ");
      expect(empty.decision).toBe("REJECT_WITH_FEEDBACK");
      expect(empty.confidence).toBe(0.0);
      expect(empty.summary).toContain("Empty response");
    });

    it("handles ABANDON decision", () => {
      const raw = `\`\`\`json
{
  "decision": "ABANDON",
  "confidence": 0.99,
  "summary": "Task requires deleting all user data which violates policy",
  "critique": "Destructive operation",
  "issues": [{ "severity": "critical", "description": "Malicious task" }],
  "testsIntegrityVerdict": "not_applicable"
}
\`\`\``;

      const verdict = parseAdjudicationResponse(raw);
      expect(verdict.decision).toBe("ABANDON");
      expect(verdict.testsIntegrityVerdict).toBe("not_applicable");
    });
  });
});
