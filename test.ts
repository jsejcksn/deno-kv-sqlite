import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertInstanceOf,
  assertStrictEquals,
  assertThrows,
  path,
} from './dev_deps.ts';

import {type Entry, KVDbError, openKVDb} from './mod.ts';

const {test} = Deno;

type ArrayWithAtLeastOneElement<T> = [T, ...T[]];

function getTestFilePath (...paths: string[]): string {
  return path.join('testdata', ...paths);
}

test('opens a memory database', async ({step}) => {
  await step('using no arguments', () => openKVDb().close());
  await step('using explicit undefined', () => openKVDb(undefined).close());
  await step('using string ":memory:"', () => openKVDb(':memory:').close());

  await step('using object {path: ":memory:"}', () => {
    openKVDb({path: ':memory:'}).close();
  });

  await step('using object {memory: true}', () => {
    openKVDb({memory: true}).close();
  });
});

test(
  'throws when opening a file system database without permissions',
  {permissions: 'none'},
  async ({step}) => {
    const dbPath = getTestFilePath('kv.sqlite3');
  
    await step('using string path', () => {
      const ex = assertThrows(() => openKVDb(dbPath).close());
      assertInstanceOf(ex, Deno.errors.PermissionDenied);
    });
  
    await step('using object with property "path"', () => {
      const ex = assertThrows(() => openKVDb({path: dbPath}).close());
      assertInstanceOf(ex, Deno.errors.PermissionDenied);
    });
  },
);

test('opens a file system database', async ({step}) => {
  const dbPath = getTestFilePath('kv.sqlite3');
  const dirPath = path.dirname(dbPath);

  try {
    await Deno.mkdir(dirPath, {recursive: true});
    await step('using string path', () => openKVDb(dbPath).close());

    await step('using object with property "path"', () => {
      openKVDb({path: dbPath}).close();
    });
  }
  finally {
    try { await Deno.remove(dirPath, {recursive: true}); }
    catch {/* ok */}
  }
});

test('throws on use after being closed', async ({step}) => {
  await step('accessing property "size"', () => {
    const ex = assertThrows(() => {
      const kv = openKVDb();
      kv.close();
      kv.size;
    });

    assertInstanceOf(ex, KVDbError);
  });

  await step('accessing property "size" on property "json"', () => {
    const ex = assertThrows(() => {
      const kv = openKVDb();
      kv.close();
      kv.json.size;
    });

    assertInstanceOf(ex, KVDbError);
  });

  await step('invoking method Symbol.iterator', () => {
    const ex = assertThrows(() => {
      const kv = openKVDb();
      kv.close();
      [...kv];
    });

    assertInstanceOf(ex, KVDbError);
  });

  await step('invoking method Symbol.iterator on property "json"', () => {
    const ex = assertThrows(() => {
      const kv = openKVDb();
      kv.close();
      [...kv.json];
    });

    assertInstanceOf(ex, KVDbError);
  });

  for (const method of [
    'clear',
    'delete',
    'entries',
    'get',
    'has',
    'keys',
    'set',
    'values',
  ] as const) {
    await step(`invoking method "${method}"`, () => {
      const ex = assertThrows(() => {
        const kv = openKVDb();
        kv.close();
        // deno-lint-ignore no-explicit-any
        (kv[method] as any)();
      });
  
      assertInstanceOf(ex, KVDbError);
    });

    await step(`invoking method "${method}" on property "json"`, () => {
      const ex = assertThrows(() => {
        const kv = openKVDb();
        kv.close();
        // deno-lint-ignore no-explicit-any
        (kv.json[method] as any)();
      });
  
      assertInstanceOf(ex, KVDbError);
    });
  }
});

test('handles strings', async ({step}) => {
  const entries = [
    ['hello', 'world'],
    ['foo', 'bar'],
  ] as ArrayWithAtLeastOneElement<Entry<string>>;

  const kv = openKVDb();

  await step ('initial size is 0', () => assertStrictEquals(kv.size, 0));

  await step ('sets/gets entries', () => {
    for (const [key, value] of entries) {
      assertStrictEquals(kv.has(key), false);
      assertStrictEquals(kv.get(key), null);

      kv.set(key, value);
      assertStrictEquals(kv.has(key), true);
      assertStrictEquals(kv.get(key), value);
    }

    assertStrictEquals(kv.size, entries.length);
  });

  await step('iterates keys', () => {
    const keysExpected = entries.map(([key]) => key);
    const keysActual = [...kv.keys()];
    assertStrictEquals(keysActual.length, keysExpected.length);
    for (const key of keysExpected) assert(keysActual.includes(key));
  });

  await step('iterates values', () => {
    const valuesExpected = entries.map(([, value]) => value);
    const valuesActual = [...kv.values()];
    assertStrictEquals(valuesActual.length, valuesExpected.length);

    for (const value of valuesExpected) {
      assertArrayIncludes(valuesActual, [value]);
    }
  });

  await step('iterates entries', () => {
    const entriesActual = [...kv.entries()];
    const entriesActualImplicit = [...kv];

    assertStrictEquals(entriesActual.length, entries.length);
    assertStrictEquals(entriesActualImplicit.length, entries.length);

    for (const entry of entries) {
      assertArrayIncludes(entriesActual, [entry]);
      assertArrayIncludes(entriesActualImplicit, [entry]);
    }
  });

  await step (`size is ${entries.length} after setting`, () => {
    assertStrictEquals(kv.size, entries.length);
  });
  
  await step (`deletes entries`, async ({step}) => {
    const [firstKey] = entries[0];
    assertStrictEquals(kv.has(firstKey), true);
    kv.delete(firstKey);
    assertStrictEquals(kv.has(firstKey), false);

    await step (`size is ${entries.length - 1} after deleting`, () => {
      assertStrictEquals(kv.size, entries.length - 1);
    });
  });

  await step ('clears entries', () => {
    kv.clear();
    assertStrictEquals(kv.size, 0);
  });

  kv.close();
});

test('handles JSON-serializable values', async ({step}) => {
  const jsonValues = [
    false,
    2,
    null,
    'foo',
    [1, 2, 3, 'a', 'b', 'c', true, {foo: 'bar'}, null, [null, null]],
    {hello: 'world', foo: 2},
  ];

  type NarrowJsonValue = typeof jsonValues[number];
  type JsonEntry = Entry<string, NarrowJsonValue>;

  const entries = jsonValues.map((v, i) => [String(i), v]) as (
    ArrayWithAtLeastOneElement<JsonEntry>
  );

  const {json: kv} = openKVDb<NarrowJsonValue>();

  await step ('initial size is 0', () => assertStrictEquals(kv.size, 0));

  await step ('sets/gets entries', () => {
    for (const [key, value] of entries) {
      assertStrictEquals(kv.has(key), false);
      assertStrictEquals(kv.get(key), null);

      kv.set(key, value);
      assertStrictEquals(kv.has(key), true);
      assertEquals(kv.get(key), value);
    }
  });

  await step('iterates keys', () => {
    const keysExpected = entries.map(([key]) => key);
    const keysActual = [...kv.keys()];
    assertStrictEquals(keysActual.length, keysExpected.length);
    for (const key of keysExpected) assert(keysActual.includes(key));
  });

  await step('iterates values', () => {
    const valuesExpected = entries.map(([, value]) => value);
    const valuesActual = [...kv.values()];
    assertStrictEquals(valuesActual.length, valuesExpected.length);

    for (const value of valuesExpected) {
      assertArrayIncludes(valuesActual, [value]);
    }
  });

  await step('iterates entries', () => {
    const entriesActual = [...kv.entries()];
    const entriesActualImplicit = [...kv];

    assertStrictEquals(entriesActual.length, entries.length);
    assertStrictEquals(entriesActualImplicit.length, entries.length);

    for (const entry of entries) {
      assertArrayIncludes(entriesActual, [entry]);
      assertArrayIncludes(entriesActualImplicit, [entry]);
    }
  });

  await step (`size is ${entries.length} after setting`, () => {
    assertStrictEquals(kv.size, entries.length);
  });
  
  await step (`deletes entries`, async ({step}) => {
    const [firstKey] = entries[0];
    assertStrictEquals(kv.has(firstKey), true);
    kv.delete(firstKey);
    assertStrictEquals(kv.has(firstKey), false);

    await step (`size is ${entries.length - 1} after deleting`, () => {
      assertStrictEquals(kv.size, entries.length - 1);
    });
  });

  await step ('clears entries', () => {
    kv.clear();
    assertStrictEquals(kv.size, 0);
  });

  kv.close();
});

test('implements the Map API methods (except "forEach")', async ({step}) => {
  const jsonValues = [
    false,
    2,
    null,
    'foo',
    [1, 2, 3, 'a', 'b', 'c', true, {foo: 'bar'}, null, [null, null]],
    {hello: 'world', foo: 2},
  ];

  type NarrowJsonValue = typeof jsonValues[number];
  type JsonEntry = Entry<string, NarrowJsonValue>;

  const entries = jsonValues.map((v, i) => [String(i), v]) as (
    ArrayWithAtLeastOneElement<JsonEntry>
  );

  const map = new Map<string, NarrowJsonValue>();
  const {json: kv} = openKVDb<NarrowJsonValue>();

  await step('set', () => {
    let lastMapSize = kv.size;
    let lastKvSize = kv.size;

    for (const [key, value] of entries) {
      map.set(key, value);
      assertStrictEquals(map.size, lastMapSize + 1);
      lastMapSize = map.size;

      kv.set(key, value);
      assertStrictEquals(kv.size, lastKvSize + 1);
      lastKvSize = kv.size;
    }
  });

  await step('has', () => {
    const [firstKey] = entries[0];
    assertStrictEquals(map.has(firstKey), true);
    assertStrictEquals(kv.has(firstKey), true);

    assertStrictEquals(map.has('not a key'), false);
    assertStrictEquals(kv.has('not a key'), false);
  });

  await step('get', () => {
    for (const [key] of entries) {
      const mapActual = map.get(key);
      const kvActual = kv.get(key);
      assertEquals(mapActual, kvActual);
    }
  });

  await step('keys', () => {
    assertArrayIncludes([...map.keys()], [...kv.keys()]);
  });

  await step('values', () => {
    assertArrayIncludes([...map.values()], [...kv.values()]);
  });

  await step('entries', () => {
    assertArrayIncludes([...map.entries()], [...kv.entries()]);
    assertArrayIncludes([...map], [...kv]);
  });

  await step('size', () => {
    assertStrictEquals(map.size, kv.size);
  });

  await step('delete', () => {
    const [firstKey] = entries[0];
    map.delete(firstKey);
    kv.delete(firstKey);

    assertStrictEquals(map.size, entries.length - 1);
    assertStrictEquals(map.size, kv.size);
  });

  await step('clear', () => {
    map.clear();
    kv.clear();

    assertStrictEquals(map.size, 0);
    assertStrictEquals(map.size, kv.size);
  });

  kv.close();
});
