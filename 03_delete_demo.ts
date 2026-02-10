import fs from 'fs';
import path from 'path';
import { Graph, type Op } from '@geoprotocol/geo-sdk';
import { printOps, publishOps } from './src/functions';

function readOpsFromFile(dir_in: string, fn: string): any {
  const filePath = path.join(dir_in, fn);

  if (!fs.existsSync(filePath)) {
    console.error(`File ${fn} does not exist`);
    return null;
  }

  const fileContents = fs.readFileSync(filePath, 'utf-8');

  try {
    const ops = JSON.parse(fileContents);
    console.log(`Read ${ops.length} ops from ${fn}`);
    return ops;
  } catch (err) {
    console.error(`Failed to parse JSON from file ${fn}`, err);
    return null;
  }
}

function getPropertyIdsFromUpdateOp(ops: any[], entityId: string): string[] {
  const updateOp = ops.find(op =>
    op.type === "createEntity" && op.id === entityId
  );

  if (!updateOp || !Array.isArray(updateOp.values)) {
    return [];
  }

  return updateOp.values
    .map((value: any) => value.property)
    .filter((propertyId: any) => propertyId !== undefined && propertyId !== null);
}


const del_ops: Array<Op> = [];
let addOps;

const dir_in = "data_to_delete";
const fn = "demo_publish_ops.txt";
const ops = readOpsFromFile(dir_in, fn);

const updateEntityIds = ops
  .filter((op: any) => op.type === "createEntity")
  .map((op: any) => op.id);

const uniqueEntityIds: any[] = [...new Set(updateEntityIds)];

for (const entityId of uniqueEntityIds) {
    const properties = getPropertyIdsFromUpdateOp(ops, entityId);
    if (properties.length > 0) {
        addOps = Graph.updateEntity({
            id: entityId,
            unset: properties.map(p => ({ property: p }))
        });
        del_ops.push(...addOps.ops);
    }
}

const createRelationIds = ops
  .filter((op: any) => op.type === "createRelation")
  .map((op: any) => op.id);

const uniqueRelationIds: any[] = [...new Set(createRelationIds)];

for (const relationId of uniqueRelationIds) {
    addOps = Graph.deleteRelation({id: relationId});
    del_ops.push(...addOps.ops);
}

printOps(del_ops, dir_in, "delete_ops_output.txt")

const txHash = await publishOps(del_ops, "Demo: delete sample entities");