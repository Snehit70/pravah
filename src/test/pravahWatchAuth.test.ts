import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createWatchAuth} from "../../packages/cli/src/watchAuth";
import {ConvexHttpError} from "../../packages/cli/src/automationHttpClient";
// Use the installed SDK state machine, not the watcher test's fake client.
import {createRequire} from "node:module";
import type {AuthenticationManager as SDKAuthenticationManager} from "../../node_modules/convex/dist/esm-types/browser/sync/authentication_manager";
import type {LocalSyncState as SDKLocalSyncState} from "../../node_modules/convex/dist/esm-types/browser/sync/local_state";
import type {Transition} from "../../node_modules/convex/dist/esm-types/browser/sync/protocol";
const require = createRequire(import.meta.url);
const {AuthenticationManager} = require("../../node_modules/convex/dist/cjs/browser/sync/authentication_manager.js") as {AuthenticationManager: typeof SDKAuthenticationManager};
const {LocalSyncState} = require("../../node_modules/convex/dist/cjs/browser/sync/local_state.js") as {LocalSyncState: typeof SDKLocalSyncState};

const token = (iat = Math.floor(Date.now()/1000)) => {
  const payload = Buffer.from(JSON.stringify({iat,exp:iat+900})).toString("base64url");
  return {token:`header.${payload}.signature`,expiresAt:(iat+900)*1000};
};
const setup = (mint = vi.fn().mockResolvedValue(token(Math.floor(Date.now()/1000)+1))) => {
  const onRetry=vi.fn(),onRevoked=vi.fn(),onRenewed=vi.fn();
  const auth=createWatchAuth({initialToken:token(),mint,isRevoked:e=>e instanceof ConvexHttpError && [401,403].includes(e.status),
    onRetry,onRevoked,onRenewed});
  return {auth,mint,onRetry,onRevoked,onRenewed};
};
const sdk = (fetchToken: ReturnType<typeof setup>["auth"]["fetchToken"]) => {
  const state=new LocalSyncState();let identity=0;
  const authenticated:string[]=[], clearAuth=vi.fn(() => {state.clearAuth();});
  const manager=new AuthenticationManager(state,{
    authenticate:value=>{authenticated.push(value); const message=state.setAuth(value);identity=message.baseVersion+1;return message.baseVersion;},
    stopSocket:async()=>{},tryRestartSocket:()=>{},pauseSocket:()=>{},resumeSocket:()=>{},clearAuth,
  },{refreshTokenLeewaySeconds:10,logger:{log:()=>{},warn:()=>{},error:()=>{},logVerbose:()=>{}}});
  const confirm = () => manager.onTransition({type:"Transition",startVersion:{identity:identity-1},endVersion:{identity}} as Transition);
  return {manager,state,authenticated,clearAuth,confirm,start:()=>manager.setConfig(fetchToken,()=>{})};
};

describe("watcher token renewal with Convex's authentication manager",()=>{
  beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));});
  afterEach(()=>{vi.useRealTimers();});

  it("honors the SDK's forced refresh and leaves automatic renewal scheduled",async()=>{
    const {auth,mint}=setup();const client=sdk(auth.fetchToken);
    await client.start();
    client.confirm();await vi.advanceTimersByTimeAsync(0);
    expect(mint).toHaveBeenCalledTimes(1);
    expect(client.authenticated).toHaveLength(2);
    expect(client.authenticated[1]).not.toBe(client.authenticated[0]);
    client.confirm();
    mint.mockImplementationOnce(async()=>token());
    await vi.advanceTimersByTimeAsync(890_000);
    expect(mint).toHaveBeenCalledTimes(2);
    expect(client.authenticated).toHaveLength(3);
    client.manager.stop();auth.close();
  });

  it("waits past same-second identical JWTs instead of disabling SDK renewal",async()=>{
    const mint=vi.fn().mockResolvedValueOnce(token()).mockImplementationOnce(async()=>token());
    const {auth}=setup(mint);const client=sdk(auth.fetchToken);
    await client.start();client.confirm();await vi.advanceTimersByTimeAsync(0);
    expect(client.authenticated).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.authenticated).toHaveLength(2);
    client.confirm();expect(vi.getTimerCount()).toBe(1);
    client.manager.stop();auth.close();
  });

  it("recovers a timed-out renewal after expiry without falling into noAuth",async()=>{
    const {auth,mint,onRetry}=setup();const client=sdk(auth.fetchToken);
    await client.start();client.confirm();await vi.advanceTimersByTimeAsync(0);client.confirm();
    // Model a laptop resuming after the JWT expired, without firing timers
    // during sleep. The server rejects the old authentication on reconnect.
    vi.setSystemTime(Date.now()+16*60_000);
    mint.mockRejectedValueOnce(new DOMException("timed out","TimeoutError"))
      .mockImplementationOnce(async()=>token());
    client.manager.onAuthError({type:"AuthError",error:"expired",baseVersion:2,authUpdateAttempted:false});
    await vi.advanceTimersByTimeAsync(0);
    expect(onRetry).toHaveBeenCalledWith(1000);
    expect(client.clearAuth).not.toHaveBeenCalled();
    expect(client.authenticated).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.authenticated).toHaveLength(3);
    client.confirm();
    expect(vi.getTimerCount()).toBe(1);
    expect(client.clearAuth).not.toHaveBeenCalled();
    client.manager.stop();auth.close();
  });

  it("shares concurrent renewals and cancels pending retries on close",async()=>{
    const mint=vi.fn().mockRejectedValue(new Error("offline"));const {auth,onRenewed}=setup(mint);
    const first=auth.fetchToken({forceRefreshToken:true}),second=auth.fetchToken({forceRefreshToken:true});
    expect(first).toBe(second);await vi.advanceTimersByTimeAsync(0);
    expect(mint).toHaveBeenCalledTimes(1);
    auth.close();expect(await first).toBeNull();expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);expect(mint).toHaveBeenCalledTimes(1);expect(onRenewed).not.toHaveBeenCalled();
  });

  it.each([401,403])("stops retrying a revoked credential (%s)",async status=>{
    const mint=vi.fn().mockRejectedValue(new ConvexHttpError(status,"revoked"));const {auth,onRetry,onRevoked}=setup(mint);
    expect(await auth.fetchToken({forceRefreshToken:true})).toBeNull();
    expect(onRevoked).toHaveBeenCalledTimes(1);expect(onRetry).not.toHaveBeenCalled();
    expect(await auth.fetchToken({forceRefreshToken:true})).toBeNull();
    expect(mint).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  });

  it("caps retry frequency and never returns expired or invalid tokens",async()=>{
    const mint=vi.fn().mockResolvedValue({token:"expired",expiresAt:Date.now()-1});const {auth,onRetry}=setup(mint);
    const pending=auth.fetchToken({forceRefreshToken:true});
    await vi.advanceTimersByTimeAsync(121_000);
    expect(mint.mock.calls.length).toBeLessThanOrEqual(10);
    expect(onRetry.mock.calls.every(([delay])=>delay<=30_000)).toBe(true);
    auth.close();expect(await pending).toBeNull();
  });
});
