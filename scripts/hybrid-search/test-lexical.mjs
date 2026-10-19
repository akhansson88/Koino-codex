import assert from "node:assert/strict";
import test from "node:test";
import {normalizeSwedishForSearch} from "./lexical.mjs";

test("official Swedish stemming handles inflection and preserves Swedish vowels",()=>{
  assert.equal(normalizeSwedishForSearch("ÄNGLARNA änglar"),"ängl ängl");
  assert.equal(normalizeSwedishForSearch("nåden nåd"),"nåd nåd");
  assert.equal(normalizeSwedishForSearch("frälsningen frälsning"),"frälsning frälsning");
  assert.notEqual(normalizeSwedishForSearch("far"),normalizeSwedishForSearch("får"));
});
test("normalization is shared and handles punctuation and decomposed Unicode",()=>{
  assert.equal(normalizeSwedishForSearch("  A\u0308nglarna, GUDS!  "),normalizeSwedishForSearch("Änglarna Guds"));
  assert.equal(normalizeSwedishForSearch(""),"");
});
