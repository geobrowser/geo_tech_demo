/**
 * Geo SDK Demo — Publishing Entities to the Knowledge Graph
 *
 * This script demonstrates how to:
 *   1. Read entity data from JSON files
 *   2. Convert them into Graph operations using the Geo SDK
 *   3. Publish the operations to a space on the Geo testnet
 *
 * Usage:
 *   bun run demo_publish.ts
 *
 * Prerequisites:
 *   - Set DEMO_SPACE_ID in .env to the space you want to publish to
 *   - Set PK_SW to the private key of your smart wallet
 */

import * as fs from "fs";
import dotenv from "dotenv";
import { Graph, Position, type Op, ContentIds } from "@geoprotocol/geo-sdk";
import { printOps, publishOps } from "./src/functions";

dotenv.config();

// ─── Known Entity IDs from the Knowledge Graph Ontology ──────────────────────
// These are system properties and types defined in the root space.
// See knowledge-graph-ontology.md for the full registry.

const TYPES = {
  person:     "7ed45f2bc48b419e8e4664d5ff680b0d",
  project:    "484a18c5030a499cb0f2ef588ff16d50",
  topic:      "5ef5a5860f274d8e8f6c59ae5b3e89e2",
  text_block: "76474f2f00894e77a0410b39fb17d0bf",  // Text Block — rich markdown content
  data_block: "b8803a8665de412bbb357e0c84adf473",  // Data Block — renders query or collection results
  image:      "ba4e41460010499da0a3caaa7f579d0e",  // Image — media entity with IPFS URL
};

const PROPERTIES = {
  name:             "a126ca530c8e48d5b88882c734c38935",
  description:      "9b1f76ff9711404c861e59dc3fa7d037",
  types:            "8f151ba4de204e3c9cb499ddf96f48f1",
  web_url:          "eed38e74e67946bf8a42ea3e4f8fb5fb",
  birth_date:       "60f8b943d9a742109356fc108ee7212c",
  date_founded:     "41aa3d9847b64a97b7ec427e575b910e",
  topics:           "458fbc070dbf4c928f5716f3fdde7c32",
  blocks:           "beaba5cba67741a8b35377030613fc70",  // Blocks relation — attaches blocks to a parent entity
  markdown_content: "e3e363d1dd294ccb8e6ff3b76d99bc33",  // Markdown body for a text block
  data_source_type: "1f69cc9880d444abad493df6a7b15ee4",  // Declares query vs collection data source
  filter:           "14a46854bfd14b1882152785c2dab9f3",  // JSON-encoded filter for data blocks
  collection_item:  "a99f9ce12ffa4dac8c61f6310d46064a",  // Points to an entity in a collection
  view:             "1907fd1c81114a3ca378b1f353425b65",  // View preference on a Blocks relation
};

// ─── Property Registry ──────────────────────────────────────────────────────
// Maps JSON field names to their property ID and value type.
// To add a new property, just add an entry here — no other code changes needed.

const VALUE_PROPERTIES: Record<string, { id: string; type: "text" | "date" }> = {
  web_url:      { id: PROPERTIES.web_url,      type: "text" },
  birth_date:   { id: PROPERTIES.birth_date,   type: "date" },
  date_founded: { id: PROPERTIES.date_founded,  type: "date" },
};

// Build a values array from any entity data object using the registry above.
// Date values should be RFC 3339 strings (e.g. "2023-01-01") — the SDK parses them internally.
function extractValues(data: Record<string, any>) {
  const values: any[] = [];
  for (const [field, meta] of Object.entries(VALUE_PROPERTIES)) {
    if (data[field] != null) {
      values.push({ property: meta.id, type: meta.type, value: data[field] });
    }
  }
  return values;
}

// Data source type entities (singletons in the root space)
const QUERY_DATA_SOURCE      = "3b069b04adbe4728917d1283fd4ac27e";
const COLLECTION_DATA_SOURCE = "1295037a5d9c4d09b27c5502654b9177";

// View type entities
const VIEWS = {
  table:   "cba271cef7c140339047614d174c69f1",  // Table view (default)
  list:    "7d497dba09c249b8968f716bcf520473",  // List view
  gallery: "ccb70fc917f04a54b86e3b4d20cc7130",  // Gallery / grid view
  bullets: "0aaac6f7c916403eaf6d2e086dc92ada",  // Bulleted list view
};

// ─── JSON Data Types ─────────────────────────────────────────────────────────

type TopicData = {
  name: string;
  description: string;
};

type PersonData = {
  name: string;
  description: string;
  web_url?: string;
  birth_date?: string;
  topics?: string[];
};

type ProjectData = {
  name: string;
  description: string;
  web_url?: string;
  date_founded?: string;
  topics?: string[];
  avatar_url?: string;
  blocks?: string[];
};

// ─── Main: Build Entities & Publish ──────────────────────────────────────────

async function main() {
  console.log("=== Geo SDK Demo: Publishing Entities ===\n");

  // ── Step 1: Read JSON data ──────────────────────────────────────────────
  console.log("Step 1: Reading entity data from JSON files...");

  const topics: TopicData[] = JSON.parse(
    fs.readFileSync("./data_to_publish/topics.json", "utf-8")
  );
  const people: PersonData[] = JSON.parse(
    fs.readFileSync("./data_to_publish/people.json", "utf-8")
  );
  const projects: ProjectData[] = JSON.parse(
    fs.readFileSync("./data_to_publish/projects.json", "utf-8")
  );

  console.log(`  Loaded: ${topics.length} topics, ${people.length} people, ${projects.length} projects\n`);

  const allOps: Op[] = [];

  // ── Step 2: Create Topic entities ───────────────────────────────────────
  // Topics have no dependencies, so we create them first.
  console.log("Step 2: Creating Topic entities...");

  const topicIdsByName: Record<string, string> = {};

  for (const topic of topics) {
    const { id, ops } = Graph.createEntity({
      name: topic.name,
      description: topic.description,
      types: [TYPES.topic],
    });

    topicIdsByName[topic.name] = id;
    allOps.push(...ops);
    console.log(`  Created topic: "${topic.name}" → ${id}`);
  }

  // ── Step 3: Create Person entities ──────────────────────────────────────
  // People can have relations to Topics.
  console.log("\nStep 3: Creating Person entities...");

  const personIdsByName: Record<string, string> = {};

  for (const person of people) {
    const values = extractValues(person);

    // Build topic relations
    const topicRelations = (person.topics || [])
      .filter((t) => topicIdsByName[t])
      .map((t) => ({ toEntity: topicIdsByName[t] }));

    const relations: Record<string, Array<{ toEntity: string }>> = {};
    if (topicRelations.length > 0) {
      relations[PROPERTIES.topics] = topicRelations;
    }

    const { id, ops } = Graph.createEntity({
      name: person.name,
      description: person.description,
      types: [TYPES.person],
      values,
      relations,
    });

    personIdsByName[person.name] = id;
    allOps.push(...ops);
    console.log(`  Created person: "${person.name}" → ${id}`);
  }

  // ── Step 4: Create Project entities ─────────────────────────────────────
  // Projects can have a date_founded and relations to Topics.
  console.log("\nStep 4: Creating Project entities...");

  const projectIdsByName: Record<string, string> = {};

  for (const project of projects) {
    const values = extractValues(project);

    const topicRelations = (project.topics || [])
      .filter((t) => topicIdsByName[t])
      .map((t) => ({ toEntity: topicIdsByName[t] }));

    const relations: Record<string, Array<{ toEntity: string }>> = {};
    if (topicRelations.length > 0) {
      relations[PROPERTIES.topics] = topicRelations;
    }

    const { id, ops } = Graph.createEntity({
      name: project.name,
      description: project.description,
      types: [TYPES.project],
      values,
      relations,
    });

    projectIdsByName[project.name] = id;
    allOps.push(...ops);
    console.log(`  Created project: "${project.name}" → ${id}`);
  }

  // ── Step 5: Add Text Blocks to entities that have them ─────────────────
  // Blocks are standalone entities attached to a parent via the Blocks
  // relation. Each relation carries a `position` string for ordering
  // (fractional indexing — positions sort lexicographically).
  //
  // Each line of content is its own Text Block entity:
  //   - type:  Text Block  (76474f2f…)
  //   - value: Markdown content  (e3e363d1…)  →  a single line / paragraph
  //
  // Every block gets its own Blocks relation from the parent entity,
  // with a `position` string that controls rendering order.
  // Position.generateBetween(after, null) produces a position that sorts
  // after the given one.  We track the last position per entity so every
  // block (text blocks first, then data blocks) is ordered correctly.
  console.log("\nStep 5: Adding Text Blocks from JSON data...");

  const lastPosByEntity: Record<string, string> = {};
  let pos: string;

  for (const project of projects) {
    if (!project.blocks || project.blocks.length === 0) continue;

    const parentId = projectIdsByName[project.name];
    console.log(`  Adding ${project.blocks.length} text blocks to "${project.name}"...`);

    for (const line of project.blocks) {
      const { id: blockId, ops: blockOps } = Graph.createEntity({
        types: [TYPES.text_block],
        values: [
          {
            property: PROPERTIES.markdown_content,
            type: "text",
            value: line,
          },
        ],
      });
      allOps.push(...blockOps);

      pos = Position.generateBetween(lastPosByEntity[parentId] ?? null, null);
      lastPosByEntity[parentId] = pos;
      const { ops: relOps } = Graph.createRelation({
        fromEntity: parentId,
        toEntity: blockId,
        type: PROPERTIES.blocks,
        position: pos,
      });
      allOps.push(...relOps);

      const preview = line.length > 50 ? line.slice(0, 50) + "…" : line;
      console.log(`    Block ${blockId}  pos: ${pos}  "${preview}"`);
    }
  }

  // ── 5b: Avatar Images ────────────────────────────────────────────────
  // Graph.createImage() fetches the image, uploads it to IPFS, and returns
  // an Image entity with the IPFS URL, width, and height set automatically.
  // The entity's type is automatically set to Image (ba4e4146…).

  for (const project of projects) {
    if (!project.avatar_url) continue;

    const parentId = projectIdsByName[project.name];
    console.log(`\n  Uploading avatar for "${project.name}" to IPFS...`);

    const { id: imageId, ops: imageOps, cid: imageCid } = await Graph.createImage({
      url: project.avatar_url,
      name: `${project.name} Avatar`,
      network: "TESTNET",
    });
    allOps.push(...imageOps);
    console.log(`  Created image entity: ${imageId} (IPFS CID: ${imageCid})`);

    const { ops: attachImageOps } = Graph.createRelation({
      fromEntity: parentId,
      toEntity: imageId,
      type: ContentIds.AVATAR_PROPERTY,
    });
    allOps.push(...attachImageOps);
    console.log(`  Attached image as avatar`);
  }

  const ethereumId = projectIdsByName["Ethereum"];

  // ── Step 6: Add Data Blocks (Query + Collection) ──────────────────────────
  // Data Blocks render structured results inside an entity page.
  // There are two flavours:
  //
  //   Query Data Block   — a live, declarative query evaluated at render time.
  //                         Defined by a JSON filter + the Query data source marker.
  //
  //   Collection Data Block — a fixed, hand-picked set of entities.
  //                         Defined by Collection item relations + the Collection
  //                         data source marker.
  //
  // Both are regular Data Block entities (type b8803a86…).
  // A *View* (Table, List, Gallery, Bullets) can be set on the Blocks
  // relation via the `entityRelations` parameter — this decorates the
  // relation entity with a View relation.
  console.log("\nStep 6: Adding Data Blocks (Query + Collection) to Ethereum...");

  // ── 6a: Query Data Block — "Related Topics" ───────────────────────────
  // This block renders all Topic-typed entities in the space at view time.
  // The filter JSON mirrors what the Geo Browser stores natively:
  //   { "filter": { "<TYPES property id>": { "is": "<Topic type id>" } } }
  const queryFilter = JSON.stringify({
    spaceId: { 
      in: [process.env.DEMO_SPACE_ID]
    },
    filter: {
      [PROPERTIES.types]: { is: TYPES.topic },
    },
  });

  const { id: queryBlockId, ops: queryBlockOps } = Graph.createEntity({
    name: "Related Topics",
    types: [TYPES.data_block],
    values: [
      {
        property: PROPERTIES.filter,
        type: "text",
        value: queryFilter,
      },
    ],
    relations: {
      // Point to the Query data source singleton to mark this as a live query
      [PROPERTIES.data_source_type]: { toEntity: QUERY_DATA_SOURCE },
    },
  });
  allOps.push(...queryBlockOps);
  console.log(`  Created query data block ("Related Topics"): ${queryBlockId}`);
  console.log(`    Filter: ${queryFilter}`);

  // Attach to Ethereum with a Gallery view — position after last text block
  pos = Position.generateBetween(lastPosByEntity[ethereumId] ?? null, null);
  lastPosByEntity[ethereumId] = pos;
  const { ops: attachQueryOps } = Graph.createRelation({
    fromEntity: ethereumId,
    toEntity: queryBlockId,
    type: PROPERTIES.blocks,
    position: pos,
    // The View is set on the *relation entity* — this is the entity that
    // represents the Blocks relation itself.  entityRelations lets you
    // add relations to that implicit entity.
    entityRelations: {
      [PROPERTIES.view]: { toEntity: VIEWS.gallery },
    },
  });
  allOps.push(...attachQueryOps);
  console.log(`  Attached query block      → position: ${pos}  (Gallery view)`);

  // ── 6b: Collection Data Block — "Key People" ─────────────────────────
  // This block shows a hand-picked, ordered list of entities.
  // Each entity is added via a Collection item relation.
  const vitalikId = personIdsByName["Vitalik Buterin"];
  const satoshiId = personIdsByName["Satoshi Nakamoto"];

  const { id: collectionBlockId, ops: collectionBlockOps } = Graph.createEntity({
    name: "Key People",
    types: [TYPES.data_block],
    relations: {
      // Mark as a Collection data source
      [PROPERTIES.data_source_type]: { toEntity: COLLECTION_DATA_SOURCE },
      // Add each person as a collection item (order follows array order)
      [PROPERTIES.collection_item]: [
        { toEntity: vitalikId },
        { toEntity: satoshiId },
      ],
    },
  });
  allOps.push(...collectionBlockOps);
  console.log(`  Created collection data block ("Key People"): ${collectionBlockId}`);
  console.log(`    Items: Vitalik Buterin (${vitalikId}), Satoshi Nakamoto (${satoshiId})`);

  // Attach to Ethereum with a List view — position after query block
  pos = Position.generateBetween(lastPosByEntity[ethereumId] ?? null, null);
  lastPosByEntity[ethereumId] = pos;
  const { ops: attachCollectionOps } = Graph.createRelation({
    fromEntity: ethereumId,
    toEntity: collectionBlockId,
    type: PROPERTIES.blocks,
    position: pos,
    entityRelations: {
      [PROPERTIES.view]: { toEntity: VIEWS.list },
    },
  });
  allOps.push(...attachCollectionOps);
  console.log(`  Attached collection block → position: ${pos}  (List view)`);

  // ── Step 7: Summary ───────────────────────────────────────────────────────
  console.log(`\n--- Summary ---`);
  console.log(`Total operations generated: ${allOps.length}`);
  console.log(`Operation breakdown:`);

  const opCounts: Record<string, number> = {};
  for (const op of allOps) {
    opCounts[op.type] = (opCounts[op.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(opCounts)) {
    console.log(`  ${type}: ${count}`);
  }

  // ── Step 8: Publish ───────────────────────────────────────────────────────
  console.log("\nStep 8: Publishing to the Geo knowledge graph...");
  printOps(allOps, "data_to_delete", "demo_publish_ops.txt")
  const txHash = await publishOps(allOps, "Demo: publish sample entities");
  console.log(`\nDone! Transaction: ${txHash}`);

  // ── Step 9: How to verify ─────────────────────────────────────────────────
  const spaceId = process.env.DEMO_SPACE_ID;
  console.log(`\nVerify your entities at:`);
  console.log(`  https://geobrowser.io/space/${spaceId}`);
  console.log(`\nOr query the API with: bun run demo_api.ts`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
