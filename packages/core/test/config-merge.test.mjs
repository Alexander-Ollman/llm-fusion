/**
 * Registry-merge tests: newly-shipped default models must reach a user who
 * already has a saved config.json, without clobbering their edits.
 * Runs against the compiled dist (node --test), so `npm run build:core` first.
 * Pure function — no filesystem, no network, no subprocess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDefaultModels, DEFAULT_CONFIG, DEFAULT_MODELS } from "../dist/index.js";

/** A saved config from an older release: a subset of defaults + a custom model. */
function legacySaved() {
  return {
    models: [
      { id: "claude-opus-4-8", provider: "anthropic", model: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "gpt-5.5", provider: "openai", model: "gpt-5.5", label: "GPT-5.5" },
      { id: "glm-5.2", provider: "openai-compatible", model: "glm-5.2", label: "GLM 5.2", baseURL: "https://example.invalid/v1" },
    ],
    autoPanel: ["claude-opus-4-8", "gpt-5.5", "glm-5.2"],
  };
}

test("newly-shipped default models are added to a saved registry", () => {
  const { models } = mergeDefaultModels(legacySaved());
  const ids = models.map((m) => m.id);
  for (const shipped of ["claude-opus-5", "claude-fable-5", "gpt-5.6-sol"]) {
    assert.ok(ids.includes(shipped), `expected shipped model ${shipped} to be merged in`);
  }
});

test("user's own custom model survives the merge", () => {
  const { models } = mergeDefaultModels(legacySaved());
  const glm = models.find((m) => m.id === "glm-5.2");
  assert.ok(glm, "custom model must not be dropped");
  assert.equal(glm.baseURL, "https://example.invalid/v1");
});

test("user edits to a default model win over the shipped defaults", () => {
  const saved = legacySaved();
  saved.models[0] = { ...saved.models[0], label: "MY OPUS", reasoningEffort: "low" };
  const { models } = mergeDefaultModels(saved);
  const opus = models.find((m) => m.id === "claude-opus-4-8");
  assert.equal(opus.label, "MY OPUS");
  assert.equal(opus.reasoningEffort, "low");
  // and it appears exactly once (no duplicate from the defaults)
  assert.equal(models.filter((m) => m.id === "claude-opus-4-8").length, 1);
});

test("brand-new models join autoPanel; removed ones are not resurrected", () => {
  const saved = legacySaved();
  // The real "user removed it from rotation" signal: the model IS in their
  // registry but NOT in their autoPanel (how claude-haiku-4-5 sits in a real
  // config). It must stay out even though the shipped default lists it.
  assert.ok(DEFAULT_CONFIG.autoPanel.includes("claude-sonnet-4-6"));
  saved.models.push({
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
  });
  assert.ok(!saved.autoPanel.includes("claude-sonnet-4-6"));

  const { autoPanel } = mergeDefaultModels(saved);
  assert.ok(autoPanel.includes("claude-opus-5"), "brand-new model should enter rotation");
  assert.ok(!autoPanel.includes("claude-sonnet-4-6"), "must not resurrect a de-rotated model");
  assert.ok(autoPanel.includes("glm-5.2"), "user's custom auto-panel entry must survive");
});

test("merge is idempotent — no duplicates on repeated loads", () => {
  const once = mergeDefaultModels(legacySaved());
  const twice = mergeDefaultModels(once);
  assert.deepEqual(twice.models.map((m) => m.id), once.models.map((m) => m.id));
  assert.deepEqual(twice.autoPanel, once.autoPanel);
  const ids = twice.models.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate model ids");
});

test("a config with no models falls back to the full default registry", () => {
  const { models } = mergeDefaultModels({});
  assert.deepEqual(models.map((m) => m.id), DEFAULT_MODELS.map((m) => m.id));
});
