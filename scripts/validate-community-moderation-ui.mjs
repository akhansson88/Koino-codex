import assert from "node:assert/strict";
import { mkdtemp,rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act,create } from "react-test-renderer";
const require=createRequire(import.meta.url), directory=await mkdtemp(path.join(tmpdir(),"koino-moderation-ui-"));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const h=globalThis.__moderationUi={currentUserId:"A",currentGroupId:"room",groups:[{id:"room",ownerId:"A"}],calls:[],language:"en"};
const mocks={
  "@/state/store/firebase":'export const database={};',
  "@/state/store/helpers":'export const asArray=value=>Object.values(value??{});',
  "@/state/encryption/database":'export const ref=(_,path="")=>({path});export const get=async reference=>({val:()=>globalThis.__moderationUi.records[reference.path]});export const update=async(reference,values)=>{const h=globalThis.__moderationUi;h.writes.push({path:reference.path,values});if(h.failWrite)throw Error("denied");};',
  "react-native":'export const Pressable="Pressable";',
  "@/state/koino-store":'export const useKoinoFields=()=>globalThis.__moderationUi;',
  "@/state/encryption/session":'export const encryptedOperation=async(op,data)=>{const h=globalThis.__moderationUi;h.calls.push([op,data]);if(h.fail)throw Error("offline");};',
  "@/ui/theme":'export const colors={};',
  "@/ui/confirm":'export const confirmAction=options=>{globalThis.__moderationUi.confirm=options;};',
  "@/ui/app-language":'import {translateMessage} from "@/ui/localization";export const useAppTranslation=()=>({t:key=>translateMessage(globalThis.__moderationUi.language,key)});',
  "@/ui/app-components":'import React from "react";export const IconButton="IconButton",SecondaryButton="SecondaryButton",BodyText="BodyText";export const BottomSheet=props=>props.visible?React.createElement("BottomSheet",props):null;',
};
let tree;
try{
 const outfile=path.join(directory,"ui.cjs");
 await build({stdin:{contents:'export {CommunityRemovalMenu} from "./ui/community-removal-menu";export {deleteFeedItemWithChildren} from "./state/store/feed-operations";',resolveDir:process.cwd(),loader:"tsx"},outfile,bundle:true,platform:"node",format:"cjs",jsx:"automatic",plugins:[{name:"ui",setup(b){
  b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:"mock"}:a.path==="react"||a.path.startsWith("react/")?{path:require.resolve(a.path),external:true}:undefined);
  b.onLoad({filter:/.*/,namespace:"mock"},a=>({contents:mocks[a.path],loader:"tsx",resolveDir:process.cwd()}));
 }}]});
 const {CommunityRemovalMenu,deleteFeedItemWithChildren}=require(outfile);
 for(const role of ["B","C","A"]){h.currentUserId=role;await act(()=>{tree=create(React.createElement(CommunityRemovalMenu,{groupId:"room",authorId:"B",targetType:"post",targetId:"post"}));});assert.equal(tree.root.findAllByType("IconButton").length,role==="A"?1:0);await act(()=>tree.unmount());}
 h.currentUserId="A";
 for(const language of ["en","sv"]){h.language=language;for(const targetType of ["post","check_in","reply"]){
  h.calls=[];h.confirm=undefined;h.fail=false;
  await act(()=>{tree=create(React.createElement(CommunityRemovalMenu,{groupId:"room",authorId:"B",targetType,targetId:"target"}));});
  await act(()=>tree.root.findByType("IconButton").props.onPress());
  await act(()=>tree.root.findByType("SecondaryButton").props.onPress());
  assert.equal(h.calls.length,0,"Opening confirmation cannot remove content");
  assert.ok(h.confirm.message.includes(language==="en"?"private journal":"privata dagbok"));
  assert.ok(h.confirm.message.includes(language==="en"?"downloaded":"laddat ner"));
  assert.ok(h.confirm.cancelText && h.confirm.destructive);
  h.fail=true;await act(async()=>h.confirm.onConfirm());
  assert.ok(tree.root.findAllByType("BodyText").length,"Failure must remain visible for retry");
  h.fail=false;await act(()=>tree.root.findByType("SecondaryButton").props.onPress());
  await act(async()=>{h.confirm.onConfirm();h.confirm.onConfirm();});
  assert.equal(h.calls.length,2,"Double confirmation is guarded; only failure and retry call backend");
  assert.deepEqual(h.calls.at(-1),["removeCommunityContent",{groupId:"room",targetType,targetId:"target"}]);
  await act(()=>tree.unmount());
 }}
 await act(()=>{tree=create(React.createElement(CommunityRemovalMenu,{groupId:"room",authorId:"A",targetType:"post",targetId:"own"}));});assert.equal(tree.root.findAllByType("IconButton").length,0,"Own content keeps author controls");
 h.records={"replies/room":{r:{id:"r",userId:"B",targetType:"post",targetId:"own"}},"prayerReactions/room":{p:{id:"p",userId:"B",targetType:"reply",targetId:"r"}},"postReactions/room":{s:{id:"s",userId:"B",targetType:"post",targetId:"own"}}};h.writes=[];
 await deleteFeedItemWithChildren("room","post","own","A");
 assert.deepEqual(h.writes,[{path:"",values:{"replies/room/r":null,"prayerReactions/room/p":null,"postReactions/room/s":null,"posts/room/own":null}}],"Author self-delete must be one complete atomic cascade");
 h.writes=[];h.failWrite=true;await assert.rejects(deleteFeedItemWithChildren("room","post","own","A"),/denied/);assert.equal(h.writes.length,1,"Failed cascades cannot fall back to partial child cleanup");
 console.log("Moderation UI passed: owner-only controls, explicit localized confirmation, privacy/copy notice, failures, retries and duplicate-click guard.");
}finally{if(tree)await act(()=>tree.unmount());delete globalThis.__moderationUi;await rm(directory,{recursive:true,force:true});}
