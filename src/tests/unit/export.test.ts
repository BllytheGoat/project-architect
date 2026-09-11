// Unit tests for multi-doc export (§40), integrity validation (§42), and the
// deterministic ZIP writer.
import { describe, it, expect } from "vitest";
import { seedState } from "@/types";
import type { ProjectState, Conflict } from "@/types";
import { renderAllDocuments } from "@/lib/export/documents";
import { validateExport } from "@/lib/export/integrity";
import { makeZip, crc32 } from "@/lib/export/zip";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

const F1 = "a1000000-0000-4000-8000-000000000001";

function empty(): ProjectState {
  return seedState("A brand-new idea with nothing filled in yet.");
}

function populated(): ProjectState {
  const s = seedState("Teams share study notes and quiz each other.");
  s.project.goals = ["Let students share notes."];
  s.project.targetUsers = ["students"];
  s.features = [
    {
      id: F1,
      name: "Note sharing",
      description: "d",
      priority: "must_have",
      status: "confirmed",
      source: "user",
      ref: "FEAT-001",
    },
  ];
  s.requirements = [
    { id: "FR-001", type: "functional", title: "Upload a note", description: "d", priority: "critical", status: "confirmed" },
  ];
  s.security = { accessControl: "Owners only." };
  s.architecture = { database: "PostgreSQL", backend: "Next.js API", frontend: "Next.js", auth: "Sessions" };
  s.version = 2;
  return s;
}

describe("renderAllDocuments", () => {
  it("always emits the full document set regardless of how much is filled in", () => {
    const { files, order } = renderAllDocuments(empty());
    for (const name of order) expect(files[name]).toBeTruthy();
    expect(order).toContain("PROJECT.md");
    expect(order).toContain("BUILD.md");
    expect(order.length).toBe(Object.keys(files).length);
  });

  it("never invents content: empty state renders the placeholder, not fabricated sections", () => {
    const { files } = renderAllDocuments(empty());
    // The architecture doc has no components -> the placeholder is used.
    expect(files["ARCHITECTURE.md"]).toContain("Not yet specified.");
    // A database doc with no entities must not fabricate table names.
    expect(files["DATABASE.md"]).toContain("Not yet specified.");
  });

  it("surfaces real entities when present", () => {
    const { files } = renderAllDocuments(populated());
    // The architecture doc renders state.architecture.database (not the entity list).
    expect(files["ARCHITECTURE.md"]).toMatch(/PostgreSQL/);
    expect(files["PROJECT.md"]).toContain("Note sharing");
  });

  it("is deterministic for a fixed state", () => {
    const a = renderAllDocuments(populated());
    const b = renderAllDocuments(populated());
    expect(JSON.stringify(a.files)).toBe(JSON.stringify(b.files));
  });
});

describe("validateExport", () => {
  it("passes a clean, populated export", () => {
    const s = populated();
    const docs = renderAllDocuments(s).files;
    const res = validateExport(s, docs);
    expect(res.ok).toBe(true);
    expect(res.problems).toHaveLength(0);
  });

  it("rejects an export when a required doc is missing", () => {
    const s = populated();
    const docs = { "PROJECT.md": "# x", "BUILD.md": "" } as Record<string, string>;
    expect(validateExport(s, docs).ok).toBe(false);
  });

  it("rejects an export with an open critical conflict (hard gate)", () => {
    const s = populated();
    s.conflicts = [
      {
        id: "c-1",
        earlierTopic: "Security",
        earlierValue: "a",
        laterTopic: "Security",
        laterValue: "b",
        status: "open",
        severity: "critical",
      } as Conflict,
    ];
    const res = validateExport(s, renderAllDocuments(s).files);
    expect(res.ok).toBe(false);
    expect(res.problems.some((p) => /critical conflict/i.test(p))).toBe(true);
  });

  it("rejects a broken cross-reference to an unknown feature", () => {
    const s = populated();
    s.requirements = [
      {
        id: "FR-001",
        type: "functional",
        title: "Upload a note",
        description: "d",
        priority: "critical",
        status: "confirmed",
        featureId: "not-a-real-uuid" as unknown as typeof s.requirements[0]["featureId"],
      },
    ];
    const res = validateExport(s, renderAllDocuments(s).files);
    expect(res.ok).toBe(false);
  });
});

describe("makeZip", () => {
  it("is deterministic: same files -> identical bytes", () => {
    const files = { "a.txt": "alpha", "b.txt": "beta" };
    expect(makeZip(files).equals(makeZip(files))).toBe(true);
  });

  it("embeds each file's name and content and computes a stable CRC", () => {
    const files: Record<string, string> = { "PROJECT.md": "# Project", "BUILD.md": "# Build" };
    const buf = makeZip(files);
    // File names must be recoverable from the byte stream.
    expect(buf.toString("utf8")).toContain("PROJECT.md");
    expect(buf.toString("utf8")).toContain("BUILD.md");
    // Content must be present (store method = no compression).
    expect(buf.toString("utf8")).toContain("# Project");
    // CRC must be deterministic for identical bytes.
    expect(crc32(Buffer.from("BUILD.md", "utf8"))).toBe(crc32(Buffer.from("BUILD.md", "utf8")));
  });

  it("produces a real, extractable archive (validated with Python zipfile)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zipcheck-"));
    const target = path.join(dir, "out.zip");
    // A "two\\nthree" in this TS source becomes the Python literal "two\\nthree",
    // which Python reads back as a real newline — exercising the hard byte case.
    fs.writeFileSync(target, makeZip({ "A.txt": "one", "B.txt": "two\nthree" }));
    const pyPath = path.join(dir, "check.py");
    fs.writeFileSync(
      pyPath,
      [
        "import sys, zipfile",
        "z = zipfile.ZipFile(sys.argv[1])",
        "assert z.testzip() is None, 'CRC/zip error'",
        "assert sorted(z.namelist()) == ['A.txt', 'B.txt'], z.namelist()",
        "assert z.read('A.txt').decode('utf8') == 'one'",
        "assert z.read('B.txt').decode('utf8') == 'two\\nthree', repr(z.read('B.txt'))",
        "print('OK')",
      ].join("\n") + "\n",
    );
    const out = execSync(`python3 ${JSON.stringify(pyPath)} ${JSON.stringify(target)}`, {
      encoding: "utf8",
    });
    expect(out.trim()).toBe("OK");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
