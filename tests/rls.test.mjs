// Verifies user isolation against a running Supabase (local or remote).
// Usage: node --env-file=.env.local --test tests/rls.test.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { test } from "node:test";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BUCKET = "note-assets";

async function newUser() {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const email = `rls-${crypto.randomUUID()}@example.com`;
  const { data, error } = await sb.auth.signUp({ email, password: "password-1234" });
  assert.ifError(error);
  assert.ok(data.session, "sign-up must return a session (disable email confirmation for tests)");
  return { sb, id: data.user.id };
}

test("users cannot see or change each other's notes and files", async () => {
  const a = await newUser();
  const b = await newUser();
  const anon = createClient(url, key, { auth: { persistSession: false } });

  // A creates a note and uploads a file.
  const { data: note, error } = await a.sb
    .from("notes")
    .insert({ title: "A secret", content_text: "top secret", tags: ["private"] })
    .select()
    .single();
  assert.ifError(error);
  assert.equal(note.user_id, a.id);

  const path = `${a.id}/${note.id}/secret.txt`;
  const up = await a.sb.storage.from(BUCKET).upload(path, new Blob(["hello"]), { contentType: "text/plain" });
  assert.ifError(up.error);
  const att = await a.sb.from("attachments").insert({
    note_id: note.id, storage_path: path, file_name: "secret.txt", mime_type: "text/plain", size_bytes: 5,
  });
  assert.ifError(att.error);

  // A can read own data.
  const own = await a.sb.from("notes").select("id").eq("id", note.id);
  assert.equal(own.data.length, 1);
  const ownDl = await a.sb.storage.from(BUCKET).download(path);
  assert.ifError(ownDl.error);

  // B sees nothing.
  assert.deepEqual((await b.sb.from("notes").select("id")).data, []);
  assert.deepEqual((await b.sb.from("notes").select("id").eq("id", note.id)).data, []);
  assert.deepEqual((await b.sb.from("attachments").select("id")).data, []);
  const search = await b.sb.from("notes").select("id").textSearch("search", "secret");
  assert.deepEqual(search.data, []);

  // B cannot modify or delete A's note.
  const upd = await b.sb.from("notes").update({ title: "hacked" }).eq("id", note.id).select();
  assert.deepEqual(upd.data, []);
  const del = await b.sb.from("notes").delete().eq("id", note.id).select();
  assert.deepEqual(del.data, []);

  // B cannot create a note owned by A.
  const forged = await b.sb.from("notes").insert({ user_id: a.id, title: "forged" });
  assert.ok(forged.error, "inserting a note for another user must fail");

  // B cannot attach files to A's note, or reference A's storage path.
  const forgedAtt = await b.sb.from("attachments").insert({
    note_id: note.id, storage_path: `${b.id}/${note.id}/x.txt`, file_name: "x", mime_type: "text/plain", size_bytes: 1,
  });
  assert.ok(forgedAtt.error, "attaching to another user's note must fail");
  const forgedPath = await b.sb.from("attachments").insert({
    storage_path: `${a.id}/x/y.txt`, file_name: "y", mime_type: "text/plain", size_bytes: 1,
  });
  assert.ok(forgedPath.error, "recording a path in another user's folder must fail");

  // B cannot read, list, sign, overwrite, upload into or delete A's files.
  assert.ok((await b.sb.storage.from(BUCKET).download(path)).error, "download must fail");
  const signed = await b.sb.storage.from(BUCKET).createSignedUrl(path, 60);
  assert.ok(signed.error, "signing someone else's file must fail");
  const list = await b.sb.storage.from(BUCKET).list(`${a.id}/${note.id}`);
  assert.deepEqual(list.data ?? [], []);
  const intoA = await b.sb.storage.from(BUCKET).upload(`${a.id}/${note.id}/evil.txt`, new Blob(["x"]));
  assert.ok(intoA.error, "uploading into another user's folder must fail");
  await b.sb.storage.from(BUCKET).remove([path]);
  assert.ifError((await a.sb.storage.from(BUCKET).download(path)).error, "A's file must survive B's delete");

  // Anonymous visitors see nothing.
  assert.deepEqual((await anon.from("notes").select("id")).data ?? [], []);
  assert.ok((await anon.storage.from(BUCKET).download(path)).error);

  // A's note is untouched.
  const after = await a.sb.from("notes").select("title").eq("id", note.id).single();
  assert.equal(after.data.title, "A secret");

  // Files over 25 MB are rejected by the bucket.
  const big = await a.sb.storage.from(BUCKET).upload(`${a.id}/${note.id}/big.bin`, new Blob([new Uint8Array(26 * 1024 * 1024)]));
  assert.ok(big.error, "files over 25 MB must be rejected");

  // Clean up A's data (test accounts themselves remain: deleting users needs admin rights).
  await a.sb.storage.from(BUCKET).remove([path]);
  await a.sb.from("notes").delete().eq("id", note.id);
});
