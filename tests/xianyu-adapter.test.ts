import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeXianyuSearchItems,
  xianyuItemUrl,
  xianyuSearchUrl,
} from "../src/adapters/xianyu.js";

test("xianyu search URL encodes the query", () => {
  const url = new URL(xianyuSearchUrl("UM880 Plus 32G 1T"));
  assert.equal(url.hostname, "www.goofish.com");
  assert.equal(url.pathname, "/search");
  assert.equal(url.searchParams.get("q"), "UM880 Plus 32G 1T");
});

test("xianyu item URL accepts ids and canonicalizes URLs", () => {
  assert.equal(
    xianyuItemUrl("994938291049"),
    "https://www.goofish.com/item?id=994938291049",
  );
  assert.equal(
    xianyuItemUrl(
      "https://www.goofish.com/item?id=994938291049&foo=bar",
    ),
    "https://www.goofish.com/item?id=994938291049",
  );
  assert.throws(
    () => xianyuItemUrl("https://example.com/item?id=994938291049"),
    /goofish\.com/,
  );
});

test("search result normalization deduplicates and parses prices", () => {
  const items = normalizeXianyuSearchItems(
    [
      {
        ref: "mb-1",
        tag: "a",
        role: null,
        text: "铭凡 UM880 Plus ¥2800",
        href: "https://www.goofish.com/item?id=100000000001",
      },
      {
        ref: "mb-2",
        tag: "a",
        role: null,
        text: "铭凡 UM880 Plus 8845HS 32G+1T ¥2799 包邮",
        href: "https://www.goofish.com/item?id=100000000001&spm=test",
      },
      {
        ref: "mb-3",
        tag: "a",
        role: null,
        text: "SER8 ￥2999",
        href: "https://www.goofish.com/item?id=100000000002",
      },
      {
        ref: "mb-4",
        tag: "a",
        role: null,
        text: "not an item",
        href: "https://www.goofish.com/search?q=test",
      },
    ],
    20,
  );

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    id: "100000000001",
    url: "https://www.goofish.com/item?id=100000000001",
    ref: "mb-2",
    text: "铭凡 UM880 Plus 8845HS 32G+1T ¥2799 包邮",
    price: 2799,
  });
  assert.equal(items[1]?.price, 2999);
});
