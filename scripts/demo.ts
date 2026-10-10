import { InMemoryPostService } from "../packages/core/src/index.js";
import { simplePost } from "../tests/fixtures.js";

const service = new InMemoryPostService();
const actor = { userId: "local-demo-user" };
const { draftId } = service.createDraft(actor, simplePost());
const { post } = service.publish(actor, draftId);
console.log("Local domain demo only; no server, AI call, or code execution.");
console.log(JSON.stringify({ postId: post.id, packageDigest: post.packageDigest }, null, 2));
for (const event of service.getEvents()) console.log(JSON.stringify(event));
