import {describe,it,expect,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "../../convex/schema";
import {api,internal} from "../../convex/_generated/api";
import {buildSnapshot} from "../../packages/cli/src/watchSnapshot";
import type { Id } from "../../convex/_generated/dataModel";
import { mutation } from "../../convex/writeServer";
import type { MutationCtx } from "../../convex/_generated/server";
vi.unmock("../../convex/writeServer");
const modules=import.meta.glob("../../convex/**/*.ts");
const options={dayStartMs:0,dayEndMs:86400000};
const setup=()=>{const root=convexTest(schema,modules);return {root,t:root.withIdentity({tokenIdentifier:"owner"})};};
const snapshot=(sources: {boardTasks:unknown;completedToday:unknown;goalLinks:unknown})=>buildSnapshot({...sources,goals:[],convexUrl:"https://test",now:new Date(1000)});
// Test-only access to the registered handler includes writeServer's wrapped DB.
// Convex's public declaration intentionally omits this internal runtime field.
const handlerOf=(definition:unknown)=>(definition as {
  _handler: (ctx:MutationCtx,args:Record<string,never>)=>Promise<void>;
})._handler;

describe("watcher read model",()=>{
  it("preserves the snapshot contract across backfill and lifecycle/link changes",async()=>{
    const {t}=setup();
    const id=await t.mutation(api.tasks.addTask,{title:"task",description:"notes",deadline:"2026-10-13",priority:"p1"});
    await t.mutation(api.goals.setLink,{taskId:id,goalClientId:"g"});
    const before=await t.query(api.watchProjection.sources,options);
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    const after=await t.query(api.watchProjection.sources,options);
    expect(snapshot(after)).toEqual(snapshot(before));
    await t.mutation(api.goals.setLink,{taskId:id,goalClientId:"other"});
    expect((await t.query(api.watchProjection.sources,options)).goalLinks[id]).toBe("other");
    await t.mutation(api.tasks.completeTask,{taskId:id});
    const actualDay={dayStartMs:Date.now()-1000,dayEndMs:Date.now()+1000};
    expect((await t.query(api.watchProjection.sources,actualDay)).completedToday).toHaveLength(1);
    await t.mutation(api.tasks.reopenTask,{taskId:id});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(1);
    await t.mutation(api.tasks.softDeleteTask,{taskId:id});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(0);
    await t.mutation(api.tasks.restoreTask,{taskId:id});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(1);
  });
  it("keeps fallback authoritative during bounded backfill and isolates ownership",async()=>{
    const {t,root}=setup();
    await t.run(async ctx=>{
      for(let i=0;i<125;i++)await ctx.db.insert("tasks",{ownerTokenIdentifier:"owner",title:String(i),position:i,createdAt:1,updatedAt:1,createdBy:"test"});
      await ctx.db.insert("tasks",{ownerTokenIdentifier:"other",title:"private",position:0,createdAt:1,updatedAt:1,createdBy:"test"});
    });
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(125);
    const id=(await t.query(api.watchProjection.sources,options)).boardTasks[0]._id;
    await t.mutation(api.tasks.softDeleteTask,{taskId:id as Id<"tasks">});
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(124);
    expect((await root.withIdentity({tokenIdentifier:"other"}).query(api.watchProjection.sources,options)).boardTasks).toHaveLength(1);
    await expect(root.query(api.watchProjection.sources,options)).rejects.toThrow("Not authenticated");
  });
  it("retains legacy completion dates and excludes unrelated metadata from the read model",async()=>{
    const {t}=setup();
    const id=await t.run(ctx=>ctx.db.insert("tasks",{ownerTokenIdentifier:"owner",title:"legacy",status:"completed",position:0,createdAt:1,updatedAt:1000,createdBy:"test"}));
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    const row=(await t.query(api.watchProjection.sources,options)).completedToday[0];
    expect(row.completedAt).toBe(1000);expect(row).not.toHaveProperty("createdBy");
    await t.mutation(api.tasks.reopenTask,{taskId:id});
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(1);
  });
  it("skips image/order metadata writes, removes cleared fields and follows owner changes", async () => {
    const {t,root}=setup();
    const id=await t.mutation(api.tasks.addTask,{title:"task",deadline:"2026-10-13",time:"09:00"});
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    const read=()=>t.run(ctx=>ctx.db.query("watchTasks").collect());
    const original=await read();
    const patch=mutation({args:{},handler:ctx=>ctx.db.patch(id,{imageCollectionRevision:9,position:20,updatedAt:Date.now()})});
    await t.mutation(ctx=>handlerOf(patch)(ctx,{}));
    expect(await read()).toEqual(original);
    await t.mutation(api.tasks.updateTask,{taskId:id,deadline:null,time:null});
    const cleared=(await t.query(api.watchProjection.sources,options)).boardTasks[0];
    expect(cleared).not.toHaveProperty("deadline");
    expect(cleared).not.toHaveProperty("time");
    const reassign=mutation({args:{},handler:ctx=>ctx.db.patch(id,{ownerTokenIdentifier:"other"})});
    await t.mutation(ctx=>handlerOf(reassign)(ctx,{}));
    expect((await t.query(api.watchProjection.sources,options)).boardTasks).toHaveLength(0);
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"other"});
    expect((await root.withIdentity({tokenIdentifier:"other"}).query(api.watchProjection.sources,options)).boardTasks).toHaveLength(1);
    const remove=mutation({args:{},handler:ctx=>ctx.db.delete(id)});
    await t.mutation(ctx=>handlerOf(remove)(ctx,{}));
    expect(await read()).toHaveLength(0);
  });
  it("updates legacy completion fallback after image metadata changes", async () => {
    const {t}=setup();
    const id=await t.run(ctx=>ctx.db.insert("tasks",{ownerTokenIdentifier:"owner",title:"legacy",status:"completed",position:0,createdAt:1,updatedAt:1000,createdBy:"test"}));
    await t.mutation(internal.watchProjection.prepareForOwner,{owner:"owner"});
    const patch=mutation({args:{},handler:ctx=>ctx.db.patch(id,{imageCollectionRevision:2,updatedAt:2000})});
    await t.mutation(ctx=>handlerOf(patch)(ctx,{}));
    expect((await t.query(api.watchProjection.sources,options)).completedToday[0].completedAt).toBe(2000);
    await expect(t.query(api.watchProjection.sources,{dayStartMs:10,dayEndMs:1})).rejects.toThrow("Invalid watch day window");
  });
});
