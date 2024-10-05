import { DB } from "./deps.ts";

const queryClear = `
DELETE FROM data;
`;

const queryCreateTable = `
CREATE TABLE IF NOT EXISTS data (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const queryDelete = `
DELETE FROM data
WHERE key = ?;
`;

const queryEntries = `
SELECT key, value
FROM data
ORDER BY key ASC;
`;

const queryGet = `
SELECT value
FROM data
WHERE key = ?;
`;

const queryHas = `
SELECT COUNT (key)
FROM data
WHERE key = ?;
`;

const queryKeys = `
SELECT key
FROM data
ORDER BY key ASC;
`;

const querySet = `
INSERT INTO data (key, value)
VALUES (?, ?)
ON CONFLICT (key) DO
UPDATE SET value = excluded.value;
`;

const querySize = `
SELECT COUNT (key)
FROM data;
`;

const queryValues = `
SELECT value
FROM data
ORDER BY key ASC;
`;

export class KVDbError extends Error {
	override name = "KVDbError";
}

function noop(): void {}

export type JsonValue =
	| boolean
	| number
	| null
	| string
	| JsonValue[]
	| { [key: string]: JsonValue | undefined };

export type Entry<K, V = K> = [key: K, value: V];

export type ExcludedKeys<
	A extends Record<PropertyKey, unknown>,
	B extends PropertyKey,
> = A & Partial<Record<Exclude<B, keyof A>, never>>;

export type MemoryStringOptions = ExcludedKeys<{ path: ":memory:" }, "memory">;
export type MemoryBooleanOptions = ExcludedKeys<{ memory: true }, "path">;
export type MemoryOptions = MemoryBooleanOptions | MemoryStringOptions;
export type PathObjectOptions = ExcludedKeys<{ path: string }, "memory">;
export type PathOptions = PathObjectOptions | string;
export type DbOptions = PathOptions | MemoryOptions;

export type BaseKVMethods = {
	clear: () => void;
	close: (force?: boolean) => void;
	delete: (key: string) => void;
	has: (key: string) => boolean;
	keys: () => IterableIterator<string>;
	readonly size: number;
};

export type TypedKVMethods<T = JsonValue> = {
	[Symbol.iterator]: () => IterableIterator<Entry<string, T>>;
	entries: () => IterableIterator<Entry<string, T>>;
	get: (key: string) => T | null;
	set: (key: string, value: T) => void;
	values: () => IterableIterator<T>;
};

export type KVDb<T = JsonValue> =
	& BaseKVMethods
	& TypedKVMethods<string>
	& { json: BaseKVMethods & TypedKVMethods<T> };

export function openKVDb<T = JsonValue>(options?: DbOptions): KVDb<T> {
	let dbPath: string | undefined = undefined;
	let dbOptions: { readonly memory: true } | undefined = undefined;
	if (options) {
		if (typeof options === "string") dbPath = options;
		else {
			if (options.memory) dbOptions = { memory: true };
			else dbPath = options.path;
		}
	}

	const db = new DB(dbPath, dbOptions);
	db.execute(queryCreateTable);

	const pqClear = db.prepareQuery<
		[],
		Record<never, never>,
		[]
	>(queryClear);

	const fnClear: () => void = () => pqClear.execute();

	const pqDelete = db.prepareQuery<
		[],
		Record<never, never>,
		[key: string]
	>(queryDelete);

	const fnDelete: (key: string) => void = (key) =>
		pqDelete.execute([String(key)]);

	const pqEntries = db.prepareQuery<
		Entry<string>,
		{ key: string; value: string },
		[]
	>(queryEntries);

	const fnEntries: () => IterableIterator<Entry<string>> = () =>
		pqEntries.iter();

	const fnEntriesJson: () => IterableIterator<Entry<string, T>> = function* () {
		const iter = pqEntries.iter();
		for (const [key, value] of iter) yield [key, JSON.parse(value)];
	};

	const pqGet = db.prepareQuery<
		[value: string],
		{ value: string },
		[key: string]
	>(queryGet);

	const fnGet: (key: string) => string | null = (key) => {
		const iter = pqGet.iter([String(key)]);
		const value = (iter.next().value as [value: string] | undefined)?.[0] ??
			null;
		return value;
	};

	const fnGetJson: (key: string) => T = (key) => {
		const iter = pqGet.iter([String(key)]);
		const value = (iter.next().value as [value: string] | undefined)?.[0] ??
			null;
		return typeof value === "string" ? JSON.parse(value) : null;
	};

	const pqHas = db.prepareQuery<
		[size: number],
		{ size: number },
		[key: string]
	>(queryHas);

	const fnHas: (key: string) => boolean = (key) => {
		const iter = pqHas.iter([String(key)]);
		const value = (iter.next().value as [size: number] | undefined)![0];
		return value === 1;
	};

	const pqKeys = db.prepareQuery<
		[key: string],
		{ key: string },
		[]
	>(queryKeys);

	const fnKeys: () => IterableIterator<string> = function* () {
		const iter = pqKeys.iter();
		for (const row of iter) yield row[0];
	};

	const pqSet = db.prepareQuery<
		[],
		Record<never, never>,
		Entry<string>
	>(querySet);

	const fnSet: (key: string, value: string) => void = (key, value) =>
		pqSet.execute([String(key), String(value)]);

	const fnSetJson: (key: string, value: T) => void = (key, value) =>
		pqSet.execute([String(key), JSON.stringify(value)]);

	const pqSize = db.prepareQuery<
		[size: number],
		{ size: number },
		[]
	>(querySize);

	const fnSize: () => number = () => {
		const iter = pqSize.iter();
		const value = (iter.next().value as [size: number] | undefined)![0];
		return value;
	};

	const pqValues = db.prepareQuery<
		[value: string],
		{ value: string },
		[]
	>(queryValues);

	const fnValues: () => IterableIterator<string> = function* () {
		const iter = pqValues.iter();
		for (const row of iter) yield row[0];
	};

	const fnValuesJson: () => IterableIterator<T> = function* () {
		const iter = pqValues.iter();
		for (const row of iter) yield JSON.parse(row[0]);
	};

	const kv: KVDb<T> = {
		[Symbol.iterator]: fnEntries,
		clear: fnClear,
		close: noop,
		delete: fnDelete,
		entries: fnEntries,
		get: fnGet,
		has: fnHas,
		json: {
			[Symbol.iterator]: fnEntriesJson,
			clear: fnClear,
			close: noop,
			delete: fnDelete,
			entries: fnEntriesJson,
			get: fnGetJson,
			has: fnHas,
			keys: fnKeys,
			set: fnSetJson,
			get size() {
				return fnSize();
			},
			values: fnValuesJson,
		},
		keys: fnKeys,
		set: fnSet,
		get size() {
			return fnSize();
		},
		values: fnValues,
	};

	function throwClosedError(): never {
		throw new KVDbError("Database is closed");
	}

	const fnClose: (force?: boolean) => void = (force) => {
		pqClear.finalize();
		pqDelete.finalize();
		pqEntries.finalize();
		pqGet.finalize();
		pqHas.finalize();
		pqKeys.finalize();
		pqSet.finalize();
		pqSize.finalize();
		pqValues.finalize();
		db.close(force);

		for (
			const key of [
				Symbol.iterator,
				"clear",
				"delete",
				"entries",
				"get",
				"has",
				"keys",
				"set",
				"values",
			] as const
		) {
			kv[key] = throwClosedError;
			kv.json[key] = throwClosedError;
		}

		for (const o of [kv, kv.json]) {
			Object.defineProperty(o, "size", {
				...Object.getOwnPropertyDescriptor(o, "size"),
				get: throwClosedError,
			});
		}
	};

	kv.close = fnClose;
	kv.json.close = fnClose;
	return kv;
}
