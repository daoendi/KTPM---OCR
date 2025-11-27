import { jobQueue } from "./queue.js";
import { redisClient } from "./redisClient.js";

export async function getJobState(id) {
  const job = await jobQueue.getJob(id);
  if (!job) return { status: "not_found" };

  const state = await job.getState();
  let result = null;

  if (state === "completed") {
    const json = await redisClient.get(`job:${id}:result`);
    if (json) result = JSON.parse(json);
  }

  return {
    id,
    state,
    progress: job.progress,
    result,
  };
}
