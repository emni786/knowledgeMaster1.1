import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// All collection operations route to the same Supabase as the user's links:
//   - admin (ADMIN_EMAIL) + PERSONAL_* env set → PERSONAL service-role
//   - everyone else → PUBLIC + user JWT (RLS-bound)
// When PERSONAL is used we MUST scope by owner_id (RLS is bypassed).

export const listCollections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    let q = supabase
      .from("collections" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (dataNeedsScoping) q = q.eq("owner_id", userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCollectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ name: z.string().min(1).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const slug = data.name.toLowerCase().replace(/\s+/g, "-");
    const { data: row, error } = await supabase
      .from("collections" as never)
      .insert({ owner_id: userId, name: data.name, slug } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCollectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const del = supabase
      .from("collections" as never)
      .delete()
      .eq("id", data.id);
    if (dataNeedsScoping) del.eq("owner_id", userId);
    const { error } = await del;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const renameCollectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("collections" as never)
      .update({ name: data.name } as never)
      .eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCollectionPublicServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), is_public: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId, dataNeedsScoping } = context;
    const upd = supabase
      .from("collections" as never)
      .update({ is_public: data.is_public } as never)
      .eq("id", data.id);
    if (dataNeedsScoping) upd.eq("owner_id", userId);
    const { error } = await upd;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const fetchCollectionLinkIdsServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ collectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // collection_links rows reference collection_id (which is already scoped
    // to the owner via the parent collection on the right database).
    const { data: rows, error } = await supabase
      .from("collection_links" as never)
      .select("link_id")
      .eq("collection_id", data.collectionId);
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{ link_id: string }>).map((r) => r.link_id);
  });

export const addLinksToCollectionServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        collectionId: z.string().uuid(),
        linkIds: z.array(z.string().uuid()).min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const rows = data.linkIds.map((link_id) => ({
      collection_id: data.collectionId,
      link_id,
    }));
    const { error } = await supabase
      .from("collection_links" as never)
      .upsert(rows as never, { onConflict: "collection_id,link_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
