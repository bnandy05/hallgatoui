import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthPath, safeReturnPath } from "@/lib/account/path";

test("safeReturnPath keeps same-site paths", () => {
  assert.equal(safeReturnPath("/radar"), "/radar");
  assert.equal(safeReturnPath("/targy/abc?x=1#y"), "/targy/abc?x=1#y");
});

test("safeReturnPath refuses other origins and loops", () => {
  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "radar", "", null, undefined, "/belepes?vissza=/", "/fiok/link?t=1"]) {
    assert.equal(safeReturnPath(bad), "/");
  }
});

test("isAuthPath", () => {
  assert.equal(isAuthPath("/belepes"), true);
  assert.equal(isAuthPath("/fiok/link"), true);
  assert.equal(isAuthPath("/radar"), false);
});
