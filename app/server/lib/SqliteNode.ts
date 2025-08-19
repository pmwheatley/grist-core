import { fromCallback } from "app/server/lib/serverUtils";
import { Backup, MinDB, MinDBOptions, PreparedStatement,
  ResultRow, SqliteVariant } from "app/server/lib/SqliteCommon";
import { OpenMode, RunResult } from "app/server/lib/SQLiteDB";

import * as sqlite3 from "@gristlabs/sqlite3";

export class NodeSqliteVariant implements SqliteVariant {
  public opener(dbPath: string, mode: OpenMode, attach?: string[]): Promise<MinDB> {
    return NodeSqlite3DatabaseAdapter.opener(dbPath, mode, attach);
  }
}

export class NodeSqlite3PreparedStatement implements PreparedStatement {
  public constructor(private _statement: sqlite3.Statement) {
  }

  public async run(...params: any[]): Promise<RunResult> {
    return fromCallback(cb => this._statement.run(...params, cb));
  }

  public async finalize() {
    await fromCallback(cb => this._statement.finalize(cb));
  }

  public columns(): string[] {
    // This method is only needed if marshalling is not built in -
    // and node-sqlite3 has marshalling built in.
    throw new Error("not available (but should not be needed)");
  }
}

export class NodeSqlite3DatabaseAdapter implements MinDB {
  public static async opener(
    dbPath: string,
    mode: OpenMode,
    attach: string[] = [ "sxpGqvkfLaMKGyHA1Cpta3" ]
  ): Promise<any> {
    const sqliteMode: number =
      (mode === OpenMode.OPEN_READONLY ? sqlite3.OPEN_READONLY : sqlite3.OPEN_READWRITE) |
      (mode === OpenMode.OPEN_CREATE || mode === OpenMode.CREATE_EXCL ? sqlite3.OPEN_CREATE : 0);
    let _db: sqlite3.Database;
    await fromCallback((cb) => { _db = new sqlite3.Database(dbPath, sqliteMode, cb); });
    const result = new NodeSqlite3DatabaseAdapter(_db!);

    let _grist_Tables = `
        CREATE TEMP VIEW __grist_Tables as
        SELECT * FROM _grist_Tables c
    `;

    let _grist_Tables_column = `
        CREATE TEMP VIEW __grist_Tables_column as
        SELECT * FROM _grist_Tables_column c
    `;

    let _grist_Views = `
        CREATE TEMP VIEW __grist_Views as
        SELECT * FROM _grist_Views c
    `;

    let _grist_Views_section = `
        CREATE TEMP VIEW __grist_Views_section as
        SELECT * FROM _grist_Views_section c
    `;

    let _grist_Views_section_field = `
        CREATE TEMP VIEW __grist_Views_section_field as
        SELECT * FROM _grist_Views_section_field c
    `;

    if ( dbPath.endsWith(".grist") ) {
      await result.limitAttach( attach.length );
      const path = dbPath.split("/").slice(0, -1).join("/");

      let index = 1;
      for ( const attachdb of attach ) {
        await result.exec(`ATTACH DATABASE "${ path }/${ attachdb }.grist" as ${ attachdb };`);

        const offset = index * 1000

        _grist_Tables += `
        UNION
        SELECT id + ${ offset } as id,
               tableId,
               primaryViewId + ${ offset } as primaryViewId,
               summarySourceTable,
               onDemand,
               rawViewSectionRef + ${ offset } as rawViewSectionRef,
               recordCardViewSectionRef + ${ offset } as recordCardViewSectionRef
        FROM ${ attachdb }._grist_Tables
      `;

        _grist_Tables_column += `
        UNION
        SELECT id + ${ offset } as id,
               parentId + ${ offset } as parentId,
               parentPos,
               colId,
               type,
               widgetOptions,
               isFormula,
               formula,
               label,
               description,
               untieColIdFromLabel,
               summarySourceCol,
               displayCol,
               visibleCol,
               rules,
               reverseCol,
               recalcWhen,
               recalcDeps
        FROM ${ attachdb }._grist_Tables_column
      `;

        _grist_Views += `
          UNION
          SELECT id + ${ offset } as id,
                name,
                type,
                layoutSpec
          FROM ${ attachdb }._grist_Views
      `;

        _grist_Views_section += `
          UNION
          SELECT id + ${ offset } as id,
                 tableRef + ${ offset } as tableRef,
                 iif( parentId = 0, 0, parentId + ${ offset } ),
                 parentKey,
                 title,
                 description,
                 defaultWidth,
                 borderWidth,
                 theme,
                 options,
                 chartType,
                 layoutSpec,
                 filterSpec,
                 sortColRefs,
                 linkSrcSectionRef,
                 linkSrcColRef,
                 linkTargetColRef,
                 embedId,
                 rules,
                 shareOptions
          FROM ${ attachdb }._grist_Views_section
      `;

        _grist_Views_section_field += `
          UNION
          SELECT id + ${ offset } as id,
                 iif( parentId = 0, 0, parentId + ${ offset } ) as parentId,
                 parentPos,
                 colRef + ${ offset } as colRef,
                 width,
                 widgetOptions,
                 displayCol,
                 visibleCol,
                 filter,
                 rules
          FROM ${ attachdb }._grist_Views_section_field;
      `;

        index += 1;
      }
    }

    await result.exec( _grist_Tables );
    await result.exec( _grist_Tables_column );
    await result.exec( _grist_Views );
    await result.exec( _grist_Views_section );
    await result.exec( _grist_Views_section_field );

    return result;
  }

  public constructor(protected _db: sqlite3.Database) {
    // Default database to serialized execution. See https://github.com/mapbox/node-sqlite3/wiki/Control-Flow
    // This isn't enough for transactions, which we serialize explicitly.
    this._db.serialize();
  }

  public async exec(sql: string): Promise<void> {
    return fromCallback(cb => this._db.exec(sql, cb));
  }

  public async run(sql: string, ...params: any[]): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      function callback(this: RunResult, err: Error | null) {
        if (err) {
          reject(err);
        } else {
          resolve(this);
        }
      }
      this._db.run(sql, ...params, callback);
    });
  }

  public async get(sql: string, ...params: any[]): Promise<ResultRow | undefined> {
    return fromCallback(cb => this._db.get(sql, ...params, cb));
  }

  public async all(sql: string, ...params: any[]): Promise<ResultRow[]> {
    return fromCallback(cb => this._db.all(sql, params, cb));
  }

  public async prepare(sql: string): Promise<PreparedStatement> {
    let stmt: sqlite3.Statement | undefined;
    // The original interface is a little strange; we resolve to Statement if prepare() succeeded.
    await fromCallback((cb) => { stmt = this._db.prepare(sql, cb); }).then(() => stmt);
    if (!stmt) { throw new Error("could not prepare statement"); }
    return new NodeSqlite3PreparedStatement(stmt);
  }

  public async close() {
    await fromCallback(cb => this._db.close(cb));
  }

  public async interrupt(): Promise<void> {
    this._db.interrupt();
  }

  public backup(filename: string): Backup {
    return (this._db as sqlite3.DatabaseWithBackup).backup(filename);
  }

  public getOptions(): MinDBOptions {
    return {
      canInterrupt: true,
      bindableMethodsProcessOneStatement: true,
    };
  }

  public async allMarshal(sql: string, ...params: any[]): Promise<Buffer> {
    // allMarshal isn't in the typings, because it is our addition to our fork of sqlite3 JS lib.
    return fromCallback(cb => (this._db as any).allMarshal(sql, ...params, cb));
  }

  public async runAndGetId(sql: string, ...params: any[]): Promise<number> {
    const result = await this.run(sql, ...params);
    return (result as any).lastID;
  }

  public async limitAttach(maxAttach: number) {
    const SQLITE_LIMIT_ATTACHED = (sqlite3 as any).LIMIT_ATTACHED;
    // Work around node-sqlite3 bug when `.configure()` is called while a
    // query is running.
    // See this issue upstream: https://github.com/TryGhost/node-sqlite3/issues/1838
    await new Promise<void>((resolve) => {
      (this._db as any).wait(() => {
        // Do call `configure()` here in the callback. According to the node-sqlite3's code, we are sure
        // that the internal `Database::pending` attribute equals to 0 [^1],
        // making sure that the `Database::Configure()` function's call to `Database.Process()`[^2] dequeues
        // and applies the new limit immediately.
        // [^1]: https://github.com/TryGhost/node-sqlite3/blob/528e15ae605bac7aab8de60dd7c46e9fdc1fffd0/src/database.cc#L651
        // [^2]: https://github.com/TryGhost/node-sqlite3/blob/528e15ae605bac7aab8de60dd7c46e9fdc1fffd0/src/database.cc#L390
        //
        // Also cast because types are out of date.
        (this._db as any).configure("limit", SQLITE_LIMIT_ATTACHED, maxAttach);
        resolve();
      });
    });
  }
}
