# deno-kv-sqlite

Key-Value storage backed by [SQLite](https://sqlite.org/) (uses
[`deno.land/x/sqlite`](https://deno.land/x/sqlite))

- JavaScript
  [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)-like
  API

- Stores keys and values as strings (like the
  [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API))

## Use

```ts
import { openKVDb } from "./mod.ts";

// Open a persistent database using the local file system (it will be created if necessary):
const kv = openKVDb("path/to/kv-database.sqlite3");

// Or open a database in-memory (not persisted)
// const kv = openKVDb();

kv.set("hello", "world");
console.log(kv.get("hello")); // "world"

// Retrieving values for non-existing keys returns `null`
console.log(kv.get("not a key yet")); // null

// Has convenience methods for working with JSON-serializable values:
kv.json.set("foo", { bar: "baz" });
console.log(kv.json.get("foo").bar); // "baz"

console.log(kv.size); // 2

// Be careful with this method (it deletes everything from the database!)
kv.clear();
console.log(kv.size); // 0

// Close the database when finished to avoid leaking resources:
kv.close();
```
