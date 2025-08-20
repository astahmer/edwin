import {
  type KyselyPlugin,
  OperationNodeTransformer,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type PrimitiveValueListNode,
  type QueryResult,
  type RootOperationNode,
  type UnknownRow,
  type ValueNode,
} from "kysely";
import * as tables from "./schema.ts";

const timestampColumns = new Set<string>();
Object.values(tables).forEach((table) => {
  Object.values(table).forEach((field) => {
    if (field.dataType === "date") {
      timestampColumns.add(field.name);
    }
  });
});

export class SqliteDataTypePlugin implements KyselyPlugin {
  readonly #transformer = new SqliteDataTypeTransformer();

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return this.#transformer.transformNode(args.node);
  }

  transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    return Promise.resolve({
      ...args.result,
      rows: args.result.rows.map((row) => {
        if (row && typeof row === "object") {
          const transformed: any = Object.assign({}, row);
          for (const [key, val] of Object.entries(row)) {
            if (timestampColumns.has(key) && typeof val === "number") {
              // Convert Unix timestamp back to Date object
              transformed[key] = new Date(val * 1000);
            } else {
              transformed[key] = val;
            }
          }
          return transformed;
        }

        return row;
      }),
    });
  }
}

class SqliteDataTypeTransformer extends OperationNodeTransformer {
  override transformValue(node: ValueNode): ValueNode {
    return {
      ...super.transformValue(node),
      value: this.serialize(node.value),
    };
  }

  transformPrimitiveValueList(node: PrimitiveValueListNode): PrimitiveValueListNode {
    return {
      ...super.transformPrimitiveValueList(node),
      values: node.values.map((value) => this.serialize(value)),
    };
  }

  private serialize(value: unknown) {
    if (value instanceof Date) {
      // Convert Date to Unix timestamp in seconds
      return Math.floor(value.getTime() / 1000);
    }
    return typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
}
