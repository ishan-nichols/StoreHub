import { Queue, Worker, type Job } from "bullmq";
import { logger } from "./logger.js";
import {
  sendVerificationEmail, sendPasswordResetEmail,
  sendEmployeeInviteEmail, sendPayslipEmail,
} from "./email.js";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const emailQueue = new Queue("email", { connection });
export const reportQueue = new Queue("report", { connection });

// ─── Job Payload Types ────────────────────────────────────────────────────────

type EmailJob =
  | { type: "verify"; to: string; token: string }
  | { type: "password_reset"; to: string; token: string }
  | { type: "invite"; to: string; storeName: string; inviterName: string; token: string; roleName?: string; prefillName?: string }
  | { type: "payslip"; to: string; employeeName: string; storeName: string; periodStart: string; periodEnd: string; grossPay: string; netPay: string };

// ─── Enqueue helpers ──────────────────────────────────────────────────────────

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await emailQueue.add(job.type, job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

// ─── Workers ─────────────────────────────────────────────────────────────────

function startEmailWorker(): Worker {
  return new Worker(
    "email",
    async (job: Job<EmailJob>) => {
      const data = job.data;
      switch (data.type) {
        case "verify":
          await sendVerificationEmail(data.to, data.token);
          break;
        case "password_reset":
          await sendPasswordResetEmail(data.to, data.token);
          break;
        case "invite":
          await sendEmployeeInviteEmail(data);
          break;
        case "payslip":
          await sendPayslipEmail(data);
          break;
        default:
          logger.warn({ job: (data as { type: string }).type }, "Unknown email job type");
      }
    },
    { connection, concurrency: 5 },
  );
}

// ─── Startup ──────────────────────────────────────────────────────────────────

let started = false;

export function startWorkers(): void {
  if (started) return;
  started = true;

  const emailWorker = startEmailWorker();

  emailWorker.on("completed", (job) => logger.info({ jobId: job.id, type: job.name }, "Email job completed"));
  emailWorker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "Email job failed"));

  logger.info("BullMQ workers started");
}
