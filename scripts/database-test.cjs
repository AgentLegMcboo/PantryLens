const { PGlite } = require("@electric-sql/pglite");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

(async () => {
  const db = new PGlite();
  let passed = 0;
  const test = async (name, run) => {
    await run();
    passed++;
    console.log(`PASS ${name}`);
  };
  try {
    // Established schema fixture. The new migration is executed unchanged.
    await db.exec(`
      create schema auth;
      create role authenticated;
      create role anon;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table pantries(id uuid primary key, name text);
      create table pantry_members(pantry_id uuid, user_id uuid, role text);
      create table locations(id uuid primary key, pantry_id uuid, name text);
      create table inventory(
        id uuid primary key, pantry_id uuid references pantries(id), name text not null,
        category text not null check(category in ('grain','vegetable','protein','breakfast','snack','hygiene','baby','unknown')),
        count integer not null, expiration date, date_added date, source text,
        confidence float, condition text not null default 'ok', source_org text, source_name text, diet_tags text[] not null default '{}',
        image_url text, location_id uuid references locations(id), created_at timestamptz not null default now()
      );
      create table bulk_lots(id uuid primary key, pantry_id uuid references pantries(id), category text, est_units integer, weight_lbs numeric(8,2), expiration date);
      create table activities(id uuid primary key default gen_random_uuid(), pantry_id uuid, text text, time text, icon text);
      create table stock_exits(id uuid primary key default gen_random_uuid(), pantry_id uuid, item_name text, category text, count integer, reason text, recorded_by uuid);
      create table shelf_audits(id uuid primary key, pantry_id uuid);
      create table pack_runs(id uuid primary key, pantry_id uuid);
      create table product_aliases(id uuid primary key, pantry_id uuid);
      create function public.pantry_role(target_pantry uuid) returns text language sql stable as $$ select role from pantry_members where pantry_id = target_pantry and user_id = auth.uid() $$;
      grant usage on schema auth to authenticated;
      grant select on pantry_members to authenticated;
      insert into auth.users values('${id(1)}'),('${id(2)}');
      insert into pantries values('${id(10)}','Pantry A'),('${id(11)}','Pantry B');
      insert into pantry_members values('${id(10)}','${id(1)}','volunteer');
      insert into locations values('${id(20)}','${id(10)}','Shelf A'),('${id(21)}','${id(10)}','Shelf B'),('${id(22)}','${id(11)}','Other pantry');
      select set_config('request.jwt.claim.sub','${id(1)}',false);
    `);
    // The incoming scan-history migration and the offline migration must coexist.
    await db.exec(`
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key, bucket_id text, name text);
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
      create function public.is_pantry_member(target_pantry uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from pantry_members where pantry_id = target_pantry and user_id = auth.uid()) $$;
    `);
    await db.exec(fs.readFileSync("supabase/migrations/20260921090000_scan_history.sql", "utf8"));
    await db.exec(
      fs.readFileSync(
        "supabase/migrations/20261005090000_reliable_intake_and_packing.sql",
        "utf8",
      ),
    );
    await db.exec("grant select on intake_batches, scans, packing_events to authenticated;");
    const row = (n, count = 10, location = 20) => ({
      id: id(n),
      name: "Beans",
      category: "protein",
      count,
      condition: "ok",
      location_id: id(location),
      source: "donation",
    });
    const intake = (
      batch,
      rows,
      mode = "donation",
      location = null,
      capturedAt = new Date(Date.now() + 60_000).toISOString(),
    ) =>
      db.query("select commit_intake($1,$2,$3,$4,$5,$6,$7)", [
        id(batch),
        id(10),
        mode,
        location && id(location),
        JSON.stringify(rows),
        "[]",
        capturedAt,
      ]);
    const count = async (n) =>
      (await db.query("select count from inventory where id=$1", [id(n)]))
        .rows[0]?.count;
    const pack = (batch, rows) =>
      db.query("select pack_stock($1,$2,$3)", [
        id(10),
        JSON.stringify(rows),
        id(batch),
      ]);

    await test("intake writes stock and a durable intake receipt", async () => {
      await intake(100, [row(30)]);
      assert.equal(await count(30), 10);
      assert.equal(
        (await db.query("select count(*)::int as n from intake_batches")).rows[0].n,
        1,
      );
    });
    await test("replaying an acknowledged intake does not duplicate stock or history", async () => {
      await intake(100, [row(30)]);
      assert.equal(await count(30), 10);
      assert.equal(
        (await db.query("select count(*)::int as n from activities")).rows[0].n,
        1,
      );
    });
    await test("invalid batches roll back every inventory row", async () => {
      await assert.rejects(
        intake(101, [row(31), { ...row(32), category: "not-a-category" }]),
      );
      assert.equal(await count(31), undefined);
    });
    await test("an audit replaces only its selected shelf", async () => {
      await intake(102, [row(33, 7, 21)]);
      await intake(103, [row(34, 4)], "shelf_audit", 20);
      assert.equal(await count(30), undefined);
      assert.equal(await count(34), 4);
      assert.equal(await count(33), 7);
    });
    await test("an invalid audit restores the entire original shelf", async () => {
      await assert.rejects(
        intake(104, [{ ...row(35), count: 0 }], "shelf_audit", 20),
      );
      assert.equal(await count(34), 4);
    });
    await test("an old offline audit cannot erase a newer completed audit", async () => {
      await assert.rejects(
        intake(105, [row(36)], "shelf_audit", 20, "2020-01-01T00:00:00Z"),
        /newer audit/,
      );
      assert.equal(await count(34), 4);
    });
    await test("intakes cannot assign locations from another pantry", async () => {
      await assert.rejects(intake(106, [row(37, 10, 22)]), /another pantry/);
      assert.equal(await count(37), undefined);
    });
    await test("packing failure rolls back earlier deductions in the same plan", async () => {
      await assert.rejects(
        pack(200, [
          { id: id(33), count: 2 },
          { id: id(34), count: 50 },
        ]),
        /Stock changed/,
      );
      assert.equal(await count(33), 7);
      assert.equal(await count(34), 4);
    });
    await test("packing updates item counts and weighed lots together", async () => {
      await db.query("insert into bulk_lots(id,pantry_id,category,est_units,weight_lbs) values($1,$2,$3,$4,$5)", [
        id(50),
        id(10),
        "protein",
        20,
        40,
      ]);
      await pack(201, [
        { id: id(34), count: 2 },
        { id: id(50), count: 5 },
      ]);
      assert.equal(await count(34), 2);
      const lot = (
        await db.query(
          "select est_units,weight_lbs from bulk_lots where id=$1",
          [id(50)],
        )
      ).rows[0];
      assert.equal(lot.est_units, 15);
      assert.equal(Number(lot.weight_lbs), 30);
    });
    await test("retrying a packing operation never deducts stock twice", async () => {
      await pack(201, [
        { id: id(34), count: 2 },
        { id: id(50), count: 5 },
      ]);
      assert.equal(await count(34), 2);
    });
    await test("duplicate ids in a packing plan are aggregated before checking stock", async () => {
      await assert.rejects(
        pack(202, [
          { id: id(34), count: 2 },
          { id: id(34), count: 2 },
        ]),
        /Stock changed/,
      );
      assert.equal(await count(34), 2);
    });
    await test("server packing rejects past-date items and bulk without changing counts", async () => {
      await intake(108, [{ ...row(39), expiration: "2000-01-01" }]);
      await db.query("insert into bulk_lots(id,pantry_id,category,est_units,weight_lbs,expiration) values($1,$2,'protein',10,20,'2000-01-01')", [id(51), id(10)]);
      await assert.rejects(pack(203, [{ id: id(39), count: 1 }]), /Stock changed/);
      await assert.rejects(pack(204, [{ id: id(51), count: 1 }]), /Stock changed/);
      assert.equal(await count(39), 10);
      assert.equal((await db.query("select est_units from bulk_lots where id=$1", [id(51)])).rows[0].est_units, 10);
    });
    await test("verified intake keeps dietary tags and links to incoming scan history", async () => {
      await db.query("insert into scans(id,pantry_id,scanned_by,mode) values($1,$2,$3,'donation')", [id(300), id(10), id(1)]);
      await intake(109, [{ ...row(40), diet_tags: ["no-cook", "contains-soy"], scan_id: id(300) }]);
      const saved = (await db.query("select diet_tags,scan_id from inventory where id=$1", [id(40)])).rows[0];
      assert.deepEqual(saved.diet_tags, ["no-cook", "contains-soy"]);
      assert.equal(saved.scan_id, id(300));
      assert.equal((await db.query("select count(*)::int n from scans where id=$1", [id(300)])).rows[0].n, 1);
    });
    await test("an intake cannot attach another pantry's scan", async () => {
      await db.query("insert into scans(id,pantry_id,scanned_by,mode) values($1,$2,$3,'donation')", [id(301), id(11), id(2)]);
      await assert.rejects(intake(110, [{ ...row(41), scan_id: id(301) }]), /Scan belongs to another pantry/);
      assert.equal(await count(41), undefined);
    });
    await test("a non-member cannot save stock or read another pantry’s scan history", async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id(2),
      ]);
      await assert.rejects(intake(107, [row(38)]), /not a member/);
      await db.exec("set role authenticated;");
      assert.equal((await db.query("select * from intake_batches")).rows.length, 0);
      await db.exec("reset role;");
    });
    await test("owner reset clears both kinds of history and receipts while retaining shelves", async () => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(1)]);
      await assert.rejects(db.query("select reset_pantry_data($1)", [id(10)]), /Only the pantry owner/);
      await db.query("update pantry_members set role='owner' where user_id=$1", [id(1)]);
      await db.query("select reset_pantry_data($1)", [id(10)]);
      for (const table of ["inventory", "scans", "intake_batches", "packing_events"])
        assert.equal((await db.query(`select count(*)::int n from ${table} where pantry_id=$1`, [id(10)])).rows[0].n, 0);
      assert.equal((await db.query("select count(*)::int n from locations where pantry_id=$1", [id(10)])).rows[0].n, 2);
      assert.equal((await db.query("select count(*)::int n from scans where pantry_id=$1", [id(11)])).rows[0].n, 1);
    });
    console.log(`\n${passed}/${passed} database transaction tests passed`);
  } finally {
    await db.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
