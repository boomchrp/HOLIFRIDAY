import React, { Component, useState, useRef, useEffect, useCallback, useMemo } from "react";
import { getSupabase, hasSupabaseConfig } from "./lib/supabase";
import { firebaseDb, firebaseAuth, firebaseDebugInfo } from "./lib/firebase";
import { ref as dbRef, get, onValue, set } from "firebase/database";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

// ─── Constants ───────────────────────────────────────────────────────────────

const GROUP_COLORS = ["#0073ea","#e2445c","#00c875","#fdab3d","#a25ddc","#ff642e","#579bfc","#bb3354","#9d50dd","#ffcb00"];
const CONFETTI_COLORS = ["#e2445c","#00c875","#fdab3d","#0073ea","#a25ddc","#ffcb00","#ff642e","#579bfc"];
const OWNER_POOL: string[] = [];
const TAG_OPTIONS = [
  { label: "Design",    color: "#a25ddc" },
  { label: "Dev",       color: "#0073ea" },
  { label: "Marketing", color: "#fdab3d" },
  { label: "Research",  color: "#579bfc" },
  { label: "Urgent",    color: "#e2445c" },
  { label: "Review",    color: "#00c875" },
];
const STATUS_OPTIONS = [
  { label: "Done",                color: "#00c875" },
  { label: "Submitted",           color: "#00a878" },
  { label: "Approved",            color: "#20b26b" },
  { label: "Ready for PM Review", color: "#579bfc" },
  { label: "PM Reviewing",        color: "#a25ddc" },
  { label: "Need Revision",       color: "#ff642e" },
  { label: "Working on it",       color: "#fdab3d" },
  { label: "Stuck",               color: "#e2445c" },
  { label: "Not Started",         color: "#c4c4c4" },
];
const PRIORITY_OPTIONS = [
  { label: "Critical", color: "#e2445c" },
  { label: "High",     color: "#fdab3d" },
  { label: "Medium",   color: "#579bfc" },
  { label: "Low",      color: "#c4c4c4" },
];
const SIGNUPS_TABLE = "user_signups";
const SHARED_BOARDS_PATH = "holifriday/sharedBoards/main";
const DEFAULT_WORKSPACE_ID = "main";
function normalizeWorkspaceId(value) {
  const raw = asText(value, DEFAULT_WORKSPACE_ID).trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || DEFAULT_WORKSPACE_ID;
}
function getWorkspaceIdFromLocation() {
  try { return normalizeWorkspaceId(new URLSearchParams(window.location.search).get("workspace") || DEFAULT_WORKSPACE_ID); }
  catch { return DEFAULT_WORKSPACE_ID; }
}
function getBoardsPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  const id = normalizeWorkspaceId(workspaceId);
  return id === DEFAULT_WORKSPACE_ID ? SHARED_BOARDS_PATH : `holifriday/workspaces/${id}/boards`;
}

const INITIAL_BOARDS = [
  {
    id: 1, name: "🌴 HOLIFRIDAY Planner", color: "#e2445c",
    groups: [
      {
        id: 10, name: "Planning", color: "#579bfc",
        items: [
          { id: 100, name: "Market Research",      owner: "", status: "Done",          priority: "High",     due: "2026-06-10", tags: ["Research"], comments: [], subtasks: [] },
          { id: 101, name: "Competitive Analysis", owner: "", status: "Working on it", priority: "Medium",   due: "2026-06-18", tags: ["Research","Marketing"], comments: [], subtasks: [] },
          { id: 102, name: "Define MVP scope",     owner: "", status: "Not Started",   priority: "Critical", due: "2026-06-22", tags: ["Dev"], comments: [], subtasks: [] },
        ],
      },
      {
        id: 11, name: "Development", color: "#00c875",
        items: [
          { id: 103, name: "Design Mockups",  owner: "", status: "Stuck",         priority: "Critical", due: "2026-06-20", tags: ["Design"], comments: [], subtasks: [{ id: 1031, name: "Wireframes", done: true }, { id: 1032, name: "Hi-fi mockup", done: false }] },
          { id: 104, name: "Backend API",     owner: "", status: "Not Started",   priority: "High",     due: "2026-06-30", tags: ["Dev"], comments: [], subtasks: [] },
          { id: 105, name: "Frontend Build",  owner: "", status: "Working on it", priority: "High",     due: "2026-07-05", tags: ["Dev","Design"], comments: [], subtasks: [] },
        ],
      },
    ],
  },
  {
    id: 2, name: "📣 Marketing Q3", color: "#00c875",
    groups: [
      {
        id: 20, name: "Campaigns", color: "#fdab3d",
        items: [
          { id: 200, name: "Email drip series",    owner: "", status: "Working on it", priority: "High",   due: "2026-06-25", tags: ["Marketing"], comments: [], subtasks: [] },
          { id: 201, name: "Social media calendar",owner: "", status: "Done",          priority: "Medium", due: "2026-06-15", tags: ["Marketing"], comments: [], subtasks: [] },
        ],
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() { return Date.now() + Math.random(); }

function asArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  // Firebase RTDB stores arrays as objects with numeric keys {"0":…,"1":…}
  if (value !== null && value !== undefined && typeof value === "object") return Object.values(value);
  return fallback;
}

function asText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeEmail(value) {
  return asText(value).trim().toLowerCase();
}

function uniqueStrings(values) {
  return Array.from(new Set(asArray(values).filter(v => typeof v === "string" && v.trim().length > 0)));
}

const LEGACY_OWNER_NAMES = new Set(["unassigned", "bob", "carol"]);

function normalizeOwner(value) {
  const owner = asText(value, "").trim();
  if (!owner) return "No owner";
  if (LEGACY_OWNER_NAMES.has(owner.toLowerCase())) return "No owner";
  return owner;
}

function createInviteToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRole(value) {
  return value === "viewer" ? "viewer" : "editor";
}

function actorLabel(name, email) {
  const n = asText(name, "").trim();
  const e = normalizeEmail(email);
  return n || e || "Unknown user";
}

function createActivityLog({ actorName, actorEmail, boardId, groupId = null, itemId = null, itemName = "", action, field = "", oldValue = "", newValue = "" }) {
  return {
    id: uid(),
    boardId,
    groupId,
    itemId,
    itemName: asText(itemName),
    actorName: asText(actorName, "Unknown user"),
    actorEmail: normalizeEmail(actorEmail),
    action: asText(action, "updated"),
    field: asText(field),
    oldValue: typeof oldValue === "string" ? oldValue : JSON.stringify(oldValue ?? ""),
    newValue: typeof newValue === "string" ? newValue : JSON.stringify(newValue ?? ""),
    createdAt: new Date().toISOString(),
  };
}

function shortValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sameJson(a, b) {
  try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); }
  catch { return a === b; }
}

function trimActivityLogs(logs, limit = 250) {
  return asArray(logs).slice(-limit);
}

function makeBoardChangeLogs(prevBoard, nextBoard, actorName, actorEmail) {
  const logs = [];
  const prevGroups = new Map(asArray(prevBoard?.groups).map(g => [g.id, g]));
  const nextGroups = new Map(asArray(nextBoard?.groups).map(g => [g.id, g]));

  for (const [groupId, nextGroup] of nextGroups) {
    const prevGroup = prevGroups.get(groupId);
    if (!prevGroup) {
      logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, action: "group_created", itemName: nextGroup.name, newValue: nextGroup.name }));
      continue;
    }
    if (prevGroup.name !== nextGroup.name) {
      logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, action: "group_renamed", field: "group.name", oldValue: prevGroup.name, newValue: nextGroup.name }));
    }

    const prevItems = new Map(asArray(prevGroup.items).map(i => [i.id, i]));
    const nextItems = new Map(asArray(nextGroup.items).map(i => [i.id, i]));

    for (const [itemId, nextItem] of nextItems) {
      const prevItem = prevItems.get(itemId);
      if (!prevItem) {
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: "task_created", newValue: nextItem.name }));
        continue;
      }

      const simpleFields = ["name", "owner", "status", "priority", "start", "due", "pmReviewDate", "effortHours", "reviewBufferDays", "revisionBufferDays"];
      for (const field of simpleFields) {
        if ((prevItem[field] ?? "") !== (nextItem[field] ?? "")) {
          logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: `${field}_changed`, field, oldValue: shortValue(prevItem[field]), newValue: shortValue(nextItem[field]) }));
        }
      }

      if (!sameJson(prevItem.tags, nextItem.tags)) {
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: "tags_changed", field: "tags", oldValue: shortValue(prevItem.tags), newValue: shortValue(nextItem.tags) }));
      }
      if (!sameJson(prevItem.subtasks, nextItem.subtasks)) {
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: "subtasks_changed", field: "subtasks", oldValue: `${asArray(prevItem.subtasks).filter(s => s.done).length}/${asArray(prevItem.subtasks).length}`, newValue: `${asArray(nextItem.subtasks).filter(s => s.done).length}/${asArray(nextItem.subtasks).length}` }));
      }
      if (asArray(nextItem.comments).length > asArray(prevItem.comments).length) {
        const added = asArray(nextItem.comments).slice(asArray(prevItem.comments).length).map(c => c?.text).filter(Boolean).join(" | ");
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: "comment_added", field: "comments", newValue: added.slice(0, 180) }));
      } else if (!sameJson(prevItem.comments, nextItem.comments)) {
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: nextItem.name, action: "comments_changed", field: "comments" }));
      }
    }

    for (const [itemId, prevItem] of prevItems) {
      if (!nextItems.has(itemId)) {
        logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, itemId, itemName: prevItem.name, action: "task_deleted", oldValue: prevItem.name }));
      }
    }
  }

  for (const [groupId, prevGroup] of prevGroups) {
    if (!nextGroups.has(groupId)) {
      logs.push(createActivityLog({ actorName, actorEmail, boardId: nextBoard.id, groupId, action: "group_deleted", oldValue: prevGroup.name }));
    }
  }

  return logs.slice(0, 20);
}

function memberRoleKey(email) {
  const normalized = normalizeEmail(email);
  try {
    return btoa(unescape(encodeURIComponent(normalized)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  } catch {
    return normalized.replace(/[^a-z0-9]/g, "_");
  }
}

function memberRoleEmail(key) {
  try {
    const normalizedKey = asText(key);
    const base64 = normalizedKey.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    return normalizeEmail(decodeURIComponent(escape(atob(padded))));
  } catch {
    return normalizeEmail(key);
  }
}

function memberLabel(value) {
  const email = normalizeEmail(value);
  const namePart = email.split("@")[0] || "member";
  return namePart.replace(/[._-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function resolveInviteTarget(boards, token) {
  if (!token) return null;
  for (const board of asArray(boards)) {
    for (const group of asArray(board?.groups)) {
      const invite = asArray(group?.invites).find(i => i?.token === token);
      if (invite) {
        return {
          boardId: board.id,
          boardName: board.name,
          groupId: group.id,
          groupName: group.name,
          role: normalizeRole(invite.role),
          token,
        };
      }
    }
  }
  return null;
}

function normalizeTask(task, index) {
  const validStatus = STATUS_OPTIONS.some(s => s.label === task?.status) ? task.status : "Not Started";
  const validPriority = PRIORITY_OPTIONS.some(p => p.label === task?.priority) ? task.priority : "Medium";
  const version = Number.isFinite(Number(task?.version)) && Number(task?.version) > 0 ? Number(task?.version) : 1;
  const updatedAt = asText(task?.updatedAt, new Date().toISOString());

  return {
    id: task?.id ?? uid(),
    name: asText(task?.name, `Task ${index + 1}`),
    owner: normalizeOwner(task?.owner),
    status: validStatus,
    priority: validPriority,
    start: asText(task?.start, ""),
    due: asText(task?.due, ""),
    pmReviewDate: asText(task?.pmReviewDate, ""),
    effortHours: numberOrDefault(task?.effortHours, 0),
    reviewBufferDays: numberOrDefault(task?.reviewBufferDays, 1),
    revisionBufferDays: numberOrDefault(task?.revisionBufferDays, 1),
    tags: asArray(task?.tags).filter(t => typeof t === "string"),
    comments: asArray(task?.comments).map((c, i) => ({
      id: c?.id ?? uid(),
      author: asText(c?.author, "Unknown"),
      text: asText(c?.text, ""),
      mentions: uniqueStrings([...asArray(c?.mentions), ...extractMentions(c?.text)]),
      time: asText(c?.time, ""),
      _sort: i,
    })).map(({ _sort, ...rest }) => rest),
    subtasks: asArray(task?.subtasks).map((s, i) => ({
      id: s?.id ?? uid(),
      name: asText(s?.name, `Subtask ${i + 1}`),
      done: !!s?.done,
    })),
    approvalHistory: asArray(task?.approvalHistory).map((h, i) => ({
      id: h?.id ?? uid(),
      fromStatus: asText(h?.fromStatus || h?.from, "—"),
      toStatus: asText(h?.toStatus || h?.to || h?.action, "—"),
      action: asText(h?.action || h?.toStatus || h?.to, "Status changed"),
      by: asText(h?.by || h?.actor || h?.author, "Unknown"),
      at: asText(h?.at || h?.time || h?.createdAt, ""),
      _sort: i,
    })).map(({ _sort, ...rest }) => rest),
    version,
    updatedAt,
    updatedBy: normalizeEmail(task?.updatedBy),
  };
}

function stripTaskMeta(task) {
  if (!task || typeof task !== "object") return task;
  const { version, updatedAt, updatedBy, ...rest } = task as any;
  return rest;
}

function didTaskContentChange(prevTask, nextTask) {
  return !sameJson(stripTaskMeta(prevTask), stripTaskMeta(nextTask));
}

function boardItemMaps(board) {
  const byGroupAndItem = new Map<string, any>();
  const byItem = new Map<any, any>();
  for (const group of asArray(board?.groups)) {
    for (const item of asArray(group?.items)) {
      byGroupAndItem.set(`${group.id}:${item.id}`, item);
      byItem.set(item.id, item);
    }
  }
  return { byGroupAndItem, byItem };
}

function stampBoardTaskMetadata(prevBoard, nextBoard, actorEmail) {
  const now = new Date().toISOString();
  const prevMaps = boardItemMaps(prevBoard);
  const normalizedActor = normalizeEmail(actorEmail);

  return {
    ...nextBoard,
    groups: asArray(nextBoard?.groups).map(group => ({
      ...group,
      items: asArray(group?.items).map(item => {
        const key = `${group.id}:${item.id}`;
        const prevItem = prevMaps.byGroupAndItem.get(key) || prevMaps.byItem.get(item.id);
        const prevVersion = Number.isFinite(Number(prevItem?.version)) && Number(prevItem?.version) > 0 ? Number(prevItem.version) : 1;

        if (!prevItem) {
          return {
            ...item,
            version: Number.isFinite(Number(item?.version)) && Number(item?.version) > 0 ? Number(item.version) : 1,
            updatedAt: asText(item?.updatedAt, now),
            updatedBy: normalizeEmail(item?.updatedBy) || normalizedActor,
          };
        }

        if (didTaskContentChange(prevItem, item)) {
          return {
            ...item,
            version: prevVersion + 1,
            updatedAt: now,
            updatedBy: normalizedActor,
          };
        }

        return {
          ...item,
          version: Number.isFinite(Number(item?.version)) && Number(item?.version) > 0 ? Number(item.version) : prevVersion,
          updatedAt: asText(item?.updatedAt, prevItem?.updatedAt || now),
          updatedBy: normalizeEmail(item?.updatedBy) || normalizeEmail(prevItem?.updatedBy),
        };
      }),
    })),
  };
}

function detectBoardVersionConflicts(prevBoard, nextBoard, serverBoard) {
  const prevMaps = boardItemMaps(prevBoard);
  const nextMaps = boardItemMaps(nextBoard);
  const serverMaps = boardItemMaps(serverBoard);
  const conflicts: any[] = [];

  for (const [key, nextItem] of nextMaps.byGroupAndItem) {
    const prevItem = prevMaps.byGroupAndItem.get(key) || prevMaps.byItem.get(nextItem.id);
    if (!prevItem) continue;
    if (!didTaskContentChange(prevItem, nextItem)) continue;

    const serverItem = serverMaps.byGroupAndItem.get(key) || serverMaps.byItem.get(nextItem.id);
    if (!serverItem) continue;

    const baseVersion = Number.isFinite(Number(prevItem?.version)) && Number(prevItem?.version) > 0 ? Number(prevItem.version) : 1;
    const serverVersion = Number.isFinite(Number(serverItem?.version)) && Number(serverItem?.version) > 0 ? Number(serverItem.version) : 1;

    // Conflict only when server moved ahead of the local base.
    // If server is behind, it's a stale read during propagation and should not block.
    if (serverVersion > baseVersion) {
      conflicts.push({
        key,
        itemId: nextItem.id,
        itemName: nextItem.name || serverItem.name || "Untitled task",
        baseVersion,
        serverVersion,
        base: prevItem,
        mine: nextItem,
        server: serverItem,
      });
    }
  }

  return conflicts;
}

function mergeUniqueTags(baseTags, mineTags, serverTags) {
  const baseSet = new Set(asArray(baseTags));
  const mineSet = new Set(asArray(mineTags));
  const serverSet = new Set(asArray(serverTags));
  const merged = new Set<string>();

  for (const tag of mineSet) if (!baseSet.has(tag) || serverSet.has(tag)) merged.add(tag);
  for (const tag of serverSet) if (!baseSet.has(tag) || mineSet.has(tag)) merged.add(tag);
  for (const tag of baseSet) {
    const mineRemoved = !mineSet.has(tag);
    const serverRemoved = !serverSet.has(tag);
    if (!mineRemoved && !serverRemoved) merged.add(tag);
  }
  return Array.from(merged);
}

function mergeSubtasks(baseSubtasks, mineSubtasks, serverSubtasks) {
  const byId = new Map<any, any>();
  for (const item of asArray(baseSubtasks)) byId.set(item.id, { ...item });

  for (const item of asArray(serverSubtasks)) {
    const prev = byId.get(item.id) || {};
    byId.set(item.id, {
      ...prev,
      ...item,
      done: Boolean(prev.done || item.done),
    });
  }

  for (const item of asArray(mineSubtasks)) {
    const prev = byId.get(item.id) || {};
    byId.set(item.id, {
      ...prev,
      ...item,
      done: Boolean(prev.done || item.done),
    });
  }

  return Array.from(byId.values());
}

function mergeComments(baseComments, mineComments, serverComments) {
  const base = asArray(baseComments);
  const server = asArray(serverComments);
  const mine = asArray(mineComments);

  const merged: any[] = [];
  const seen = new Set<any>();

  for (const c of [...base, ...server, ...mine]) {
    const key = c?.id || `${c?.author || ""}:${c?.time || ""}:${c?.text || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(c);
  }

  return merged;
}

function pickLatestByUpdatedAt(mineValue, serverValue, mineUpdatedAt, serverUpdatedAt) {
  const mineTs = Date.parse(asText(mineUpdatedAt));
  const serverTs = Date.parse(asText(serverUpdatedAt));
  if (Number.isNaN(mineTs) && Number.isNaN(serverTs)) return mineValue;
  if (Number.isNaN(serverTs)) return mineValue;
  if (Number.isNaN(mineTs)) return serverValue;
  return mineTs >= serverTs ? mineValue : serverValue;
}

function smartMergeTask(conflict, actorEmail) {
  const base = conflict?.base || {};
  const mine = conflict?.mine || {};
  const server = conflict?.server || {};
  const merged = { ...server };
  const candidateFields = Array.from(new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(server)]));

  for (const field of candidateFields) {
    if (["version", "updatedAt", "updatedBy", "id"].includes(field)) continue;

    const baseVal = base[field];
    const mineVal = mine[field];
    const serverVal = server[field];
    const mineChanged = !sameJson(baseVal, mineVal);
    const serverChanged = !sameJson(baseVal, serverVal);

    if (mineChanged && !serverChanged) {
      merged[field] = mineVal;
      continue;
    }
    if (!mineChanged && serverChanged) {
      merged[field] = serverVal;
      continue;
    }
    if (!mineChanged && !serverChanged) {
      merged[field] = serverVal;
      continue;
    }

    if (field === "tags") {
      merged[field] = mergeUniqueTags(baseVal, mineVal, serverVal);
      continue;
    }
    if (field === "subtasks") {
      merged[field] = mergeSubtasks(baseVal, mineVal, serverVal);
      continue;
    }
    if (field === "comments") {
      merged[field] = mergeComments(baseVal, mineVal, serverVal);
      continue;
    }
    if (field === "status") {
      merged[field] = pickLatestByUpdatedAt(mineVal, serverVal, mine.updatedAt, server.updatedAt);
      continue;
    }
    if (field === "due" || field === "pmReviewDate") {
      const mineDate = parseDateOnly(mineVal);
      const serverDate = parseDateOnly(serverVal);
      if (mineDate && serverDate) merged[field] = mineDate <= serverDate ? mineVal : serverVal;
      else merged[field] = mineVal || serverVal || "";
      continue;
    }

    merged[field] = mineVal;
  }

  const serverVersion = Number.isFinite(Number(server?.version)) && Number(server?.version) > 0 ? Number(server.version) : 1;
  return {
    ...merged,
    version: serverVersion + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: normalizeEmail(actorEmail),
  };
}

function withMergeActivityLog(board, actorName, actorEmail, strategy: "mine" | "server" | "smart", conflicts) {
  const entries = asArray(conflicts).map(conflict => createActivityLog({
    actorName,
    actorEmail,
    boardId: board.id,
    itemId: conflict.itemId,
    itemName: conflict.itemName,
    action: "merge_resolved",
    field: "version",
    oldValue: `server:v${conflict.serverVersion}`,
    newValue: `${strategy}:v${Number(conflict.serverVersion) + (strategy === "mine" ? 1 : 0)}`,
  }));

  if (entries.length === 0) return board;
  return {
    ...board,
    activityLogs: trimActivityLogs([...(asArray(board.activityLogs)), ...entries]),
  };
}

function normalizeGroup(group, index) {
  const memberRolesRaw = group?.memberRoles && typeof group.memberRoles === "object" ? group.memberRoles : {};
  const memberRoles = Object.fromEntries(
    Object.entries(memberRolesRaw)
      .map(([key, role]) => [memberRoleKey(memberRoleEmail(key)), normalizeRole(role)])
      .filter(([emailKey]) => emailKey.length > 0),
  );

  return {
    id: group?.id ?? uid(),
    name: asText(group?.name, `Group ${index + 1}`),
    color: asText(group?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    members: uniqueStrings(asArray(group?.members).map(normalizeEmail)),
    memberRoles,
    invites: asArray(group?.invites).map(inv => ({
      token: asText(inv?.token),
      role: normalizeRole(inv?.role),
      createdAt: asText(inv?.createdAt, new Date().toISOString()),
    })).filter(inv => inv.token),
    items: asArray(group?.items).map((item, itemIndex) => normalizeTask(item, itemIndex)),
  };
}

function normalizeBoards(value, fallback = []) {
  const normalized = asArray(value).map((board, index) => ({
    id: board?.id ?? uid(),
    name: asText(board?.name, `Board ${index + 1}`),
    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    resourceCapacity: board?.resourceCapacity && typeof board.resourceCapacity === "object" ? board.resourceCapacity : {},
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),
    activityLogs: trimActivityLogs(asArray(board?.activityLogs).map(log => ({
      id: log?.id ?? uid(),
      boardId: log?.boardId ?? board?.id ?? null,
      groupId: log?.groupId ?? null,
      itemId: log?.itemId ?? null,
      itemName: asText(log?.itemName),
      actorName: asText(log?.actorName, "Unknown user"),
      actorEmail: normalizeEmail(log?.actorEmail),
      action: asText(log?.action, "updated"),
      field: asText(log?.field),
      oldValue: asText(log?.oldValue),
      newValue: asText(log?.newValue),
      createdAt: asText(log?.createdAt, new Date().toISOString()),
    }))),
  }));

  if (normalized.length > 0) return normalized;
  return asArray(fallback).map((board, index) => ({
    id: board?.id ?? uid(),
    name: asText(board?.name, `Board ${index + 1}`),
    color: asText(board?.color, GROUP_COLORS[index % GROUP_COLORS.length]),
    resourceCapacity: board?.resourceCapacity && typeof board.resourceCapacity === "object" ? board.resourceCapacity : {},
    groups: asArray(board?.groups).map((group, groupIndex) => normalizeGroup(group, groupIndex)),
    activityLogs: trimActivityLogs(asArray(board?.activityLogs).map(log => ({
      id: log?.id ?? uid(),
      boardId: log?.boardId ?? board?.id ?? null,
      groupId: log?.groupId ?? null,
      itemId: log?.itemId ?? null,
      itemName: asText(log?.itemName),
      actorName: asText(log?.actorName, "Unknown user"),
      actorEmail: normalizeEmail(log?.actorEmail),
      action: asText(log?.action, "updated"),
      field: asText(log?.field),
      oldValue: asText(log?.oldValue),
      newValue: asText(log?.newValue),
      createdAt: asText(log?.createdAt, new Date().toISOString()),
    }))),
  }));
}

function useLocalStorage(key, init) {
  const [val, setVal] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; }
    catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function useSyncedBoards(key, init, uid, workspaceId = DEFAULT_WORKSPACE_ID) {
  const dbPath = firebaseDb ? getBoardsPath(workspaceId) : null;
  const [val, setVal] = useState<typeof init | null>(null); // null = not yet loaded from server
  const [loaded, setLoaded] = useState(false);
  const [loadedUid, setLoadedUid] = useState<string | undefined>(undefined);
  const [loadError, setLoadError] = useState("");
  const skipWrite = useRef(false);

  useEffect(() => {
    // No Firebase configured — fall back to the in-memory initial state only
    if (!firebaseDb || !dbPath) {
      setVal(normalizeBoards(init, INITIAL_BOARDS));
      setLoaded(true);
      setLoadedUid(uid);
      setLoadError("");
      return;
    }

    setLoaded(false); // reset on uid/path change so invite re-waits for real data
    setLoadError("");

    const boardsRef = dbRef(firebaseDb, dbPath);
    const unsub = onValue(boardsRef, snap => {
      const raw = snap.val();
      // Firebase RTDB stores arrays as objects with numeric keys {"0":…} — normalise both
      const data = Array.isArray(raw) ? raw
        : (raw && typeof raw === "object" ? Object.values(raw) : null);

      skipWrite.current = true; // don't echo the data straight back to Firebase
      if (data && data.length > 0) {
        const normalizedData = normalizeBoards(data, init);
        setVal(normalizedData);
        // Auto-migrate legacy records (old owner names / legacy shape) once loaded.
        // This keeps old Firebase data aligned with current app expectations.
        try {
          if (JSON.stringify(data) !== JSON.stringify(normalizedData)) {
            set(boardsRef, normalizedData).catch(() => {});
          }
        } catch {}
      } else {
        // Firebase path is empty — seed it with init data
        const seed = normalizeBoards(init, INITIAL_BOARDS);
        setVal(seed);
        set(boardsRef, seed).catch(() => {});
      }
      setLoaded(true);
      setLoadedUid(uid); // record which uid this data was loaded for
    }, err => {
      // Firebase read failed — use the default state instead of stale local data
      console.warn("Firebase read error:", err?.message);
      setLoadError(err?.message || "Unknown Firebase read error");
      skipWrite.current = true;
      setVal(normalizeBoards(init, INITIAL_BOARDS));
      setLoaded(true);
      setLoadedUid(uid);
    });

    return () => unsub();
  }, [key, dbPath, uid]); // re-run when auth changes so we always read with correct identity

  // Write-back: ONLY after server data has been received — never before
  useEffect(() => {
    if (!loaded || val === null) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    if (firebaseDb && dbPath) {
      set(dbRef(firebaseDb, dbPath), val).catch(() => {});
    }
  }, [key, loaded, val, dbPath]);

  const boards = val ?? normalizeBoards(init, INITIAL_BOARDS);
  return [boards, setVal, loaded, loaded, loadedUid, loadError] as [typeof boards, typeof setVal, boolean, boolean, string | undefined, string];
}

function useClickOutside(ref, cb) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) cb(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, cb]);
}

function useCelebration() {
  const [cel, setCel] = useState(null);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const celebrate = useCallback((taskName, originX) => {
    if (t.current) clearTimeout(t.current);
    setCel({ taskName, originX });
    t.current = setTimeout(() => setCel(null), 2600);
  }, []);
  return { cel, celebrate };
}

class AppErrorBoundary extends Component<any, { hasError: boolean; message: string }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: any) {
    return {
      hasError: true,
      message: error?.message || "Unexpected error",
    };
  }

  componentDidCatch(error: any) {
    console.error("App crashed:", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f8fc", padding: 16 }}>
        <div style={{ maxWidth: 620, background: "#fff", borderRadius: 16, border: "1px solid #eceef5", boxShadow: "0 10px 30px rgba(0,0,0,.1)", padding: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#1f1f3b" }}>Something went wrong</div>
          <div style={{ marginTop: 8, color: "#676879", fontSize: 13, lineHeight: 1.6 }}>
            The app hit a runtime error and was stopped to prevent a white screen.
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "#e2445c", background: "#fdeef1", border: "1px solid #f6d8df", borderRadius: 8, padding: "8px 10px" }}>
            {this.state.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, border: "none", borderRadius: 8, background: "#0073ea", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 12px", cursor: "pointer" }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

function isOverdue(due) {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function parseDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(start, end) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / ms);
}

function getTaskRange(task) {
  const parsedStart = parseDateOnly(task?.start);
  const parsedDue = parseDateOnly(task?.due);
  if (!parsedStart && !parsedDue) return null;
  const start = parsedStart || parsedDue;
  const end = parsedDue || parsedStart;
  return start <= end ? { start, end } : { start: end, end: start };
}

function getTaskDurationDays(task) {
  const range = getTaskRange(task);
  if (!range) return 0;
  return diffDays(range.start, range.end) + 1;
}

function formatDateOnly(date) {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function numberOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function getEffortHours(task) {
  return Math.max(0, numberOrDefault(task?.effortHours, 0));
}

function getReviewBufferDays(task) {
  return Math.max(0, numberOrDefault(task?.reviewBufferDays, 1));
}

function getRevisionBufferDays(task) {
  return Math.max(0, numberOrDefault(task?.revisionBufferDays, 1));
}

function getRequiredWorkDays(task, capacityHoursPerDay = 8) {
  const effort = getEffortHours(task);
  if (effort <= 0) return 0;
  const cap = Math.max(1, Number(capacityHoursPerDay) || 6);
  return Math.max(1, Math.ceil(effort / cap));
}


function capacityKey(owner) {
  return memberRoleKey(normalizeOwner(owner));
}

function getBoardOwners(board) {
  const owners = [];
  for (const group of asArray(board?.groups)) {
    owners.push(...asArray(group?.members));
    for (const item of asArray(group?.items)) {
      const owner = normalizeOwner(item?.owner);
      if (owner && owner !== "No owner") owners.push(owner);
    }
  }
  return uniqueStrings(owners.map(normalizeOwner)).filter(o => o && o !== "No owner");
}

function getBoardResourceCapacity(board) {
  return board?.resourceCapacity && typeof board.resourceCapacity === "object"
    ? board.resourceCapacity
    : {};
}

function getOwnerCapacity(board, owner, fallback = 8) {
  const capMap = getBoardResourceCapacity(board);
  const entry = capMap[capacityKey(owner)];
  const raw = entry && typeof entry === "object" ? entry.hoursPerDay : entry;
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function setOwnerCapacityOnBoard(board, owner, hoursPerDay) {
  const n = Math.max(0, Number(hoursPerDay) || 0);
  const key = capacityKey(owner);
  return {
    ...board,
    resourceCapacity: {
      ...getBoardResourceCapacity(board),
      [key]: {
        owner: normalizeOwner(owner),
        hoursPerDay: n,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}


function getOwnerResourceEntry(board, owner) {
  const capMap = getBoardResourceCapacity(board);
  const entry = capMap[capacityKey(owner)];
  return entry && typeof entry === "object" ? entry : { hoursPerDay: entry };
}

function getOwnerUnavailableDates(board, owner) {
  const entry = getOwnerResourceEntry(board, owner);
  return uniqueStrings(asArray(entry?.unavailableDates).map(d => asText(d)).filter(Boolean)).sort();
}

function getOwnerUnavailableReason(board, owner, dateKey) {
  const entry = getOwnerResourceEntry(board, owner);
  const reasons = entry?.unavailableReasons && typeof entry.unavailableReasons === "object" ? entry.unavailableReasons : {};
  return asText(reasons?.[dateKey], "");
}

function isOwnerUnavailable(board, owner, dateKey) {
  return getOwnerUnavailableDates(board, owner).includes(asText(dateKey));
}

function getOwnerCapacityForDate(board, owner, dateKey, fallback = 8) {
  return isOwnerUnavailable(board, owner, dateKey) ? 0 : getOwnerCapacity(board, owner, fallback);
}

function getDateRangeKeys(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate || startDate);
  if (!start || !end) return [];
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  const keys = [];
  for (let d = new Date(a); d <= b; d = addDays(d, 1)) keys.push(d.toISOString().slice(0, 10));
  return keys;
}

function setOwnerAvailabilityRangeOnBoard(board, owner, startDate, endDate, unavailable = true, reason = "") {
  const ownerName = normalizeOwner(owner);
  if (!ownerName || ownerName === "No owner") return board;
  const dates = getDateRangeKeys(startDate, endDate || startDate);
  if (dates.length === 0) return board;

  const key = capacityKey(ownerName);
  const capMap = getBoardResourceCapacity(board);
  const currentEntry = getOwnerResourceEntry(board, ownerName);
  const currentDates = new Set(getOwnerUnavailableDates(board, ownerName));
  const currentReasons = currentEntry?.unavailableReasons && typeof currentEntry.unavailableReasons === "object" ? { ...currentEntry.unavailableReasons } : {};
  const note = asText(reason, "");

  for (const dateKey of dates) {
    if (unavailable) {
      currentDates.add(dateKey);
      if (note) currentReasons[dateKey] = note;
    } else {
      currentDates.delete(dateKey);
      delete currentReasons[dateKey];
    }
  }

  return {
    ...board,
    resourceCapacity: {
      ...capMap,
      [key]: {
        ...currentEntry,
        owner: ownerName,
        hoursPerDay: getOwnerCapacity(board, ownerName, 8),
        unavailableDates: Array.from(currentDates).sort(),
        unavailableReasons: currentReasons,
        updatedAt: new Date().toISOString(),
      },
    },
  };
}


function getPlanningAnalysis(task, capacityHoursPerDay = 8) {
  const today = new Date(new Date().toDateString());
  const finalDeadline = parseDateOnly(task?.due);
  const pmReviewDateManual = parseDateOnly(task?.pmReviewDate);
  const reviewBuffer = getReviewBufferDays(task);
  const revisionBuffer = getRevisionBufferDays(task);
  const effortHours = getEffortHours(task);
  const requiredWorkDays = getRequiredWorkDays(task, capacityHoursPerDay);

  if (!finalDeadline) {
    return {
      risk: "Missing deadline",
      riskColor: "#98a1b3",
      riskBg: "#f6f7fb",
      reason: "Set a Final Deadline to calculate a suggested schedule.",
      effortHours,
      requiredWorkDays,
      suggestedStart: null,
      suggestedPmReview: pmReviewDateManual,
      latestInternalFinish: pmReviewDateManual,
      finalDeadline: null,
      slackDays: null,
    };
  }

  const suggestedPmReview = pmReviewDateManual || addDays(finalDeadline, -(reviewBuffer + revisionBuffer));
  const latestInternalFinish = suggestedPmReview;
  const suggestedStart = requiredWorkDays > 0 ? addDays(latestInternalFinish, -(requiredWorkDays - 1)) : latestInternalFinish;
  const slackDays = diffDays(today, suggestedStart);
  const pmToDeadlineDays = diffDays(suggestedPmReview, finalDeadline);

  let risk = "On Track";
  let riskColor = "#00c875";
  let riskBg = "#e6f9f1";
  let reason = "The task still has enough time before PM review and final deadline.";

  if (task?.status === "Done" || task?.status === "Submitted" || task?.status === "Approved") {
    risk = "Completed";
    riskColor = "#00c875";
    riskBg = "#e6f9f1";
    reason = "This task is already completed or approved.";
  } else if (suggestedPmReview > finalDeadline) {
    risk = "Invalid";
    riskColor = "#e2445c";
    riskBg = "#fdeef1";
    reason = "PM Review Date is after the Final Deadline.";
  } else if (pmToDeadlineDays < revisionBuffer) {
    risk = "Tight Review";
    riskColor = "#ff642e";
    riskBg = "#fff2ec";
    reason = "There is not enough revision buffer between PM review and final deadline.";
  } else if (suggestedStart < today) {
    risk = "At Risk";
    riskColor = "#e2445c";
    riskBg = "#fdeef1";
    reason = "The latest suggested start date has already passed.";
  } else if (slackDays <= 1) {
    risk = "Tight";
    riskColor = "#fdab3d";
    riskBg = "#fff8e6";
    reason = "This can still fit, but there is almost no spare time.";
  }

  return {
    risk,
    riskColor,
    riskBg,
    reason,
    effortHours,
    requiredWorkDays,
    reviewBuffer,
    revisionBuffer,
    suggestedStart,
    suggestedPmReview,
    latestInternalFinish,
    finalDeadline,
    slackDays,
    pmToDeadlineDays,
  };
}

function isPmReviewDueSoon(task) {
  const d = parseDateOnly(task?.pmReviewDate);
  if (!d) return false;
  const today = new Date(new Date().toDateString());
  const diff = diffDays(today, d);
  return diff >= 0 && diff <= 3;
}

function isDueSoon(due) {
  if (!due) return false;
  const diff = (new Date(due).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000;
  return diff >= 0 && diff <= 2;
}

function mapAuthError(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Invalid email format.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Account not found.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/email-already-in-use":
      return "This email is already in use.";
    case "auth/weak-password":
      return "Password is too weak (minimum 6 characters).";
    case "auth/operation-not-allowed":
      return "Email/Password login is not enabled in Firebase Authentication.";
    case "auth/too-many-requests":
      return "Too many attempts. Please try again later.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function AuthGate({ onOpenPlanningPreview }: { onOpenPlanningPreview?: () => void }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"error" | "success">("error");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!firebaseAuth) {
      setNoticeType("error");
      setNotice("Firebase Authentication is not configured yet.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();

    if (!normalizedEmail || !password.trim()) {
      setNoticeType("error");
      setNotice("Please enter both email and password.");
      return;
    }

    setLoading(true);
    setNotice("");

    if (mode === "register") {
      if (!normalizedName) {
        setLoading(false);
        setNoticeType("error");
        setNotice("Please enter your display name.");
        return;
      }
      if (password.length < 6) {
        setLoading(false);
        setNoticeType("error");
        setNotice("Password must be at least 6 characters.");
        return;
      }

      try {
        const cred = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
        if (normalizedName) {
          await updateProfile(cred.user, { displayName: normalizedName });
        }
      } catch (err) {
        setNoticeType("error");
        setNotice(mapAuthError(err?.code));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password);
    } catch (err) {
      setNoticeType("error");
      setNotice(mapAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!firebaseAuth) {
      setNoticeType("error");
      setNotice("Firebase Authentication is not configured yet.");
      return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setNoticeType("error");
      setNotice("Enter your email before resetting your password.");
      return;
    }

    setLoading(true);
    setNotice("");
    try {
      await sendPasswordResetEmail(firebaseAuth, normalizedEmail);
      setNoticeType("success");
      setNotice("Password reset email sent.");
      window.alert("Password reset email sent. Please check your inbox/spam folder.");
    } catch (err) {
      setNoticeType("error");
      setNotice(mapAuthError(err?.code));
      window.alert(mapAuthError(err?.code));
    } finally {
      setLoading(false);
    }
  }

  const hasInvite = !!new URLSearchParams(window.location.search).get("invite");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(140deg, #eef3ff 0%, #f8f4ff 42%, #fff4f1 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 430, background: "#fff", borderRadius: 18, boxShadow: "0 10px 35px rgba(25, 25, 35, .12)", border: "1px solid #eceef5", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #eceef5", background: "#fafbff" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#1f1f3b" }}>HOLIFRIDAY</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#676879" }}>Sign in to access your shared boards.</div>
        </div>
        {hasInvite && (
          <div style={{ padding: "10px 22px", background: "#eef4ff", borderBottom: "1px solid #dde8ff", fontSize: 12, color: "#1f5ecf", fontWeight: 700 }}>
            🔗 You have a group invitation — sign in or register to join automatically.
          </div>
        )}

        <div style={{ padding: 22 }}>
          <div style={{ display: "flex", gap: 6, padding: 4, borderRadius: 10, background: "#f3f5fb", marginBottom: 16 }}>
            {[{ id: "login", label: "Login" }, { id: "register", label: "Register" }].map(opt => (
              <button
                key={opt.id}
                onClick={() => { setMode(opt.id); setNotice(""); setPassword(""); }}
                style={{ flex: 1, border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: mode === opt.id ? "#fff" : "none", color: mode === opt.id ? "#0073ea" : "#676879", boxShadow: mode === opt.id ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "register" && (
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Display name"
                style={{ border: "1px solid #d8dbe4", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none" }}
              />
            )}
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              placeholder="email@example.com"
              style={{ border: "1px solid #d8dbe4", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none" }}
            />
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              type="password"
              placeholder="Password"
              style={{ border: "1px solid #d8dbe4", borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none" }}
            />
            <button type="submit" disabled={loading} style={{ marginTop: 2, background: loading ? "#c4c4c4" : "#0073ea", color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 14, fontWeight: 800, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Processing..." : mode === "register" ? "Create account" : "Sign in"}
            </button>
            {mode === "login" && (
              <button type="button" disabled={loading} onClick={handleResetPassword} style={{ marginTop: 2, background: "none", color: loading ? "#9bb7e8" : "#0073ea", border: "none", borderRadius: 10, padding: "6px 0", fontSize: 12, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer" }}>
                Forgot password? Send reset link
              </button>
            )}
          </form>

          {mode === "login" && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#98a1b3" }}>
              Tip: If nothing arrives, check spam and verify Email/Password is enabled in Firebase Auth.
            </div>
          )}

          <button
            type="button"
            onClick={() => onOpenPlanningPreview?.()}
            style={{ marginTop: 10, width: "100%", border: "1px solid #dbe8ff", background: "#eef4ff", color: "#1f5ecf", borderRadius: 10, padding: "9px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Open Planning Preview (no login)
          </button>

          <div style={{ marginTop: 10, minHeight: 18, fontSize: 12, color: noticeType === "success" ? "#00a35a" : "#e2445c" }}>{notice}</div>
        </div>
      </div>
    </div>
  );
}

// ─── UI Primitives ───────────────────────────────────────────────────────────

function Avatar({ name, size = 28 }) {
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue},55%,52%)`, color: "#fff", fontSize: size * 0.38, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, userSelect: "none" }}>
      {initials}
    </div>
  );
}

function InlineEdit({ value, onChange, style = {}, placeholder = "…" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  useEffect(() => { if (!editing) setVal(value); }, [value, editing]);
  function commit() { onChange(val.trim() || value); setEditing(false); }
  if (editing) return <input ref={ref} value={val} onChange={e => setVal(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} style={{ border: "1.5px solid #0073ea", borderRadius: 4, padding: "2px 6px", fontSize: "inherit", fontWeight: "inherit", width: "100%", outline: "none", ...style }} />;
  return <span onClick={() => setEditing(true)} style={{ cursor: "text", ...style }}>{value || <span style={{ color: "#aaa" }}>{placeholder}</span>}</span>;
}

function Dropdown({ value, options, onChange, width = 140 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setOpen(false));
  const opt = options.find(o => o.label === value) || options[options.length - 1];
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(v => !v)} style={{ width, padding: "3px 8px", borderRadius: 4, background: opt.color, color: "#fff", border: "none", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {opt.label}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, background: "#fff", borderRadius: 6, boxShadow: "0 6px 24px rgba(0,0,0,.18)", border: "1px solid #e6e9ef", minWidth: width, overflow: "hidden" }}>
          {options.map(o => (
            <button key={o.label} onClick={() => { onChange(o.label); setOpen(false); }} style={{ display: "block", width: "100%", padding: "7px 10px", textAlign: "left", border: "none", cursor: "pointer", background: o.color, color: "#fff", fontWeight: 700, fontSize: 11 }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.1)"}
              onMouseLeave={e => e.currentTarget.style.filter = ""}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function DotSlider({ value, options, onChange, width = 170, disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setOpen(false));
  const activeIndex = Math.max(0, options.findIndex(o => o.label === value));
  const active = options[activeIndex] || options[0];

  return (
    <div ref={ref} style={{ width: "100%", maxWidth: width, minWidth: 96, position: "relative" }}>
      <button
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        style={{ width: "100%", border: "none", borderRadius: 7, background: active?.color || "#676879", color: "#fff", padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, fontWeight: 800, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.7 : 1 }}
      >
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{active?.label || value}</span>
        <span style={{ fontSize: 10, opacity: 0.9 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 1100, width: "100%", maxHeight: 240, overflowY: "auto", background: "#fff", border: "1px solid #e6e9ef", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,.18)", padding: 4 }}>
          {options.map((opt, idx) => (
            <button
              key={opt.label}
              title={opt.label}
              onClick={() => {
                onChange(opt.label);
                setOpen(false);
              }}
              style={{ width: "100%", border: "none", borderRadius: 6, background: activeIndex === idx ? "#eef4ff" : "#fff", color: "#323338", padding: "6px 8px", marginBottom: idx === options.length - 1 ? 0 : 2, display: "flex", alignItems: "center", gap: 8, textAlign: "left", cursor: "pointer", fontSize: 11, fontWeight: activeIndex === idx ? 800 : 600 }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: opt.color, flexShrink: 0 }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 4, marginTop: 4, overflowX: "auto", paddingBottom: 2 }}>
        {options.map((opt, idx) => (
          <button
            key={`${opt.label}-chip`}
            disabled={disabled}
            onClick={() => onChange(opt.label)}
            style={{ border: activeIndex === idx ? "none" : "1px solid #d8dbe4", background: activeIndex === idx ? opt.color : "#fff", color: activeIndex === idx ? "#fff" : "#676879", borderRadius: 999, padding: "2px 7px", fontSize: 10, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Confetti & Toast ─────────────────────────────────────────────────────────

function Confetti({ show, originX }) {
  const pieces = useRef([]);
  if (show && pieces.current.length === 0) {
    pieces.current = Array.from({ length: 52 }, (_, i) => ({
      id: i,
      x: (originX || window.innerWidth / 2) + (Math.random() - 0.5) * 140,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 0.45,
      size: 7 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 220,
      rot: Math.random() * 360,
    }));
  }
  if (!show) { pieces.current = []; return null; }
  return (
    <>
      <style>{`
        @keyframes cFall { 0%{opacity:1;transform:translateY(0) translateX(0) rotate(0deg)} 100%{opacity:0;transform:translateY(110vh) translateX(var(--cd)) rotate(800deg)} }
        @keyframes toastIn { 0%{transform:translateY(30px) scale(.9);opacity:0} 15%{transform:translateY(0) scale(1);opacity:1} 80%{opacity:1} 100%{opacity:0;transform:translateY(-8px)} }
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
      `}</style>
      {pieces.current.map(p => (
        <div key={p.id} style={{ position: "fixed", left: p.x, top: -20, width: p.size, height: p.size * 0.55, background: p.color, borderRadius: 2, zIndex: 9999, pointerEvents: "none", animation: `cFall 1.5s ease-in ${p.delay}s forwards`, transform: `rotate(${p.rot}deg)`, "--cd": `${p.drift}px` } as any} />
      ))}
    </>
  );
}

function Toast({ show, taskName }) {
  if (!show) return null;
  const msgs = ["🎉 Great job!", "🚀 Completed!", "✅ Nice work!", "🏆 Success!", "💪 You nailed it!"];
  const msg = useRef(msgs[Math.floor(Math.random() * msgs.length)]).current;
  return (
    <div style={{ position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)", background: "#1f1f3b", color: "#fff", borderRadius: 14, padding: "14px 24px", zIndex: 9998, boxShadow: "0 8px 32px rgba(0,0,0,.28)", display: "flex", alignItems: "center", gap: 12, minWidth: 260, animation: "toastIn 2.6s ease forwards", pointerEvents: "none" }}>
      <div style={{ fontSize: 28 }}>🎊</div>
      <div>
        <div style={{ fontWeight: 800, fontSize: 15 }}>{msg}</div>
           <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)", marginTop: 2 }}>"{taskName}" is done</div>
      </div>
    </div>
  );
}

function AssignmentMailNotice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div style={{ position: "fixed", top: 74, right: 20, zIndex: 9997, width: 320, animation: "mailDropIn .45s ease" }}>
      <div style={{ background: "#ffffff", border: "1px solid #dfe9ff", borderRadius: 14, boxShadow: "0 14px 34px rgba(0,0,0,.16)", overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", background: "linear-gradient(135deg, #eef4ff 0%, #e8fff3 100%)", borderBottom: "1px solid #dfe9ff", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 20, animation: "mailPulse 1.2s ease-in-out infinite" }}>✉</div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#1f5ecf" }}>New Assignment Mail</div>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", color: "#8b96ad", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "11px 12px", fontSize: 12, color: "#323338", lineHeight: 1.5 }}>{notice.text}</div>
      </div>
    </div>
  );
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────


function extractMentions(text) {
  const raw = asText(text, "");
  const matches = raw.match(/@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|[A-Za-z0-9._-]+)/g) || [];
  return uniqueStrings(matches.map(m => m.slice(1).replace(/[),.;:!?]+$/g, "").toLowerCase()).filter(Boolean));
}

function renderMentionText(text) {
  const raw = asText(text, "");
  const parts = raw.split(/(@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|@[A-Za-z0-9._-]+)/g);
  return <>{parts.map((part, idx) => part.startsWith("@")
    ? <span key={idx} style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 4, padding: "0 3px", fontWeight: 800 }}>{part}</span>
    : <React.Fragment key={idx}>{part}</React.Fragment>
  )}</>;
}

function createApprovalHistoryEntry(fromStatus, toStatus, by = "System") {
  return {
    id: uid(),
    fromStatus: asText(fromStatus, "—"),
    toStatus: asText(toStatus, "—"),
    action: asText(toStatus, "Status changed"),
    by: asText(by, "System"),
    at: new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" }),
  };
}

function TagPill({ label }: any) {
  const t = TAG_OPTIONS.find(t => t.label === label);
  const color = t?.color || "#888";
  return <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>{label}</span>;
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────

function TaskPanel({ item, onUpdate, onClose, currentUserName, canEditTask, canEditStatus, canComment }) {
  const [comment, setComment] = useState("");
  const [newSub, setNewSub] = useState("");

  function applyPatch(patch, type = "general") {
    if (type === "status") {
      if (!canEditStatus) return;
    } else if (!canEditTask) {
      return;
    }
    const nextPatch = patch?.status && patch.status !== item.status
      ? { ...patch, approvalHistory: [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, "You")] }
      : patch;
    onUpdate({ ...item, ...nextPatch });
  }

  function addComment() {
    if (!canComment || !comment.trim()) return;
    const text = comment.trim();
    onUpdate({ ...item, comments: [...asArray(item.comments), { id: uid(), author: currentUserName || "You", text, mentions: extractMentions(text), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }] });
    setComment("");
  }
  function addSubtask() {
    if (!canEditTask || !newSub.trim()) return;
    onUpdate({ ...item, subtasks: [...item.subtasks, { id: uid(), name: newSub.trim(), done: false }] });
    setNewSub("");
  }
  function toggleSub(id) {
    if (!canEditTask) return;
    onUpdate({ ...item, subtasks: item.subtasks.map(s => s.id === id ? { ...s, done: !s.done } : s) });
  }
  function delSub(id) {
    if (!canEditTask) return;
    onUpdate({ ...item, subtasks: item.subtasks.filter(s => s.id !== id) });
  }
  function toggleTag(label) {
    if (!canEditTask) return;
    const tags = item.tags.includes(label) ? item.tags.filter(t => t !== label) : [...item.tags, label];
    onUpdate({ ...item, tags });
  }

  const doneSubs = item.subtasks.filter(s => s.done).length;
  const durationDays = getTaskDurationDays(item);
  const planning = getPlanningAnalysis(item);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex" }}>
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,.35)" }} />
      <div style={{ width: 420, background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,.15)", display: "flex", flexDirection: "column", animation: "slideIn .22s ease", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 14px", borderBottom: "1px solid #e6e9ef" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            {canEditTask
              ? <InlineEdit value={item.name} onChange={v => onUpdate({ ...item, name: v })} style={{ fontSize: 18, fontWeight: 700, color: "#323338", flex: 1 }} />
              : <div style={{ fontSize: 18, fontWeight: 700, color: "#323338", flex: 1 }}>{item.name}</div>}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#aaa", lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        </div>

        <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 12px", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Status</span>
            {canEditStatus
              ? <DotSlider value={item.status} options={STATUS_OPTIONS} onChange={v => applyPatch({ status: v }, "status")} width={220} />
              : <div style={{ width: 220, padding: "4px 8px", borderRadius: 4, background: "#f2f4f8", color: "#98a1b3", fontWeight: 700, fontSize: 11, border: "1px solid #e6e9ef" }}>{item.status}</div>}
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Priority</span>
            {canEditTask
              ? <DotSlider value={item.priority} options={PRIORITY_OPTIONS} onChange={v => applyPatch({ priority: v })} width={220} />
              : <div style={{ width: 220, padding: "4px 8px", borderRadius: 4, background: "#f2f4f8", color: "#98a1b3", fontWeight: 700, fontSize: 11, border: "1px solid #e6e9ef" }}>{item.priority}</div>}
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Owner</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><Avatar name={item.owner} size={22} /><span style={{ fontSize: 13 }}>{item.owner}</span></div>
              {canEditTask && currentUserName && currentUserName !== item.owner && (
                <button
                  onClick={() => applyPatch({ owner: currentUserName })}
                  style={{ border: "1px solid #cdd7ee", background: "#f4f8ff", color: "#1f5ecf", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                >
                  Assign to me
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Start Date</span>
            <input type="date" disabled={!canEditTask} value={item.start || ""} onChange={e => applyPatch({ start: e.target.value })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Final Deadline</span>
            <input type="date" disabled={!canEditTask} value={item.due || ""} onChange={e => applyPatch({ due: e.target.value })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Duration</span>
            <span style={{ fontSize: 12, color: durationDays > 0 ? "#323338" : "#a7adba", fontWeight: 700 }}>{durationDays > 0 ? `${durationDays} day${durationDays > 1 ? "s" : ""}` : "Set start/deadline"}</span>
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>PM Review Date</span>
            <input type="date" disabled={!canEditTask} value={item.pmReviewDate || ""} onChange={e => applyPatch({ pmReviewDate: e.target.value })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Effort Hours</span>
            <input type="number" min={0} step={0.5} disabled={!canEditTask} value={item.effortHours ?? ""} onChange={e => applyPatch({ effortHours: Number(e.target.value) || 0 })} placeholder="e.g. 8" style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>PM Buffer</span>
            <input type="number" min={0} step={0.5} disabled={!canEditTask} value={item.reviewBufferDays ?? 1} onChange={e => applyPatch({ reviewBufferDays: Number(e.target.value) || 0 })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
            <span style={{ fontSize: 12, color: "#676879", fontWeight: 600 }}>Revision Buffer</span>
            <input type="number" min={0} step={0.5} disabled={!canEditTask} value={item.revisionBufferDays ?? 1} onChange={e => applyPatch({ revisionBufferDays: Number(e.target.value) || 0 })} style={{ border: "1px solid #e6e9ef", borderRadius: 4, padding: "4px 8px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8", color: canEditTask ? "#323338" : "#98a1b3" }} />
          </div>

          <div style={{ border: `1px solid ${planning.riskColor}33`, background: planning.riskBg, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#323338" }}>🧠 Schedule Analysis</div>
              <span style={{ background: planning.riskColor, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{planning.risk}</span>
            </div>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: "#676879" }}>
              <div><b style={{ color: "#323338" }}>Suggested Start:</b><br />{formatDateOnly(planning.suggestedStart) || "—"}</div>
              <div><b style={{ color: "#323338" }}>Send to PM:</b><br />{formatDateOnly(planning.suggestedPmReview) || "—"}</div>
              <div><b style={{ color: "#323338" }}>Work:</b><br />{planning.effortHours || "—"} hr / {planning.requiredWorkDays || "—"} day(s)</div>
              <div><b style={{ color: "#323338" }}>Final:</b><br />{formatDateOnly(planning.finalDeadline) || "—"}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "#676879", lineHeight: 1.45 }}>{planning.reason}</div>
          </div>

          {/* Approval History */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8 }}>Approval History ({asArray(item.approvalHistory).length})</div>
            {asArray(item.approvalHistory).length === 0 ? (
              <div style={{ background: "#f6f7fb", border: "1px solid #eef1f7", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#98a1b3" }}>No approval actions yet.</div>
            ) : (
              <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 6 }}>
                {asArray(item.approvalHistory).slice().reverse().slice(0, 8).map(h => (
                  <div key={h.id} style={{ borderBottom: "1px solid #e6e9ef", paddingBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#323338" }}>{h.fromStatus} → {h.toStatus}</div>
                    <div style={{ fontSize: 10, color: "#98a1b3", marginTop: 2 }}>{h.by || "Unknown"} • {h.at || "—"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8 }}>Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TAG_OPTIONS.map(t => {
                const active = item.tags.includes(t.label);
                return (
                  <button key={t.label} onClick={() => toggleTag(t.label)} style={{ background: active ? t.color + "22" : "#f6f7fb", color: active ? t.color : "#aaa", border: `1.5px solid ${active ? t.color + "66" : "#e6e9ef"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Subtasks */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>Subtasks</span>
              {item.subtasks.length > 0 && <span style={{ color: "#00c875" }}>{doneSubs}/{item.subtasks.length}</span>}
            </div>
            {item.subtasks.length > 0 && (
              <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                {item.subtasks.length > 0 && (
                  <div style={{ height: 4, background: "#e6e9ef", borderRadius: 2, marginBottom: 10, overflow: "hidden" }}>
                    <div style={{ width: `${(doneSubs / item.subtasks.length) * 100}%`, height: "100%", background: "#00c875", transition: "width .3s" }} />
                  </div>
                )}
                {item.subtasks.map(s => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid #eee" }}>
                    <input type="checkbox" disabled={!canEditTask} checked={s.done} onChange={() => toggleSub(s.id)} style={{ accentColor: "#00c875" }} />
                    <span style={{ flex: 1, fontSize: 13, color: s.done ? "#aaa" : "#323338", textDecoration: s.done ? "line-through" : "none" }}>{s.name}</span>
                    {canEditTask && <button onClick={() => delSub(s.id)} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 14 }}>×</button>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input disabled={!canEditTask} value={newSub} onChange={e => setNewSub(e.target.value)} onKeyDown={e => e.key === "Enter" && addSubtask()} placeholder="Add subtask…" style={{ flex: 1, border: "1px solid #e6e9ef", borderRadius: 6, padding: "6px 10px", fontSize: 13, outline: "none", background: canEditTask ? "#fff" : "#f2f4f8" }} />
              {canEditTask && <button onClick={addSubtask} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>+</button>}
            </div>
          </div>

          {/* Comments */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#676879", marginBottom: 10 }}>Comments ({item.comments.length})</div>
            {item.comments.map(c => (
              <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 12, animation: "fadeIn .2s ease" }}>
                <Avatar name={c.author} size={28} />
                <div style={{ background: "#f6f7fb", borderRadius: 8, padding: "8px 12px", flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#323338", marginBottom: 2 }}>{c.author} <span style={{ color: "#aaa", fontWeight: 400 }}>{c.time}</span></div>
                  <div style={{ fontSize: 13, color: "#323338", lineHeight: 1.45 }}>{renderMentionText(c.text)}</div>
                  {asArray(c.mentions).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                      {asArray(c.mentions).map(m => <span key={m} style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>@{m}</span>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <Avatar name="You" size={28} />
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                <input disabled={!canComment} value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => e.key === "Enter" && addComment()} placeholder="Write a comment… use @name or @email" style={{ flex: 1, border: "1px solid #e6e9ef", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", background: canComment ? "#fff" : "#f2f4f8" }} />
                {canComment && <button onClick={addComment} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Send</button>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({ item, onUpdate, onOpen }: any) {
  const overdue = isOverdue(item.due) && item.status !== "Done";
  const soon    = isDueSoon(item.due) && item.status !== "Done" && !overdue;
  const stat    = STATUS_OPTIONS.find(s => s.label === item.status);
  return (
    <div onClick={() => onOpen(item)} style={{ background: "#fff", borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,.08)", padding: "12px 14px", marginBottom: 8, cursor: "pointer", borderLeft: `3px solid ${stat?.color || "#ccc"}`, transition: "transform .12s, box-shadow .12s" }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.08)"; }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#323338", marginBottom: 8 }}>{item.name}</div>
      {item.tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>{item.tags.map(t => <TagPill key={t} label={t} />)}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
        <Avatar name={item.owner} size={22} />
        {item.due && <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? "#e2445c" : soon ? "#fdab3d" : "#aaa" }}>{overdue ? "⚠ " : soon ? "⏰ " : ""}{item.due}</span>}
      </div>
      {item.subtasks.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#aaa" }}>
          ✅ {item.subtasks.filter(s => s.done).length}/{item.subtasks.length} subtasks
        </div>
      )}
    </div>
  );
}

function KanbanView({ board, onUpdate, onCelebrate, currentUserName, currentUserEmail }) {
  function updItem(groupId, updated) {
    if (updated.status === "Done") {
      const old = board.groups.flatMap(g => g.items).find(i => i.id === updated.id);
      if (old?.status !== "Done") onCelebrate(updated.name, window.innerWidth / 2);
    }
    onUpdate({ ...board, groups: board.groups.map(g => g.id === groupId ? { ...g, items: g.items.map(i => i.id === updated.id ? updated : i) } : g) });
  }

  const [panelItem, setPanelItem] = useState(null);
  const panelGroup = board.groups.find(g => g.items.some(i => i.id === panelItem?.id));
  const normalizedUserEmail = normalizeEmail(currentUserEmail);
  const panelRole = panelGroup ? normalizeRole(panelGroup.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor") : "editor";
  const panelCanEditTask = !normalizedUserEmail || panelRole === "editor";
  const panelCanEditStatus = panelCanEditTask;
  const panelCanComment = panelCanEditTask;

  return (
    <div style={{ flex: 1, overflowX: "auto", padding: "24px 28px", display: "flex", gap: 16, alignItems: "flex-start" }}>
      {panelItem && panelGroup && (
        <TaskPanel item={panelItem} onUpdate={u => { updItem(panelGroup.id, u); setPanelItem(u); }} onClose={() => setPanelItem(null)} currentUserName={currentUserName} canEditTask={panelCanEditTask} canEditStatus={panelCanEditStatus} canComment={panelCanComment} />
      )}
      {STATUS_OPTIONS.map(col => {
        const allItems = board.groups.flatMap(g => g.items.filter(i => i.status === col.label).map(i => ({ ...i, _gid: g.id })));
        return (
          <div key={col.label} style={{ minWidth: 240, maxWidth: 280, flex: "0 0 260px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: col.color }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: "#323338" }}>{col.label}</span>
              <span style={{ fontSize: 11, color: "#aaa", marginLeft: "auto", background: "#f0f0f0", borderRadius: 10, padding: "1px 7px" }}>{allItems.length}</span>
            </div>
            <div style={{ background: "#f6f7fb", borderRadius: 10, padding: "8px", minHeight: 120 }}>
              {allItems.map(item => (
                <KanbanCard key={item.id} item={item} onUpdate={u => updItem(item._gid, u)} onOpen={setPanelItem} />
              ))}
              {allItems.length === 0 && <div style={{ textAlign: "center", color: "#ddd", fontSize: 12, paddingTop: 20 }}>No tasks</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CalendarTimelineView({ board, onOpen }) {
  const scheduledItems = useMemo(() => {
    return board.groups
      .flatMap(g => g.items.map(i => ({ ...i, _groupName: g.name, _groupColor: g.color })))
      .map(item => {
        const range = getTaskRange(item);
        if (!range) return null;
        return { ...item, _start: range.start, _end: range.end };
      })
      .filter(Boolean)
      .sort((a, b) => a._start.getTime() - b._start.getTime());
  }, [board]);

  const range = useMemo(() => {
    if (scheduledItems.length === 0) {
      const today = new Date(new Date().toDateString());
      return { start: today, end: today, totalDays: 7 };
    }
    const startMs = Math.min(...scheduledItems.map(i => i._start.getTime()));
    const endMs = Math.max(...scheduledItems.map(i => i._end.getTime()));
    const start = new Date(startMs);
    const end = new Date(endMs);
    return { start, end, totalDays: Math.max(diffDays(start, end) + 1, 7) };
  }, [scheduledItems]);

  const tickDays = Array.from({ length: range.totalDays }, (_, i) => {
    const d = new Date(range.start);
    d.setDate(range.start.getDate() + i);
    return d;
  });

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px" }}>
      <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#323338" }}>Calendar Timeline</div>
          <div style={{ fontSize: 12, color: "#676879" }}>
            {range.start.toLocaleDateString()} - {range.end.toLocaleDateString()} ({range.totalDays} days)
          </div>
        </div>

        {scheduledItems.length === 0 ? (
          <div style={{ padding: "36px 20px", textAlign: "center", color: "#98a1b3", fontSize: 13 }}>
            Add a Start Date or Due Date to tasks to see them on the calendar.
          </div>
        ) : (
          <div style={{ minWidth: 980 }}>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", borderBottom: "1px solid #eef1f7", background: "#fafbff" }}>
              <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#676879", textTransform: "uppercase", letterSpacing: 0.5 }}>Task</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${range.totalDays}, minmax(20px, 1fr))`, gap: 0 }}>
                {tickDays.map((day, i) => (
                  <div key={i} style={{ padding: "10px 0", textAlign: "center", borderLeft: "1px solid #f2f4f9", fontSize: 10, color: "#98a1b3" }}>
                    {day.getDate()}
                  </div>
                ))}
              </div>
            </div>

            {scheduledItems.map(item => {
              const startOffset = diffDays(range.start, item._start);
              const spanDays = diffDays(item._start, item._end) + 1;
              const leftPct = (startOffset / range.totalDays) * 100;
              const widthPct = (spanDays / range.totalDays) * 100;
              const status = STATUS_OPTIONS.find(s => s.label === item.status);
              return (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "280px 1fr", borderBottom: "1px solid #f4f6fb", minHeight: 52 }}>
                  <button
                    onClick={() => onOpen(item)}
                    style={{ border: "none", background: "#fff", borderRight: "1px solid #f2f4f9", textAlign: "left", padding: "8px 12px", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
                    <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#98a1b3" }}>
                      <span>{item.owner}</span>
                      <span>•</span>
                      <span>{item._groupName}</span>
                      <span>•</span>
                      <span>{spanDays}d</span>
                    </div>
                  </button>
                  <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${range.totalDays}, minmax(20px, 1fr))` }}>
                    {tickDays.map((_, i) => <div key={i} style={{ borderLeft: "1px solid #f7f8fc" }} />)}
                    <div style={{ position: "absolute", left: `${leftPct}%`, width: `${Math.max(widthPct, 1.4)}%`, top: "50%", transform: "translateY(-50%)", height: 24, borderRadius: 7, background: status?.color || item._groupColor || "#579bfc", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 3px 8px rgba(0,0,0,.16)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" }}>
                      {spanDays}d
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function TeamScheduleView({ board, onOpen }: any) {
  const [days, setDays] = useState(30);
  const [capacity, setCapacity] = useState(8);
  const [hideDone, setHideDone] = useState(true);
  const [selectedOwner, setSelectedOwner] = useState("All");

  const today = useMemo(() => new Date(new Date().toDateString()), []);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  }), [today, days]);
  const dateKeys = useMemo(() => dayList.map(d => d.toISOString().slice(0, 10)), [dayList]);

  const tasks = useMemo(() => {
    return board.groups
      .flatMap(g => asArray(g.items).map(i => ({ ...i, _groupId: g.id, _groupName: g.name, _groupColor: g.color })))
      .map(item => {
        const range = getTaskRange(item);
        if (!range) return null;
        const duration = diffDays(range.start, range.end) + 1;
        const effort = getEffortHours(item);
        return { ...item, _start: range.start, _end: range.end, _duration: duration, _effortHours: effort, _hoursPerDay: duration > 0 ? (effort > 0 ? effort / duration : 1) : 0, _ownerCapacity: getOwnerCapacity(board, item.owner, capacity), _analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, capacity)) };
      })
      .filter(Boolean)
      .filter(item => !hideDone || item.status !== "Done");
  }, [board, hideDone, capacity]);

  const ownerNames = useMemo(() => {
    const names = Array.from(new Set<string>(tasks.map((t: any) => (t.owner || "Unassigned").trim() || "Unassigned")));
    return names.sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  useEffect(() => {
    if (selectedOwner !== "All" && !ownerNames.includes(selectedOwner)) setSelectedOwner("All");
  }, [ownerNames, selectedOwner]);

  const visibleOwners = selectedOwner === "All" ? ownerNames : ownerNames.filter(o => o === selectedOwner);

  const tasksByOwner = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const owner of ownerNames) map.set(owner, []);
    for (const task of tasks) {
      const owner = (task.owner || "Unassigned").trim() || "Unassigned";
      if (!map.has(owner)) map.set(owner, []);
      map.get(owner).push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a._start.getTime() - b._start.getTime());
    return map;
  }, [tasks, ownerNames]);

  const workload = useMemo(() => {
    const result = new Map<string, Map<string, any[]>>();
    for (const owner of ownerNames) {
      const byDate = new Map<string, any[]>(dateKeys.map(k => [k, [] as any[]]));
      for (const task of tasksByOwner.get(owner) || []) {
        for (const day of dayList) {
          const key = day.toISOString().slice(0, 10);
          if (day >= task._start && day <= task._end) byDate.get(key)?.push(task);
        }
      }
      result.set(owner, byDate);
    }
    return result;
  }, [ownerNames, tasksByOwner, dayList, dateKeys]);

  const ownerSummary = visibleOwners.map(owner => {
    const list = tasksByOwner.get(owner) || [];
    const byDate = workload.get(owner) || new Map();
    const loadHours = Array.from(byDate.values()).reduce((sum, v) => sum + v.reduce((s, t) => s + (t._hoursPerDay || 0), 0), 0);
    const overloadDays = Array.from(byDate.entries()).filter(([dateKey, v]) => {
      const load = v.reduce((s, t) => s + (t._hoursPerDay || 0), 0);
      return load > getOwnerCapacityForDate(board, owner, dateKey, capacity);
    }).length;
    const unavailableDays = dateKeys.filter(dateKey => isOwnerUnavailable(board, owner, dateKey)).length;
    const overdue = list.filter(t => isOverdue(t.due) && t.status !== "Done").length;
    const dueSoon = list.filter(t => isDueSoon(t.due) && t.status !== "Done").length;
    return { owner, taskCount: list.length, loadHours, overloadDays, unavailableDays, overdue, dueSoon };
  });

  const maxLoad = Math.max(1, ...Array.from(workload.values()).flatMap(byDate => Array.from(byDate.values()).map(v => v.reduce((sum, t) => sum + (t._hoursPerDay || 0), 0))));

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#323338" }}>👥 Team Schedule / Workload</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#676879" }}>Check who is busy, overloaded, overdue, or free before planning new work.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select value={selectedOwner} onChange={e => setSelectedOwner(e.target.value)} style={{ border: "1px solid #d8dbe4", borderRadius: 7, padding: "6px 8px", fontSize: 12, background: "#fff" }}>
              <option>All</option>
              {ownerNames.map(o => <option key={o}>{o}</option>)}
            </select>
            <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ border: "1px solid #d8dbe4", borderRadius: 7, padding: "6px 8px", fontSize: 12, background: "#fff" }}>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}>
              Capacity hr/day
              <input type="number" min={1} max={12} value={capacity} onChange={e => setCapacity(Math.max(1, Number(e.target.value) || 1))} style={{ width: 54, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}>
              <input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />
              Hide done
            </label>
          </div>
        </div>

        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, borderBottom: "1px solid #eef1f7" }}>
          {ownerSummary.length === 0 ? (
            <div style={{ color: "#98a1b3", fontSize: 13 }}>No scheduled tasks. Add Start Date and Due Date to tasks first.</div>
          ) : ownerSummary.map(s => (
            <div key={s.owner} style={{ border: "1px solid #eef1f7", borderRadius: 10, padding: "10px 12px", background: s.overloadDays > 0 ? "#fff8e6" : s.overdue > 0 ? "#fff0f3" : "#fafbff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#eef4ff", color: "#0073ea", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 }}>{s.owner.slice(0, 1).toUpperCase()}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.owner}</div>
                  <div style={{ fontSize: 11, color: "#98a1b3" }}>{s.taskCount} tasks • {Math.round(s.loadHours * 10) / 10}h scheduled</div>
                </div>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {s.overloadDays > 0 && <span style={{ background: "#fdab3d", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.overloadDays} overloaded</span>}
                {s.overdue > 0 && <span style={{ background: "#e2445c", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.overdue} overdue</span>}
                {s.dueSoon > 0 && <span style={{ background: "#579bfc", color: "#fff", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>{s.dueSoon} due soon</span>}
                {s.overloadDays === 0 && s.overdue === 0 && <span style={{ background: "#e6f9f1", color: "#00854d", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>OK</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: Math.max(980, 220 + days * 46) }}>
            <div style={{ display: "grid", gridTemplateColumns: `220px repeat(${days}, minmax(46px, 1fr))`, background: "#fafbff", borderBottom: "1px solid #eef1f7", position: "sticky", top: 0, zIndex: 2 }}>
              <div style={{ padding: "10px 12px", fontSize: 11, fontWeight: 800, color: "#676879", textTransform: "uppercase", letterSpacing: .4 }}>Person</div>
              {dayList.map(day => {
                const key = day.toISOString().slice(0, 10);
                const isToday = key === today.toISOString().slice(0, 10);
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <div key={key} style={{ padding: "8px 4px", textAlign: "center", borderLeft: "1px solid #f0f2f8", background: isToday ? "#eef4ff" : weekend ? "#fbfbfd" : "transparent" }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: isToday ? "#0073ea" : "#676879" }}>{day.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: isToday ? "#0073ea" : "#323338" }}>{day.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {visibleOwners.length === 0 ? (
              <div style={{ padding: "36px 20px", textAlign: "center", color: "#98a1b3", fontSize: 13 }}>No assignees found for the selected schedule.</div>
            ) : visibleOwners.map(owner => {
              const byDate = workload.get(owner) || new Map();
              return (
                <div key={owner} style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: Math.max(76, ((tasksByOwner.get(owner) || []).length * 28) + 24), borderBottom: "1px solid #f0f2f8", background: "#fff" }}>
                  <div style={{ padding: "12px", borderRight: "1px solid #f0f2f8", position: "sticky", left: 0, background: "#fff", zIndex: 3 }}>
                    <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{owner}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{(tasksByOwner.get(owner) || []).length} scheduled tasks • {getOwnerUnavailableDates(board, owner).length} off day(s)</div>
                  </div>
                  <div style={{ position: "relative", minHeight: Math.max(76, ((tasksByOwner.get(owner) || []).length * 28) + 24), display: "grid", gridTemplateColumns: `repeat(${days}, minmax(46px, 1fr))` }}>
                    {dayList.map(day => {
                      const key = day.toISOString().slice(0, 10);
                      const list = byDate.get(key) || [];
                      const loadHours = list.reduce((sum, t) => sum + (t._hoursPerDay || 0), 0);
                      const unavailable = isOwnerUnavailable(board, owner, key);
                      const ownerCapacity = getOwnerCapacityForDate(board, owner, key, capacity);
                      const overloaded = loadHours > ownerCapacity;
                      const intensity = Math.min(loadHours / Math.max(maxLoad, Math.max(ownerCapacity, 1)), 1);
                      const reason = getOwnerUnavailableReason(board, owner, key);
                      const title = unavailable
                        ? `${owner} unavailable${reason ? `: ${reason}` : ""}${list.length ? ` • ${Math.round(loadHours * 10) / 10}h scheduled` : ""}`
                        : (list.length ? `${Math.round(loadHours * 10) / 10}h / ${ownerCapacity}h • ${list.length} task(s)` : `${ownerCapacity}h available`);
                      return <div key={key} title={title} style={{ borderLeft: "1px solid #f7f8fc", background: unavailable ? "repeating-linear-gradient(135deg,#f1f3f7 0,#f1f3f7 6px,#e7eaf0 6px,#e7eaf0 12px)" : overloaded ? "#fff2d0" : list.length ? `rgba(0,115,234,${0.04 + intensity * 0.12})` : "#fff", position: "relative" }}>{unavailable ? <div style={{ position: "absolute", inset: "auto 4px 4px 4px", fontSize: 9, color: "#676879", fontWeight: 900, textAlign: "center" }}>OFF</div> : overloaded && <div style={{ height: 4, background: "#fdab3d" }} />}</div>;
                    })}
                    {(tasksByOwner.get(owner) || []).map((task, idx) => {
                      const startIndex = Math.max(0, diffDays(today, task._start));
                      const endIndex = Math.min(days - 1, diffDays(today, task._end));
                      if (endIndex < 0 || startIndex >= days) return null;
                      const span = Math.max(1, endIndex - startIndex + 1);
                      const left = (startIndex / days) * 100;
                      const width = (span / days) * 100;
                      const color = STATUS_OPTIONS.find(s => s.label === task.status)?.color || task._groupColor || "#579bfc";
                      const totalDays = diffDays(task._start, task._end) + 1;
                      return <button key={task.id} onClick={() => onOpen(task)} title={`${task.name} • ${task._groupName} • ${totalDays} day(s)`} style={{ position: "absolute", left: `${left}%`, width: `calc(${width}% - 6px)`, top: 12 + idx * 28, height: 22, border: "none", borderRadius: totalDays > 1 ? 999 : 6, background: color, color: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,.16)", padding: "0 8px", fontSize: 10, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left", zIndex: 2 }}>{task.name}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "10px 16px", borderTop: "1px solid #eef1f7", fontSize: 11, color: "#98a1b3", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>Tip: use Start Date + Due Date for multi-day work.</span>
          <span>Overloaded = estimated hours active on that day exceed capacity hr/day.</span>
          <span>Done tasks are hidden by default.</span>
        </div>
      </div>
    </div>
  );
}



function MyWorkView({ board, currentUserEmail, currentUserName, onOpen }: any) {
  const today = new Date(new Date().toDateString());
  const meEmail = normalizeEmail(currentUserEmail);
  const meName = normalizeOwner(currentUserName || currentUserEmail);

  function isMine(owner) {
    const ownerText = normalizeOwner(owner);
    if (!meEmail && (!meName || meName === "No owner")) return true;
    return normalizeEmail(ownerText) === meEmail || ownerText.toLowerCase() === meName.toLowerCase();
  }

  const tasks = asArray(board?.groups)
    .flatMap(group => asArray(group.items).map(item => ({ ...item, _groupName: group.name, _groupColor: group.color })))
    .filter(item => isMine(item.owner))
    .filter(item => !["Done", "Submitted", "Approved"].includes(item.status))
    .map(item => ({ ...item, _analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, 8)) }))
    .sort((a, b) => {
      const ad = parseDateOnly(a.due)?.getTime?.() || 9e15;
      const bd = parseDateOnly(b.due)?.getTime?.() || 9e15;
      return ad - bd;
    });

  const buckets = [
    { key: "overdue", title: "Overdue", icon: "⚠️", color: "#e2445c", items: tasks.filter(t => isOverdue(t.due)) },
    { key: "today", title: "Due Today", icon: "📍", color: "#fdab3d", items: tasks.filter(t => parseDateOnly(t.due) && diffDays(today, parseDateOnly(t.due)) === 0) },
    { key: "week", title: "This Week", icon: "📅", color: "#579bfc", items: tasks.filter(t => { const d = parseDateOnly(t.due); if (!d) return false; const n = diffDays(today, d); return n > 0 && n <= 7; }) },
    { key: "pm", title: "PM / Review", icon: "✅", color: "#a25ddc", items: tasks.filter(t => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(t.status) || isPmReviewDueSoon(t)) },
    { key: "later", title: "Later / No Due", icon: "🧭", color: "#676879", items: tasks.filter(t => { const d = parseDateOnly(t.due); if (!d) return true; return diffDays(today, d) > 7; }) },
  ];

  const uniqueBuckets = buckets.map(b => ({ ...b, items: Array.from(new Map(b.items.map(i => [i.id, i])).values()) }));

  function TaskMiniCard({ item, color }: any) {
    const statusColor = STATUS_OPTIONS.find(s => s.label === item.status)?.color || "#c4c4c4";
    const due = parseDateOnly(item.due);
    const dueText = due ? `${item.due} (${diffDays(today, due)}d)` : "No due date";
    return (
      <button onClick={() => onOpen(item)} style={{ width: "100%", textAlign: "left", border: "1px solid #eef1f7", borderLeft: `4px solid ${color}`, borderRadius: 10, background: "#fff", padding: "10px 12px", cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</div>
            <div style={{ marginTop: 3, fontSize: 11, color: "#98a1b3" }}>{item._groupName} • {dueText}</div>
          </div>
          <span style={{ flexShrink: 0, background: statusColor, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{item.status}</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: item._analysis.riskColor, fontWeight: 800 }}>{item._analysis.risk} • {item._analysis.reason}</div>
      </button>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#323338" }}>👤 My Work</h2>
          <div style={{ marginTop: 4, fontSize: 12, color: "#676879" }}>Personal task inbox for {meEmail || meName || "current user"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800, color: "#323338" }}>{tasks.length} active</span>
          <span style={{ background: "#fdeef1", color: "#e2445c", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>{uniqueBuckets[0].items.length} overdue</span>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 32, textAlign: "center", color: "#98a1b3" }}>No active tasks assigned to you.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          {uniqueBuckets.map(bucket => (
            <div key={bucket.key} style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14, boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#323338" }}>{bucket.icon} {bucket.title}</div>
                <span style={{ background: bucket.color, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 900 }}>{bucket.items.length}</span>
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {bucket.items.length === 0 ? <div style={{ fontSize: 12, color: "#c4cad6", padding: "8px 0" }}>No tasks</div> : bucket.items.map(item => <TaskMiniCard key={`${bucket.key}-${item.id}`} item={item} color={bucket.color} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CriticalPathView({ board, onOpen }: any) {
  const today = new Date(new Date().toDateString());
  const active = asArray(board?.groups)
    .flatMap(group => asArray(group.items).map(item => ({ group, item, range: getTaskRange(item), analysis: getPlanningAnalysis(item, getOwnerCapacity(board, item.owner, 8)) })))
    .filter(r => !["Done", "Submitted", "Approved"].includes(r.item.status));

  const scored = active.map(r => {
    const riskWeight = r.analysis.risk === "At Risk" || r.analysis.risk === "Invalid" ? 60 : r.analysis.risk === "Tight Review" ? 45 : r.analysis.risk === "Tight" ? 30 : r.analysis.risk === "Missing deadline" ? 20 : 0;
    const slackPenalty = r.analysis.slackDays == null ? 0 : Math.max(0, 14 - r.analysis.slackDays);
    const effortScore = Math.min(20, getEffortHours(r.item) / 2);
    const overdueScore = isOverdue(r.item.due) ? 35 : 0;
    return { ...r, score: Math.round(riskWeight + slackPenalty + effortScore + overdueScore) };
  }).sort((a, b) => b.score - a.score);

  const critical = scored.filter(r => r.score > 0 || ["At Risk", "Invalid", "Tight Review", "Tight"].includes(r.analysis.risk)).slice(0, 12);
  const timeline = [...critical].sort((a, b) => {
    const ad = rDate(a);
    const bd = rDate(b);
    return ad - bd;
  });
  function rDate(r) { return (r.analysis.suggestedStart || r.range?.start || parseDateOnly(r.item.due) || today).getTime(); }

  const dates = timeline.flatMap(r => [r.analysis.suggestedStart, r.analysis.finalDeadline, r.range?.start, r.range?.end].filter(Boolean));
  const start = dates.length ? new Date(Math.min(...dates.map((d:any) => d.getTime()))) : today;
  const end = dates.length ? new Date(Math.max(...dates.map((d:any) => d.getTime()))) : addDays(today, 14);
  const total = Math.max(1, diffDays(start, end) + 1);

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#323338" }}>🧭 Critical Path</h2>
        <div style={{ marginTop: 4, fontSize: 12, color: "#676879" }}>Tasks most likely to affect the final deadline. This is schedule-risk based until dependencies are added.</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>CRITICAL TASKS</div><div style={{ fontSize: 28, fontWeight: 900, color: "#e2445c" }}>{critical.length}</div></div>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>OVERDUE IN PATH</div><div style={{ fontSize: 28, fontWeight: 900, color: "#fdab3d" }}>{critical.filter(r => isOverdue(r.item.due)).length}</div></div>
        <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, padding: 14 }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>HIGHEST SCORE</div><div style={{ fontSize: 28, fontWeight: 900, color: "#0073ea" }}>{critical[0]?.score || 0}</div></div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.05)", marginBottom: 16 }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #eef1f7", fontSize: 14, fontWeight: 900, color: "#323338" }}>Critical Timeline</div>
        {timeline.length === 0 ? <div style={{ padding: 24, color: "#98a1b3", textAlign: "center" }}>No critical tasks detected.</div> : timeline.map((r, idx) => {
          const s = r.analysis.suggestedStart || r.range?.start || today;
          const e = r.analysis.finalDeadline || r.range?.end || s;
          const left = Math.max(0, diffDays(start, s)) / total * 100;
          const width = Math.max(3, (diffDays(s, e) + 1) / total * 100);
          const color = r.analysis.riskColor || STATUS_OPTIONS.find(x => x.label === r.item.status)?.color || "#579bfc";
          return <div key={r.item.id} style={{ display: "grid", gridTemplateColumns: "260px 1fr 70px", gap: 12, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f5f6fb" }}>
            <button onClick={() => onOpen(r.item)} style={{ border: "none", background: "transparent", textAlign: "left", cursor: "pointer", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{idx + 1}. {r.item.name}</div>
              <div style={{ fontSize: 11, color: "#98a1b3" }}>{r.group.name} • {r.item.owner || "No owner"}</div>
            </button>
            <div style={{ height: 24, background: "#f0f2f8", borderRadius: 999, position: "relative" }}>
              <div style={{ position: "absolute", left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: 4, height: 16, borderRadius: 999, background: color, boxShadow: "0 2px 6px rgba(0,0,0,.14)" }} />
            </div>
            <div style={{ textAlign: "right", fontSize: 11, fontWeight: 900, color }}>{r.score}</div>
          </div>;
        })}
      </div>

      <div style={{ background: "#fff", border: "1px solid #eef1f7", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #eef1f7", fontSize: 14, fontWeight: 900, color: "#323338" }}>Why these tasks are critical</div>
        {critical.map(r => <button key={`why-${r.item.id}`} onClick={() => onOpen(r.item)} style={{ width: "100%", textAlign: "left", border: "none", borderBottom: "1px solid #f5f6fb", background: "#fff", padding: "11px 14px", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><b style={{ color: "#323338", fontSize: 13 }}>{r.item.name}</b><span style={{ color: r.analysis.riskColor, fontWeight: 900, fontSize: 11 }}>{r.analysis.risk}</span></div>
          <div style={{ marginTop: 4, color: "#676879", fontSize: 11 }}>{r.analysis.reason}</div>
          <div style={{ marginTop: 4, color: "#98a1b3", fontSize: 10 }}>Suggested start: {formatDateOnly(r.analysis.suggestedStart) || "—"} • PM: {formatDateOnly(r.analysis.suggestedPmReview) || "—"} • Final: {formatDateOnly(r.analysis.finalDeadline) || "—"}</div>
        </button>)}
      </div>
    </div>
  );
}

function PMPlanningView({ board, onOpen, onUpdateCapacity }: any) {
  const [fallbackCapacity, setFallbackCapacity] = useState(6);
  const [hideDone, setHideDone] = useState(true);
  const [riskFilter, setRiskFilter] = useState("All");
  const projectOwners = useMemo(() => getBoardOwners(board), [board]);

  function updateOwnerCapacity(owner, hoursPerDay) {
    if (!onUpdateCapacity) return;
    onUpdateCapacity(board.id, owner, hoursPerDay);
  }

  const tasks = useMemo(() => {
    return board.groups
      .flatMap(g => asArray(g.items).map(i => ({ ...i, _groupId: g.id, _groupName: g.name, _groupColor: g.color })))
      .filter(i => !hideDone || !["Done", "Submitted", "Approved"].includes(i.status))
      .map(i => ({ ...i, _capacityHoursPerDay: getOwnerCapacity(board, i.owner, fallbackCapacity), _analysis: getPlanningAnalysis(i, getOwnerCapacity(board, i.owner, fallbackCapacity)) }))
      .filter(i => riskFilter === "All" || i._analysis.risk === riskFilter)
      .sort((a, b) => {
        const ar = ["At Risk", "Invalid", "Tight Review", "Tight", "Missing deadline", "On Track", "Completed"].indexOf(a._analysis.risk);
        const br = ["At Risk", "Invalid", "Tight Review", "Tight", "Missing deadline", "On Track", "Completed"].indexOf(b._analysis.risk);
        if (ar !== br) return ar - br;
        const ad = a._analysis.suggestedPmReview?.getTime?.() || a._analysis.finalDeadline?.getTime?.() || 9e15;
        const bd = b._analysis.suggestedPmReview?.getTime?.() || b._analysis.finalDeadline?.getTime?.() || 9e15;
        return ad - bd;
      });
  }, [board, fallbackCapacity, hideDone, riskFilter]);

  const pmQueue = tasks.filter(t => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(t.status) || isPmReviewDueSoon(t));
  const atRisk = tasks.filter(t => ["At Risk", "Invalid", "Tight Review"].includes(t._analysis.risk));
  const riskOptions = ["All", "At Risk", "Invalid", "Tight Review", "Tight", "Missing deadline", "On Track", "Completed"];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", background: "#f6f7fb" }}>
      <div style={{ background: "#fff", border: "1px solid #e6e9ef", borderRadius: 12, overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: "#323338" }}>🧠 Planning Analysis / PM Review</div>
            <div style={{ marginTop: 3, fontSize: 12, color: "#676879" }}>Backward-plan from Final Deadline, PM review time, revision buffer, and effort hours.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}>Default hr/day
              <input type="number" min={1} max={12} value={fallbackCapacity} onChange={e => setFallbackCapacity(Math.max(1, Number(e.target.value) || 1))} style={{ width: 58, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }} />
            </label>
            <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} style={{ border: "1px solid #d8dbe4", borderRadius: 7, padding: "6px 8px", fontSize: 12, background: "#fff" }}>
              {riskOptions.map(r => <option key={r}>{r}</option>)}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#676879" }}><input type="checkbox" checked={hideDone} onChange={e => setHideDone(e.target.checked)} />Hide completed</label>
          </div>
        </div>

        <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, borderBottom: "1px solid #eef1f7" }}>
          <div style={{ border: "1px solid #eef1f7", borderRadius: 10, padding: "10px 12px", background: "#fafbff" }}><div style={{ fontSize: 11, color: "#98a1b3", fontWeight: 800 }}>TOTAL ACTIVE</div><div style={{ fontSize: 22, fontWeight: 900, color: "#323338" }}>{tasks.length}</div></div>
          <div style={{ border: "1px solid #f6d8df", borderRadius: 10, padding: "10px 12px", background: "#fff0f3" }}><div style={{ fontSize: 11, color: "#bb3354", fontWeight: 800 }}>AT RISK</div><div style={{ fontSize: 22, fontWeight: 900, color: "#e2445c" }}>{atRisk.length}</div></div>
          <div style={{ border: "1px solid #dbe8ff", borderRadius: 10, padding: "10px 12px", background: "#f0f6ff" }}><div style={{ fontSize: 11, color: "#1f5ecf", fontWeight: 800 }}>PM QUEUE</div><div style={{ fontSize: 22, fontWeight: 900, color: "#0073ea" }}>{pmQueue.length}</div></div>
          <div style={{ border: "1px solid #fff0c7", borderRadius: 10, padding: "10px 12px", background: "#fff8e6" }}><div style={{ fontSize: 11, color: "#a56600", fontWeight: 800 }}>TOTAL EFFORT</div><div style={{ fontSize: 22, fontWeight: 900, color: "#d4900a" }}>{tasks.reduce((s, t) => s + getEffortHours(t), 0)}h</div></div>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#323338" }}>Team Capacity / Availability</div>
              <div style={{ marginTop: 2, fontSize: 11, color: "#98a1b3" }}>Set how many hours each person can spend on this project per day.</div>
            </div>
          </div>

          {projectOwners.length === 0 ? (
            <div style={{ fontSize: 12, color: "#98a1b3" }}>Assign owners to tasks first, then capacity settings will appear here.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
              {projectOwners.map(owner => {
                const cap = getOwnerCapacity(board, owner, fallbackCapacity);
                const ownerTasks = tasks.filter(t => normalizeOwner(t.owner) === normalizeOwner(owner));
                const ownerEffort = ownerTasks.reduce((sum, t) => sum + getEffortHours(t), 0);
                return (
                  <div key={owner} style={{ border: "1px solid #eef1f7", borderRadius: 10, background: "#fafbff", padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{owner}</div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        value={cap}
                        onChange={e => updateOwnerCapacity(owner, e.target.value)}
                        style={{ width: 72, border: "1px solid #d8dbe4", borderRadius: 7, padding: "5px 7px", fontSize: 12 }}
                      />
                      <span style={{ fontSize: 12, color: "#676879" }}>hr/day</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: "#98a1b3" }}>{ownerTasks.length} active task(s) • {ownerEffort}h effort</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef1f7" }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#323338", marginBottom: 8 }}>PM Review Queue</div>
          {pmQueue.length === 0 ? <div style={{ fontSize: 12, color: "#98a1b3" }}>No tasks waiting for PM review or due for review soon.</div> : (
            <div style={{ display: "grid", gap: 8 }}>
              {pmQueue.slice(0, 8).map(t => <button key={t.id} onClick={() => onOpen(t)} style={{ textAlign: "left", border: "1px solid #eef1f7", background: "#fff", borderLeft: `4px solid ${t._analysis.riskColor}`, borderRadius: 8, padding: "9px 10px", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><b style={{ fontSize: 13, color: "#323338" }}>{t.name}</b><span style={{ fontSize: 11, fontWeight: 900, color: t._analysis.riskColor }}>{t._analysis.risk}</span></div>
                <div style={{ marginTop: 3, fontSize: 11, color: "#676879" }}>PM: {formatDateOnly(t._analysis.suggestedPmReview) || "—"} • Final: {formatDateOnly(t._analysis.finalDeadline) || "—"} • {t.owner || "Unassigned"} • {t._capacityHoursPerDay}h/day</div>
              </button>)}
            </div>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 920, borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#fafbff", color: "#676879", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Task</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Owner</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Status</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Effort</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Suggested Start</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>PM Review</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Final Deadline</th>
                <th style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: "#98a1b3" }}>No tasks match this analysis filter.</td></tr> : tasks.map(t => (
                <tr key={t.id} onClick={() => onOpen(t)} style={{ cursor: "pointer", background: t._analysis.riskBg }}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7", fontWeight: 800, color: "#323338" }}>{t.name}<div style={{ fontSize: 10, color: "#98a1b3", fontWeight: 600 }}>{t._groupName}</div></td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{t.owner || "Unassigned"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{t.status}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{getEffortHours(t) || "—"}h<div style={{ fontSize: 10, color: "#98a1b3" }}>{t._capacityHoursPerDay}h/day</div></td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{formatDateOnly(t._analysis.suggestedStart) || "—"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{formatDateOnly(t._analysis.suggestedPmReview) || "—"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}>{formatDateOnly(t._analysis.finalDeadline) || "—"}</td>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid #eef1f7" }}><span style={{ background: t._analysis.riskColor, color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{t._analysis.risk}</span><div style={{ marginTop: 3, color: "#676879", fontSize: 10 }}>{t._analysis.reason}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Dark Mode ───────────────────────────────────────────────────────────────

const DarkCtx = React.createContext<{ dark: boolean; toggle: () => void }>({ dark: false, toggle: () => {} });

function useDark() { return React.useContext(DarkCtx); }

// Theming helper: d(dark value, light value)
function th(dark: boolean, darkVal: string, lightVal: string) { return dark ? darkVal : lightVal; }

// ─── Dashboard ────────────────────────────────────────────────────────────────


function getBoardTaskRecords(boards){return asArray(boards).flatMap(board=>asArray(board?.groups).flatMap(group=>asArray(group?.items).map(item=>({board,group,item}))));}
function isOpenPlanningTask(item){return !["Done","Submitted","Approved"].includes(item?.status);}
function patchTaskOnBoard(board,groupId,itemId,patch){
  return {
    ...board,
    groups: asArray(board.groups).map(group => group.id !== groupId ? group : {
      ...group,
      items: asArray(group.items).map(item => {
        if (item.id !== itemId) return item;
        const next = { ...item, ...patch };
        if (patch?.status && patch.status !== item.status) {
          next.approvalHistory = [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, patch?.actorName || "PM Action")];
        }
        return next;
      })
    })
  };
}
function taskDailyHours(item){const r=getTaskRange(item);const effort=getEffortHours(item);if(!r)return effort||0;const days=Math.max(1,diffDays(r.start,r.end)+1);return effort>0?effort/days:1;}
function planningConflicts(boards){const daily=new Map();for(const {board,item} of getBoardTaskRecords(boards)){if(!isOpenPlanningTask(item))continue;const owner=normalizeOwner(item.owner);if(!owner||owner==="No owner")continue;const r=getTaskRange(item);if(!r)continue;const h=taskDailyHours(item);for(let d=new Date(r.start);d<=r.end;d=addDays(d,1)){const date=d.toISOString().slice(0,10);const cap=getOwnerCapacityForDate(board,owner,date,8);const key=`${board.id}|${owner}|${date}`;const cur=daily.get(key)||{board,owner,date,cap,hours:0,tasks:[]};cur.hours+=h;cur.tasks.push(item.name);daily.set(key,cur);}}return Array.from(daily.values()).filter(x=>x.hours>x.cap).sort((a,b)=>(b.hours-b.cap)-(a.hours-a.cap)).slice(0,10);}
function ownerLoadScore(board,owner){const cap=getOwnerCapacity(board,owner,8);const items=asArray(board.groups).flatMap(g=>asArray(g.items)).filter(i=>isOpenPlanningTask(i)&&normalizeOwner(i.owner)===normalizeOwner(owner));return items.reduce((s,i)=>s+getEffortHours(i),0)/Math.max(cap,1);}
function autoOwner(board){const owners=getBoardOwners(board).filter(o=>o&&o!=="No owner");return owners.map(owner=>({owner,score:ownerLoadScore(board,owner)})).sort((a,b)=>a.score-b.score)[0]||null;}
function boardHealth(board){const items=asArray(board.groups).flatMap(g=>asArray(g.items));const total=items.length;const done=items.filter(i=>["Done","Submitted","Approved"].includes(i.status)).length;const overdue=items.filter(i=>isOpenPlanningTask(i)&&isOverdue(i.due)).length;const unassigned=items.filter(i=>isOpenPlanningTask(i)&&normalizeOwner(i.owner)==="No owner").length;const risk=items.filter(i=>["At Risk","Invalid","Tight Review"].includes(getPlanningAnalysis(i,getOwnerCapacity(board,i.owner,8)).risk)).length;const score=Math.max(0,Math.min(100,Math.round(100-overdue*12-risk*8-unassigned*5+(total?done/total:1)*20)));return{score,total,done,overdue,unassigned,risk,level:score>=80?"Good":score>=60?"Medium":"Risky"};}


function AvailabilityPanel({ boards, onPatchBoard }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const boardList = asArray(boards);
  const [boardId, setBoardId] = useState(boardList[0]?.id);
  const board = boardList.find(b => String(b.id) === String(boardId)) || boardList[0];
  const owners = useMemo(() => getBoardOwners(board), [board]);
  const [owner, setOwner] = useState("");
  const todayKey = new Date(new Date().toDateString()).toISOString().slice(0, 10);
  const [start, setStart] = useState(todayKey);
  const [end, setEnd] = useState(todayKey);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (board && !boardList.some(b => String(b.id) === String(boardId))) setBoardId(board.id);
  }, [board, boardId, boardList]);

  useEffect(() => {
    if (!owner && owners.length > 0) setOwner(owners[0]);
    if (owner && owners.length > 0 && !owners.includes(owner)) setOwner(owners[0]);
  }, [owners, owner]);

  if (!board) return null;

  const selectedOwner = owner || owners[0] || "";
  const upcomingByOwner = owners.map(o => {
    const dates = getOwnerUnavailableDates(board, o).filter(dateKey => {
      const d = parseDateOnly(dateKey);
      return d && d >= new Date(new Date().toDateString());
    });
    return { owner: o, dates };
  });

  function markUnavailable() {
    if (!selectedOwner || !start) return;
    onPatchBoard?.(board.id, current => setOwnerAvailabilityRangeOnBoard(current, selectedOwner, start, end || start, true, reason));
  }

  function clearUnavailable() {
    if (!selectedOwner || !start) return;
    onPatchBoard?.(board.id, current => setOwnerAvailabilityRangeOnBoard(current, selectedOwner, start, end || start, false, ""));
  }

  return (
    <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🏝️ Team Availability Calendar</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Mark leave / unavailable days. Workload capacity becomes 0 on those dates.</div>
        </div>
        <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "7px 9px", background: card, color: text, fontSize: 12 }}>
          {boardList.map(b => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 14 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Person
          <select value={selectedOwner} onChange={e => setOwner(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }}>
            {owners.length === 0 ? <option value="">No owner</option> : owners.map(o => <option key={o}>{o}</option>)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Start
          <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>End
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: sub, fontWeight: 800 }}>Reason
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Leave, client visit, training…" style={{ border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 }} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={markUnavailable} disabled={!selectedOwner} style={{ border: "none", borderRadius: 8, background: "#e2445c", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: selectedOwner ? "pointer" : "not-allowed", opacity: selectedOwner ? 1 : .55 }}>Mark unavailable</button>
        <button onClick={clearUnavailable} disabled={!selectedOwner} style={{ border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: selectedOwner ? "pointer" : "not-allowed", opacity: selectedOwner ? 1 : .55 }}>Clear range</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 14 }}>
        {upcomingByOwner.length === 0 ? (
          <div style={{ color: sub, fontSize: 12 }}>Assign owners first, then availability settings will appear here.</div>
        ) : upcomingByOwner.map(row => (
          <div key={row.owner} style={{ border: `1px solid ${bdr}`, borderRadius: 10, padding: "10px 12px", background: dark ? "#111827" : "#fafbff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.owner}</div>
              <span style={{ background: row.dates.length ? "#676879" : "#00c875", color: "#fff", borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 900 }}>{row.dates.length} off</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
              {row.dates.slice(0, 6).map(dateKey => <span key={dateKey} title={getOwnerUnavailableReason(board, row.owner, dateKey)} style={{ border: `1px solid ${bdr}`, borderRadius: 999, padding: "2px 7px", fontSize: 10, color: sub }}>{dateKey}</span>)}
              {row.dates.length === 0 && <span style={{ fontSize: 11, color: sub }}>No upcoming unavailable days.</span>}
              {row.dates.length > 6 && <span style={{ fontSize: 10, color: sub }}>+{row.dates.length - 6} more</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function DashboardReviewPanel({ boards }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const records = getBoardTaskRecords(boards);
  const mentionComments = records.flatMap(({ board, group, item }) =>
    asArray(item.comments).filter(c => asArray(c.mentions).length > 0).map(c => ({ board, group, item, comment: c }))
  ).slice(-12).reverse();
  const approvals = records.flatMap(({ board, group, item }) =>
    asArray(item.approvalHistory).map(h => ({ board, group, item, history: h }))
  ).slice(-12).reverse();

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 18, marginBottom: 18 }}>
      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: text }}>💬 Mentions</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Comments that include @name or @email.</div>
        {mentionComments.length === 0 ? <p style={{ fontSize: 12, color: sub }}>No mentions yet.</p> : mentionComments.map(r => (
          <div key={`${r.board.id}-${r.item.id}-${r.comment.id}`} style={{ marginTop: 9, padding: 10, border: `1px solid ${bdr}`, borderRadius: 9, background: dark ? "#111827" : "#fafbff" }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: text }}>{r.item.name}</div>
            <div style={{ fontSize: 11, color: sub }}>{r.board.name} • {r.group.name} • {r.comment.author}</div>
            <div style={{ fontSize: 12, color: text, marginTop: 5, lineHeight: 1.45 }}>{renderMentionText(r.comment.text)}</div>
          </div>
        ))}
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: text }}>✅ Approval History</div>
        <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Recent submitted / approved / revision actions.</div>
        {approvals.length === 0 ? <p style={{ fontSize: 12, color: sub }}>No approval history yet.</p> : approvals.map(r => (
          <div key={`${r.board.id}-${r.item.id}-${r.history.id}`} style={{ marginTop: 9, padding: 10, border: `1px solid ${bdr}`, borderRadius: 9, background: dark ? "#111827" : "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.item.name}</div>
                <div style={{ fontSize: 11, color: sub }}>{r.history.by || "Unknown"} • {r.history.at || "—"}</div>
              </div>
              <span style={{ flexShrink: 0, background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 900 }}>{r.history.toStatus}</span>
            </div>
            <div style={{ marginTop: 5, fontSize: 11, color: sub }}>{r.history.fromStatus} → {r.history.toStatus}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


function PlanningSuitePanel({boards,onPatchBoard}:any){const{dark}=useDark();const card=dark?"#16213e":"#fff";const text=dark?"#e0e0f0":"#323338";const sub=dark?"#8888aa":"#676879";const bdr=dark?"#2a2a4a":"#eef1f7";const records=useMemo(()=>getBoardTaskRecords(boards),[boards]);const conflicts=useMemo(()=>planningConflicts(boards),[boards]);const health=useMemo(()=>asArray(boards).map(board=>({board,...boardHealth(board)})),[boards]);const unassigned=records.filter(({item})=>isOpenPlanningTask(item)&&normalizeOwner(item.owner)==="No owner").slice(0,8);const risky=records.filter(({item})=>isOpenPlanningTask(item)).map(r=>({...r,a:getPlanningAnalysis(r.item,getOwnerCapacity(r.board,r.item.owner,6))})).filter(r=>["At Risk","Invalid","Tight Review","Tight","Missing deadline"].includes(r.a.risk)).slice(0,8);const pm=records.filter(({item})=>isOpenPlanningTask(item)&&(["Ready for PM Review","PM Reviewing","Need Revision"].includes(item.status)||isPmReviewDueSoon(item))).slice(0,8);const upd=(r,patch)=>onPatchBoard?.(r.board.id,board=>patchTaskOnBoard(board,r.group.id,r.item.id,patch));return <div style={{display:"grid",gap:18,marginBottom:18}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:14}}>{health.map(h=><div key={h.board.id} style={{background:card,borderRadius:12,padding:"14px 16px",border:`1px solid ${bdr}`,borderLeft:`5px solid ${h.score>=80?"#00c875":h.score>=60?"#fdab3d":"#e2445c"}`}}><div style={{fontSize:11,color:sub,fontWeight:800}}>PROJECT HEALTH</div><div style={{fontSize:26,fontWeight:900,color:text}}>{h.score}% <span style={{fontSize:12}}>{h.level}</span></div><div style={{fontSize:11,color:sub}}>{h.board.name}</div><div style={{fontSize:11,color:sub,marginTop:6}}>Done {h.done}/{h.total} • Risk {h.risk} • Overdue {h.overdue} • No owner {h.unassigned}</div></div>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:18}}><div style={{background:card,borderRadius:12,padding:16,border:`1px solid ${bdr}`}}><b style={{color:text}}>⚠️ Workload Conflict Warning</b><div style={{fontSize:12,color:sub,marginTop:4}}>Daily workload above capacity.</div>{conflicts.length===0?<p style={{fontSize:12,color:sub}}>No overload detected.</p>:conflicts.map(c=><div key={`${c.board.id}-${c.owner}-${c.date}`} style={{marginTop:8,padding:9,borderRadius:9,border:`1px solid ${bdr}`,background:dark?"#211a14":"#fff8e6"}}><b style={{fontSize:12,color:text}}>{c.owner}</b><span style={{float:"right",fontSize:11,color:"#d4900a",fontWeight:900}}>{Math.round(c.hours*10)/10}h / {c.cap}h</span><div style={{fontSize:11,color:sub}}>{c.board.name} • {c.date}</div><div style={{fontSize:10,color:sub}}>{c.tasks.slice(0,3).join(" • ")}</div></div>)}</div><div style={{background:card,borderRadius:12,padding:16,border:`1px solid ${bdr}`}}><b style={{color:text}}>🤖 Auto Assign Owner</b><div style={{fontSize:12,color:sub,marginTop:4}}>Suggest least-loaded person.</div>{unassigned.length===0?<p style={{fontSize:12,color:sub}}>No unassigned tasks.</p>:unassigned.map(r=>{const rec=autoOwner(r.board);return <div key={`${r.board.id}-${r.item.id}`} style={{marginTop:8,padding:9,borderRadius:9,border:`1px solid ${bdr}`}}><div style={{fontSize:12,fontWeight:800,color:text}}>{r.item.name}</div><div style={{fontSize:11,color:sub}}>Recommend: <b>{rec?.owner||"Add team member first"}</b></div>{rec&&<button onClick={()=>upd(r,{owner:rec.owner})} style={{marginTop:7,border:"none",borderRadius:7,background:"#0073ea",color:"#fff",padding:"5px 9px",fontSize:11,fontWeight:800,cursor:"pointer"}}>Assign</button>}</div>})}</div><div style={{background:card,borderRadius:12,padding:16,border:`1px solid ${bdr}`}}><b style={{color:text}}>🧠 Smart Schedule Suggestion</b><div style={{fontSize:12,color:sub,marginTop:4}}>Risky schedule suggestions.</div>{risky.length===0?<p style={{fontSize:12,color:sub}}>No risky schedules.</p>:risky.map(r=><div key={`${r.board.id}-${r.item.id}`} style={{marginTop:8,padding:9,borderRadius:9,border:`1px solid ${bdr}`,borderLeft:`4px solid ${r.a.riskColor}`}}><b style={{fontSize:12,color:text}}>{r.item.name}</b><span style={{float:"right",fontSize:10,color:r.a.riskColor,fontWeight:900}}>{r.a.risk}</span><div style={{fontSize:11,color:sub}}>Start: {formatDateOnly(r.a.suggestedStart)||"—"} • PM: {formatDateOnly(r.a.suggestedPmReview)||"—"} • Final: {formatDateOnly(r.a.finalDeadline)||"—"}</div><div style={{fontSize:10,color:sub}}>{r.a.reason}</div></div>)}</div><div style={{background:card,borderRadius:12,padding:16,border:`1px solid ${bdr}`}}><b style={{color:text}}>✅ PM Approval Flow</b><div style={{fontSize:12,color:sub,marginTop:4}}>Quick PM actions.</div>{pm.length===0?<p style={{fontSize:12,color:sub}}>No PM queue.</p>:pm.map(r=><div key={`${r.board.id}-${r.item.id}`} style={{marginTop:8,padding:9,borderRadius:9,border:`1px solid ${bdr}`}}><div style={{fontSize:12,fontWeight:800,color:text}}>{r.item.name}</div><div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}><button onClick={()=>upd(r,{status:"Ready for PM Review",pmReviewDate:new Date().toISOString().slice(0,10)})}>Submit</button><button onClick={()=>upd(r,{status:"Approved"})}>Approve</button><button onClick={()=>upd(r,{status:"Need Revision"})}>Revision</button><button onClick={()=>upd(r,{status:"Stuck"})}>Reject</button></div></div>)}</div></div></div>}


function GanttWhatIfPanel({boards}:any){
  const {dark}=useDark();
  const card=dark?"#16213e":"#fff", text=dark?"#e0e0f0":"#323338", sub=dark?"#8888aa":"#676879", bdr=dark?"#2a2a4a":"#eef1f7";
  const [boardId,setBoardId]=useState(asArray(boards)[0]?.id);
  const [deadlineShift,setDeadlineShift]=useState(0);
  const [capacityScale,setCapacityScale]=useState(100);
  const board=asArray(boards).find(b=>b.id===boardId)||asArray(boards)[0];
  useEffect(()=>{if(board&&!asArray(boards).some(b=>b.id===boardId))setBoardId(board.id)},[boards,boardId]);
  if(!board)return null;
  const records=asArray(board.groups).flatMap(g=>asArray(g.items).map(i=>({group:g,item:i,range:getTaskRange(i)}))).filter(r=>r.range).slice(0,18);
  const start=records.length?new Date(Math.min(...records.map(r=>r.range.start.getTime()))):new Date();
  const end=records.length?new Date(Math.max(...records.map(r=>r.range.end.getTime()))):addDays(start,30);
  const total=Math.max(1,diffDays(start,end)+1);
  const open=asArray(board.groups).flatMap(g=>asArray(g.items)).filter(i=>!["Done","Submitted","Approved"].includes(i.status));
  const sim=open.map(i=>{const d=parseDateOnly(i.due);const due=d?formatDateOnly(addDays(d,Number(deadlineShift)||0)):i.due;const cap=Math.max(1,getOwnerCapacity(board,i.owner,6)*(Number(capacityScale)||100)/100);return getPlanningAnalysis({...i,due},cap)});
  const risk=sim.filter(a=>["At Risk","Invalid","Tight Review","Tight","Missing deadline"].includes(a.risk)).length;
  const delay=Math.max(0,...sim.map((a:any)=>a.slackDays!=null?Math.max(0,-a.slackDays):0));
  const level=risk>3||delay>3?"High Risk":risk>0?"Medium Risk":"Good";
  return <div style={{display:"grid",gridTemplateColumns:"minmax(360px,1.5fr) minmax(260px,.8fr)",gap:18,marginBottom:18}}>
    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:14,fontWeight:900,color:text}}>🗓️ Gantt / Timeline</div><div style={{fontSize:12,color:sub,marginTop:3}}>Read-only view from task start and due dates.</div></div><select value={board.id} onChange={e=>setBoardId(Number(e.target.value))} style={{border:`1px solid ${bdr}`,borderRadius:8,padding:"6px 9px",fontSize:12,background:card,color:text}}>{asArray(boards).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div style={{marginTop:14,display:"grid",gap:9}}>{records.length===0?<div style={{fontSize:12,color:sub}}>Add Start Date and Due Date first.</div>:records.map(r=>{const left=Math.max(0,diffDays(start,r.range.start))/total*100;const width=Math.max(3,(diffDays(r.range.start,r.range.end)+1)/total*100);const color=STATUS_OPTIONS.find(x=>x.label===r.item.status)?.color||r.group.color||"#579bfc";return <div key={`${r.group.id}-${r.item.id}`} style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:10,alignItems:"center"}}><div style={{minWidth:0}}><div style={{fontSize:12,fontWeight:800,color:text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.item.name}</div><div style={{fontSize:10,color:sub}}>{r.item.owner||"No owner"}</div></div><div style={{height:20,background:dark?"#101828":"#f0f2f8",borderRadius:999,position:"relative"}}><div style={{position:"absolute",left:`${left}%`,width:`${Math.min(width,100-left)}%`,top:3,height:14,borderRadius:999,background:color}} /></div></div>})}</div>
    </div>
    <div style={{background:card,border:`1px solid ${bdr}`,borderRadius:12,padding:16,boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
      <div style={{fontSize:14,fontWeight:900,color:text}}>🧪 What-if Simulator</div><div style={{fontSize:12,color:sub,marginTop:3}}>Try deadline and capacity without saving.</div>
      <label style={{display:"block",marginTop:12,fontSize:11,color:sub}}>Deadline shift days</label><input type="number" value={deadlineShift} onChange={e=>setDeadlineShift(Number(e.target.value)||0)} style={{width:"100%",padding:8,border:`1px solid ${bdr}`,borderRadius:8,background:card,color:text}} />
      <label style={{display:"block",marginTop:10,fontSize:11,color:sub}}>Capacity scale %</label><input type="number" value={capacityScale} onChange={e=>setCapacityScale(Number(e.target.value)||100)} style={{width:"100%",padding:8,border:`1px solid ${bdr}`,borderRadius:8,background:card,color:text}} />
      <div style={{marginTop:14,padding:12,borderRadius:10,background:level==="Good"?"#eafff3":level==="Medium Risk"?"#fff8e6":"#fdeef1"}}><div style={{fontSize:18,fontWeight:900,color:level==="Good"?"#00875a":level==="Medium Risk"?"#d4900a":"#e2445c"}}>{level}</div><div style={{fontSize:12,color:"#676879",marginTop:6}}>Risk tasks: {risk} • Est. delay: {delay} day(s)</div><div style={{fontSize:12,color:"#323338",marginTop:6,fontWeight:800}}>{level==="Good"?"Plan looks acceptable.":"Increase capacity or move deadline."}</div></div>
    </div>
  </div>;
}

// SVG Donut chart
function DonutChart({ slices, size = 120 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: "50%", background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#aaa" }}>No data</div>;
  const r = 40; const cx = 50; const cy = 50; const stroke = 18;
  let angle = -90;
  const paths = slices.map(s => {
    const pct = s.value / total;
    const sweep = pct * 360;
    const startRad = (angle * Math.PI) / 180;
    const endRad = ((angle + sweep) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad); const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);   const y2 = cy + r * Math.sin(endRad);
    const large = sweep > 180 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    angle += sweep;
    return { ...s, d, pct };
  });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="butt">
          <title>{p.label}: {p.value} ({Math.round(p.pct * 100)}%)</title>
        </path>
      ))}
      <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="bold" fill="#323338">{total}</text>
    </svg>
  );
}


function PMSuitePanel({ boards, onPatchBoard, onSetBoards }: any) {
  const { dark } = useDark();
  const card = dark ? "#16213e" : "#fff";
  const bg = dark ? "#101827" : "#fafbff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub = dark ? "#8888aa" : "#676879";
  const bdr = dark ? "#2a2a4a" : "#eef1f7";
  const allBoards = asArray(boards);
  const activeBoards = allBoards.filter((b: any) => !b.archivedAt);
  const archivedBoards = allBoards.filter((b: any) => b.archivedAt);
  const [boardId, setBoardId] = useState(activeBoards[0]?.id || allBoards[0]?.id || "");
  const board = allBoards.find((b: any) => String(b.id) === String(boardId)) || activeBoards[0] || allBoards[0];
  const [newBoardName, setNewBoardName] = useState(board?.name || "");
  const [newBoardColor, setNewBoardColor] = useState(board?.color || "#0073ea");
  const [requestTitle, setRequestTitle] = useState("");
  const [requestOwner, setRequestOwner] = useState("");
  const [requestDue, setRequestDue] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [attachTaskId, setAttachTaskId] = useState("");
  const [attachName, setAttachName] = useState("");
  const [attachUrl, setAttachUrl] = useState("");
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    if (board) {
      setNewBoardName(board.name || "");
      setNewBoardColor(board.color || "#0073ea");
    }
  }, [board?.id]);

  function updateBoards(updater) {
    if (!onSetBoards) {
      window.alert("Board-level update is not available in this view.");
      return;
    }
    onSetBoards((prev: any[]) => updater(asArray(prev)));
  }

  function cloneTask(item) {
    return {
      ...item,
      id: uid(),
      comments: asArray(item.comments).map(c => ({ ...c, id: uid() })),
      subtasks: asArray(item.subtasks).map(st => ({ ...st, id: uid() })),
      approvalHistory: asArray(item.approvalHistory).map(h => ({ ...h, id: uid() })),
    };
  }

  function cloneBoard(source, nameSuffix = " Copy") {
    const now = new Date().toISOString();
    return {
      ...source,
      id: uid(),
      name: `${source.name}${nameSuffix}`,
      archivedAt: "",
      createdFrom: source.name,
      createdAt: now,
      groups: asArray(source.groups).map(g => ({
        ...g,
        id: uid(),
        items: asArray(g.items).map(cloneTask),
      })),
      activityLogs: [],
    };
  }

  function saveBoardSettings() {
    if (!board) return;
    updateBoards(bs => bs.map(b => b.id === board.id ? { ...b, name: newBoardName.trim() || b.name, color: newBoardColor || b.color } : b));
  }

  function duplicateBoard() {
    if (!board) return;
    const copy = cloneBoard(board);
    updateBoards(bs => [...bs, copy]);
    window.alert(`Duplicated board: ${copy.name}`);
  }

  function archiveBoard() {
    if (!board) return;
    if (activeBoards.length <= 1 && !board.archivedAt) {
      window.alert("You need at least one active board. Create or restore another board before archiving this one.");
      return;
    }
    if (!window.confirm(`Archive board "${board.name}"? You can restore it later from this PM Suite tab.`)) return;
    updateBoards(bs => bs.map(b => b.id === board.id ? { ...b, archivedAt: new Date().toISOString() } : b));
  }

  function restoreBoard(restoreId) {
    updateBoards(bs => bs.map(b => b.id === restoreId ? { ...b, archivedAt: "" } : b));
  }

  function exportBoardJson() {
    if (!board) return;
    downloadText(`holifriday-board-${safeFileName(board.name)}.json`, JSON.stringify(board, null, 2), "application/json");
  }

  const templateDefs = [
    { name: "HEC-RAS Flood Study", color: "#579bfc", groups: ["Data Collection", "Hydrology", "HEC-RAS Model", "Maps & Report", "PM Review"] },
    { name: "Hydrology Report", color: "#0073ea", groups: ["Rainfall Data", "Frequency Analysis", "Model Setup", "Results", "Report Review"] },
    { name: "Software Sprint", color: "#00c875", groups: ["Backlog", "In Progress", "Review", "Done"] },
    { name: "Shopee Product Launch", color: "#fdab3d", groups: ["Product Setup", "Images", "Listing", "Pricing", "Launch"] },
    { name: "Engineering Report Review", color: "#a25ddc", groups: ["Draft", "Internal Check", "PM Review", "Revision", "Final"] },
  ];

  function createFromTemplate(tpl) {
    const color = tpl.color || GROUP_COLORS[allBoards.length % GROUP_COLORS.length];
    const newBoard = {
      id: uid(),
      name: tpl.name,
      color,
      resourceCapacity: {},
      groups: tpl.groups.map((g, i) => ({
        id: uid(),
        name: g,
        color: GROUP_COLORS[i % GROUP_COLORS.length],
        members: [],
        memberRoles: {},
        invites: [],
        items: [],
      })),
      activityLogs: [createActivityLog({ actorName: "Template", actorEmail: "", boardId: "", action: "board_created", newValue: tpl.name })],
    };
    updateBoards(bs => [...bs, newBoard]);
    window.alert(`Created template board: ${tpl.name}`);
  }

  const taskRecords = getBoardTaskRecords(allBoards.filter((b: any) => !b.archivedAt));
  const selectedBoardTasks = board ? asArray(board.groups).flatMap(g => asArray(g.items).map(item => ({ board, group: g, item }))) : [];

  const notifications = useMemo(() => {
    const today = new Date(new Date().toDateString());
    const out: any[] = [];
    for (const { board, group, item } of taskRecords) {
      const dueDate = parseDateOnly(item.due);
      if (isOpenPlanningTask(item) && isOverdue(item.due)) out.push({ type: "Overdue", icon: "⚠️", color: "#e2445c", board: board.name, task: item.name, text: `${item.name} is overdue.` });
      if (isOpenPlanningTask(item) && dueDate && diffDays(today, dueDate) === 0) out.push({ type: "Due Today", icon: "📍", color: "#fdab3d", board: board.name, task: item.name, text: `${item.name} is due today.` });
      if (["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(item.status)) out.push({ type: "Review", icon: "✅", color: "#579bfc", board: board.name, task: item.name, text: `${item.name}: ${item.status}` });
      for (const c of asArray(item.comments)) {
        if (asArray(c.mentions).length > 0) out.push({ type: "Mention", icon: "💬", color: "#a25ddc", board: board.name, task: item.name, text: `${item.name}: ${c.text}` });
      }
      const range = getTaskRange(item);
      const owner = normalizeOwner(item.owner);
      if (range && owner !== "No owner") {
        for (let d = new Date(range.start); d <= range.end; d = addDays(d, 1)) {
          const dateKey = d.toISOString().slice(0, 10);
          if (isOwnerUnavailable(board, owner, dateKey)) {
            out.push({ type: "OFF Conflict", icon: "🏝️", color: "#676879", board: board.name, task: item.name, text: `${owner} is OFF on ${dateKey}, but ${item.name} is scheduled.` });
            break;
          }
        }
      }
    }
    return out.slice(0, 40);
  }, [boards]);

  function runAutomationRules() {
    updateBoards(bs => bs.map(b => ({
      ...b,
      groups: asArray(b.groups).map(g => ({
        ...g,
        items: asArray(g.items).map(item => {
          let next = { ...item };
          const tags = new Set(asArray(next.tags));
          const today = new Date(new Date().toDateString());
          const pm = parseDateOnly(next.pmReviewDate);
          if (isOpenPlanningTask(next) && isOverdue(next.due)) tags.add("Overdue");
          if (isOpenPlanningTask(next) && pm && diffDays(today, pm) <= 0 && !["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(next.status)) next.status = "Ready for PM Review";
          if (next.status === "Approved") tags.add("Approved");
          next.tags = Array.from(tags);
          return next;
        })
      }))
    })));
    window.alert("Automation rules applied: overdue tags, PM review status, approved tags.");
  }

  function submitRequest() {
    if (!board || !requestTitle.trim()) return;
    const firstGroup = asArray(board.groups)[0];
    if (!firstGroup) return;
    const newTask = {
      id: uid(),
      name: requestTitle.trim(),
      owner: normalizeOwner(requestOwner),
      status: "Not Started",
      priority: "Medium",
      start: "",
      due: requestDue,
      pmReviewDate: "",
      effortHours: 4,
      reviewBufferDays: 1,
      revisionBufferDays: 1,
      tags: ["Request"],
      comments: requestNote.trim()
        ? [{ id: uid(), author: "Request Form", text: requestNote.trim(), mentions: extractMentions(requestNote), time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }]
        : [],
      subtasks: [],
      approvalHistory: [],
    };
    onPatchBoard?.(board.id, current => ({ ...current, groups: asArray(current.groups).map((g, idx) => idx === 0 ? { ...g, items: [newTask, ...asArray(g.items)] } : g) }));
    setRequestTitle(""); setRequestOwner(""); setRequestDue(""); setRequestNote("");
    window.alert("Request added as a new task.");
  }

  function addAttachmentLink() {
    if (!board || !attachTaskId || !attachUrl.trim()) return;
    const label = attachName.trim() || attachUrl.trim();
    const comment = { id: uid(), author: "Attachment", text: `📎 Attachment: ${label} ${attachUrl.trim()}`, mentions: [], time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    onPatchBoard?.(board.id, current => ({
      ...current,
      groups: asArray(current.groups).map(g => ({
        ...g,
        items: asArray(g.items).map(item => String(item.id) === String(attachTaskId) ? { ...item, comments: [...asArray(item.comments), comment] } : item),
      }))
    }));
    setAttachName(""); setAttachUrl("");
    window.alert("Attachment link added as a task comment.");
  }

  function generateReport() {
    const boardsForReport = activeBoards;
    const rows = getBoardTaskRecords(boardsForReport);
    const total = rows.length;
    const done = rows.filter(r => ["Done", "Submitted", "Approved"].includes(r.item.status)).length;
    const overdue = rows.filter(r => isOpenPlanningTask(r.item) && isOverdue(r.item.due));
    const review = rows.filter(r => ["Ready for PM Review", "PM Reviewing", "Need Revision"].includes(r.item.status));
    const byOwner = new Map<string, number>();
    for (const r of rows) byOwner.set(normalizeOwner(r.item.owner), (byOwner.get(normalizeOwner(r.item.owner)) || 0) + 1);
    const ownerLines = Array.from(byOwner.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([owner, count]) => `- ${owner}: ${count} task(s)`).join("\n");
    const textReport = `HOLIFRIDAY Project Report\nGenerated: ${new Date().toLocaleString()}\n\nSummary\n- Active boards: ${boardsForReport.length}\n- Total tasks: ${total}\n- Completed: ${done}\n- Completion: ${total ? Math.round(done / total * 100) : 0}%\n- Overdue: ${overdue.length}\n- PM/Review queue: ${review.length}\n\nTop owners\n${ownerLines || "- No owners"}\n\nOverdue tasks\n${overdue.slice(0, 15).map(r => `- [${r.board.name}] ${r.item.name} • ${r.item.owner || "No owner"} • due ${r.item.due || "—"}`).join("\n") || "- None"}\n\nReview queue\n${review.slice(0, 15).map(r => `- [${r.board.name}] ${r.item.name} • ${r.item.status}`).join("\n") || "- None"}`;
    setReportText(textReport);
  }

  function exportExcelCsv() {
    const rows = [["Board","Group","Task","Owner","Status","Priority","Start","Due","PM Review","Effort Hours","Tags"]];
    for (const { board, group, item } of taskRecords) rows.push([board.name, group.name, item.name, item.owner, item.status, item.priority, item.start, item.due, item.pmReviewDate, String(getEffortHours(item)), asArray(item.tags).join("; ")]);
    downloadText("holifriday-tasks-export.csv", rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
  }

  function exportCalendarIcs() {
    const events: string[] = [];
    for (const { board, item } of taskRecords) {
      if (item.due) events.push(icsEvent(`${item.name} due`, item.due, `${board.name} / ${item.status}`));
      if (item.pmReviewDate) events.push(icsEvent(`${item.name} PM Review`, item.pmReviewDate, `${board.name} / PM review`));
    }
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HOLIFRIDAY//PM Suite//EN", ...events, "END:VCALENDAR"].join("\r\n");
    downloadText("holifriday-calendar.ics", ics, "text/calendar;charset=utf-8");
  }

  if (!board) return <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, color: sub }}>No board available.</div>;

  const inputStyle = { border: `1px solid ${bdr}`, borderRadius: 8, padding: "8px 9px", background: card, color: text, fontSize: 12 } as any;
  const primaryBtn = { border: "none", borderRadius: 8, background: "#0073ea", color: "#fff", padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;
  const secondaryBtn = { border: `1px solid ${bdr}`, borderRadius: 8, background: card, color: text, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer" } as any;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>⚙️ Board Settings + Archive</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Rename, color, duplicate, archive/restore, export board.</div>
          <select value={String(board.id)} onChange={e => setBoardId(e.target.value)} style={{ ...inputStyle, width: "100%", marginTop: 12 }}>{allBoards.map((b: any) => <option key={b.id} value={String(b.id)}>{b.archivedAt ? "[Archived] " : ""}{b.name}</option>)}</select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 70px", gap: 8, marginTop: 10 }}>
            <input value={newBoardName} onChange={e => setNewBoardName(e.target.value)} style={inputStyle} />
            <input type="color" value={newBoardColor} onChange={e => setNewBoardColor(e.target.value)} style={{ ...inputStyle, height: 36, padding: 3 }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            <button onClick={saveBoardSettings} style={primaryBtn}>Save</button>
            <button onClick={duplicateBoard} style={secondaryBtn}>Duplicate</button>
            <button onClick={exportBoardJson} style={secondaryBtn}>Export Board</button>
            {board.archivedAt ? <button onClick={() => restoreBoard(board.id)} style={primaryBtn}>Restore</button> : <button onClick={archiveBoard} style={{ ...secondaryBtn, color: "#e2445c" }}>Archive</button>}
          </div>
          {archivedBoards.length > 0 && <div style={{ marginTop: 12, borderTop: `1px solid ${bdr}`, paddingTop: 10 }}><div style={{ fontSize: 11, fontWeight: 900, color: sub, marginBottom: 6 }}>Archived Boards</div>{archivedBoards.map((b: any) => <button key={b.id} onClick={() => restoreBoard(b.id)} style={{ ...secondaryBtn, marginRight: 6, marginBottom: 6 }}>Restore {b.name}</button>)}</div>}
        </div>

        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: text }}>🔔 Notification Center</div>
          <div style={{ fontSize: 12, color: sub, marginTop: 3 }}>{notifications.length} item(s) need attention.</div>
          <div style={{ marginTop: 12, maxHeight: 260, overflow: "auto", display: "grid", gap: 8 }}>
            {notifications.length === 0 ? <div style={{ fontSize: 12, color: sub }}>No urgent notifications.</div> : notifications.map((n, i) => <div key={i} style={{ border: `1px solid ${bdr}`, borderLeft: `4px solid ${n.color}`, borderRadius: 9, padding: "8px 10px", background: bg }}><div style={{ fontSize: 12, fontWeight: 900, color: text }}>{n.icon} {n.type} <span style={{ color: sub }}>• {n.board}</span></div><div style={{ fontSize: 11, color: sub, marginTop: 3 }}>{n.text}</div></div>)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📋 Duplicate / Template Library</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Create a new board from a repeatable workflow.</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{templateDefs.map(t => <button key={t.name} onClick={() => createFromTemplate(t)} style={{ ...secondaryBtn, textAlign: "left" }}>+ {t.name}</button>)}</div></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>⚡ Automation Rules</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>MVP rules: overdue tag, PM review status, approved tag.</div><button onClick={runAutomationRules} style={{ ...primaryBtn, marginTop: 12 }}>Run Rules Now</button></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📤 Google Calendar / Excel Export</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Export CSV for Excel and ICS for Google Calendar import.</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><button onClick={exportExcelCsv} style={primaryBtn}>Export CSV</button><button onClick={exportCalendarIcs} style={secondaryBtn}>Export ICS</button></div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📝 Task Request Form</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}><input value={requestTitle} onChange={e => setRequestTitle(e.target.value)} placeholder="Request title" style={inputStyle} /><input value={requestOwner} onChange={e => setRequestOwner(e.target.value)} placeholder="Owner / email" style={inputStyle} /><input type="date" value={requestDue} onChange={e => setRequestDue(e.target.value)} style={inputStyle} /><textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="Request detail" style={{ ...inputStyle, minHeight: 74 }} /><button onClick={submitRequest} style={primaryBtn}>Create Request Task</button></div></div>
        <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📎 File Attachment Link</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>MVP: store Drive/PDF/file URL as a task comment.</div><div style={{ display: "grid", gap: 8, marginTop: 12 }}><select value={attachTaskId} onChange={e => setAttachTaskId(e.target.value)} style={inputStyle}><option value="">Select task</option>{selectedBoardTasks.map(r => <option key={r.item.id} value={String(r.item.id)}>{r.item.name}</option>)}</select><input value={attachName} onChange={e => setAttachName(e.target.value)} placeholder="File label" style={inputStyle} /><input value={attachUrl} onChange={e => setAttachUrl(e.target.value)} placeholder="https://..." style={inputStyle} /><button onClick={addAttachmentLink} style={primaryBtn}>Add Attachment Link</button></div></div>
      </div>

      <div style={{ background: card, border: `1px solid ${bdr}`, borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><div style={{ fontSize: 15, fontWeight: 900, color: text }}>📊 Project Report Generator</div><div style={{ fontSize: 12, color: sub, marginTop: 3 }}>Generate a PM-ready text report.</div></div><div style={{ display: "flex", gap: 8 }}><button onClick={generateReport} style={primaryBtn}>Generate Report</button>{reportText && <button onClick={() => downloadText("holifriday-project-report.txt", reportText, "text/plain;charset=utf-8")} style={secondaryBtn}>Download TXT</button>}</div></div>
        {reportText && <textarea readOnly value={reportText} style={{ ...inputStyle, width: "100%", minHeight: 260, marginTop: 12, fontFamily: "monospace", whiteSpace: "pre" }} />}
      </div>
    </div>
  );
}

function safeFileName(value) { return asText(value, "board").replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "board"; }
function csvCell(value) { const s = String(value ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function icsDate(dateKey) { return asText(dateKey).replace(/-/g, ""); }
function icsEscape(value) { return String(value ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function icsEvent(summary, dateKey, description = "") { const uidText = `${Date.now()}-${Math.random().toString(36).slice(2)}@holifriday`; return ["BEGIN:VEVENT", `UID:${uidText}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`, `DTSTART;VALUE=DATE:${icsDate(dateKey)}`, `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(description)}`, "END:VEVENT"].join("\r\n"); }
function downloadText(filename, content, mime = "text/plain;charset=utf-8") { const blob = new Blob([content], { type: mime }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }

function Dashboard({ boards, onPatchBoard, onSetBoards }: any) {
  const { dark } = useDark();
  const bg   = dark ? "#1a1a2e" : "#f7f8fc";
  const card = dark ? "#16213e" : "#fff";
  const text = dark ? "#e0e0f0" : "#323338";
  const sub  = dark ? "#8888aa" : "#676879";
  const bdr  = dark ? "#2a2a4a" : "#f0f0f0";
  const [dashTab, setDashTab] = useState("overview");

  const allItems = boards.flatMap((b: any) => b.groups.flatMap((g: any) => g.items));
  const byStatus   = STATUS_OPTIONS.map(s => ({ ...s, count: allItems.filter((i: any) => i.status === s.label).length }));
  const byPriority = PRIORITY_OPTIONS.map(p => ({ ...p, count: allItems.filter((i: any) => i.priority === p.label).length }));
  const overdueItems = allItems.filter((i: any) => isOverdue(i.due) && i.status !== "Done");
  const soonItems    = allItems.filter((i: any) => isDueSoon(i.due) && i.status !== "Done" && !isOverdue(i.due));
  const maxStatus = Math.max(...byStatus.map(s => s.count), 1);
  const maxPriority = Math.max(...byPriority.map(p => p.count), 1);

  // Per-board progress
  const boardStats = boards.map((b: any) => {
    const items = b.groups.flatMap((g: any) => g.items);
    const done = items.filter((i: any) => i.status === "Done").length;
    return { name: b.name, color: b.color, total: items.length, done };
  });

  // Completion % over boards (stacked bar)
  const completionPct = allItems.length > 0 ? Math.round((allItems.filter((i: any) => i.status === "Done").length / allItems.length) * 100) : 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: bg }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: text }}>📊 Dashboard</h2>
        <div style={{ display: "flex", gap: 6, background: card, border: `1px solid ${bdr}`, borderRadius: 999, padding: 4 }}>
          {[
            ["overview", "Overview"],
            ["planning", "Planning"],
            ["availability", "Availability"],
            ["pmSuite", "PM Suite"],
            ["reviews", "Comments & Approval"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setDashTab(key)} style={{ border: "none", borderRadius: 999, padding: "6px 12px", background: dashTab === key ? "#0073ea" : "transparent", color: dashTab === key ? "#fff" : sub, fontSize: 12, fontWeight: 900, cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      {dashTab === "planning" && <><PlanningSuitePanel boards={boards} onPatchBoard={onPatchBoard} /><GanttWhatIfPanel boards={boards} /></>}
      {dashTab === "availability" && <AvailabilityPanel boards={boards} onPatchBoard={onPatchBoard} />}
      {dashTab === "pmSuite" && <PMSuitePanel boards={boards} onPatchBoard={onPatchBoard} onSetBoards={onSetBoards} />}
      {dashTab === "reviews" && <DashboardReviewPanel boards={boards} />}

      {dashTab === "overview" && <>
      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(148px,1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total Tasks",  value: allItems.length,  color: "#0073ea", icon: "📋" },
          { label: "Done",         value: allItems.filter((i: any) => i.status === "Done").length, color: "#00c875", icon: "✅" },
          { label: "In Progress",  value: allItems.filter((i: any) => i.status === "Working on it").length, color: "#fdab3d", icon: "🔄" },
          { label: "Stuck",        value: allItems.filter((i: any) => i.status === "Stuck").length, color: "#e2445c", icon: "🚨" },
          { label: "Overdue",      value: overdueItems.length, color: "#e2445c", icon: "⚠️" },
          { label: "Due Soon",     value: soonItems.length, color: "#fdab3d", icon: "⏰" },
        ].map(c => (
          <div key={c.label} style={{ background: card, borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.07)", borderTop: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 22 }}>{c.icon}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: c.color, margin: "4px 0 2px" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: sub, fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Overall progress bar */}
      <div style={{ background: card, borderRadius: 12, padding: "18px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: text }}>Overall Completion</span>
          <span style={{ fontWeight: 800, fontSize: 20, color: "#00c875" }}>{completionPct}%</span>
        </div>
        <div style={{ height: 12, background: bdr, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ width: `${completionPct}%`, height: "100%", background: "linear-gradient(90deg,#00c875,#00a35a)", borderRadius: 6, transition: "width .6s" }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
        {/* Status donut + bars */}
        <div style={{ background: card, borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: text, marginBottom: 16 }}>Status Breakdown</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <DonutChart slices={byStatus.map(s => ({ value: s.count, color: s.color, label: s.label }))} size={100} />
            <div style={{ flex: 1 }}>
              {byStatus.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: sub, flex: 1 }}>{s.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
          {byStatus.map(s => (
            <div key={s.label} style={{ marginBottom: 8 }}>
              <div style={{ height: 6, background: bdr, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(s.count / maxStatus) * 100}%`, height: "100%", background: s.color, borderRadius: 3, transition: "width .5s" }} />
              </div>
            </div>
          ))}
        </div>

        {/* Priority donut + bars */}
        <div style={{ background: card, borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: text, marginBottom: 16 }}>Priority Breakdown</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16 }}>
            <DonutChart slices={byPriority.map(p => ({ value: p.count, color: p.color, label: p.label }))} size={100} />
            <div style={{ flex: 1 }}>
              {byPriority.map(p => (
                <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: sub, flex: 1 }}>{p.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{p.count}</span>
                </div>
              ))}
            </div>
          </div>
          {byPriority.map(p => (
            <div key={p.label} style={{ marginBottom: 8 }}>
              <div style={{ height: 6, background: bdr, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(p.count / maxPriority) * 100}%`, height: "100%", background: p.color, borderRadius: 3, transition: "width .5s" }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-board progress */}
      {boardStats.length > 0 && (
        <div style={{ background: card, borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: text, marginBottom: 14 }}>Progress by Board</div>
          {boardStats.map((b: any) => {
            const pct = b.total > 0 ? Math.round((b.done / b.total) * 100) : 0;
            return (
              <div key={b.name} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: text }}>{b.name}</span>
                  </div>
                  <span style={{ fontSize: 12, color: sub }}>{b.done}/{b.total} · <strong style={{ color: b.color }}>{pct}%</strong></span>
                </div>
                <div style={{ height: 8, background: bdr, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: b.color, borderRadius: 4, transition: "width .5s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ⚠️ Due date alerts */}
      {(overdueItems.length > 0 || soonItems.length > 0) && (
        <div style={{ background: card, borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: text, marginBottom: 14 }}>⚠️ Needs Attention</div>
          {[...overdueItems.map((i: any) => ({ ...i, _type: "overdue" })), ...soonItems.map((i: any) => ({ ...i, _type: "soon" }))]
            .sort((a: any, b: any) => (a.due || "").localeCompare(b.due || ""))
            .map((i: any) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${bdr}` }}>
                <Avatar name={i.owner || "?"} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                  <div style={{ fontSize: 11, color: sub, marginTop: 1 }}>{i.owner}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: i._type === "overdue" ? "#e2445c" : "#d4900a", background: i._type === "overdue" ? "#fde8ec" : "#fff8ec", borderRadius: 20, padding: "2px 8px" }}>
                    {i._type === "overdue" ? "⚠ Overdue" : "⏰ Due Soon"}
                  </span>
                  <span style={{ fontSize: 10, color: sub }}>📅 {i.due}</span>
                </div>
              </div>
            ))}
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Public Signup ───────────────────────────────────────────────────────────

function SignupPanel() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [signups, setSignups] = useState<any[]>([]);
  const [supabaseClient, setSupabaseClient] = useState<any | null>(null);
  const enabled = hasSupabaseConfig();
  const STORAGE_KEY = "holifriday_signups";

  useEffect(() => {
    let mounted = true;
    if (!enabled) return;
    getSupabase().then(client => {
      if (mounted) setSupabaseClient(client);
    }).catch(() => {
      if (mounted) setSupabaseClient(null);
    });
    return () => { mounted = false; };
  }, [enabled]);

  const loadSignups = useCallback(() => {
    if (supabaseClient) {
      // Load from Supabase if available
      (async () => {
        const { data, error } = await supabaseClient
          .from(SIGNUPS_TABLE)
          .select("id,name,email,created_at")
          .order("created_at", { ascending: false })
          .limit(8);

        if (!error && data) {
          setSignups(asArray(data));
        }
      })();
    } else {
      // Load from localStorage if Supabase not available
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          setSignups(asArray(JSON.parse(stored)));
        } else {
          setSignups([]);
        }
      } catch {
        setSignups([]);
      }
    }
  }, [supabaseClient]);

  useEffect(() => {
    loadSignups();
  }, [loadSignups]);

  async function submitSignup(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setNotice("Please enter both name and email.");
      return;
    }

    setLoading(true);
    setNotice("");

    if (supabaseClient) {
      // Save to Supabase
      const { error } = await supabaseClient.from(SIGNUPS_TABLE).insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
      });

      setLoading(false);

      if (error) {
        setNotice(error.message.includes("duplicate") ? "This email is already registered." : "Could not save. Please try again.");
        return;
      }
    } else {
      // Save to localStorage
      try {
        const newSignup = {
          id: Date.now(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          created_at: new Date().toISOString(),
        };
        const stored = localStorage.getItem(STORAGE_KEY);
        const current = stored ? asArray(JSON.parse(stored)) : [];
        const updated = [newSignup, ...current].slice(0, 8);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        setSignups(updated);
      } catch {
        setLoading(false);
        setNotice("Could not save. Please try again.");
        return;
      }
    }

    setLoading(false);
    setName("");
    setEmail("");
    setNotice("Successfully registered.");
    loadSignups();
  }

  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #e6e9ef", padding: "12px 20px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
        <div style={{ minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#323338" }}>Join HOLIFRIDAY</div>
          <div style={{ fontSize: 12, color: "#676879", marginTop: 2 }}>
            Share the deployed link so others can access and register.
          </div>
        </div>

        <form onSubmit={submitSignup} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            style={{ border: "1px solid #d8dbe4", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 150, outline: "none" }}
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            type="email"
            placeholder="email@example.com"
            style={{ border: "1px solid #d8dbe4", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 220, outline: "none" }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ background: loading ? "#c4c4c4" : "#0073ea", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "Saving..." : "Sign up"}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: notice.includes("Successfully") ? "#00a35a" : "#676879" }}>
        {notice || (enabled ? `Latest signups: ${signups.length} (stored in Supabase)` : `Latest signups: ${signups.length} (stored temporarily in localStorage)`)}
      </div>

      {signups.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {signups.map(u => (
            <div key={u.id} style={{ border: "1px solid #e6e9ef", borderRadius: 999, padding: "4px 10px", fontSize: 11, color: "#323338", background: "#f8f9fc" }}>
              {u.name} · {u.email}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function ItemRow({ item, groupColor, onUpdate, onDelete, onCelebrate, onOpen, ownerOptions = OWNER_POOL, currentUserEmail, canEditTask, canEditStatus }: any) {
  const [hovered, setHovered] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const safeOwnerOptions = ownerOptions.length > 0 ? ownerOptions : ["No owner"];
  const [assigneeIndex, setAssigneeIndex] = useState(0);
  const ownerRef = useRef<HTMLTableCellElement | null>(null);
  const statusRef = useRef<HTMLTableCellElement | null>(null);
  useClickOutside(ownerRef, () => setOwnerOpen(false));

  useEffect(() => {
    const idx = safeOwnerOptions.indexOf(item.owner);
    setAssigneeIndex(idx >= 0 ? idx : 0);
  }, [item.owner, safeOwnerOptions]);

  const overdue = isOverdue(item.due) && item.status !== "Done";
  const soon    = isDueSoon(item.due) && item.status !== "Done" && !overdue;
  const canChangeStatus = canEditTask || canEditStatus || normalizeEmail(item.owner) === normalizeEmail(currentUserEmail);

  function upd(patch) {
    if (patch.status === "Done" && item.status !== "Done") {
      const rect = statusRef.current?.getBoundingClientRect();
      onCelebrate(item.name, rect ? rect.left + rect.width / 2 : undefined);
    }
    const nextPatch = patch?.status && patch.status !== item.status
      ? { ...patch, approvalHistory: [...asArray(item.approvalHistory), createApprovalHistoryEntry(item.status, patch.status, "You")] }
      : patch;
    onUpdate({ ...item, ...nextPatch });
  }

  return (
    <tr
      draggable
      onDragStart={e => { e.dataTransfer.setData("taskId", String(item.id)); e.currentTarget.style.opacity = "0.4"; }}
      onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
      onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = "#e8f0ff"; }}
      onDragLeave={e => { e.currentTarget.style.background = hovered ? "#f0f4ff" : "#fff"; }}
      onDrop={e => { e.preventDefault(); e.currentTarget.style.background = hovered ? "#f0f4ff" : "#fff"; const draggedId = e.dataTransfer.getData("taskId"); if (draggedId && String(item.id) !== draggedId) { (window as any).__holiDrop?.(draggedId, item.id); } }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? "#f0f4ff" : "#fff", transition: "background .12s", cursor: "grab" }}>
      <td style={{ width: 4, padding: 0 }}><div style={{ width: 4, minHeight: 38, background: groupColor }} /></td>
      <td style={{ width: 32, textAlign: "center", padding: "0 4px" }}><input type="checkbox" style={{ accentColor: "#0073ea" }} /></td>
      <td style={{ padding: "6px 8px", minWidth: 200 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {canEditTask
            ? <InlineEdit value={item.name} onChange={v => upd({ name: v })} style={{ fontSize: 13, color: "#323338" }} />
            : <span style={{ fontSize: 13, color: "#323338" }}>{item.name}</span>}
          {item.comments.length > 0 && <span style={{ fontSize: 10, color: "#aaa" }}>💬{item.comments.length}</span>}
          {item.subtasks.length > 0 && <span style={{ fontSize: 10, color: "#aaa" }}>✅{item.subtasks.filter(s => s.done).length}/{item.subtasks.length}</span>}
        </div>
        {item.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>{item.tags.map(t => <TagPill key={t} label={t} />)}</div>}
      </td>
      <td style={{ padding: "4px 8px", width: 110 }} ref={ownerRef}>
        <div style={{ position: "relative" }}>
          <div onClick={() => canEditTask && setOwnerOpen(v => !v)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: canEditTask ? "pointer" : "default" }}>
            <Avatar name={item.owner || "No owner"} /><span style={{ fontSize: 12, color: "#676879" }}>{item.owner || "No owner"}</span>
          </div>
          {canEditTask && ownerOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, background: "#fff", borderRadius: 8, boxShadow: "0 6px 24px rgba(0,0,0,.18)", border: "1px solid #e6e9ef", minWidth: 220, padding: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#98a1b3", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Assignee Slide</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar name={safeOwnerOptions[assigneeIndex]} size={24} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{safeOwnerOptions[assigneeIndex]}</div>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(safeOwnerOptions.length - 1, 0)}
                step={1}
                value={assigneeIndex}
                onChange={e => setAssigneeIndex(Number(e.target.value))}
                style={{ width: "100%", marginTop: 10 }}
              />
              <button
                onClick={() => { upd({ owner: safeOwnerOptions[assigneeIndex] }); setOwnerOpen(false); }}
                style={{ marginTop: 8, width: "100%", border: "none", borderRadius: 6, background: "#0073ea", color: "#fff", fontSize: 11, fontWeight: 700, padding: "6px 8px", cursor: "pointer" }}
              >
                Assign selected
              </button>
            </div>
          )}
        </div>
      </td>
      <td ref={statusRef} style={{ padding: "4px 8px", width: 180 }}>
        {canChangeStatus ? (
          <DotSlider value={item.status} options={STATUS_OPTIONS} onChange={v => upd({ status: v })} width={168} />
        ) : (
          <div title="Only the assignee can change status" style={{ width: 168, padding: "4px 8px", borderRadius: 4, background: "#f2f4f8", color: "#98a1b3", fontWeight: 700, fontSize: 11, border: "1px solid #e6e9ef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {item.status}
          </div>
        )}
      </td>
      <td style={{ padding: "4px 8px", width: 150 }}>
        {canEditTask
          ? <DotSlider value={item.priority} options={PRIORITY_OPTIONS} onChange={v => upd({ priority: v })} width={138} />
          : <div style={{ width: 138, padding: "4px 8px", borderRadius: 4, background: "#f2f4f8", color: "#98a1b3", fontWeight: 700, fontSize: 11, border: "1px solid #e6e9ef" }}>{item.priority}</div>}
      </td>
      <td style={{ padding: "4px 8px", width: 128 }}>
        <input type="date" disabled={!canEditTask} value={item.due} onChange={e => upd({ due: e.target.value })}
          style={{ border: `1px solid ${overdue ? "#e2445c" : soon ? "#fdab3d" : "#e6e9ef"}`, background: !canEditTask ? "#f2f4f8" : overdue ? "#fde8ec" : soon ? "#fff8ec" : "#fff", borderRadius: 4, padding: "3px 6px", fontSize: 12, color: !canEditTask ? "#98a1b3" : overdue ? "#e2445c" : soon ? "#d4900a" : "#323338", outline: "none" }} />
      </td>
      <td style={{ padding: "0 4px", width: 56, textAlign: "center" }}>
        <button onClick={() => onOpen(item)} style={{ background: "none", border: "none", color: hovered ? "#0073ea" : "#ddd", cursor: "pointer", fontSize: 14, transition: "color .15s" }} title="Open detail">⬡</button>
        {canEditTask && <button onClick={onDelete} style={{ background: "none", border: "none", color: hovered ? "#e2445c" : "#ddd", cursor: "pointer", fontSize: 16, transition: "color .15s" }}>×</button>}
      </td>
    </tr>
  );
}

// ─── Group (Table) ────────────────────────────────────────────────────────────

function Group({ group, onUpdate, onDelete, onCelebrate, onOpenItem, currentUserName, currentUserEmail }: any) {
  const [collapsed, setCollapsed] = useState(false);
  const [inviteNotice, setInviteNotice] = useState("");
  const [latestInviteToken, setLatestInviteToken] = useState("");
  const updGroup = patch => onUpdate({ ...group, ...patch });
  const updItem  = item => updGroup({ items: group.items.map(i => i.id === item.id ? item : i) });
  const delItem  = id   => updGroup({ items: group.items.filter(i => i.id !== id) });
  const addItem  = ()   => updGroup({ items: [...group.items, { id: uid(), name: "New Task", owner: currentUserEmail || currentUserName || "No owner", status: "Not Started", priority: "Medium", start: "", due: "", pmReviewDate: "", effortHours: 4, reviewBufferDays: 1, revisionBufferDays: 1, tags: [], comments: [], subtasks: [] }] });

  // Register drag-drop reorder handler for this group
  useEffect(() => {
    const prev = (window as any).__holiDrop;
    (window as any).__holiDrop = (draggedId: string, targetId: string) => {
      const items = group.items;
      const fromIdx = items.findIndex(i => String(i.id) === draggedId);
      if (fromIdx === -1) { prev?.(draggedId, targetId); return; }
      const toIdx = items.findIndex(i => String(i.id) === targetId);
      if (toIdx === -1) { prev?.(draggedId, targetId); return; }
      const next = [...items];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      updGroup({ items: next });
    };
    return () => { (window as any).__holiDrop = prev; };
  });
  const done = group.items.filter(i => i.status === "Done").length;
  const normalizedUserEmail = normalizeEmail(currentUserEmail);
  const currentRole = normalizeRole(group.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor");
  const canManage = !normalizedUserEmail || currentRole === "editor";
  const canEditTask = canManage;
  const canEditStatus = true;
  const memberRoles = group.memberRoles || {};
  const pendingInvites = asArray(group.invites);
  const latestInvite = pendingInvites.find(inv => inv.token === latestInviteToken) || pendingInvites[pendingInvites.length - 1] || null;
  const latestInviteLink = latestInvite
    ? `${window.location.origin}${window.location.pathname}?invite=${latestInvite.token}`
    : "";

  const memberOptions = useMemo(() => {
    return uniqueStrings(["No owner", currentUserName, ...asArray(group.members), ...group.items.map(i => i.owner)]);
  }, [group.members, group.items, currentUserName]);

  function createInviteLink(role = "viewer") {
    if (!canManage) {
      setInviteNotice("User cannot create invite links.");
      return;
    }
    const token = createInviteToken();
    updGroup({
      invites: [
        ...(group.invites || []),
        { token, role: normalizeRole(role), createdAt: new Date().toISOString() },
      ],
    });
    setLatestInviteToken(token);
    setInviteNotice(`Link created for ${normalizeRole(role) === "editor" ? "PM" : "User"}.`);
  }

  async function copyLink(token) {
    const link = `${window.location.origin}${window.location.pathname}?invite=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setInviteNotice("Link copied!");
    } catch {
      setInviteNotice("Copy failed.");
    }
  }

  function updateMemberRole(email, role) {
    if (!canManage) return;
    updGroup({
      memberRoles: {
        ...(group.memberRoles || {}),
        [memberRoleKey(email)]: normalizeRole(role),
      },
    });
  }

  function removeMember(email) {
    if (!canManage) return;
    const nextRoles = { ...(group.memberRoles || {}) };
    delete nextRoles[memberRoleKey(email)];
    updGroup({
      members: asArray(group.members).filter(m => m !== email),
      memberRoles: nextRoles,
      items: group.items.map(i => (i.owner === email ? { ...i, owner: "No owner" } : i)),
    });
    setInviteNotice("Member removed.");
  }

  function removeInvite(token) {
    if (!canManage) return;
    updGroup({ invites: pendingInvites.filter(inv => inv.token !== token) });
    setInviteNotice("Invite removed.");
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <button onClick={() => setCollapsed(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", color: "#676879", fontSize: 12, padding: 2 }}>{collapsed ? "▶" : "▼"}</button>
        <div style={{ width: 12, height: 12, borderRadius: 3, background: group.color, flexShrink: 0 }} />
        {canManage
          ? <InlineEdit value={group.name} onChange={v => updGroup({ name: v })} style={{ fontWeight: 700, fontSize: 14, color: group.color }} />
          : <span style={{ fontWeight: 700, fontSize: 14, color: group.color }}>{group.name}</span>}
        <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>{group.items.length} items · {done} done</span>
        {group.items.length > 0 && (
          <div style={{ flex: 1, maxWidth: 80, height: 6, background: "#e6e9ef", borderRadius: 3, overflow: "hidden", marginLeft: 6 }}>
            <div style={{ width: `${(done / group.items.length) * 100}%`, height: "100%", background: "#00c875", transition: "width .3s" }} />
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button onClick={() => createInviteLink("editor")} disabled={!canManage} style={{ border: "1px solid #d0dbf7", background: canManage ? "#edf4ff" : "#f0f0f0", color: canManage ? "#1f5ecf" : "#98a1b3", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: canManage ? "pointer" : "not-allowed" }}>🔗 PM link</button>
          <button onClick={() => createInviteLink("viewer")} disabled={!canManage} style={{ border: "1px solid #d7e8da", background: canManage ? "#effaf2" : "#f0f0f0", color: canManage ? "#0f8f4a" : "#98a1b3", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: canManage ? "pointer" : "not-allowed" }}>🔗 User link</button>
        </div>
        {canManage && <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "#c4c4c4", fontSize: 15, padding: "0 4px" }}>🗑</button>}
      </div>
      {(asArray(group.members).length > 0 || inviteNotice) && (
        <div style={{ margin: "0 0 8px 30px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {asArray(group.members).map(email => {
            const role = normalizeRole(memberRoles[memberRoleKey(email)]);
            return (
              <div key={email} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #dbe8ff", background: "#f4f8ff", borderRadius: 999, padding: "2px 6px" }}>
                <span style={{ fontSize: 10, color: "#1f5ecf" }}>{email}</span>
                <select value={role} disabled={!canManage} onChange={e => updateMemberRole(email, e.target.value)} style={{ border: "1px solid #bcd0ff", borderRadius: 999, padding: "1px 6px", fontSize: 10, background: "#fff", color: "#1f5ecf" }}>
                  <option value="editor">Admin</option>
                  <option value="viewer">User</option>
                </select>
                {canManage && <button onClick={() => removeMember(email)} style={{ border: "none", background: "none", color: "#e2445c", fontSize: 12, cursor: "pointer", lineHeight: 1 }}>×</button>}
              </div>
            );
          })}
          {inviteNotice && <span style={{ fontSize: 10, color: /created|copied/i.test(inviteNotice) ? "#00a35a" : "#e2445c" }}>{inviteNotice}</span>}
        </div>
      )}
      {pendingInvites.length > 0 && (
        <div style={{ margin: "0 0 10px 30px", display: "flex", flexDirection: "column", gap: 6 }}>
          {pendingInvites.map(inv => {
            const link = `${window.location.origin}${window.location.pathname}?invite=${inv.token}`;
            return (
              <div key={inv.token} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 10, color: "#676879" }}>
                <input readOnly value={link} style={{ width: "min(400px, 100%)", border: "1px solid #e6e9ef", borderRadius: 6, padding: "2px 8px", fontSize: 10, color: "#676879", background: "#fff" }} />
                <span style={{ border: "1px solid #e6e9ef", borderRadius: 999, padding: "2px 8px", background: "#fff" }}>{normalizeRole(inv.role) === "editor" ? "Admin" : "User"}</span>
                <button onClick={() => copyLink(inv.token)} style={{ border: "1px solid #e6e9ef", borderRadius: 999, background: "#fff", color: "#323338", fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>Copy link</button>
                {canManage && <button onClick={() => removeInvite(inv.token)} style={{ border: "1px solid #f6d8df", borderRadius: 999, background: "#fdeef1", color: "#e2445c", fontSize: 10, padding: "2px 8px", cursor: "pointer" }}>Remove</button>}
              </div>
            );
          })}
        </div>
      )}
      {!collapsed && (
        <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e6e9ef", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ background: "#f6f7fb" }}>
                <th style={{ width: 4, padding: 0 }} /><th style={{ width: 32 }} />
                {["TASK","OWNER","STATUS","PRIORITY","DUE DATE",""].map(h => (
                  <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#676879", letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.items.map(item => (
                <ItemRow key={item.id} item={item} groupColor={group.color}
                  onUpdate={updItem} onDelete={() => delItem(item.id)}
                  onCelebrate={onCelebrate} onOpen={onOpenItem} ownerOptions={memberOptions} currentUserEmail={currentUserEmail} canEditTask={canEditTask} canEditStatus={canEditStatus} />
              ))}
            </tbody>
          </table>
          <button onClick={addItem} disabled={!canEditTask} style={{ width: "100%", padding: "9px 40px", textAlign: "left", background: canEditTask ? "#fff" : "#f7f8fb", border: "none", borderTop: "1px solid #f0f0f0", color: canEditTask ? "#676879" : "#a7adba", fontSize: 12, cursor: canEditTask ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 6 }}
            onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
            onMouseLeave={e => e.currentTarget.style.background = canEditTask ? "#fff" : "#f7f8fb"}
          ><span style={{ fontSize: 16, color: "#0073ea" }}>+</span> Add Task</button>
        </div>
      )}
    </div>
  );
}


function ActivityLogPanel({ logs, onClose }: any) {
  const sorted = asArray(logs)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 80);

  const actionText = (log) => {
    const action = asText(log.action).replace(/_/g, " ");
    const item = log.itemName ? `“${log.itemName}”` : "";
    const field = log.field ? ` (${log.field})` : "";
    if (log.oldValue || log.newValue) return `${action}${field} ${item}: ${log.oldValue || "—"} → ${log.newValue || "—"}`;
    return `${action}${field} ${item}`.trim();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2100, display: "flex" }}>
      <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,.35)" }} />
      <div style={{ width: 440, maxWidth: "92vw", background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,.16)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e6e9ef", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#323338" }}>Activity Log</div>
          <div style={{ marginLeft: "auto", fontSize: 11, color: "#98a1b3" }}>{sorted.length} recent</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#aaa" }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.length === 0 ? (
            <div style={{ padding: 28, textAlign: "center", color: "#98a1b3", fontSize: 13 }}>No activity yet.</div>
          ) : sorted.map(log => (
            <div key={log.id} style={{ border: "1px solid #eef1f7", borderRadius: 12, padding: "10px 12px", background: "#fafbff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <Avatar name={log.actorName || log.actorEmail || "User"} size={24} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{log.actorName || log.actorEmail || "Unknown user"}</div>
                  <div style={{ fontSize: 10, color: "#98a1b3" }}>{log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#676879", lineHeight: 1.45 }}>{actionText(log)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────

function BoardView({ board, onUpdate, onPatchBoard, onCelebrate, currentUserName, currentUserEmail, jumpItemId = null, onJumpHandled = null }: any) {
  const [view, setView] = useState("table"); // table | kanban | calendar | workload
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterOwner, setFilterOwner] = useState("All");
  const [ownerSlideIndex, setOwnerSlideIndex] = useState(0);
  const [panelItem, setPanelItem] = useState(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const normalizedUserEmail = normalizeEmail(currentUserEmail);
  const totalTasksCount = board.groups.reduce((sum, g) => sum + g.items.length, 0);
  const canEditBoard = !normalizedUserEmail || board.groups.some(g => normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor") === "editor");
  const canCreateGroup = canEditBoard || board.groups.length === 0 || totalTasksCount === 0;

  const searchRef = useRef<HTMLInputElement | null>(null);

  // Auto-open task panel when jumping from global search
  useEffect(() => {
    if (!jumpItemId) return;
    const item = board.groups.flatMap(g => g.items).find(i => i.id === jumpItemId);
    if (item) { setPanelItem(item); onJumpHandled?.(); }
  }, [jumpItemId, board]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") { setPanelItem(null); return; }
      if (isTyping) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "n" || e.key === "N") {
        // Add task to the first editable group
        const g = board.groups.find(g => {
          const role = normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor");
          return !normalizedUserEmail || role === "editor";
        });
        if (g) {
          updGroup({ ...g, items: [...g.items, { id: uid(), name: "New Task", owner: currentUserEmail || currentUserName || "No owner", status: "Not Started", priority: "Medium", start: "", due: "", pmReviewDate: "", effortHours: 4, reviewBufferDays: 1, revisionBufferDays: 1, tags: [], comments: [], subtasks: [] }] });
          setView("table");
        }
        return;
      }
      if (e.key === "g" || e.key === "G") { if (canCreateGroup) addGroup(); return; }
      if (e.key === "t" || e.key === "T") { setView("table"); return; }
      if (e.key === "k" || e.key === "K") { setView("kanban"); return; }
      if (e.key === "c" || e.key === "C") { setView("calendar"); return; }
      if (e.key === "w" || e.key === "W") { setView("workload"); return; }
      if (e.key === "m" || e.key === "M") { setView("mywork"); return; }
      if (e.key === "x" || e.key === "X") { setView("critical"); return; }
      if (e.key === "p" || e.key === "P") { setView("planning"); return; }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [board, canCreateGroup, normalizedUserEmail, currentUserEmail, currentUserName]);
  // ── End keyboard shortcuts ──────────────────────────────────────────────────

  const patchBoard = updater => {
    const withActivity = prev => {
      const next = updater(prev);
      const logs = makeBoardChangeLogs(prev, next, actorLabel(currentUserName, currentUserEmail), currentUserEmail);
      if (logs.length === 0) return next;
      return {
        ...next,
        activityLogs: trimActivityLogs([...(asArray(next.activityLogs).length ? asArray(next.activityLogs) : asArray(prev.activityLogs)), ...logs]),
      };
    };
    if (onPatchBoard) {
      onPatchBoard(board.id, withActivity);
      return;
    }
    onUpdate(withActivity(board));
  };

  const mergeFilteredGroupUpdate = (visibleGroup, updatedVisibleGroup) => {
    patchBoard(prev => ({
      ...prev,
      groups: prev.groups.map(currentGroup => {
        if (currentGroup.id !== updatedVisibleGroup.id) return currentGroup;

        const visibleIdsBeforeUpdate = new Set(asArray(visibleGroup.items).map(item => item.id));
        const updatedVisibleItemsById = new Map(asArray(updatedVisibleGroup.items).map(item => [item.id, item]));
        const currentItemIds = new Set(asArray(currentGroup.items).map(item => item.id));

        const keptExistingItems = asArray(currentGroup.items)
          .filter(item => !visibleIdsBeforeUpdate.has(item.id) || updatedVisibleItemsById.has(item.id))
          .map(item => updatedVisibleItemsById.get(item.id) || item);

        const addedItems = asArray(updatedVisibleGroup.items).filter(item => !currentItemIds.has(item.id));

        return {
          ...currentGroup,
          ...updatedVisibleGroup,
          items: [...keptExistingItems, ...addedItems],
        };
      }),
    }));
  };

  const mergeFilteredBoardUpdate = (visibleBeforeUpdate, updatedVisibleBoard) => {
    patchBoard(prev => ({
      ...prev,
      ...updatedVisibleBoard,
      groups: prev.groups.map(currentGroup => {
        const visibleGroup = asArray(visibleBeforeUpdate.groups).find(g => g.id === currentGroup.id);
        const updatedVisibleGroup = asArray(updatedVisibleBoard.groups).find(g => g.id === currentGroup.id);
        if (!visibleGroup || !updatedVisibleGroup) return currentGroup;

        const visibleIdsBeforeUpdate = new Set(asArray(visibleGroup.items).map(item => item.id));
        const updatedVisibleItemsById = new Map(asArray(updatedVisibleGroup.items).map(item => [item.id, item]));

        return {
          ...currentGroup,
          ...updatedVisibleGroup,
          items: asArray(currentGroup.items)
            .filter(item => !visibleIdsBeforeUpdate.has(item.id) || updatedVisibleItemsById.has(item.id))
            .map(item => updatedVisibleItemsById.get(item.id) || item),
        };
      }),
    }));
  };

  const updBoard = patch => patchBoard(prev => ({ ...prev, ...patch }));
  const updGroup = g => patchBoard(prev => ({ ...prev, groups: prev.groups.map(x => x.id === g.id ? g : x) }));
  const delGroup = id => patchBoard(prev => ({ ...prev, groups: prev.groups.filter(g => g.id !== id) }));
  const addGroup = ()  => {
    if (!canCreateGroup) return;
    patchBoard(prev => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          id: uid(),
          name: "New Group",
          color: GROUP_COLORS[prev.groups.length % GROUP_COLORS.length],
          members: [],
          memberRoles: {},
          invites: [],
          items: [],
        },
      ],
    }));
  };

  const ownerOptions = useMemo(() => {
    const names = board.groups
      .flatMap(g => g.items.map(i => i.owner))
      .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
    return ["All", ...Array.from(new Set<string>(names))].sort((a, b) => a.localeCompare(b));
  }, [board]);
  const ownerSlideOptions = ownerOptions.filter(name => name !== "All");

  useEffect(() => {
    if (ownerSlideOptions.length === 0) {
      setOwnerSlideIndex(0);
      return;
    }
    if (filterOwner === "All") {
      setOwnerSlideIndex(0);
      return;
    }
    const idx = ownerSlideOptions.indexOf(filterOwner);
    if (idx >= 0) setOwnerSlideIndex(idx);
  }, [filterOwner, ownerSlideOptions]);

  const filteredBoard = useMemo(() => ({
    ...board,
    groups: board.groups.map(g => ({
      ...g,
      items: g.items.filter(i =>
        (search === "" || i.name.toLowerCase().includes(search.toLowerCase()) || i.owner.toLowerCase().includes(search.toLowerCase())) &&
        (filterStatus === "All" || i.status === filterStatus) &&
        (filterPriority === "All" || i.priority === filterPriority) &&
        (filterOwner === "All" || i.owner === filterOwner)
      ),
    })),
  }), [board, search, filterStatus, filterPriority, filterOwner]);

  const allItems = board.groups.flatMap(g => g.items);
  const done = allItems.filter(i => i.status === "Done").length;
  const stuck = allItems.filter(i => i.status === "Stuck").length;

  function handleOpenItem(item) {
    setPanelItem(item);
  }
  function handlePanelUpdate(updated) {
    if (!panelItem) return;
    const g = board.groups.find(g => g.items.some(i => i.id === updated.id));
    if (!g) return;
    const role = normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor");
    const canEditTask = !normalizedUserEmail || role === "editor";
    const canEditStatus = canEditTask;
    const canComment = canEditTask;
    if (!canEditStatus) return;
    if (!canEditTask) {
      const old = g.items.find(i => i.id === updated.id);
      if (!old) return;
      const blockedChange =
        old.name !== updated.name ||
        old.priority !== updated.priority ||
        old.owner !== updated.owner ||
        old.due !== updated.due ||
        old.start !== updated.start ||
        old.pmReviewDate !== updated.pmReviewDate ||
        old.effortHours !== updated.effortHours ||
        old.reviewBufferDays !== updated.reviewBufferDays ||
        old.revisionBufferDays !== updated.revisionBufferDays ||
        JSON.stringify(old.tags) !== JSON.stringify(updated.tags) ||
        JSON.stringify(old.subtasks) !== JSON.stringify(updated.subtasks);
      const commentChanged = JSON.stringify(old.comments) !== JSON.stringify(updated.comments);
      if (blockedChange || (!canComment && commentChanged)) {
        return;
      }
    }
    if (g) updGroup({ ...g, items: g.items.map(i => i.id === updated.id ? updated : i) });
    setPanelItem(updated);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {activityOpen && <ActivityLogPanel logs={board.activityLogs} onClose={() => setActivityOpen(false)} />}
      {panelItem && (
        <TaskPanel
          item={panelItem}
          onUpdate={handlePanelUpdate}
          onClose={() => setPanelItem(null)}
          currentUserName={currentUserName}
          canEditTask={!normalizedUserEmail || (() => {
            const g = board.groups.find(gr => gr.items.some(i => i.id === panelItem.id));
            return !g || normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor") === "editor";
          })()}
          canEditStatus={!normalizedUserEmail || (() => {
            const g = board.groups.find(gr => gr.items.some(i => i.id === panelItem.id));
            return !g || normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor") === "editor";
          })()}
          canComment={!normalizedUserEmail || (() => {
            const g = board.groups.find(gr => gr.items.some(i => i.id === panelItem.id));
            return !g || normalizeRole(g.memberRoles?.[memberRoleKey(normalizedUserEmail)] || "editor") === "editor";
          })()}
        />
      )}

      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e6e9ef", padding: "12px 28px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ width: 14, height: 14, borderRadius: 4, background: board.color, flexShrink: 0 }} />
        {canEditBoard
          ? <InlineEdit value={board.name} onChange={v => updBoard({ name: v })} style={{ fontSize: 18, fontWeight: 700, color: "#323338" }} />
          : <span style={{ fontSize: 18, fontWeight: 700, color: "#323338" }}>{board.name}</span>}
        <div style={{ display: "flex", gap: 6, marginLeft: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ background: "#e6f9f1", color: "#00c875", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{done} done</span>
          {stuck > 0 && <span style={{ background: "#fde8ec", color: "#e2445c", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{stuck} stuck</span>}
          <span style={{ background: "#f0f4ff", color: "#676879", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px" }}>{allItems.length} total</span>
        </div>
        {/* View toggle */}
        <div style={{ display: "flex", gap: 4, marginLeft: "auto", background: "#f6f7fb", borderRadius: 8, padding: 3 }}>
          {[["table","☰ Table"],["kanban","⬡ Kanban"],["calendar","🗓 Calendar"],["mywork","👤 My Work"],["workload","👥 Workload"],["critical","🧭 Critical"],["planning","🧠 Planning"]].map(([v,label]) => (
            <button key={v} onClick={() => setView(v)} style={{ background: view === v ? "#fff" : "none", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: view === v ? "#0073ea" : "#676879", cursor: "pointer", boxShadow: view === v ? "0 1px 4px rgba(0,0,0,.1)" : "none" }}>{label}</button>
          ))}
        </div>
        <button onClick={() => setActivityOpen(true)} style={{ background: "#fff", color: "#323338", border: "1px solid #d8dbe4", borderRadius: 20, padding: "7px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Activity</button>
        <button onClick={addGroup} disabled={!canCreateGroup} style={{ background: canCreateGroup ? "#0073ea" : "#c4cad6", color: "#fff", border: "none", borderRadius: 20, padding: "7px 18px", fontWeight: 700, fontSize: 13, cursor: canCreateGroup ? "pointer" : "not-allowed" }}
          onMouseEnter={e => e.currentTarget.style.background = "#0060c0"}
          onMouseLeave={e => e.currentTarget.style.background = canCreateGroup ? "#0073ea" : "#c4cad6"}
        >+ New Group</button>
      </div>

      {/* Keyboard shortcut hint */}
      <div style={{ background: "#f7f8fc", borderBottom: "1px solid #f0f0f0", padding: "4px 28px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {[["N","New Task"],["G","New Group"],["T","Table"],["K","Kanban"],["C","Calendar"],["W","Workload"],["M","My Work"],["X","Critical"],["P","Planning"],["/","Search"],["Esc","Close"]].map(([key, label]) => (
          <span key={key} style={{ fontSize: 11, color: "#98a1b3", display: "flex", alignItems: "center", gap: 4 }}>
            <kbd style={{ background: "#fff", border: "1px solid #dde1ec", borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "monospace", color: "#323338", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>{key}</kbd>
            {label}
          </span>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ background: "#fafbfc", borderBottom: "1px solid #f0f0f0", padding: "8px 28px", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13 }}>🔍</span>
        <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks or owners… (press /)" style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 10px", fontSize: 13, outline: "none", width: 230 }} />
        <span style={{ fontSize: 12, color: "#676879", marginLeft: 8 }}>Status:</span>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff" }}>
          <option>All</option>
          {STATUS_OPTIONS.map(s => <option key={s.label}>{s.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#676879" }}>Priority:</span>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff" }}>
          <option>All</option>
          {PRIORITY_OPTIONS.map(p => <option key={p.label}>{p.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "#676879" }}>Assignee:</span>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={{ border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 8px", fontSize: 12, outline: "none", background: "#fff" }}>
          {ownerOptions.map(name => <option key={name}>{name}</option>)}
        </select>
        {ownerSlideOptions.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 220 }}>
            <input
              type="range"
              min={0}
              max={Math.max(ownerSlideOptions.length - 1, 0)}
              step={1}
              value={ownerSlideIndex}
              onChange={e => {
                const idx = Number(e.target.value);
                setOwnerSlideIndex(idx);
                setFilterOwner(ownerSlideOptions[idx]);
              }}
              style={{ width: 120 }}
            />
            <button onClick={() => setFilterOwner(ownerSlideOptions[ownerSlideIndex])} style={{ border: "1px solid #dbe8ff", background: "#eef4ff", color: "#1f5ecf", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
              {ownerSlideOptions[ownerSlideIndex]}
            </button>
          </div>
        )}
        {currentUserName && (
          <button onClick={() => setFilterOwner(currentUserEmail || currentUserName)} style={{ background: "#eef4ff", border: "1px solid #dbe8ff", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#1f5ecf", cursor: "pointer", fontWeight: 700 }}>My Tasks</button>
        )}
        {(search || filterStatus !== "All" || filterPriority !== "All" || filterOwner !== "All") && (
          <button onClick={() => { setSearch(""); setFilterStatus("All"); setFilterPriority("All"); setFilterOwner("All"); }} style={{ background: "none", border: "1px solid #e6e9ef", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#676879", cursor: "pointer" }}>Clear</button>
        )}
      </div>

      {/* Content */}
      {view === "kanban" ? (
        <KanbanView board={filteredBoard} onUpdate={updatedVisibleBoard => mergeFilteredBoardUpdate(filteredBoard, updatedVisibleBoard)} onCelebrate={onCelebrate} currentUserName={currentUserName} currentUserEmail={currentUserEmail} />
      ) : view === "calendar" ? (
        <CalendarTimelineView board={filteredBoard} onOpen={handleOpenItem} />
      ) : view === "mywork" ? (
        <MyWorkView board={board} currentUserEmail={currentUserEmail} currentUserName={currentUserName} onOpen={handleOpenItem} />
      ) : view === "workload" ? (
        <TeamScheduleView board={filteredBoard} onOpen={handleOpenItem} />
      ) : view === "critical" ? (
        <CriticalPathView board={board} onOpen={handleOpenItem} />
      ) : view === "planning" ? (
        <PMPlanningView board={filteredBoard} onOpen={handleOpenItem} />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {board.groups.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 80, color: "#c4c4c4" }}>
              <div style={{ fontSize: 48 }}>📋</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 12 }}>No groups yet</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Click "+ New Group" to get started.</div>
              <button
                onClick={addGroup}
                disabled={!canCreateGroup}
                style={{ marginTop: 14, border: "none", borderRadius: 8, background: canCreateGroup ? "#0073ea" : "#c4cad6", color: "#fff", fontSize: 12, fontWeight: 700, padding: "8px 14px", cursor: canCreateGroup ? "pointer" : "not-allowed" }}
              >
                Create first group
              </button>
            </div>
          ) : (
            filteredBoard.groups.map(g => (
              <Group key={g.id} group={g} onUpdate={updatedVisibleGroup => mergeFilteredGroupUpdate(g, updatedVisibleGroup)} onDelete={() => delGroup(g.id)} onCelebrate={onCelebrate} onOpenItem={handleOpenItem} currentUserName={currentUserName} currentUserEmail={currentUserEmail} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Global Search ────────────────────────────────────────────────────────────

function GlobalSearch({ boards, onNavigate, onClose }: { boards: any[]; onNavigate: (boardId: any, itemId: any) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: { boardId: any; boardName: string; boardColor: string; groupName: string; groupColor: string; item: any }[] = [];
    for (const board of boards) {
      for (const group of board.groups) {
        for (const item of group.items) {
          const matchName = item.name.toLowerCase().includes(q);
          const matchOwner = item.owner?.toLowerCase().includes(q);
          const matchTag = item.tags?.some((t: string) => t.toLowerCase().includes(q));
          const matchStatus = item.status?.toLowerCase().includes(q);
          if (matchName || matchOwner || matchTag || matchStatus) {
            out.push({ boardId: board.id, boardName: board.name, boardColor: board.color, groupName: group.name, groupColor: group.color, item });
          }
        }
      }
    }
    return out.slice(0, 30);
  }, [query, boards]);

  useEffect(() => { setSelected(0); }, [results.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && results[selected]) {
        onNavigate(results[selected].boardId, results[selected].item.id);
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [results, selected, onNavigate, onClose]);

  const highlight = (text: string, q: string) => {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return <>{text.slice(0, idx)}<mark style={{ background: "#fff3b0", borderRadius: 2, padding: "0 1px" }}>{text.slice(idx, idx + q.length)}</mark>{text.slice(idx + q.length)}</>;
  };

  const statusColor = (s: string) => STATUS_OPTIONS.find(o => o.label === s)?.color || "#aaa";
  const priorityColor = (p: string) => PRIORITY_OPTIONS.find(o => o.label === p)?.color || "#aaa";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,15,35,.55)", zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "min(680px, 95vw)", background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(0,0,0,.28)", border: "1px solid #e6e9ef", overflow: "hidden", animation: "fadeIn .15s ease" }}>
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontSize: 18, color: "#aaa" }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks, owners, tags across all boards…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 16, color: "#323338", background: "transparent" }}
          />
          {query && <button onClick={() => setQuery("")} style={{ border: "none", background: "none", color: "#aaa", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>}
          <kbd style={{ border: "1px solid #dde1ec", borderRadius: 5, padding: "2px 7px", fontSize: 11, color: "#676879", background: "#f7f8fc", fontFamily: "monospace" }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {query.trim() === "" ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🌐</div>
              Type to search across all boards
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: "32px 20px", textAlign: "center", color: "#aaa", fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>😶</div>
              No tasks found for "<strong>{query}</strong>"
            </div>
          ) : (
            <>
              <div style={{ padding: "6px 18px 2px", fontSize: 11, color: "#98a1b3", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {results.length} result{results.length !== 1 ? "s" : ""}
              </div>
              {results.map((r, i) => {
                const overdue = isOverdue(r.item.due) && r.item.status !== "Done";
                const soon = isDueSoon(r.item.due) && r.item.status !== "Done" && !overdue;
                return (
                  <button
                    key={`${r.boardId}-${r.item.id}`}
                    onClick={() => { onNavigate(r.boardId, r.item.id); onClose(); }}
                    onMouseEnter={() => setSelected(i)}
                    style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 18px", border: "none", background: i === selected ? "#f0f4ff" : "#fff", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #f7f8fc", transition: "background .1s" }}
                  >
                    {/* Board color dot */}
                    <div style={{ marginTop: 4, width: 10, height: 10, borderRadius: "50%", background: r.boardColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Task name */}
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#323338", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {highlight(r.item.name, query.trim())}
                      </div>
                      {/* Breadcrumb */}
                      <div style={{ fontSize: 11, color: "#98a1b3", marginTop: 2 }}>
                        <span style={{ color: r.boardColor, fontWeight: 700 }}>{r.boardName}</span>
                        <span style={{ margin: "0 4px" }}>›</span>
                        <span style={{ color: r.groupColor, fontWeight: 600 }}>{r.groupName}</span>
                      </div>
                      {/* Tags */}
                      {r.item.tags?.length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                          {r.item.tags.map((t: string) => <TagPill key={t} label={t} />)}
                        </div>
                      )}
                    </div>
                    {/* Meta: status, priority, due */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ background: statusColor(r.item.status), color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{r.item.status}</span>
                      <span style={{ background: priorityColor(r.item.priority), color: "#fff", borderRadius: 999, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{r.item.priority}</span>
                      {r.item.due && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: overdue ? "#e2445c" : soon ? "#d4900a" : "#aaa" }}>
                          {overdue ? "⚠ " : soon ? "⏰ " : "📅 "}{r.item.due}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div style={{ padding: "8px 18px", background: "#fafbff", borderTop: "1px solid #f0f0f0", display: "flex", gap: 14, fontSize: 11, color: "#aaa" }}>
          {[["↑↓","Navigate"],["↵","Open task"],["Esc","Close"]].map(([k, l]) => (
            <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <kbd style={{ border: "1px solid #dde1ec", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", fontSize: 10, color: "#676879", background: "#fff" }}>{k}</kbd>{l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ boards, activeId, activeView, onSelect, onAdd, onDelete, onChangeView }) {
  const [open, setOpen] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  function confirmAdd() {
    const n = newName.trim(); if (n) onAdd(n);
    setNewName(""); setAdding(false);
  }

  return (
    <div style={{ width: open ? 220 : 44, background: "#1f1f3b", display: "flex", flexDirection: "column", transition: "width .2s", flexShrink: 0, overflow: "hidden", position: "relative" }}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(v => !v); }}
        title={open ? "Hide sidebar" : "Show sidebar"}
        aria-label={open ? "Hide sidebar" : "Show sidebar"}
        style={{ position: "absolute", top: 10, right: 6, minWidth: 28, height: 28, borderRadius: 8, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.85)", cursor: "pointer", fontSize: 12, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, padding: open ? "0 8px" : 0 }}
      >
        {open ? "Hide" : "›"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 10px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: "#e2445c", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>H</div>
        {open && <span style={{ color: "#fff", fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>HOLIFRIDAY</span>}
        <div style={{ marginLeft: "auto", width: 30, height: 1 }} />
      </div>

      {/* Nav */}
      <div style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.06)" }}>
        {[["dashboard","📊","Dashboard"],["boards","📋","Boards"]].map(([v,icon,label]) => (
          <button key={v} onClick={() => onChangeView(v)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: open ? "8px 14px" : "8px 0", justifyContent: open ? "flex-start" : "center", background: activeView === v ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", color: activeView === v ? "#fff" : "rgba(255,255,255,.45)", fontSize: 13, transition: "background .15s" }}
            onMouseEnter={e => { if (activeView !== v) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
            onMouseLeave={e => { if (activeView !== v) e.currentTarget.style.background = "none"; }}
          >
            <span style={{ fontSize: 15 }}>{icon}</span>{open && label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>
        {open && <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.25)", letterSpacing: 1.2, padding: "4px 14px 6px", textTransform: "uppercase" }}>Boards</div>}
        {boards.filter(b => !b.archivedAt).map(b => {
          const active = activeId === b.id && activeView === "boards";
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: open ? 8 : 0 }}>
              <button onClick={() => { onSelect(b.id); onChangeView("boards"); }} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: open ? "9px 6px 9px 14px" : "9px 0", justifyContent: open ? "flex-start" : "center", background: active ? "rgba(255,255,255,.12)" : "none", border: "none", cursor: "pointer", transition: "background .15s", borderRadius: open ? "0 8px 8px 0" : 0 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.06)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "none"; }}
              >
                <div style={{ width: 10, height: 10, borderRadius: 3, background: b.color, flexShrink: 0 }} />
                {open && <span style={{ fontSize: 13, color: active ? "#fff" : "rgba(255,255,255,.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.name}</span>}
              </button>
              {open && boards.length > 1 && (
                <button
                  title={`Delete board: ${b.name}`}
                  aria-label={`Delete board ${b.name}`}
                  onClick={e => { e.preventDefault(); e.stopPropagation(); onDelete?.(b.id); }}
                  style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(255,255,255,.10)", background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.35)", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(226,68,92,.22)"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,.04)"; e.currentTarget.style.color = "rgba(255,255,255,.35)"; }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {open && (adding ? (
          <div style={{ padding: "6px 10px", display: "flex", gap: 6 }}>
            <input ref={inputRef} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") confirmAdd(); if (e.key === "Escape") setAdding(false); }} placeholder="Board name…" style={{ flex: 1, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 4, padding: "5px 8px", color: "#fff", fontSize: 12, outline: "none" }} />
            <button onClick={confirmAdd} style={{ background: "#0073ea", color: "#fff", border: "none", borderRadius: 4, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "none", border: "none", color: "rgba(255,255,255,.3)", cursor: "pointer", fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,.6)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,.3)"}
          ><span style={{ fontSize: 16 }}>+</span> Add Board</button>
        ))}
      </div>

      <div style={{ padding: open ? "10px 14px" : "10px 7px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name="You" size={28} />
          {open && <span style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>HOLIFRIDAY Workspace</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function MergeConflictDialog({ conflict, onUseMine, onUseServer, onUseSmart, onCancel }: { conflict: any; onUseMine: () => void; onUseServer: () => void; onUseSmart: () => void; onCancel: () => void }) {
  if (!conflict) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 12000, background: "rgba(11, 20, 44, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(760px, 96vw)", background: "#fff", borderRadius: 14, border: "1px solid #e6e9ef", boxShadow: "0 16px 50px rgba(0,0,0,.24)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #eceef5", background: "#fff8ec" }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: "#7a5b00" }}>Version Conflict Detected</div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#9a7a00" }}>Someone updated these tasks before your save. Choose how to merge this change.</div>
        </div>

        <div style={{ maxHeight: 360, overflow: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {asArray(conflict.conflicts).map((item: any) => (
            <div key={item.key} style={{ border: "1px solid #e6e9ef", borderRadius: 10, padding: 10, background: "#fafbff" }}>
              <div style={{ fontWeight: 800, color: "#323338", fontSize: 13 }}>{item.itemName}</div>
              <div style={{ marginTop: 4, fontSize: 11, color: "#676879" }}>Local base v{item.baseVersion} vs Server v{item.serverVersion}</div>
              <div style={{ marginTop: 7, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ border: "1px solid #dbe8ff", borderRadius: 8, background: "#eef4ff", padding: "7px 8px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#1f5ecf", textTransform: "uppercase" }}>Mine</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#1a2d59" }}>{item.mine?.status || "-"} • {item.mine?.owner || "No owner"} • due {item.mine?.due || "-"}</div>
                </div>
                <div style={{ border: "1px solid #f6d8df", borderRadius: 8, background: "#fdeef1", padding: "7px 8px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#b12a48", textTransform: "uppercase" }}>Server</div>
                  <div style={{ marginTop: 2, fontSize: 12, color: "#5e2234" }}>{item.server?.status || "-"} • {item.server?.owner || "No owner"} • due {item.server?.due || "-"}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "12px 18px", borderTop: "1px solid #eceef5", background: "#fafbff" }}>
          <button onClick={onCancel} style={{ border: "1px solid #d8dbe4", background: "#fff", color: "#676879", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onUseSmart} style={{ border: "1px solid #dbe8ff", background: "#eef4ff", color: "#1f5ecf", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Smart Merge (field-level)</button>
            <button onClick={onUseServer} style={{ border: "1px solid #e4b5c2", background: "#fff", color: "#b12a48", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Use Server Version</button>
            <button onClick={onUseMine} style={{ border: "none", background: "#0073ea", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Use My Changes</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuestPlanningPreview({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [activePreviewBoardId, setActivePreviewBoardId] = useState(INITIAL_BOARDS[0].id);
  const previewBoard = INITIAL_BOARDS.find(b => b.id === activePreviewBoardId) || INITIAL_BOARDS[0];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f7f8fc" }}>
      <div style={{ padding: "14px 20px", background: "#fff", borderBottom: "1px solid #e6e9ef", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: "#1f1f3b" }}>Planning Preview</div>
        <div style={{ fontSize: 12, color: "#676879" }}>You are in guest mode. Data is read-only preview before login.</div>
        <select
          value={activePreviewBoardId}
          onChange={e => setActivePreviewBoardId(Number(e.target.value))}
          style={{ marginLeft: "auto", border: "1px solid #d8dbe4", borderRadius: 8, padding: "6px 10px", fontSize: 12, background: "#fff", color: "#323338" }}
        >
          {INITIAL_BOARDS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={onBackToLogin} style={{ border: "1px solid #d8dbe4", background: "#fff", color: "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          Back to Login
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <PMPlanningView board={previewBoard} onOpen={() => {}} />
      </div>
    </div>
  );
}

function WorkspaceBadge({ workspaceId }: { workspaceId: string }) {
  if (!workspaceId || workspaceId === DEFAULT_WORKSPACE_ID) return null;
  return <span style={{ background: "#eef4ff", color: "#0073ea", borderRadius: 999, padding: "2px 9px", fontSize: 11, fontWeight: 800 }}>Workspace: {workspaceId}</span>;
}

function AppContent() {
  useEffect(() => { document.title = "HOLIFRIDAY"; }, []);
  const [guestPlanningMode, setGuestPlanningMode] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("view") === "planning";
    } catch {
      return false;
    }
  });

  function setGuestPlanningWithQuery(enabled: boolean) {
    setGuestPlanningMode(enabled);
    try {
      const url = new URL(window.location.href);
      if (enabled) url.searchParams.set("view", "planning");
      else url.searchParams.delete("view");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    } catch {}
  }

  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => {
    // If no firebase auth configured, skip waiting
    if (!firebaseAuth) return true;
    // Set a 5s max wait so auth check never blocks forever
    return false;
  });
  const [workspaceId] = useState(() => getWorkspaceIdFromLocation());
  const [boards, setBoards, boardsReady, boardsFirebaseLoaded, boardsLoadedUid, boardsLoadError] = useSyncedBoards("holifriday_boards", INITIAL_BOARDS, authUser?.uid, workspaceId);
  const [activeId, setActiveId] = useState(INITIAL_BOARDS[0].id);
  const [activeView, setActiveView] = useState("boards"); // boards | dashboard
  const [inviteToken, setInviteToken] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("invite") || "";
    } catch {
      return "";
    }
  });
  const [inviteBanner, setInviteBanner] = useState("");
  const [assignBanner, setAssignBanner] = useState<{ id: number; text: string } | null>(null);
  const assignReadyRef = useRef(false);
  const { cel, celebrate } = useCelebration();
  const [dark, setDark] = useLocalStorage("holifriday_dark", false);
  const [dueBanner, setDueBanner] = useState<string[]>([]);
  const [mergeConflict, setMergeConflict] = useState<any | null>(null);
  const boardsRef = useRef<any[]>(boards);

  const activeBoards = asArray(boards).filter((b: any) => !b.archivedAt);
  const activeBoard = activeBoards.find((b: any) => b.id === activeId) || activeBoards[0] || boards[0];
  const inviteTarget = useMemo(() => resolveInviteTarget(boards, inviteToken), [boards, inviteToken]);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [jumpItemId, setJumpItemId] = useState<any>(null);

  useEffect(() => {
    boardsRef.current = boards;
  }, [boards]);

  // Cmd+K / Ctrl+K opens global search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setGlobalSearchOpen(v => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handleGlobalNavigate(boardId: any, itemId: any) {
    setActiveId(boardId);
    setActiveView("boards");
    setJumpItemId(itemId);
  }

  // Due-date notification: show banner for overdue + due-soon tasks on load
  useEffect(() => {
    if (!boardsFirebaseLoaded || !authUser?.email) return;
    const email = normalizeEmail(authUser.email);
    const allItems = boards.flatMap((b: any) => b.groups.flatMap((g: any) => g.items));
    const mine = allItems.filter((i: any) => normalizeEmail(i.owner) === email && i.status !== "Done");
    const overdue = mine.filter((i: any) => isOverdue(i.due));
    const soon    = mine.filter((i: any) => isDueSoon(i.due) && !isOverdue(i.due));
    const msgs: string[] = [];
    if (overdue.length > 0) msgs.push(`⚠️ ${overdue.length} task${overdue.length > 1 ? "s" : ""} assigned to you ${overdue.length > 1 ? "are" : "is"} overdue!`);
    if (soon.length > 0)    msgs.push(`⏰ ${soon.length} task${soon.length > 1 ? "s" : ""} assigned to you ${soon.length > 1 ? "are" : "is"} due within 2 days.`);
    if (msgs.length > 0) setDueBanner(msgs);
  }, [boardsFirebaseLoaded, boards, authUser?.email]);
  const debugEnabled = !!inviteToken || new URLSearchParams(window.location.search).get("debug") === "1";
  const applyBoardPatch = async (boardId, updater) => {
    const actorName = authUser?.displayName || authUser?.email || "Unknown user";
    const actorEmail = authUser?.email || "";
    const localPrevBoard = asArray(boardsRef.current).find(b => b.id === boardId);
    if (!localPrevBoard) return;

    const localNextRaw = updater(localPrevBoard);
    const localNextBoard = stampBoardTaskMetadata(localPrevBoard, localNextRaw, actorEmail);

    // Optimistic update: reflect the selected status/priority immediately.
    // Server conflict checks continue in background and may open merge dialog if needed.
    setBoards(bs => bs.map(b => (b.id === boardId ? localNextBoard : b)));

    if (!firebaseDb) {
      return;
    }

    try {
      const snap = await get(dbRef(firebaseDb, getBoardsPath(workspaceId)));
      const serverBoards = normalizeBoards(snap.val(), boardsRef.current);
      const serverBoard = asArray(serverBoards).find(b => b.id === boardId);

      if (!serverBoard) {
        return;
      }

      const conflicts = detectBoardVersionConflicts(localPrevBoard, localNextBoard, serverBoard);
      if (conflicts.length > 0) {
        setMergeConflict({
          boardId,
          actorName,
          actorEmail,
          localNextBoard,
          serverBoard,
          conflicts,
        });
        return;
      }
    } catch (err) {
      console.warn("Conflict check failed, keeping optimistic local changes:", err);
    }
  };

  const updateBoard = updated => {
    const current = asArray(boardsRef.current).find(b => b.id === updated.id);
    if (!current) return;
    applyBoardPatch(updated.id, () => updated);
  };

  const patchBoardById = (boardId, updater) => {
    applyBoardPatch(boardId, updater);
  };

  const resolveMergeConflict = (strategy: "mine" | "server" | "smart") => {
    if (!mergeConflict) return;
    const now = new Date().toISOString();
    const conflictMap = new Map(asArray(mergeConflict.conflicts).map(c => [c.key, c]));

    let resolvedBoard = mergeConflict.localNextBoard;
    if (strategy === "server") {
      resolvedBoard = mergeConflict.serverBoard;
    } else if (strategy === "smart") {
      const conflictMap = new Map(asArray(mergeConflict.conflicts).map(c => [c.key, c]));
      resolvedBoard = {
        ...mergeConflict.serverBoard,
        groups: asArray(mergeConflict.serverBoard.groups).map(group => ({
          ...group,
          items: asArray(group.items).map(item => {
            const key = `${group.id}:${item.id}`;
            const conflict = conflictMap.get(key);
            if (!conflict) return item;
            return smartMergeTask(conflict, mergeConflict.actorEmail);
          }),
        })),
      };
    } else {
      const serverMaps = boardItemMaps(mergeConflict.serverBoard);
      resolvedBoard = {
        ...mergeConflict.localNextBoard,
        groups: asArray(mergeConflict.localNextBoard.groups).map(group => ({
          ...group,
          items: asArray(group.items).map(item => {
            const key = `${group.id}:${item.id}`;
            const conflict = conflictMap.get(key);
            if (!conflict) return item;
            const serverItem = serverMaps.byGroupAndItem.get(key) || serverMaps.byItem.get(item.id);
            const serverVersion = Number.isFinite(Number(serverItem?.version)) && Number(serverItem?.version) > 0 ? Number(serverItem.version) : 1;
            return {
              ...item,
              version: serverVersion + 1,
              updatedAt: now,
              updatedBy: normalizeEmail(mergeConflict.actorEmail),
            };
          }),
        })),
      };
    }

    const withLog = withMergeActivityLog(
      resolvedBoard,
      mergeConflict.actorName,
      mergeConflict.actorEmail,
      strategy,
      mergeConflict.conflicts,
    );

    setBoards(bs => bs.map(b => (b.id === mergeConflict.boardId ? withLog : b)));
    setMergeConflict(null);
  };
  const addBoard = name => {
    const color = GROUP_COLORS[boards.length % GROUP_COLORS.length];
    const nb = {
      id: uid(),
      name,
      color,
      groups: [{ id: uid(), name: "General", color, members: [], memberRoles: {}, invites: [], items: [] }],
      activityLogs: [],
    };
    setBoards(bs => [...bs, nb]);
    setActiveId(nb.id);
    setActiveView("boards");
  };

  const deleteBoard = boardId => {
    const target = asArray(boards).find(b => b.id === boardId);
    if (!target) return;

    if (asArray(boards).length <= 1) {
      window.alert("You need at least one board. Create another board before deleting this one.");
      return;
    }

    const taskCount = asArray(target.groups).reduce((sum, g) => sum + asArray(g.items).length, 0);
    const ok = window.confirm(`Delete board "${target.name}"?\n\nThis will permanently remove ${asArray(target.groups).length} group(s) and ${taskCount} task(s) from this shared workspace.\n\nTip: export a backup first if you may need it later.`);
    if (!ok) return;

    const nextBoards = asArray(boards).filter(b => b.id !== boardId);
    setBoards(nextBoards);

    if (activeId === boardId) {
      setActiveId(nextBoards[0]?.id || INITIAL_BOARDS[0].id);
      setActiveView(nextBoards.length > 0 ? "boards" : "dashboard");
    }
  };

  useEffect(() => {
    if (!firebaseAuth) return;
    // Safety timeout: if Firebase auth doesn't respond in 6s, proceed
    const authTimeout = setTimeout(() => setAuthReady(true), 6000);
    const unsub = onAuthStateChanged(firebaseAuth, user => {
      clearTimeout(authTimeout);
      setAuthUser(user);
      setAuthReady(true);
    });
    return () => { clearTimeout(authTimeout); unsub(); };
  }, []);

  async function logout() {
    if (!firebaseAuth) return;
    await signOut(firebaseAuth);
  }


  function handleExportBoards() {
    try {
      const payload = {
        app: "HOLIFRIDAY",
        version: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: authUser?.email || "",
        boards,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `holifriday-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      window.alert("Export failed. Please try again.");
    }
  }

  function handleImportBoards() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const raw = JSON.parse(String(reader.result || "{}"));
          const importedBoards = Array.isArray(raw) ? raw : raw.boards;

          if (!Array.isArray(importedBoards)) {
            window.alert("Invalid HOLIFRIDAY backup file.");
            return;
          }

          const normalized = normalizeBoards(importedBoards, INITIAL_BOARDS);
          if (!normalized.length) {
            window.alert("Backup file has no boards.");
            return;
          }

          const ok = window.confirm(
            `Import ${normalized.length} board(s)? This will replace the current boards for everyone using this shared workspace.`
          );

          if (!ok) return;

          setBoards(normalized);
          setActiveId(normalized[0]?.id || INITIAL_BOARDS[0].id);
          setActiveView("boards");
          window.alert("Import completed.");
        } catch (err) {
          console.error("Import failed:", err);
          window.alert("Import failed. Please check the JSON file.");
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }

  function clearInviteQuery() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    } catch {}
  }

  // Auto-accept invite only after Firebase has loaded data for THIS specific logged-in user.
  // boardsLoadedUid must equal authUser.uid to prevent firing with stale pre-login data.
  useEffect(() => {
    if (!boardsFirebaseLoaded || !authUser || !inviteToken) return;
    if (boardsLoadedUid !== authUser.uid) return;
    doAcceptInvite();
  }, [boardsFirebaseLoaded, authUser?.uid, inviteToken, boardsLoadedUid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!boardsFirebaseLoaded || !authUser?.email) return;
    const email = normalizeEmail(authUser.email);
    const storageKey = `holifriday_seen_assign_${memberRoleKey(email)}`;
    const assigned = boards
      .flatMap(board => board.groups.flatMap(group => group.items.map(item => ({ board, group, item }))))
      .filter(({ item }) => normalizeEmail(item.owner) === email)
      .map(({ board, group, item }) => ({
        key: `${board.id}:${group.id}:${item.id}:${email}`,
        taskName: item.name,
      }));

    const seen = (() => {
      try {
        return new Set<string>(JSON.parse(localStorage.getItem(storageKey) || "[]"));
      } catch {
        return new Set<string>();
      }
    })();

    if (!assignReadyRef.current) {
      try { localStorage.setItem(storageKey, JSON.stringify(assigned.map(a => a.key))); } catch {}
      assignReadyRef.current = true;
      return;
    }

    const fresh = assigned.filter(a => !seen.has(a.key));
    if (fresh.length > 0) {
      setAssignBanner({ id: Date.now(), text: `You were assigned: \"${fresh[0].taskName}\"` });
      try {
        localStorage.setItem(storageKey, JSON.stringify([...seen, ...fresh.map(f => f.key)]));
      } catch {}
    }
  }, [boardsFirebaseLoaded, boards, authUser?.email]);

  function doAcceptInvite() {
    if (!inviteTarget) {
      setInviteBanner("Invite link is invalid or expired.");
      setInviteToken("");
      clearInviteQuery();
      return;
    }

    const acceptedEmail = normalizeEmail(authUser?.email);
    setBoards(prevBoards => prevBoards.map(board => {
      if (board.id !== inviteTarget.boardId) return board;
      return {
        ...board,
        groups: board.groups.map(group => {
          if (group.id !== inviteTarget.groupId) return group;
          return {
            ...group,
            members: uniqueStrings([...(group.members || []), acceptedEmail]),
            memberRoles: {
              ...(group.memberRoles || {}),
              [memberRoleKey(acceptedEmail)]: normalizeRole(inviteTarget.role),
            },
            invites: asArray(group.invites).filter(inv => inv.token !== inviteTarget.token),
          };
        }),
      };
    }));
    setActiveId(inviteTarget.boardId);
    setActiveView("boards");
    setInviteBanner(`Joined "${inviteTarget.groupName}" on "${inviteTarget.boardName}"!`);
    setInviteToken("");
    clearInviteQuery();
  }

  if (!firebaseAuth) {
    if (guestPlanningMode) {
      return <GuestPlanningPreview onBackToLogin={() => setGuestPlanningWithQuery(false)} />;
    }

    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(140deg, #eef3ff 0%, #f8f4ff 42%, #fff4f1 100%)", padding: 16 }}>
        <div style={{ maxWidth: 520, background: "#fff", borderRadius: 16, border: "1px solid #eceef5", boxShadow: "0 10px 30px rgba(0,0,0,.1)", padding: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 22, color: "#1f1f3b" }}>Login is not ready yet</div>
          <div style={{ marginTop: 8, color: "#676879", fontSize: 13, lineHeight: 1.6 }}>
            Please configure Firebase first, especially VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_DATABASE_URL.
          </div>
          <button onClick={() => setGuestPlanningWithQuery(true)} style={{ marginTop: 12, border: "1px solid #dbe8ff", background: "#eef4ff", color: "#1f5ecf", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Open Planning Preview
          </button>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#676879", background: "#f7f8fc" }}>
        Checking authentication...
      </div>
    );
  }

  if (!authUser) {
    if (guestPlanningMode) {
      return <GuestPlanningPreview onBackToLogin={() => setGuestPlanningWithQuery(false)} />;
    }
    return <AuthGate onOpenPlanningPreview={() => setGuestPlanningWithQuery(true)} />;
  }

  if (!boardsFirebaseLoaded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#676879", background: "#f7f8fc", padding: 16 }}>
        <div style={{ width: "100%", maxWidth: 760, background: "#fff", border: "1px solid #eceef5", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,.08)", padding: 20 }}>
          <div style={{ fontWeight: 800, color: "#1f1f3b" }}>Loading boards...</div>
          {debugEnabled && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#fff9e6", border: "1px solid #ffe08a", fontSize: 12, color: "#7a5b00", lineHeight: 1.6 }}>
              <div><strong>Firebase project:</strong> {firebaseDebugInfo.projectId || "(missing)"}</div>
              <div><strong>Database URL:</strong> {firebaseDebugInfo.databaseURL || "(missing)"}</div>
              <div><strong>Auth domain:</strong> {firebaseDebugInfo.authDomain || "(missing)"}</div>
              <div><strong>Has Firebase config:</strong> {String(firebaseDebugInfo.hasFirebaseConfig)}</div>
              <div><strong>auth uid:</strong> {authUser?.uid || "(none)"}</div>
              <div><strong>boardsLoadedUid:</strong> {boardsLoadedUid || "(none)"}</div>
              <div><strong>inviteToken:</strong> {inviteToken || "(none)"}</div>
              <div><strong>inviteTarget:</strong> {inviteTarget ? `${inviteTarget.boardName} / ${inviteTarget.groupName}` : "(not found yet)"}</div>
              <div><strong>load error:</strong> {boardsLoadError || "(none)"}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <DarkCtx.Provider value={{ dark, toggle: () => setDark((v: boolean) => !v) }}>
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Figtree','Roboto',sans-serif", overflow: "hidden", background: dark ? "#0f0f1e" : "#fff", colorScheme: dark ? "dark" : "light" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } @keyframes mailDropIn { from { opacity: 0; transform: translateY(-18px) translateX(24px) scale(.96); } to { opacity: 1; transform: translateY(0) translateX(0) scale(1); } } @keyframes mailPulse { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-2px) scale(1.07); } }`}</style>
      <MergeConflictDialog
        conflict={mergeConflict}
        onUseMine={() => resolveMergeConflict("mine")}
        onUseServer={() => resolveMergeConflict("server")}
        onUseSmart={() => resolveMergeConflict("smart")}
        onCancel={() => setMergeConflict(null)}
      />
      <Confetti show={!!cel} originX={cel?.originX} />
      <Toast show={!!cel} taskName={cel?.taskName} />
      <AssignmentMailNotice notice={assignBanner} onClose={() => setAssignBanner(null)} />
      {globalSearchOpen && <GlobalSearch boards={boards} onNavigate={handleGlobalNavigate} onClose={() => setGlobalSearchOpen(false)} />}
      <Sidebar boards={boards} activeId={activeId} activeView={activeView} onSelect={setActiveId} onAdd={addBoard} onDelete={deleteBoard} onChangeView={setActiveView} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${dark ? "#2a2a4a" : "#eceef5"}`, background: dark ? "#16213e" : "#fafbff" }}>
          <div style={{ fontSize: 12, color: dark ? "#8888aa" : "#676879" }}>Signed in as: <strong style={{ color: dark ? "#e0e0f0" : "#323338" }}>{authUser.displayName || authUser.email}</strong> ({authUser.email})</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setGlobalSearchOpen(true)} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${dark ? "#2a2a4a" : "#e0e3ef"}`, background: dark ? "#1a1a2e" : "#f5f6fb", color: dark ? "#aaa" : "#676879", borderRadius: 8, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              <span>🔍</span><span>Search all boards</span>
              <kbd style={{ border: `1px solid ${dark ? "#3a3a5a" : "#d4d7e3"}`, borderRadius: 4, padding: "1px 5px", fontSize: 10, fontFamily: "monospace", background: dark ? "#0f0f1e" : "#fff", color: dark ? "#ccc" : "#323338" }}>⌘K</kbd>
            </button>
            <button onClick={handleExportBoards} title="Export boards backup" style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: dark ? "#1a1a2e" : "#fff", color: dark ? "#e0e0f0" : "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Export backup</button>
            <button onClick={handleImportBoards} title="Import boards backup" style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: dark ? "#1a1a2e" : "#fff", color: dark ? "#e0e0f0" : "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Import backup</button>
            {/* Dark mode toggle */}
            <button onClick={() => setDark((v: boolean) => !v)} title={dark ? "Switch to Light mode" : "Switch to Dark mode"} style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: dark ? "#1a1a2e" : "#fff", borderRadius: 8, padding: "6px 10px", fontSize: 15, cursor: "pointer", lineHeight: 1 }}>
              {dark ? "☀️" : "🌙"}
            </button>
            <button onClick={logout} style={{ border: `1px solid ${dark ? "#2a2a4a" : "#d8dbe4"}`, background: dark ? "#1a1a2e" : "#fff", color: dark ? "#e0e0f0" : "#323338", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Log out</button>
          </div>
        </div>
        {/* Due date personal banner */}
        {dueBanner.length > 0 && (
          <div style={{ background: dark ? "#2a1a1a" : "#fff8ec", borderBottom: `1px solid ${dark ? "#4a2a2a" : "#ffe08a"}`, padding: "8px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              {dueBanner.map((msg, i) => <div key={i} style={{ fontSize: 12, fontWeight: 700, color: msg.startsWith("⚠") ? "#e2445c" : "#d4900a" }}>{msg}</div>)}
            </div>
            <button onClick={() => { setDueBanner([]); setActiveView("dashboard"); }} style={{ border: "none", background: "#fdab3d", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>View Dashboard</button>
            <button onClick={() => setDueBanner([])} style={{ border: "none", background: "none", color: "#aaa", fontSize: 16, cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        )}
        {debugEnabled && (
          <div style={{ padding: "8px 14px", background: "#fff9e6", borderBottom: "1px solid #ffe08a", fontSize: 12, color: "#7a5b00", lineHeight: 1.6 }}>
            <strong>DEBUG</strong> | project: {firebaseDebugInfo.projectId || "(missing)"} | db: {firebaseDebugInfo.databaseURL || "(missing)"} | uid: {authUser?.uid || "(none)"} | loadedUid: {boardsLoadedUid || "(none)"} | invite: {inviteToken || "(none)"} | target: {inviteTarget ? `${inviteTarget.boardName}/${inviteTarget.groupName}` : "(none)"} | error: {boardsLoadError || "(none)"}
          </div>
        )}
        {inviteBanner && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: /Joined/i.test(inviteBanner) ? "#eafff3" : "#fff4f4", borderBottom: "1px solid #dfe9ff" }}>
            <div style={{ fontSize: 12, color: /Joined/i.test(inviteBanner) ? "#00875a" : "#e2445c", fontWeight: 700 }}>{inviteBanner}</div>
            <button onClick={() => setInviteBanner("")} style={{ border: "none", background: "none", color: "#aaa", fontSize: 14, cursor: "pointer" }}>×</button>
          </div>
        )}
        {inviteToken && !boardsFirebaseLoaded && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "#eef4ff", borderBottom: "1px solid #dfe9ff" }}>
            <div style={{ fontSize: 12, color: "#1f5ecf", fontWeight: 700 }}>⏳ Joining group, please wait...</div>
          </div>
        )}
        {activeView === "dashboard"
          ? <Dashboard boards={boards} onPatchBoard={patchBoardById} onSetBoards={setBoards} />
          : activeBoard && <BoardView board={activeBoard} onUpdate={updateBoard} onPatchBoard={patchBoardById} onCelebrate={celebrate} currentUserName={authUser.displayName || authUser.email} currentUserEmail={authUser.email} jumpItemId={jumpItemId} onJumpHandled={() => setJumpItemId(null)} />
        }
      </div>
    </div>
    </DarkCtx.Provider>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
