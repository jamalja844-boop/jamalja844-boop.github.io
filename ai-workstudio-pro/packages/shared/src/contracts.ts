import { z } from "zod";

/** Getypeerde API-contracten die door web, desktop, Chrome-extensie en worker worden gedeeld. */

export const DOCUMENT_KINDS = ["email", "reply", "document", "report", "translation", "summary", "analysis", "message", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const saveDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  kind: z.enum(DOCUMENT_KINDS).default("document"),
  content: z.string().max(500_000),
  metadata: z.record(z.string(), z.unknown()).default({}),
  conversationId: z.string().uuid().nullable().optional(),
  shared: z.boolean().default(false),
});
export type SaveDocumentInput = z.infer<typeof saveDocumentSchema>;

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(500_000).optional(),
  kind: z.enum(DOCUMENT_KINDS).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "approved", "archived"]).optional(),
  shared: z.boolean().optional(),
  versionNote: z.string().max(300).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().max(1000).default(""),
  source: z.discriminatedUnion("type", [
    z.object({ type: z.literal("template"), template: z.enum(["node-starter", "empty"]) }),
    z.object({ type: z.literal("git"), url: z.string().url().max(500), branch: z.string().max(100).optional() }),
    z.object({ type: z.literal("github"), repo: z.string().regex(/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/), branch: z.string().max(100).optional() }),
  ]),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const runCommandSchema = z.object({
  command: z.string().trim().min(1).max(2000),
});

export const writeFileSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(2_000_000),
});

export const startCodeTaskSchema = z.object({
  prompt: z.string().trim().min(3).max(20_000),
  provider: z.string().max(30).optional(),
  modelId: z.string().max(120).optional(),
  conversationId: z.string().uuid().nullable().optional(),
  maxSteps: z.number().int().min(1).max(40).default(16),
  /** Werk op een nieuwe branch (ai/…), aanbevolen voor GitHub-projecten. */
  newBranch: z.boolean().default(false),
});

export type CodeTaskStatus = "queued" | "planning" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled" | "limit_reached";

export interface CodeTaskStepView {
  id: number;
  step_index: number;
  kind: "plan" | "read" | "write" | "edit" | "command" | "git" | "search" | "message" | "approval" | "error" | "final";
  title: string;
  detail: string;
  data: Record<string, unknown> | null;
  status: "ok" | "error" | "waiting";
  created_at: string;
}

export interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  network: boolean;
}

/** Artefacten die AI Chat bij een antwoord kan tonen. */
export type ChatArtifact =
  | { type: "email"; subject: string; body: string; to?: string | null }
  | { type: "text"; title: string; kind: DocumentKind }
  | { type: "document"; documentId: string; title: string }
  | { type: "code_task"; taskId: string; projectId: string; projectName: string }
  | { type: "file"; fileId: string; filename: string; format: "xlsx" | "docx" | "pdf"; sizeBytes: number; sheets?: { name: string; rows: number }[] }
  | { type: "notice"; title: string; missing: string[] };
