import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, PropsWithChildren, useContext, useEffect, useReducer } from "react";

import { CheckIn, Id, JournalEntry, KoinoState, PrayerSession, Reply, SupportIntent } from "@/state/types";

const STORAGE_KEY = "koino-mvp-state-v1";

const initialState: KoinoState = {
  ready: false,
  users: [],
  groups: [],
  memberships: [],
  checkIns: [],
  posts: [],
  prayerSessions: [],
  prayerReactions: [],
  replies: [],
  journalEntries: [],
  supportIntents: [],
};

type Action =
  | { type: "hydrate"; state?: KoinoState }
  | { type: "createSession"; name: string; groupName?: string; inviteCode?: string }
  | { type: "submitCheckIn"; mood: number; readToday: boolean; reflectionText: string; visibility: CheckIn["visibility"] }
  | { type: "createPost"; body: string }
  | { type: "finishPrayer"; targetType: "post" | "check_in"; targetId: Id; status: PrayerSession["status"]; startedAt: string }
  | { type: "createReply"; targetType: "post" | "check_in"; targetId: Id; body: string }
  | { type: "createJournalEntry"; body: string }
  | { type: "updateJournalEntry"; id: Id; body: string }
  | { type: "deleteJournalEntry"; id: Id }
  | { type: "createSupportIntent"; amount: number };

type KoinoContextValue = {
  state: KoinoState;
  dispatch: React.Dispatch<Action>;
};

const KoinoContext = createContext<KoinoContextValue | null>(null);

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function reducer(state: KoinoState, action: Action): KoinoState {
  switch (action.type) {
    case "hydrate":
      return { ...(action.state ?? initialState), ready: true };
    case "createSession": {
      const timestamp = now();
      const user = { id: id("user"), name: action.name.trim(), createdAt: timestamp };
      const existingGroup = action.inviteCode
        ? state.groups.find((group) => group.inviteCode.toUpperCase() === action.inviteCode?.trim().toUpperCase())
        : undefined;
      const group =
        existingGroup ??
        {
          id: id("group"),
          name: action.groupName?.trim() || "KOINO small group",
          inviteCode: action.inviteCode?.trim().toUpperCase() || inviteCode(),
          createdAt: timestamp,
        };

      return {
        ...state,
        currentUserId: user.id,
        currentGroupId: group.id,
        users: [...state.users, user],
        groups: existingGroup ? state.groups : [...state.groups, group],
        memberships: [...state.memberships, { id: id("membership"), userId: user.id, groupId: group.id, createdAt: timestamp }],
      };
    }
    case "submitCheckIn": {
      if (!state.currentUserId || !state.currentGroupId) return state;
      const timestamp = now();
      const checkIn: CheckIn = {
        id: id("checkin"),
        userId: state.currentUserId,
        groupId: state.currentGroupId,
        mood: action.mood,
        readToday: action.readToday,
        reflectionText: action.reflectionText.trim(),
        visibility: action.visibility,
        createdAt: timestamp,
      };
      const privateEntry: JournalEntry | undefined =
        action.visibility === "private"
          ? {
              id: id("journal"),
              userId: state.currentUserId,
              body: action.reflectionText.trim() || "Private check-in",
              source: "private_check_in",
              mood: action.mood,
              createdAt: timestamp,
              updatedAt: timestamp,
            }
          : undefined;

      return {
        ...state,
        checkIns: [checkIn, ...state.checkIns],
        journalEntries: privateEntry ? [privateEntry, ...state.journalEntries] : state.journalEntries,
      };
    }
    case "createPost": {
      if (!state.currentUserId || !state.currentGroupId || !action.body.trim()) return state;
      return {
        ...state,
        posts: [
          { id: id("post"), userId: state.currentUserId, groupId: state.currentGroupId, body: action.body.trim(), createdAt: now() },
          ...state.posts,
        ],
      };
    }
    case "finishPrayer": {
      if (!state.currentUserId) return state;
      const completedAt = now();
      const session: PrayerSession = {
        id: id("prayersession"),
        userId: state.currentUserId,
        targetType: action.targetType,
        targetId: action.targetId,
        startedAt: action.startedAt,
        completedAt,
        status: action.status,
      };
      const alreadyPrayed = state.prayerReactions.some(
        (reaction) =>
          reaction.userId === state.currentUserId &&
          reaction.targetType === action.targetType &&
          reaction.targetId === action.targetId,
      );

      return {
        ...state,
        prayerSessions: [session, ...state.prayerSessions],
        prayerReactions:
          action.status === "completed" && !alreadyPrayed
            ? [
                {
                  id: id("prayer"),
                  userId: state.currentUserId,
                  targetType: action.targetType,
                  targetId: action.targetId,
                  createdAt: completedAt,
                },
                ...state.prayerReactions,
              ]
            : state.prayerReactions,
      };
    }
    case "createReply": {
      if (!state.currentUserId || !action.body.trim()) return state;
      const reply: Reply = {
        id: id("reply"),
        userId: state.currentUserId,
        targetType: action.targetType,
        targetId: action.targetId,
        body: action.body.trim().slice(0, 500),
        createdAt: now(),
      };
      return { ...state, replies: [...state.replies, reply] };
    }
    case "createJournalEntry": {
      if (!state.currentUserId || !action.body.trim()) return state;
      const timestamp = now();
      const entry: JournalEntry = {
        id: id("journal"),
        userId: state.currentUserId,
        body: action.body.trim(),
        source: "manual",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return { ...state, journalEntries: [entry, ...state.journalEntries] };
    }
    case "updateJournalEntry":
      return {
        ...state,
        journalEntries: state.journalEntries.map((entry) =>
          entry.id === action.id ? { ...entry, body: action.body.trim(), updatedAt: now() } : entry,
        ),
      };
    case "deleteJournalEntry":
      return { ...state, journalEntries: state.journalEntries.filter((entry) => entry.id !== action.id) };
    case "createSupportIntent": {
      if (!state.currentUserId) return state;
      const intent: SupportIntent = {
        id: id("support"),
        userId: state.currentUserId,
        amount: action.amount,
        currency: "SEK",
        provider: "external_demo",
        providerReference: `demo_${Date.now()}`,
        status: "confirmed",
        createdAt: now(),
      };
      return { ...state, supportIntents: [intent, ...state.supportIntents] };
    }
    default:
      return state;
  }
}

export function KoinoProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => dispatch({ type: "hydrate", state: value ? JSON.parse(value) : undefined }))
      .catch(() => dispatch({ type: "hydrate" }));
  }, []);

  useEffect(() => {
    if (state.ready) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  return <KoinoContext.Provider value={{ state, dispatch }}>{children}</KoinoContext.Provider>;
}

export function useKoino() {
  const context = useContext(KoinoContext);
  if (!context) {
    throw new Error("useKoino must be used inside KoinoProvider");
  }
  return context;
}
