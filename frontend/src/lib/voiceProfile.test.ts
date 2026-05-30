import { describe, it, expect, afterEach } from "vitest";
import { voiceProfileManager } from "./voiceProfile.js";

describe("voiceProfileManager", () => {
  // Reset to default profile after each test to avoid cross-test pollution
  afterEach(() => {
    voiceProfileManager.setActiveProfile("moli");
  });

  it("default active profile is 'moli'", () => {
    const profile = voiceProfileManager.getActiveProfile();
    expect(profile.id).toBe("moli");
  });

  it("getVoiceName returns '茉莉'", () => {
    expect(voiceProfileManager.getVoiceName()).toBe("茉莉");
  });

  it("getTTSModel returns 'mimo-v2.5-tts'", () => {
    expect(voiceProfileManager.getTTSModel()).toBe("mimo-v2.5-tts");
  });

  it("getLanguage returns 'zh-CN'", () => {
    expect(voiceProfileManager.getLanguage()).toBe("zh-CN");
  });

  it("setActiveProfile with valid id switches profile", () => {
    // The default config only has "moli", so we test with that
    voiceProfileManager.setActiveProfile("moli");
    const profile = voiceProfileManager.getActiveProfile();
    expect(profile.id).toBe("moli");
  });

  it("setActiveProfile with invalid id throws Error", () => {
    expect(() => voiceProfileManager.setActiveProfile("nonexistent")).toThrow(
      'Voice profile "nonexistent" not found'
    );
  });

  it("getAllProfiles returns all profiles", () => {
    const profiles = voiceProfileManager.getAllProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(1);
    expect(profiles.some((p) => p.id === "moli")).toBe(true);
  });

  it("getActiveProfile returns full profile object", () => {
    const profile = voiceProfileManager.getActiveProfile();
    expect(profile).toEqual({
      id: "moli",
      name: "茉莉",
      language: "zh-CN",
      model: "mimo-v2.5-tts",
      gender: "female",
      style: "warm",
    });
  });
});
